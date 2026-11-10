// Daily picks: fresh reading matched to your skills, collected each morning by a GitHub Action. Open, save, or add to your library.
import { loadFeed, isNew, TOPIC_NAMES } from "../dailypicks.js";
import { metaOf, setMeta } from "../libmeta.js";
import { esc, fmtDate, $ } from "../ui.js";

const dayLabel = (d) => { const t = Date.parse(d), n = Math.floor((Date.now() - t) / 864e5); return n <= 0 ? "Today" : n === 1 ? "Yesterday" : fmtDate(t); };

export async function view(root) {
  let topic = "all", show = "new";
  root.innerHTML = `<header class="page-head"><h1>Daily picks</h1><p>Fresh articles and release notes matched to your skills (.NET, EF Core, Angular, Azure, architecture, security, interviews). Collected every morning from public sources. Only the title, a short excerpt and the link are kept here: open the original to read it.</p></header><div id="dpBody"><p class="muted"><span class="spinner"></span> Loading…</p></div>`;
  const feed = await loadFeed(true);
  const host = $("#dpBody"); if (!host || !host.isConnected) return null;

  function draw() {
    const items = feed.items.filter((it) => !metaOf("pick", it.id).hide);
    if (!items.length) {
      host.innerHTML = `<div class="card"><h2>No picks yet</h2><p class="muted">${feed.failed ? "The list could not be loaded. Check your connection and try again." : "The first list arrives after the daily collector runs. It runs by itself every morning at 6:00 India time. To get the first list now, open your repository on GitHub, go to Actions, choose “Daily picks”, and press Run workflow."}</p></div>`;
      return;
    }
    const topics = [...new Set(items.flatMap((i) => i.topics || []))];
    const list = items.filter((it) => (topic === "all" || (it.topics || []).includes(topic)) && (show === "all" || (show === "new" ? isNew(it) : !!metaOf("pick", it.id).saved)));
    const nNew = items.filter(isNew).length, nSaved = items.filter((i) => metaOf("pick", i.id).saved).length;
    const groups = []; for (const it of list) { const k = it.added || it.date; let g = groups.find((x) => x.k === k); if (!g) groups.push((g = { k, items: [] })); g.items.push(it); }
    host.innerHTML = `
      <div class="lib-filters">
        <div class="seg" role="group" aria-label="Show">${[["new", `New (${nNew})`], ["saved", `Saved (${nSaved})`], ["all", `All (${items.length})`]].map(([k, l]) => `<button data-show="${k}" aria-pressed="${show === k}">${l}</button>`).join("")}</div>
        <div class="chips" role="group" aria-label="Topic">${[["all", "All topics"], ...topics.map((t) => [t, TOPIC_NAMES[t] || t])].map(([k, l]) => `<button class="chip" data-topic="${k}" aria-pressed="${topic === k}">${esc(l)}</button>`).join("")}</div>
      </div>
      <p class="small muted">${feed.updated ? `Updated ${fmtDate(Date.parse(feed.updated))}. ` : ""}Picks are suggestions from outside sources: check details against the official docs before you rely on them in an interview.</p>
      ${groups.map((g) => `<h2 class="lib-day">${esc(dayLabel(g.k))}</h2><div class="pick-grid">${g.items.map((it) => { const m = metaOf("pick", it.id); return `
        <article class="card pick ${m.read ? "read" : ""}" data-id="${it.id}">
          <div class="small muted">${esc(it.source)} · ${esc(fmtDate(Date.parse(it.date)))}${isNew(it) ? ` <span class="tag moss">New</span>` : ""}</div>
          <h3><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" data-open>${esc(it.title)}</a></h3>
          ${it.summary ? `<p class="small">${esc(it.summary)}</p>` : ""}
          <div class="row" style="gap:6px;flex-wrap:wrap">${(it.topics || []).map((t) => `<span class="tag">${esc(TOPIC_NAMES[t] || t)}</span>`).join("")}</div>
          <div class="row pick-actions"><a class="btn sm primary" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" data-open>Read</a><a class="btn sm" href="#/library?tab=add&url=${encodeURIComponent(it.url)}" title="Read the page and keep a copy in your library">Add to library</a><button class="btn sm" data-save aria-pressed="${!!m.saved}">${m.saved ? "★ Saved" : "☆ Save"}</button><button class="btn sm" data-hide title="Hide this pick">Hide</button></div>
        </article>`; }).join("")}</div>`).join("") || `<p class="muted">Nothing here. ${show === "new" ? "You are all caught up. Choose “All” to see earlier picks." : show === "saved" ? "Star a pick to keep it here." : ""}</p>`}`;
    host.querySelectorAll("[data-show]").forEach((b) => (b.onclick = () => { show = b.dataset.show; draw(); }));
    host.querySelectorAll("[data-topic]").forEach((b) => (b.onclick = () => { topic = b.dataset.topic; draw(); }));
    host.querySelectorAll(".pick").forEach((c) => {
      const id = c.dataset.id;
      c.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", () => { setMeta("pick", id, { read: true }); c.classList.add("read"); }));
      c.querySelector("[data-save]").onclick = () => { setMeta("pick", id, { saved: !metaOf("pick", id).saved }); draw(); };
      c.querySelector("[data-hide]").onclick = () => { setMeta("pick", id, { hide: true }); draw(); };
    });
  }
  draw();
  return null;
}
