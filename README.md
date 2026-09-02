# PrepShelf

A fast, offline-capable static site for reading engineering notes and interview prep,
organised by topic. Markdown files in `content/` are rendered **as-is** — the site never
modifies your note source.

**52 notes · 12 topics · ~66k words · ~9 hours of reading.**

## What's inside

| Topic | Notes | Covers |
|---|---|---|
| 🧭 Software Engineering | 4 | Clean code & refactoring, OOP/SOLID & design patterns, testing strategy, review & workflow (incl. working with AI tools) |
| 🔤 Languages | 7 | Python, JavaScript, TypeScript, Java, C, C++, Rust |
| 🧩 DSA | 3 | Complexity & core structures, 12 problem-solving patterns, graphs/trees/DP |
| 🎨 Frontend | 4 | Web platform fundamentals, React core, React performance & patterns, state/data/tooling/testing |
| ⚙️ Backend | 2 | Architecture patterns, optimisation patterns |
| 🍃 Spring Boot | 9 | The full ecosystem, module by module |
| 🐍 Django | 3 | Core & ORM, DRF & API design, async/Celery/performance/security |
| 🗄️ Database | 4 | SQL & modelling, indexing & query performance, transactions & concurrency, scaling/NoSQL/caching |
| 🏛️ Architecture | 4 | System design, service boundaries, distributed systems, event-driven & messaging |
| 🚀 DevOps & CI/CD | 5 | Git, Docker, Kubernetes, pipelines, observability & SRE |
| 🔐 Cyber Security | 3 | OWASP Top 10:2025, auth & authz, appsec/network/supply chain |
| 📝 Interview MCQ | 4 | Programming, DSA, CS fundamentals, logical reasoning |

Every note follows the same shape: concept → why it matters → runnable example → gotchas →
comparison tables, with **🎤 Interview callouts** (`> **Asked as:** …`) marking the real
questions that hit that section. Version-sensitive material is current as of **September 2026**.

## Project structure

```
Learning/
├── index.html                    # App shell
├── css/style.css                 # Design tokens, layout, markdown typography
├── js/app.js                     # Router, search, reader, TOC, shortcuts
├── vendor/                       # marked + highlight.js (vendored → works offline)
├── data/
│   ├── manifest.json             # Generated note index (do not edit by hand)
│   └── search-index.json         # Generated full-text search index
├── scripts/
│   ├── generate-manifest.js      # Scans content/ and rebuilds both data files
│   └── update-vendor.sh          # Refresh the vendored libraries
└── content/                      # Your notes, one folder per topic
```

## Quick start

The site loads markdown with `fetch`, so it needs an HTTP server — opening `index.html`
as a `file://` URL will not work.

```bash
cd /path/to/Learning
python3 -m http.server 8765     # or: npx serve .   |   php -S localhost:8765
```

Then open <http://localhost:8765>.

Node.js is only needed to regenerate `data/` after you add or edit notes.

## Using it

- **Home** — topic cards with per-topic reading progress, plus "Continue reading".
- **Sidebar** — collapsible topic tree; a green dot marks a note you've read, ★ marks a bookmark.
- **Search** — <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> (or <kbd>/</kbd>) opens a command
  palette that searches note titles, section headings **and full text**, with highlighted snippets.
- **Reader** — auto table of contents with scroll-spy, reading-progress bar, copy button on every
  code block, syntax highlighting, linkable section anchors, and prev/next navigation.
- **Progress** — mark notes read (<kbd>m</kbd>) and bookmark them (<kbd>b</kbd>); both persist in
  your browser's local storage.

### Keyboard shortcuts

| Key | Action |
|---|---|
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> or <kbd>/</kbd> | Search everything |
| <kbd>J</kbd> / <kbd>K</kbd> | Next / previous note |
| <kbd>B</kbd> | Bookmark this note |
| <kbd>M</kbd> | Mark read / unread |
| <kbd>T</kbd> | Toggle light / dark theme |
| <kbd>H</kbd> | Go home |
| <kbd>?</kbd> | Shortcut help |
| <kbd>Esc</kbd> | Close any overlay |

### Deep links

```
http://localhost:8765/#languages/07-rust                 → a note
http://localhost:8765/#database                          → a topic index
http://localhost:8765/#bookmarks                         → your bookmarks
http://localhost:8765/#devops/03-kubernetes-and-deployment#33-services-ingress-and-gateway-api
```

Section anchors are generated from headings — hover a heading and click the `#`.

## Adding content

1. Drop a `.md` file into the right folder under `content/` (or `mkdir content/new-topic` first).
2. Regenerate the index:

   ```bash
   node scripts/generate-manifest.js
   ```

3. Refresh the browser.

The sidebar title comes from the file's first `# heading`; the card description comes from the
first paragraph after it. Files sort naturally by name, so prefix with `01-`, `02-`, … to control order.

To give a new topic a proper label, icon, blurb and position, add an entry to the `TOPICS` map at
the top of `scripts/generate-manifest.js`:

```js
"machine-learning": { label: "Machine Learning", icon: "🤖", order: 35,
  blurb: "Maths foundations, classic algorithms, and modern ML systems." },
```

Anything not listed still works — it just gets a title-cased label and sorts last.

### Writing style used in these notes

````markdown
## 2.3 Reading `EXPLAIN ANALYZE`

Short statement of what the thing is and why it matters.

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT …;
```

| Option | Meaning |
|---|---|
| … | … |

> **Asked as:** "Walk me through this plan." · "How do you know an index is missing?"
````

The `> **Asked as:**` blockquote is picked up automatically and rendered as a 🎤 Interview callout.

## Offline use

`marked` and `highlight.js` are vendored in `vendor/`, so the site works with no network at all
(web fonts fall back to system fonts). Refresh them occasionally:

```bash
./scripts/update-vendor.sh
```

## Deploying (optional)

It's a static site — deploy the project root to Netlify, Vercel, GitHub Pages, Render, or any
static host. Run `node scripts/generate-manifest.js` first so `data/` is current.

## Troubleshooting

**Blank page / notes don't load** — you're on `file://`. Start a local server.

**"Could not load the manifest"** — run `node scripts/generate-manifest.js`.

**A new note doesn't appear** — regenerate the manifest and hard-refresh (⌘/Ctrl + Shift + R).

**Read/bookmark state disappeared** — it lives in browser local storage, per browser and per
origin; a private window or a different port starts fresh.

## License

Personal learning notes — use and extend as you like.
