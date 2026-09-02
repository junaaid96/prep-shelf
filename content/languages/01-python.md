# Python — Deep Dive & Interview Reference (2026)

**Current state (Sept 2026):** Python **3.14** is the newest stable line (3.14.7), released Oct 2025. It is the first release where the **free-threaded build (`python3.14t`, no GIL)** is officially supported rather than experimental, and it ships an experimental **JIT**. Python 3.13 is in security-only maintenance from Oct 2026. Target 3.12+ for new work; 3.14 if you want free-threading or the new interpreter improvements.

---

## 1. The data model — why `__dunder__` methods are the whole language

Almost every Python behaviour is a protocol. `len(x)` calls `x.__len__()`, `a + b` calls `a.__add__(b)`, `with x:` calls `x.__enter__()/__exit__()`. Learning the protocols is more valuable than memorising the stdlib.

```python
class Money:
    __slots__ = ("amount", "currency")      # no __dict__ → less memory, faster attr access

    def __init__(self, amount: int, currency: str = "BDT"):
        self.amount, self.currency = amount, currency

    def __repr__(self) -> str:              # for developers (debuggers, logs)
        return f"Money({self.amount!r}, {self.currency!r})"

    def __str__(self) -> str:               # for users
        return f"{self.amount / 100:.2f} {self.currency}"

    def __eq__(self, other) -> bool:
        if not isinstance(other, Money):
            return NotImplemented           # let Python try the reflected op
        return (self.amount, self.currency) == (other.amount, other.currency)

    def __hash__(self) -> int:              # defining __eq__ kills the default __hash__
        return hash((self.amount, self.currency))

    def __add__(self, other: "Money") -> "Money":
        if self.currency != other.currency:
            raise ValueError("currency mismatch")
        return Money(self.amount + other.amount, self.currency)
```

**Gotcha most people hit:** defining `__eq__` sets `__hash__ = None`, so your object becomes unhashable and can't go in a `set` or be a `dict` key. Define `__hash__` too, or use `@dataclass(frozen=True)` which does both for you.

> **Asked as:** "What's the difference between `__str__` and `__repr__`?" · "Why does my class break when used in a set?" · "What does returning `NotImplemented` do?"

---

## 2. Mutability, identity, and the default-argument trap

```python
def append_to(item, target=[]):     # BUG: the list is created ONCE, at def time
    target.append(item)
    return target

append_to(1)   # [1]
append_to(2)   # [1, 2]  ← surprise

def append_to(item, target=None):   # correct
    if target is None:
        target = []
    target.append(item)
    return target
```

`is` compares identity (same object), `==` compares value. CPython interns small ints (-5..256) and some strings, so `a is b` may accidentally be `True` for `a = 256; b = 256` but `False` for `257`. **Never** use `is` for value comparison — only for `None`, `True`, `False`, and sentinels.

**Shallow vs deep copy:**

```python
import copy
row = [0] * 3
grid = [row] * 3          # BUG: three references to ONE list
grid[0][0] = 9            # → [[9,0,0],[9,0,0],[9,0,0]]

grid = [[0] * 3 for _ in range(3)]   # correct
deep = copy.deepcopy(grid)           # fully independent
```

> **Asked as:** "Why does the mutable default argument bug happen?" · "`is` vs `==`?" · "Explain shallow vs deep copy with an example."

---

## 3. Iterators, generators, and laziness

An **iterable** has `__iter__`; an **iterator** has `__next__` and is consumed once. Generators are the ergonomic way to build iterators.

```python
def read_large_csv(path):
    """Streams rows — constant memory even for a 10 GB file."""
    with open(path, newline="") as fh:
        header = next(fh).rstrip("\n").split(",")
        for line in fh:                       # file objects are lazy iterators
            yield dict(zip(header, line.rstrip("\n").split(",")))

# Pipeline of generators — nothing is materialised until the final sum()
rows      = read_large_csv("orders.csv")
paid      = (r for r in rows if r["status"] == "PAID")
revenue   = sum(int(r["amount_cents"]) for r in paid)
```

`yield from` delegates; generators can also receive values (`.send()`), which is the mechanism `async`/`await` was built on.

```python
def batched(iterable, n):
    """3.12+ has itertools.batched — this is the manual version."""
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) == n:
            yield batch
            batch = []
    if batch:
        yield batch
```

> **Asked as:** "Difference between a list comprehension and a generator expression?" · "How would you process a file larger than RAM?" · "What does `yield from` do?"

---

## 4. Decorators, closures, and `functools`

A decorator is a function that takes a callable and returns a callable. Always use `functools.wraps` so introspection, docs, and debuggers still work.

```python
import functools, time, logging

def retry(times=3, delay=0.5, exceptions=(Exception,)):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last = None
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as exc:
                    last = exc
                    logging.warning("%s failed (%d/%d): %s", fn.__name__, attempt, times, exc)
                    time.sleep(delay * 2 ** (attempt - 1))   # exponential backoff
            raise last
        return wrapper
    return decorator

@retry(times=4, exceptions=(ConnectionError, TimeoutError))
def fetch_invoice(invoice_id: str) -> dict:
    ...
```

`functools.lru_cache` / `functools.cache` memoise pure functions. `functools.cached_property` computes once per instance. In 3.12+, `lru_cache` no longer keeps a strong reference cycle to `self`, but caching methods on long-lived objects is still a classic memory leak — cache the *pure* function, not the bound method.

> **Asked as:** "Write a retry decorator." · "Why `functools.wraps`?" · "How would you memoise an expensive call?"

---

## 5. Concurrency: threads, processes, asyncio, and the 3.14 free-threaded build

| Workload | Use | Why |
|---|---|---|
| Network / disk I/O, thousands of sockets | `asyncio` | One thread, cooperative scheduling, cheapest per-connection |
| Blocking I/O in library code you can't rewrite | `ThreadPoolExecutor` | GIL is released during I/O syscalls |
| CPU-bound (parsing, image, numeric) | `ProcessPoolExecutor` | Sidesteps the GIL entirely |
| CPU-bound, shared memory, 3.14 free-threaded build | threads on `python3.14t` | True parallelism, no pickling cost — but ecosystem support is still uneven |

```python
import asyncio, httpx

async def fetch(client: httpx.AsyncClient, url: str) -> int:
    r = await client.get(url, timeout=5.0)
    return r.status_code

async def main(urls: list[str]) -> list[int]:
    async with httpx.AsyncClient() as client:
        # TaskGroup (3.11+) — structured concurrency: if one task raises,
        # the rest are cancelled and errors surface as an ExceptionGroup.
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(fetch(client, u)) for u in urls]
    return [t.result() for t in tasks]

asyncio.run(main(["https://example.com"] * 20))
```

**The #1 async bug:** calling blocking code inside a coroutine (`requests.get`, `time.sleep`, a sync DB driver). It blocks the whole event loop. Wrap it: `await asyncio.to_thread(blocking_fn, arg)`.

**Free-threading in 3.14:** `python3.14t` removes the GIL. Single-threaded code is ~5–10% slower; multi-threaded CPU work scales close to linearly. C extensions must be rebuilt and declare support. Treat it as production-viable only after you've verified every native dependency.

> **Asked as:** "What is the GIL and when does it actually hurt you?" · "asyncio vs threads vs multiprocessing?" · "How do you run blocking code from async?"

---

## 6. Typing that earns its keep

```python
from typing import Protocol, TypedDict, Literal, Self
from collections.abc import Sequence, Iterator
from dataclasses import dataclass, field

class SupportsCharge(Protocol):              # structural typing — no inheritance needed
    def charge(self, cents: int) -> str: ...

class OrderRow(TypedDict):
    id: str
    status: Literal["NEW", "PAID", "CANCELLED"]
    amount_cents: int

@dataclass(slots=True, frozen=True, kw_only=True)
class Order:
    id: str
    lines: tuple[str, ...] = field(default_factory=tuple)

    def with_line(self, line: str) -> Self:  # 3.11+ Self type
        return Order(id=self.id, lines=(*self.lines, line))

def total(rows: Sequence[OrderRow]) -> int:
    return sum(r["amount_cents"] for r in rows if r["status"] == "PAID")
```

Types are erased at runtime — they don't validate. Use **Pydantic v2** (Rust core, fast) when you need actual runtime validation at a boundary (HTTP body, config file, queue message). Run `mypy --strict` or `pyright` in CI; without CI enforcement annotations rot.

**3.12+ generics syntax** (no more `TypeVar` boilerplate):

```python
def first[T](items: Sequence[T]) -> T | None:
    return items[0] if items else None
```

> **Asked as:** "Protocol vs ABC?" · "Do type hints affect runtime?" · "dataclass vs NamedTuple vs Pydantic model?"

---

## 7. Errors, context managers, and resource safety

```python
from contextlib import contextmanager
import sqlite3

@contextmanager
def transaction(conn):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise                       # never swallow — re-raise after cleanup
    finally:
        conn.close()

with transaction(sqlite3.connect("app.db")) as conn:
    conn.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (100, 1))
```

Exception rules that separate juniors from seniors:

- Catch the **narrowest** exception you can handle. `except Exception:` at a boundary (a request handler, a worker loop) is fine; sprinkled through business logic it hides bugs.
- `raise NewError(...) from exc` preserves the cause chain.
- **Never** `except: pass`. If you truly must ignore, use `contextlib.suppress(FileNotFoundError)` so the intent is explicit.
- `ExceptionGroup` / `except*` (3.11+) is how you handle multiple failures from a `TaskGroup`.

> **Asked as:** "How do context managers work under the hood?" · "Explain exception chaining." · "When is a bare except acceptable?"

---

## 8. Performance you can actually measure

```python
# 1. Profile before optimising
python -m cProfile -s cumtime app.py | head -30

# 2. Micro-benchmark honestly
python -m timeit -s "d={i:i for i in range(1000)}" "999 in d"      # ~30 ns
python -m timeit -s "l=list(range(1000))"         "999 in l"      # ~8000 ns
```

Practical wins, in order of payoff:

1. **Fix the algorithm / the N+1 query.** Nothing else comes close.
2. **`set`/`dict` for membership** instead of `list` (O(1) vs O(n)).
3. **Batch I/O** — one query for 1000 rows beats 1000 queries.
4. `"".join(parts)` instead of `s += x` in a loop (O(n) vs O(n²)).
5. `__slots__` on high-cardinality objects, `array`/`numpy` for numeric bulk data.
6. Push hot loops into C: `numpy`, `polars`, or a Rust extension via `PyO3`.

**Tooling in 2026:** `uv` (Rust, from Astral) has largely replaced `pip`+`venv`+`pip-tools` for speed; `ruff` replaces flake8/isort/pyupgrade and most of pylint; `pytest` remains the test runner. A modern `pyproject.toml` is the single source of truth.

> **Asked as:** "How do you find a performance problem in a Python service?" · "Why is string concatenation in a loop slow?" · "What's in your Python tooling setup?"

---

## 9. Rapid-fire answers

| Question | Answer |
|---|---|
| `list` vs `tuple` | Mutable vs immutable; tuple is hashable and slightly smaller/faster |
| `@staticmethod` vs `@classmethod` | No implicit arg vs receives `cls`; classmethods are used for alternative constructors |
| Shallow copy of a dict | `d.copy()` or `dict(d)` — nested values still shared |
| `*args` / `**kwargs` | Positional tuple / keyword dict; `def f(a, *, b)` forces `b` keyword-only |
| MRO | C3 linearisation; inspect with `Cls.__mro__`; `super()` follows it, not the parent |
| GIL | One thread executes bytecode at a time per interpreter; released during I/O and by some C extensions |
| `==` on floats | Don't. Use `math.isclose(a, b)` |
| Global vs nonlocal | `global` rebinds module-level; `nonlocal` rebinds the nearest enclosing function scope |
| Why `if __name__ == "__main__"` | Code guarded by it doesn't run on import — critical for `multiprocessing` on spawn platforms |
| Metaclass | A class whose instances are classes; `type` is the default. Used by ORMs/Pydantic to build fields at class-creation time. Rarely needed in app code |
