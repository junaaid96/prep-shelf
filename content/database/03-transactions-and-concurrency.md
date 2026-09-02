# 3. Transactions, Isolation & Concurrency Control

---

## 3.1 ACID, concretely

| Property | Meaning | Mechanism |
|---|---|---|
| **Atomicity** | All or nothing | Write-ahead log + rollback |
| **Consistency** | Constraints hold before and after | Constraints, triggers, your application invariants |
| **Isolation** | Concurrent transactions don't corrupt each other | Locks and/or MVCC |
| **Durability** | Committed means survived a crash | WAL fsync, replication |

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 500 WHERE id = 1;
  UPDATE accounts SET balance = balance + 500 WHERE id = 2;
COMMIT;    -- both, or neither
```

**Durability has a knob.** `synchronous_commit = off` makes commits much faster but can lose the last fraction of a second of transactions on a crash. For analytics ingestion that's fine; for payments it is not.

> **Asked as:** "Explain ACID." · "How does the database guarantee atomicity?" · "What is a WAL?"

---

## 3.2 The four anomalies and the isolation levels that prevent them

| Anomaly | What happens |
|---|---|
| **Dirty read** | You read a row another transaction wrote but hasn't committed |
| **Non-repeatable read** | You read the same row twice and get different values |
| **Phantom read** | You run the same range query twice and get different *rows* |
| **Lost update** | Two transactions read, both modify, the second overwrites the first |
| **Write skew** | Two transactions each read a set, each writes based on it, and together they violate an invariant |

| Level | Dirty | Non-repeatable | Phantom | Write skew |
|---|---|---|---|---|
| Read Uncommitted | ✅ possible | ✅ | ✅ | ✅ |
| **Read Committed** (PostgreSQL default) | ❌ | ✅ | ✅ | ✅ |
| **Repeatable Read** (MySQL/InnoDB default) | ❌ | ❌ | ❌ in PG/InnoDB* | ✅ |
| **Serializable** | ❌ | ❌ | ❌ | ❌ |

\* Standard SQL allows phantoms at Repeatable Read; PostgreSQL's snapshot isolation and InnoDB's gap locks prevent them in practice.

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
  -- ...
COMMIT;   -- may fail with 40001 serialization_failure → the application must RETRY
```

**Serializable in PostgreSQL is SSI (Serializable Snapshot Isolation)** — optimistic, no extra locks, but it aborts conflicting transactions. Any code using it must have a retry loop.

**Write skew, the anomaly people don't know:**

```
Rule: at least one doctor must remain on call.
T1: reads "2 doctors on call" → takes Dr. A off call
T2: reads "2 doctors on call" → takes Dr. B off call
Both commit at Repeatable Read. Now zero doctors are on call.
```

Fixes: `SERIALIZABLE`, or an explicit lock on a shared row, or a database constraint that makes the invariant checkable.

> **Asked as:** "Explain the isolation levels." · "What is a phantom read?" · "What's the default isolation level in PostgreSQL/MySQL?" · "What is write skew and how do you prevent it?"

---

## 3.3 MVCC — how PostgreSQL avoids read locks

Every row version carries `xmin` (creating transaction) and `xmax` (deleting transaction). A transaction sees the versions visible in its **snapshot**. Consequences:

- **Readers never block writers; writers never block readers.** Only writer-writer conflicts on the same row block.
- `UPDATE` creates a **new row version** and marks the old one dead — it's an insert + delete, which is why heavy-update tables bloat.
- **`VACUUM`** reclaims dead tuples. If autovacuum can't keep up (long-running transactions hold back the "xmin horizon"), the table bloats and plans degrade.
- A long-open transaction — including an idle-in-transaction session in your app — is a production hazard. Set `idle_in_transaction_session_timeout`.

```sql
SELECT relname, n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
```

InnoDB uses MVCC too, via undo logs plus next-key (gap) locks for range protection.

> **Asked as:** "What is MVCC?" · "Why does an UPDATE-heavy table grow even when row count is flat?" · "What does VACUUM do?" · "Why are long transactions dangerous?"

---

## 3.4 Locking: pessimistic vs optimistic

**Pessimistic — lock the row before you read-modify-write:**

```sql
BEGIN;
SELECT * FROM inventory WHERE sku = 'ABC' FOR UPDATE;   -- other writers wait here
UPDATE inventory SET qty = qty - 1 WHERE sku = 'ABC';
COMMIT;

-- Variants
FOR UPDATE NOWAIT       -- fail immediately instead of waiting
FOR UPDATE SKIP LOCKED  -- skip contended rows — the job-queue pattern
FOR SHARE               -- others can read, nobody can write
```

**Optimistic — detect the conflict at write time (version column):**

```sql
UPDATE documents SET body = $1, version = version + 1
WHERE id = $2 AND version = $3;
-- 0 rows updated → someone else edited it → return 409 and let the user merge
```

Use pessimistic locks for short, high-contention critical sections (inventory decrement, seat booking); optimistic for long user-driven edits where holding a lock across a form is unacceptable.

**Atomic in-place updates avoid both:**

```sql
UPDATE inventory SET qty = qty - 1 WHERE sku = 'ABC' AND qty > 0;
-- The database serialises row updates for you; check the affected row count
```

That's the cheapest correct fix for the classic "two users bought the last item" problem, and it's what `F()` expressions in Django compile to.

**Deadlocks:**

```
T1: locks row A, then wants B
T2: locks row B, then wants A     → the database detects the cycle and kills one
```

Prevention: **always acquire locks in a consistent order** (e.g. ascending primary key), keep transactions short, don't do network I/O inside a transaction, and use a lock timeout. Detection in PostgreSQL is automatic (`deadlock_timeout`, default 1 s) — one transaction gets `40P01` and must retry.

**Advisory locks** for application-level mutual exclusion (only one worker should run the nightly report):

```sql
SELECT pg_try_advisory_lock(hashtext('nightly-report'));   -- non-blocking
-- ... work ...
SELECT pg_advisory_unlock(hashtext('nightly-report'));
```

> **Asked as:** "Optimistic vs pessimistic locking." · "How do you prevent overselling the last item?" · "What causes a deadlock and how do you avoid it?" · "What is `SKIP LOCKED` for?"

---

## 3.5 Retry logic you actually need

Serialization failures and deadlocks are **normal** under concurrency, not bugs. The application must retry.

```python
from django.db import transaction, OperationalError
import random, time

def with_retry(fn, attempts=3):
    for i in range(attempts):
        try:
            with transaction.atomic():
                return fn()
        except OperationalError as e:
            code = getattr(e.__cause__, "pgcode", None)
            if code not in ("40001", "40P01") or i == attempts - 1:   # serialization / deadlock
                raise
            time.sleep((2 ** i) * 0.05 + random.random() * 0.05)      # backoff + jitter
```

Requirements for a safe retry: the transaction must be **idempotent** (or guarded by a unique constraint), and it must contain **no external side effects** — no emails, no payment charges, no queue publishes inside the transaction. Use `on_commit` hooks for those.

> **Asked as:** "What do you do when a transaction fails with a serialization error?" · "Why can't you send an email inside a transaction?"

---

## 3.6 Distributed transactions and their alternatives

Two-phase commit (2PC) across services is slow, blocks on coordinator failure, and couples your deployments. In microservices the standard answers are:

**Saga** — a sequence of local transactions, each with a compensating action:

```
Book appointment → Charge payment → Send confirmation
     ↓ fail            ↓ fail
   (nothing)      Cancel appointment (compensation)
```

Choreography (services react to each other's events) is simple for 2–3 steps; orchestration (a central saga coordinator) is clearer beyond that.

**Transactional Outbox** — the fix for "wrote to the DB but the event never published" (or vice versa):

```sql
BEGIN;
  INSERT INTO appointments (...) VALUES (...);
  INSERT INTO outbox (id, aggregate_id, type, payload, created_at)
       VALUES (gen_random_uuid(), $1, 'AppointmentBooked', $2::jsonb, now());
COMMIT;
-- A separate relay (or Debezium CDC on the WAL) reads outbox rows and publishes to Kafka,
-- then marks them sent. One local transaction, no distributed commit.
```

Consumers must be **idempotent** because delivery is at-least-once — dedupe on the event id.

**Inbox pattern** on the consumer side: record processed event ids in a table with a unique constraint, so a redelivery is a no-op.

> **Asked as:** "How do you keep a database write and a Kafka publish consistent?" · "Explain the saga pattern." · "Why not 2PC?" · "How do you make a consumer idempotent?"

---

## 3.7 Rapid-fire answers

| Question | Answer |
|---|---|
| Savepoint | A nested rollback point inside a transaction (`SAVEPOINT s1; ROLLBACK TO s1;`) — Django's nested `atomic()` |
| Autocommit | Each statement is its own transaction unless you `BEGIN`; the default in most drivers |
| Lock granularity | Row < page < table; PostgreSQL takes row locks for DML and table locks for DDL |
| `ALTER TABLE` locking | Most DDL takes an `ACCESS EXCLUSIVE` lock — behind a long query it queues and blocks everything. Set a short `lock_timeout` for migrations |
| Read-after-write on a replica | Route the read to the primary for a short window, or wait on LSN/`pg_wal_lsn_diff` |
| Idempotency key | Client-supplied unique id stored with the result; a repeat returns the stored response |
| `SELECT ... FOR UPDATE` with `LIMIT` | Needs a subquery + `SKIP LOCKED` to behave like a queue |
| Optimistic locking in an ORM | Django: a `version` field + `filter(version=v).update(...)`; JPA: `@Version` |
| Long transaction symptoms | Bloat, replication lag, blocked DDL, vacuum unable to reclaim |
| Connection in transaction pooling | PgBouncer transaction mode + `SET` / advisory locks / prepared statements need special handling |
