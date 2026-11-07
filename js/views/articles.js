import { store, updateArticle, deleteArticle, importQuestions } from "../store.js";
import { blocksToQA, sectionsToQA } from "../import/blocks.js";
import { buildQuestions } from "../import/build.js";
import { articleHtml, hydrateImages, tocOf, searchText } from "./article-render.js";
import { toMarkdown, fromMarkdown } from "../import/ocrlayout.js";
import { mountViewer } from "./imgviewer.js";
import { delBlob, getBlob } from "../imgstore.js";
import { loadRemote, connected, unpublish, updateDoc, publishDoc, fetchBlob, resolvePages } from "../github.js";
import { esc, toast, fmtDate, $ } from "../ui.js";

const plain = searchText;

export function view(root, ctx) {
  let q = "", editing = false, cur = ctx?.params?.get("id") || null, closeViewer = null, freeImgs = null, mode = "read";
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
    const a = current(); cur = a.id;
    const hits = all.filter((x) => !q || plain(x).includes(q.toLowerCase()));
    host.innerHTML = `<div class="faq-layout">
      <aside class="faq-side" aria-label="Articles"><input id="aq" type="search" value="${esc(q)}" placeholder="Search articles" aria-label="Search articles" autocomplete="off">
        <div class="art-list">${hits.map((x) => `<button class="art-item ${x.id === a.id ? "on" : ""}" data-id="${x.id}"><strong>${esc(x.title)}</strong><span class="small muted">${esc(x.topic || "")} · ${fmtDate(x.t)}</span></button>`).join("") || '<p class="small muted">No match.</p>'}</div>
        <a class="btn sm" href="#/library?tab=add" style="margin-top:8px">Add more</a></aside>
      <div class="faq-main"><div class="card">
        <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><div><h2 style="margin:0">${esc(a.title)}</h2>
          <span class="small muted">${esc(a.topic || "")}${a.kind === "images" ? ` · ${a.pages.length} picture${a.pages.length > 1 ? "s" : ""}, kept as images${a.remote || a.published ? " · on GitHub, all devices" : " · this device only"}` : ""}${a.source?.conf ? ` · read at ${a.source.conf}% confidence` : ""}${a.source?.pages ? ` · ${a.source.pages} page${a.source.pages > 1 ? "s" : ""}` : ""}${a.source?.file ? ` · from ${esc(a.source.file)}` : ""}${a.kind === "doc" ? (a.remote || a.published ? " · on GitHub, all devices" : " · this device only") : ""}</span></div>
          <div class="row" style="gap:6px">${a.kind === "doc" && !a.remote && !a.published && connected() ? `<button class="btn sm" id="apub" title="Move this article into your GitHub repository">Move to GitHub</button>` : ""}${a.original ? `<div class="seg" role="group" aria-label="View"><button id="mRead" aria-pressed="${mode === "read"}">Reading view</button><button id="mOrig" aria-pressed="${mode === "orig"}">Original</button></div>` : ""}${a.kind === "images" ? "" : `<button class="btn sm primary" id="aquiz" title="Multiple choice questions made from this article">Quiz me on this</button>`}${a.kind === "images" || (a.remote && !a.mine) ? "" : `<button class="btn sm" id="aedit">${editing ? "Cancel" : "Edit"}</button><button class="btn sm" id="acopy">Copy</button>`}<button class="btn sm danger" id="adel">Delete</button></div></div>
        ${a.kind === "images" ? `<div id="aview" style="margin-top:12px"></div>` : editing ? `<textarea id="amd" rows="22" style="width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:13px" aria-label="Article text">${esc(toMarkdown(a.blocks))}</textarea><button class="btn primary" id="asave" style="margin-top:8px">Save changes</button>`
          : mode === "orig" && a.original ? `<div id="aorig" style="margin-top:12px"></div>` : `${(() => { const t = tocOf(a.blocks); return t.length >= 4 ? `<details class="art-toc"><summary>Contents (${t.length})</summary>${t.map((x) => `<a class="l${x.level}" href="#" data-toc="${x.id}">${x.n ? x.n + ". " : ""}${esc(x.text)}</a>`).join("")}</details>` : ""; })()}<article class="art" style="margin-top:12px">${articleHtml(a.blocks)}</article>`}
      </div></div></div>`;
    $("#aq").oninput = (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $("#aq"); n.focus(); n.setSelectionRange(pos, pos); };
    host.querySelectorAll(".art-item").forEach((b) => (b.onclick = () => { cur = b.dataset.id; editing = false; draw(); }));
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
    if ($("#aquiz")) $("#aquiz").onclick = () => {
      let items = blocksToQA(a.blocks); if (items.length < 4) items = sectionsToQA(a.blocks, a.topic || a.title);
      if (items.length < 4) { toast("This article needs at least four sections or questions to make a multiple choice quiz.", true); return; }
      const importId = "art-" + a.id, built = buildQuestions(items, { importId, existingCats: store.get().cats });
      importQuestions({ questions: built.questions, cats: built.cats, seeds: built.seeds, record: { id: importId, name: a.title, kind: "Article" }, seedConfident: false, update: true });
      location.hash = "#/quiz?cat=" + encodeURIComponent(built.questions[0].c);
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
