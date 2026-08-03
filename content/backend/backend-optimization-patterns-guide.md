# Advanced Backend Optimization Patterns — Deep Dive

A study guide covering 7 production patterns for high availability, performance, and data management — with real tools, code-level implementation notes, and how each connects to topics you're already studying (caching, multithreading, DDD, security).

---

## 1. Failover Pattern

**Core idea:** If your primary service/server dies, traffic automatically switches to a standby without the client noticing.

### How it works
1. Client → Load Balancer → Primary Service (Active)
2. Health checks (heartbeat/timeout) continuously probe the primary
3. On failure detection → LB reroutes to Secondary Service (Standby)
4. Data replication keeps the secondary in sync with the primary
5. Once primary recovers, traffic *can* switch back (not always automatic — "failback" is a separate decision)

### Two flavors
- **Active-Passive**: Standby sits idle, only takes over on failure. Simple, but wastes capacity.
- **Active-Active**: Both nodes serve traffic simultaneously; if one dies, the other absorbs full load. Better resource use, harder to keep consistent.

### Real tools
- **HAProxy / NGINX** — health checks + traffic routing
- **Keepalived** — VRRP-based failover for virtual IPs
- **AWS Route 53 failover routing** / **DNS failover** — for multi-region setups
- **Kubernetes** — liveness/readiness probes + auto-restart + multiple replicas do this natively

### In your Spring Boot stack
- **Resilience4j** (`CircuitBreaker`, `Retry`, `Fallback`) gives you failover logic at the application layer — if a downstream service call fails, fall back to a cached response or secondary service.
- **Spring Cloud LoadBalancer** distributes calls across healthy instances registered in Eureka/Consul.

### Connected topics to study next
- **Circuit Breaker Pattern** (Resilience4j `@CircuitBreaker`) — prevents cascading failures by "opening" the circuit after repeated failures instead of retrying forever
- **Bulkhead Pattern** — isolate resources per service so one failing dependency doesn't exhaust your whole thread pool (ties into your Java 21 Virtual Threads study — bulkheads matter differently with virtual threads since they're cheap)
- **CAP Theorem** — failover always forces a tradeoff between consistency and availability during a network partition

---

## 2. Consistent Hashing

**Problem it solves:** With plain `hash(key) % N` sharding, adding/removing *one* server reshuffles almost *all* keys → massive cache misses / data movement.

### How it works
1. Nodes and keys are placed on a logical ring (range `0` to `2³²-1`)
2. A key is hashed → placed on the ring → assigned to the **first node clockwise** from that point
3. **Add a node** → only the keys between the new node and its predecessor move. Everything else stays put.
4. **Remove a node** → only that node's keys move to the next node clockwise.
5. **Virtual nodes**: each physical server gets multiple points on the ring, so load distributes evenly (without virtual nodes, one server could get an unlucky large arc of the ring).

### Real uses
- **Redis Cluster**, **Memcached client-side sharding**, **Cassandra**, **DynamoDB** — this is *how* horizontal scaling works under the hood
- CDNs use it to route requests to the nearest/least-loaded edge node

### Connected topics
- **Rendezvous hashing (HRW)** — an alternative to consistent hashing, simpler in some cases, used in some load balancers
- **Sharding strategies** (range-based vs hash-based vs directory-based) — you'll hit this in any PostgreSQL horizontal scaling discussion
- **Gossip protocol** — how Cassandra nodes discover ring topology changes without a central coordinator

This is a classic system design interview topic — worth actually coding a toy version (hash ring + virtual nodes) in Java to internalize it. I can help you build that if useful.

---

## 3. Aggregator Pattern

**Core idea:** Client needs data from 4 different microservices (User, Order, Product, Payment). Instead of the client making 4 calls, an Aggregator service calls all of them in parallel and returns one unified response.

### Flow
1. Client → API Gateway → Aggregator Service
2. Aggregator fires **parallel** requests to User/Order/Product/Payment services
3. Each service responds independently
4. Aggregator merges responses into one payload, handles timeouts/partial failures
5. Single response goes back to the client

### Why it matters
- Simplifies client logic (mobile/web apps don't orchestrate microservice calls)
- Parallelizing calls = big latency win vs sequential calls
- Single point for caching the composite response

### In Spring Boot
- Use `CompletableFuture` or Spring's reactive `WebClient` to fire calls in parallel and join them:
  ```java
  CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(() -> userClient.get(id));
  CompletableFuture<List<Order>> orderFuture = CompletableFuture.supplyAsync(() -> orderClient.get(id));
  CompletableFuture.allOf(userFuture, orderFuture).join();
  ```
- With **Java 21 Virtual Threads**, you can even do this with plain blocking calls per virtual thread instead of reactive code — much simpler to read, similar throughput for I/O-bound aggregation. Worth comparing both approaches since you're already deep in Project Loom.

### Connected topics
- **BFF (Backend For Frontend)** — a specialized aggregator per client type (mobile BFF vs web BFF), very relevant if eG-Health ever splits mobile/web frontends
- **API Gateway pattern** (Spring Cloud Gateway) — often sits in front of the aggregator
- **Partial failure handling** — what happens if Payment Service times out but the rest succeed? Decide: fail the whole request, or return partial data with a flag?

---

## 4. Blue-Green Deployment

**Core idea:** Run two identical production environments — Blue (current/live) and Green (new version). Deploy to Green, test it, then flip the traffic switch. Instant rollback if something's wrong (just flip back).

### Flow
1. Blue is live, serving 100% traffic
2. Green gets the new deployment, gets tested against production-like data
3. Traffic switch (load balancer / API gateway) flips from Blue → Green
4. Blue becomes standby — can be a rollback target
5. Data sync between Blue DB and Green DB is the tricky part (schema migrations must be backward-compatible during the transition window)

### Why it's the "industry standard"
- **Zero downtime** — no window where the app is down
- **Instant rollback** — just flip the switch back to Blue, no redeploy needed
- **Parallel testing** — you can smoke-test Green with real infra before cutting over

### Compare with other deployment strategies (important — interviewers love this comparison)
| Strategy | How | Risk | Rollback speed |
|---|---|---|---|
| **Blue-Green** | Full env swap | Low (tested before switch) | Instant |
| **Canary** | Gradually shift % of traffic (5% → 25% → 100%) to new version | Very low (catches issues early, small blast radius) | Fast, but gradual |
| **Rolling** | Replace instances one-by-one | Medium (mixed versions live simultaneously) | Slower |
| **Recreate** | Kill old, deploy new | High (downtime) | Slow |

### Real tools
- Kubernetes: two Deployments + a Service selector swap, or tools like **Argo Rollouts** / **Flagger** for automated blue-green/canary
- AWS: CodeDeploy blue-green, or swap target groups behind an ALB

### Connected topics
- **Feature flags** (e.g., LaunchDarkly, or a simple DB-driven flag table) — decouples *deployment* from *release*, often paired with blue-green
- **Database migration strategies** — expand/contract pattern for schema changes that must work with both old and new app versions simultaneously

---

## 5. Soft Delete

**Core idea:** Never physically `DELETE` a row. Mark it `is_deleted = true` with a `deleted_at` timestamp instead. You can recover data, keep an audit trail, and satisfy compliance needs.

### Flow
1. Delete request → API marks `is_deleted = true`, records `deleted_at`
2. All normal queries automatically filter `WHERE is_deleted = false`
3. Restore = flip the flag back, clear `deleted_at`
4. True/permanent deletion (e.g., GDPR "right to be forgotten") = a separate archive-then-hard-delete job later

### In Spring Boot + Hibernate — this is directly usable in your eG-Health / Popular Diagnostic work
```java
@Entity
@SQLDelete(sql = "UPDATE patient SET is_deleted = true, deleted_at = now() WHERE id = ?")
@Where(clause = "is_deleted = false")
public class Patient {
    // ...
    private boolean isDeleted = false;
    private LocalDateTime deletedAt;
}
```
`@SQLDelete` intercepts Hibernate's `delete()` call and runs an UPDATE instead. `@Where` auto-adds the filter to every query on this entity — no need to remember to add `is_deleted = false` everywhere manually.

### Important gotcha
Soft delete conflicts with **GDPR's "right to be forgotten"** — for regulated healthcare data (very relevant to your work), you typically need a real hard-delete/anonymization job that runs after a retention period, not indefinite soft-delete.

### Connected topics
- **Audit trail / event sourcing** — instead of a boolean flag, some systems log every state change as an immutable event (who deleted what, when, why) — more powerful but more complex
- **Temporal tables** (SQL:2011 standard, supported in PostgreSQL via extensions) — automatically version every row change
- **Unique constraints + soft delete conflict**: if `email` must be unique but a soft-deleted user "frees up" their email for a new signup, you need a partial index: `CREATE UNIQUE INDEX ON users(email) WHERE is_deleted = false;` — a very common real-world bug source, worth remembering.

---

## 6. Distributed Cache

**Core idea:** Multiple app servers share one cache cluster (Redis/Memcached) instead of each having its own local cache — consistent view, fault-tolerant, ~1000x faster reads than hitting the DB.

### Flow
1. Client → Application Service
2. App checks the distributed cache cluster first
3. **Cache hit** → return immediately
4. **Cache miss** → fetch from DB → store in cache → return
5. On writes → update DB → invalidate/update the cache entry

### The 3 caching patterns (know these cold — very common interview question)
- **Cache-aside (lazy loading)**: App code manually checks cache, falls back to DB, then populates cache. Most common, most flexible. What Spring's `@Cacheable` does by default.
- **Write-through**: Every write goes to cache AND DB synchronously. Cache always fresh, but writes are slower.
- **Write-behind (write-back)**: Write to cache immediately, DB update happens asynchronously later. Fast writes, but risk of data loss if the cache dies before flushing.

### Eviction policies (relevant to your caching study)
- **LRU** (Least Recently Used) — evict the item not accessed in longest time
- **LFU** (Least Frequently Used) — evict the item accessed least often
- **TTL** (Time To Live) — auto-expire after a fixed duration, simplest and most common for session data

### In Spring Boot
```java
@Cacheable(value = "patients", key = "#patientId")
public Patient getPatient(Long patientId) { ... }

@CacheEvict(value = "patients", key = "#patientId")
public void updatePatient(Long patientId, Patient p) { ... }
```
Backed by Redis via `spring-boot-starter-data-redis` + `spring-boot-starter-cache`.

### Connected topics — genuinely important gotchas
- **Cache stampede / thundering herd**: when a hot key expires, thousands of concurrent requests all miss cache simultaneously and hammer the DB at once. Fix: locking (only one request repopulates, others wait) or staggered TTLs.
- **Cache invalidation** — "there are only two hard things in computer science: cache invalidation and naming things." Worth understanding invalidate-on-write vs TTL-only strategies.
- **Consistent hashing** (pattern #2 above) is *how* a distributed cache cluster decides which node owns which key — these two patterns are directly linked.

---

## 7. Anti-Corruption Layer (ACL)

**Core idea:** From Domain-Driven Design (DDD). When integrating with an external/legacy system that has an ugly or incompatible interface, you build a translation layer so your clean domain model never gets "corrupted" by the external system's model.

### Flow
1. Client → Your Application (Trusted Domain)
2. Your app calls the ACL instead of the external system directly
3. ACL does 3 jobs: **Protocol Adapter** (translate protocol/format), **Data Mapper** (transform data shape), **Validation & Rules** (enforce your domain's invariants)
4. ACL forwards the translated request to the External/Legacy System
5. External system responds in its own format
6. ACL transforms the response back into your domain's clean model
7. Your app never touches the external system's raw shape directly

### Why it matters for your work specifically
If Popular Diagnostic Center's platform or eG-Health ever integrates with a legacy hospital system (HL7, old SOAP APIs, a vendor's weird XML format — very common in healthcare), an ACL means your clean Spring Boot domain model doesn't get polluted by that legacy system's quirks. If the vendor changes their API, only the ACL changes — your core business logic is untouched.

### Benefits
- Encapsulation — external chaos contained in one place
- Independent evolution — legacy system and your system can change on different timelines
- Easier testing — mock the ACL interface, not the messy external system

### Connected topics
- **Adapter Pattern** (GoF) — the classic OOP design pattern; ACL is essentially Adapter applied at the architectural/bounded-context level
- **Facade Pattern** — similar idea, simplifies a complex subsystem's interface, but doesn't necessarily protect domain purity the way ACL does
- **Hexagonal Architecture (Ports & Adapters)** — ACL is a natural fit here; your domain core stays pure, adapters handle all external I/O
- **Strangler Fig Pattern** — when *migrating away* from a legacy system entirely (not just integrating), you gradually reroute functionality through an ACL until the legacy system can be killed

---

## How These 7 Patterns Connect

Think of them in 3 groups:

**Availability & Resilience** → Failover, Blue-Green Deployment
- Both are about *keeping the system up* — one handles unplanned failure, the other handles planned changes.

**Performance & Scale** → Consistent Hashing, Distributed Cache, Aggregator
- Consistent Hashing is the *mechanism* that makes Distributed Cache scale horizontally without massive rehashing.
- Aggregator reduces round-trips, often sits in front of a cache layer itself.

**Data & Domain Integrity** → Soft Delete, Anti-Corruption Layer
- Both protect data correctness — Soft Delete protects against accidental data loss, ACL protects your domain model from external corruption.

## Suggested Next Topics (natural extensions, fits your current GfG checklist)
1. **Circuit Breaker Pattern** (Resilience4j) — pairs directly with Failover
2. **Saga Pattern** — for distributed transactions across microservices (relevant once eG-Health has more than a couple of services needing consistency)
3. **CQRS (Command Query Responsibility Segregation)** — often paired with Soft Delete/Event Sourcing
4. **API Gateway Pattern** (Spring Cloud Gateway) — the front door to Aggregator, Failover routing, and rate limiting all at once
5. **Idempotency** — you already have this on your checklist; it's what makes Failover retries and Aggregator partial-failure retries *safe*

If you want, I can turn any single one of these (e.g., Circuit Breaker, or a hands-on consistent-hashing implementation in Java) into a focused deep-dive with working code.
