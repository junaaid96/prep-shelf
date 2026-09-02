# 1. Django Core — MVT, ORM, Migrations, Settings

**Current state (Sept 2026):** **Django 6.1** (Aug 2026) is the newest feature release; **5.2 LTS** (supported to April 2028) is the safe production target. Django 6.x supports Python 3.12–3.14, has first-class async views/ORM methods, background tasks, and a template partials system. `psycopg` 3 is the default PostgreSQL driver.

---

## 1.1 MVT and the request lifecycle

Django calls it **Model–View–Template**; the "controller" is the framework itself (URL resolver + view dispatch).

```
Request
  → WSGI/ASGI server (gunicorn / uvicorn)
  → Middleware (top-down: security, session, auth, CSRF, common)
  → URL resolver (urls.py)
  → View (function or class-based)
  → Model / ORM ↔ Database
  → Template rendering (or DRF serializer → JSON)
  → Middleware (bottom-up: response phase)
  → Response
```

Middleware order matters: `SecurityMiddleware` first, `SessionMiddleware` before `AuthenticationMiddleware` (auth reads the session), `CsrfViewMiddleware` before views. A custom middleware:

```python
import time, logging
logger = logging.getLogger(__name__)

class TimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response          # one-time config at startup

    def __call__(self, request):
        start = time.perf_counter()
        response = self.get_response(request)     # everything before this is "request phase"
        elapsed_ms = (time.perf_counter() - start) * 1000
        response["X-Response-Time-ms"] = f"{elapsed_ms:.1f}"
        if elapsed_ms > 500:
            logger.warning("slow request %s %s %.0fms", request.method, request.path, elapsed_ms)
        return response
```

> **Asked as:** "Explain the Django request/response cycle." · "How is MVT different from MVC?" · "Why does middleware order matter?" · "Write a middleware that logs slow requests."

---

## 1.2 Models: design that ages well

```python
from django.db import models
from django.core.validators import MinValueValidator

class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True                # no table — fields are copied into children

class Patient(TimeStampedModel):
    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    mrn = models.CharField("Medical record number", max_length=32, unique=True)
    full_name = models.CharField(max_length=200)
    gender = models.CharField(max_length=1, choices=Gender.choices)
    date_of_birth = models.DateField()

    class Meta:
        indexes = [models.Index(fields=["full_name"], name="patient_name_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(date_of_birth__lte=models.functions.Now()),
                name="dob_not_in_future",
            )
        ]

    def __str__(self): return f"{self.mrn} — {self.full_name}"

class Appointment(TimeStampedModel):
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="appointments")
    doctor  = models.ForeignKey("staff.Doctor", on_delete=models.PROTECT, related_name="appointments")
    slot    = models.DateTimeField()
    fee     = models.DecimalField(max_digits=10, decimal_places=2,
                                  validators=[MinValueValidator(0)])

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["doctor", "slot"], name="one_appt_per_doctor_slot"),
        ]
        ordering = ["-slot"]
```

Decisions that matter:

- **`on_delete`**: `CASCADE` (delete children), `PROTECT` (refuse — the right default for financial/clinical records), `SET_NULL`, `RESTRICT`, `DO_NOTHING`. Choosing `CASCADE` everywhere is how data disappears.
- **`DecimalField` for money**, never `FloatField`.
- **Database constraints over `clean()`** — `clean()` is only run by forms and `full_clean()`; a `UniqueConstraint` is enforced by the database no matter which code path writes.
- **`null` vs `blank`**: `null` is the database column; `blank` is form validation. For text, prefer `blank=True` with `null=False` (one representation of "empty").
- **`related_name`** makes reverse lookups readable: `patient.appointments.all()`.

> **Asked as:** "`null=True` vs `blank=True`." · "Explain `on_delete` options." · "Where should validation live — model, form, or database?" · "Abstract base class vs multi-table inheritance."

---

## 1.3 The ORM: querysets, laziness, and the N+1 problem

Querysets are **lazy** — nothing hits the database until you iterate, slice with a step, call `len()`, `list()`, `bool()`, or `repr()`.

```python
qs = Appointment.objects.filter(slot__date=today)     # no query yet
qs = qs.exclude(status="CANCELLED")                    # still no query
for appt in qs:                                        # ← query executes here, result cached on qs
    ...
```

**The N+1 problem** is the single most common Django performance bug:

```python
# ✗ 1 query for appointments + 1 per appointment for the patient = 1 + N
for a in Appointment.objects.all():
    print(a.patient.full_name)

# ✓ select_related → SQL JOIN, one query. For ForeignKey / OneToOne (forward, to-one)
for a in Appointment.objects.select_related("patient", "doctor"):
    print(a.patient.full_name)

# ✓ prefetch_related → a second query + Python-side join. For ManyToMany / reverse FK (to-many)
for p in Patient.objects.prefetch_related("appointments"):
    print(len(p.appointments.all()))

# Prefetch with a filtered, ordered inner queryset
from django.db.models import Prefetch
Patient.objects.prefetch_related(
    Prefetch("appointments",
             queryset=Appointment.objects.filter(slot__gte=now()).select_related("doctor"),
             to_attr="upcoming")
)
```

**Aggregation and annotation:**

```python
from django.db.models import Count, Sum, Avg, F, Q, Value, Case, When, DecimalField
from django.db.models.functions import Coalesce, TruncMonth

# annotate = per-row; aggregate = whole-queryset (returns a dict)
doctors = (Doctor.objects
           .annotate(
               appt_count=Count("appointments", filter=Q(appointments__status="COMPLETED")),
               revenue=Coalesce(Sum("appointments__fee"), Value(0), output_field=DecimalField()),
           )
           .filter(appt_count__gt=0)
           .order_by("-revenue"))

monthly = (Appointment.objects
           .annotate(month=TruncMonth("slot"))
           .values("month")
           .annotate(total=Sum("fee"), n=Count("id"))
           .order_by("month"))

# F() → arithmetic in the database, atomic, no read-modify-write race
Appointment.objects.filter(pk=pk).update(fee=F("fee") * Decimal("1.05"))
```

**Beware double-counting**: two `Count()` annotations across different joins multiply rows. Use `distinct=True` or split into subqueries.

**Bulk operations** for throughput:

```python
Appointment.objects.bulk_create(objs, batch_size=1000)
Appointment.objects.bulk_update(objs, ["status"], batch_size=1000)
Appointment.objects.filter(slot__lt=cutoff).update(status="EXPIRED")   # one UPDATE, no signals
qs.iterator(chunk_size=2000)     # server-side cursor — constant memory over millions of rows
qs.only("id", "slot")            # SELECT fewer columns
qs.defer("notes")                # exclude a big text column
qs.values_list("id", flat=True)  # skip model instantiation entirely
```

Note `update()` / `bulk_*` skip `save()`, signals, and `auto_now`. That's the point (speed), and the trap.

**Always read the SQL when in doubt:**

```python
print(qs.query)                                    # the SQL Django will send
from django.db import connection; connection.queries   # with DEBUG=True
# Or install django-debug-toolbar / django-silk and look at the query count per page
```

> **Asked as:** "What is the N+1 problem and how do you fix it?" · "`select_related` vs `prefetch_related`." · "When does a queryset actually hit the DB?" · "What does `F()` do and why is it safer?" · "`annotate` vs `aggregate`."

---

## 1.4 Transactions and concurrency

```python
from django.db import transaction

@transaction.atomic
def book_appointment(patient_id, doctor_id, slot):
    doctor = Doctor.objects.select_for_update().get(pk=doctor_id)   # row lock until commit
    if Appointment.objects.filter(doctor=doctor, slot=slot).exists():
        raise SlotTaken(slot)
    appt = Appointment.objects.create(patient_id=patient_id, doctor=doctor, slot=slot)

    # Only fire side effects AFTER the transaction commits
    transaction.on_commit(lambda: send_confirmation.delay(appt.id))
    return appt
```

- `@transaction.atomic` wraps in a transaction; nested `atomic` blocks become savepoints.
- `select_for_update()` takes `FOR UPDATE` row locks — must be inside a transaction, and doesn't work with `null=True` outer joins. Add `nowait=True` or `skip_locked=True` for queue-style workloads.
- **`transaction.on_commit`** is essential: dispatching a Celery task inside a transaction means the worker can read the row *before* it's committed and fail with "does not exist".
- `ATOMIC_REQUESTS = True` wraps every request in a transaction — simple, but holds locks for the whole request. Prefer explicit `atomic` around the write.

Idempotency for double-clicked submits: a `UniqueConstraint` on a client-supplied idempotency key, plus `get_or_create` — and remember `get_or_create` still races without a unique constraint backing it.

> **Asked as:** "How do you prevent double booking?" · "What does `select_for_update` do?" · "Why use `on_commit` for Celery tasks?" · "Is `get_or_create` atomic?"

---

## 1.5 Migrations in a real team

```bash
python manage.py makemigrations app -n add_appointment_status
python manage.py sqlmigrate app 0007        # SEE THE SQL before you trust it
python manage.py migrate --plan
python manage.py migrate app 0006           # roll back to a previous migration
```

Rules for zero-downtime deploys (old and new code run simultaneously):

1. **Add columns as nullable or with a default, never `NOT NULL` without a default** on a big table.
2. **Never rename or drop a column in the same release that stops using it.** Do it in two: (a) deploy code that no longer reads it, (b) drop it later.
3. **Backfill in batches** with a `RunPython` data migration (and a reverse function), not one giant UPDATE that locks the table.
4. Use `AddIndexConcurrently` (PostgreSQL) so index creation doesn't lock writes.
5. Squash migrations occasionally (`squashmigrations`) — hundreds of files slow down every test run.

```python
# 0008_backfill_status.py
from django.db import migrations

def forwards(apps, schema_editor):
    Appointment = apps.get_model("clinic", "Appointment")   # historical model — NEVER import the real one
    qs = Appointment.objects.filter(status="")
    for chunk_start in range(0, qs.count(), 5000):
        ids = list(qs.values_list("id", flat=True)[:5000])
        Appointment.objects.filter(id__in=ids).update(status="SCHEDULED")

def backwards(apps, schema_editor):
    pass

class Migration(migrations.Migration):
    dependencies = [("clinic", "0007_add_appointment_status")]
    atomic = False                      # long backfills shouldn't hold one transaction
    operations = [migrations.RunPython(forwards, backwards)]
```

**Merge conflicts in migrations**: two branches each adding `0008_` → `python manage.py makemigrations --merge`.

> **Asked as:** "How do you add a non-null column to a 50-million-row table with no downtime?" · "Why `apps.get_model` in a data migration?" · "How do you resolve conflicting migrations?"

---

## 1.6 Settings, apps, and project layout

```
project/
├── config/
│   ├── settings/
│   │   ├── base.py        # everything shared
│   │   ├── dev.py         # from .base import *  ; DEBUG = True
│   │   ├── prod.py        # DEBUG = False, real cache, real email backend
│   │   └── test.py
│   ├── urls.py
│   ├── asgi.py / wsgi.py
├── apps/
│   ├── clinic/            # models, selectors, services, api, migrations, tests
│   └── billing/
└── manage.py
```

```python
# base.py — never hardcode secrets
import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]              # crash at boot if missing
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "").split(",")

DATABASES = {"default": {
    **dj_database_url.parse(os.environ["DATABASE_URL"]),
    "CONN_MAX_AGE": 60,               # persistent connections
    "CONN_HEALTH_CHECKS": True,
    "OPTIONS": {"pool": True},        # psycopg3 connection pooling (Django 5.1+)
}}
```

**Fat models / thin views**, plus a **service layer** once logic spans models:

```python
# apps/clinic/services.py — orchestration, transactions, side effects
# apps/clinic/selectors.py — read queries returning querysets
# apps/clinic/models.py — data + invariants + small model-local behaviour
```

This keeps views to "parse input → call a service → render", which is what makes the code testable.

> **Asked as:** "How do you structure a large Django project?" · "Where does business logic go?" · "How do you manage settings across environments?"

---

## 1.7 Signals — use sparingly

```python
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=Appointment, dispatch_uid="appt_audit")
def audit_appointment(sender, instance, created, **kwargs):
    AuditLog.objects.create(entity="appointment", entity_id=instance.pk,
                            action="created" if created else "updated")
```

Signals decouple, but they also make control flow invisible and are skipped by `bulk_create`/`update()`. Reasonable uses: audit logs, cache invalidation, third-party app integration. Unreasonable: core business rules (put those in a service function you can read and test).

`dispatch_uid` prevents double registration when a module is imported twice.

> **Asked as:** "When would you use a signal, and when would you not?" · "Why didn't my signal fire on `bulk_create`?"

---

## 1.8 Rapid-fire answers

| Question | Answer |
|---|---|
| `get()` vs `filter()` | Returns an instance or raises `DoesNotExist`/`MultipleObjectsReturned` vs returns a queryset |
| `first()` vs `[0]` | `first()` returns `None` when empty; `[0]` raises `IndexError` |
| Queryset caching | Iterating caches results on the queryset; re-filtering creates a new one and re-queries |
| `Q` objects | Complex `OR`/`NOT` filters: `filter(Q(a=1) \| ~Q(b=2))` |
| `values()` vs `values_list()` | Dicts vs tuples; both skip model instantiation |
| Custom manager | `objects = ActiveManager()` to apply a default filter; keep a plain manager too |
| `exists()` vs `count()` | `exists()` is `SELECT 1 … LIMIT 1` — always cheaper for a boolean check |
| `db_index` vs `Meta.indexes` | Single-column shorthand vs composite/partial/expression indexes |
| CBV vs FBV | CBVs give mixins and less boilerplate for CRUD; FBVs are clearer for one-off logic |
| Django admin in prod | Fine for internal staff — restrict with permissions, put it behind a non-obvious URL and 2FA |
