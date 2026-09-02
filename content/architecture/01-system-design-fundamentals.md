# 1. System Design Fundamentals

The interview is not testing whether you can name technologies. It's testing whether you can start from requirements, do arithmetic, make a trade-off explicitly, and know where your design breaks.

---

## 1.1 A framework that works under pressure

**1. Clarify (5 min).** Never start drawing. Ask:
- Who uses this and how? (read-heavy? write-heavy? bursty?)
- Scale: DAU, requests/sec, data volume, growth
- Latency target (p99, not average) and availability target
- Consistency requirement — is stale data acceptable, and for how long?
- What's explicitly **out of scope**

**2. Estimate (5 min).** Do the arithmetic out loud — it drives every later decision.

```
100M DAU, each doing 20 reads + 2 writes/day
Reads:  100M × 20 = 2B/day  ÷ 86 400 ≈ 23 000 rps average, ~70 000 rps peak (3×)
Writes: 100M × 2  = 200M/day ÷ 86 400 ≈ 2 300 rps average

Storage: 200M writes/day × 1 KB = 200 GB/day → 73 TB/year → 220 TB with 3× replication
Cache:   80/20 rule → cache the hot 20% of a day's reads ≈ 40 GB → fits in a few Redis nodes
Bandwidth: 23 000 rps × 5 KB response ≈ 115 MB/s ≈ 1 Gbps
```

Numbers worth memorising: L1 ~1 ns, RAM ~100 ns, SSD random read ~100 µs, network round trip within a datacentre ~0.5 ms, cross-continent ~150 ms. A single well-indexed Postgres box handles thousands of simple queries per second; one commodity server handles tens of thousands of concurrent connections.

**3. API + data model (5 min).** Define the two or three endpoints that matter and the core tables/collections. This is where most candidates skip ahead and lose points.

**4. High-level design (10 min).** Client → CDN → load balancer → API/service → cache → database, plus a queue for async work. Draw it, then walk one request through it end to end.

**5. Deep dive (10–15 min).** The interviewer picks a component. Be ready on: the data model and shard key, the caching strategy, how you handle the hot key / celebrity problem, and the failure modes.

**6. Bottlenecks and trade-offs (5 min).** Name what breaks first, what you'd monitor, and what you'd do at 10× scale.

> **Asked as:** the whole interview. The framework *is* the answer to "design X."

---

## 1.2 The building blocks

| Component | Job | Watch out for |
|---|---|---|
| **DNS** | Name → IP; can do geo/failover routing | TTL means failover isn't instant |
| **CDN** | Cache static and cacheable responses at the edge | Invalidation, cache key correctness |
| **Load balancer** | Distribute traffic; L4 (TCP) vs L7 (HTTP, path routing) | Health checks, sticky sessions (avoid), single AZ |
| **API gateway** | Auth, rate limiting, routing, aggregation | Becomes a monolith of config if you're not careful |
| **App servers** | Stateless business logic | Any local state kills horizontal scaling |
| **Cache** | Redis/Memcached in front of the DB | Invalidation, stampede, hot keys |
| **Database** | System of record | Connection limits, the single-primary write ceiling |
| **Object storage** | Files, images, backups (S3) | Serve via CDN + signed URLs, never through your app |
| **Message queue** | Decouple, buffer bursts, retry | At-least-once → consumers must be idempotent |
| **Search index** | Full-text, faceting | Kept in sync via CDC/events, not the source of truth |
| **Coordination** | etcd/ZooKeeper for leader election, config | Don't put bulk data in it |

**Statelessness is the enabler.** If a server holds session state, you need sticky sessions and you can't scale or replace nodes freely. Push state to Redis or a signed cookie.

> **Asked as:** "L4 vs L7 load balancing." · "Why must app servers be stateless?" · "Where would you put a queue in this design?"

---

## 1.3 Availability, latency, and the maths of nines

| Availability | Downtime/year | Downtime/month |
|---|---|---|
| 99% | 3.65 days | 7.2 h |
| 99.9% | 8.8 h | 43 min |
| 99.99% | 52 min | 4.3 min |
| 99.999% | 5.3 min | 26 s |

**Components in series multiply**: three services at 99.9% each give 99.7% end to end. Redundancy in parallel is what buys nines back: two independent 99% components in parallel give 99.99% *if* failures are independent (they rarely are — shared dependencies, shared AZ, shared deploy).

**Tail latency matters more than the mean.** If one request fans out to 10 services each with a p99 of 100 ms, the probability that *none* of them is slow is 0.99¹⁰ ≈ 90% — so ~10% of your requests hit a 100 ms+ component. Measure p50/p95/p99/p99.9, and use hedged requests or timeouts + fallbacks to cut the tail.

**Resilience patterns** you should name by heart:

- **Timeout** on every network call. No timeout = a hung dependency takes you down.
- **Retry with exponential backoff + jitter**, and a cap. Retries without jitter create synchronised thundering herds.
- **Circuit breaker** — after N failures, stop calling and fail fast; probe periodically (Resilience4j, Polly, Hystrix-style).
- **Bulkhead** — separate thread/connection pools per dependency so one slow service can't consume all your capacity.
- **Rate limiting / load shedding** — reject excess work early rather than degrading for everyone.
- **Graceful degradation** — serve stale cache, hide the recommendations widget, keep checkout working.
- **Idempotency** — because retries mean duplicates.

> **Asked as:** "What happens when a downstream service is slow?" · "Explain circuit breaker vs retry." · "Why is p99 more important than the average?" · "How do you calculate end-to-end availability?"

---

## 1.4 Rate limiting (a very common deep dive)

| Algorithm | How | Trade-off |
|---|---|---|
| Fixed window | Count per minute bucket | Burst at the boundary — 2× the limit across two windows |
| Sliding log | Store every timestamp | Exact, memory-hungry |
| **Sliding window counter** | Weighted blend of current + previous window | Good accuracy, cheap — the usual choice |
| **Token bucket** | Tokens refill at rate R, burst up to B | Allows controlled bursts — the usual choice for APIs |
| Leaky bucket | Fixed-rate outflow queue | Smooths bursts, adds latency |

```lua
-- Redis token bucket (atomic via Lua so check-and-consume can't race)
local key, rate, burst, now = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local b = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(b[1]) or burst
local ts     = tonumber(b[2]) or now
tokens = math.min(burst, tokens + (now - ts) * rate)
if tokens < 1 then return 0 end
redis.call('HMSET', key, 'tokens', tokens - 1, 'ts', now)
redis.call('EXPIRE', key, math.ceil(burst / rate) * 2)
return 1
```

Return `429` with `Retry-After` and `X-RateLimit-*` headers. Limit per API key/user, not just per IP (NAT puts thousands of users behind one IP).

> **Asked as:** "Design a rate limiter." · "Token bucket vs sliding window." · "Where do you enforce it — gateway or service?"

---

## 1.5 Two worked designs

### URL shortener

```
POST /urls {"url": "https://…"} → {"short": "https://sho.rt/aB3xK9"}
GET  /aB3xK9 → 301/302 redirect
```

- **Key generation**: base62 of a distributed counter (Snowflake id or a range allocated per node) → short, no collisions, no lookup. Random 7-char keys need a uniqueness check; hashing the URL gives dedup but collisions to handle.
- **Storage**: `short_code (PK) → long_url, owner_id, created_at, expires_at`. 100M URLs × ~500 B ≈ 50 GB — trivially one database, sharded by `short_code` if needed.
- **Read path**: massively read-heavy (100:1). Cache every hot code in Redis; a redirect should be a cache hit, ~1 ms.
- **Redirect code**: `301` is cached by browsers forever (fast, but you lose analytics and can't change the target); `302` keeps control. Most services use `302`.
- **Analytics**: don't write a row per click synchronously — publish to Kafka, aggregate asynchronously.

### News feed

- **Fan-out on write (push)**: when a user posts, insert into every follower's feed list. Reads are O(1) — perfect for normal users. Breaks for celebrities (10M followers = 10M writes per post).
- **Fan-out on read (pull)**: build the feed by querying the people you follow at read time. Cheap writes, expensive reads.
- **Hybrid (what real systems do)**: push for normal accounts, pull for the few thousand accounts with huge follower counts, then merge at read time. This "celebrity problem" answer is what the question is really probing.
- Feed stored in Redis as a capped sorted set per user; the full post lives in the database/object store.

> **Asked as:** "Design a URL shortener / news feed / chat / rate limiter / ticket booking." · "How do you handle the celebrity problem?"

---

## 1.6 Common bottlenecks and their standard fixes

| Bottleneck | Symptom | Fix |
|---|---|---|
| Database writes | Primary CPU/IO pinned | Batch, queue, partition, shard, or move the write off the hot path |
| Database reads | Slow queries, high connections | Index, cache, read replicas, denormalise |
| Hot key/partition | One shard at 100%, others idle | Add a random suffix, split the key, local cache the hot value |
| Thundering herd | Latency spike on cache expiry | Single-flight lock, jittered TTL, refresh-ahead |
| Connection exhaustion | Timeouts, "too many connections" | Pooler (PgBouncer), lower per-pod pool size, fix leaks |
| Single point of failure | One AZ/component takes everything down | Multi-AZ, redundancy, health-checked failover |
| Synchronous chains | One slow service stalls the request | Async via queue, timeouts, circuit breakers, parallel fan-out |
| Unbounded queues | Growing lag, memory pressure | Backpressure, dead-letter queues, autoscale consumers, drop low-priority work |

> **Asked as:** "What breaks first as traffic grows 10×?" · "How do you handle a hot partition?"

---

## 1.7 Rapid-fire answers

| Question | Answer |
|---|---|
| Horizontal vs vertical scaling | More machines (needs statelessness, adds coordination) vs a bigger machine (simple, has a ceiling) |
| Latency vs throughput | Time per operation vs operations per second — you can trade one for the other (batching) |
| Push vs pull | Server sends (WebSocket/SSE/webhook) vs client asks (polling) |
| Long polling / SSE / WebSocket | Held request / one-way server stream with auto-reconnect / full duplex |
| Idempotency | Same request twice = same effect once — mandatory with retries |
| Backpressure | Signalling upstream to slow down instead of buffering until you die |
| Consistent hashing | Ring + virtual nodes; adding a node moves only ~1/N of keys |
| Bloom filter | Probabilistic set membership; no false negatives — cheap "definitely not here" checks |
| CQRS | Separate the read model from the write model; scale and shape them independently |
| Blue-green vs canary | Two full environments, switch traffic / gradual percentage rollout with automated rollback |
| SLA / SLO / SLI | Contract / internal target / the measurement; error budget = 1 − SLO |
| "Design for 10×, rewrite at 100×" | Don't build for scale you don't have; do avoid decisions that block it |
