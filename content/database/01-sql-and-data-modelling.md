# 1. SQL & Data Modelling

**Current state (Sept 2026):** PostgreSQL **18** (18.6) is the newest major — async I/O, skip-scan for B-tree indexes, `uuidv7()`, virtual generated columns, OAuth auth. PostgreSQL remains the default choice for new systems; MySQL 8.4 LTS holds a large installed base. Examples here are PostgreSQL unless noted.

---

## 1.1 Normalisation — and when to stop

| Form | Rule | Fixes |
|---|---|---|
| 1NF | Atomic values, no repeating groups | A `phone_numbers` CSV column |
| 2NF | 1NF + no partial dependency on part of a composite key | Facts about half the key |
| 3NF | 2NF + no transitive dependency (non-key → non-key) | `city` determined by `zip` |
| BCNF | Every determinant is a candidate key | Rare overlapping-key anomalies |

Normalise to **3NF by default**. Denormalise deliberately, later, with a reason and a plan to keep the copy correct:

```sql
-- Denormalised counter, kept correct by a trigger (or by application code in one place)
ALTER TABLE patients ADD COLUMN appointment_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION bump_appt_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE patients SET appointment_count = appointment_count + 1 WHERE id = NEW.patient_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE patients SET appointment_count = appointment_count - 1 WHERE id = OLD.patient_id;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER appt_count AFTER INSERT OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION bump_appt_count();
```

The trade: denormalisation buys read speed and costs write complexity plus a new way to be wrong. A **materialised view** refreshed on a schedule is often the better version of the same idea.

> **Asked as:** "Explain 1NF/2NF/3NF with an example." · "When would you denormalise?" · "What are the risks of denormalising?"

---

## 1.2 Keys, types, and constraints

```sql
CREATE TABLE appointments (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),      -- PG18: time-ordered UUID
    clinic_id     bigint NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    patient_id    bigint NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id     bigint NOT NULL REFERENCES doctors(id)  ON DELETE RESTRICT,
    slot          timestamptz NOT NULL,
    fee_cents     bigint NOT NULL CHECK (fee_cents >= 0),
    status        text NOT NULL DEFAULT 'SCHEDULED'
                  CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW')),
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT one_appt_per_doctor_slot UNIQUE (doctor_id, slot)
);
```

**Type choices that matter:**

- **`timestamptz`, always.** `timestamp` without a zone silently loses the offset and produces the "everything shifted by 6 hours" bug. Store UTC, convert at the edges.
- **Money as integer cents** (`bigint`) or `numeric(12,2)` — never `float`/`double`. `0.1 + 0.2 != 0.3` applies to your ledger too.
- **`text` over `varchar(n)`** in PostgreSQL — identical performance, and you avoid a migration when the limit is wrong. Enforce length with a `CHECK` when it's a real business rule.
- **UUIDv7 vs bigserial**: sequential `bigint` is smallest and index-friendliest; random UUIDv4 causes index-page fragmentation at scale; **UUIDv7 is time-ordered**, so it gets you distributed-safe ids without the write amplification. Use UUIDs when ids must be generated client-side or merged across systems.
- **Enum-as-`text` + CHECK** is easier to evolve than a native `ENUM` type (adding a value to a PG enum is fine; removing or reordering is not).

**Constraints are cheaper than bugs.** `NOT NULL`, `CHECK`, `UNIQUE`, `FOREIGN KEY`, and exclusion constraints are enforced regardless of which service, script, or intern writes the row.

```sql
-- Exclusion constraint: no two appointments for the same doctor with overlapping durations
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD COLUMN during tstzrange
    GENERATED ALWAYS AS (tstzrange(slot, slot + interval '30 min')) STORED;
ALTER TABLE appointments ADD CONSTRAINT no_overlap
    EXCLUDE USING gist (doctor_id WITH =, during WITH &&);
```

**`NULL` semantics** — the classic interview trap:

```sql
NULL = NULL          -- NULL (not true!)
NULL IS NULL         -- true
1 + NULL             -- NULL
COUNT(col)           -- ignores NULLs;  COUNT(*) counts rows
SUM(col)             -- ignores NULLs; returns NULL if all are NULL → wrap in COALESCE
WHERE col <> 'X'     -- excludes NULL rows! use  (col IS DISTINCT FROM 'X')
UNIQUE               -- allows multiple NULLs (PG15+: UNIQUE NULLS NOT DISTINCT changes this)
```

> **Asked as:** "Natural vs surrogate key." · "UUID vs auto-increment primary key." · "How do you store money?" · "Why did my `WHERE status != 'X'` miss rows?"

---

## 1.3 Joins, precisely

```sql
-- INNER: rows matching on both sides
SELECT p.full_name, a.slot
FROM patients p
JOIN appointments a ON a.patient_id = p.id;

-- LEFT: all patients, NULLs where no appointment
SELECT p.full_name, a.slot
FROM patients p
LEFT JOIN appointments a ON a.patient_id = p.id;

-- Anti-join: patients with NO appointments (the "find the missing" pattern)
SELECT p.*
FROM patients p
LEFT JOIN appointments a ON a.patient_id = p.id
WHERE a.id IS NULL;
-- equivalently, and often faster:
SELECT * FROM patients p WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id);

-- Self join: doctors and their supervisors
SELECT d.full_name AS doctor, s.full_name AS supervisor
FROM doctors d LEFT JOIN doctors s ON d.supervisor_id = s.id;

-- LATERAL: a correlated subquery you can join to — "top N per group"
SELECT p.id, p.full_name, recent.slot, recent.status
FROM patients p
CROSS JOIN LATERAL (
    SELECT a.slot, a.status FROM appointments a
    WHERE a.patient_id = p.id ORDER BY a.slot DESC LIMIT 3
) recent;
```

**The `WHERE`-vs-`ON` trap on outer joins:**

```sql
-- This silently becomes an INNER JOIN — the WHERE filters out the NULL-extended rows
SELECT * FROM patients p LEFT JOIN appointments a ON a.patient_id = p.id
WHERE a.status = 'COMPLETED';

-- Correct: put the condition in the ON clause
SELECT * FROM patients p LEFT JOIN appointments a
  ON a.patient_id = p.id AND a.status = 'COMPLETED';
```

> **Asked as:** "INNER vs LEFT vs FULL OUTER." · "Find rows in A with no match in B." · "Why did my LEFT JOIN behave like an INNER JOIN?" · "What's a LATERAL join for?"

---

## 1.4 Aggregation, window functions, and CTEs

Logical execution order — worth memorising, because it explains most SQL errors:

```
FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT
```

That's why you can't reference a `SELECT` alias in `WHERE` (it doesn't exist yet) but can in `ORDER BY`. And why `WHERE` filters rows *before* grouping while `HAVING` filters groups *after*.

```sql
-- Window functions: aggregate WITHOUT collapsing rows
SELECT
    d.full_name,
    a.slot,
    a.fee_cents,
    SUM(a.fee_cents) OVER (PARTITION BY d.id ORDER BY a.slot
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total,
    ROW_NUMBER()  OVER (PARTITION BY d.id ORDER BY a.slot DESC) AS recency_rank,
    RANK()        OVER (ORDER BY a.fee_cents DESC)              AS fee_rank,      -- gaps on ties
    DENSE_RANK()  OVER (ORDER BY a.fee_cents DESC)              AS fee_dense,     -- no gaps
    LAG(a.slot)   OVER (PARTITION BY a.patient_id ORDER BY a.slot) AS previous_visit,
    a.slot - LAG(a.slot) OVER (PARTITION BY a.patient_id ORDER BY a.slot) AS gap
FROM appointments a JOIN doctors d ON d.id = a.doctor_id;

-- "Second highest salary" — the single most asked SQL question
SELECT DISTINCT salary FROM employees ORDER BY salary DESC OFFSET 1 LIMIT 1;
-- or, robust to ties and per-department:
SELECT * FROM (
  SELECT e.*, DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rk
  FROM employees e
) t WHERE rk = 2;

-- Deduplicate, keeping the newest row per key
DELETE FROM appointments a USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY doctor_id, slot ORDER BY created_at DESC) rn
  FROM appointments
) d WHERE a.id = d.id AND d.rn > 1;
```

**CTEs** for readability and recursion:

```sql
WITH monthly AS (
    SELECT date_trunc('month', slot) AS month, doctor_id, SUM(fee_cents) AS revenue
    FROM appointments WHERE status = 'COMPLETED' GROUP BY 1, 2
),
ranked AS (
    SELECT *, RANK() OVER (PARTITION BY month ORDER BY revenue DESC) AS rk FROM monthly
)
SELECT * FROM ranked WHERE rk <= 3 ORDER BY month, rk;

-- Recursive: an org chart / category tree
WITH RECURSIVE chain AS (
    SELECT id, full_name, supervisor_id, 1 AS depth FROM doctors WHERE supervisor_id IS NULL
  UNION ALL
    SELECT d.id, d.full_name, d.supervisor_id, c.depth + 1
    FROM doctors d JOIN chain c ON d.supervisor_id = c.id
)
SELECT * FROM chain ORDER BY depth;
```

Note: since PostgreSQL 12, CTEs are inlined by default (no longer an optimisation fence) unless you write `MATERIALIZED`.

> **Asked as:** "Write a query for the second-highest salary." · "`RANK` vs `DENSE_RANK` vs `ROW_NUMBER`." · "`WHERE` vs `HAVING`." · "Find and delete duplicate rows." · "Running total per group."

---

## 1.5 Upserts, batching, and set-based thinking

```sql
-- Upsert
INSERT INTO daily_stats (clinic_id, day, appointments, revenue_cents)
VALUES ($1, $2, $3, $4)
ON CONFLICT (clinic_id, day) DO UPDATE
SET appointments = daily_stats.appointments + EXCLUDED.appointments,
    revenue_cents = daily_stats.revenue_cents + EXCLUDED.revenue_cents;

-- Batch update from a VALUES list — one statement instead of 1000
UPDATE appointments a SET status = v.status
FROM (VALUES ('uuid-1','COMPLETED'), ('uuid-2','NO_SHOW')) AS v(id, status)
WHERE a.id = v.id::uuid;

-- Delete in chunks so you don't hold a lock for 10 minutes
DELETE FROM audit_log WHERE id IN (
  SELECT id FROM audit_log WHERE created_at < now() - interval '1 year' LIMIT 10000
);
```

**Set-based beats row-by-row** by orders of magnitude. Any time you find yourself looping in application code and issuing one statement per row, there is a single statement that does it.

**Queue pattern without a message broker:**

```sql
-- Claim a job atomically; other workers skip locked rows instead of blocking
UPDATE jobs SET status = 'RUNNING', claimed_at = now()
WHERE id = (
  SELECT id FROM jobs WHERE status = 'PENDING'
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
)
RETURNING *;
```

> **Asked as:** "How do you write an upsert?" · "How do you delete 50 million old rows safely?" · "Implement a job queue in SQL." · "What does `SKIP LOCKED` do?"

---

## 1.6 Modelling patterns you'll be asked to design

**Soft delete:**

```sql
ALTER TABLE patients ADD COLUMN deleted_at timestamptz;
CREATE UNIQUE INDEX patients_mrn_active ON patients (mrn) WHERE deleted_at IS NULL;
CREATE VIEW active_patients AS SELECT * FROM patients WHERE deleted_at IS NULL;
```

The partial unique index is the detail people miss: without it, you can't re-create a record with the same natural key after deleting one.

**Audit / history (temporal table):**

```sql
CREATE TABLE appointment_history (
    LIKE appointments INCLUDING ALL,
    valid_from timestamptz NOT NULL,
    valid_to   timestamptz,
    changed_by bigint,
    operation  text CHECK (operation IN ('INSERT','UPDATE','DELETE'))
);
```

**Multi-tenancy — three options:**

| Approach | Isolation | Ops cost | Fits |
|---|---|---|---|
| `tenant_id` column on every table | Weakest (a missing `WHERE` leaks) | Lowest | Most SaaS; add Row-Level Security as a backstop |
| Schema per tenant | Medium | Migration ×N | Tens–hundreds of tenants |
| Database per tenant | Strongest | Highest | Regulated/enterprise, few large tenants |

```sql
-- RLS makes the isolation a database guarantee, not a code convention
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointments
  USING (clinic_id = current_setting('app.clinic_id')::bigint);
```

**EAV (entity-attribute-value)** — avoid it. If you need flexible attributes, use a `jsonb` column with a GIN index; you keep types, constraints on the common fields, and query speed.

```sql
ALTER TABLE patients ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}';
CREATE INDEX patients_attrs_gin ON patients USING gin (attributes jsonb_path_ops);
SELECT * FROM patients WHERE attributes @> '{"blood_group": "O+"}';
```

> **Asked as:** "How do you design multi-tenancy?" · "Hard delete vs soft delete." · "How would you store user-defined fields?" · "Design the schema for [booking / e-commerce / chat]."

---

## 1.7 Rapid-fire answers

| Question | Answer |
|---|---|
| `DELETE` vs `TRUNCATE` vs `DROP` | Row-by-row + WAL + triggers / fast whole-table reset / removes the table |
| `UNION` vs `UNION ALL` | Deduplicates (sort cost) vs concatenates — use `ALL` unless you need dedup |
| `IN` vs `EXISTS` | Similar in modern planners; `EXISTS` short-circuits and handles NULLs correctly (`NOT IN` with a NULL returns no rows!) |
| Primary vs unique key | One per table, implies NOT NULL / many allowed, may be nullable |
| View vs materialised view | Stored query, always fresh / stored result, must be refreshed, can be indexed |
| Stored procedure | Logic in the DB — fast and transactional, but hard to version, test, and review. Use sparingly |
| `COALESCE` / `NULLIF` | First non-null / NULL when two values are equal (guards divide-by-zero) |
| `GROUP BY` rule | Every selected column must be aggregated or grouped (PG allows functionally-dependent PK shortcuts) |
| `CROSS JOIN` | Cartesian product — usually an accident, occasionally deliberate (generate a date series) |
| `generate_series` | Fill gaps in time-series reports: left-join your data onto a generated calendar |
