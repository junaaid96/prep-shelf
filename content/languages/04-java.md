# Java — Deep Dive & Interview Reference (2026)

**Current state (Sept 2026):** **Java 25 (LTS, Sept 2025)** is the target for new production work; **Java 26** (Mar 2026) is the current non-LTS feature release and **Java 27 (LTS)** lands this month. Java 21 remains widely deployed. Virtual threads, records, sealed types, pattern matching for `switch`, and the sequenced collections are all final and mainstream now.

---

## 1. Memory model: stack, heap, and what "pass by value" really means

Java is **always pass-by-value**. For objects, the *reference* is copied — so you can mutate the object the caller sees, but you cannot reassign the caller's variable.

```java
void mutate(List<String> list) { list.add("x"); }      // caller sees "x"
void reassign(List<String> list) { list = new ArrayList<>(); }  // caller sees nothing
```

| Region | Holds | Notes |
|---|---|---|
| Stack (per thread) | primitives, references, frames | `StackOverflowError` on deep recursion |
| Heap — young gen (Eden + Survivor) | new objects | Most objects die here; minor GC is cheap |
| Heap — old gen | long-lived objects | Major/full GC is the expensive one |
| Metaspace | class metadata | Native memory, grows dynamically since Java 8 |

**Escape analysis** may keep short-lived objects off the heap entirely. **G1** is the default collector; **ZGC** (generational since 21) gives sub-millisecond pauses on large heaps and is the right pick for latency-sensitive services.

```bash
java -XX:+UseZGC -XX:+ZGenerational -Xmx4g -XX:MaxMetaspaceSize=512m \
     -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps app.jar
```

> **Asked as:** "Is Java pass-by-value or reference?" · "Walk me through the heap generations." · "Which GC would you choose and why?" · "What causes `OutOfMemoryError: Metaspace`?"

---

## 2. `equals`/`hashCode`, and why `HashMap` breaks without them

The contract: equal objects **must** have equal hash codes; unequal objects *may* collide. Break it and `HashMap`/`HashSet` silently lose entries.

```java
public final class Sku {
    private final String code;
    private final String variant;

    // ... constructor ...

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Sku other)) return false;   // pattern matching for instanceof
        return code.equals(other.code) && variant.equals(other.variant);
    }
    @Override public int hashCode() { return Objects.hash(code, variant); }
}
```

**Records give you both for free**, plus `toString`, and they're immutable:

```java
public record Sku(String code, String variant) {
    public Sku {                                  // compact constructor = validation
        Objects.requireNonNull(code);
        if (variant.isBlank()) throw new IllegalArgumentException("variant required");
    }
}
```

**The mutable-key trap:** put an object in a `HashSet`, then mutate a field used in `hashCode` — the object is now in the wrong bucket and `contains()` returns false. Keys must be immutable.

Internals worth knowing: `HashMap` uses buckets; since Java 8, a bucket with >8 entries and a table ≥64 converts from a linked list to a **red-black tree**, so worst-case lookup is O(log n) not O(n).

> **Asked as:** "What happens if you override `equals` but not `hashCode`?" · "How does `HashMap` work internally?" · "Why must map keys be immutable?"

---

## 3. Collections — choosing correctly

| Need | Use | Complexity |
|---|---|---|
| Indexed access, iteration | `ArrayList` | O(1) get, O(n) mid-insert |
| Frequent head/tail insert, queue | `ArrayDeque` | O(1) both ends — beats `LinkedList` in practice |
| Unique, no order | `HashSet` | O(1) avg |
| Unique, sorted / range queries | `TreeSet` | O(log n), `headSet/tailSet/subSet` |
| Insertion-order or LRU | `LinkedHashMap` | override `removeEldestEntry` for an LRU |
| Concurrent map | `ConcurrentHashMap` | lock-striped, no full-map lock |
| Concurrent, read-heavy list | `CopyOnWriteArrayList` | writes copy the array — reads never lock |
| Producer/consumer handoff | `LinkedBlockingQueue`, `ArrayBlockingQueue` | blocking `put`/`take` |

```java
// A 5-minute LRU cache without a library
Map<String, byte[]> lru = new LinkedHashMap<>(16, 0.75f, true) {
    @Override protected boolean removeEldestEntry(Map.Entry<String, byte[]> e) {
        return size() > 1000;
    }
};

// Sequenced collections (Java 21+) — a uniform first/last API at last
SequencedSet<String> s = new LinkedHashSet<>(List.of("a", "b", "c"));
s.getFirst(); s.getLast(); s.reversed();
```

`Collections.unmodifiableList(x)` wraps (the underlying list can still change); `List.copyOf(x)` / `List.of(...)` are genuinely immutable and reject nulls.

> **Asked as:** "`ArrayList` vs `LinkedList` — which and why?" · "Implement an LRU cache." · "`HashMap` vs `ConcurrentHashMap` vs `Hashtable`."

---

## 4. Concurrency: from `synchronized` to virtual threads

```java
// Classic: explicit pool, platform threads (expensive, ~1 MB stack each)
ExecutorService pool = Executors.newFixedThreadPool(200);

// Java 21+: virtual threads — millions are fine, each is a few hundred bytes
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<Invoice>> futures = ids.stream()
        .map(id -> executor.submit(() -> httpClient.fetchInvoice(id)))   // blocking is FINE here
        .toList();
    for (var f : futures) process(f.get());
}   // close() waits for all tasks
```

Virtual threads change the guidance: **stop building thread pools for I/O**. A blocking call on a virtual thread unmounts it from its carrier thread, so "thread-per-request with blocking JDBC" scales again. Two caveats: `synchronized` blocks used to pin the carrier thread (largely fixed in JDK 24+ — prefer `ReentrantLock` if you're on 21), and thread-local-heavy libraries can blow up memory when you have a million threads.

**Structured concurrency (finalised in 25):**

```java
try (var scope = StructuredTaskScope.open()) {
    var user   = scope.fork(() -> userService.find(id));
    var orders = scope.fork(() -> orderService.findByUser(id));
    scope.join();                       // one failure cancels the siblings
    return new Dashboard(user.get(), orders.get());
}
```

**Visibility vs atomicity** — the distinction that trips people up:

```java
private volatile boolean running = true;   // visibility only: other threads see the write
private int counter = 0;                   // count++ is read-modify-write — NOT atomic

// Fixes:
private final AtomicInteger safeCounter = new AtomicInteger();   // CAS-based
private final LongAdder highContention = new LongAdder();        // better under heavy contention
```

`ConcurrentHashMap.computeIfAbsent` is atomic; `if (!map.containsKey(k)) map.put(k, v)` is a race.

> **Asked as:** "What does `volatile` guarantee — and what doesn't it?" · "Virtual threads vs platform threads." · "How do you make `count++` thread-safe?" · "Explain deadlock and how to avoid it." (consistent lock ordering, `tryLock` with timeout, keep critical sections small)

---

## 5. Streams and functional style

```java
record Order(String id, String customerId, Status status, BigDecimal total) {}

Map<String, BigDecimal> revenueByCustomer = orders.stream()
    .filter(o -> o.status() == Status.PAID)
    .collect(Collectors.groupingBy(
        Order::customerId,
        Collectors.reducing(BigDecimal.ZERO, Order::total, BigDecimal::add)));

// Teeing — two collectors in one pass (Java 12+)
record Stats(long count, BigDecimal sum) {}
Stats stats = orders.stream().collect(Collectors.teeing(
    Collectors.counting(),
    Collectors.reducing(BigDecimal.ZERO, Order::total, BigDecimal::add),
    Stats::new));
```

Rules that matter in review:

- Streams are **lazy**; nothing runs until a terminal operation. A stream is consumed once.
- **Don't mutate external state** inside a stream (`forEach(list::add)`) — use a collector.
- `parallelStream()` only helps for large, CPU-bound, splittable work with no shared state. It uses the common ForkJoinPool, so one bad parallel stream can starve everything else in the JVM. Default to sequential.
- `Optional` is a **return type**, not a field type or parameter type. `orElseGet` is lazy; `orElse` always evaluates its argument.

```java
// Bad: computes the fallback even when present
user.orElse(expensiveDefault());
// Good
user.orElseGet(this::expensiveDefault);
```

> **Asked as:** "Intermediate vs terminal operations." · "When is `parallelStream` a bad idea?" · "`map` vs `flatMap`." · "Why shouldn't `Optional` be a field?"

---

## 6. Modern language features you're expected to use (21–26)

```java
// Sealed hierarchy + records + pattern matching for switch = algebraic data types
sealed interface PaymentEvent permits Authorized, Captured, Failed {}
record Authorized(String id, BigDecimal amount) implements PaymentEvent {}
record Captured(String id, Instant at)        implements PaymentEvent {}
record Failed(String id, String reason)       implements PaymentEvent {}

String describe(PaymentEvent e) {
    return switch (e) {                                   // exhaustive — no default needed
        case Authorized(String id, var amt) when amt.compareTo(BigDecimal.valueOf(10_000)) > 0
                -> "large auth " + id;                    // record deconstruction + guard
        case Authorized a -> "auth " + a.id();
        case Captured(String id, var at) -> "captured " + id + " at " + at;
        case Failed f -> "failed: " + f.reason();
    };
}

// Text blocks
String query = """
    SELECT o.id, o.total
      FROM orders o
     WHERE o.status = ?
     ORDER BY o.created_at DESC
    """;

// var — for locals only, when the RHS makes the type obvious
var byStatus = new EnumMap<Status, List<Order>>(Status.class);
```

Java 25 also brought **compact source files and instance `main`** (no `public static void main(String[] args)` ceremony for scripts) and **module import declarations**.

> **Asked as:** "What are sealed classes for?" · "Show pattern matching for switch." · "Record vs class vs Lombok @Value."

---

## 7. Exceptions and API design

- **Checked** for recoverable, caller-actionable conditions; **unchecked** for programming errors and infrastructure failures. Modern frameworks (Spring) lean heavily unchecked because checked exceptions don't compose with lambdas/streams.
- Never `catch (Exception e) { }`. Never `catch` and `e.printStackTrace()`.
- Wrap with context: `throw new OrderProcessingException("order " + id, e);` — keep the cause.
- `try-with-resources` for anything `AutoCloseable`; suppressed exceptions are attached automatically.

```java
try (var conn = ds.getConnection();
     var ps = conn.prepareStatement(SQL)) {          // both closed, reverse order, even on throw
    ps.setString(1, status.name());
    try (var rs = ps.executeQuery()) { ... }
} catch (SQLException e) {
    throw new DataAccessException("failed loading orders for " + status, e);
}
```

**`finally` overriding a return** is a classic gotcha — a `return` inside `finally` discards the exception. Don't.

> **Asked as:** "Checked vs unchecked — when do you use each?" · "What does try-with-resources compile to?" · "Difference between `throw` and `throws`."

---

## 8. JVM performance and troubleshooting

```bash
jcmd <pid> Thread.print                   # thread dump — find deadlocks and stuck threads
jcmd <pid> GC.heap_info
jcmd <pid> JFR.start duration=60s filename=rec.jfr   # Flight Recorder — the go-to profiler
jmap -dump:live,format=b,file=heap.hprof <pid>       # then open in Eclipse MAT
```

A production triage order that works:

1. **Metrics first** — is it CPU, memory, GC pause, or thread starvation? (Actuator + Prometheus)
2. **Thread dump** if latency is up but CPU is flat → blocked threads, exhausted connection pool.
3. **JFR / async-profiler flame graph** if CPU is high.
4. **Heap dump** if memory grows monotonically → dominator tree in MAT names the leak.

Common real causes: N+1 queries, a connection pool sized 10 behind 200 concurrent requests, unbounded caches, logging at DEBUG in production, regex catastrophic backtracking, `String` concatenation in loops (use `StringBuilder`).

**Startup:** CDS/AppCDS, `-XX:TieredStopAtLevel=1` for short-lived jobs, and GraalVM native-image (or Spring Boot 4 AOT) when cold start matters.

> **Asked as:** "Service latency spiked — walk me through your investigation." · "How do you find a memory leak?" · "What is JIT and what does tiered compilation mean?"

---

## 9. Rapid-fire answers

| Question | Answer |
|---|---|
| `String` immutability | Enables the string pool, safe hashing, thread safety; use `StringBuilder` for loops |
| `==` vs `.equals()` | Reference identity vs value; `Integer` caches -128..127 so `==` misleads |
| Abstract class vs interface | State + constructors vs multiple inheritance of behaviour (`default` methods since 8) |
| `static` nested vs inner class | Inner holds an implicit outer reference — a common leak source |
| `final` | Variable: no reassignment. Method: no override. Class: no subclass |
| Autoboxing pitfall | `Long a = 128L; Long b = 128L; a == b` is false |
| `Comparable` vs `Comparator` | Natural order inside the class vs external, multiple orderings |
| Serialization | Avoid Java serialization — it's a deserialization-RCE vector; use JSON/protobuf |
| `Class.forName` / reflection | Runtime type access; slow and breaks under GraalVM without config |
| Generics erasure | Type args erased at runtime; hence no `new T[]`, and `List<String>`/`List<Integer>` share a class |
