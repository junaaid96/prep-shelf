/**
 * PrepShelf — static engineering-notes reader
 * Renders markdown from content/ as-is; all enhancement happens in the DOM after render.
 *
 * Routes:  #                     home
 *          #bookmarks            bookmarked notes
 *          #<topic>              topic index
 *          #<topic>/<note>       a note (legacy-compatible deep link)
 */
(function () {
  "use strict";

  /* ══════════════════════════ State ══════════════════════════ */

  const LS = {
    theme: "prepshelf:theme",
    read: "prepshelf:read",
    marks: "prepshelf:bookmarks",
    open: "prepshelf:open-topics",
    recent: "prepshelf:recent",
  };

  const state = {
    manifest: null,
    flat: [],            // [{topic, note}] in sidebar order — powers prev/next and j/k
    searchIndex: null,
    view: "home",        // home | topic | note | bookmarks
    topicId: null,
    noteId: null,
    read: new Set(),
    marks: new Set(),
    openTopics: new Set(),
    recent: [],
    paletteSel: 0,
    paletteResults: [],
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = {};

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const key = (t, n) => t + "/" + n;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function loadSet(k) {
    try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch (e) { return new Set(); }
  }
  function saveSet(k, set) {
    try { localStorage.setItem(k, JSON.stringify([...set])); } catch (e) { /* private mode */ }
  }
  function loadArr(k) {
    try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; }
  }
  function saveArr(k, arr) {
    try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) { /* ignore */ }
  }

  /* ══════════════════════════ Theme ══════════════════════════ */

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(LS.theme); } catch (e) { /* ignore */ }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(LS.theme, next); } catch (e) { /* ignore */ }
    toast(next === "dark" ? "Dark theme" : "Light theme");
  }

  /* ══════════════════════════ Toast ══════════════════════════ */

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1700);
  }

  /* ══════════════════════════ Sidebar tree ══════════════════════════ */

  function shortTitle(t) {
    return t.replace(/^[\d.\s]*[.)]?\s*/, "").split(/\s+[—–-]\s+/)[0]
            .replace(/^[\u{1F300}-\u{1FAFF}☀-➿]\s*/u, "").trim() || t;
  }

  function buildTree() {
    el.topicTree.innerHTML = state.manifest.topics.map((t) => {
      const doneCount = t.notes.filter((n) => state.read.has(key(t.id, n.id))).length;
      const notes = t.notes.map((n) => {
        const k = key(t.id, n.id);
        return '<button class="note-link' + (state.read.has(k) ? " read" : "") +
          '" data-topic="' + t.id + '" data-note="' + n.id + '">' +
          '<span class="dot"></span><span class="txt">' + esc(shortTitle(n.title)) + '</span>' +
          (state.marks.has(k) ? '<span class="star">★</span>' : "") + '</button>';
      }).join("");
      return '<div class="topic-group" data-topic="' + t.id + '">' +
        '<button class="topic-toggle" data-topic-toggle="' + t.id + '">' +
        '<svg class="chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
        '<span class="icon">' + t.icon + '</span>' +
        '<span class="name">' + esc(t.label) + '</span>' +
        '<span class="count">' + doneCount + '/' + t.notes.length + '</span>' +
        '</button><div class="topic-notes">' + notes + '</div></div>';
    }).join("");

    $$("[data-topic-toggle]", el.topicTree).forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.dataset.topicToggle;
        const open = b.closest(".topic-group").classList.toggle("open");
        open ? state.openTopics.add(id) : state.openTopics.delete(id);
        saveSet(LS.open, state.openTopics);
      });
    });
    $$(".note-link", el.topicTree).forEach((b) => {
      b.addEventListener("click", () => {
        location.hash = "#" + b.dataset.topic + "/" + b.dataset.note;
        closeSidebar();
      });
    });

    syncTree();
  }

  function syncTree() {
    $$(".topic-group", el.topicTree).forEach((g) => {
      const id = g.dataset.topic;
      const isActive = id === state.topicId;
      g.classList.toggle("has-active", isActive);
      g.classList.toggle("open", state.openTopics.has(id) || isActive);
    });
    $$(".note-link", el.topicTree).forEach((b) => {
      const k = key(b.dataset.topic, b.dataset.note);
      b.classList.toggle("active", state.view === "note" && k === key(state.topicId, state.noteId));
      b.classList.toggle("read", state.read.has(k));
      const star = $(".star", b);
      if (state.marks.has(k) && !star) b.insertAdjacentHTML("beforeend", '<span class="star">★</span>');
      if (!state.marks.has(k) && star) star.remove();
    });
    state.manifest.topics.forEach((t) => {
      const c = $('.topic-group[data-topic="' + t.id + '"] .count', el.topicTree);
      if (c) c.textContent = t.notes.filter((n) => state.read.has(key(t.id, n.id))).length + "/" + t.notes.length;
    });
    el.bookmarkCount.textContent = state.marks.size;
    el.linkHome.classList.toggle("active", state.view === "home");
    el.linkBookmarks.classList.toggle("active", state.view === "bookmarks");
  }

  /* ══════════════════════════ Views ══════════════════════════ */

  function cardFor(f) {
    const n = f.note, t = f.topic;
    return '<button class="note-card" data-goto="' + t.id + '/' + n.id + '">' +
      '<h4>' + esc(n.title) + '</h4>' +
      (n.description ? '<p>' + esc(n.description) + '</p>' : "") +
      '<div class="meta"><span>' + t.icon + ' ' + esc(t.label) + '</span><span>' +
      n.readingMinutes + ' min</span></div></button>';
  }

  function showHome() {
    const m = state.manifest;
    const doneAll = state.flat.filter((f) => state.read.has(key(f.topic.id, f.note.id))).length;
    const hours = Math.round(m.totals.readingMinutes / 60);
    const recentCards = state.recent
      .map((k) => state.flat.find((f) => key(f.topic.id, f.note.id) === k))
      .filter(Boolean).slice(0, 4);

    const topicCards = m.topics.map((t) => {
      const done = t.notes.filter((n) => state.read.has(key(t.id, n.id))).length;
      const pct = t.notes.length ? Math.round((done / t.notes.length) * 100) : 0;
      return '<button class="topic-card" data-goto-topic="' + t.id + '">' +
        '<div class="top"><span class="ic">' + t.icon + '</span><h3>' + esc(t.label) + '</h3></div>' +
        '<p>' + esc(t.blurb) + '</p>' +
        '<div class="meta"><span>' + t.notes.length + ' notes</span>' +
        '<div class="mini-progress"><i style="width:' + pct + '%"></i></div>' +
        '<span>' + pct + '%</span></div></button>';
    }).join("");

    el.homeView.innerHTML =
      '<div class="home-hero">' +
        '<h1>Engineering notes, end to end</h1>' +
        '<p>Deep-dive references across software engineering, languages, DSA, frontend, backend, ' +
        'databases, architecture, DevOps and security — each with practical examples and the ' +
        'interview questions that hit that topic.</p>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="n">' + m.totals.topics + '</div><div class="l">Topics</div></div>' +
          '<div class="stat"><div class="n">' + m.totals.notes + '</div><div class="l">Notes</div></div>' +
          '<div class="stat"><div class="n">' + (m.totals.words / 1000).toFixed(0) + 'k</div><div class="l">Words</div></div>' +
          '<div class="stat"><div class="n">~' + hours + 'h</div><div class="l">Reading</div></div>' +
          '<div class="stat"><div class="n">' + doneAll + '/' + m.totals.notes + '</div><div class="l">Read</div></div>' +
        '</div></div>' +
      (recentCards.length
        ? '<div class="section-head"><h2>Continue reading</h2></div><div class="note-cards">' +
          recentCards.map(cardFor).join("") + '</div>'
        : "") +
      '<div class="section-head"><h2>All topics</h2><span class="hint">' +
        (isMac ? "⌘" : "Ctrl") + ' K to search</span></div>' +
      '<div class="topic-grid">' + topicCards + '</div>';

    wireCards(el.homeView);
    setChrome("home", [{ text: "Home", current: true }]);
  }

  function showTopic(id) {
    const t = state.manifest.topics.find((x) => x.id === id);
    if (!t) { showHome(); return; }
    const done = t.notes.filter((n) => state.read.has(key(t.id, n.id))).length;
    el.homeView.innerHTML =
      '<div class="home-hero"><h1>' + t.icon + ' ' + esc(t.label) + '</h1>' +
      '<p>' + esc(t.blurb) + '</p><div class="stat-row">' +
      '<div class="stat"><div class="n">' + t.notes.length + '</div><div class="l">Notes</div></div>' +
      '<div class="stat"><div class="n">~' + t.readingMinutes + 'm</div><div class="l">Reading</div></div>' +
      '<div class="stat"><div class="n">' + done + '/' + t.notes.length + '</div><div class="l">Read</div></div>' +
      '</div></div><div class="note-cards">' +
      t.notes.map((n) => cardFor({ topic: t, note: n })).join("") + '</div>';
    wireCards(el.homeView);
    setChrome("topic", [{ text: t.icon + " " + t.label, current: true }]);
  }

  function showBookmarks() {
    const items = state.flat.filter((f) => state.marks.has(key(f.topic.id, f.note.id)));
    el.homeView.innerHTML =
      '<div class="home-hero"><h1>★ Bookmarks</h1><p>' +
      (items.length
        ? items.length + " note" + (items.length === 1 ? "" : "s") + " saved for later."
        : "No bookmarks yet — open a note and press <kbd>b</kbd> to save it.") +
      '</p></div><div class="note-cards">' + items.map(cardFor).join("") + '</div>';
    wireCards(el.homeView);
    setChrome("bookmarks", [{ text: "Bookmarks", current: true }]);
  }

  function wireCards(root) {
    $$("[data-goto]", root).forEach((b) =>
      b.addEventListener("click", () => { location.hash = "#" + b.dataset.goto; }));
    $$("[data-goto-topic]", root).forEach((b) =>
      b.addEventListener("click", () => { location.hash = "#" + b.dataset.gotoTopic; }));
  }

  function setChrome(view, crumbs) {
    state.view = view;
    el.homeView.classList.toggle("hidden", view === "note");
    el.md.classList.toggle("hidden", view !== "note");
    if (view !== "note") el.noteFooter.innerHTML = "";
    el.toc.classList.toggle("hidden", view !== "note");
    el.bookmarkBtn.classList.toggle("hidden", view !== "note");
    el.readBtn.classList.toggle("hidden", view !== "note");
    el.breadcrumb.innerHTML = crumbs.map((c, i) =>
      (i ? '<span class="sep">/</span>' : "") +
      (c.current ? '<span class="current">' + esc(c.text) + '</span>'
                 : '<a href="#' + (c.href || "") + '">' + esc(c.text) + '</a>')).join("");
    syncTree();
  }

  /* ══════════════════════════ Note rendering ══════════════════════════ */

  function copyIcon(done) {
    return done
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  }

  function enhance(root, note, topic) {
    /* Meta bar under the H1 */
    const h1 = root.querySelector("h1");
    if (h1) {
      const k = key(topic.id, note.id);
      h1.insertAdjacentHTML("afterend",
        '<div class="note-meta-bar">' +
        '<span class="chip">' + topic.icon + ' ' + esc(topic.label) + '</span>' +
        '<span>' + note.readingMinutes + ' min read</span>' +
        '<span>' + note.words.toLocaleString() + ' words</span>' +
        (note.codeLines ? '<span>' + note.codeLines + ' lines of code</span>' : "") +
        (state.read.has(k) ? '<span style="color:var(--ok)">✓ Read</span>' : "") +
        '</div>');
    }

    /* Heading ids + anchor links */
    const used = new Set();
    $$("h2, h3", root).forEach((h) => {
      let id = h.textContent.toLowerCase().trim()
        .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "section";
      const base = id;
      let n = 1;
      while (used.has(id)) { n += 1; id = base + "-" + n; }
      used.add(id);
      h.id = id;
      h.insertAdjacentHTML("afterbegin",
        '<a class="anchor" href="#' + state.topicId + "/" + state.noteId + "#" + id +
        '" aria-label="Link to this section">#</a>');
    });

    /* Code blocks: highlight, language label, copy button */
    $$("pre", root).forEach((pre) => {
      const code = pre.querySelector("code");
      if (!code) return;
      const m = code.className.match(/language-([\w+#-]+)/);
      const lang = m ? m[1] : "";

      if (window.hljs) {
        try {
          code.innerHTML = (lang && hljs.getLanguage(lang))
            ? hljs.highlight(code.textContent, { language: lang }).value
            : hljs.highlightAuto(code.textContent).value;
          code.classList.add("hljs");
        } catch (e) { /* leave plain */ }
      }

      const wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      if (lang) wrap.insertAdjacentHTML("beforeend", '<span class="lang">' + esc(lang) + '</span>');

      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Copy code");
      btn.innerHTML = copyIcon(false);
      btn.addEventListener("click", () => {
        const text = code.textContent;
        const done = () => {
          btn.classList.add("copied");
          btn.innerHTML = copyIcon(true);
          setTimeout(() => { btn.classList.remove("copied"); btn.innerHTML = copyIcon(false); }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else { fallback(); }
        function fallback() {
          const ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); } catch (e) { /* ignore */ }
          ta.remove(); done();
        }
      });
      wrap.appendChild(btn);
    });

    /* Tables scroll horizontally inside their own container */
    $$("table", root).forEach((t) => {
      const w = document.createElement("div");
      w.className = "table-wrap";
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });

    /* "Asked as:" blockquotes become interview callouts */
    $$("blockquote", root).forEach((q) => {
      if (/asked as/i.test(q.textContent.slice(0, 40))) q.classList.add("asked");
    });

    /* External links open safely in a new tab */
    $$('a[href^="http"]', root).forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  }

  /* ══════════════════════════ TOC + scroll-spy ══════════════════════════ */

  let spyHandler = null;
  function buildToc() {
    if (spyHandler) { window.removeEventListener("scroll", spyHandler); spyHandler = null; }
    const heads = $$("h2, h3", el.md);
    if (heads.length < 3) { el.toc.classList.add("hidden"); return; }
    el.toc.classList.remove("hidden");
    el.tocNav.innerHTML = heads.map((h) =>
      '<a href="#' + h.id + '" class="lvl-' + (h.tagName === "H2" ? 2 : 3) +
      '" data-spy="' + h.id + '">' + esc(h.textContent.replace(/^#/, "")) + '</a>').join("");

    const links = $$("a", el.tocNav);
    links.forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById(a.dataset.spy);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    let current = null, ticking = false;
    function update() {
      ticking = false;
      // The active heading is the last one whose top has passed under the topbar.
      // At the very bottom of the page, force the last heading so the TOC never trails off.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let idx = 0;
      if (atBottom) {
        idx = heads.length - 1;
      } else {
        for (let i = 0; i < heads.length; i++) {
          if (heads[i].getBoundingClientRect().top <= 96) idx = i; else break;
        }
      }
      if (idx === current) return;
      current = idx;
      links.forEach((a, i) => a.classList.toggle("active", i === idx));
      const active = links[idx];
      if (!active) return;
      const box = el.toc.getBoundingClientRect(), r = active.getBoundingClientRect();
      if (r.top < box.top + 30 || r.bottom > box.bottom - 30) active.scrollIntoView({ block: "nearest" });
    }

    spyHandler = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", spyHandler, { passive: true });
    update();
  }

  /* ══════════════════════════ Prev / next ══════════════════════════ */

  function flatIndex() {
    return state.flat.findIndex((f) => f.topic.id === state.topicId && f.note.id === state.noteId);
  }

  function renderNoteNav() {
    const i = flatIndex();
    const prev = i > 0 ? state.flat[i - 1] : null;
    const next = (i >= 0 && i < state.flat.length - 1) ? state.flat[i + 1] : null;
    el.noteFooter.innerHTML = '<nav class="note-nav">' +
      (prev ? '<a href="#' + prev.topic.id + '/' + prev.note.id + '"><div class="dir">← Previous</div><div class="t">' +
              esc(shortTitle(prev.note.title)) + '</div></a>' : '<span style="flex:1"></span>') +
      (next ? '<a class="next" href="#' + next.topic.id + '/' + next.note.id + '"><div class="dir">Next →</div><div class="t">' +
              esc(shortTitle(next.note.title)) + '</div></a>' : '<span style="flex:1"></span>') +
      '</nav>';
  }

  function go(delta) {
    const i = flatIndex();
    if (i < 0) return;
    const t = state.flat[i + delta];
    if (t) location.hash = "#" + t.topic.id + "/" + t.note.id;
  }

  /* ══════════════════════════ Read / bookmark ══════════════════════════ */

  function syncNoteButtons() {
    const k = key(state.topicId, state.noteId);
    el.bookmarkBtn.classList.toggle("on", state.marks.has(k));
    el.readBtn.classList.toggle("done", state.read.has(k));
  }

  function toggleBookmark() {
    if (state.view !== "note") return;
    const k = key(state.topicId, state.noteId);
    state.marks.has(k) ? state.marks.delete(k) : state.marks.add(k);
    saveSet(LS.marks, state.marks);
    syncNoteButtons(); syncTree();
    toast(state.marks.has(k) ? "★ Bookmarked" : "Bookmark removed");
  }

  function toggleRead() {
    if (state.view !== "note") return;
    const k = key(state.topicId, state.noteId);
    state.read.has(k) ? state.read.delete(k) : state.read.add(k);
    saveSet(LS.read, state.read);
    syncNoteButtons(); syncTree();
    toast(state.read.has(k) ? "✓ Marked as read" : "Marked as unread");
  }

  function pushRecent(k) {
    state.recent = [k].concat(state.recent.filter((x) => x !== k)).slice(0, 12);
    saveArr(LS.recent, state.recent);
  }

  async function showNote(topicId, noteId) {
    const topic = state.manifest.topics.find((t) => t.id === topicId);
    const note = topic && topic.notes.find((n) => n.id === noteId);
    if (!note) { location.hash = ""; return; }

    state.topicId = topicId;
    state.noteId = noteId;
    setChrome("note", [
      { text: topic.icon + " " + topic.label, href: topic.id },
      { text: shortTitle(note.title), current: true },
    ]);
    el.md.innerHTML = '<p style="color:var(--text-faint)">Loading…</p>';
    window.scrollTo(0, 0);

    let raw;
    try {
      const res = await fetch(note.path + "?v=" + encodeURIComponent(state.manifest.generatedAt));
      if (!res.ok) throw new Error("HTTP " + res.status);
      raw = await res.text();
    } catch (e) {
      el.md.innerHTML = '<h1>Could not load this note</h1><p>Tried <code>' + esc(note.path) +
        '</code> — ' + esc(String(e)) + '.</p><p>Serve the folder over HTTP ' +
        '(<code>python3 -m http.server 8765</code>); <code>file://</code> blocks fetch.</p>';
      return;
    }

    el.md.innerHTML = marked.parse(raw);
    enhance(el.md, note, topic);
    buildToc();
    renderNoteNav();
    syncNoteButtons();
    pushRecent(key(topicId, noteId));

    const anchor = (location.hash.split("#")[2] || "").trim();
    if (anchor) {
      const target = document.getElementById(anchor);
      if (target) setTimeout(() => target.scrollIntoView({ block: "start" }), 40);
    }
  }

  /* ══════════════════════════ Command palette ══════════════════════════ */

  let paletteEl = null;

  function snippet(body, term) {
    const i = body.indexOf(term);
    if (i < 0) return body.slice(0, 120) + "…";
    const start = Math.max(0, i - 55);
    return (start ? "…" : "") + body.slice(start, start + 150).trim() + "…";
  }

  function mark(text, terms) {
    let out = esc(text);
    (terms || []).forEach((t) => {
      if (t.length < 2) return;
      out = out.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), "<mark>$1</mark>");
    });
    return out;
  }

  function itemHtml(r, i) {
    return '<button class="palette-item' + (i === 0 ? " sel" : "") + '" data-hash="' + r.hash + '">' +
      '<span class="ic">' + r.icon + '</span><span class="body">' +
      '<span class="t">' + mark(r.title, r.terms) + '</span>' +
      (r.sub ? '<span class="s">' + mark(r.sub, r.terms) + '</span>' : "") +
      '<span class="crumb">' + esc(r.crumb) + '</span></span></button>';
  }

  function wirePalette(results) {
    $$(".palette-item", results).forEach((b, i) => {
      b.addEventListener("mouseenter", () => {
        state.paletteSel = i;
        $$(".palette-item", results).forEach((n, j) => n.classList.toggle("sel", i === j));
      });
      b.addEventListener("click", () => { closePalette(); location.hash = "#" + b.dataset.hash; });
    });
  }

  function runSearch(q, results) {
    q = q.trim();
    state.paletteSel = 0;

    if (!q) {
      const recents = state.recent
        .map((k) => state.flat.find((f) => key(f.topic.id, f.note.id) === k)).filter(Boolean).slice(0, 5);
      const src = recents.length ? recents : state.flat.slice(0, 8);
      state.paletteResults = src.map((f) => ({
        hash: f.topic.id + "/" + f.note.id, icon: f.topic.icon,
        title: f.note.title, sub: f.note.description, crumb: f.topic.label,
      }));
      results.innerHTML = '<div class="palette-group-title">' +
        (recents.length ? "Recent" : "Start here") + '</div>' +
        state.paletteResults.map(itemHtml).join("");
      wirePalette(results);
      return;
    }

    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = [];

    (state.searchIndex || []).forEach((doc) => {
      const title = doc.title.toLowerCase();
      const heads = doc.h.join("   ").toLowerCase();
      let score = 0, missing = false;

      for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        let s = 0;
        if (title.indexOf(term) >= 0) s += title.indexOf(term) === 0 ? 140 : 100;
        if (heads.indexOf(term) >= 0) s += 45;
        if (doc.body.indexOf(term) >= 0) s += 12;
        if (s === 0) { missing = true; break; }
        score += s;
      }
      if (missing) return;
      if (title.indexOf(q.toLowerCase()) >= 0) score += 200;

      const headHit = doc.h.find((h) => terms.every((t) => h.toLowerCase().indexOf(t) >= 0)) ||
                      doc.h.find((h) => h.toLowerCase().indexOf(terms[0]) >= 0);
      const sub = headHit ? "§ " + headHit : snippet(doc.body, terms[0]);
      const topic = state.manifest.topics.find((t) => t.id === doc.t);

      hits.push({
        score: score, hash: doc.t + "/" + doc.n, icon: topic ? topic.icon : "📄",
        title: doc.title, sub: sub, crumb: topic ? topic.label : doc.t, terms: terms,
      });
    });

    hits.sort((a, b) => b.score - a.score);
    state.paletteResults = hits.slice(0, 40);

    results.innerHTML = state.paletteResults.length
      ? '<div class="palette-group-title">' + hits.length + ' result' + (hits.length === 1 ? "" : "s") +
        '</div>' + state.paletteResults.map(itemHtml).join("")
      : '<div class="palette-empty">' +
        (state.searchIndex ? "No matches for " + esc(q) : "Loading index…") + '</div>';
    wirePalette(results);
  }

  function movePalette(d, results) {
    if (!state.paletteResults.length) return;
    state.paletteSel = (state.paletteSel + d + state.paletteResults.length) % state.paletteResults.length;
    const items = $$(".palette-item", results);
    items.forEach((n, i) => n.classList.toggle("sel", i === state.paletteSel));
    if (items[state.paletteSel]) items[state.paletteSel].scrollIntoView({ block: "nearest" });
  }

  function openSelected() {
    const r = state.paletteResults[state.paletteSel];
    if (!r) return;
    closePalette();
    location.hash = "#" + r.hash;
  }

  function closePalette() {
    if (!paletteEl) return;
    paletteEl.remove();
    paletteEl = null;
    document.body.style.overflow = "";
  }

  async function openPalette(prefill) {
    if (paletteEl) return;
    paletteEl = document.createElement("div");
    paletteEl.className = "palette-backdrop";
    paletteEl.innerHTML =
      '<div class="palette" role="dialog" aria-modal="true" aria-label="Search">' +
      '<div class="palette-input-row">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--text-faint)"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input type="text" id="palette-input" placeholder="Search titles, sections and full text…" autocomplete="off" spellcheck="false" />' +
      '<kbd>Esc</kbd></div>' +
      '<div class="palette-results" id="palette-results"></div>' +
      '<div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>' +
      '<span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>';
    document.body.appendChild(paletteEl);
    document.body.style.overflow = "hidden";

    const input = $("#palette-input", paletteEl);
    const results = $("#palette-results", paletteEl);

    paletteEl.addEventListener("mousedown", (e) => { if (e.target === paletteEl) closePalette(); });

    let t;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => runSearch(input.value, results), 90);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); movePalette(1, results); }
      else if (e.key === "ArrowUp") { e.preventDefault(); movePalette(-1, results); }
      else if (e.key === "Enter") { e.preventDefault(); openSelected(); }
      else if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    });

    input.value = prefill || "";
    input.focus();
    runSearch(input.value, results);

    if (!state.searchIndex) {
      try {
        const res = await fetch("data/search-index.json?v=" + encodeURIComponent(state.manifest.generatedAt));
        state.searchIndex = await res.json();
        if (paletteEl) runSearch(input.value, results);
      } catch (e) {
        state.searchIndex = [];
        if (paletteEl) runSearch(input.value, results);
      }
    }
  }

  /* ══════════════════════════ Shortcuts dialog ══════════════════════════ */

  let modalEl = null;
  function toggleShortcuts() {
    if (modalEl) { modalEl.remove(); modalEl = null; return; }
    const mod = isMac ? "⌘" : "Ctrl";
    modalEl = document.createElement("div");
    modalEl.className = "modal-backdrop";
    modalEl.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">' +
      '<h2>Keyboard shortcuts</h2><dl>' +
      '<dt><kbd>' + mod + '</kbd> <kbd>K</kbd></dt><dd>Search everything</dd>' +
      '<dt><kbd>/</kbd></dt><dd>Search everything</dd>' +
      '<dt><kbd>J</kbd></dt><dd>Next note</dd>' +
      '<dt><kbd>K</kbd></dt><dd>Previous note</dd>' +
      '<dt><kbd>B</kbd></dt><dd>Bookmark this note</dd>' +
      '<dt><kbd>M</kbd></dt><dd>Mark read / unread</dd>' +
      '<dt><kbd>T</kbd></dt><dd>Toggle theme</dd>' +
      '<dt><kbd>H</kbd></dt><dd>Go home</dd>' +
      '<dt><kbd>?</kbd></dt><dd>This dialog</dd>' +
      '<dt><kbd>Esc</kbd></dt><dd>Close</dd></dl></div>';
    modalEl.addEventListener("mousedown", (e) => { if (e.target === modalEl) toggleShortcuts(); });
    document.body.appendChild(modalEl);
  }

  /* ══════════════════════════ Sidebar (mobile) ══════════════════════════ */

  function openSidebar() { el.sidebar.classList.add("open"); el.overlay.classList.add("open"); }
  function closeSidebar() { el.sidebar.classList.remove("open"); el.overlay.classList.remove("open"); }

  /* ══════════════════════════ Router + scroll ══════════════════════════ */

  function route() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
    const parts = raw.split("/");
    const first = parts[0], second = parts[1];

    if (!first) { state.topicId = null; state.noteId = null; showHome(); return; }
    if (first === "bookmarks") { state.topicId = null; state.noteId = null; showBookmarks(); return; }
    if (second) { showNote(first, second.split("#")[0]); return; }
    state.topicId = first; state.noteId = null;
    showTopic(first);
  }

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
    el.progress.style.width = (state.view === "note" ? pct : 0) + "%";
  }

  /* ══════════════════════════ Boot ══════════════════════════ */

  async function init() {
    initTheme();

    el.sidebar = $("#sidebar");
    el.overlay = $("#sidebar-overlay");
    el.topicTree = $("#topic-tree");
    el.homeView = $("#home-view");
    el.md = $("#markdown-body");
    el.noteFooter = $("#note-footer");
    el.toc = $("#toc-panel");
    el.tocNav = $("#toc-nav");
    el.breadcrumb = $("#breadcrumb");
    el.reader = $("#reader");
    el.progress = $("#progress-bar");
    el.toast = $("#toast");
    el.bookmarkBtn = $("#bookmark-btn");
    el.readBtn = $("#read-btn");
    el.bookmarkCount = $("#bookmark-count");
    el.linkHome = $("#link-home");
    el.linkBookmarks = $("#link-bookmarks");

    state.read = loadSet(LS.read);
    state.marks = loadSet(LS.marks);
    state.openTopics = loadSet(LS.open);
    state.recent = loadArr(LS.recent);

    $("#search-kbd").textContent = isMac ? "⌘ K" : "Ctrl K";

    if (window.marked && marked.setOptions) {
      marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false });
    }

    try {
      const res = await fetch("data/manifest.json?v=" + Date.now());
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.manifest = await res.json();
    } catch (e) {
      el.homeView.innerHTML = '<div class="home-hero"><h1>Could not load the manifest</h1>' +
        '<p>Run <code>node scripts/generate-manifest.js</code>, then serve this folder over HTTP ' +
        '(<code>python3 -m http.server 8765</code>). Opening <code>index.html</code> directly will not work.</p></div>';
      return;
    }

    state.manifest.topics.forEach((t) => t.notes.forEach((n) => state.flat.push({ topic: t, note: n })));
    $("#brand-sub").textContent = state.manifest.totals.notes + " notes · " + state.manifest.totals.topics + " topics";

    buildTree();

    $("#menu-btn").addEventListener("click", openSidebar);
    $("#sidebar-close").addEventListener("click", closeSidebar);
    el.overlay.addEventListener("click", closeSidebar);
    $("#theme-toggle").addEventListener("click", toggleTheme);
    $("#shortcuts-btn").addEventListener("click", toggleShortcuts);
    $("#search-trigger").addEventListener("click", () => openPalette());
    $("#brand-link").addEventListener("click", (e) => { e.preventDefault(); location.hash = ""; closeSidebar(); });
    el.linkHome.addEventListener("click", () => { location.hash = ""; closeSidebar(); });
    el.linkBookmarks.addEventListener("click", () => { location.hash = "#bookmarks"; closeSidebar(); });
    el.bookmarkBtn.addEventListener("click", toggleBookmark);
    el.readBtn.addEventListener("click", toggleRead);

    window.addEventListener("hashchange", route);
    window.addEventListener("scroll", onScroll, { passive: true });

    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
      if (e.key === "Escape") { closePalette(); if (modalEl) toggleShortcuts(); closeSidebar(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "/": e.preventDefault(); openPalette(); break;
        case "?": e.preventDefault(); toggleShortcuts(); break;
        case "j": go(1); break;
        case "k": go(-1); break;
        case "b": toggleBookmark(); break;
        case "m": toggleRead(); break;
        case "t": toggleTheme(); break;
        case "h": location.hash = ""; break;
      }
    });

    route();
    onScroll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
