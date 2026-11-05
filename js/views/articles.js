import { store, updateArticle, deleteArticle } from "../store.js";
import { articleHtml } from "./article-render.js";
import { toMarkdown, fromMarkdown } from "../import/ocrlayout.js";
import { mountViewer } from "./imgviewer.js";
import { delBlob } from "../imgstore.js";
import { loadRemote, connected, unpublish } from "../github.js";
import { esc, toast, fmtDate, $ } from "../ui.js";

const plain = (a) => [a.title, ...a.blocks.map((b) => b.text || (b.items || []).join(" ") || (b.rows || []).flat().join(" "))].join(" ").toLowerCase();

export function view(root, ctx) {
  let q = "", editing = false, cur = ctx?.params?.get("id") || null, closeViewer = null;
  let remote = [];
  const list = () => { const mine = store.get().articles || []; return [...mine, ...remote.filter((r) => !mine.some((m) => m.id === r.id))].sort((a, b) => (b.t || 0) - (a.t || 0)); };
  loadRemote().then((r) => { remote = r; if (r.length && document.body.contains(host)) draw(); });
  const current = () => list().find((a) => a.id === cur) || list()[0];

  root.innerHTML = `
    <header class="page-head"><h1>Articles</h1>
      <p>Study notes you imported from pictures, kept in the shape of the original page. Read them here, fix any word the reader got wrong, or turn them into practice questions.</p></header>
    <div id="artRoot"></div>`;
  const host = $("#artRoot");

  function draw() {
    closeViewer?.(); closeViewer = null;
    const all = list();
    if (!all.length) {
      host.innerHTML = `<div class="card"><h2>No articles yet</h2><p class="muted">Take a photo or screenshot of a notes page and import it: the text is read on your device and saved here as an article.</p><a class="btn primary" href="#/import">Import from pictures</a></div>`;
      return;
    }
    const a = current(); cur = a.id;
    const hits = all.filter((x) => !q || plain(x).includes(q.toLowerCase()));
    host.innerHTML = `<div class="faq-layout">
      <aside class="faq-side" aria-label="Articles"><input id="aq" type="search" value="${esc(q)}" placeholder="Search articles" aria-label="Search articles" autocomplete="off">
        <div class="art-list">${hits.map((x) => `<button class="art-item ${x.id === a.id ? "on" : ""}" data-id="${x.id}"><strong>${esc(x.title)}</strong><span class="small muted">${esc(x.topic || "")} · ${fmtDate(x.t)}</span></button>`).join("") || '<p class="small muted">No match.</p>'}</div>
        <a class="btn sm" href="#/import" style="margin-top:8px">Import more pictures</a></aside>
      <div class="faq-main"><div class="card">
        <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><div><h2 style="margin:0">${esc(a.title)}</h2>
          <span class="small muted">${esc(a.topic || "")}${a.kind === "images" ? ` · ${a.pages.length} picture${a.pages.length > 1 ? "s" : ""}, kept as images${a.remote || a.published ? " · on GitHub, all devices" : " · this device only"}` : ""}${a.source?.conf ? ` · read at ${a.source.conf}% confidence` : ""}${a.source?.pages ? ` · ${a.source.pages} page${a.source.pages > 1 ? "s" : ""}` : ""}</span></div>
          <div class="row" style="gap:6px">${a.kind === "images" ? "" : `<button class="btn sm" id="aedit">${editing ? "Cancel" : "Edit"}</button><button class="btn sm" id="acopy">Copy</button>`}<button class="btn sm danger" id="adel">Delete</button></div></div>
        ${a.kind === "images" ? `<div id="aview" style="margin-top:12px"></div>` : editing ? `<textarea id="amd" rows="22" style="width:100%;margin-top:10px;font-family:ui-monospace,monospace;font-size:13px" aria-label="Article text">${esc(toMarkdown(a.blocks))}</textarea><button class="btn primary" id="asave" style="margin-top:8px">Save changes</button>`
          : `<article class="art" style="margin-top:12px">${articleHtml(a.blocks)}</article>`}
      </div></div></div>`;
    $("#aq").oninput = (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const n = $("#aq"); n.focus(); n.setSelectionRange(pos, pos); };
    host.querySelectorAll(".art-item").forEach((b) => (b.onclick = () => { cur = b.dataset.id; editing = false; draw(); }));
    if (a.kind === "images") closeViewer = mountViewer($("#aview"), a.pages);
    if ($("#aedit")) $("#aedit").onclick = () => { editing = !editing; draw(); };
    if ($("#acopy")) $("#acopy").onclick = async () => { try { await navigator.clipboard.writeText(toMarkdown(a.blocks)); toast("Copied"); } catch { toast("Could not copy"); } };
    $("#adel").onclick = async () => {
      const onGh = a.remote || a.published;
      if (onGh && !connected()) { toast("This one is on GitHub. Connect GitHub in Settings to delete it there."); if (a.remote) return; }
      if (!confirm(`Delete “${a.title}”${onGh && connected() ? " from this device and from GitHub" : ""}?`)) return;
      try { if (onGh && connected()) await unpublish(a.id, (a.pages || []).map((p) => p.path).filter(Boolean)); } catch (e) { toast(e.message); return; }
      (a.pages || []).forEach((p) => p.id && delBlob(p.id)); deleteArticle(a.id); remote = remote.filter((r) => r.id !== a.id); cur = null; draw();
    };
    if (editing && $("#asave")) $("#asave").onclick = () => { updateArticle(a.id, { blocks: fromMarkdown($("#amd").value) }); editing = false; toast("Saved"); draw(); };
  }
  draw();
}
