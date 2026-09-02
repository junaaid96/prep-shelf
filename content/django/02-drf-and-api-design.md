# 2. Django REST Framework & API Design

DRF is still the default way to build APIs on Django. Django Ninja (Pydantic + async + auto OpenAPI) is the fast-growing alternative and is worth knowing by name in interviews.

---

## 2.1 The DRF request pipeline

```
Request
 → URL router (DefaultRouter / path)
 → APIView.dispatch
 → Authentication classes  (who are you?)      → request.user
 → Permission classes      (may you?)          → 403 / 401
 → Throttle classes        (how often?)        → 429
 → Content negotiation + parsers               → request.data
 → View method (get/post/...) or ViewSet action
 → Serializer: validate → save  /  instance → representation
 → Renderer (JSON)
 → Response
```

Knowing this order answers most "why is my permission not applying?" questions — object-level permissions run in `get_object()`, not on `list`.

---

## 2.2 Serializers: validation is the security boundary

```python
from rest_framework import serializers
from django.utils import timezone

class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    doctor = serializers.PrimaryKeyRelatedField(queryset=Doctor.objects.filter(is_active=True))

    class Meta:
        model = Appointment
        fields = ["id", "patient", "patient_name", "doctor", "slot", "fee", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

    # Field-level validation
    def validate_slot(self, value):
        if value < timezone.now():
            raise serializers.ValidationError("Slot must be in the future.")
        return value

    # Object-level validation — runs after all field validators
    def validate(self, attrs):
        doctor, slot = attrs["doctor"], attrs["slot"]
        qs = Appointment.objects.filter(doctor=doctor, slot=slot)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)          # don't collide with yourself on update
        if qs.exists():
            raise serializers.ValidationError({"slot": "Doctor already booked at this time."})
        return attrs

    def create(self, validated_data):
        return Appointment.objects.create(
            **validated_data, created_by=self.context["request"].user
        )
```

Key points:

- **Never trust the client.** `read_only_fields` is what stops a user POSTing `{"status": "PAID"}` or `{"user": 1}` — mass assignment is the #1 DRF vulnerability.
- `validate_<field>` runs per field; `validate()` runs once with all fields — use it for cross-field rules.
- `source=` maps a model path to an API field name; `SerializerMethodField` for computed read-only values (but watch out: it's a common N+1 source).
- Serializer validation is **not** a replacement for database constraints — two concurrent requests both pass `validate()` then both insert. Keep the `UniqueConstraint`.

**Nested writes** are a common trap. `ModelSerializer` won't write nested objects by default; either override `create()`/`update()` explicitly or (better) use separate write serializers.

```python
class AppointmentWriteSerializer(serializers.ModelSerializer): ...
class AppointmentReadSerializer(serializers.ModelSerializer): ...

class AppointmentViewSet(viewsets.ModelViewSet):
    def get_serializer_class(self):
        return AppointmentWriteSerializer if self.action in ("create", "update", "partial_update") \
               else AppointmentReadSerializer
```

> **Asked as:** "How do you prevent a client from setting a field it shouldn't?" · "`validate_x` vs `validate`." · "How do you handle nested writes?" · "Serializer vs ModelSerializer."

---

## 2.3 Views, ViewSets, and query optimisation

```python
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentReadSerializer
    permission_classes = [IsAuthenticated, IsClinicStaff]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]
    filterset_fields = {"status": ["exact"], "slot": ["gte", "lte"]}
    search_fields = ["patient__full_name", "patient__mrn"]
    ordering_fields = ["slot", "created_at"]
    ordering = ["-slot"]

    def get_queryset(self):
        # Tenant scoping in ONE place — every action inherits it
        return (Appointment.objects
                .filter(clinic=self.request.user.clinic)          # ← multi-tenant isolation
                .select_related("patient", "doctor")               # ← kills the N+1
                .order_by("-slot"))

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        appt = self.get_object()                                   # runs object permissions
        try:
            services.cancel_appointment(appt, by=request.user, reason=request.data.get("reason"))
        except CancellationWindowClosed as e:
            return Response({"detail": str(e)}, status=status.HTTP_409_CONFLICT)
        return Response(self.get_serializer(appt).data)
```

The single highest-value habit: **`select_related`/`prefetch_related` in `get_queryset`**, and a test that asserts the query count.

```python
def test_list_is_constant_query_count(client, django_assert_num_queries):
    AppointmentFactory.create_batch(25)
    with django_assert_num_queries(4):          # fails loudly if someone reintroduces an N+1
        client.get("/api/appointments/")
```

**Pagination** — always paginate list endpoints:

```python
REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.CursorPagination",
    "PAGE_SIZE": 50,
}
```

`PageNumberPagination` is friendly but `OFFSET 100000` gets slow and can skip/duplicate rows when data changes mid-scroll. **`CursorPagination`** (ordered by an indexed, immutable field) is stable and O(1) — use it for large or fast-moving datasets.

> **Asked as:** "How do you avoid N+1 in a DRF list endpoint?" · "Offset vs cursor pagination." · "Where do you enforce multi-tenancy?" · "APIView vs generics vs ViewSet."

---

## 2.4 Authentication, permissions, throttling

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",   # for the browsable API/admin
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],  # deny by default
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {"login": "5/min", "burst": "60/min", "sustained": "1000/day"},
}

class IsOwnerOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):            # view-level: runs on every request
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):  # object-level: only via get_object()
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.created_by_id == request.user.id
```

**Critical detail:** `has_object_permission` is **not** called for `list` — a list view that doesn't filter by owner leaks every row. Filter in `get_queryset()`; permissions are the second line of defence, not the first.

**JWT vs session:**

| | Session cookie | JWT |
|---|---|---|
| Storage | Server-side session + `HttpOnly` cookie | Signed token, stateless |
| Revocation | Immediate (delete the session) | Hard — needs a short TTL + refresh rotation + a denylist |
| Scaling | Needs shared session store (Redis) | No shared state |
| XSS exposure | Cookie is `HttpOnly` → safe from JS | Unsafe in `localStorage` |

For a first-party web app, **sessions are usually the better and safer choice**. Use JWT for mobile clients, service-to-service, or genuinely stateless multi-service setups — with a 5–15 minute access token, rotating refresh tokens, and refresh-token reuse detection.

> **Asked as:** "JWT vs session — which and why?" · "How do you revoke a JWT?" · "Why didn't my object permission run on the list endpoint?" · "How do you rate-limit login attempts?"

---

## 2.5 REST design principles that come up in interviews

```
GET    /api/v1/patients                 # list, filterable, paginated
POST   /api/v1/patients                 # create → 201 + Location header
GET    /api/v1/patients/{id}            # retrieve → 200 / 404
PATCH  /api/v1/patients/{id}            # partial update (PUT = full replacement)
DELETE /api/v1/patients/{id}            # → 204
GET    /api/v1/patients/{id}/appointments
POST   /api/v1/appointments/{id}/cancel # an action that isn't CRUD — a verb is fine here
```

- **Nouns, plural, lowercase, hyphenated.** Nesting one level deep is plenty.
- **Status codes carry meaning:** 200 OK, 201 Created, 204 No Content, 400 validation, 401 unauthenticated, 403 unauthorised, 404 not found, 409 conflict, 422 semantic error, 429 rate limited, 500 server error. Returning 200 with `{"error": ...}` defeats every client library and monitoring tool.
- **Idempotency**: GET/PUT/DELETE are idempotent; POST is not. For payments, accept an `Idempotency-Key` header and store the result against it.
- **Versioning**: URL path (`/api/v1/`) is the most operable; header versioning is purer but harder to debug and cache.
- **Consistent error shape** — pick one and never deviate:

```python
# RFC 9457 problem details
{
  "type": "https://api.example.com/errors/slot-taken",
  "title": "Slot already booked",
  "status": 409,
  "detail": "Dr. Rahman is booked at 2026-09-05T10:00Z",
  "instance": "/api/v1/appointments",
  "errors": {"slot": ["Doctor already booked at this time."]}
}
```

```python
from rest_framework.views import exception_handler

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            "title": response.status_text,
            "status": response.status_code,
            "detail": response.data.get("detail") if isinstance(response.data, dict) else None,
            "errors": response.data if isinstance(response.data, dict) else {"non_field": response.data},
            "trace_id": context["request"].headers.get("X-Request-ID"),
        }
    return response
```

**Documentation**: `drf-spectacular` generates OpenAPI 3 from your serializers and views. Wire it into CI so the schema can't drift from the code.

> **Asked as:** "PUT vs PATCH vs POST." · "Which status code for X?" · "How do you version an API?" · "What makes an endpoint idempotent?" · "How do you design an error response?"

---

## 2.6 Caching and conditional requests

```python
from django.core.cache import cache
from rest_framework.response import Response

def get(self, request, *a, **kw):
    key = f"dash:{request.user.clinic_id}:{request.GET.get('range', '30d')}"
    data = cache.get(key)
    if data is None:
        data = expensive_dashboard_query(request.user.clinic_id)
        cache.set(key, data, timeout=300)          # 5 minutes
    return Response(data)
```

- **Cache keys must include every input** that changes the result — user/tenant, filters, locale, page. A missing tenant id in the key is a data-leak bug, not just a caching bug.
- **Invalidate on write** (`transaction.on_commit(lambda: cache.delete_pattern(...))`) or use short TTLs. Cache versioning (`cache.set(key, v, version=n)`) beats trying to enumerate every key.
- **ETag / Last-Modified** let clients skip the payload entirely:

```python
from django.utils.http import quote_etag
response["ETag"] = quote_etag(str(obj.updated_at.timestamp()))
# DRF/Django return 304 automatically when If-None-Match matches
```

- Redis is the standard backend (`django-redis`). Use `cache.get_or_set` to avoid a thundering herd, or a short lock for genuinely expensive recomputes.

> **Asked as:** "How would you cache this endpoint?" · "What goes in a cache key?" · "How do you invalidate?" · "What is a thundering herd / cache stampede?"

---

## 2.7 Testing a DRF API

```python
import pytest
from rest_framework.test import APIClient

@pytest.fixture
def staff_client(db, clinic):
    user = UserFactory(clinic=clinic, role="STAFF")
    c = APIClient(); c.force_authenticate(user)
    return c

def test_cannot_book_taken_slot(staff_client, doctor, patient):
    slot = timezone.now() + timedelta(days=1)
    AppointmentFactory(doctor=doctor, slot=slot)

    res = staff_client.post("/api/v1/appointments/", {
        "patient": patient.id, "doctor": doctor.id, "slot": slot.isoformat(), "fee": "500.00",
    }, format="json")

    assert res.status_code == 400
    assert "slot" in res.data["errors"]

def test_other_clinic_cannot_read(other_clinic_client, appointment):
    assert other_clinic_client.get(f"/api/v1/appointments/{appointment.id}/").status_code == 404
```

Test the things that break in production: **authorisation boundaries** (a user from another tenant gets 404, not 403 — don't leak existence), **validation edges**, **query counts**, and **status codes**. Use `factory_boy` for data, `pytest-django` for fixtures, and `freezegun` for time.

> **Asked as:** "How do you test permissions?" · "Should a forbidden resource return 403 or 404?" · "How do you test that an endpoint doesn't regress into an N+1?"

---

## 2.8 Rapid-fire answers

| Question | Answer |
|---|---|
| DRF vs Django Ninja | DRF: mature, batteries, browsable API. Ninja: Pydantic types, async-native, faster, auto OpenAPI |
| `ModelViewSet` actions | list, create, retrieve, update, partial_update, destroy |
| Router | `DefaultRouter().register()` generates the URL conf and the API root |
| `SerializerMethodField` | Read-only computed field — pre-fetch its data or it becomes an N+1 |
| `many=True` | Wraps in `ListSerializer`; override `create()` there for bulk |
| Content negotiation | Renderer chosen by `Accept`; turn off `BrowsableAPIRenderer` in production |
| File upload | `MultiPartParser` + `FileField`; validate content type and size, store on S3, never trust the filename |
| Async DRF | DRF views are sync; use Django Ninja, ADRF, or plain async Django views for async endpoints |
| API keys for services | Hash them at rest, scope them, rotate them, and rate-limit per key |
| GraphQL on Django | Strawberry/Graphene — solves over-fetching, adds N+1 risk (needs DataLoader) and caching complexity |
