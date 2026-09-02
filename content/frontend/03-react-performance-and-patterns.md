# 3. React Performance & Component Patterns

Performance work in React is 90% "stop doing unnecessary work" and 10% clever tricks. This note covers how to find the waste, the patterns that prevent it structurally, and what the React Compiler changes.

---

## 3.1 Measure first

```jsx
import { Profiler } from "react";

<Profiler id="OrderTable" onRender={(id, phase, actual, base) => {
  if (actual > 16) console.warn(`${id} ${phase} took ${actual.toFixed(1)}ms (baseline ${base.toFixed(1)})`);
}}>
  <OrderTable rows={rows} />
</Profiler>
```

Tools, in order of usefulness:

1. **React DevTools Profiler** — record an interaction, look at the flame graph, and turn on "Highlight updates when components render" to *see* the waste.
2. **Chrome Performance panel** — for long tasks, layout thrash, and INP attribution. Anything over 50 ms is a long task.
3. **Lighthouse / Web Vitals in production (RUM)** — lab numbers lie; real user data doesn't.
4. **`why-did-you-render`** in dev to identify re-renders caused by unstable props.

Fix the biggest flame bar. Don't `memo()` everything on instinct — memoisation has its own cost (comparison + retained memory) and a wrong dependency array is worse than no memo at all.

> **Asked as:** "How do you find a React performance problem?" · "What's a 'long task' and why does it matter?"

---

## 3.2 The React Compiler changes the default

React 19's compiler (Babel/SWC plugin, opt-in per project) automatically memoises components and values based on data-flow analysis. Where it's enabled, most manual `useMemo`/`useCallback`/`React.memo` becomes unnecessary — and hand-written memoisation that fights the compiler can make things worse.

```js
// babel.config.js
plugins: [["babel-plugin-react-compiler", { target: "19" }]]
```

The compiler **requires your components to follow the Rules of React**: pure render, no mutation of props/state during render, hooks called unconditionally. Run `eslint-plugin-react-compiler` — it tells you exactly which components were skipped and why.

Practical guidance in 2026:

- New project on React 19 → enable the compiler, write plain code, memoise only where the profiler proves a need.
- Existing large codebase → adopt incrementally with the `sources` filter; keep existing memos, don't add new ones by reflex.

> **Asked as:** "What does the React Compiler do?" · "Does it mean `useMemo` is dead?" (no — expensive non-render computations, stable refs for external libs, and non-compiled files still need it)

---

## 3.3 Manual memoisation, done right

```jsx
const Row = React.memo(function Row({ order, onSelect }) {
  return <tr onClick={() => onSelect(order.id)}><td>{order.id}</td></tr>;
});

function Table({ orders }) {
  // Without useCallback, a NEW function each render → React.memo always fails
  const onSelect = useCallback((id) => dispatch({ type: "select", id }), []);

  // Only memo genuinely expensive work — sorting 10k rows, not `a + b`
  const sorted = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  return <tbody>{sorted.map(o => <Row key={o.id} order={o} onSelect={onSelect} />)}</tbody>;
}
```

`React.memo` does a **shallow** prop comparison. It fails silently if you pass:
- an inline arrow (`onClick={() => …}`)
- an inline object/array literal (`style={{…}}`, `items={[…]}`)
- a `children` element created fresh each render

Structural fixes usually beat memoisation:

```jsx
// ✗ Every context value change re-renders every consumer
<AppContext.Provider value={{ user, theme, setTheme }}>

// ✓ Split by change frequency + memoise the value
const themeValue = useMemo(() => ({ theme, setTheme }), [theme]);
<UserContext.Provider value={user}>
  <ThemeContext.Provider value={themeValue}>
```

> **Asked as:** "Why isn't my `React.memo` working?" · "`useMemo` vs `useCallback`." · "How do you stop a context from re-rendering everything?"

---

## 3.4 Rendering large lists

Two independent problems: **rendering cost** (thousands of DOM nodes) and **update cost** (re-rendering rows that didn't change).

```jsx
import { useVirtualizer } from "@tanstack/react-virtual";

function OrderList({ orders }) {
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  return (
    <div ref={parentRef} style={{ height: 600, overflow: "auto" }}>
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map(v => (
          <div key={orders[v.index].id}
               style={{ position: "absolute", top: 0, left: 0, width: "100%",
                        height: v.size, transform: `translateY(${v.start}px)` }}>
            <OrderRow order={orders[v.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

Virtualise past roughly 100–200 rows. Combine with `content-visibility: auto` in CSS for cheap wins on long static pages, and paginate/filter server-side when the dataset is genuinely large — the fastest render is the one you don't do.

> **Asked as:** "How do you render 50 000 rows?" · "What is windowing/virtualisation?"

---

## 3.5 Bundle size and code splitting

```jsx
const Analytics = lazy(() => import("./Analytics"));      // route-level split

<Suspense fallback={<PageSkeleton />}>
  <Analytics />
</Suspense>

// Preload on intent — hover/focus, so the chunk is warm before the click
<Link onMouseEnter={() => import("./Analytics")} to="/analytics">Analytics</Link>
```

Where the kilobytes actually go:

- **Route-level splitting** first — it's the biggest win for the least effort.
- **Heavy libraries**: swap `moment` (~70 kB) for `date-fns`/`Temporal`, `lodash` for individual imports or native methods, a full chart library for a lazily-loaded chunk.
- **Icon libraries** imported as a barrel (`import { X } from "icons"`) can pull in thousands of components — import per-file or use a plugin.
- **Analyse before guessing**: `vite-bundle-visualizer`, `@next/bundle-analyzer`, or `source-map-explorer`.
- Ship **modern output** (ES2020+) — no legacy transpilation for browsers that don't need it.

> **Asked as:** "How would you cut bundle size?" · "How does code splitting work?" · "What's a barrel-file problem?"

---

## 3.6 Component patterns that scale

**Composition over configuration.** A component with 14 boolean props is a design failure; expose slots instead.

```jsx
// ✗ prop explosion
<Card title="x" subtitle="y" showFooter hasIcon iconName="check" variant="danger" dense />

// ✓ compound components
<Card>
  <Card.Header>
    <Card.Title>Order #1024</Card.Title>
    <Card.Actions><Button variant="ghost">Edit</Button></Card.Actions>
  </Card.Header>
  <Card.Body>…</Card.Body>
</Card>
```

**Custom hooks for logic, components for markup.** Anything stateful and reusable should be a hook.

```jsx
function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function useMediaQuery(query) {
  // useSyncExternalStore is the tear-free way to read external state
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia(query).matches,
    () => false                          // SSR snapshot
  );
}
```

**Headless components.** Radix UI / React Aria / Headless UI give you behaviour + accessibility with zero styling — the right default in 2026 for menus, dialogs, comboboxes, and anything with complex keyboard semantics. Writing your own accessible combobox is a week of work you'll get wrong.

**Container/presentational** is largely obsolete as a rule, but the underlying idea survives: keep data-fetching at the route/server boundary and let leaf components take plain props — it makes them trivial to test and to reuse.

**Render props / HOCs** are legacy patterns; hooks replaced almost every use. You'll still meet HOCs in older codebases (`withRouter`, `connect`).

> **Asked as:** "How do you avoid prop drilling?" · "When do you extract a custom hook?" · "Compound components — show me one." · "HOC vs render prop vs hook."

---

## 3.7 Forms

Controlled inputs re-render on every keystroke. For small forms that's fine; for large ones it's the main source of input lag.

```jsx
// react-hook-form: uncontrolled by default, minimal re-renders, schema validation
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const Schema = z.object({ email: z.string().email(), amount: z.coerce.number().positive() });

function PaymentForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(Schema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <label htmlFor="email">Email</label>
      <input id="email" {...register("email")} aria-invalid={!!errors.email}
             aria-describedby={errors.email ? "email-err" : undefined} />
      {errors.email && <p id="email-err" role="alert">{errors.email.message}</p>}
      <button disabled={isSubmitting}>Pay</button>
    </form>
  );
}
```

Validate with the **same schema on client and server** — the client copy is UX, the server copy is security.

> **Asked as:** "Controlled vs uncontrolled — trade-offs." · "Why is my big form laggy?" · "Where should validation live?"

---

## 3.8 Anti-patterns checklist

| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| Index as `key` in a mutable list | Wrong element reuse, state bleeding | Stable id |
| Derived state stored in `useState` + synced by Effect | Drift, extra renders, race conditions | Compute during render |
| Fetching in every component | Waterfalls, duplicate requests | React Query / RSC / route loader |
| One giant context | Everything re-renders | Split by change frequency |
| `useEffect` with no cleanup on subscriptions | Leaks, double handlers | Return a cleanup fn |
| Inline objects/arrows into memoised children | Memo always misses | `useCallback`/`useMemo`/hoist |
| `useState` for values that don't render | Needless re-renders | `useRef` |
| Mutating props or state | React sees no change | Copy on write |
| Business logic in JSX | Untestable | Extract to hooks/functions |
| Giant `_app`/root client component | Whole tree ships to the client | Push `"use client"` down to leaves |

> **Asked as:** "Review this component — what's wrong with it?" (this table is the checklist to run through out loud)
