# Rust — Deep Dive & Interview Reference (2026)

**Current state (Sept 2026):** Rust **1.98** is the latest stable (six-week cadence). **Edition 2024** is the default for new crates — `gen` blocks, stricter `unsafe` in `extern`, RPIT lifetime capture changes, and `IntoIterator` for `Box<[T]>`. Async traits (AFIT) are stable, `async fn` in traits works without `#[async_trait]` for most cases, and Rust is now in the Linux kernel, Windows, Android, and AWS/Cloudflare infrastructure. It is the default answer to "we need C++ performance without the memory bugs".

---

## 1. Ownership — the one idea everything else follows from

Three rules:

1. Every value has exactly one **owner**.
2. When the owner goes out of scope, the value is **dropped**.
3. There can be either **one mutable** reference **or any number of immutable** references — never both at once.

```rust
let s1 = String::from("hello");
let s2 = s1;              // MOVE — s1 is no longer valid
// println!("{s1}");      // ✗ compile error: value borrowed after move

let s3 = s2.clone();      // explicit deep copy when you really want one

let n1 = 5;
let n2 = n1;              // COPY — integers implement Copy, n1 still valid
```

`Copy` types (integers, floats, `bool`, `char`, and tuples of them) are duplicated bitwise. Everything owning heap memory (`String`, `Vec`, `Box`) moves.

**Borrowing:**

```rust
fn len(s: &String) -> usize { s.len() }            // shared borrow — read only
fn push(s: &mut String) { s.push_str(" world"); }  // exclusive borrow

let mut s = String::from("hi");
let r1 = &s;
let r2 = &s;         // many shared borrows: fine
// let rm = &mut s;  // ✗ can't take a mutable borrow while shared ones are live
println!("{r1}{r2}");
let rm = &mut s;     // ✓ NLL: r1/r2 are dead after their last use
```

This single rule eliminates data races, use-after-free, iterator invalidation, and double-free **at compile time**.

> **Asked as:** "Explain ownership and borrowing." · "Why can't you have a mutable and an immutable borrow at once?" · "Move vs Copy vs Clone."

---

## 2. Lifetimes — naming how long a reference is valid

Lifetimes don't change how long data lives; they let the compiler *verify* a reference never outlives its referent.

```rust
// The compiler needs to know the result borrows from BOTH inputs
fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() > b.len() { a } else { b }
}

struct Parser<'a> {
    input: &'a str,      // the struct cannot outlive the string it points into
    pos: usize,
}

impl<'a> Parser<'a> {
    fn rest(&self) -> &'a str { &self.input[self.pos..] }
}
```

**Elision rules** cover most code, which is why you rarely write lifetimes:
1. Each elided input lifetime gets its own parameter.
2. One input lifetime → it's assigned to all outputs.
3. A method with `&self` → outputs get `self`'s lifetime.

`'static` means "lives for the whole program" — string literals, or data you've leaked. `T: 'static` in a bound usually just means "contains no non-static references" (e.g. an owned `String` is `'static`), which is a common misreading.

> **Asked as:** "What is a lifetime?" · "Why does this function need `<'a>`?" · "Does `'static` mean it lives forever?"

---

## 3. Error handling: `Result`, `?`, and custom errors

No exceptions. Failure is a value in the type.

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OrderError {
    #[error("order {0} not found")]
    NotFound(String),
    #[error("invalid payload: {0}")]
    Invalid(#[from] serde_json::Error),      // auto From impl → `?` converts for you
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

pub async fn get_order(pool: &PgPool, id: &str) -> Result<Order, OrderError> {
    let row = sqlx::query_as!(Order, "SELECT id, total FROM orders WHERE id = $1", id)
        .fetch_optional(pool)
        .await?                                   // sqlx::Error → OrderError via #[from]
        .ok_or_else(|| OrderError::NotFound(id.to_string()))?;
    Ok(row)
}
```

`?` early-returns the error after applying `From`. Use **`thiserror`** for library error enums (callers can match) and **`anyhow`** for application binaries (`anyhow::Result<()>` plus `.context("loading config")`).

`unwrap()`/`expect()` panic — acceptable in tests, prototypes, and genuinely-impossible cases with an `expect("invariant: …")` message. Never in a request path.

> **Asked as:** "How does Rust handle errors without exceptions?" · "What does `?` desugar to?" · "`unwrap` vs `expect` vs `?`." · "thiserror vs anyhow."

---

## 4. Traits, generics, and dispatch

```rust
trait Repository {
    fn find(&self, id: &str) -> Option<Order>;
    fn save(&mut self, order: Order) -> Result<(), OrderError>;
    fn count(&self) -> usize { 0 }             // default method
}

// Static dispatch — monomorphised, inlined, zero cost, larger binary
fn report<R: Repository>(repo: &R) -> usize { repo.count() }

// Dynamic dispatch — one copy of the code, vtable lookup, needed for heterogeneous collections
fn report_dyn(repo: &dyn Repository) -> usize { repo.count() }
let repos: Vec<Box<dyn Repository>> = vec![Box::new(PgRepo::new()), Box::new(MemRepo::new())];
```

**Orphan rule:** you can implement a trait for a type only if you own the trait or the type. Work around it with a newtype wrapper.

**Key marker traits:**

| Trait | Meaning |
|---|---|
| `Send` | Safe to move to another thread |
| `Sync` | `&T` is safe to share across threads |
| `Copy` / `Clone` | Bitwise duplicate / explicit duplicate |
| `Drop` | Custom cleanup on scope exit (can't be called manually — use `drop(x)`) |
| `Deref` | Smart-pointer transparency (`Box<T>` acts like `T`) |

`Send`/`Sync` are auto-derived and are how the compiler proves your concurrency is sound: `Rc<T>` is neither (non-atomic refcount), so the compiler simply refuses to let you send it across threads.

> **Asked as:** "Static vs dynamic dispatch — cost and when." · "What are `Send` and `Sync`?" · "Trait objects vs generics." · "What is the orphan rule?"

---

## 5. Smart pointers and interior mutability

| Type | Purpose |
|---|---|
| `Box<T>` | Heap allocation, single owner; needed for recursive types and trait objects |
| `Rc<T>` | Shared ownership, single-threaded, non-atomic count |
| `Arc<T>` | Shared ownership across threads, atomic count |
| `RefCell<T>` | Interior mutability, single-threaded, **runtime** borrow check (panics on violation) |
| `Mutex<T>` / `RwLock<T>` | Interior mutability across threads |
| `Cow<'a, T>` | Borrow until you need to mutate, then clone |

```rust
use std::sync::{Arc, Mutex};
use std::thread;

let counter = Arc::new(Mutex::new(0));
let handles: Vec<_> = (0..8).map(|_| {
    let c = Arc::clone(&counter);
    thread::spawn(move || { *c.lock().unwrap() += 1; })
}).collect();
for h in handles { h.join().unwrap(); }
assert_eq!(*counter.lock().unwrap(), 8);
```

Note that in Rust the mutex **owns** the data — you cannot access the value without locking. That's a type-level fix for the most common concurrency bug in C++/Java.

`Rc<RefCell<T>>` is the single-threaded graph pattern; use `Weak` for back-edges to avoid reference cycles (Rust does **not** have a GC, so `Rc` cycles do leak).

> **Asked as:** "`Rc` vs `Arc`." · "What is interior mutability and when is it OK?" · "Can Rust leak memory?" (yes — `Rc` cycles, `mem::forget`, `Box::leak`; leaks are safe, just undesirable)

---

## 6. Iterators, closures, and zero-cost abstraction

```rust
let revenue: u64 = orders
    .iter()
    .filter(|o| o.status == Status::Paid)
    .map(|o| o.total_cents)
    .sum();                                    // compiles to the same loop you'd write by hand

// Fallible iteration: collect into a Result
let parsed: Result<Vec<i32>, _> = lines.iter().map(|l| l.parse::<i32>()).collect();

// Closure capture modes
let data = vec![1, 2, 3];
let by_ref  = || println!("{data:?}");     // Fn      — borrows
let by_mut  = |v: i32| data_mut.push(v);   // FnMut   — mutably borrows
let by_move = move || drop(data);          // FnOnce  — takes ownership
```

Iterators are **lazy** — nothing happens until a consuming adapter (`collect`, `sum`, `for`, `fold`). `iter()` yields `&T`, `iter_mut()` yields `&mut T`, `into_iter()` yields `T` and consumes the collection.

> **Asked as:** "`iter` vs `into_iter` vs `iter_mut`." · "`Fn` / `FnMut` / `FnOnce` — what decides which?" · "What does zero-cost abstraction mean?"

---

## 7. Async Rust

```rust
use tokio::time::{timeout, Duration};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let (user, orders) = tokio::try_join!(          // concurrent, both must succeed
        fetch_user("u1"),
        fetch_orders("u1"),
    )?;

    let r = timeout(Duration::from_secs(3), slow_call()).await;   // cancellation via drop

    tokio::select! {                                 // race; losers are dropped (= cancelled)
        res = primary() => handle(res),
        _   = tokio::signal::ctrl_c() => shutdown().await,
    }
    Ok(())
}
```

Things that surprise newcomers:

- **Futures are lazy.** Creating one does nothing; it only progresses when polled by `.await` or a runtime.
- **There is no built-in runtime.** Tokio is the de facto standard (axum, tonic, sqlx); `async-std`/`smol` exist.
- **Blocking inside async blocks the whole worker thread.** Use `tokio::task::spawn_blocking` for CPU or sync-I/O work.
- **Cancellation is dropping the future** — which means code after an `.await` may simply never run. Don't rely on it for cleanup; use a guard type with `Drop`.
- `Send` bounds propagate: anything held **across** an `.await` in a `tokio::spawn`ed task must be `Send`. Holding a `std::sync::MutexGuard` across `.await` is the classic compile error — use `tokio::sync::Mutex`, or restructure to drop the guard first.

> **Asked as:** "Why are Rust futures lazy?" · "What happens when you drop a future?" · "Why does my task need `Send`?" · "`spawn` vs `spawn_blocking`."

---

## 8. `unsafe`, FFI, and when to reach for it

```rust
// A safe abstraction over an unsafe operation — the standard pattern
pub fn split_at_mut(slice: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = slice.len();
    assert!(mid <= len);                          // uphold the invariant BEFORE unsafe
    let ptr = slice.as_mut_ptr();
    unsafe {
        (std::slice::from_raw_parts_mut(ptr, mid),
         std::slice::from_raw_parts_mut(ptr.add(mid), len - mid))
    }
}

// FFI into C
unsafe extern "C" {
    fn compress(dst: *mut u8, dst_len: *mut usize, src: *const u8, src_len: usize) -> i32;
}
```

`unsafe` gives you five extra powers (deref a raw pointer, call an `unsafe` fn, access a `static mut`, implement an unsafe trait, access union fields). It does **not** turn off the borrow checker. The discipline: keep `unsafe` blocks tiny, document the invariant with a `// SAFETY:` comment, and wrap them in a safe API. Verify with **Miri** (`cargo +nightly miri test`).

> **Asked as:** "What does `unsafe` actually allow?" · "How do you expose an unsafe operation safely?" · "How would you call a C library from Rust?"

---

## 9. Tooling and project hygiene

```bash
cargo new svc && cd svc
cargo add tokio --features full
cargo add serde --features derive
cargo clippy -- -D warnings       # lints; treat warnings as errors in CI
cargo fmt --check
cargo test                        # unit (in-file #[cfg(test)]), integration (tests/), doc tests
cargo bench                       # or criterion for statistically sound benchmarks
cargo audit                       # RustSec advisory database
cargo deny check                  # licences + duplicate deps + advisories
```

Doc tests are a standout feature — examples in `///` comments are compiled and run by `cargo test`, so your documentation can't rot.

```rust
/// Splits an order id.
///
/// ```
/// assert_eq!(mycrate::prefix("ord_123"), "ord");
/// ```
pub fn prefix(id: &str) -> &str { id.split('_').next().unwrap_or("") }
```

> **Asked as:** "How does testing work in Rust?" · "What is Clippy?" · "How do you audit dependencies?"

---

## 10. Rapid-fire answers

| Question | Answer |
|---|---|
| `String` vs `&str` | Owned, growable, heap vs borrowed UTF-8 slice (often a literal in `.rodata`) |
| `Vec<T>` vs `&[T]` | Owned growable buffer vs borrowed view (`&mut [T]` for mutable) |
| Does Rust have a GC? | No — ownership + `Drop` at compile time |
| `match` exhaustiveness | Compiler enforces every variant is handled; `_` is the catch-all |
| `if let` / `let else` | Ergonomic single-pattern match; `let Some(x) = opt else { return };` for early exit |
| `impl Trait` | In argument position = anonymous generic; in return position = "some concrete type I won't name" |
| Newtype pattern | `struct UserId(String)` — type safety at zero runtime cost, and dodges the orphan rule |
| `#[derive(...)]` | Compiler-generated trait impls (`Debug`, `Clone`, `PartialEq`, `Serialize`) |
| Panic vs Result | Unrecoverable bug vs expected failure; `panic = "abort"` in release shrinks binaries |
| Where Rust wins | Systems/embedded, CLI tools, high-throughput network services, WASM, Python/Node native extensions (PyO3, napi-rs) |
