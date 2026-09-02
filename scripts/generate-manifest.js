#!/usr/bin/env node
/**
 * Scans content/ and generates:
 *   data/manifest.json      — topics, notes, titles, descriptions, reading time, headings
 *   data/search-index.json  — lightweight full-text index for client-side search
 *
 * Run after adding new topic folders or .md files:
 *   node scripts/generate-manifest.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content");
const DATA_DIR = path.join(ROOT, "data");

/* ------------------------------------------------------------------ *
 * Topic metadata. Add new folders here to control label, icon, order. *
 * Anything not listed still works — it just sorts last alphabetically.*
 * ------------------------------------------------------------------ */
const TOPICS = {
  "software-engineering": { label: "Software Engineering", icon: "🧭", order: 10,
    blurb: "Clean code, SOLID, design patterns, testing, review and workflow." },
  languages:              { label: "Languages",            icon: "🔤", order: 20,
    blurb: "Python, JavaScript, TypeScript, Java, C, C++ and Rust in depth." },
  dsa:                    { label: "DSA",                  icon: "🧩", order: 30,
    blurb: "Complexity, data structures, problem patterns, graphs and DP." },
  frontend:               { label: "Frontend",             icon: "🎨", order: 40,
    blurb: "Browser fundamentals, React, state, performance and tooling." },
  backend:                { label: "Backend",              icon: "⚙️", order: 50,
    blurb: "Architecture and optimisation patterns for backend systems." },
  "spring-boot":          { label: "Spring Boot",          icon: "🍃", order: 60,
    blurb: "The full Spring Boot ecosystem, module by module." },
  django:                 { label: "Django",               icon: "🐍", order: 70,
    blurb: "Django core, the ORM, DRF, async, Celery and hardening." },
  database:               { label: "Database",             icon: "🗄️", order: 80,
    blurb: "SQL, indexing, transactions, scaling, NoSQL and caching." },
  architecture:           { label: "Architecture",         icon: "🏛️", order: 90,
    blurb: "System design, service boundaries, distributed systems, events." },
  devops:                 { label: "DevOps & CI/CD",       icon: "🚀", order: 100,
    blurb: "Git, Docker, Kubernetes, pipelines, observability and SRE." },
  security:               { label: "Cyber Security",       icon: "🔐", order: 110,
    blurb: "OWASP Top 10, auth, crypto, network and supply-chain security." },
  "interview-mcq":        { label: "Interview MCQ",        icon: "📝", order: 120,
    blurb: "Multiple-choice drills across programming, DSA and CS basics." },
};

const WORDS_PER_MINUTE = 200;
const CODE_LINES_PER_MINUTE = 22;   // code is read more slowly than prose

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function titleCase(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripMd(s) {
  return s
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNote(fullPath) {
  const raw = fs.readFileSync(fullPath, "utf8");
  const lines = raw.split("\n");

  let title = null;
  const headings = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (!h) continue;
    const text = stripMd(h[2]);
    if (h[1].length === 1 && !title) title = text;
    else if (h[1].length >= 2) headings.push({ level: h[1].length, text });
  }

  // First real paragraph after the H1 becomes the card description.
  let description = "";
  const bodyStart = lines.findIndex((l) => /^#\s+/.test(l));
  for (let i = bodyStart + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith("#") || l.startsWith("---") || l.startsWith("```") || l.startsWith("|")) continue;
    description = stripMd(l);
    break;
  }
  if (description.length > 220) description = description.slice(0, 217).trimEnd() + "…";

  const plain = stripMd(raw.replace(/```[\s\S]*?```/g, " "));
  const words = plain ? plain.split(/\s+/).length : 0;
  const codeLines = (raw.match(/```[\s\S]*?```/g) || [])
    .reduce((n, block) => n + block.split("\n").length - 2, 0);

  return {
    title: title || titleCase(path.basename(fullPath, ".md")),
    description,
    headings,
    words,
    codeLines,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE + codeLines / CODE_LINES_PER_MINUTE)),
    searchText: plain.toLowerCase().slice(0, 20000),
  };
}

function scanTopics() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error("content/ folder not found");
    process.exit(1);
  }

  const dirs = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => {
      const oa = TOPICS[a]?.order ?? 999;
      const ob = TOPICS[b]?.order ?? 999;
      return oa - ob || naturalSort(a, b);
    });

  const searchIndex = [];

  const topics = dirs.map((id) => {
    const meta = TOPICS[id] || {};
    const topicPath = path.join(CONTENT_DIR, id);
    const files = fs.readdirSync(topicPath).filter((f) => f.endsWith(".md")).sort(naturalSort);

    const notes = files.map((filename) => {
      const fullPath = path.join(topicPath, filename);
      const parsed = parseNote(fullPath);
      const noteId = filename.replace(/\.md$/, "");

      searchIndex.push({
        t: id,
        n: noteId,
        title: parsed.title,
        h: parsed.headings.map((x) => x.text),
        body: parsed.searchText,
      });

      return {
        id: noteId,
        filename,
        title: parsed.title,
        description: parsed.description,
        words: parsed.words,
        codeLines: parsed.codeLines,
        readingMinutes: parsed.readingMinutes,
        headings: parsed.headings,
        path: `content/${id}/${filename}`,
      };
    });

    return {
      id,
      label: meta.label || titleCase(id),
      icon: meta.icon || "📄",
      blurb: meta.blurb || "",
      count: notes.length,
      readingMinutes: notes.reduce((n, x) => n + x.readingMinutes, 0),
      notes,
    };
  });

  return { topics, searchIndex };
}

const { topics, searchIndex } = scanTopics();

const manifest = {
  generatedAt: new Date().toISOString(),
  siteName: "PrepShelf",
  tagline: "Engineering notes, organised by topic",
  totals: {
    topics: topics.length,
    notes: topics.reduce((n, t) => n + t.notes.length, 0),
    words: topics.reduce((n, t) => n + t.notes.reduce((m, x) => m + x.words, 0), 0),
    readingMinutes: topics.reduce((n, t) => n + t.readingMinutes, 0),
  },
  topics,
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(DATA_DIR, "search-index.json"), JSON.stringify(searchIndex) + "\n");

console.log(
  `Generated data/manifest.json — ${manifest.totals.topics} topics, ${manifest.totals.notes} notes, ` +
  `${manifest.totals.words.toLocaleString()} words (~${Math.round(manifest.totals.readingMinutes / 60)}h reading)`
);
console.log(`Generated data/search-index.json — ${searchIndex.length} entries`);
