# 2. OOP, SOLID & Design Patterns

---

## 2.1 The four pillars, and what they're actually for

| Pillar | Meaning | Why it matters |
|---|---|---|
| **Encapsulation** | Hide internal state; expose behaviour | You can change the internals without breaking callers |
| **Abstraction** | Expose the essential, hide the mechanism | Callers depend on *what*, not *how* |
| **Inheritance** | An "is-a" relationship reusing behaviour | Powerful and over-used — prefer composition |
| **Polymorphism** | One interface, many implementations | Add a case without editing existing code |

```java
// ✗ Anaemic model — a bag of data with a service doing all the thinking
class Account { public BigDecimal balance; }
class AccountService {
    void withdraw(Account a, BigDecimal amt) { a.balance = a.balance.subtract(amt); }
}   // nothing stops a negative balance, from anywhere in the codebase

// ✓ Rich model — the object protects its own invariants
public class Account {
    private BigDecimal balance;
    private final AccountId id;

    public void withdraw(Money amount) {
        if (amount.isNegativeOrZero()) throw new IllegalArgumentException("amount must be positive");
        if (balance.compareTo(amount.value()) < 0) throw new InsufficientFunds(id, balance, amount);
        balance = balance.subtract(amount.value());
    }
    public Money balance() { return Money.of(balance); }   // no setter
}
```

**Polymorphism replaces type switches:**

```python
# ✗ Every new payment method edits this function
def fee(method, amount):
    if method == "card":   return amount * Decimal("0.029") + Decimal("0.30")
    elif method == "bkash": return amount * Decimal("0.018")
    elif method == "bank":  return Decimal("15.00")

# ✓ A new method is a new class; nothing existing changes
class PaymentMethod(Protocol):
    def fee(self, amount: Decimal) -> Decimal: ...

class Card:
    def fee(self, amount): return amount * Decimal("0.029") + Decimal("0.30")
class BKash:
    def fee(self, amount): return amount * Decimal("0.018")
```

> **Asked as:** "Explain the four pillars with an example." · "What is an anaemic domain model?" · "Overloading vs overriding." (compile-time same name/different signature vs runtime subclass replacing a parent method)

---

## 2.2 SOLID, with the failure each principle prevents

**S — Single Responsibility.** A class should have one reason to change.

```python
# ✗ Changes when the tax rules change, when the PDF layout changes, AND when SMTP changes
class Invoice:
    def calculate_tax(self): ...
    def render_pdf(self): ...
    def send_email(self): ...

# ✓ Three reasons to change, three classes
class Invoice: ...              # the data and its invariants
class TaxCalculator: ...
class InvoicePdfRenderer: ...
class InvoiceMailer: ...
```

**O — Open/Closed.** Open for extension, closed for modification. Adding a payment method should mean adding a class, not editing a switch that already works and is already tested.

**L — Liskov Substitution.** A subtype must be usable anywhere its base type is, without surprising the caller.

```python
# ✗ The classic violation
class Rectangle:
    def set_width(self, w): self._w = w
    def set_height(self, h): self._h = h
    def area(self): return self._w * self._h

class Square(Rectangle):        # a square IS-A rectangle mathematically...
    def set_width(self, w): self._w = self._h = w      # ...but this breaks the contract
    def set_height(self, h): self._w = self._h = h

def test(r: Rectangle):
    r.set_width(5); r.set_height(4)
    assert r.area() == 20       # fails for Square
```

The signal: a subclass that throws `NotImplementedError` on an inherited method, strengthens preconditions, or weakens postconditions is violating LSP. Usually the fix is composition, not inheritance.

**I — Interface Segregation.** Many small interfaces beat one fat one. A `Printer` that must implement `scan()` and `fax()` will throw for two of them.

**D — Dependency Inversion.** Depend on abstractions, not concretions. High-level policy shouldn't import low-level detail.

```python
# ✗ The use case is welded to Postgres and SendGrid
class BookAppointment:
    def __init__(self):
        self.db = PostgresConnection(DSN)
        self.mailer = SendGridClient(API_KEY)

# ✓ Dependencies injected as interfaces — testable, swappable
class BookAppointment:
    def __init__(self, repo: AppointmentRepository, notifier: Notifier):
        self.repo, self.notifier = repo, notifier
```

Note the direction: the **use case defines the interface** it needs; the infrastructure implements it. That's what "inversion" means — the dependency arrow points *away* from the detail.

> **Asked as:** "Explain SOLID with real examples." · "Give me a Liskov violation." · "What does dependency inversion actually invert?"

---

## 2.3 Creational patterns

```python
# Factory Method / Simple Factory — centralise construction choice
class NotifierFactory:
    _registry = {"email": EmailNotifier, "sms": SmsNotifier, "push": PushNotifier}

    @classmethod
    def create(cls, channel: str, config: dict) -> Notifier:
        try:
            return cls._registry[channel](**config)
        except KeyError:
            raise ValueError(f"unknown channel: {channel}")

# Builder — many optional parameters, immutable result
@dataclass(frozen=True)
class HttpRequest:
    url: str; method: str = "GET"; headers: dict = field(default_factory=dict)
    timeout: float = 10.0; retries: int = 0

class RequestBuilder:
    def __init__(self, url): self._d = {"url": url}
    def post(self, body): self._d |= {"method": "POST", "body": body}; return self
    def header(self, k, v): self._d.setdefault("headers", {})[k] = v; return self
    def timeout(self, s): self._d["timeout"] = s; return self
    def build(self): return HttpRequest(**self._d)

request = RequestBuilder("/api/orders").post(payload).header("X-Trace", tid).timeout(5).build()
```

**Singleton** — one instance globally. Widely considered an anti-pattern in application code: it's global mutable state, it hides dependencies, and it makes tests order-dependent. Use your DI container's singleton *scope* instead, which gives you one instance without the global.

**Dependency Injection** is the pattern that replaces most creational patterns in modern code: construct collaborators outside and pass them in (Spring, Django settings + factories, NestJS, or just constructor parameters).

> **Asked as:** "When would you use a builder?" · "Why is Singleton considered harmful?" · "Factory vs DI container."

---

## 2.4 Structural patterns

```python
# Adapter — make an incompatible interface fit (very common at integration boundaries)
class LegacyPaymentGateway:                       # third-party, can't change
    def do_payment(self, amount_paisa: int, card: str) -> dict: ...

class PaymentGateway(Protocol):                   # what OUR domain wants
    def charge(self, amount: Money, card: Card) -> Receipt: ...

class LegacyGatewayAdapter:
    def __init__(self, legacy): self._legacy = legacy
    def charge(self, amount: Money, card: Card) -> Receipt:
        raw = self._legacy.do_payment(int(amount.value * 100), card.number)
        return Receipt(id=raw["txn"], status=raw["st"] == "OK")

# Decorator — add behaviour without changing the class or its callers
class CachingRepository:
    def __init__(self, inner: Repository, cache): self._inner, self._cache = inner, cache
    def find(self, id):
        if (hit := self._cache.get(id)) is not None: return hit
        value = self._inner.find(id)
        self._cache.set(id, value, ttl=300)
        return value

repo = CachingRepository(LoggingRepository(SqlRepository(pool)), redis)   # composable layers

# Facade — one simple entry point over a complicated subsystem
class BillingFacade:
    def issue_invoice(self, appointment_id):
        appt = self.appointments.get(appointment_id)
        lines = self.pricing.build_lines(appt)
        tax = self.tax.calculate(lines, appt.clinic.region)
        invoice = self.invoices.create(appt, lines, tax)
        self.mailer.send(invoice)
        return invoice
```

Also worth knowing: **Proxy** (a stand-in controlling access — lazy loading, access control, remote calls), **Composite** (treat a tree of objects uniformly — file systems, UI components), **Bridge** (separate abstraction from implementation so both can vary).

> **Asked as:** "Adapter vs Facade." · "Decorator vs inheritance." · "Where have you used the adapter pattern?" (any third-party integration)

---

## 2.5 Behavioural patterns

```python
# Strategy — swap the algorithm at runtime
class PricingStrategy(Protocol):
    def price(self, base: Decimal, patient: Patient) -> Decimal: ...

class StandardPricing:  ...
class InsurancePricing: ...
class CorporatePricing: ...

STRATEGIES = {"standard": StandardPricing(), "insurance": InsurancePricing()}

# Observer — publish/subscribe within a process
class EventBus:
    def __init__(self): self._handlers = defaultdict(list)
    def subscribe(self, event_type, handler): self._handlers[type(event_type)].append(handler)
    def publish(self, event):
        for h in self._handlers[type(event)]:
            try: h(event)
            except Exception: logger.exception("handler failed for %s", type(event).__name__)

# State — behaviour depends on state, and transitions are explicit
class AppointmentState(Protocol):
    def cancel(self, appt) -> "AppointmentState": ...

class Scheduled:
    def cancel(self, appt): appt.refund(); return Cancelled()
class Completed:
    def cancel(self, appt): raise CannotCancelCompleted(appt.id)

# Template Method — fixed skeleton, variable steps
class ReportGenerator(ABC):
    def generate(self):                # the skeleton is fixed
        data = self.fetch()
        rows = self.transform(data)
        return self.render(rows)
    @abstractmethod
    def fetch(self): ...
    @abstractmethod
    def render(self, rows): ...
    def transform(self, data): return data            # overridable default
```

Also: **Command** (an action as an object — undo, queues, audit), **Chain of Responsibility** (middleware pipelines), **Iterator** (built into most languages now), **Mediator** (centralise many-to-many interaction), **Visitor** (add operations to a fixed hierarchy without editing it).

**Patterns are a vocabulary, not a checklist.** "Let's put a decorator around the repository for caching" communicates a design in eight words. Applying patterns you don't need is how you get a `SimpleBeanFactoryAwareAspectInstanceFactory`.

> **Asked as:** "Strategy vs State — what's the difference?" (Strategy: caller chooses the algorithm. State: the object transitions itself.) · "Which patterns do you actually use?" · "Give an example of Observer in a framework you know."

---

## 2.6 Concurrency in application code

```java
// Immutability is the simplest thread-safety
public record Money(BigDecimal amount, Currency currency) {
    public Money add(Money other) {
        if (!currency.equals(other.currency)) throw new CurrencyMismatch();
        return new Money(amount.add(other.amount), currency);   // new object, no shared mutation
    }
}
```

Rules that prevent most concurrency bugs:

1. **Prefer immutability.** No shared mutable state, no race.
2. **Confine state to one thread** where you can (actor-style, per-request objects).
3. **When you must share, synchronise everything** — a partially-guarded field is worse than an unguarded one because it looks safe.
4. **Prefer higher-level constructs** — `ConcurrentHashMap`, `ExecutorService`, `CompletableFuture`, channels, `asyncio` — over raw threads and locks.
5. **Consistent lock ordering** to avoid deadlock; keep critical sections short; never do I/O while holding a lock.
6. **Atomic database operations** beat application-level locking: `UPDATE stock SET qty = qty - 1 WHERE id = ? AND qty > 0` needs no lock at all.

**Race condition** = the result depends on timing. **Deadlock** = two threads each hold what the other needs. **Livelock** = both keep yielding and neither progresses. **Starvation** = one thread never gets scheduled.

> **Asked as:** "How do you make a class thread-safe?" · "Race condition vs deadlock." · "Why is immutability useful for concurrency?"

---

## 2.7 Rapid-fire answers

| Question | Answer |
|---|---|
| Composition vs inheritance | "Has-a" is flexible and testable; "is-a" couples you to a hierarchy and its changes |
| Interface vs abstract class | Contract only vs shared state/implementation; a class implements many interfaces, extends one class |
| Coupling / cohesion | Minimise dependencies between modules; maximise relatedness within one |
| Value object vs entity | Equal by value, immutable vs equal by identity, mutable over time |
| Immutable object | No setters, final/readonly fields, defensive copies of mutable members |
| Static methods | Fine for pure functions; hard to mock, so avoid for anything with dependencies |
| God object | A class that knows and does everything — split by responsibility |
| Circular dependency | A design smell; break with an interface, an event, or by extracting a shared module |
| Law of Demeter | `order.getCustomer().getAddress().getCity()` couples you to three classes — ask the object instead |
| Over-engineering | Abstractions with one implementation, config for things that never change, patterns applied for their own sake |
