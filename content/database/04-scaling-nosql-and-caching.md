# 4. Scaling, Replication, Sharding, NoSQL & Caching

---

## 4.1 The scaling ladder — in the order you should climb it

1. **Fix the queries.** Indexes and N+1 fixes routinely give 10–100×. Cheaper and safer than any infrastructure change.
2. **Scale up.** More RAM (so the working set fits in cache) and faster disks beat most architectural cleverness under ~1 TB.
3. **Cache.** Application cache (Redis) for hot reads; CDN for static and cacheable API responses.
4. **Read replicas.** Send reports and read-heavy traffic off the primary.
5. **Partition** large tables by time or tenant within one database.
6. **Shard** across databases. Do this last — it's the point where joins, transactions, and uniqueness get hard.

Most teams reach for step 6 when step 1 was the answer. Interviewers are checking whether you know the order.

> **Asked as:** "How would you scale this database?" · "Vertical vs horizontal scaling."

---

## 4.2 Replication

```
        writes            async WAL stream
Client ────────► Primary ──────────────────► Replica 1 (reads)
                    │                       ► Replica 2 (reads / analytics)
                    └── synchronous replica (optional, zero data loss, higher latency)
```

- **Asynchronous** (default): fast commits, but a failover can lose the last few transactions, and replicas lag.
- **Synchronous**: the commit waits for a replica to confirm — no data loss on failover, higher write latency. `synchronous_commit = remote_apply` is the strictest.
- **Replication lag** is the operational reality: a user updates their profile, the redirect reads from a replica, and they see the old value. Fixes: route reads to the primary for N seconds after a write, pin a session to the primary, or wait for the LSN.
- **Failover** needs orchestration (Patroni, RDS Multi-AZ, Cloud SQL HA) plus a connection endpoint that moves — clients must reconnect.

**Logical replication** (per-table, cross-version) enables near-zero-downtime major upgrades and feeding a data warehouse; **physical/streaming** replication is the byte-level standby.

> **Asked as:** "Sync vs async replication." · "How do you handle replication lag?" · "How do you upgrade Postgres with minimal downtime?"

---

## 4.3 Partitioning vs sharding

**Partitioning** = one database, one logical table, many physical child tables.

```sql
CREATE TABLE events (
    id bigserial, clinic_id bigint, created_at timestamptz NOT NULL, payload jsonb
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_09 PARTITION OF events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Benefits: partition pruning (queries touch one child), and DROP PARTITION
-- is an instant metadata operation instead of a multi-hour DELETE.
DROP TABLE events_2025_09;     -- retention policy in one statement
```

Rules: the partition key should appear in most `WHERE` clauses, and it must be part of every unique constraint. Use `pg_partman` to create/drop partitions on a schedule.

**Sharding** = many databases, each holding a subset of the data, coordinated by the application or a proxy (Citus, Vitess).

| Strategy | How | Trade-off |
|---|---|---|
| Range | shard by id/date range | Simple; hotspots on the newest range |
| Hash | `hash(key) % N` | Even spread; resharding rehashes everything |
| **Consistent hashing** | keys on a ring with virtual nodes | Adding a shard moves only ~1/N of keys |
| Directory | a lookup table maps key → shard | Flexible, rebalanceable; the directory is a bottleneck/SPOF |
| Geo | shard by region | Latency + data residency; cross-region queries are painful |

**Pick the shard key carefully — it's the hardest thing to change later.** Good keys are high-cardinality, evenly distributed, and present in almost every query (`tenant_id` for B2B SaaS, `user_id` for consumer apps). Bad keys create hot shards (`country` where 60% of users are in one country) or force scatter-gather on every query.

What you lose when you shard: cross-shard joins, cross-shard transactions, global `AUTO_INCREMENT` (use UUIDv7 or a Snowflake-style id), and global uniqueness (enforce per-shard or in a separate service).

> **Asked as:** "Partitioning vs sharding." · "How would you choose a shard key?" · "What is consistent hashing and what problem does it solve?" · "What breaks when you shard?"

---

## 4.4 CAP, PACELC, and consistency models

**CAP:** under a network **P**artition you must choose **C**onsistency or **A**vailability. With no partition you can have both — CAP is a statement about failure modes, not a permanent menu.

**PACELC** is the more useful version: *if Partition then A or C, Else (normal operation) Latency or Consistency.* Every distributed database is making a latency/consistency trade even when healthy.

| System | Position |
|---|---|
| PostgreSQL/MySQL (single primary) | CP — the primary is authoritative; failover means brief unavailability |
| MongoDB (default majority writes) | CP-leaning, tunable |
| Cassandra / DynamoDB | AP by default, tunable per query (`QUORUM`, strongly-consistent reads) |
| etcd / ZooKeeper / Consul | CP — consensus (Raft/Paxos), used for coordination, not bulk data |

**Consistency models** you should be able to name: strong/linearizable, sequential, causal, read-your-writes, monotonic reads, and eventual. "Eventually consistent" without a bound is a design smell — ask *how* eventual.

**Quorum:** with N replicas, `R + W > N` guarantees a read sees the latest write. N=3, W=2, R=2 is the classic setting.

> **Asked as:** "Explain CAP." · "Is CAP still relevant?" · "What's the difference between eventual and strong consistency?" · "How does quorum work?"

---

## 4.5 Choosing a data store

| Store | Model | Strong at | Weak at |
|---|---|---|---|
| **PostgreSQL** | Relational + JSONB + vectors + full-text | Almost everything; transactions, joins, constraints | Very high write throughput without sharding |
| **MySQL** | Relational | Read-heavy web, huge ecosystem | Fewer advanced features than PG |
| **MongoDB** | Document | Flexible/evolving schemas, nested aggregates | Multi-document transactions, join-heavy queries |
| **Redis** | In-memory key-value + structures | Cache, sessions, rate limits, queues, leaderboards, locks | Durability, large datasets (RAM cost) |
| **Cassandra / ScyllaDB** | Wide-column | Massive write throughput, multi-region, linear scale | Ad-hoc queries — you model per query |
| **DynamoDB** | Key-value/document | Serverless scale, predictable latency | Cost at scale, access patterns fixed at design time |
| **Elasticsearch / OpenSearch** | Inverted index | Search, log analytics, aggregations | As a system of record — it isn't one |
| **ClickHouse** | Columnar OLAP | Billion-row analytical scans | Point updates/deletes, OLTP |
| **Neo4j** | Graph | Deep relationship traversal, recommendations | General-purpose workloads |
| **Kafka** | Log | Event streaming, replay, decoupling | Random access, as a database |

**The 2026 default answer: start with PostgreSQL.** With JSONB, full-text search, `pgvector`, `PostGIS`, `pg_cron`, partitioning, and logical replication, it covers what four specialised stores did in 2016 — and one operationally-understood system beats four half-understood ones. Add a specialised store when you have a measured reason.

**Cassandra data modelling** is worth understanding as a contrast — you design the table *per query*:

```cql
CREATE TABLE appointments_by_doctor (
    doctor_id uuid,
    slot timestamp,
    appointment_id uuid,
    patient_name text,
    PRIMARY KEY ((doctor_id), slot)      -- partition key, then clustering key
) WITH CLUSTERING ORDER BY (slot DESC);
```

The partition key determines which node holds the data; the clustering key determines the order within it. No joins, no ad-hoc `WHERE` — duplicate the data into another table for another access pattern.

> **Asked as:** "SQL vs NoSQL — when would you pick each?" · "Why would you choose Cassandra?" · "Can Postgres replace Elasticsearch/Mongo/Redis?" · "How do you model data in a wide-column store?"

---

## 4.6 Caching patterns

```
              ┌── hit ──► return
Request ──► Cache
              └── miss ──► Database ──► populate cache ──► return
```

| Pattern | How | Notes |
|---|---|---|
| **Cache-aside** (lazy) | App reads cache, falls back to DB, writes to cache | The default; cache only holds what's asked for |
| **Read-through** | Cache library fetches on miss | Same effect, hidden in the client |
| **Write-through** | Write to cache and DB together | Consistent, slower writes |
| **Write-behind** | Write to cache, flush to DB async | Fast, risks data loss |
| **Refresh-ahead** | Proactively refresh before expiry | Avoids latency spikes on hot keys |

**Invalidation** — "one of the two hard problems":

- **TTL** is the simplest correct answer. Short TTLs on volatile data beat clever invalidation you'll get wrong.
- **Explicit delete on write**, ideally in `on_commit`, for data where staleness is unacceptable.
- **Versioned keys** (`user:123:v7`) — bump the version instead of hunting down every key.
- **Never cache without a key that includes the tenant/user** when the data is scoped. This is a security bug, not a performance bug.

**The three classic cache failures:**

| Problem | What happens | Fix |
|---|---|---|
| **Stampede / thundering herd** | A hot key expires, 1000 requests all miss and hit the DB | Lock or single-flight on recompute, jittered TTLs, refresh-ahead |
| **Penetration** | Requests for a key that doesn't exist bypass the cache every time | Cache the negative result briefly; bloom filter |
| **Avalanche** | Many keys expire at the same moment (e.g. all set at deploy) | Randomise TTLs (`ttl + rand(0, ttl*0.1)`) |

```python
def get_dashboard(clinic_id):
    key = f"dash:v3:{clinic_id}"
    data = redis.get(key)
    if data is not None:
        return json.loads(data)

    # Single-flight: only one worker recomputes; others briefly wait and re-read
    lock = redis.lock(f"{key}:lock", timeout=10, blocking_timeout=5)
    if lock.acquire(blocking=True):
        try:
            data = redis.get(key)                       # double-check after acquiring
            if data is None:
                computed = expensive_query(clinic_id)
                ttl = 300 + random.randint(0, 60)       # jitter
                redis.setex(key, ttl, json.dumps(computed))
                return computed
            return json.loads(data)
        finally:
            lock.release()
```

**Eviction policies:** `allkeys-lru` for a pure cache, `volatile-ttl` when you mix cache and persistent keys, `noeviction` when Redis is a datastore (and then monitor memory hard).

**Where to cache**, cheapest first: browser → CDN → reverse proxy → application in-process → Redis → database buffer cache. Each layer you can serve from is a layer of load the ones behind it never see.

> **Asked as:** "Cache-aside vs write-through." · "How do you invalidate?" · "What is a cache stampede and how do you prevent it?" · "What would you cache in this system?"

---

## 4.7 Rapid-fire answers

| Question | Answer |
|---|---|
| OLTP vs OLAP | Many small transactions vs few large analytical scans; row store vs column store |
| Data warehouse / lake / lakehouse | Structured modelled store / raw files / open table formats (Iceberg, Delta) with warehouse semantics |
| CDC | Change Data Capture — stream row changes from the WAL/binlog (Debezium) to other systems |
| Hot vs cold storage | Recent data on fast disk, archives on object storage; partitioning makes the move easy |
| Backup strategy | Automated full + WAL archiving for PITR, **tested restores**, off-site copy, documented RTO/RPO |
| Redis persistence | RDB snapshots (fast restart, some loss) vs AOF (durable, larger); both can be on |
| Redis for locks | `SET key val NX PX ttl` — plus a fencing token; Redlock is contested for correctness |
| Rate limiting | Token bucket or sliding-window counter in Redis, keyed by user/IP/API key |
| Sharding an existing DB | Dual-write + backfill + verify + cut over per shard — or use Citus/Vitess to avoid hand-rolling it |
| Choosing a store | Access patterns and consistency needs first; team familiarity second; hype never |
