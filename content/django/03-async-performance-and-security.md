# 3. Django Async, Celery, Performance & Security Hardening

---

## 3.1 Async Django: what's real in 6.x

Django has async views, async middleware, async ORM methods (`aget`, `acreate`, `afilter` via `async for`), async signals, and an async-capable ORM connection layer. What it does **not** have is a fully async database driver path for every backend — so async is a win for I/O fan-out (calling several external APIs), not automatically for database-heavy views.

```python
# views.py
import asyncio, httpx
from django.http import JsonResponse

async def patient_dashboard(request, patient_id):
    # Concurrent I/O — three round trips in the time of the slowest one
    async with httpx.AsyncClient(timeout=5.0) as client:
        patient_task = Patient.objects.select_related("clinic").aget(pk=patient_id)
        labs_task    = client.get(f"{LAB_API}/results/{patient_id}")
        pharm_task   = client.get(f"{PHARMACY_API}/prescriptions/{patient_id}")
        patient, labs, pharm = await asyncio.gather(patient_task, labs_task, pharm_task)

    appointments = [a async for a in patient.appointments.filter(slot__gte=now())]
    return JsonResponse({"patient": patient.full_name, "labs": labs.json(),
                         "prescriptions": pharm.json(), "upcoming": len(appointments)})
```

Rules:

- Serve with **ASGI** (`uvicorn`/`daphne` or `gunicorn -k uvicorn.workers.UvicornWorker`) — under WSGI, an async view is run in a thread and you gain nothing.
- **Never call sync ORM code from an async view** — Django raises `SynchronousOnlyOperation`. Bridge with `sync_to_async(fn, thread_sensitive=True)`; go the other way with `async_to_sync`.
- Mixing sync and async middleware forces adapter wrapping at each boundary; keep a chain consistent.
- Async is not a substitute for fixing an N+1 or adding an index.

**Django 6.0+ background tasks** give a built-in, lightweight task interface (with pluggable backends) for jobs that don't justify Celery:

```python
from django.tasks import task

@task
def send_appointment_reminder(appointment_id: int) -> None:
    ...

send_appointment_reminder.enqueue(appt.id)
```

> **Asked as:** "Is Django async ready?" · "What is `SynchronousOnlyOperation`?" · "When does async actually help a Django app?" · "WSGI vs ASGI."

---

## 3.2 Celery: the production pattern

```python
# celery.py
app = Celery("clinic")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# settings
CELERY_BROKER_URL = os.environ["REDIS_URL"]
CELERY_RESULT_BACKEND = os.environ["REDIS_URL"]
CELERY_TASK_ACKS_LATE = True             # re-deliver if the worker dies mid-task
CELERY_WORKER_PREFETCH_MULTIPLIER = 1    # fair dispatch for long tasks
CELERY_TASK_TIME_LIMIT = 300             # hard kill
CELERY_TASK_SOFT_TIME_LIMIT = 240        # raises SoftTimeLimitExceeded so you can clean up
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_ROUTES = {"billing.tasks.*": {"queue": "billing"}}
```

```python
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

@shared_task(
    bind=True,
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True, retry_backoff_max=600, retry_jitter=True,
    max_retries=5,
    acks_late=True,
)
def send_invoice_email(self, invoice_id: int) -> None:
    invoice = Invoice.objects.select_related("patient").get(pk=invoice_id)
    if invoice.email_sent_at:            # IDEMPOTENT — the task may run twice
        return
    try:
        mailer.send(invoice.patient.email, render_invoice(invoice))
    except SoftTimeLimitExceeded:
        logger.warning("invoice %s email timed out", invoice_id)
        raise
    Invoice.objects.filter(pk=invoice_id, email_sent_at__isnull=True).update(email_sent_at=now())
```

Non-negotiables:

1. **Pass IDs, never model instances.** Objects are pickled and go stale; an ID is always fresh.
2. **Tasks must be idempotent** — `acks_late` plus retries means at-least-once delivery.
3. **Enqueue with `transaction.on_commit`**, or the worker will race the commit and get `DoesNotExist`.
4. **Separate queues by SLA** — a 20-minute report must not sit behind an OTP SMS. Run dedicated workers per queue.
5. **Set time limits**, or one stuck task holds a worker slot forever.
6. **Monitor** with Flower or Prometheus: queue depth, task latency, failure rate. Rising queue depth is your early warning.
7. **Celery Beat** for schedules (`django-celery-beat` to manage them in the DB), with a single beat process.

Alternatives worth naming: **RQ** (simpler, Redis-only), **Dramatiq**, **arq** (async), and Django's built-in tasks for light work.

> **Asked as:** "Why pass an ID instead of the object?" · "How do you make a task idempotent?" · "What does `acks_late` do?" · "How do you stop long tasks starving short ones?"

---

## 3.3 Performance playbook

**Find it before you fix it.** `django-debug-toolbar` (dev), `django-silk` or Sentry/OpenTelemetry traces (prod), plus `pg_stat_statements` on the database.

Ordered by typical payoff:

1. **N+1 queries** → `select_related` / `prefetch_related`. Assert query counts in tests.
2. **Missing indexes** → check `EXPLAIN ANALYZE` for Seq Scan on large tables; index foreign keys used in filters and any column in a `WHERE`/`ORDER BY` of a hot query.
3. **Over-fetching** → `only()`, `defer()`, `values()`, and don't serialise fields nobody reads.
4. **Pagination** → cursor pagination for big tables; never `LIMIT/OFFSET` deep into millions of rows.
5. **Caching** → per-view, per-fragment, or per-query; Redis; `cache.get_or_set`.
6. **Connection handling** → `CONN_MAX_AGE`, psycopg3 pooling, or PgBouncer in transaction mode (then set `DISABLE_SERVER_SIDE_CURSORS = True`).
7. **Move work off the request** → Celery for email, PDFs, reports, third-party calls.
8. **Static/media** → WhiteNoise or a CDN; never serve media through Django in production.

```python
# A real before/after
# Before: 1 + 200 + 200 queries, 2.4s
appointments = Appointment.objects.filter(slot__date=today)

# After: 2 queries, 40ms
appointments = (Appointment.objects
    .filter(slot__date=today)
    .select_related("patient", "doctor")
    .prefetch_related(Prefetch("tests", queryset=LabTest.objects.only("id", "name", "appointment_id")))
    .only("id", "slot", "fee", "status",
          "patient__full_name", "patient__mrn", "doctor__full_name"))
```

**Database index example:**

```python
class Meta:
    indexes = [
        models.Index(fields=["clinic", "-slot"], name="appt_clinic_slot_idx"),      # composite, matches the hot query
        models.Index(fields=["status"], condition=models.Q(status="PENDING"),
                     name="appt_pending_idx"),                                       # partial index
    ]
```

Composite index column order matters: it serves `WHERE clinic = ?` and `WHERE clinic = ? ORDER BY slot`, but **not** `WHERE slot = ?` alone.

> **Asked as:** "This endpoint takes 4 seconds — walk me through fixing it." · "How do you decide what to index?" · "How would you cache a dashboard?"

---

## 3.4 Security checklist for a Django deployment

```python
# prod.py
DEBUG = False                                    # #1 cause of Django data leaks
ALLOWED_HOSTS = ["clinic.example.com"]
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]     # rotate on compromise

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")   # behind a load balancer

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = ["https://clinic.example.com"]

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
```

Run `python manage.py check --deploy` in CI — it flags most of the above.

**Django's built-in protections, and how people defeat them:**

| Attack | Django's defence | How it gets broken |
|---|---|---|
| SQL injection | Parameterised ORM queries | `.raw()`/`extra()` with f-strings, `RawSQL` |
| XSS | Template auto-escaping | `\|safe`, `mark_safe`, `{% autoescape off %}`, `innerHTML` in your JS |
| CSRF | `CsrfViewMiddleware` + token | `@csrf_exempt`, missing `CSRF_TRUSTED_ORIGINS` |
| Clickjacking | `X_FRAME_OPTIONS` | Removing the middleware |
| Host header injection | `ALLOWED_HOSTS` | `["*"]` |
| Password storage | PBKDF2/Argon2 hashing | Custom "encryption", or writing your own auth |

```python
# ✗ SQL injection
User.objects.raw(f"SELECT * FROM users WHERE email = '{email}'")
# ✓ parameterised
User.objects.raw("SELECT * FROM users WHERE email = %s", [email])
with connection.cursor() as c:
    c.execute("SELECT id FROM users WHERE email = %s", [email])
```

**Additional hardening for a real product:**

- **Authorisation on every query**, not just the view — scope by tenant in `get_queryset()`.
- **Rate-limit** login, password reset, OTP, and any expensive endpoint (`django-axes`, DRF throttles, or at the edge).
- **Argon2** password hashing (`PASSWORD_HASHERS`), plus `django-axes` for lockout.
- **Secrets** from environment/Vault/AWS Secrets Manager — never in `settings.py` or git. Rotate `SECRET_KEY` and DB credentials on staff turnover.
- **File uploads**: validate MIME and extension, cap size, store outside the web root (S3), serve via signed URLs, never execute.
- **Dependency scanning**: `pip-audit` / Dependabot in CI. `pip install --require-hashes` with a locked file.
- **Audit logging** for access to sensitive records (in healthcare, this is a compliance requirement, not a nice-to-have) — who read which patient, when.
- **PII/PHI**: encrypt at rest, restrict which columns land in logs, and scrub request bodies in Sentry.

> **Asked as:** "How does Django prevent SQL injection and how could you still get it?" · "What does `DEBUG=True` leak?" · "How do you protect a login endpoint?" · "How do you handle secrets?"

---

## 3.5 Deployment shape

```dockerfile
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
RUN python manage.py collectstatic --noinput
RUN adduser --disabled-password --no-create-home app && chown -R app /app
USER app
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "2", \
     "--timeout", "60", "--graceful-timeout", "30", "--access-logfile", "-"]
```

- **Workers**: start at `2 × CPU + 1` for sync workers; measure. Use `gevent`/threads for I/O-bound apps, or ASGI + uvicorn workers for async.
- **Migrations run as a separate job/init container**, not in the app's entrypoint — otherwise N replicas race each other.
- **Health checks**: a `/healthz` that returns 200 without touching the DB (liveness) and a `/readyz` that checks DB + cache (readiness).
- **Graceful shutdown**: gunicorn handles `SIGTERM`; make sure `terminationGracePeriodSeconds` exceeds your longest request.
- **Logs to stdout as JSON**, correlated with a request id; ship to your log platform.
- **Static** via WhiteNoise (small apps) or S3+CloudFront (real traffic).

> **Asked as:** "How do you deploy Django?" · "Where do migrations run in a rolling deploy?" · "How many gunicorn workers and why?" · "What goes in a health check?"

---

## 3.6 Rapid-fire answers

| Question | Answer |
|---|---|
| WSGI vs ASGI | Sync request/response vs async + WebSockets/long-lived connections |
| Channels | Adds WebSockets, chat, notifications; needs a channel layer (Redis) |
| `sync_to_async` | Runs sync code in a thread executor; `thread_sensitive=True` keeps DB connections consistent |
| Celery broker vs backend | Broker delivers tasks (Redis/RabbitMQ); backend stores results (often unnecessary — skip it if you don't read results) |
| Chain / group / chord | Sequential / parallel / parallel-then-callback task workflows |
| Cache backends | Redis (default choice), LocMem (dev only — per-process), database, file |
| `select_for_update` under PgBouncer | Needs transaction pooling awareness; session-level features break in transaction mode |
| Zero-downtime deploy | Backward-compatible migrations, rolling replicas, readiness probes, no long locks |
| Feature flags | `django-waffle` — decouple deploy from release |
| Observability | OpenTelemetry traces + Prometheus metrics + structured logs with a shared trace id |
