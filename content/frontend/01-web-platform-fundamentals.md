# 1. Web Platform Fundamentals — Browser, HTTP, CSS, Accessibility

Framework questions come and go; these are the ones that separate someone who *uses* React from someone who understands what the browser is doing underneath. Every senior frontend interview goes here.

---

## 1.1 The critical rendering path

What actually happens between `GET /` and pixels:

```
HTML  → parse → DOM
CSS   → parse → CSSOM
DOM + CSSOM → Render Tree → Layout (reflow) → Paint → Composite
```

- A `<script>` in `<head>` without `defer`/`async` **blocks HTML parsing**. Use `defer` (executes in order, after parsing) for app code; `async` (executes whenever it lands, out of order) only for independent things like analytics.
- CSS is **render-blocking** by design — the browser won't paint unstyled content. Keep critical CSS small, load the rest with `media` or preload.
- **Layout (reflow)** recalculates geometry — expensive. **Paint** fills pixels. **Composite** assembles layers on the GPU — cheap.

```js
// Layout thrashing: read → write → read → write forces a reflow per iteration
items.forEach(el => { el.style.width = el.offsetWidth + 10 + "px"; });  // ✗

// Batch reads, then writes
const widths = items.map(el => el.offsetWidth);          // all reads
items.forEach((el, i) => el.style.width = widths[i] + 10 + "px");  // all writes
```

**Animate only `transform` and `opacity`** — they skip layout and paint entirely and run on the compositor. Animating `width`, `top`, or `margin` forces layout on every frame.

> **Asked as:** "What happens when you type a URL and press enter?" · "`defer` vs `async`." · "Why is animating `left` slower than `transform: translateX`?" · "What is layout thrashing?"

---

## 1.2 Core Web Vitals (the 2026 set)

| Metric | Measures | Good |
|---|---|---|
| **LCP** — Largest Contentful Paint | Loading: when the main content appears | ≤ 2.5 s |
| **INP** — Interaction to Next Paint | Responsiveness across *all* interactions (replaced FID in 2024) | ≤ 200 ms |
| **CLS** — Cumulative Layout Shift | Visual stability | ≤ 0.1 |

Fixes that actually move the numbers:

- **LCP**: `<link rel="preload">` the hero image, serve AVIF/WebP with `srcset`, set `fetchpriority="high"`, server-render the above-the-fold markup, and cut render-blocking CSS/JS.
- **INP**: break long tasks (>50 ms) with `scheduler.yield()` or `setTimeout(0)`, move heavy work to a Web Worker, debounce expensive handlers, and avoid synchronous state cascades on every keystroke.
- **CLS**: always set `width`/`height` (or `aspect-ratio`) on images and embeds, reserve space for ads/banners, use `font-display: optional|swap` with a matched fallback metric.

```html
<img src="hero.avif" width="1200" height="630" fetchpriority="high"
     alt="Quarterly revenue dashboard" decoding="async">
<img src="below.avif" width="800" height="600" loading="lazy" alt="">
```

> **Asked as:** "What are Core Web Vitals and how do you improve each?" · "What replaced FID?" · "How do you stop layout shift from web fonts?"

---

## 1.3 HTTP, caching, and the network tab

```http
Cache-Control: public, max-age=31536000, immutable     # hashed asset — cache forever
Cache-Control: no-cache                                 # revalidate every time (ETag)
Cache-Control: private, max-age=0, must-revalidate      # HTML shell
ETag: "a1b2c3"
```

The standard static-site strategy: **hashed filenames + `immutable`** for JS/CSS/images, **`no-cache`** for the HTML that references them. The HTML is always fresh; assets are never re-downloaded.

`no-cache` means "store it but revalidate"; `no-store` means "don't write it to disk at all" (use for anything with personal data).

**HTTP/2 and HTTP/3** multiplex many requests over one connection, so domain sharding and sprite sheets are obsolete optimisations. HTTP/3 runs over QUIC/UDP — no head-of-line blocking on packet loss, which matters most on mobile.

**CORS**, the perennial confusion: it's the *browser* refusing to expose a cross-origin response to your JS, enforced by the server's headers.

```http
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Credentials: true          # required with cookies; then Origin cannot be *
Access-Control-Allow-Headers: Content-Type, Authorization
```

A **preflight** `OPTIONS` fires when the request isn't "simple" — a custom header, a `Content-Type: application/json`, or a method other than GET/POST/HEAD. Cache it with `Access-Control-Max-Age`.

> **Asked as:** "Explain CORS and preflight." · "How do you cache a SPA's assets?" · "`no-cache` vs `no-store`." · "What did HTTP/2 change for frontend performance?"

---

## 1.4 Storage and cookies

| Mechanism | Size | Sent to server | Lifetime | Use for |
|---|---|---|---|---|
| Cookie | ~4 KB | Yes, every request | Set by `Expires`/`Max-Age` | Session/auth tokens |
| `localStorage` | ~5–10 MB | No | Until cleared | Non-sensitive prefs, drafts |
| `sessionStorage` | ~5 MB | No | Per tab | Per-tab wizard state |
| IndexedDB | Large (quota-based) | No | Until cleared | Offline data, caches |
| Cache API | Quota-based | No | Until cleared | Service-worker asset cache |

**Never put a JWT in `localStorage`** if you can avoid it — any XSS reads it. Prefer `HttpOnly; Secure; SameSite=Lax` (or `Strict`) cookies, which JS cannot touch, plus CSRF protection.

> **Asked as:** "localStorage vs sessionStorage vs cookies." · "Where should you store a token and why?"

---

## 1.5 CSS that scales

**Box model:** always `box-sizing: border-box` so `width` includes padding and border.

**Layout — pick by axis:**

```css
/* Flexbox: one dimension, content-driven */
.toolbar { display: flex; gap: .75rem; align-items: center; justify-content: space-between; }

/* Grid: two dimensions, layout-driven. This is a full responsive grid with NO media query. */
.cards { display: grid; gap: 1rem;
         grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }

/* Container queries — respond to the PARENT, not the viewport */
.card-wrap { container-type: inline-size; }
@container (min-width: 400px) { .card { grid-template-columns: 120px 1fr; } }
```

**Specificity:** inline (1000) > id (100) > class/attr/pseudo-class (10) > element (1). `!important` overrides everything and is a debt you pay later. Modern escape hatches: `:where()` has **zero** specificity, `@layer` lets you order whole stylesheets deterministically.

```css
@layer reset, base, components, utilities;   /* later layers win regardless of specificity */
:where(.btn, .link) { color: inherit; }      /* easy to override */
```

**Stacking contexts** are the source of "my z-index doesn't work": `position` + `z-index`, `opacity < 1`, `transform`, `filter`, `will-change`, and `isolation: isolate` all create one. A child can never escape its parent's stacking context.

Modern CSS worth using in 2026: custom properties, `clamp()` for fluid type, `:has()` (the parent selector), nesting, `color-mix()`, `@supports`, `dvh/svh/lvh` units for mobile viewport bugs, `prefers-reduced-motion`, `light-dark()`.

```css
:root { --step-1: clamp(1rem, 0.9rem + 0.5vw, 1.25rem); }
.card:has(> img) { padding-block-start: 0; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

> **Asked as:** "Flexbox vs Grid — when do you use each?" · "Explain specificity and how you'd avoid `!important`." · "Why isn't my `z-index` working?" · "What are container queries?"

---

## 1.6 Accessibility (a11y) — the part that's actually testable

Interviewers ask because it's cheap to get right and expensive to retrofit.

```html
<!-- Semantic HTML gives you keyboard support, roles, and screen-reader semantics for free -->
<button type="button" aria-expanded="false" aria-controls="menu">Filters</button>
<nav aria-label="Primary">…</nav>
<main id="main">…</main>

<!-- Not this -->
<div class="btn" onclick="…">Filters</div>   <!-- not focusable, not announced, no Enter/Space -->
```

The checklist:

1. **Semantic elements first**; ARIA only when no native element fits. "No ARIA is better than bad ARIA."
2. **Keyboard**: everything interactive reachable by Tab, visible `:focus-visible` ring, logical order, no keyboard traps, Escape closes overlays.
3. **Labels**: every input has a `<label for>`; icon-only buttons get `aria-label`.
4. **Contrast**: 4.5:1 for body text, 3:1 for large text and UI boundaries.
5. **Live regions**: `aria-live="polite"` for async status so screen readers announce it.
6. **Focus management** in SPAs: on route change, move focus to the new `<h1>` and announce it — otherwise screen-reader users don't know anything changed.

Test with: keyboard only, axe DevTools, and a real screen reader (VoiceOver/NVDA) at least once.

> **Asked as:** "How do you make a custom dropdown accessible?" · "Why is `<div onclick>` a problem?" · "What does `aria-live` do?" · "How do you handle focus on SPA navigation?"

---

## 1.7 Security on the client

- **XSS** — never inject unsanitised HTML. `textContent` over `innerHTML`; if you must render HTML, sanitise with DOMPurify. In React, `dangerouslySetInnerHTML` is the only escape hatch and the name is a warning.
- **CSP** — a strict Content-Security-Policy is the strongest single mitigation:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; object-src 'none'; base-uri 'none'
  ```
- **CSRF** — `SameSite=Lax` cookies plus a per-session token for state-changing requests.
- **Clickjacking** — `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`.
- **`target="_blank"`** — add `rel="noopener noreferrer"` (browsers default to noopener now, but be explicit).
- **Supply chain** — a compromised npm package runs with full page privileges. Use `npm ci` with a lockfile, `npm audit`, Subresource Integrity for CDN scripts, and pin versions.

> **Asked as:** "How do you prevent XSS?" · "What is CSP and what does a good one look like?" · "How does `SameSite` stop CSRF?"

---

## 1.8 Rapid-fire answers

| Question | Answer |
|---|---|
| Reflow vs repaint | Geometry recalculation vs pixel filling; reflow is the expensive one |
| Event bubbling vs capturing | Target-up vs root-down; `addEventListener(fn, {capture: true})` |
| `preventDefault` vs `stopPropagation` | Cancel the default action vs stop the event travelling |
| Debounce vs throttle | Wait for quiet vs fire at most once per window |
| `<script defer>` vs module | ES modules are deferred by default |
| Web Worker | Separate thread, no DOM access, `postMessage` — for CPU-heavy work off the main thread |
| Service Worker | Programmable network proxy — offline, caching, push |
| Progressive enhancement | Works without JS, gets better with it |
| SSR / SSG / CSR / ISR | Render on request / at build / in browser / rebuild on a schedule |
| Hydration | Attaching JS behaviour to server-rendered HTML; the cost that RSC and islands aim to cut |
