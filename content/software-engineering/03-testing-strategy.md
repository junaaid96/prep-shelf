# 3. Testing Strategy

---

## 3.1 The shape of a test suite

The classic pyramid still holds, but the modern version emphasises **integration tests with real dependencies** (Testcontainers made them fast enough) over heavily-mocked unit tests.

```
        ╱ E2E ╲            few — critical user journeys, slow, brittle, highest confidence
      ╱─────────╲
    ╱ Integration ╲        many — real DB/broker via Testcontainers; where most bugs are caught
  ╱─────────────────╲
╱   Unit / component  ╲    most — pure logic, fast, run on every save
```

**Trophy vs pyramid:** for web apps, the "testing trophy" (a fat integration layer) reflects reality better — most bugs live in the wiring between units, not inside them.

**What each layer is for:**

| Layer | Verifies | Speed | Mock what? |
|---|---|---|---|
| Unit | One function/class's logic and edge cases | ms | Everything external |
| Integration | Your code + real DB/queue/HTTP | 100s of ms | Only third-party services |
| Contract | Two services still agree on the API | fast | N/A |
| E2E | The whole system through the UI/API | seconds | Nothing |
| Load | Behaviour under expected+ traffic | minutes | Nothing |

> **Asked as:** "Describe your testing strategy." · "How many unit vs integration tests?" · "What do you E2E test?"

---

## 3.2 What makes a good test

**FIRST**: **F**ast, **I**ndependent, **R**epeatable, **S**elf-validating, **T**imely.

```python
def test_cancelling_after_the_window_is_rejected():
    # Arrange — explicit, minimal, obviously correct setup
    appointment = AppointmentFactory(slot=now() + timedelta(hours=2))   # window is 24h
    user = appointment.patient

    # Act — exactly one action
    with pytest.raises(CancellationWindowClosed) as exc:
        cancel_appointment(appointment, by=user)

    # Assert — on observable behaviour
    assert appointment.status == Status.SCHEDULED
    assert exc.value.appointment_id == appointment.id
```

Principles:

- **Test behaviour, not implementation.** A test that breaks when you rename a private method is a liability, not a safety net.
- **One logical assertion per test** (several `assert` lines about the same outcome is fine).
- **Descriptive names.** `test_cancelling_after_the_window_is_rejected` beats `test_cancel_2` — when it fails in CI, the name should tell you what broke.
- **No logic in tests.** No loops, no conditionals — a test with an `if` needs its own tests.
- **Independent and order-agnostic.** Shared mutable fixtures cause the "passes alone, fails in the suite" nightmare.
- **Deterministic.** Freeze time (`freezegun`, `Clock` injection), seed randomness, never `sleep` — poll with a timeout instead.

**The three failure modes of a test suite:** it's slow (so nobody runs it), it's flaky (so nobody trusts it), or it's coupled to implementation (so nobody dares refactor). Each one silently converts your tests from an asset into a tax.

> **Asked as:** "What makes a good unit test?" · "How do you test time-dependent code?" · "Why is testing private methods a bad idea?"

---

## 3.3 Test doubles — and mocking less

| Double | Behaviour |
|---|---|
| **Dummy** | Passed but never used (fills a parameter) |
| **Stub** | Returns canned answers |
| **Spy** | A stub that records how it was called |
| **Mock** | Pre-programmed with expectations; fails if they aren't met |
| **Fake** | A working lightweight implementation (in-memory repository, SQLite) |

**Prefer fakes over mocks.** A mock asserts *how* your code calls a collaborator — which is implementation detail. A fake lets you assert on the *result*, which is behaviour.

```python
# ✗ Coupled to the call sequence — refactoring the repository breaks this test
def test_book(mocker):
    repo = mocker.Mock()
    book_appointment(repo, request)
    repo.save.assert_called_once_with(mocker.ANY)     # says nothing about correctness

# ✓ Fake: asserts the outcome
class InMemoryAppointmentRepo:
    def __init__(self): self.items = {}
    def save(self, a): self.items[a.id] = a
    def find(self, id): return self.items.get(id)

def test_booking_persists_a_scheduled_appointment():
    repo = InMemoryAppointmentRepo()
    appointment = book_appointment(repo, request)
    assert repo.find(appointment.id).status == Status.SCHEDULED
```

**Mock at the boundary, not inside your own code.** Mock the payment gateway's HTTP client; don't mock your own service layer. If a test needs six mocks, the design is telling you the unit has too many dependencies.

**Never mock what you don't own** — mock a thin adapter you wrote around it. When the third-party API changes, your mock keeps lying; a contract test or a recorded-response test catches it.

> **Asked as:** "Mock vs stub vs fake." · "What shouldn't you mock?" · "Your test has 8 mocks — what does that tell you?"

---

## 3.4 Integration tests with real dependencies

```python
# Testcontainers: a real PostgreSQL per test session — no SQLite-vs-Postgres surprises
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def db_url():
    with PostgresContainer("postgres:18-alpine") as pg:
        yield pg.get_connection_url()

def test_unique_slot_constraint_is_enforced(db_session, doctor):
    slot = now() + timedelta(days=1)
    AppointmentFactory(doctor=doctor, slot=slot)
    with pytest.raises(IntegrityError):                 # the DATABASE enforces it, not just Python
        AppointmentFactory(doctor=doctor, slot=slot)
```

```java
@SpringBootTest
@Testcontainers
class OrderRepositoryTest {
    @Container
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:18-alpine");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", db::getJdbcUrl);
        r.add("spring.datasource.username", db::getUsername);
        r.add("spring.datasource.password", db::getPassword);
    }
}
```

Test against the **same engine and version as production**. Testing on SQLite and deploying on PostgreSQL means your constraints, types, isolation behaviour, and SQL dialect are all untested.

**Mock external HTTP with a recording proxy or a stub server** — WireMock (JVM), MSW (JS), `responses`/`respx` (Python) — not by monkey-patching your own client.

> **Asked as:** "How do you test database code?" · "Why not use an in-memory database?" · "How do you test code that calls a third-party API?"

---

## 3.5 TDD, and when it earns its keep

**Red → Green → Refactor.** Write a failing test, write the least code to pass it, then clean up with the test protecting you.

What TDD is actually good for:
- **Design pressure.** Code that's hard to test is usually hard to use — TDD surfaces that before you've written 500 lines.
- **Bug fixes.** Reproduce the bug as a failing test *first*; it proves you fixed it and stops the regression forever.
- **Well-understood logic** with clear inputs and outputs — parsers, calculators, business rules, algorithms.

Where it's weaker: exploratory/spike work, UI layout, and integration wiring where you don't yet know the shape of the answer. Spike, then delete the spike and TDD the real thing.

**BDD** puts the same loop in business language (`Given/When/Then`, Cucumber/pytest-bdd). Worth it when non-engineers genuinely read the specs; otherwise it's an extra layer of indirection.

> **Asked as:** "Do you practise TDD?" · "What are the benefits beyond catching bugs?" · "How do you fix a production bug?" (reproduce with a test first)

---

## 3.6 Coverage, mutation testing, and property-based testing

**Coverage tells you what's *not* tested; it says nothing about whether the tests are good.** 100% line coverage with zero assertions is achievable and worthless. Use it as a diagnostic ("this whole error path is untested"), gate on *not decreasing*, and never chase a number.

**Mutation testing** actually measures test quality: it changes your code (`>` → `>=`, `+` → `-`, removes a line) and checks whether a test fails. A surviving mutant is code your tests don't really verify.

```bash
mutmut run              # Python
npx stryker run         # JS/TS
mvn org.pitest:pitest-maven:mutationCoverage   # Java
```

**Property-based testing** generates hundreds of inputs and checks invariants — far better at finding edge cases than examples you thought of:

```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_is_idempotent_and_preserves_elements(xs):
    once = sorted(xs)
    assert sorted(once) == once            # idempotent
    assert Counter(once) == Counter(xs)    # same multiset
    assert all(a <= b for a, b in zip(once, once[1:]))   # ordered
```

Hypothesis (Python), fast-check (JS), jqwik (Java), proptest/quickcheck (Rust). When it finds a failure it *shrinks* the input to the minimal reproducer — often a one-element case you'd never have written.

> **Asked as:** "Is 100% coverage a good goal?" · "What is mutation testing?" · "How would you test a sorting/parsing function thoroughly?"

---

## 3.7 Testing the hard parts

| Hard thing | Approach |
|---|---|
| **Time** | Inject a `Clock`/`now()` provider; freeze it in tests. Never `sleep()` |
| **Randomness** | Inject a seeded RNG |
| **External APIs** | Adapter + stub server (WireMock/MSW) + contract tests + a nightly smoke test against the real thing |
| **Async / eventual consistency** | Poll with a timeout (`await eventually(...)`), never a fixed sleep |
| **Concurrency** | Deterministic tests for the logic; stress/fuzz tests for the race; ThreadSanitizer/`-race` |
| **Legacy code** | Characterisation tests pinning current behaviour, then refactor |
| **UI** | Testing-Library queries by role; visual regression (Percy/Chromatic) for layout |
| **Migrations** | Run the migration against a production-shaped dump in CI; test the rollback |
| **Performance** | Benchmark with a budget assertion (k6 thresholds, JMH) so regressions fail the build |
| **Security** | An authz test per endpoint: user B must not reach user A's data |

**Flaky tests:** quarantine them into a separate non-blocking job the moment they're detected, file a ticket, and fix or delete on a deadline. A suite people re-run until it goes green has stopped being a test suite.

> **Asked as:** "How do you test something that depends on the current time?" · "How do you test an async workflow?" · "What do you do about flaky tests?"

---

## 3.8 Rapid-fire answers

| Question | Answer |
|---|---|
| Unit vs integration | One unit in isolation vs several real components together |
| Regression test | A test added to prevent a fixed bug from returning |
| Smoke test | A shallow "is it alive?" check after deploy |
| Fixture / factory | Reusable setup; prefer factories (`factory_boy`, `Factory Bot`) over static fixtures for flexibility |
| Test data | Build the minimum needed; avoid a shared "kitchen sink" dataset every test depends on |
| Snapshot tests | Cheap for serialisation/UI; rot into "just update the snapshot" if unreviewed |
| Golden/approval tests | Compare against a checked-in expected output — good for report/format generators |
| Test in production | Canaries, feature flags, synthetic monitoring — complements, never replaces, pre-prod tests |
| Who writes tests | The developer who writes the code; QA adds exploratory and E2E depth |
| Definition of done | Merged, tested, documented, observable, deployed, and verified in production |
