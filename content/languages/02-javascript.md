# JavaScript — Deep Dive & Interview Reference (2026)

**Current state (Sept 2026):** Node.js **24 LTS** and **26** (the incoming LTS) are the production targets; Node 22 is in maintenance. The language spec is ES2025/ES2026 — `Array.prototype.at`, `Object.groupBy`, `Promise.withResolvers`, top-level `await`, and native ESM are all baseline. Bun and Deno are real alternatives for tooling and scripts, but Node still owns production backends.

---

## 1. The engine model: call stack, event loop, microtasks

JavaScript is single-threaded with an event loop. Understanding the ordering rules answers a huge share of interview questions.

```js
console.log("1 sync");

setTimeout(() => console.log("5 macrotask"), 0);

queueMicrotask(() => console.log("3 microtask"));

Promise.resolve().then(() => console.log("4 microtask (promise)"));

console.log("2 sync");

// Output: 1 sync → 2 sync → 3 microtask → 4 microtask (promise) → 5 macrotask
```

**The rule:** the stack runs to completion → *all* pending microtasks drain (promises, `queueMicrotask`, `MutationObserver`) → then **one** macrotask (timer, I/O, UI event) → drain microtasks again → repeat.

A microtask that schedules another microtask starves the macrotask queue — an infinite `Promise.resolve().then(loop)` freezes the page while `setTimeout(loop, 0)` does not.

**Node-specific phases:** timers → pending callbacks → poll → check (`setImmediate`) → close. `process.nextTick` runs *before* the promise microtask queue.

```js
setImmediate(() => console.log("check"));
setTimeout(() => console.log("timer"), 0);
process.nextTick(() => console.log("nextTick"));
Promise.resolve().then(() => console.log("promise"));
// nextTick → promise → timer/check (order between the last two is non-deterministic at top level)
```

> **Asked as:** "Explain the event loop." · "Order these logs." · "Difference between `setTimeout(fn,0)` and `setImmediate`?" · "What is a microtask?"

---

## 2. `this`, closures, and scope

`this` is decided by **how a function is called**, not where it's defined — except for arrow functions, which capture `this` lexically at creation.

```js
const counter = {
  count: 0,
  incBroken() {
    setTimeout(function () { this.count++; }, 100);   // `this` === undefined/global
  },
  incFixed() {
    setTimeout(() => { this.count++; }, 100);          // arrow captures `counter`
  },
};

// Explicit binding
function greet(greeting) { return `${greeting}, ${this.name}`; }
greet.call({ name: "Junaid" }, "Hi");     // args listed
greet.apply({ name: "Junaid" }, ["Hi"]);  // args as array
const bound = greet.bind({ name: "Junaid" }); bound("Hi");
```

**Closure** = a function plus the scope it was created in, kept alive after the outer call returns. This is how private state, memoisation, and module patterns work.

```js
function createRateLimiter(maxPerMinute) {
  const hits = new Map();                     // captured, private, survives every call
  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= maxPerMinute) return false;
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
const allow = createRateLimiter(5);
```

The classic loop bug and its two fixes:

```js
for (var i = 0; i < 3; i++) setTimeout(() => console.log(i));  // 3 3 3
for (let i = 0; i < 3; i++) setTimeout(() => console.log(i));  // 0 1 2  (let = per-iteration binding)
```

> **Asked as:** "What is a closure? Give a real use." · "Why does the `var` loop log 3 3 3?" · "call vs apply vs bind." · "When would an arrow function be wrong?"

---

## 3. Prototypes and classes

Every object has an internal `[[Prototype]]` link. Property lookup walks the chain until it finds the key or hits `null`. `class` is syntax over this — not a separate system.

```js
class Repository {
  #db;                                   // real private field (not just a convention)
  static registry = new Map();           // static field

  constructor(db) { this.#db = db; }
  async findById(id) { return this.#db.get(id); }
}

class CachedRepository extends Repository {
  #cache = new Map();
  async findById(id) {
    if (this.#cache.has(id)) return this.#cache.get(id);
    const row = await super.findById(id);   // super → parent prototype method
    this.#cache.set(id, row);
    return row;
  }
}

Object.getPrototypeOf(new CachedRepository()) === CachedRepository.prototype; // true
```

Prefer **composition over inheritance**: deep class hierarchies in JS are as brittle as anywhere else. Most "inheritance" needs are better served by passing collaborators in.

> **Asked as:** "How does prototypal inheritance differ from classical?" · "What does `new` actually do?" (creates an object, links its prototype, binds `this`, returns it unless the ctor returns an object) · "How do you make a truly private field?"

---

## 4. Async: promises, async/await, cancellation

```js
// Run in parallel, not sequentially — the single most common async mistake
const [user, orders] = await Promise.all([fetchUser(id), fetchOrders(id)]);

// Partial failure tolerated
const results = await Promise.allSettled([a(), b(), c()]);
const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);

// First to succeed wins; rejects only if ALL reject (AggregateError)
const fastest = await Promise.any([mirror1(), mirror2()]);

// First to settle either way — used for timeouts
await Promise.race([work(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
```

**Cancellation** is `AbortController`, and it composes:

```js
async function fetchWithTimeout(url, ms = 5000, parentSignal) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("timeout")), ms);
  parentSignal?.addEventListener("abort", () => ac.abort(parentSignal.reason));
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);              // always clean up
  }
}
// Node 20+/browsers also ship AbortSignal.timeout(ms) and AbortSignal.any([...])
```

**Sequential when you need it**, with a concurrency cap — the pattern that shows up in every "process 10 000 records" task:

```js
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}
```

**Unhandled rejections crash Node** by default since v15 — always attach a `.catch` or wrap top-level awaits.

> **Asked as:** "`Promise.all` vs `allSettled` vs `race` vs `any`." · "How do you cancel an in-flight request?" · "Process 5000 items with max 10 concurrent — write it." · "What happens to an unhandled promise rejection?"

---

## 5. Equality, coercion, and the parts that bite

```js
0.1 + 0.2 === 0.3            // false — IEEE-754. Use a tolerance or integer cents.
NaN === NaN                  // false. Use Number.isNaN / Object.is
[] == false                  // true  (== coerces)  → always use ===
null == undefined            // true  with ==, false with ===
typeof null                  // "object"  (a 1995 bug, kept for compatibility)
typeof []                    // "object"  → use Array.isArray(x)

// Nullish coalescing vs OR — matters when 0 or "" are valid values
const port = config.port ?? 3000;   // 0 stays 0
const bad  = config.port || 3000;   // 0 becomes 3000  ← bug

// Optional chaining short-circuits the whole expression
const city = user?.address?.city ?? "unknown";
```

`structuredClone(obj)` is the built-in deep clone (handles Map, Set, Date, cycles — not functions or DOM nodes). `JSON.parse(JSON.stringify(x))` silently drops `undefined`, functions, `Date` becomes a string, and throws on cycles.

> **Asked as:** "Why is `0.1+0.2 !== 0.3`?" · "`??` vs `||`." · "How do you deep clone an object?" · "Explain `==` coercion rules."

---

## 6. Modules, bundling, and the CJS/ESM split

```js
// ESM — static, tree-shakeable, top-level await allowed
import { readFile } from "node:fs/promises";
export const load = async (p) => JSON.parse(await readFile(p, "utf8"));

// Dynamic import — code splitting / conditional loading
const { default: heavy } = await import("./heavy-chart.js");
```

`package.json` decides the mode: `"type": "module"` → `.js` is ESM; otherwise CommonJS, with `.mjs`/`.cjs` as explicit overrides. Node 22+ can `require()` a synchronous ESM graph, which removed most of the pain, but **dual-package hazards** (a library loaded as both CJS and ESM has two separate instances of its state) still exist. Publish one format, use `exports` maps, and prefer ESM.

Tree-shaking only works on static `import`/`export` — CommonJS `require` and re-exported side effects defeat it. Mark packages `"sideEffects": false` when true.

> **Asked as:** "CommonJS vs ESM." · "What is tree-shaking and what breaks it?" · "How do you lazy-load a module?"

---

## 7. Memory and leaks in long-running Node services

Common leak sources, in the order you'll actually meet them:

1. **Unbounded caches / `Map`s** keyed on user or request data → use an LRU (`lru-cache`) with a max size, or `WeakMap`/`WeakRef` when the key's lifetime should govern.
2. **Forgotten listeners.** `emitter.on(...)` inside a request handler adds a listener per request. Watch for the `MaxListenersExceededWarning`.
3. **Closures capturing large objects.** A tiny callback holding a reference to a 50 MB buffer keeps it alive.
4. **Timers never cleared** (`setInterval` in a class that gets recreated).
5. **Global arrays used as logs/queues.**

```bash
node --inspect app.js          # then Chrome DevTools → Memory → take two heap snapshots under load and diff
node --max-old-space-size=2048 app.js
```

> **Asked as:** "How would you debug a memory leak in Node?" · "`WeakMap` vs `Map` — when does it matter?"

---

## 8. Node backend patterns worth knowing

```js
import express from "express";
const app = express();

// Express 5 (stable since 2025) forwards async errors automatically —
// in Express 4 you had to wrap every async handler.
app.get("/orders/:id", async (req, res) => {
  const order = await service.find(req.params.id);
  if (!order) return res.status(404).json({ error: "not_found" });
  res.json(order);
});

// Centralised error handler — 4 args marks it as one
app.use((err, req, res, _next) => {
  req.log?.error({ err }, "request failed");
  const status = err.status ?? 500;
  res.status(status).json({ error: status === 500 ? "internal_error" : err.message });
});

// Graceful shutdown — required for zero-downtime deploys in Kubernetes
const server = app.listen(3000);
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    server.close(async () => { await db.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();   // hard cap
  });
}
```

**Streams** are how you stay memory-flat:

```js
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";

await pipeline(createReadStream("big.csv"), createGzip(), createWriteStream("big.csv.gz"));
// pipeline handles backpressure AND destroys every stream on error — manual .pipe() does not
```

Use `worker_threads` for CPU-bound work (JSON of tens of MB, image processing, crypto) so the event loop keeps serving requests; use `cluster`/PM2/Kubernetes replicas for horizontal scale.

> **Asked as:** "How do you handle errors in Express?" · "Why streams instead of reading the file?" · "How does Node use multiple cores?" · "Implement graceful shutdown."

---

## 9. Rapid-fire answers

| Question | Answer |
|---|---|
| Hoisting | `var` and function declarations are hoisted and initialised (`undefined`/full fn); `let`/`const` are hoisted but in the **temporal dead zone** until initialised |
| Event delegation | Attach one listener on a parent and read `event.target` — fewer listeners, works for dynamically added children |
| Debounce vs throttle | Debounce fires after quiet period (search box); throttle fires at most once per interval (scroll) |
| `map`/`filter`/`reduce` | Return new arrays/values, never mutate; `forEach` returns undefined and can't be broken out of |
| Currying | `f(a)(b)(c)` — partial application via closures |
| Generator use | Lazy sequences, custom iteration, and pausing/resuming (`yield`) |
| Deep freeze | `Object.freeze` is shallow; recurse for nested |
| Symbol | Unique property key — avoids collisions, powers `Symbol.iterator`/`Symbol.asyncIterator` |
| Proxy/Reflect | Intercept property access — how Vue reactivity and many mocking libs work |
| `Object.groupBy` (ES2024) | `Object.groupBy(orders, o => o.status)` — replaces hand-rolled reduce grouping |
