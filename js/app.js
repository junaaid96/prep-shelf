/**
 * PrepShelf — static prep notes reader
 * Renders markdown files from content/ as-is (no content modification)
 */

(function () {
  "use strict";

  const state = {
    manifest: null,
    activeTopic: "all",
    searchQuery: "",
    currentNote: null,
  };

  const $ = (sel) => document.querySelector(sel);

  const els = {
    sidebar: $("#sidebar"),
    sidebarOverlay: $("#sidebar-overlay"),
    sidebarClose: $("#sidebar-close"),
    menuBtn: $("#menu-btn"),
    searchInput: $("#search-input"),
    topicFilters: $("#topic-filters"),
    noteList: $("#note-list"),
    welcome: $("#welcome"),
    loading: $("#loading"),
    markdownBody: $("#markdown-body"),
    topbarTitle: $("#topbar-title"),
    tocPanel: $("#toc-panel"),
    tocNav: $("#toc-nav"),
    welcomeStats: $("#welcome-stats"),
    themeToggle: $("#theme-toggle"),
    brandLink: $("#brand-link"),
  };

  /* ── Theme ── */
  function initTheme() {
    const saved = localStorage.getItem("prepshelf-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("prepshelf-theme", next);
  }

  /* ── Mobile sidebar ── */
  function openSidebar() {
    els.sidebar.classList.add("open");
    els.sidebarOverlay.classList.add("open");
  }

  function closeSidebar() {
    els.sidebar.classList.remove("open");
    els.sidebarOverlay.classList.remove("open");
  }

  /* ── Marked config — render as-is, preserve raw HTML if any ── */
  marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: true,
    mangle: false,
  });

  /* ── Slug for heading IDs (stable anchors) ── */
  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  /* ── Highlight search term in sidebar ── */
  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const re = new RegExp(`(${escapeRegExp(query)})`, "gi");
    return escaped.replace(re, "<mark>$1</mark>");
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* ── Manifest & UI bootstrap ── */
  async function loadManifest() {
    const res = await fetch("data/manifest.json");
    if (!res.ok) throw new Error("Could not load manifest. Run: node scripts/generate-manifest.js");
    state.manifest = await res.json();
    renderTopicFilters();
    renderNoteList();
    renderWelcomeStats();
  }

  function renderWelcomeStats() {
    const topics = state.manifest.topics.length;
    const notes = state.manifest.topics.reduce((n, t) => n + t.notes.length, 0);
    els.welcomeStats.innerHTML = `
      <div class="stat"><span class="stat-value">${topics}</span><span class="stat-label">Topics</span></div>
      <div class="stat"><span class="stat-value">${notes}</span><span class="stat-label">Notes</span></div>
    `;
  }

  function renderTopicFilters() {
    const chips = [`<button class="filter-chip active" data-topic="all">All</button>`];
    state.manifest.topics.forEach((t) => {
      chips.push(`<button class="filter-chip" data-topic="${t.id}">${escapeHtml(t.label)}</button>`);
    });
    els.topicFilters.innerHTML = chips.join("");

    els.topicFilters.querySelectorAll(".filter-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeTopic = btn.dataset.topic;
        els.topicFilters.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderNoteList();
      });
    });
  }

  function getFilteredNotes() {
    const q = state.searchQuery.toLowerCase().trim();
    const results = [];

    state.manifest.topics.forEach((topic) => {
      if (state.activeTopic !== "all" && state.activeTopic !== topic.id) return;

      topic.notes.forEach((note) => {
        const haystack = `${note.title} ${note.filename} ${topic.label}`.toLowerCase();
        if (q && !haystack.includes(q)) return;
        results.push({ ...note, topicId: topic.id, topicLabel: topic.label });
      });
    });

    return results;
  }

  function renderNoteList() {
    const notes = getFilteredNotes();
    const q = state.searchQuery.trim();

    if (notes.length === 0) {
      els.noteList.innerHTML = `<div class="no-results">No notes match your search.</div>`;
      return;
    }

    const grouped = {};
    notes.forEach((n) => {
      if (!grouped[n.topicLabel]) grouped[n.topicLabel] = [];
      grouped[n.topicLabel].push(n);
    });

    let html = "";
    Object.entries(grouped).forEach(([label, items]) => {
      html += `<div class="note-group"><div class="note-group-label">${escapeHtml(label)}</div>`;
      items.forEach((note) => {
        const isActive =
          state.currentNote &&
          state.currentNote.topicId === note.topicId &&
          state.currentNote.id === note.id;
        html += `<button class="note-item${isActive ? " active" : ""}"
          data-topic="${note.topicId}" data-id="${note.id}">
          ${highlightText(note.title, q)}
        </button>`;
      });
      html += `</div>`;
    });

    els.noteList.innerHTML = html;

    els.noteList.querySelectorAll(".note-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadNote(btn.dataset.topic, btn.dataset.id);
        closeSidebar();
      });
    });
  }

  /* ── Load & render note ── */
  async function loadNote(topicId, noteId) {
    const topic = state.manifest.topics.find((t) => t.id === topicId);
    const note = topic?.notes.find((n) => n.id === noteId);
    if (!note) return;

    state.currentNote = { ...note, topicId, topicLabel: topic.label };

    location.hash = `${topicId}/${noteId}`;
    els.welcome.classList.add("hidden");
    els.markdownBody.classList.add("hidden");
    els.loading.classList.remove("hidden");
    els.topbarTitle.textContent = note.title;
    renderNoteList();

    try {
      const res = await fetch(note.path);
      if (!res.ok) throw new Error(`Failed to load ${note.path}`);
      const raw = await res.text();

      els.markdownBody.innerHTML = marked.parse(raw);
      addHeadingIds();
      buildToc();
      els.loading.classList.add("hidden");
      els.markdownBody.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (err) {
      els.loading.classList.add("hidden");
      els.markdownBody.innerHTML = `<p style="color:var(--text-muted)">Could not load note. Make sure you're running a local server.</p>`;
      els.markdownBody.classList.remove("hidden");
      console.error(err);
    }
  }

  function addHeadingIds() {
    els.markdownBody.querySelectorAll("h1, h2, h3, h4").forEach((h) => {
      if (!h.id) h.id = slugify(h.textContent);
    });
  }

  function buildToc() {
    const headings = els.markdownBody.querySelectorAll("h2, h3");
    if (headings.length < 2) {
      els.tocPanel.classList.add("hidden");
      return;
    }

    els.tocPanel.classList.remove("hidden");
    els.tocNav.innerHTML = "";

    headings.forEach((h) => {
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      a.className = h.tagName === "H3" ? "toc-h3" : "";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
      });
      els.tocNav.appendChild(a);
    });

    observeHeadings(headings);
  }

  function observeHeadings(headings) {
    const links = els.tocNav.querySelectorAll("a");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            links.forEach((l) => l.classList.remove("active"));
            const active = els.tocNav.querySelector(`a[href="#${entry.target.id}"]`);
            active?.classList.add("active");
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
  }

  function showWelcome() {
    state.currentNote = null;
    location.hash = "";
    els.welcome.classList.remove("hidden");
    els.loading.classList.add("hidden");
    els.markdownBody.classList.add("hidden");
    els.tocPanel.classList.add("hidden");
    els.topbarTitle.textContent = "Select a note";
    renderNoteList();
  }

  function handleRoute() {
    const hash = location.hash.replace(/^#/, "");
    if (!hash) {
      showWelcome();
      return;
    }
    const [topicId, noteId] = hash.split("/");
    if (topicId && noteId && state.manifest) {
      loadNote(topicId, noteId);
    }
  }

  /* ── Events ── */
  function bindEvents() {
    els.themeToggle.addEventListener("click", toggleTheme);
    els.menuBtn.addEventListener("click", openSidebar);
    els.sidebarClose.addEventListener("click", closeSidebar);
    els.sidebarOverlay.addEventListener("click", closeSidebar);
    els.brandLink.addEventListener("click", (e) => {
      e.preventDefault();
      showWelcome();
    });

    let debounce;
    els.searchInput.addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.searchQuery = e.target.value;
        renderNoteList();
      }, 150);
    });

    window.addEventListener("hashchange", handleRoute);
  }

  /* ── Init ── */
  async function init() {
    initTheme();
    bindEvents();
    try {
      await loadManifest();
      handleRoute();
    } catch (err) {
      els.noteList.innerHTML = `<div class="no-results">${escapeHtml(err.message)}</div>`;
      console.error(err);
    }
  }

  init();
})();
