# 5. Messaging & Async — Kafka, RabbitMQ, Outbox, Saga in Spring Boot

You've already gone deep on Outbox, Saga, and idempotency at the architecture-pattern level. This file is deliberately lighter on theory and focused on **how those patterns actually get wired up in Spring Boot code**, plus what changed in Kafka in 2026.

## 5.1 Kafka 4.0 — ZooKeeper is gone, not deprecated

This is the headline infrastructure change since you last looked at Kafka. <cite index="18-1">Apache Kafka 4.0 ships with ZooKeeper mode fully removed — KRaft, Kafka's own Raft-based metadata consensus, is now the only supported mode</cite>. <cite index="19-1">The metadata quorum now lives inside Kafka itself, run by dedicated controller nodes executing the Raft protocol — for most platform teams this is the biggest operational shift since tiered storage</cite>, because it removes an entire separate distributed system (ZooKeeper) from your infrastructure.

Practical implications if you're standing up new Kafka clusters:
- <cite index="21-1">Broker upgrades to 4.0+ require KRaft mode; clusters still in ZooKeeper mode must migrate to KRaft *before* upgrading — you cannot jump straight from ZooKeeper-3.x to Kafka 4.0</cite>.
- <cite index="22-1">Reported operational gains from teams who've migrated: one fintech team cut cluster setup time by 40%, and Aiven migrated 15,000 servers with zero downtime</cite> — the migration pain is real but time-boxed, the payoff is ongoing.
- <cite index="24-1">Kafka 4.0 also brings general availability of KIP-848, a new consumer group rebalance protocol designed to dramatically improve rebalance performance</cite> — fewer "stop the world" pauses during consumer scaling events.
- <cite index="24-1">KIP-932 (Queues for Kafka, early access) introduces "share groups" — cooperative consumption where multiple consumers in the same group can read from the same partition with per-message acknowledgment</cite>, closer to a traditional queue (RabbitMQ-style) semantics layered onto Kafka's log model. Worth watching if you've ever reached for RabbitMQ specifically because Kafka's per-partition-single-consumer model didn't fit.

## 5.2 Spring Kafka — basic producer/consumer

```java
@Service
public class OrderEventProducer {
    private final KafkaTemplate<String, OrderPlacedEvent> kafkaTemplate;

    public void publish(OrderPlacedEvent event) {
        kafkaTemplate.send("order-events", event.orderId(), event);
    }
}

@Component
public class OrderEventConsumer {
    @KafkaListener(topics = "order-events", groupId = "inventory-service")
    public void onOrderPlaced(OrderPlacedEvent event, Acknowledgment ack) {
        inventoryService.reserveStock(event);
        ack.acknowledge(); // manual ack — only after successful processing
    }
}
```

```yaml
spring:
  kafka:
    consumer:
      properties:
        isolation.level: read_committed   # only see committed transactional messages
      ack-mode: manual                    # pairs with Acknowledgment above
```

## 5.3 Where Outbox actually lives in this stack

The Transactional Outbox Pattern you've already studied solves the dual-write problem: you can't atomically both (a) commit a DB change and (b) publish a Kafka message, because they're two different systems. Here's the concrete Spring Boot shape:

```java
@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxRepository;

    @Transactional
    public void placeOrder(Order order) {
        orderRepository.save(order);                       // (1) business write
        outboxRepository.save(new OutboxEvent(              // (2) SAME transaction, SAME DB
            "OrderPlaced", order.getId(), toJson(order)
        ));
        // Both commit together or neither does — no dual-write problem.
    }
}
```

Then either:
- **Debezium (CDC)** tails the Postgres write-ahead log, sees the new `outbox_events` row, and publishes it to Kafka — no application polling code needed, lowest latency, the approach you already flagged as relevant.
- **A `@Scheduled` poller** queries `outbox_events where published = false` every few seconds and publishes + marks as sent — simpler to reason about, no CDC infrastructure, but adds polling latency and load.

```java
@Scheduled(fixedDelay = 2000)
public void publishPendingEvents() {
    List<OutboxEvent> pending = outboxRepository.findByPublishedFalseOrderByCreatedAt();
    pending.forEach(evt -> {
        kafkaTemplate.send(evt.getTopic(), evt.getPayload());
        evt.markPublished();
    });
    outboxRepository.saveAll(pending);
}
```

## 5.4 Where idempotency actually lives

Since you identified idempotency as your single most critical next topic: the consumer side is where it bites in practice. Kafka (and most brokers) guarantee **at-least-once** delivery by default, meaning your `@KafkaListener` method *will* occasionally receive the same message twice (consumer crash after processing but before committing offset, rebalance timing, etc.). The fix is always the same shape — a dedup/idempotency-key check before the side effect:

```java
@KafkaListener(topics = "order-events")
public void onOrderPlaced(OrderPlacedEvent event) {
    if (processedEventRepository.existsById(event.eventId())) {
        return; // already handled — safe no-op
    }
    inventoryService.reserveStock(event);
    processedEventRepository.save(new ProcessedEvent(event.eventId(), Instant.now()));
}
```

For exactly this reason, Kafka's **transactional producer** (`read_committed` isolation shown above) plus idempotent producer config (`enable.idempotence=true`, on by default since Kafka 3.0) protects the *producer* side from duplicate writes on retry — but consumer-side idempotency like above is still your responsibility, because "exactly-once" only holds within a single Kafka-to-Kafka pipeline, not once you cross into your own database or an external API call.

## 5.5 Saga — orchestration vs choreography, in code terms

**Choreography** (each service reacts to events, no central coordinator):
```java
// Payment service listens for OrderPlaced, and itself emits PaymentCompleted/PaymentFailed
@KafkaListener(topics = "order-events")
public void onOrderPlaced(OrderPlacedEvent event) {
    boolean success = paymentGateway.charge(event.customerId(), event.amount());
    kafkaTemplate.send(success ? "payment-completed" : "payment-failed", event.orderId());
}
```

**Orchestration** (a saga coordinator service explicitly calls each step and handles compensation):
```java
public class OrderSagaOrchestrator {
    public void execute(OrderSagaContext ctx) {
        try {
            paymentService.charge(ctx);
            inventoryService.reserve(ctx);
            shippingService.schedule(ctx);
        } catch (SagaStepException e) {
            compensate(ctx, e.failedStep());
        }
    }
}
```

Choreography scales better with fewer services and less central coupling; orchestration becomes easier to reason about and debug once you have 4+ steps with real compensation logic — the coordinator gives you one place to look instead of tracing events across five services' logs.

## 5.6 RabbitMQ — when it's the better fit over Kafka

Kafka is a distributed commit log optimized for high-throughput, replayable event streams. RabbitMQ is a traditional message broker optimized for flexible routing (topic/fanout/direct exchanges), per-message priority, and complex queueing semantics without needing consumer groups or partitioning to reason about. Choose RabbitMQ when you need request/reply-style messaging, complex routing rules, or a queue depth is small enough that Kafka's operational overhead isn't justified — choose Kafka when you need replay, high throughput, and multiple independent consumer groups reading the same stream.

## 5.7 @Async and @Scheduled — the lightweight, no-broker option

```java
@EnableAsync
@Configuration
public class AsyncConfig {
    @Bean
    Executor taskExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor(); // Java 21+, pairs with file 1
    }
}

@Service
public class NotificationService {
    @Async
    public void sendConfirmationEmail(Order order) { ... } // fire-and-forget, off the request thread
}
```

## Go Deeper
- Kafka Streams / ksqlDB if you need stream processing (windowed aggregations, joins between topics) rather than just pub/sub
- Schema Registry (Avro/Protobuf) for enforcing message contracts across producer/consumer teams — prevents the "someone changed the JSON shape and broke three consumers" incident
- Dead-letter queues and retry topics — what happens after your idempotency check *still* fails N times
- Next file: `06-caching-and-storage.md` — the Outbox table itself is a storage design decision, and this is where that discussion continues
