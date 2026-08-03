# 8. Monitoring & Testing — Actuator, Prometheus, Grafana, Resilience4j, Observability

## 8.1 Spring Boot Actuator — the foundation everything else builds on

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, metrics, prometheus, info
  endpoint:
    health:
      probes:
        enabled: true          # exposes /actuator/health/liveness and /readiness — see file 7
      show-details: when-authorized
```

`/actuator/health`, `/actuator/metrics`, `/actuator/prometheus` — Actuator exposes operational data about your running app without you writing any of this yourself. Never expose the full Actuator surface publicly without securing it (`/actuator/env` can leak secrets) — restrict it to an internal network path or lock it behind the security config from file 4.

## 8.2 Micrometer + OpenTelemetry — the new default combo

Micrometer is the metrics *facade* (vendor-neutral API — you code against Micrometer, it ships to Prometheus/Datadog/whatever backend you choose). **What's new in Spring Boot 4:** <cite index="7-1">Spring Boot 4 upgrades to Micrometer 2 and integrates an OpenTelemetry starter, making traces, logs, and metrics work together seamlessly</cite> out of the box — previously this required manually wiring Micrometer Tracing + an OTel exporter yourself.

```java
@Service
public class OrderService {
    private final MeterRegistry meterRegistry;

    public void placeOrder(Order order) {
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            // ... business logic ...
            meterRegistry.counter("orders.placed", "status", "success").increment();
        } finally {
            sample.stop(meterRegistry.timer("orders.placement.duration"));
        }
    }
}
```

**What's new for distributed tracing specifically:** <cite index="6-1">Spring 6 introduced Micrometer tracing, but wiring trace context propagation across service-to-service HTTP calls still required explicit configuration. Spring 7's native OpenTelemetry support means declarative HTTP Interface clients automatically propagate trace IDs to OTel collectors without manual setup</cite> — a trace started in your API gateway now flows through to the order service, payment service, and inventory service calls automatically, letting you see one end-to-end waterfall in Grafana/Jaeger instead of stitching logs together by hand.

## 8.3 Prometheus + Grafana — the metrics pipeline

```
Your app exposes /actuator/prometheus
        ↓ (Prometheus scrapes on an interval)
Prometheus (time-series DB, stores metrics + runs alerting rules)
        ↓
Grafana (dashboards — queries Prometheus via PromQL)
```

```promql
# Example PromQL: 95th percentile order placement latency over 5 minutes
histogram_quantile(0.95, rate(orders_placement_duration_seconds_bucket[5m]))
```

A minimal, high-value dashboard for any of your microservices: request rate, error rate, p95/p99 latency (the "RED" method — Rate, Errors, Duration), plus JVM heap usage and GC pause time (directly relevant given the virtual threads discussion in file 1 — watch for carrier-thread pinning via JFR events, not just heap graphs).

## 8.4 Distributed tracing — Zipkin vs Jaeger vs OTel Collector

All three do the same fundamental job (collect and visualize distributed traces); the current default architecture in 2026 is to export via the **OpenTelemetry Protocol (OTLP)** to an **OTel Collector**, which then fans out to whichever backend you want (Jaeger, Zipkin, Grafana Tempo, a commercial APM) — this decouples your application code from any specific tracing backend, so switching backends later doesn't require touching instrumentation code.

```yaml
management:
  tracing:
    sampling:
      probability: 0.1   # sample 10% of requests — 100% is rarely worth the storage/perf cost in production
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
```

## 8.5 Resilience4j — and how much of it Spring Boot 4 now absorbs

Resilience4j gives you circuit breakers, retries, rate limiters, and bulkheads as composable decorators — you already preferred it over the now-archived Netflix Hystrix, which remains the right call.

```java
@Service
public class InventoryClient {
    @CircuitBreaker(name = "inventoryService", fallbackMethod = "fallbackStock")
    @Retry(name = "inventoryService")
    @RateLimiter(name = "inventoryService")
    public StockLevel checkStock(String sku) {
        return restClient.get().uri("/stock/{sku}", sku).retrieve().body(StockLevel.class);
    }

    private StockLevel fallbackStock(String sku, Exception ex) {
        return StockLevel.unknown(sku); // degrade gracefully instead of failing the whole request
    }
}
```

```yaml
resilience4j:
  circuitbreaker:
    instances:
      inventoryService:
        sliding-window-size: 20
        failure-rate-threshold: 50
        wait-duration-in-open-state: 10s
  retry:
    instances:
      inventoryService:
        max-attempts: 3
        wait-duration: 500ms
```

**What's new and directly relevant here:** <cite index="2-1">Spring Boot 4 introduces built-in resilience features — retry and concurrency throttling directly in the framework</cite> itself, described by the Spring team as <cite index="6-1">a strategic shift toward core resilience</cite>. For simple, single-call retry/throttling needs, you may no longer need the Resilience4j dependency at all going forward. For the full pattern set you actually use — circuit breakers with fallback methods, bulkheads, composed multi-decorator policies — Resilience4j remains the more complete toolkit; treat the new framework-native features as covering the simple 80% case, not a full replacement.

## 8.6 Testcontainers — the modern default for integration tests

Instead of testing against H2 (whose SQL dialect diverges from Postgres in subtle ways) or a shared "test database" that different test runs can corrupt for each other, Testcontainers spins up real Docker containers (real Postgres, real Kafka, real Redis) scoped to your test run.

```java
@SpringBootTest
@Testcontainers
class OrderServiceIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container
    static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("apache/kafka:4.0.0"));

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Test
    void placingOrderPublishesOutboxEvent() {
        // real Postgres, real Kafka, real behavior — including real constraint violations,
        // real transaction semantics, real serialization — none of which H2 reliably reproduces
    }
}
```

This is the single highest-value testing change to adopt if you're not already using it: it catches an entire category of "worked in tests, broke in production because H2 doesn't enforce the same constraint/behaves differently" bugs, and it directly exercises the Outbox/Kafka flow from file 5 end-to-end instead of mocking it away.

## 8.7 Putting it together — the observability story for one request

1. Request hits the Gateway (file 7) → trace ID generated, propagated via OTel.
2. Passes through Spring Security filter chain (file 4) → auth failures show up as a metric + a span event, not just a log line.
3. Hits `OrderController` → Micrometer records request duration; RED-method Grafana dashboard updates.
4. Calls `InventoryClient` wrapped in Resilience4j → circuit breaker state itself is exported as a metric (`resilience4j_circuitbreaker_state`), so you can alert *before* it fully opens, not just after.
4. Publishes to Kafka via Outbox (file 5) → trace context propagates into the Kafka message headers, so the trace continues into the downstream consumer's processing span.
5. Testcontainers-based integration test in CI (file 7's pipeline) already exercised this exact path with real infrastructure before it ever reached production.

## Go Deeper
- SLOs/error budgets (Google SRE model) built on top of the RED metrics above — turns "the dashboard looks bad" into "we've burned 40% of this month's error budget"
- Structured logging (JSON logs with trace ID correlation) so logs, metrics, and traces all pivot on the same identifier in Grafana
- Chaos engineering (deliberately killing a pod, injecting latency) to verify the circuit breakers and readiness probes from files 7–8 actually behave as designed under failure, not just in the happy path
