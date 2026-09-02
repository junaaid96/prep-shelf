# C++ — Deep Dive & Interview Reference (2026)

**Current state (Sept 2026):** **C++26 was finalised in March 2026** — the headline features are **static reflection**, **contracts**, the **`std::execution` (senders/receivers) async model**, hardened standard-library preconditions, and `constexpr` everywhere improvements. C++23 (`std::expected`, `std::print`, deducing `this`, `mdspan`) is what most compilers ship fully today. Write modern C++: RAII, value semantics, smart pointers, ranges, and almost no raw `new`.

---

## 1. RAII — the organising idea of the language

Every resource (memory, file, socket, lock, GPU handle) is owned by an object whose destructor releases it. Scope exit — normal or by exception — is the release mechanism.

```cpp
class FileHandle {
    std::FILE* f_{};
public:
    explicit FileHandle(const char* path, const char* mode)
        : f_(std::fopen(path, mode)) {
        if (!f_) throw std::runtime_error("cannot open");
    }
    ~FileHandle() { if (f_) std::fclose(f_); }

    FileHandle(const FileHandle&)            = delete;   // non-copyable
    FileHandle& operator=(const FileHandle&) = delete;
    FileHandle(FileHandle&& o) noexcept : f_(std::exchange(o.f_, nullptr)) {}
    FileHandle& operator=(FileHandle&& o) noexcept {
        if (this != &o) { if (f_) std::fclose(f_); f_ = std::exchange(o.f_, nullptr); }
        return *this;
    }
};
```

That block is the **Rule of Five**. The **Rule of Zero** is better: build your class out of members that already manage themselves (`std::string`, `std::vector`, `std::unique_ptr`) and write *none* of the five.

> **Asked as:** "What is RAII?" · "Rule of Three/Five/Zero." · "Why must a destructor not throw?" (two live exceptions → `std::terminate`)

---

## 2. Smart pointers and ownership

```cpp
auto u = std::make_unique<Engine>(args...);   // sole ownership, zero overhead vs raw
auto s = std::make_shared<Config>(args...);   // shared ownership, atomic refcount, one allocation
std::weak_ptr<Config> w = s;                  // observes without owning — breaks cycles

if (auto locked = w.lock()) locked->reload();  // safe access
```

| Pointer | Meaning | Cost |
|---|---|---|
| `T*` (raw) | non-owning observer, may be null | free |
| `T&` | non-owning, never null | free |
| `unique_ptr<T>` | exclusive owner, movable not copyable | none |
| `shared_ptr<T>` | shared owner | atomic refcount, 2× pointer size |
| `weak_ptr<T>` | breaks `shared_ptr` cycles | — |

**Two `shared_ptr`s pointing at each other never free** — that's the cycle leak `weak_ptr` exists for (parent holds `shared_ptr` to children; children hold `weak_ptr` to parent).

`make_unique`/`make_shared` over `new`: exception-safe argument evaluation, and `make_shared` puts the control block and object in one allocation.

> **Asked as:** "unique_ptr vs shared_ptr." · "How does shared_ptr leak and how do you fix it?" · "Is `shared_ptr` thread-safe?" (the refcount is; the pointee is not)

---

## 3. Move semantics, value categories, and perfect forwarding

An **lvalue** has identity; an **rvalue** (prvalue/xvalue) is a temporary you may steal from.

```cpp
std::vector<std::string> v;
std::string s = "hello";
v.push_back(s);              // copy — s is still usable
v.push_back(std::move(s));   // move — s is valid but unspecified; don't read it

// Perfect forwarding: T&& in a deduced context is a FORWARDING reference, not an rvalue ref
template <typename... Args>
auto emplace_log(Args&&... args) {
    return storage.emplace_back(std::forward<Args>(args)...);   // preserves value category
}
```

Key rules:

- `std::move` doesn't move anything — it's a cast to `T&&` that *enables* a move.
- Mark move constructors/assignment `noexcept`, or `std::vector` reallocation will **copy** instead of move (it needs the strong exception guarantee).
- **Never `std::move` a return value of a local**: `return std::move(x);` defeats NRVO/copy elision. Just `return x;`.
- After a move, the source is in a valid-but-unspecified state — assignable and destructible, nothing more.

> **Asked as:** "What does `std::move` actually do?" · "lvalue vs rvalue vs xvalue." · "Why must move constructors be `noexcept`?" · "Explain perfect forwarding."

---

## 4. Containers, iterators, and complexity

| Container | Lookup | Insert | Notes |
|---|---|---|---|
| `vector` | O(1) index | amortised O(1) back | Contiguous → cache-friendly. **Default choice.** |
| `deque` | O(1) index | O(1) both ends | Chunked; no contiguity guarantee |
| `list` | O(n) | O(1) with iterator | Rarely worth it — pointer chasing kills cache |
| `map` / `set` | O(log n) | O(log n) | Red-black tree, ordered, stable references |
| `unordered_map` / `set` | O(1) avg, O(n) worst | O(1) avg | Hash table; rehash invalidates iterators |
| `flat_map` (C++23) | O(log n) | O(n) | Sorted vector — far faster for read-heavy small maps |

**Iterator invalidation** is the top source of nasty bugs:

```cpp
for (auto it = v.begin(); it != v.end(); ) {
    if (should_remove(*it)) it = v.erase(it);   // erase returns the next valid iterator
    else ++it;
}

// Or the idiomatic one-liner (C++20)
std::erase_if(v, should_remove);
```

`vector::push_back` invalidates **all** iterators/references on reallocation. `unordered_map` invalidates iterators on rehash but keeps references to elements valid. `map`/`list` keep everything valid except the erased element.

> **Asked as:** "vector vs list — which and why?" · "When are iterators invalidated?" · "`emplace_back` vs `push_back`." (constructs in place vs constructs then moves)

---

## 5. Templates, concepts, and compile-time work

```cpp
#include <concepts>
#include <ranges>

template <std::floating_point T>                 // constrained — clear errors, better overloads
T mean(std::span<const T> xs) {
    return std::reduce(xs.begin(), xs.end(), T{}) / static_cast<T>(xs.size());
}

template <typename R>
concept OrderRange = std::ranges::input_range<R> &&
                     requires(std::ranges::range_value_t<R> o) { { o.total() } -> std::convertible_to<double>; };

double revenue(OrderRange auto&& orders) {
    double sum = 0;
    for (auto&& o : orders | std::views::filter([](auto&& o){ return o.paid(); }))
        sum += o.total();
    return sum;
}

// constexpr / consteval — computed at compile time
consteval std::size_t hash_route(std::string_view s) {
    std::size_t h = 1469598103934665603ULL;
    for (char c : s) { h ^= static_cast<unsigned char>(c); h *= 1099511628211ULL; }
    return h;
}
static_assert(hash_route("/orders") != 0);
```

Concepts (C++20) replaced SFINAE for constraining templates and turned 400-line template errors into one-line messages. **C++26 adds static reflection** (`^^T`, splicing), which finally makes automatic serialisation, ORM mapping, and enum-to-string possible without macros or code generation.

> **Asked as:** "What problem do concepts solve?" · "Template specialisation vs overloading." · "`constexpr` vs `consteval` vs `constinit`." · "Why are template errors so bad and what fixed it?"

---

## 6. Error handling: exceptions, `expected`, and contracts

```cpp
// C++23 std::expected — errors as values, no exception cost, forces handling
std::expected<Order, ParseError> parse_order(std::string_view json);

auto r = parse_order(body);
if (!r) return http::bad_request(r.error().message);
process(*r);

// Monadic chaining (C++23)
auto total = parse_order(body)
    .transform([](const Order& o){ return o.total(); })
    .value_or(0.0);
```

Exceptions are still right for *exceptional* conditions; `expected` is right for expected failure modes (parsing, lookup, validation). Never use exceptions for control flow, and never let one escape a destructor or a `noexcept` function.

**C++26 contracts** state pre/postconditions the compiler and runtime can check:

```cpp
int divide(int a, int b)
    pre(b != 0)
    post(r: r * b <= a);
```

Enforcement is a build-mode choice (ignore / observe / enforce), so you can ship checks in staging and elide them in release.

> **Asked as:** "Exceptions vs error codes vs `expected`." · "What is exception safety — basic, strong, nothrow?" · "Why is `noexcept` important?"

---

## 7. Concurrency

```cpp
#include <thread>
#include <mutex>
#include <atomic>

std::mutex m;
std::atomic<int> counter{0};          // lock-free increment

{
    std::scoped_lock lk(m, other_m);  // C++17: locks BOTH with deadlock avoidance
    shared.push_back(x);
}                                     // RAII unlock

counter.fetch_add(1, std::memory_order_relaxed);   // no ordering needed for a pure counter

// std::jthread (C++20): joins in its destructor and supports cooperative cancellation
std::jthread worker([](std::stop_token st) {
    while (!st.stop_requested()) do_chunk();
});   // destructor requests stop and joins
```

Memory orders, from cheapest: `relaxed` (counters only) → `acquire`/`release` (the standard pairing for publishing data) → `seq_cst` (default; a global total order, easiest to reason about, slowest). Use `seq_cst` unless you have benchmarked a reason not to.

Data race = two threads, same location, at least one write, no synchronisation → **undefined behaviour**, not "a wrong number". Run with `-fsanitize=thread`.

C++26's `std::execution` (senders/receivers) gives a standard, composable async model — a structured alternative to ad-hoc thread pools and callback chains.

> **Asked as:** "`mutex` vs `atomic`." · "Explain acquire/release." · "What is `std::jthread` and why was it added?" · "How do you avoid deadlock?"

---

## 8. Performance: what actually makes C++ fast

```cpp
// Array of Structs (cache-hostile for column scans)
struct Particle { float x, y, z; float vx, vy, vz; int id; };
std::vector<Particle> particles;

// Struct of Arrays (SoA) — vectorises, touches only what you read
struct Particles {
    std::vector<float> x, y, z, vx, vy, vz;
};
```

Priorities, in order: **algorithmic complexity → memory layout/cache locality → allocation count → branch prediction → SIMD**. A linear scan over a `vector` beats a `list` traversal by an order of magnitude for the same O(n) because of cache lines.

- `reserve()` before a known-size fill — every reallocation is a copy/move of everything.
- Pass by `const&` for large types, by value for cheap ones (`int`, `string_view`, `span`).
- `std::string_view` / `std::span` for non-owning views — no allocation, no copy. **Never** return a `string_view` into a temporary.
- Measure with `perf stat`, `perf record`, Google Benchmark, and look at the assembly on Compiler Explorer before believing anything.

> **Asked as:** "Why is `vector` faster than `list` even for insertions?" · "What is false sharing?" (two threads writing different variables on the same 64-byte cache line — pad with `alignas(64)`) · "When would you pass by value?"

---

## 9. Rapid-fire answers

| Question | Answer |
|---|---|
| Virtual destructor | Required in any base class deleted through a base pointer — otherwise UB |
| vtable | Per-class table of function pointers; each polymorphic object stores a vptr |
| `static_cast` vs `dynamic_cast` | Compile-time conversion vs runtime-checked downcast (needs RTTI, returns null/throws) |
| `const_cast` | Removes constness — UB if the object was actually const. Almost always a design smell |
| `reinterpret_cast` | Bit reinterpretation — the escape hatch; check strict aliasing |
| Shallow vs deep copy | Default copy is member-wise; raw pointers get shared → double free |
| `explicit` | Prevents implicit one-arg conversions |
| `override` / `final` | Compiler-checked overriding; `final` blocks further overriding and enables devirtualisation |
| Copy elision / RVO | Guaranteed for prvalues since C++17 — return by value freely |
| `std::optional` vs pointer | Value-semantics "maybe", no allocation, no null-deref confusion |
| Undefined behaviour | Same rules as C — signed overflow, OOB, use-after-free, data races |
| Header-only vs compiled | Templates must be visible at instantiation → headers; use explicit instantiation or modules (C++20) to cut build time |
