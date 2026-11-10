// Library home: one search across everything you can study, plus what to read next.
import { store, allQuestions } from "../store.js";
import { CATEGORIES } from "../data/index.js";
import { FAQS } from "../data/faqs.js";
import { loadRemote } from "../github.js";
import { loadFeed, isNew, TOPIC_NAMES } from "../dailypicks.js";
import { metaOf } from "../libmeta.js";
import { searchText } from "./article-render.js";
import { esc, fmtDate, $ } from "../ui.js";

const TYPES = [["all", "Everything"], ["articles", "Articles"], ["questions", "Questions"], ["faqs", "FAQs"], ["picks", "Daily picks"], ["starred", "Starred"]];
const words = (t) => (String(t).match(/\S+/g) || []).length;

function snippet(text, q, n = 150) {
  const t = String(text || "").replace(/\s+/g, " ").trim(); if (!q) return esc(t.slice(0, n));
  const i = t.toLowerCase().indexOf(q.toLowerCase()), a = Math.max(0, i - 40);
  const cut = (a ? "…" : "") + t.slice(a, a + n) + (a + n < t.length ? "…" : "");
  return esc(cut).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), (m) => `<mark>${m}</mark>`);
}

export async function view(root) {
  let q = "", type = "all", remote = [], feed = { items: [] };
  root.innerHTML = `<header class="page-head"><h1>Library</h1><p>Everything you study in one place: your articles and files, your questions, the FAQs and fresh daily reading. Search across all of it.</p></header>
    <div class="lib-search"><input id="lq" type="search" placeholder="Search the whole library" aria-label="Search the library" autocomplete="off"></div>
    <div class="chips lib-types" role="group" aria-label="What to search">${TYPES.map(([k, l]) => `<button class="chip" data-type="${k}" aria-pressed="${k === type}">${l}</button>`).join("")}</div>
    <div id="lhBody"><p class="muted"><span class="spinner"></span> Loading…</p></div>`;
  const body = $("#lhBody");
  [remote, feed] = await Promise.all([loadRemote().catch(() => []), loadFeed()]);
  if (!body.isConnected) return null;

  const articles = () => { const mine = store.get().articles || []; return [...mine, ...remote.filter((r) => !mine.some((m) => m.id === r.id))]; };
  const catName = (c) => CATEGORIES[c]?.name || c;
  const tab = (t, params = "") => `#/library?tab=${t}${params}`;
  const artCard = (a) => { const m = metaOf("art", a.id), w = a.kind === "images" ? 0 : words(searchText(a)); return `<a class="lib-card" href="${tab("articles", "&id=" + encodeURIComponent(a.id))}"><span class="tag">Article</span><strong>${esc(a.title)}</strong><span class="small muted">${esc(a.topic || "")}${w ? ` · ${Math.max(1, Math.round(w / 200))} min read` : ""}${m.fav ? " · ★" : ""}${m.pct && !m.done ? ` · ${m.pct}% read` : m.done ? " · read" : ""}</span></a>`; };
  const pickCard = (it) => `<a class="lib-card" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer"><span class="tag moss">Daily pick</span><strong>${esc(it.title)}</strong><span class="small muted">${esc(it.source)} · ${fmtDate(Date.parse(it.date))}</span></a>`;

  function home() {
    const arts = articles(), qs = allQuestions(), mine = (store.get().custom || []).length;
    const fresh = feed.items.filter(isNew), cont = arts.filter((a) => { const m = metaOf("art", a.id); return m.opened && !m.done && (m.pct || 0) > 3; }).sort((a, b) => metaOf("art", b.id).opened - metaOf("art", a.id).opened)[0];
    const starred = [...arts.filter((a) => metaOf("art", a.id).fav).map(artCard), ...feed.items.filter((i) => metaOf("pick", i.id).saved).map(pickCard)];
    const recent = [...arts].sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 4);
    body.innerHTML = `
      <div class="lib-tiles">
        <a class="lib-tile" href="${tab("articles")}"><b>${arts.length}</b><span>Articles and files</span></a>
        <a class="lib-tile" href="${tab("questions")}"><b>${qs.length}</b><span>Questions${mine ? ` (${mine} yours)` : ""}</span></a>
        <a class="lib-tile" href="${tab("faqs")}"><b>${FAQS.length}</b><span>FAQ topics</span></a>
        <a class="lib-tile ${fresh.length ? "hot" : ""}" href="${tab("daily")}"><b>${fresh.length}</b><span>New daily picks</span></a>
      </div>
      ${cont ? `<h2 class="lib-h">Continue reading</h2><div class="lib-list">${artCard(cont)}</div>` : ""}
      ${fresh.length ? `<h2 class="lib-h row between"><span>Fresh for you</span><a class="small" href="${tab("daily")}">See all</a></h2><div class="lib-list">${fresh.slice(0, 4).map(pickCard).join("")}</div>` : ""}
      ${starred.length ? `<h2 class="lib-h">Starred</h2><div class="lib-list">${starred.slice(0, 6).join("")}</div>` : ""}
      ${recent.length ? `<h2 class="lib-h row between"><span>Recently added</span><a class="small" href="${tab("articles")}">All articles</a></h2><div class="lib-list">${recent.map(artCard).join("")}</div>` : `<div class="card"><h2>Start your library</h2><p class="muted">Add a PDF, Word, Excel or text file, a picture, pasted text or a web address. Your files are kept in your own GitHub repository.</p><a class="btn primary" href="${tab("add")}">Add material</a></div>`}
      <h2 class="lib-h">Jump to</h2><div class="lib-jump">${[["add", "Add material"], ["questions", "Browse questions"], ["faqs", "Read FAQs"], ["daily", "Daily picks"]].map(([t, l]) => `<a class="btn" href="${tab(t)}">${l}</a>`).join("")}</div>`;
  }

  function results() {
    const ql = q.toLowerCase(), out = [], cnt = {};
    const hit = (title, text) => { const t = title.toLowerCase().includes(ql) ? 3 : 0, b = text.toLowerCase().includes(ql) ? 1 : 0; return t + b; };
    if (["all", "articles", "starred"].includes(type)) for (const a of articles()) { if (type === "starred" && !metaOf("art", a.id).fav) continue; const tx = a.kind === "images" ? "" : searchText(a), s = hit(a.title, tx + " " + (a.topic || "")); if (s) out.push({ k: "a", s: s + 2, html: `<a class="lib-row" href="${tab("articles", "&id=" + encodeURIComponent(a.id))}"><span class="tag">Article</span><div><strong>${esc(a.title)}</strong><div class="small muted">${snippet(tx, q)}</div></div></a>` }); }
    if (["all", "questions"].includes(type)) for (const x of allQuestions()) { const s = hit(x.q, (x.a || "") + " " + catName(x.c)); if (s) out.push({ k: "q", s, html: `<a class="lib-row" href="${tab("questions", "&ids=" + encodeURIComponent(x.id))}"><span class="tag">Question</span><div><strong>${esc(x.q)}</strong><div class="small muted">${esc(catName(x.c))} · ${snippet(x.a, q, 110)}</div></div></a>` }); }
    if (["all", "faqs"].includes(type)) for (const f of FAQS) f.qa.forEach(([fq, fa]) => { const s = hit(fq, fa + " " + f.title); if (s) out.push({ k: "f", s, html: `<a class="lib-row" href="${tab("faqs", "&t=" + f.id)}"><span class="tag">FAQ</span><div><strong>${esc(fq)}</strong><div class="small muted">${esc(f.title)} · ${snippet(fa, q, 110)}</div></div></a>` }); });
    if (["all", "picks", "starred"].includes(type)) for (const it of feed.items) { if (type === "starred" && !metaOf("pick", it.id).saved) continue; const s = hit(it.title, (it.summary || "") + " " + (it.topics || []).map((t) => TOPIC_NAMES[t]).join(" ")); if (s) out.push({ k: "p", s, html: `<a class="lib-row" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer"><span class="tag moss">Pick</span><div><strong>${esc(it.title)}</strong><div class="small muted">${esc(it.source)} · ${snippet(it.summary, q, 110)}</div></div></a>` }); }
    out.sort((a, b) => b.s - a.s);
    const total = out.length, shown = out.filter((o) => (cnt[o.k] = (cnt[o.k] || 0) + 1) <= 12);
    body.innerHTML = total ? `<p class="small muted" aria-live="polite">${total} result${total > 1 ? "s" : ""}${total > shown.length ? ", showing the best of each kind" : ""}</p><div class="lib-rows">${shown.map((o) => o.html).join("")}</div>` : `<p class="muted" aria-live="polite">Nothing matches “${esc(q)}”. Try a shorter word, or pick “Everything”.</p>`;
  }

  function draw() {
    root.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === type)));
    if (q.trim().length >= 2 || type === "starred") { if (type === "starred" && q.trim().length < 2) q = q.trim() ? q : ""; return type === "starred" && !q.trim() ? starredList() : results(); }
    home();
  }
  function starredList() {
    const arts = articles().filter((a) => metaOf("art", a.id).fav), picks = feed.items.filter((i) => metaOf("pick", i.id).saved);
    body.innerHTML = arts.length || picks.length ? `<div class="lib-list">${[...arts.map(artCard), ...picks.map(pickCard)].join("")}</div>` : `<p class="muted">Nothing starred yet. Use the ☆ button on an article or a daily pick.</p>`;
  }
  $("#lq").addEventListener("input", (e) => { q = e.target.value; draw(); });
  root.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => { type = b.dataset.type; draw(); }));
  draw();
  return null;
}
