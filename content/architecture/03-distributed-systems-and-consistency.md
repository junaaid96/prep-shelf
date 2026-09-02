# 3. Distributed Systems & Consistency

---

## 3.1 The eight fallacies of distributed computing

Every distributed bug you will ever debug is one of these assumptions being wrong:

1. The network is reliable
2. Latency is zero
3. Bandwidth is infinite
4. The network is secure
5. Topology doesn't change
6. There is one administrator
7. Transport cost is zero
8. The network is homogeneous

The practical consequence: **every remote call can fail, be slow, or succeed while you believe it failed.** That third case — the ambiguous failure — is why idempotency is not optional.

> **Asked as:** "What makes distributed systems hard?" · "Your service times out calling payments. Did the charge happen?"

---

## 3.2 Time, ordering, and clocks

Wall clocks on different machines disagree (NTP drift, leap seconds, VM pauses). **Never order distributed events by `System.currentTimeMillis()`.**

- **Lamport timestamps** — a logical counter giving a partial order ("a happened before b").
- **Vector clocks** — detect concurrent (conflicting) updates; used by Dynamo-style stores.
- **Hybrid Logical Clocks (HLC)** — physical time bounded by logical causality; what CockroachDB and friends use.
- **TrueTime** (Spanner) — GPS/atomic clocks with a bounded uncertainty interval, so the system can *wait out* the uncertainty and give external consistency.

Practical rule: use monotonic clocks for measuring durations, UTC wall clock for display, and logical ordering (sequence numbers, log offsets, HLC) for causality.

> **Asked as:** "Why can't you use timestamps to order events across servers?" · "What is a vector clock?"

---

## 3.3 Consensus and leader election

**Consensus** = getting N nodes to agree on a value despite failures. **Raft** is the one to be able to explain:

1. Nodes are Follower, Candidate, or Leader.
2. A follower that hears nothing for a randomised election timeout becomes a candidate and requests votes.
3. A candidate with a **majority** becomes leader for that term.
4. All writes go to the leader, which appends to its log and replicates; an entry is **committed** once a majority has it.
5. A partitioned old leader can't get a majority, so it can't commit — no split brain.

**Quorum = majority = ⌊N/2⌋ + 1.** With 3 nodes you tolerate 1 failure; with 5, you tolerate 2. Even numbers buy you nothing, which is why clusters are 3 or 5.

Used by: etcd, Consul, CockroachDB, TiDB, Kafka's KRaft controller (Kafka 4.0 removed ZooKeeper entirely).

**Split brain** — two nodes both believing they're primary — is what quorum and fencing tokens prevent. If you build leader election yourself with a Redis lock, you need a monotonically increasing fencing token that the resource checks, or a paused-then-resumed leader will corrupt state.

> **Asked as:** "Explain Raft." · "Why 3 or 5 nodes, not 4?" · "What is split brain and how do you prevent it?"

---

## 3.4 Delivery semantics

| Semantic | Reality | How |
|---|---|---|
| At-most-once | May lose messages | Fire and forget |
| **At-least-once** | May duplicate | Ack after processing + retries — **the default you should design for** |
| Exactly-once | Not achievable end-to-end across systems | At-least-once delivery + idempotent processing, or transactional processing within one system (Kafka transactions) |

"Exactly-once" in Kafka means exactly-once *within* Kafka (read → process → write, transactionally). The moment you call an external API or write to a different database, you're back to at-least-once + idempotency.

```python
# The idempotent consumer: an inbox table with a unique constraint
def handle(event):
    try:
        with transaction.atomic():
            ProcessedEvent.objects.create(event_id=event.id)   # UNIQUE — raises on a duplicate
            apply_business_effect(event)
    except IntegrityError:
        logger.info("duplicate event %s ignored", event.id)
```

**Ordering** is only guaranteed within a partition/queue. If order matters, key by the entity id so all events for one entity land in the same partition — and accept that this limits parallelism for hot keys.

> **Asked as:** "Is exactly-once delivery possible?" · "How do you make a consumer idempotent?" · "How do you guarantee ordering in Kafka?"

---

## 3.5 Replication, consistency, and conflict resolution

**Single-leader** (PostgreSQL, MySQL, MongoDB): all writes to one node. Simple, no write conflicts, limited write throughput, failover downtime.

**Multi-leader** (multi-region active-active): low write latency everywhere, but **write conflicts are inevitable**. Resolution strategies:
- **Last-write-wins** (by timestamp) — simple, silently loses data.
- **Application-defined merge** — you decide (e.g. union of shopping carts).
- **CRDTs** — data types mathematically guaranteed to converge (counters, sets, sequences). Used by collaborative editors (Yjs, Automerge) and Redis Enterprise CRDBs.

**Leaderless** (Cassandra, Dynamo): write to W nodes, read from R; `R + W > N` gives you read-your-writes. Repair happens via read repair and anti-entropy (Merkle trees).

**Read-after-write consistency** is the one users actually notice ("I saved it and it's gone"). Fixes: route the user's reads to the primary for a few seconds, pin the session, or wait for the replica to catch up to the write's log position.

> **Asked as:** "Single-leader vs multi-leader vs leaderless." · "How do you resolve write conflicts?" · "What's a CRDT?" · "A user updates their profile and sees the old value — why, and how do you fix it?"

---

## 3.6 Failure handling patterns

```java
// Resilience4j: the standard combination, ordered correctly
@CircuitBreaker(name = "payments", fallbackMethod = "queueForLater")
@Retry(name = "payments")
@Bulkhead(name = "payments", type = Bulkhead.Type.THREADPOOL)
@TimeLimiter(name = "payments")
public CompletableFuture<Receipt> charge(ChargeRequest req) {
    return CompletableFuture.supplyAsync(() -> paymentClient.charge(req));
}

private CompletableFuture<Receipt> queueForLater(ChargeRequest req, Throwable t) {
    outbox.enqueue(req);                       // degrade, don't fail the whole checkout
    return CompletableFuture.completedFuture(Receipt.pending(req.id()));
}
```

Order matters: **retry inside the circuit breaker** (so repeated retries trip it), timeout inside retry (each attempt bounded), bulkhead outermost (cap total concurrency to that dependency).

**Retry only idempotent operations.** Retrying a non-idempotent POST is how customers get charged twice — send an idempotency key with it.

**Dead-letter queues** for messages that keep failing: after N attempts, park it with the error and alert. A DLQ nobody looks at is just a slower way to lose data — put its depth on a dashboard.

**Health checks:** liveness (am I alive? restart me if not — must not depend on the database, or a DB blip restarts your whole fleet) vs readiness (can I serve traffic? take me out of the load balancer if not).

**Graceful degradation** beats total failure: recommendations off, cached prices, read-only mode. Decide these in advance, per feature.

> **Asked as:** "Where do you put the circuit breaker relative to retries?" · "What goes in a liveness vs readiness probe?" · "What do you do with poison messages?"

---

## 3.7 Observability

Three pillars, plus the thing that ties them together:

- **Metrics** (Prometheus) — cheap, aggregate, alertable. RED for services (Rate, Errors, Duration), USE for resources (Utilisation, Saturation, Errors).
- **Logs** — structured JSON, one event per line, with `trace_id`, `user_id`, `tenant_id`. Never log secrets or PII.
- **Traces** (OpenTelemetry) — the full path of one request across services; the only way to answer "where did the 800 ms go?"
- **Correlation**: one `trace_id` propagated via W3C `traceparent` and stamped on every log line and metric exemplar.

```python
from opentelemetry import trace
tracer = trace.get_tracer(__name__)

with tracer.start_as_current_span("book_appointment") as span:
    span.set_attribute("clinic.id", clinic_id)
    span.set_attribute("doctor.id", doctor_id)
    ...
```

**Alert on symptoms, not causes.** "p99 latency > 1 s for 5 minutes" and "error rate > 1%" wake you for real user pain; "CPU > 80%" wakes you for nothing. Every alert should be actionable and link to a runbook.

**SLO thinking:** define an SLI (proportion of requests served in <300 ms), set an SLO (99.9%), and derive the **error budget** (0.1%). Burn the budget slowly and you can keep shipping; burn it fast and you freeze features and fix reliability. It turns "how much reliability?" into a number both engineering and product can agree on.

> **Asked as:** "Metrics vs logs vs traces." · "What would you alert on?" · "What is an error budget?" · "How do you debug a latency spike across services?"

---

## 3.8 Rapid-fire answers

| Question | Answer |
|---|---|
| Idempotency key | Client-generated unique id; the server stores the first result and replays it for duplicates |
| Fencing token | Monotonic number issued with a lock; the resource rejects lower tokens — prevents zombie-leader writes |
| Thundering herd | Everyone retries at once; fix with jittered backoff and single-flight |
| Backpressure | Bounded queues + rejecting or slowing producers instead of buffering to death |
| Chaos engineering | Deliberately inject failure (kill pods, add latency) to verify resilience assumptions |
| Blast radius | How much breaks when one thing fails — cells/shards/bulkheads shrink it |
| Graceful shutdown | Stop accepting, drain in-flight, close connections, exit within the grace period |
| Cell-based architecture | Partition users into isolated cells so an outage hits 1/N of them |
| Two Generals / FLP | You can't get certainty over an unreliable network; consensus needs failure detectors and timeouts |
| Debugging distributed bugs | Trace id → span timeline → the slow/failing hop → that service's logs and metrics for the same trace |
