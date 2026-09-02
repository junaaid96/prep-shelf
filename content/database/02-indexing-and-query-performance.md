# 2. Indexing & Query Performance

The highest-leverage database skill: reading a plan, knowing which index fixes it, and knowing when an index is the wrong answer.

---

## 2.1 How a B-tree index actually helps

A B-tree stores keys sorted, so the engine can binary-search to a range instead of scanning. It serves:

- Equality: `WHERE email = ?`
- Range: `WHERE created_at >= ? AND created_at < ?`
- Prefix `LIKE`: `WHERE name LIKE 'Rah%'` (but **not** `'%man'`)
- Sorting: `ORDER BY created_at DESC` without a sort step
- `MIN`/`MAX`: a single index lookup

The costs are real: every `INSERT`/`UPDATE`/`DELETE` maintains **every** index on the table, indexes take disk and memory, and an unused index is pure overhead. A table with 12 indexes has slow writes and a confused planner.

```sql
-- Find indexes nobody uses (PostgreSQL)
SELECT relname AS table, indexrelname AS index, idx_scan AS times_used,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan < 50
ORDER BY pg_relation_size(indexrelid) DESC;
```

> **Asked as:** "What does an index cost?" · "Why not index every column?" · "Which queries can a B-tree serve?"

---

## 2.2 Composite indexes and column order

Column order is the whole game. Think of `(a, b, c)` as a phone book sorted by last name, then first name, then street.

```sql
CREATE INDEX idx_appt ON appointments (clinic_id, status, slot DESC);
```

| Query | Uses the index? |
|---|---|
| `WHERE clinic_id = 1` | ✅ full |
| `WHERE clinic_id = 1 AND status = 'X'` | ✅ full |
| `WHERE clinic_id = 1 AND status = 'X' ORDER BY slot DESC` | ✅ ideal — no sort step |
| `WHERE clinic_id = 1 AND slot > now()` | ⚠️ partial — uses `clinic_id`, then filters |
| `WHERE status = 'X'` | ❌ leading column missing (PG18's skip scan can help on low-cardinality leading columns, but don't rely on it) |

**Rule of thumb — the ESR order:** **E**quality columns first, then **S**ort columns, then **R**ange columns. Put the most selective equality column first when several compete.

**Covering / index-only scans:**

```sql
CREATE INDEX idx_appt_cover ON appointments (clinic_id, slot) INCLUDE (fee_cents, status);
-- The query can be answered from the index alone — the heap is never touched
```

**Partial indexes** are dramatically smaller when you always filter the same way:

```sql
CREATE INDEX idx_pending ON jobs (created_at) WHERE status = 'PENDING';
-- 5 MB instead of 4 GB if 0.1% of rows are pending
```

**Expression indexes** for computed predicates:

```sql
CREATE INDEX idx_email_lower ON users (lower(email));
SELECT * FROM users WHERE lower(email) = lower($1);   -- must match the expression exactly
```

> **Asked as:** "Does index `(a,b,c)` help `WHERE b = ?`?" · "What order should composite index columns go in?" · "What is a covering index?" · "When is a partial index the right tool?"

---

## 2.3 Reading `EXPLAIN ANALYZE`

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT p.full_name, count(*) AS visits
FROM patients p JOIN appointments a ON a.patient_id = p.id
WHERE a.slot >= now() - interval '30 days'
GROUP BY p.id, p.full_name
ORDER BY visits DESC LIMIT 20;
```

```
Limit  (cost=8421.19..8421.24 rows=20) (actual time=142.331..142.338 rows=20 loops=1)
  ->  Sort  (cost=8421.19..8438.44 rows=6900) (actual time=142.329..142.332 rows=20 loops=1)
        Sort Key: (count(*)) DESC
        Sort Method: top-N heapsort  Memory: 27kB
        ->  HashAggregate  (actual time=138.101..140.882 rows=6412 loops=1)
              ->  Hash Join  (actual time=12.442..118.223 rows=48211 loops=1)
                    Hash Cond: (a.patient_id = p.id)
                    ->  Index Scan using idx_appt_slot on appointments a
                          (actual time=0.041..38.117 rows=48211 loops=1)
                          Index Cond: (slot >= (now() - '30 days'::interval))
                          Buffers: shared hit=1204 read=832
                    ->  Hash  (actual time=12.301..12.302 rows=6900 loops=1)
                          ->  Seq Scan on patients p (actual time=0.008..7.114 rows=6900 loops=1)
Planning Time: 0.412 ms
Execution Time: 142.867 ms
```

What to look for, in order:

1. **`actual rows` vs estimated `rows`** — an order-of-magnitude gap means bad statistics. Run `ANALYZE`, raise `default_statistics_target`, or add extended statistics for correlated columns.
2. **`Seq Scan` on a big table with a selective filter** → missing index. (A `Seq Scan` on a small table is *correct* — don't "fix" it.)
3. **`loops=N` with N large** → a nested loop running N times; the inner cost multiplies.
4. **`Sort Method: external merge Disk: …`** → `work_mem` too small; the sort spilled to disk.
5. **`Rows Removed by Filter: 900000`** → the index got you to the wrong place; the predicate isn't indexed.
6. **`Buffers: read=` high** → cold cache / not enough `shared_buffers`.

**Join strategies:**

| Strategy | Good when |
|---|---|
| Nested Loop | Outer side is small and the inner has an index |
| Hash Join | Both sides large, equality join, enough `work_mem` |
| Merge Join | Both inputs already sorted (or cheaply sortable) on the join key |

> **Asked as:** "Walk me through this EXPLAIN output." · "How do you know an index is missing?" · "What does a big estimate/actual gap mean?"

---

## 2.4 Why your index isn't being used

```sql
-- 1. Function on the indexed column
WHERE date(created_at) = '2026-09-01'                   -- ✗ no index use
WHERE created_at >= '2026-09-01' AND created_at < '2026-09-02'   -- ✓ sargable

-- 2. Type mismatch / implicit cast
WHERE user_id = '123'          -- bigint column vs text literal → cast can defeat the index

-- 3. Leading wildcard
WHERE name LIKE '%man'          -- ✗ B-tree can't help; use a trigram index:
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_name_trgm ON patients USING gin (full_name gin_trgm_ops);

-- 4. OR across different columns
WHERE email = $1 OR phone = $1  -- often better as UNION of two indexed queries

-- 5. Low selectivity
WHERE is_active = true          -- if 95% of rows match, a Seq Scan IS the right plan

-- 6. Stale statistics
ANALYZE appointments;
```

"**Sargable**" = Search-ARGument-ABLE: the predicate can be expressed as a range on the indexed value. Keep the column bare on the left side of the comparison.

> **Asked as:** "Why isn't my index used?" · "What does sargable mean?" · "How do you index a `LIKE '%x%'` search?"

---

## 2.5 Index types beyond B-tree (PostgreSQL)

| Type | Use |
|---|---|
| **B-tree** | Default: equality, ranges, ordering |
| **Hash** | Equality only; rarely worth it over B-tree |
| **GIN** | Multi-valued: `jsonb`, arrays, full-text search, trigrams |
| **GiST** | Geometric, ranges, nearest-neighbour, exclusion constraints |
| **BRIN** | Huge tables with naturally ordered data (append-only logs by timestamp) — tiny index, big win |
| **SP-GiST** | Non-balanced structures: quadtrees, IP prefixes |
| **HNSW / IVFFlat** (pgvector) | Vector similarity search for embeddings/RAG |

```sql
-- Full-text search
ALTER TABLE articles ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED;
CREATE INDEX idx_articles_fts ON articles USING gin (tsv);
SELECT * FROM articles WHERE tsv @@ websearch_to_tsquery('english', 'diabetes screening');

-- Vector search (pgvector) — the 2026 default for RAG on a relational stack
CREATE EXTENSION vector;
ALTER TABLE documents ADD COLUMN embedding vector(1536);
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
SELECT id, content FROM documents ORDER BY embedding <=> $1 LIMIT 5;

-- BRIN on a time-series table: ~50 KB instead of ~2 GB
CREATE INDEX idx_events_brin ON events USING brin (created_at) WITH (pages_per_range = 128);
```

> **Asked as:** "When would you use GIN vs B-tree?" · "How do you do full-text search in Postgres?" · "How do you index vector embeddings?"

---

## 2.6 Query patterns that scale (and the ones that don't)

**Deep pagination:**

```sql
-- ✗ OFFSET 500000 — the DB fetches and throws away half a million rows
SELECT * FROM appointments ORDER BY slot DESC LIMIT 20 OFFSET 500000;

-- ✓ Keyset / cursor pagination — O(1) regardless of depth
SELECT * FROM appointments
WHERE (slot, id) < ($last_slot, $last_id)     -- row comparison handles ties correctly
ORDER BY slot DESC, id DESC
LIMIT 20;
```

**Counting:**

```sql
SELECT count(*) FROM huge_table;                          -- full scan, seconds to minutes
SELECT reltuples::bigint FROM pg_class WHERE relname = 'huge_table';   -- instant estimate
-- Or maintain an exact counter, or show "10 000+" like every large product does
```

**`SELECT *`** pulls every column across the wire and blocks index-only scans. Name your columns.

**Batch instead of loop.** 1000 single-row inserts inside a Django loop = 1000 round trips; `bulk_create` or `COPY` is one.

**N+1 at the SQL level** is the same disease as in the ORM — a query inside a loop. Fix with a join, an `IN (...)` batch, or `LATERAL`.

> **Asked as:** "Why is page 5000 slow and how do you fix it?" · "How do you count rows in a huge table?" · "What's wrong with `SELECT *`?"

---

## 2.7 Finding the slow query in production

```sql
-- PostgreSQL: the single most useful extension
CREATE EXTENSION pg_stat_statements;

SELECT substring(query, 1, 90) AS q,
       calls,
       round(total_exec_time::numeric, 0) AS total_ms,
       round(mean_exec_time::numeric, 2)  AS mean_ms,
       rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

Sort by **total time**, not mean: a 20 ms query called 500 000 times costs more than a 5 s report run once a day.

```sql
-- What's happening right now
SELECT pid, state, wait_event_type, wait_event, now() - query_start AS duration,
       substring(query, 1, 80)
FROM pg_stat_activity
WHERE state <> 'idle' ORDER BY duration DESC;

-- Blocked by a lock
SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid,
       blocked.query AS blocked_query, blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));

-- Table and index bloat / size
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
```

Also watch: **cache hit ratio** (should be >99%), **autovacuum lag** and dead tuples, **connection count** vs `max_connections`, and replication lag.

**Connection pooling** is not optional at scale: PostgreSQL forks a process per connection. 500 app connections will melt the server. Put **PgBouncer** in transaction mode in front (and know that it breaks session-level features: prepared statements need care, `SET` doesn't persist, advisory locks and `LISTEN/NOTIFY` don't work as expected).

> **Asked as:** "The database is slow — what do you check first?" · "What is `pg_stat_statements` for?" · "Why do you need a connection pooler?" · "What is vacuum and why does it matter?"

---

## 2.8 A worked optimisation

**Symptom:** the clinic dashboard takes 6 s.

```sql
-- Original
SELECT d.full_name,
       (SELECT count(*) FROM appointments a WHERE a.doctor_id = d.id AND a.slot::date = CURRENT_DATE) AS today,
       (SELECT sum(fee_cents) FROM appointments a WHERE a.doctor_id = d.id AND a.status = 'COMPLETED') AS revenue
FROM doctors d WHERE d.clinic_id = $1;
```

Problems: two correlated subqueries **per doctor** (N+1 in SQL), and `a.slot::date` is not sargable.

```sql
-- Rewritten: one pass, sargable predicates
SELECT d.full_name,
       count(*) FILTER (WHERE a.slot >= CURRENT_DATE AND a.slot < CURRENT_DATE + 1) AS today,
       coalesce(sum(a.fee_cents) FILTER (WHERE a.status = 'COMPLETED'), 0)          AS revenue
FROM doctors d
LEFT JOIN appointments a ON a.doctor_id = d.id
WHERE d.clinic_id = $1
GROUP BY d.id, d.full_name;

CREATE INDEX idx_appt_doctor_slot ON appointments (doctor_id, slot) INCLUDE (fee_cents, status);
```

**Result:** 6 s → 45 ms. The `FILTER` clause is the underused PostgreSQL feature that removes most conditional-aggregate subqueries.

---

## 2.9 Rapid-fire answers

| Question | Answer |
|---|---|
| Clustered index | The table stored in index order (SQL Server/InnoDB primary key). PostgreSQL heap tables have none; `CLUSTER` is a one-off reorder |
| Index on a low-cardinality column | Usually useless alone; useful as a partial index or a trailing composite column |
| When to add an index | A slow query with a selective predicate, verified with EXPLAIN — not "just in case" |
| `CREATE INDEX CONCURRENTLY` | Builds without an exclusive lock; slower, can fail and leave an invalid index |
| Foreign keys and indexes | PostgreSQL indexes the referenced PK, **not** the referencing column — add it yourself or deletes get slow |
| `work_mem` | Per-sort/hash memory; too low spills to disk, too high × many connections = OOM |
| Autovacuum | Reclaims dead tuples and refreshes stats; tune it on high-churn tables or you get bloat and bad plans |
| Read replica | Offload reporting/analytics reads; beware replication lag for read-after-write |
| Query timeout | `SET statement_timeout` per session/role so one bad query can't hold resources forever |
| `LIMIT` without `ORDER BY` | Non-deterministic — the "which 10 rows?" answer can change between runs |
