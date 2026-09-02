# 1. Clean Code & Refactoring

Code is read far more often than it is written. Every rule here exists to reduce the time it takes the next person — usually you, in six months — to understand and safely change it.

---

## 1.1 Naming

```python
# ✗ What is this?
def calc(d, t, f=0.05):
    return d * t * (1 - f)

# ✓ The name and signature ARE the documentation
def net_consultation_fee(base_fee: Decimal, sessions: int, discount_rate: Decimal = Decimal("0.05")) -> Decimal:
    return base_fee * sessions * (1 - discount_rate)
```

- **Intention-revealing**: `elapsed_days` not `d`. Search-ability matters — you can't grep for `d`.
- **Nouns for things, verbs for actions**: `Invoice`, `calculate_total()`.
- **Booleans read as predicates**: `is_active`, `has_permission`, `can_refund`.
- **Consistency**: pick `fetch`/`get`/`retrieve` and use one throughout.
- **No abbreviations** except universally understood ones (`id`, `url`, `http`).
- **Avoid encoded types** (`str_name`, `list_items`) — the type system already says that.
- **Length scales with scope**: `i` is fine in a three-line loop; a module-level name needs to be explicit.

**Magic numbers and strings are named constants:**

```python
MAX_LOGIN_ATTEMPTS = 5
CANCELLATION_WINDOW = timedelta(hours=24)
if attempts > MAX_LOGIN_ATTEMPTS: lock_account(user)
```

> **Asked as:** "Review this code" (naming is the first thing to comment on) · "What makes code readable?"

---

## 1.2 Functions

**One level of abstraction per function.** A function that both orchestrates and manipulates bytes is doing two jobs.

```python
# ✗ 60 lines doing five things
def process_appointment(data):
    # validate...
    # look up doctor...
    # check availability...
    # save...
    # send email...
    # write audit log...

# ✓ The top level reads like the business process
def process_appointment(data: AppointmentRequest) -> Appointment:
    request = validate(data)
    doctor = find_available_doctor(request.specialty, request.slot)
    appointment = book(request, doctor)
    notify_patient(appointment)          # ideally after commit / async
    return appointment
```

- **Small.** If you need a comment to explain a block, that block is a function.
- **Few parameters.** Three is a lot; beyond that, pass an object. Boolean parameters (`save(user, True)`) are a code smell — the call site says nothing. Split into two functions or use a keyword-only enum.
- **No hidden side effects.** A function called `validate_user` must not also update `last_login`.
- **Command–query separation**: a function either *does* something or *answers* something, not both.
- **Return early.** Guard clauses beat nested `if`s:

```python
def cancel(appointment, user):
    if appointment.status == Status.CANCELLED: raise AlreadyCancelled(appointment.id)
    if not user.can_cancel(appointment):       raise PermissionDenied
    if appointment.slot - now() < CANCELLATION_WINDOW: raise WindowClosed
    appointment.cancel(by=user)
```

> **Asked as:** "How long should a function be?" · "Why are boolean parameters bad?" · "What is command-query separation?"

---

## 1.3 Comments

**Good comments explain *why*. Bad comments explain *what* (the code already does that) or lie (because nobody updates them).**

```python
# ✗
i += 1                              # increment i

# ✓
# The gateway rejects amounts over 500k in a single call, so we split.
# Ticket PAY-1183; remove once they raise the limit.
for chunk in split_amount(total, MAX_GATEWAY_AMOUNT):
    gateway.charge(chunk)
```

Comments that earn their place: non-obvious business rules, links to tickets/RFCs/specs, warnings about consequences, TODOs with an owner and a date, and public API docstrings.

**Commented-out code should be deleted.** Git remembers it; the comment just adds noise and doubt.

> **Asked as:** "When do you write comments?" · "Should code be self-documenting?"

---

## 1.4 Code smells worth naming

| Smell | Symptom | Refactoring |
|---|---|---|
| **Long method** | Scrolling to read it | Extract Method |
| **Large class** | 40 methods, unclear purpose | Extract Class, split by responsibility |
| **Long parameter list** | `f(a,b,c,d,e,f)` | Introduce Parameter Object |
| **Duplicated code** | The same logic in three places | Extract Method/Class |
| **Feature envy** | A method mostly uses another object's data | Move Method |
| **Data clump** | The same 3 params travel together everywhere | Make them a value object |
| **Primitive obsession** | `str` for email, `float` for money | Value objects (`Email`, `Money`) |
| **Shotgun surgery** | One change touches 12 files | Consolidate the responsibility |
| **Divergent change** | One class changes for many unrelated reasons | Split it (SRP) |
| **Switch on type** | `if isinstance(...)` chains | Polymorphism or a strategy map |
| **Temporal coupling** | `init()` must be called before `run()` | Constructor guarantees the invariant |
| **Speculative generality** | Abstractions with one implementation "for later" | Delete it (YAGNI) |
| **Boolean trap** | `render(true, false, true)` | Named enums or separate functions |

**Duplication is not always bad.** The wrong abstraction costs more than a little duplication — Sandi Metz's rule. Wait for the third occurrence before extracting, and make sure the three cases are really the same concept, not three things that currently look alike.

> **Asked as:** "What code smells do you look for in review?" · "Is DRY always right?"

---

## 1.5 Refactoring safely

**Refactoring changes structure without changing behaviour.** The prerequisite is tests — without them you're just editing and hoping.

The loop: **green → small change → green → commit**. Never mix a refactor with a behaviour change in the same commit; when something breaks, you need to know which one did it.

**The most useful moves:**

| Move | When |
|---|---|
| Extract Method/Function | A block needs a comment, or is duplicated |
| Inline | The indirection adds nothing |
| Rename | The name lies or is vague — do this constantly, it's free with an IDE |
| Extract Variable | A complex expression needs a name |
| Replace Conditional with Polymorphism | A type switch appears in more than one place |
| Introduce Parameter Object | A data clump travels together |
| Replace Magic Number with Constant | Any literal with meaning |
| Guard Clause | Deep nesting |
| **Branch by Abstraction** | Replacing a subsystem incrementally, in trunk |
| **Strangler Fig** | Replacing a whole system incrementally |

**Legacy code strategy** (Michael Feathers: "legacy code is code without tests"):

1. Find a **seam** — a place you can change behaviour without editing the code (an injectable dependency, a subclass, a config).
2. Write **characterisation tests** that pin down the *current* behaviour, bugs included.
3. Refactor under the tests.
4. Then change behaviour, deliberately.

**Boy Scout Rule:** leave the code a little cleaner than you found it. A large refactor that blocks feature work for two sprints rarely survives contact with a roadmap; a hundred small ones ship.

> **Asked as:** "How do you refactor code with no tests?" · "How do you convince a manager to allocate time for refactoring?" (frame it as risk and delivery speed, tie it to a feature you're about to build, and do it incrementally)

---

## 1.6 Error handling

```python
# ✗ Swallowing
try:
    charge(order)
except Exception:
    pass                                  # now nobody knows anything is wrong

# ✗ Logging and continuing as if it worked
try:
    charge(order)
except Exception as e:
    logger.error(e)
return {"status": "paid"}                 # a lie

# ✓ Catch what you can handle, add context, let the rest surface
try:
    receipt = gateway.charge(order.total, idempotency_key=order.id)
except GatewayTimeout as exc:
    # Ambiguous: the charge may have succeeded. Never blindly retry a payment.
    payments.mark_pending(order, reason="gateway_timeout")
    raise PaymentPending(order.id) from exc
except GatewayDeclined as exc:
    raise PaymentDeclined(order.id, exc.reason) from exc
```

- **Exceptions carry context**: which order, which user, which external system. `raise X from exc` preserves the chain.
- **Fail fast on programming errors** (a `None` where one is impossible) — crash loudly in development rather than corrupting data quietly.
- **Distinguish expected failures from bugs.** A declined card is a business outcome; a `TypeError` is a defect. They deserve different handling and different alerting.
- **Never return `null`/`None` to mean "error"** — use exceptions, `Result`/`Either`, or `Optional`, consistently within a codebase.
- **One error-handling boundary** per entry point (request handler, worker loop, CLI main) that logs with a correlation id and returns a safe message.

> **Asked as:** "How do you handle errors in a service?" · "When do you catch vs propagate?" · "What's wrong with `except: pass`?"

---

## 1.7 Technical debt

Debt isn't just bad code — it's any gap between the current design and what the problem now requires. Some of it is deliberate and rational.

| Type | Example | Handling |
|---|---|---|
| **Deliberate + prudent** | "Ship the simple version for the launch, revisit in Q4" | Document it, schedule it |
| **Deliberate + reckless** | "No time for tests" | Don't |
| **Inadvertent + prudent** | "Now we understand the domain, this model is wrong" | Refactor as you learn |
| **Inadvertent + reckless** | Nobody knew better | Training, review, pairing |

**Manage it visibly:** a debt register with impact and cost, an agreed percentage of each sprint (10–20%) for paying it down, and — most effectively — **pay debt in the area you're about to build in**. Debt in code nobody touches costs nothing.

> **Asked as:** "What is technical debt?" · "How do you decide what to fix?" · "Tell me about a time you had to ship something you weren't happy with."

---

## 1.8 Rapid-fire answers

| Principle | Meaning |
|---|---|
| **DRY** | Don't Repeat Yourself — one authoritative representation of each piece of knowledge |
| **KISS** | Keep It Simple — the simplest thing that solves the actual problem |
| **YAGNI** | You Aren't Gonna Need It — don't build for imagined futures |
| **Principle of Least Astonishment** | Behave the way the name and convention suggest |
| **Composition over inheritance** | Assemble behaviour from parts; inheritance couples you to a hierarchy |
| **Law of Demeter** | Talk to friends, not strangers: `a.b().c().d()` is a chain of assumptions |
| **Fail fast** | Detect invalid state at the earliest point, with a clear message |
| **Make it work, make it right, make it fast** | In that order, and measure before the third |
| **Boy Scout Rule** | Leave it cleaner than you found it |
| **Premature optimisation** | Optimising without measurement — the profiler decides, not intuition |
