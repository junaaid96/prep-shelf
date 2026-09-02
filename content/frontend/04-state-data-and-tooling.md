# 4. Frontend State, Data Fetching, Tooling & Testing

---

## 4.1 Classify your state before choosing a tool

Most "which state library?" debates dissolve once you separate the kinds:

| Kind | Examples | Right tool |
|---|---|---|
| **Server state** | Orders, users, anything from an API | React Query / SWR / RSC / route loaders |
| **URL state** | Filters, page number, tab, search query | The URL itself (`useSearchParams`) |
| **Local UI state** | Open/closed, hover, form draft | `useState` in the owning component |
| **Shared client state** | Theme, auth session, cart, feature flags | Context (rarely-changing) or Zustand/Jotai |
| **Form state** | Field values, errors, dirty flags | react-hook-form / TanStack Form |

The single biggest architectural improvement in most React apps is **moving server state out of Redux/Context and into a query library**, and **moving filters into the URL** so views are shareable and back/forward work.

> **Asked as:** "Do you still use Redux?" · "How do you decide where state lives?" · "Why put filters in the URL?"

---

## 4.2 Server state with TanStack Query

```jsx
const ordersKey = (filters) => ["orders", filters];

function useOrders(filters) {
  return useQuery({
    queryKey: ordersKey(filters),
    queryFn: ({ signal }) => api.getOrders(filters, { signal }),   // cancellation for free
    staleTime: 30_000,          // don't refetch for 30s — the single most impactful option
    gcTime: 5 * 60_000,         // keep unused cache for 5 min
    placeholderData: (prev) => prev,   // keep showing old page while the new one loads
    retry: (count, err) => err.status >= 500 && count < 3,
  });
}

function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateOrder,
    // Optimistic update with rollback
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["orders"] });
      const prev = qc.getQueryData(["orders"]);
      qc.setQueryData(["orders"], (old) => old.map(o => o.id === next.id ? { ...o, ...next } : o));
      return { prev };
    },
    onError: (_err, _next, ctx) => qc.setQueryData(["orders"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}
```

What you get without writing it: caching, deduplication of concurrent identical requests, background refetch, stale-while-revalidate, retries with backoff, pagination/infinite scroll, and request cancellation. Rolling this yourself with `useEffect` is the classic source of duplicated fetches and race bugs.

**Query keys are the cache identity** — include every input that changes the result. `["orders", { status, page }]`, not `["orders"]`.

> **Asked as:** "What does React Query give you over `useEffect` + fetch?" · "How do you implement optimistic updates?" · "What is stale-while-revalidate?"

---

## 4.3 Client state stores

```js
// Zustand — minimal, no provider, selector-based subscriptions
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useCart = create(persist((set, get) => ({
  items: [],
  add: (item) => set(s => ({ items: [...s.items, item] })),
  remove: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
  get total() { return get().items.reduce((s, i) => s + i.price, 0); },
}), { name: "cart" }));

// Components subscribe to a SLICE — only re-render when that slice changes
const count = useCart(s => s.items.length);
```

| Library | Model | Fits |
|---|---|---|
| Context + `useReducer` | Built-in | Small, rarely-changing shared state |
| Zustand | Single store, selectors | Most apps — smallest API for the value |
| Jotai / Recoil | Atomic, bottom-up | Fine-grained, derived graphs |
| Redux Toolkit | Flux, devtools, middleware | Large teams, complex flows, time-travel debugging |
| XState | Statecharts | Genuinely complex workflows (checkout, onboarding, media players) |

Redux is not "dead" — RTK is a much better API than 2018 Redux, and RTK Query is solid. But if you remove server state from the equation, most apps need far less global state than they have.

> **Asked as:** "Zustand vs Redux vs Context." · "Why does Context cause re-renders and how do stores avoid it?"

---

## 4.4 Rendering strategies

| Strategy | When HTML is produced | Best for | Trade-off |
|---|---|---|---|
| **CSR** | In the browser | Dashboards behind auth | Slow first paint, poor SEO |
| **SSR** | Per request | Personalised, SEO-relevant pages | Server cost, TTFB depends on data |
| **SSG** | At build | Docs, marketing, blogs | Stale until rebuild |
| **ISR** | At build, revalidated on a schedule/on demand | Catalogues, news | Some staleness window |
| **RSC + streaming** | Server, streamed in chunks | Data-heavy pages | Newer mental model |
| **Islands** (Astro, Qwik) | Static + selective hydration | Content sites with a little interactivity | Less suited to app-like UIs |

```jsx
// Next.js App Router: streaming with Suspense — the shell renders immediately,
// slow sections stream in as their data resolves
export default function Page() {
  return (
    <>
      <Header />                                  {/* instant */}
      <Suspense fallback={<StatsSkeleton />}><Stats /></Suspense>       {/* streams */}
      <Suspense fallback={<TableSkeleton />}><OrderTable /></Suspense>  {/* streams */}
    </>
  );
}
```

**Avoid request waterfalls**: fetch in parallel (`Promise.all`) at the top of a server component rather than letting each child await in sequence.

> **Asked as:** "SSR vs SSG vs ISR vs CSR — pick one for this page and justify it." · "What is streaming SSR?" · "What is a request waterfall?"

---

## 4.5 Build tooling in 2026

**Vite** is the default for SPAs and libraries — native ESM in dev (no bundling, instant HMR), Rollup/Rolldown for production. **Next.js 16** uses Turbopack. **esbuild**/**SWC** do the transpiling. **Biome** is a fast Rust alternative to ESLint + Prettier; ESLint 9 flat config is the mainstream choice.

```js
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ["react", "react-dom"], charts: ["recharts"] },
      },
    },
  },
  server: { proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } } },
});
```

A healthy setup: TypeScript strict, ESLint (or Biome), Prettier, Husky + lint-staged on commit, and a CI job that runs typecheck + lint + test + build. Add a **bundle-size budget** check so regressions are caught in the PR, not in production.

> **Asked as:** "Why is Vite faster than webpack in dev?" (no bundle step — the browser requests ES modules directly) · "What's in your frontend CI pipeline?"

---

## 4.6 Testing

The pyramid, applied to frontend:

- **Unit** (Vitest/Jest) — pure functions, hooks, reducers. Fast, many.
- **Component/integration** (React Testing Library) — the bulk of your value. Render a component with its real children, interact like a user, assert on what a user would see.
- **E2E** (Playwright) — a handful of critical journeys: login, checkout, the one flow that must never break.

```jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("/api/orders", () => HttpResponse.json([{ id: "o1", total: 100 }]))
);
beforeAll(() => server.listen()); afterEach(() => server.resetHandlers()); afterAll(() => server.close());

test("filters orders by status", async () => {
  const user = userEvent.setup();
  render(<OrdersPage />, { wrapper: Providers });

  expect(await screen.findByText("o1")).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText(/status/i), "PAID");
  expect(await screen.findByRole("status")).toHaveTextContent(/1 order/i);
});
```

RTL principles that come up in interviews:

- **Query by accessible role/label/text**, not by test id or class. If you can't query it by role, a screen reader can't find it either — the test is telling you about a real a11y bug.
- **`findBy*`** (async) for anything that appears after a fetch; `getBy*` throws immediately; `queryBy*` returns null (use it to assert absence).
- **Mock the network (MSW), not your own modules.** Mocking `useOrders` tests nothing; mocking `/api/orders` tests everything below it.
- Don't assert on implementation details (state values, prop calls) — assert on rendered output.

> **Asked as:** "How do you test a component that fetches data?" · "Why query by role instead of test id?" · "What do you E2E vs unit test?"

---

## 4.7 Rapid-fire answers

| Question | Answer |
|---|---|
| SWR vs React Query | Both stale-while-revalidate; React Query has richer mutation/cache APIs, SWR is smaller |
| Where to keep auth tokens | HttpOnly cookie; if you must use memory, never `localStorage` |
| Handling API errors globally | Query client `onError` + an error boundary + a toast; distinguish 4xx (show the message) from 5xx (retry) |
| Infinite scroll | `useInfiniteQuery` + `IntersectionObserver` sentinel; keep a "load more" button for a11y |
| Optimistic UI | Apply expected change immediately, keep the previous snapshot, roll back on error |
| Polling vs WebSocket vs SSE | Simple + cacheable / bidirectional realtime / server→client stream with auto-reconnect |
| Feature flags | Evaluate server-side where possible to avoid flicker; cache the payload |
| i18n | `react-i18next` or `next-intl`; never concatenate translated fragments — use interpolation with plural rules |
| Monorepo | pnpm workspaces + Turborepo/Nx for cached task graphs |
| Micro-frontends | Module Federation; only worth it with genuinely independent teams and deploy cadences |
