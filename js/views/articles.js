import { store, updateArticle, deleteArticle } from "../store.js";
import { articleHtml, hydrateImages, tocOf, searchText } from "./article-render.js";
import { toMarkdown, fromMarkdown } from "../import/ocrlayout.js";
import { mountViewer } from "./imgviewer.js";
import { delBlob, getBlob } from "../imgstore.js";
import { loadRemote, connected, unpublish, updateDoc, publishDoc, fetchBlob, resolvePages } from "../github.js";
import { metaOf, setMeta, prefs, setPrefs, readMinutes } from "../libmeta.js";
import { esc, toast, fmtDate, $ } from "../ui.js";

const plain = searchText;

export function view(root, ctx) {
  let q = "", editing = false, cur = ctx?.params?.get("id") || null, closeViewer = null, freeImgs = null, mode = "read", sort = "recent", filt = "all", listFirst = !ctx?.params?.get("id"), offScroll = null;
  const narrow = () => window.matchMedia("(max-width: 859px)").matches;
  const wc = (a) => (a.kind === "images" ? 0 : (searchText(a).match(/\S+/g) || []).length);
  let remote = [];
  const list = () => { const mine = store.get().articles || []; return [...mine, ...remote.filter((r) => !mine.some((m) => m.id === r.id))].sort((a, b) => (b.t || 0) - (a.t || 0)); };
  loadRemote().then((r) => { remote = r; if (r.length && document.body.contains(host)) draw(); });
  const current = () => list().find((a) => a.id === cur) || list()[0];

  root.innerHTML = `
    <header class="page-head"><h1>Articles</h1>
      <p>Study notes you imported from pictures or files, kept in the shape of the original. Read them here, open the original file as it is, fix any word the reader got wrong, or turn them into practice questions.</p></header>
    <div id="artRoot"></div>`;
  const host = $("#artRoot");

  function draw() {
    closeViewer?.(); closeViewer = null; freeImgs?.(); freeImgs = null;
    const all = list();
    if (!all.length) {
      host.innerHTML = `<div class="card"><h2>No articles yet</h2><p class="muted">Add a PDF, Word, Excel, text or markdown file, or a picture of a notes page. It is read on your device and saved here as an article.</p><a class="btn primary" href="#/library?tab=add">Add material</a></div>`;
      return;
    }
    const a = current(); if (all.some((x) => x.id === cur) || !cur) cur = a.id;
    const hits = all.filter((x) => (!q || plain(x).includes(q.toLowerCase())) && (filt === "all" || (filt === "star" ? metaOf("art", x.id).fav : !metaOf("art", x.id).done)))
      .sort((x, y) => sort === "az" ? x.title.localeCompare(y.title) : sort === "star" ? (!!metaOf("art", y.id).fav - !!metaOf("art", x.id).fav) || (y.t || 0) - (x.t || 0) : (y.t || 0) - (x.t || 0));
    const pf = prefs(), me = metaOf("art", a.id), mob = narrow();
    host.innerHTML = `<div class="faq-layout ${mob ? (listFirst ? "m-list" : "m-detail") : ""}">
      <aside class="faq-side" aria-label="Articles"><input id="aq" type="search" value="${esc(q)}" placeholder="Search articles" aria-label="Search articles" autocomplete="off">
        <div class="art-tools"><div class="chips" role="group" aria-label="Filter">${[["all", "All"], ["star", "★ Starred"], ["unread", "Unread"]].map(([k, l]) => `<button class="chip" data-filt="${k}" aria-pressed="${filt === k}">${l}</button>`).join("")}</div>
          <select id="asort" aria-label="Sort articles"><option value="recent"${sort === "recent" ? " selected" : ""}>Newest first</option><option value="az"${sort === "az" ? " selected" : ""}>A to Z</option><option value="star"${sort === "star" ? " selected" : ""}>Starred first</option></select></div>
        <div class="art-list">${(() => { const item = (x) => `<button class="art-item ${x.id === a.id && !(mob && listFirst) ? "on" : ""}" data-id="${x.id}"><strong>${metaOf("art", x.id).fav ? "★ " : ""}${esc(x.title)}</strong><span class="small muted">${esc(x.topic || "")} · ${fmtDate(x.t)}${wc(x) ? ` · ${readMinutes(wc(x))} min` : ""}${metaOf("art", x.id).done ? " · read ✓" : metaOf("art", x.id).pct > 3 ? ` · ${metaOf("art", x.id).pct}%` : ""}</span></button>`; const byOrd = (g) => hits.filter((x) => x.group === g).sort((x, y) => (x.order || 0) - (y.order || 0)), rm = byOrd("roadmap"), cp = byOrd("corpay"), rest = hits.filter((x) => x.group !== "roadmap" && x.group !== "corpay"); return (cp.length ? `<div class="art-group">Corpay interview prep</div>${cp.map(item).join("")}` : "") + (rm.length ? `<div class="art-group">Roadmap 2026-27 study guides</div>${rm.map(item).join("")}` : "") + ((rm.length || cp.length) && rest.length ? `<div class="art-group">Other articles</div>` : "") + rest.map(item).join("") || '<p class="small muted">No match.</p>'; })()}</div>
        <a class="btn sm" href="#/library?tab=add" style="margin-top:8px">Add more</a></aside>
      <div class="faq-main"><div class="card" style="--art-scale:${pf.size / 100}">
        ${mob ? `<button class="btn sm art-back" id="aback">← All articles</button>` : ""}
        <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><div><h2 style="margin:0">${esc(a.title)}</h2>
          <span class="small muted">${esc(a.topic || "")}${a.kind === "images" ? ` · ${a.pages.length} picture${a.pages.length > 1 ? "s" : ""}, kept as images${a.remote || a.published ? " · on GitHub, all devices" : " · this device only"}` : ""}${a.source?.conf ? ` · read at ${a.source.conf}% confidence` : ""}${a.source?.pages ? ` · ${a.source.pages} page${a.source.pages > 1 ? "s" : ""}` : ""}${a.source?.file ? ` · from ${esc(a.source.file)}` : ""}${a.kind === "doc" ? (a.remote || a.published ? " · on GitHub, all devices" : " · this device only") : ""}</span></div>
          <div class="row" style="gap:6px"><button class="btn sm" id="astar" aria-pressed="${!!me.fav}" title="Star this article">${me.fav ? "★ Starred" : "☆ Star"}</button>${a.kind === "doc" && !a.remote && !a.published && connected() ? `<button class="btn sm" id="apub" title="Move this article into your GitHub repository">Move to GitHub</button>` : ""}${a.original ? `<div class="seg" role="group" aria-label="View"><button id="mRead" aria-pressed="${mode === "read"}">Reading view</button><button id="mOrig" aria-pressed="${mode === "orig"}">Original</button></div>` : ""}${a.kind === "images" || (a.remote && !a.mine) ? "" : `<button class="btn sm" id="aedit">${editing ? "Cancel" : "Edit"}</button><button class="btn sm" id="acopy">Copy</button>`}<button class="btn sm danger" id="adel">Delete</button></div></div>
        ${a.kind === "images" ? `<div id="aview" style="margin-top:12px"></div>` : editing ? `<textarea id="amd" rows="22" style="width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:13px" aria-label="Article text">${esc(toMarkdown(a.blocks))}</textarea><button class="btn primary" id="asave" style="margin-top:8px">Save changes</button>`
          : mode === "orig" && a.original ? `<div id="aorig" style="margin-top:12px"></div>` : `${(() => { const t = tocOf(a.blocks); return t.length >= 4 ? `<details class="art-toc"><summary>Contents (${t.length})</summary>${t.map((x) => `<a class="l${x.level}" href="#" data-toc="${x.id}">${x.n ? x.n + ". " : ""}${esc(x.text)}</a>`).join("")}</details>` : ""; })()}<div class="art-bar row" role="group" aria-label="Reading options"><span class="small muted">${wc(a) ? readMinutes(wc(a)) + " min read" : ""}</span><span class="spacer"></span><button class="btn sm" id="afsm" aria-label="Smaller text">A−</button><button class="btn sm" id="afsp" aria-label="Larger text">A+</button><button class="btn sm" id="awide" aria-pressed="${pf.wide}">${pf.wide ? "Narrow" : "Wide"}</button></div><article class="art ${pf.wide ? "wide" : ""}" style="margin-top:12px">${articleHtml(a.blocks)}</article>`}
      </div></div></div><div class="art-progress" id="aprog" aria-hidden="true"><i></i></div>`;
    $("#aq").oninput = (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $("#aq"); n.focus(); n.setSelectionRange(pos, pos); };
    host.querySelectorAll(".art-item").forEach((b) => (b.onclick = () => { cur = b.dataset.id; editing = false; listFirst = false; draw(); window.scrollTo({ top: 0 }); }));
    host.querySelectorAll("[data-filt]").forEach((b) => (b.onclick = () => { filt = b.dataset.filt; draw(); }));
    $("#asort").onchange = (e) => { sort = e.target.value; draw(); };
    if ($("#aback")) $("#aback").onclick = () => { listFirst = true; draw(); window.scrollTo({ top: 0 }); };
    $("#astar").onclick = () => { setMeta("art", a.id, { fav: !metaOf("art", a.id).fav }); draw(); };
    const bump = (d) => { setPrefs({ size: Math.min(160, Math.max(80, prefs().size + d)) }); draw(); };
    if ($("#afsm")) { $("#afsm").onclick = () => bump(-10); $("#afsp").onclick = () => bump(10); $("#awide").onclick = () => { setPrefs({ wide: !prefs().wide }); draw(); }; }
    // reading progress: remembered per article, marked read near the end
    offScroll?.(); offScroll = null;
    if (!(mob && listFirst) && $(".art", host)) {
      const bar = $("#aprog i"), art = $(".art", host); let tmr = null;
      setMeta("art", a.id, { opened: Date.now() });
      const upd = () => { const r = art.getBoundingClientRect(), total = r.height - innerHeight * 0.6, done = Math.min(1, Math.max(0, (-r.top + innerHeight * 0.3) / Math.max(total, 1))); if (bar) bar.style.width = Math.round(done * 100) + "%"; clearTimeout(tmr); tmr = setTimeout(() => { const p = Math.round(done * 100), m = metaOf("art", a.id); if (p > (m.pct || 0) || (p >= 92 && !m.done)) setMeta("art", a.id, { pct: Math.max(p, m.pct || 0), done: m.done || p >= 92 }); }, 600); };
      window.addEventListener("scroll", upd, { passive: true }); upd();
      offScroll = () => { window.removeEventListener("scroll", upd); clearTimeout(tmr); };
    }
    if (a.kind === "images") {
      const v = $("#aview");
      if (a.mine && a.pages.some((p) => !p.url)) { v.innerHTML = `<p class="muted"><span class="spinner"></span> Loading your pictures from GitHub…</p>`; resolvePages(a).then((pp) => { a.pages = pp; if (document.body.contains(v)) closeViewer = mountViewer(v, a.pages); }).catch((e) => { v.innerHTML = `<div class="callout warn">${esc(e.message)}</div>`; }); }
      else closeViewer = mountViewer(v, a.pages);
    }
    if ($(".art", host)) freeImgs = hydrateImages($(".art", host), { mine: !!a.mine });
    host.querySelectorAll("[data-toc]").forEach((l) => (l.onclick = (e) => { e.preventDefault(); document.getElementById(l.dataset.toc)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
    if ($("#mRead")) { $("#mRead").onclick = () => { mode = "read"; draw(); }; $("#mOrig").onclick = () => { mode = "orig"; draw(); }; }
    if ($("#aorig")) showOriginal(a, $("#aorig"));
    if ($("#apub")) $("#apub").onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const blob = a.original ? await getBlob(a.original.id) : null, images = [];
        for (const b of a.blocks) if (b.type === "img" && b.id) { const ib = await getBlob(b.id); if (ib) images.push({ id: b.id, blob: ib, type: ib.type || "image/png" }); }
        await publishDoc(a, blob ? { blob, name: a.original.name, type: a.original.type, size: a.original.size } : null, (t) => { btn.textContent = t; }, images);
        if (a.original) delBlob(a.original.id); images.forEach((i) => delBlob(i.id)); deleteArticle(a.id);
        remote = await loadRemote(); toast("Moved to your GitHub repository"); cur = a.id; draw();
      } catch (err) { btn.disabled = false; btn.textContent = "Move to GitHub"; toast(err.message, true); }
    };
    if ($("#aedit")) $("#aedit").onclick = () => { editing = !editing; draw(); };
    if ($("#acopy")) $("#acopy").onclick = async () => { try { await navigator.clipboard.writeText(toMarkdown(a.blocks)); toast("Copied"); } catch { toast("Could not copy"); } };
    $("#adel").onclick = async () => {
      const onGh = a.remote || a.published;
      if (a.remote && !a.mine) { toast("This is a shared sample from the app, so it cannot be deleted here."); return; }
      if (onGh && !connected()) { toast("This one is on GitHub. Connect GitHub in Settings to delete it there."); if (a.remote) return; }
      if (!confirm(`Delete “${a.title}”${onGh && connected() ? " from this device and from GitHub" : ""}?`)) return;
      try { if (onGh && connected()) await unpublish(a.id, [...(a.pages || []).map((p) => p.path), a.original?.path, a.kind === "doc" ? `content/${a.id}/article.json` : null, a.questions, ...(a.images || [])].filter(Boolean)); } catch (e) { toast(e.message); return; }
      (a.pages || []).forEach((p) => p.id && delBlob(p.id)); if (a.original) delBlob(a.original.id); (a.imageIds || []).forEach((i) => delBlob(i)); deleteArticle(a.id); remote = remote.filter((r) => r.id !== a.id); cur = null; draw();
    };
    if (editing && $("#asave")) $("#asave").onclick = async () => {
      const blocks = fromMarkdown($("#amd").value);
      if (a.remote) { try { await updateDoc(a, { blocks }); a.blocks = blocks; } catch (e) { toast(e.message, true); return; } } else updateArticle(a.id, { blocks });
      editing = false; toast("Saved"); draw();
    };
  }
  draw();
  return () => { offScroll?.(); closeViewer?.(); freeImgs?.(); };
}

// The original file, as it is: PDF and pictures open in the page, Word and Excel can only be downloaded (a browser cannot draw them).
async function showOriginal(a, el) {
  const o = a.original; let url;
  try { if (o.id) { const blob = await getBlob(o.id); if (blob) url = URL.createObjectURL(blob); } if (!url && o.path) { if (a.mine) { const blob = await fetchBlob(o.path); if (blob) url = URL.createObjectURL(blob); } else url = o.path; } if (!url) throw new Error("missing"); }
  catch { el.innerHTML = `<div class="callout warn"><strong>The original file is not on this device.</strong> It is kept only where it was imported, and it is not part of backups. The reading view still has all the text.</div>`; return; }
  const dl = `<a class="btn sm" href="${url}" download="${esc(o.name)}">Download ${esc(o.name)}</a>`;
  if (o.ext === "pdf") el.innerHTML = `<div class="row" style="gap:8px;margin-bottom:8px">${dl}<a class="btn sm" href="${url}" target="_blank" rel="noopener">Open in a new tab</a></div><iframe src="${url}" title="${esc(o.name)}" style="width:100%;height:75vh;border:1px solid var(--line);border-radius:8px"></iframe>`;
  else el.innerHTML = `<div class="callout"><strong>${esc(o.name)}</strong> is a ${o.ext === "docx" ? "Word" : "Excel"} file, which browsers cannot show directly. Download it to open it in ${o.ext === "docx" ? "Word" : "Excel"}; the reading view has the same content.</div><p>${dl}</p>`;
}
