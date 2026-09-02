# 2. React Core — Hooks, Rendering, and the 2026 Mental Model

**Current state (Sept 2026):** **React 19.2.x** is the stable line. React 19 brought the **React Compiler** (auto-memoisation), **Actions** + `useActionState`/`useFormStatus`/`useOptimistic`, `use()`, ref-as-a-prop (no more `forwardRef`), Document Metadata, and stable Server Components. React 18 is security-only. Next.js 16 is the dominant meta-framework; Vite + React Router 7 is the strong SPA alternative.

---

## 2.1 The core loop: render → reconcile → commit

React is a function of state: `UI = f(state)`. When state changes React **re-renders** (calls your component function again), **reconciles** the returned element tree against the previous one, and **commits** the minimal DOM mutations.

A re-render is *not* a DOM update. Calling your component 100 times with the same output touches the DOM zero times. This is why "re-render" panic is usually misplaced — but it's also why an expensive computation inside a component body hurts.

**Reconciliation rules:**
1. Different element type at the same position → destroy the subtree and rebuild it (state is lost).
2. Same type → keep the instance, update props.
3. Lists are matched by **`key`**.

```jsx
// ✗ Index keys: deleting the first item makes React reuse the wrong DOM/state
{todos.map((t, i) => <TodoRow key={i} todo={t} />)}

// ✓ Stable identity
{todos.map(t => <TodoRow key={t.id} todo={t} />)}
```

**Conditional rendering that loses state accidentally:**

```jsx
{isEditing ? <Panel><EditForm/></Panel> : <Panel><ViewForm/></Panel>}
// Panel is at the same position → preserved. EditForm/ViewForm differ → their state resets. Usually fine.

// Forcing a reset on purpose — the `key` trick
<UserProfile key={userId} userId={userId} />   // new user = fresh state, no useEffect needed
```

> **Asked as:** "What is reconciliation?" · "Why do keys matter and why not the index?" · "How do you reset a component's state when a prop changes?"

---

## 2.2 State: the rules that prevent 80% of bugs

```jsx
const [count, setCount] = useState(0);

// State updates are asynchronous and batched
setCount(count + 1);
setCount(count + 1);        // → 1, not 2 (both read the same stale `count`)

setCount(c => c + 1);
setCount(c => c + 1);        // → 2 (functional updates queue correctly)
```

Since React 18, **all** updates are batched (including inside promises, timeouts, and native handlers), not just React event handlers.

**State must be treated as immutable:**

```jsx
// ✗ mutation — React compares by reference, sees no change, doesn't re-render
todos.push(newTodo); setTodos(todos);

// ✓
setTodos(prev => [...prev, newTodo]);
setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
setUser(prev => ({ ...prev, address: { ...prev.address, city } }));   // nested needs care
```

For deep updates use Immer (`useImmer`) or restructure to flatter state.

**Derive, don't duplicate.** The most common state-design mistake is storing something you can compute:

```jsx
// ✗ two sources of truth that can drift
const [items, setItems] = useState([]);
const [total, setTotal] = useState(0);

// ✓ one source
const [items, setItems] = useState([]);
const total = items.reduce((s, i) => s + i.price, 0);   // recomputed each render — usually free
```

**`useReducer` when transitions are the point** — multiple related fields, or the next state depends on the action:

```jsx
function reducer(state, action) {
  switch (action.type) {
    case "submit":  return { ...state, status: "loading", error: null };
    case "success": return { ...state, status: "done", data: action.data };
    case "failure": return { ...state, status: "error", error: action.error };
    default: throw new Error(`unknown action ${action.type}`);
  }
}
const [state, dispatch] = useReducer(reducer, { status: "idle", data: null, error: null });
```

> **Asked as:** "Why didn't my state update immediately?" · "Why must state be immutable?" · "`useState` vs `useReducer`." · "What is automatic batching?"

---

## 2.3 `useEffect` — and the many cases where you shouldn't use it

An Effect synchronises your component with an **external system** (network, DOM API, timer, subscription, analytics). If there is no external system, you probably don't need one.

```jsx
useEffect(() => {
  const ac = new AbortController();
  let ignore = false;

  (async () => {
    try {
      const res = await fetch(`/api/orders?q=${query}`, { signal: ac.signal });
      const data = await res.json();
      if (!ignore) setResults(data);          // guard against out-of-order responses
    } catch (e) {
      if (e.name !== "AbortError") setError(e);
    }
  })();

  return () => { ignore = true; ac.abort(); };  // cleanup on unmount AND before the next run
}, [query]);                                    // dependency array = "re-sync when this changes"
```

**You don't need an Effect for:**

| Instead of | Do |
|---|---|
| Computing derived state in an Effect | Calculate during render |
| Resetting state when a prop changes | `key` prop |
| Handling a user event | Put the logic in the event handler |
| Fetching data in every component | React Query / SWR / RSC / a route loader |
| Syncing two pieces of state | Lift it up or derive it |

**Race conditions** are the #1 fetch-in-Effect bug — the `ignore` flag above, or an abort, is mandatory. In React 19's StrictMode, Effects run twice in development *on purpose* to surface missing cleanup.

**Dependency arrays:** include every reactive value you read. Don't lie to the linter — if a dependency causes loops, the fix is usually moving the function inside the Effect, wrapping it in `useCallback`, or using a ref for a value you read but don't want to react to.

> **Asked as:** "When do you *not* need `useEffect`?" · "Why does my Effect run twice?" · "How do you handle a race condition when fetching?" · "What goes in the dependency array?"

---

## 2.4 The full hook set, with the real use case

| Hook | Use it for |
|---|---|
| `useState` | Local component state |
| `useReducer` | Complex/related state transitions |
| `useContext` | Read a shared value without prop drilling |
| `useRef` | A mutable box that doesn't trigger re-renders; DOM node access |
| `useEffect` | Sync with external systems (after paint) |
| `useLayoutEffect` | Measure DOM and mutate **before** paint (tooltip positioning) — blocks paint, use sparingly |
| `useMemo` | Cache an expensive computation |
| `useCallback` | Stable function identity for memoised children / effect deps |
| `useId` | SSR-safe unique ids for `htmlFor`/`aria-describedby` |
| `useTransition` | Mark an update non-urgent so typing stays responsive |
| `useDeferredValue` | Render a stale value while an expensive one catches up |
| `useSyncExternalStore` | Subscribe to an external store, tear-free with concurrent rendering |
| `useOptimistic` (19) | Show the expected result instantly, roll back on failure |
| `useActionState` (19) | Form action + pending + result state in one |
| `useFormStatus` (19) | Read the parent form's pending state from a child button |
| `use()` (19) | Read a promise or context **conditionally**, unlike other hooks |

**Rules of Hooks:** call them at the top level of a component or another hook, in the same order every render, never inside conditions/loops. React tracks them by call index. (`use()` is the deliberate exception.)

```jsx
// useTransition — the classic "typing lags because the list is huge" fix
const [isPending, startTransition] = useTransition();

function onChange(e) {
  setQuery(e.target.value);                                 // urgent: the input updates instantly
  startTransition(() => setFilter(e.target.value));         // non-urgent: interruptible
}
```

> **Asked as:** "`useMemo` vs `useCallback` vs `useRef`." · "`useEffect` vs `useLayoutEffect`." · "Why can't hooks be conditional?" · "What problem does `useTransition` solve?"

---

## 2.5 React 19 features you're expected to know

**Actions + form state** — async transitions with pending/error handled for you:

```jsx
"use client";
import { useActionState, useOptimistic } from "react";

function CommentBox({ postId, comments }) {
  const [optimistic, addOptimistic] = useOptimistic(
    comments,
    (state, newComment) => [...state, { ...newComment, pending: true }]
  );

  const [state, formAction, isPending] = useActionState(
    async (_prev, formData) => {
      const text = formData.get("text");
      addOptimistic({ id: crypto.randomUUID(), text });
      try { return { ok: true, data: await postComment(postId, text) }; }
      catch (e) { return { ok: false, error: e.message }; }     // rollback is automatic
    },
    { ok: true }
  );

  return (
    <>
      {optimistic.map(c => <li key={c.id} style={{ opacity: c.pending ? 0.5 : 1 }}>{c.text}</li>)}
      <form action={formAction}>
        <input name="text" required />
        <button disabled={isPending}>{isPending ? "Posting…" : "Post"}</button>
      </form>
      {!state.ok && <p role="alert">{state.error}</p>}
    </>
  );
}
```

**`use()`** reads a promise (suspends) or context, and unlike other hooks it may be called conditionally:

```jsx
function Profile({ userPromise }) {
  const user = use(userPromise);      // suspends until resolved; nearest <Suspense> shows the fallback
  return <h1>{user.name}</h1>;
}
```

**Other 19 changes:** `ref` is a normal prop (`forwardRef` deprecated), `<title>`/`<meta>`/`<link>` render anywhere and hoist to `<head>`, `ref` callbacks can return a cleanup function, and better hydration error messages.

> **Asked as:** "What's new in React 19?" · "How does `useOptimistic` work?" · "What does `use()` do that other hooks can't?"

---

## 2.6 Server Components vs Client Components

| | Server Component (default in Next App Router) | Client Component (`"use client"`) |
|---|---|---|
| Runs | On the server, at request/build time | Server (SSR) then browser |
| Can | `await` data, read env/secrets, hit the DB directly | Use state, effects, event handlers, browser APIs |
| Cannot | Use hooks, handlers, browser APIs | Access the DB or secrets |
| Bundle cost | **Zero JS shipped** | Ships to the client |

```jsx
// app/orders/page.jsx — Server Component
import { db } from "@/lib/db";
import OrderFilter from "./order-filter";        // a client component

export default async function OrdersPage({ searchParams }) {
  const orders = await db.order.findMany({ where: { status: searchParams.status } });
  return (
    <>
      <h1>Orders</h1>
      <OrderFilter />                            {/* interactive island */}
      <ul>{orders.map(o => <li key={o.id}>{o.id} — {o.total}</li>)}</ul>
    </>
  );
}
```

Rules: `"use client"` marks a **boundary** — everything imported below it is client code. Props crossing the boundary must be serialisable (no functions except Server Actions, no class instances). You can pass a Server Component as `children` *into* a Client Component, which is the standard way to keep a heavy subtree on the server.

> **Asked as:** "Server Components vs SSR — what's the difference?" (SSR renders a client component to HTML then hydrates it; RSC never ships to the client at all) · "Where does `use client` go?" · "What can't you pass across the boundary?"

---

## 2.7 Error and loading boundaries

```jsx
// Error boundaries are still class components (or use react-error-boundary)
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { logToSentry(error, info.componentStack); }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return this.props.children;
  }
}

<ErrorBoundary fallback={(e, retry) => <Retry error={e} onRetry={retry} />}>
  <Suspense fallback={<Skeleton />}>
    <Dashboard />
  </Suspense>
</ErrorBoundary>
```

Error boundaries do **not** catch: event handler errors, async errors outside render, SSR errors, or errors in the boundary itself. Handle those with try/catch and a global `window.onerror` / `unhandledrejection` reporter.

Place `<Suspense>` at meaningful UI chunks, not around your whole app — that turns a fast page into a blank screen.

> **Asked as:** "What do error boundaries catch and not catch?" · "Where do you place Suspense?"

---

## 2.8 Rapid-fire answers

| Question | Answer |
|---|---|
| Controlled vs uncontrolled input | Value in React state vs in the DOM (`defaultValue` + ref) |
| Why the virtual DOM | Not "faster than the DOM" — it's a declarative programming model with batched, minimal updates |
| Fiber | The reconciler's incremental, interruptible work-loop architecture — enables concurrent features |
| Context re-render cost | Every consumer re-renders when the value changes; split contexts or memoise the value object |
| Portal | `createPortal(child, domNode)` — renders outside the parent DOM tree, keeps React context/events |
| Fragment | `<>…</>` — group without adding a DOM node |
| StrictMode | Dev-only double-invocation to surface impure renders and missing cleanup |
| Prop drilling fix | Composition (`children`), context, or a store — in that order of preference |
| Lifting state up | Move shared state to the closest common ancestor |
| Custom hook | A function starting with `use` that calls hooks — the way to share stateful logic |
