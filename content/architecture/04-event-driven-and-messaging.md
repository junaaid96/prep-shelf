# 4. Event-Driven Architecture & Messaging

**Current state (Sept 2026):** Kafka 4.x is ZooKeeper-free (KRaft), with tiered storage and queues for Kafka (KIP-932) making it viable for classic queue workloads. RabbitMQ 4.x has quorum queues as the default durable option. Cloud-native choices (SQS/SNS/EventBridge, Pub/Sub, Azure Service Bus) remove most operational burden.

---

## 4.1 Commands, events, and messages

| Kind | Intent | Naming | Consumers |
|---|---|---|---|
| **Command** | "Do this" | Imperative — `BookAppointment` | Exactly one owner |
| **Event** | "This happened" | Past tense — `AppointmentBooked` | Zero to many, unknown to the producer |
| **Query** | "Tell me" | `GetAppointment` | One |

The distinction matters because it determines coupling. A producer emitting `AppointmentBooked` doesn't know or care who listens — billing, notifications, and analytics can each subscribe without the producer changing. A producer sending `SendConfirmationEmail` has hardcoded a consumer and gained nothing.

**Event payload styles:**

- **Notification** — just ids (`{appointmentId, at}`). Small, but every consumer calls back for details (chatty, and couples them to your API).
- **Event-carried state transfer** — the full snapshot. Consumers are autonomous; the payload is bigger and can go stale.
- **Delta** — what changed. Compact but requires consumers to keep state and process in order.

Most teams land on event-carried state transfer with a version field, and keep payloads deliberately small.

> **Asked as:** "Command vs event." · "How much data should an event carry?" · "Why is naming an event in past tense important?"

---

## 4.2 Kafka vs RabbitMQ vs cloud queues

| | **Kafka** | **RabbitMQ** | **SQS/Pub-Sub** |
|---|---|---|---|
| Model | Distributed append-only log | Broker with exchanges + queues | Managed queue |
| Retention | Time/size-based; **messages stay after consumption** | Deleted on ack | Up to 14 days |
| Replay | Yes — reset the offset | No | No (DLQ redrive only) |
| Ordering | Per partition | Per queue | FIFO queues only |
| Throughput | Very high (millions/s) | High (tens of thousands/s) | High, managed |
| Routing | Consumer picks topics/partitions | Rich: direct, topic, fanout, headers | Basic + SNS fanout |
| Per-message TTL, priority | No | Yes | Limited |
| Ops burden | Real (even with KRaft) | Moderate | None |
| Fits | Event streaming, analytics, multiple consumers, replay, audit | Task queues, RPC, complex routing, per-message control | "I don't want to run a broker" |

**The decision rule:** if multiple independent consumers need the same stream, or you need to replay history, use a log (Kafka). If you're distributing work to a pool of workers with retries and routing, use a queue (RabbitMQ/SQS). Many systems use both.

> **Asked as:** "Kafka vs RabbitMQ." · "When would you choose a log over a queue?" · "What does 'replay' buy you?"

---

## 4.3 Kafka essentials

```
Topic: appointments  (6 partitions, replication.factor=3)
  Partition 0: [0][1][2][3]…      ← ordered, immutable, append-only
  Partition 1: [0][1][2]…
  …
Producer picks a partition by key: hash(doctor_id) % 6
Consumer group "billing": each partition assigned to exactly one consumer in the group
```

- **Partitions are the unit of parallelism and ordering.** Max useful consumers in a group = partition count. Ordering is guaranteed only within a partition, so key by the entity whose order matters.
- **Consumer groups**: each group gets every message; within a group, each partition goes to one consumer. Two different groups (billing, analytics) both see everything.
- **Offsets** are the consumer's bookmark. Commit *after* processing for at-least-once; committing before gives at-most-once.
- **Rebalancing** happens when a consumer joins/leaves — with the older eager protocol it stops the whole group; use cooperative sticky assignment.

```java
@KafkaListener(topics = "appointments", groupId = "billing",
               containerFactory = "manualAckFactory")
public void onAppointment(ConsumerRecord<String, AppointmentEvent> rec, Acknowledgment ack) {
    var event = rec.value();
    if (processedEvents.wasProcessed(event.eventId())) {   // idempotency
        ack.acknowledge();
        return;
    }
    try {
        billingService.createInvoice(event);
        processedEvents.record(event.eventId());
        ack.acknowledge();                                  // commit AFTER success
    } catch (TransientException e) {
        // don't ack — the message is redelivered; Spring Kafka retries then routes to DLT
        throw e;
    }
}
```

**Producer config that matters:**

```properties
acks=all                          # leader + all in-sync replicas confirmed
enable.idempotence=true           # no duplicates from producer retries
max.in.flight.requests.per.connection=5   # safe with idempotence on
retries=2147483647
compression.type=zstd
linger.ms=10                      # small batching window — big throughput win
min.insync.replicas=2             # broker-side: with acks=all, tolerate one broker loss
```

**Consumer lag** is *the* metric. Rising lag means consumers can't keep up: add partitions + consumers, make processing faster, or batch. Alert on lag, not on CPU.

**Schema evolution:** use a schema registry (Avro/Protobuf/JSON Schema) with **backward compatibility** — add optional fields, never remove or retype one. Producers and consumers deploy independently, so a breaking schema change is an outage.

> **Asked as:** "How does Kafka guarantee ordering?" · "What is a consumer group?" · "What is consumer lag and how do you fix it?" · "How do you evolve an event schema safely?" · "What does `acks=all` do?"

---

## 4.4 The Outbox pattern (the one everyone should know)

The problem: you must update your database **and** publish an event. Two systems, no distributed transaction. If you write the DB then publish and the publish fails, the world disagrees with your database forever.

```sql
BEGIN;
  INSERT INTO appointments (id, doctor_id, slot, status) VALUES (...);
  INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload, created_at)
  VALUES (gen_random_uuid(), 'Appointment', $1, 'AppointmentBooked', $2::jsonb, now());
COMMIT;                         -- one local, atomic transaction
```

Then a **relay** publishes:

- **Polling publisher** — a job reads unsent outbox rows (`FOR UPDATE SKIP LOCKED`), publishes, marks sent. Simple, a little latency, easy to operate.
- **CDC** (Debezium reading the WAL/binlog) — near-real-time, no polling load, but another system to run.

Consumers must be idempotent (at-least-once). Prune sent rows on a schedule so the table doesn't grow forever.

The mirror image on the receiving side is the **Inbox pattern**: record each processed `event_id` in a uniquely-constrained table inside the same transaction as the business effect, so redelivery is a no-op.

> **Asked as:** "How do you atomically save data and publish an event?" · "What is the outbox pattern?" · "Polling vs CDC for the relay?"

---

## 4.5 Sagas — transactions across services

```
BookAppointment saga
  1. Appointment Service: create appointment (PENDING)
  2. Payment Service:     charge card
  3. Notification:        send confirmation
  4. Appointment Service: mark CONFIRMED

If step 2 fails → compensate step 1: cancel the appointment, release the slot.
```

**Choreography** — each service listens for the previous event and emits the next. No coordinator, minimal coupling; but the flow exists only as an emergent property of the code, which makes it hard to see and hard to debug beyond three steps.

**Orchestration** — a saga coordinator owns the state machine and issues commands. The flow is explicit, visible, and testable; the orchestrator is one more thing to run and can drift into a god service.

```java
// Orchestrated saga, sketched as a state machine
public enum BookingState { STARTED, APPOINTMENT_HELD, PAID, CONFIRMED, COMPENSATING, FAILED }

@Transactional
public void on(PaymentFailed e) {
    var saga = sagas.find(e.sagaId());
    saga.transitionTo(COMPENSATING);
    commands.send(new ReleaseAppointmentSlot(saga.appointmentId(), "payment_failed"));
}
```

Rules: **every step needs a compensating action** (and some can't be compensated — you can't unsend an email, so order the steps so irreversible ones come last). Persist saga state so a crash mid-flow can resume. Set timeouts per step; a saga stuck for hours is a customer complaint.

> **Asked as:** "Explain the saga pattern." · "Choreography vs orchestration." · "What if a compensating action fails?" (retry with backoff, then alert a human — some failures need people)

---

## 4.6 Event sourcing and CQRS

**Event sourcing** stores the *sequence of changes* as the source of truth instead of current state:

```
AppointmentBooked      {id, doctor, slot, fee}
AppointmentRescheduled {id, newSlot}
AppointmentCancelled   {id, reason}
→ current state = fold(events)
```

Wins: complete audit trail (free, and exact), time travel, the ability to build new read models retroactively, and natural fit for event-driven integration.

Costs: **schema evolution of old events is forever**, queries need projections, rebuilding a projection over billions of events takes planning, snapshots are needed for long streams, and GDPR deletion in an immutable log requires crypto-shredding. This is a serious commitment — apply it to the one or two aggregates where the audit trail *is* the business value (money, clinical records, compliance), not to the whole system.

**CQRS** separates the write model from the read model:

```
Commands → Write model (normalised, aggregate, validates) ──► events
                                                              │
Queries  ← Read model (denormalised, per-view, fast) ◄─────────┘  (projection)
```

CQRS does **not** require event sourcing — a read replica, a materialised view, or an Elasticsearch index fed by events is CQRS. Use it when reads and writes have genuinely different shapes or scaling profiles. The cost is eventual consistency between the two: the UI may need to show "processing…" or apply the change optimistically.

> **Asked as:** "What is event sourcing and when would you use it?" · "Does CQRS require event sourcing?" · "How do you handle GDPR deletion in an event store?" · "How do you rebuild a read model?"

---

## 4.7 Operating an event-driven system

**Dead-letter queues:** after N failed attempts, park the message with its error and stack trace. Monitor DLQ depth, and build a redrive path — a DLQ with no tooling is a data-loss queue.

**Poison messages:** one unparseable message must not block a partition forever. Catch deserialisation errors, route to the DLT, advance the offset.

**Backpressure:** bounded queues, consumer autoscaling on lag, and shedding low-priority work. An unbounded queue converts a throughput problem into an out-of-memory problem.

**Testing:**
- Unit: the handler, given an event.
- Contract: schema compatibility checks in CI (the registry can gate this).
- Integration: **Testcontainers** with a real Kafka/RabbitMQ — embedded brokers lie.
- End-to-end: publish an event, assert the downstream effect, with a timeout.

**Monitoring checklist:** consumer lag per group, DLQ depth, processing time p99, error rate by event type, and end-to-end latency from produce to effect.

> **Asked as:** "What do you do with a message that always fails?" · "How do you test event-driven code?" · "What do you monitor in Kafka?"

---

## 4.8 Rapid-fire answers

| Question | Answer |
|---|---|
| Pub/sub vs point-to-point | Many consumers each get a copy vs one consumer takes each message |
| Fanout | One event → many subscribers (SNS→SQS, Kafka consumer groups, RabbitMQ fanout exchange) |
| Topic vs queue | Broadcast to subscribers vs work distribution among competing consumers |
| Message ordering | Only within a partition/queue — key by entity id when order matters |
| Retry storm | Synchronised retries after an outage; fix with jitter and circuit breakers |
| Kafka partition count | Hard to reduce later; over-partitioning costs metadata and rebalance time. Start with 2–3× expected consumers |
| Compacted topic | Retains the latest value per key — good for state snapshots and change logs |
| Tiered storage | Old segments on object storage — cheap, long retention without huge brokers |
| Exactly-once in Kafka | Transactional producer + `read_committed` consumer — only within Kafka |
| When NOT to use events | Simple request/response with immediate consistency needs — a REST call is clearer and cheaper |
