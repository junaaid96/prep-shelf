# 7 Backend Architecture Patterns — Deep Dive Guide

Every real production system (Amazon, Uber, your eG-Health microservices stack) is a *combination* of these patterns — never just one. This guide explains each in depth: how it works, when to use it, trade-offs, and how to actually implement it in Java/Spring Boot.

---

## 1. Request/Response (Synchronous API Calls)

**Definition:** Client sends a request → server processes → response returned immediately. Tightly coupled, blocking.

**Flow:**
```
Client → HTTP Request → API Server → Query → Database
Client ← HTTP Response ← API Server ← Data ← Database
```

**How it works:** The client blocks and waits until the server finishes processing and returns a result. Simple, direct, easy to reason about.

**Use cases:** Login, fetch profile, place an order — anything where the caller genuinely needs the answer *right now* before it can proceed.

**Pros**
- Simple mental model, easy to debug
- Strong consistency — you know the result before moving on
- Easy to test (no async complexity)

**Cons**
- Client waits (latency compounds if server calls other services synchronously)
- Tight coupling — if the server is down, the client fails immediately
- Doesn't scale well under high load without extra work (thread pools get exhausted)

**Spring Boot notes**
- This is your default `@RestController` + `@GetMapping/@PostMapping` setup.
- Under heavy load, traditional servlet threads block on I/O. This is exactly why **Java 21 Virtual Threads (Project Loom)** matter — they let you keep the simple synchronous programming model while the JVM handles thousands of concurrent blocked requests cheaply. Since you're already studying Virtual Threads, know that they solve the *scaling* weakness of this pattern without forcing you into reactive/WebFlux code.
- For resilience, wrap outbound synchronous calls with **Resilience4j** (circuit breaker, retry, timeout) so one slow downstream service doesn't cascade-fail your whole system.

**Related topics to study:** timeouts, connection pooling, circuit breaker pattern, thread-per-request vs virtual threads, idempotency keys for retries.

---

## 2. Event-Driven (Asynchronous Decoupling)

**Definition:** A service publishes an event; multiple consumers react independently. Zero coupling between producer and consumers.

**Flow:**
```
Order Service --publish--> Event Broker (Kafka/RabbitMQ)
                                 |--> Inventory Service
                                 |--> Email Service
                                 |--> Analytics Service
                                 |--> Notification Service
```

**How it works:** The producer doesn't know or care who's listening. Each consumer subscribes to events relevant to it and processes them on its own time.

**Why it matters:** Decoupled services, highly scalable, resilient/fault-tolerant, and better for real-time workflows (e.g., `Order Created → Inventory Updated → Email Sent → Analytics Tracked`, all happening independently and in parallel).

**Pros**
- Producer and consumers scale independently
- Adding a new consumer doesn't touch existing code
- Naturally resilient — a slow/broken consumer doesn't block the producer

**Cons**
- Eventual consistency, not immediate — harder to reason about "what's the current state right now"
- Debugging a flow across many consumers is harder (need distributed tracing)
- Message ordering and duplicate delivery need careful handling

**Spring Boot notes**
- Use **Spring Kafka** (`spring-kafka`) or **Spring AMQP** (RabbitMQ) as your broker client.
- Producer: `KafkaTemplate.send(topic, event)`. Consumer: `@KafkaListener(topics = "order-events")`.
- Critical production concern: **the dual-write problem** — if you write to your DB and then publish an event in two separate steps, a crash between them causes data loss or inconsistency. Fix this with the **Transactional Outbox Pattern**: write the event to an "outbox" table in the *same DB transaction* as your business data, then have a separate process (or **Debezium** via Change Data Capture) publish it to Kafka reliably.

**Related topics to study:** Kafka vs RabbitMQ (you've already studied this), transactional outbox pattern, Debezium/CDC, at-least-once vs exactly-once delivery, consumer idempotency.

---

## 3. Cache-Aside (Speed & Load Reduction)

**Definition:** Check cache first. On a cache miss, read from DB then store the result in cache. Reduces database load dramatically (often 100x).

**Flow (7 steps):**
```
1. Client → Application: Read Request
2. Application checks Cache (Redis)
3. Hit  → Return data directly (fast, ~10ms)
   Miss → Read from Database (~100ms)
4. Read from Database
5. Store result in Cache
6. Return data to Application
7. Return data to Client
```

**Real world:** Product detail pages, trending posts, user profiles — anything read far more often than it's written.

**Pros**
- Massive read latency improvement (10ms cache vs 100ms DB)
- Database only handles cache misses, not every read
- Simple to add on top of an existing system without restructuring it

**Cons**
- **Cache invalidation is the hard part** — stale data if you forget to update/evict the cache on writes
- Cold-start problem: first requests after a cache clear are slow ("thundering herd")
- Adds an extra moving part (Redis) to operate and monitor

**Spring Boot notes**
- Since this ties directly into your current caching study: Spring's `@Cacheable`, `@CachePut`, `@CacheEvict` annotations (via `spring-boot-starter-cache` + a Redis backend like `spring-boot-starter-data-redis`) implement Cache-Aside almost automatically.
- `@Cacheable("products")` on a `getProduct(id)` method = steps 2–6 handled for you.
- Always set a **TTL (time-to-live)** on cache entries so stale data self-heals even if you miss an explicit eviction.
- For the "thundering herd" problem, consider request coalescing or a short jittered TTL so not everything expires at once.

**Related topics to study:** cache invalidation strategies, write-through vs write-behind vs cache-aside, TTL & eviction policies (LRU/LFU), Redis data structures, cache stampede/thundering herd protection.

---

## 4. CQRS Pattern (Command Query Responsibility Segregation)

**Definition:** Separate the write path (Commands) from the read path (Queries). Commands write to one model/DB; Queries read from a separately optimized model. Independent scaling.

**Flow:**
```
Client --Write(Command)--> Command Service --Execute--> Write Database
                                                  |--persist changes (async)--> Event/Message Broker
Client --Read(Query)-----> Query Service   --Read----> Read Database <--update read model-- Broker
```

- **Commands:** Create Order, Update Order (change state)
- **Queries:** Get Order Details, List Orders (read state)

**How it works:** Write path is synchronous (user request). The write DB then publishes changes as events (asynchronously) so the read model can be updated separately — often denormalized and heavily indexed for fast queries.

**Benefit:** Faster reads, independent scaling of read vs write sides, queries can use a completely different (even different-technology) database optimized for that access pattern. Common in banking and analytics systems where read volume vastly exceeds write volume.

**Pros**
- Read and write sides scale independently (e.g., 10 read replicas, 1 write master)
- Read model can be shaped exactly for the UI/query needs — no complex joins at query time
- Enables plugging in a search engine (Elasticsearch) or analytics store for reads while keeping a normalized transactional store for writes

**Cons**
- Real complexity increase — you're maintaining two models and keeping them in sync
- Eventual consistency between write and read side (a write might not be immediately visible on read)
- Overkill for simple CRUD apps — don't reach for this unless read/write patterns genuinely diverge

**Spring Boot notes**
- The **Axon Framework** (`axon-spring-boot-starter`) is the most mature Java option — it gives you `CommandGateway`/`QueryGateway`, command handlers, event handlers, and (optionally) full Event Sourcing out of the box.
- A lighter-weight approach without Axon: separate `@Service` classes — a `ProductCommandService` (writes via JPA to your primary DB) and a `ProductQueryService` (reads from a denormalized read table or view, updated by a `@KafkaListener` reacting to write-side events).
- Pair this with Pattern #2 (Event-Driven) — the write side typically publishes domain events that the read side consumes to update its projection.

**Related topics to study:** Event Sourcing (storing state as a sequence of events rather than current snapshot), Domain-Driven Design (DDD), eventual consistency, read model projections, Axon Framework.

---

## 5. Strangler Fig (Modernizing Legacy Systems)

**Definition:** Replace a monolith one module at a time, routing traffic through a gateway, until the legacy system is fully replaced — no risky "big bang" rewrite.

**Flow (3 stages):**
```
Stage 1 (Initial):   Client → Monolith (entire system) → Monolith DB

Stage 2 (Gradual):   Client → API Gateway/Routing Layer
                                 ├→ Monolith (partial system) → Monolith DB
                                 ├→ Microservice A (new) → Service A DB
                                 └→ Microservice B (new) → Service B DB

Stage 3 (Final):     Client → API Gateway/Routing Layer
                                 ├→ Microservice A → Service A DB
                                 ├→ Microservice B → Service B DB
                                 └→ Microservice N → Service N DB
```

**How it works:** Named after strangler fig vines that grow around a host tree and eventually replace it. You extract one feature/module at a time into a new microservice, route that feature's traffic to the new service via a gateway, and leave everything else on the monolith. Repeat until the monolith is empty and can be decommissioned.

**Benefit:** Lower risk, continuous deployment, zero downtime during migration. You can stop and reassess at any stage — unlike a rewrite, you're never in a broken half-finished state.

**Pros**
- Business keeps shipping features during the migration (not frozen for a rewrite)
- Each extracted service can be independently tested and rolled back
- Reduces the "big bang rewrite fails catastrophically" risk that kills most legacy modernization projects

**Cons**
- Takes longer overall than a rewrite would (if the rewrite succeeded)
- Running the gateway + partial monolith + partial microservices simultaneously adds operational complexity mid-migration
- Requires careful data synchronization if the monolith and new service both need the same data during transition

**Spring Boot notes**
- **Spring Cloud Gateway** is the natural fit for the routing layer — route by path (`/api/orders/**` → new Order microservice, everything else → monolith).
- This is exactly the kind of work your eG-Health microservices product likely involves — extracting a bounded module (e.g., a specific clinical workflow) out of a larger platform.
- Watch for **shared database coupling**: if the monolith and the new microservice both hit the same tables during transition, you haven't really decoupled yet. Plan the data split (see Pattern #7) as part of each extraction.

**Related topics to study:** API Gateway pattern, bounded contexts (DDD), anti-corruption layer, database decomposition strategies, feature flags for gradual rollout.

---

## 6. Saga Pattern (Distributed Transactions)

**Definition:** Each service owns its own local transaction. If a step fails, compensating actions undo the previous steps. Self-healing consistency without distributed locks.

**Flow (e-commerce example):**
```
Client → Order Service (Create Order) → Inventory Service (Reserve Stock)
       → Payment Service (Process Payment) → Shipping Service (Create Shipment)
       → Notification Service (Send Confirmation)

If something fails:
Cancel Notification ← Cancel Shipment ← Refund Payment ← Release Stock ← Cancel Order
(compensating actions run in reverse order)
```

**Why it exists:** When you split a monolith into microservices, each with its own database, you lose the ACID guarantee of a single transaction spanning everything. The old solution — **Two-Phase Commit (2PC)** — creates tight coupling and poor availability. Saga solves this by breaking one big transaction into a chain of local transactions, each independently committed, with a defined "undo" for every step.

**Two implementation styles:**

| | Choreography | Orchestration |
|---|---|---|
| Coordination | No central controller — services react to each other's events | A central orchestrator tells each service what to do |
| Best for | Simple flows, few participants (2–3 services) | Complex flows with many steps or conditional logic |
| Coupling | Looser | Central point of control (also single point of complexity) |
| Debugging | Harder — logic scattered across services | Easier — one place to see/track the whole flow |
| Common tools | Kafka events | Camunda, Axon Saga, or custom orchestrator service |

**Use cases:** E-commerce checkout, travel booking, food delivery — any complex multi-step flow spanning multiple services where "all or nothing" is a hard requirement but a single DB transaction is impossible.

**Pros**
- No distributed locks — each service stays autonomous and available
- Scales far better than 2PC
- Failure handling is explicit and designed-for, not an afterthought

**Cons**
- You must design a compensating action for *every* step — this is real engineering effort
- Only eventual consistency, not immediate — there's a window where the system is "in progress"
- Debugging a failed saga across services requires strong observability (correlation IDs, tracing)

**Spring Boot notes**
- **Choreography:** each service publishes/listens to Kafka events (`OrderCreated`, `StockReserved`, `PaymentProcessed`...). Simple to start with, gets messy past ~4-5 services.
- **Orchestration:** either build a lightweight orchestrator service that calls each participant (REST or Kafka commands) and tracks saga state in its own table, or use a workflow engine like **Camunda** for complex conditional logic.
- **Critical practices** confirmed by current best practice: design every service to be **idempotent** (safe to retry — check for existing records before acting again), publish events via the **transactional outbox** (same as Pattern #2) so a DB commit and event publish never diverge, and use **correlation IDs** across all services so you can trace one saga's full journey through logs (pair with Zipkin/Jaeger for distributed tracing).
- Replace REST-based orchestration with Kafka for production — REST-to-REST orchestration adds latency and tighter coupling than an event-based approach.

**Related topics to study:** Two-Phase Commit (2PC) and why it's avoided at scale, idempotency, compensating transactions, distributed tracing (Zipkin/Jaeger/OpenTelemetry), correlation IDs, Camunda/workflow engines.

---

## 7. Database Per Service (Independent Data Ownership)

**Definition:** Each microservice owns and exclusively accesses its own database. No shared DB, no shared tables. Services communicate only through APIs.

**Flow:**
```
Client → API Gateway → User Service    ↔ User Service Database
                     → Order Service   ↔ Order Service Database
                     → Payment Service ↔ Payment Service Database
                     → Inventory Service ↔ Inventory Service Database
```

**How it works:** Each service is the sole owner of its data and schema. No other service is allowed to query another service's database directly — everything goes through that service's API. Services can even use *different database technologies* per their needs (Postgres for Order, Redis for session data, Elasticsearch for search).

**Benefit:** Independent deployments, technology freedom, loose coupling, easy scaling. This is what makes true microservice independence possible — without it, you just have a "distributed monolith" that's harder to run than the monolith it replaced.

**Pros**
- Teams can deploy their service without coordinating schema changes with anyone else
- Each service picks the best-fit database technology (polyglot persistence)
- No shared-DB bottleneck — no single database becomes the scaling ceiling for the whole system

**Cons**
- **Cross-service queries become hard.** "Show me a customer's orders with product names" now needs an API call or a read-model join (this is *why* CQRS and event-driven patterns exist alongside this one)
- Data duplication is common and intentional (e.g., Order Service caches a copy of `productName` rather than calling Inventory Service on every read)
- No cross-service foreign keys or joins — referential integrity across services must be handled at the application level

**Spring Boot notes**
- This is foundational to how your eG-Health microservices product should be structured — each Spring Boot service gets its own PostgreSQL schema/instance (or logically isolated schema at minimum), never a shared `DataSource` across services.
- When one service needs data another service owns, the two real options are: (1) a synchronous API call (Pattern #1, simple but adds coupling/latency), or (2) subscribe to that service's events and keep a local denormalized copy (Pattern #2 + #4 combined — more resilient, more complex).
- This is also *why* the Saga Pattern exists: once you commit to Database Per Service, you've explicitly given up cross-service ACID transactions, and Saga is how you get consistency back.

**Related topics to study:** polyglot persistence, data duplication/denormalization trade-offs, referential integrity across service boundaries, API composition pattern, schema-per-service vs instance-per-service.

---

## How These Patterns Combine

No single pattern is universal — real production systems stack several together:

**Typical pattern stack:** Request/Response + Events + Cache + CQRS + Saga + Database Per Service

**Example architecture:**
```
Client → API Gateway (Strangler Fig routing)
       → Services (each with CQRS read/write split, each owning its DB)
       → Event Bus (Kafka — connects services, drives read-model updates)
       → Saga Orchestrators (coordinate multi-service transactions)
       → Database Per Service (independent, polyglot persistence)
       → Cache-Aside (Redis in front of hot read paths)
```

**Key insight:** Start simple (Request/Response + a single DB). Add patterns only as specific pain shows up — Cache-Aside when reads get slow, Events when you need decoupling, CQRS when read/write patterns diverge sharply, Saga once you split databases and need cross-service consistency, Strangler Fig only when migrating a legacy system. Each pattern solves one specific problem — master the fundamentals (SOLID, transactions, idempotency, message brokers) before reaching for the pattern.

---

## Suggested Learning Path (Connected Topics)

Given where you are in your backend engineering study, here's how this connects and what to study next:

1. **You already have:** SOLID, caching fundamentals, multithreading/Virtual Threads, security/OAuth 2.1, TDD — these are the foundation every pattern above depends on.
2. **Next natural additions:**
   - **Idempotency** — required for Saga, Event-Driven, and retries in Request/Response. Study this next; it's the single most load-bearing concept across all seven patterns.
   - **Distributed tracing** (Zipkin, Jaeger, or OpenTelemetry) — you can't debug Event-Driven, Saga, or CQRS systems without it.
   - **Transactional Outbox Pattern + Debezium (CDC)** — the production-grade fix for the dual-write problem in Pattern #2 and #6.
   - **CAP theorem & eventual consistency** — the theoretical backbone explaining *why* patterns #2, #4, #6, #7 all trade immediate consistency for availability/scalability.
   - **API Gateway pattern** (Spring Cloud Gateway) — ties directly into Strangler Fig and Database Per Service.
3. **Framework to explore hands-on:** **Axon Framework** — it implements CQRS, Event Sourcing, and Saga together in Spring Boot, so building one small project with it will cement patterns #2, #4, and #6 simultaneously.

---

*Compiled from a 9-slide architecture pattern breakdown, expanded with current (2026) Spring Boot implementation practices — Transactional Outbox, Axon Framework, Virtual Threads, and Saga idempotency guidance cross-checked against recent implementation guides.*
