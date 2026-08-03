#!/usr/bin/env node
/**
 * Scans content/ and generates data/manifest.json
 * Run after adding new topic folders or .md files:
 *   node scripts/generate-manifest.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content");
const OUTPUT = path.join(ROOT, "data", "manifest.json");

const TOPIC_LABELS = {
  backend: "Backend",
  "spring-boot": "Spring Boot",
  "interview-mcq": "Interview MCQ",
};

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function extractTitle(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^#\s+(.+)$/m);
  if (match) return match[1].replace(/[*_`#]/g, "").trim();
  return path.basename(filePath, ".md").replace(/-/g, " ");
}

function scanTopics() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error("content/ folder not found");
    process.exit(1);
  }

  const topics = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(naturalSort);

  return topics.map((id) => {
    const topicPath = path.join(CONTENT_DIR, id);
    const files = fs
      .readdirSync(topicPath)
      .filter((f) => f.endsWith(".md"))
      .sort(naturalSort);

    return {
      id,
      label: TOPIC_LABELS[id] || id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      notes: files.map((filename) => {
        const fullPath = path.join(topicPath, filename);
        return {
          id: filename.replace(/\.md$/, ""),
          filename,
          title: extractTitle(fullPath),
          path: `content/${id}/${filename}`,
        };
      }),
    };
  });
}

const manifest = {
  generatedAt: new Date().toISOString(),
  siteName: "PrepShelf",
  tagline: "Your prep notes, organized by topic",
  topics: scanTopics(),
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + "\n");

const total = manifest.topics.reduce((n, t) => n + t.notes.length, 0);
console.log(`Generated ${OUTPUT} — ${manifest.topics.length} topics, ${total} notes`);
