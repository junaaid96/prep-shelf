# PrepShelf

A simple, modern static site for reading prep notes and study guides organized by topic.

Markdown files are stored in `content/` and rendered **as-is** — the site does not modify your note content.

## Project structure

```
Learning/
├── index.html                 # Main app
├── css/style.css              # Styles
├── js/app.js                  # App logic (search, filters, markdown render)
├── data/manifest.json         # Auto-generated note index (do not edit by hand)
├── scripts/
│   └── generate-manifest.js   # Scans content/ and rebuilds manifest
└── content/                   # Your notes (one folder per topic)
    ├── backend/
    ├── spring-boot/
    └── interview-mcq/
```

## Requirements

- A modern web browser
- **Python 3** (recommended for local preview), or any static file server
- **Node.js** (only needed to regenerate `data/manifest.json` after adding notes)

No npm install or build step is required to run the site.

## Quick start

### 1. Clone or open the project

```bash
cd /path/to/Learning
```

### 2. Start a local server

The site loads markdown via `fetch`, so you need a local HTTP server (opening `index.html` directly in the browser will not work).

**Option A — Python (recommended):**

```bash
python3 -m http.server 8765
```

**Option B — Node (npx, no install):**

```bash
npx serve .
```

**Option C — PHP:**

```bash
php -S localhost:8765
```

### 3. Open in browser

```
http://localhost:8765
```

## Usage

### Browse notes

- Use the **sidebar** to pick a note
- Click a **topic chip** (All, Backend, Spring Boot, Interview MCQ) to filter
- Use **Search** to find notes by title or filename
- Toggle **dark/light theme** from the top bar
- On mobile, tap the menu icon to open the sidebar

### Deep links

Each note has a shareable URL hash:

```
http://localhost:8765/#spring-boot/01-core-framework
http://localhost:8765/#interview-mcq/01-Programming
```

Format: `#<topic-id>/<note-id>`

## Adding new content

### Add a note to an existing topic

1. Place your `.md` file in the matching folder under `content/`:

   ```bash
   content/spring-boot/09-new-topic.md
   ```

2. Regenerate the manifest:

   ```bash
   node scripts/generate-manifest.js
   ```

3. Refresh the browser.

### Add a new topic

1. Create a new folder under `content/`:

   ```bash
   mkdir content/system-design
   ```

2. Add your markdown files:

   ```bash
   content/system-design/01-overview.md
   ```

3. Regenerate the manifest:

   ```bash
   node scripts/generate-manifest.js
   ```

4. Refresh the browser.

The topic label is derived from the folder name (e.g. `system-design` → **System Design**). To use a custom label, edit the `TOPIC_LABELS` map in `scripts/generate-manifest.js`.

### Note titles

Note titles in the sidebar are taken from the **first `# heading`** in each markdown file. If a file has no H1, the filename is used instead.

## Regenerating the manifest

Run this whenever you add, remove, or rename notes or topic folders:

```bash
node scripts/generate-manifest.js
```

Output example:

```
Generated data/manifest.json — 3 topics, 15 notes
```

## Development notes

| File | Purpose |
|------|---------|
| `index.html` | App shell and layout |
| `css/style.css` | Theme, sidebar, markdown typography |
| `js/app.js` | Routing, search, filters, markdown rendering |
| `data/manifest.json` | Generated index of all topics and notes |
| `scripts/generate-manifest.js` | Builds `manifest.json` from `content/` |

Markdown is rendered with [marked.js](https://marked.js.org/) (loaded from CDN). Your source `.md` files are never modified.

## Deploying (optional)

PrepShelf is a static site. Deploy the project root to any static host:

- [Netlify](https://www.netlify.com/)
- [Vercel](https://vercel.com/)
- [GitHub Pages](https://pages.github.com/)
- [Render Static Site](https://render.com/docs/static-sites)

Before deploying, run `node scripts/generate-manifest.js` so `data/manifest.json` is up to date.

## Troubleshooting

**Notes do not load / blank page**

- Make sure you are using a local server, not opening `index.html` as a `file://` URL.

**New note does not appear**

- Run `node scripts/generate-manifest.js` and hard-refresh the browser.

**"Could not load manifest"**

- Run `node scripts/generate-manifest.js` to create `data/manifest.json`.

## License

Personal learning notes — use and extend as you like.
