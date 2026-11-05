// "Import from pictures": choose images, see the quality and the accuracy you can expect, read them,
// check the result against the page, then save it as an article (and optionally practice questions).
import { inspect, extract, markUnsure, mergePages, isImage, exportPage } from "../import/ocr.js";
import { putBlob, newBlobId } from "../imgstore.js";
import { toMarkdown, fromMarkdown, sequenceWarnings, suggestOrder } from "../import/ocrlayout.js";
import { addArticle } from "../store.js";
import { articleHtml, notesText } from "./article-render.js";
import { esc, toast, $ } from "../ui.js";

export function mountImageImport(host, { onQuestions, topicNames = () => [] }) {
  host.innerHTML = `
    <section class="card" id="imgCard" aria-labelledby="imgh"><h2 id="imgh">Import from pictures</h2>
      <p class="small muted" style="margin-top:0">Photos of notes, screenshots or scanned pages. The text is read on your device and turned into an article that follows the page: title, numbered sections, bullets and tables. Pictures are never uploaded.</p>
      <label class="drop" id="imgDrop" for="imgFile" style="margin-top:0"><strong>Choose pictures, or drop them here</strong>
        <span class="muted small">PNG, JPG or WebP. Pick as many pages as you have, then put them in reading order before extracting.</span>
        <input id="imgFile" type="file" accept="image/*" multiple hidden></label>
      <div id="imgBody"></div></section>`;
  let pages = []; // { info, est, result }
  let stage = "idle", from = null; // from: index of the page being dragged
  const body = $("#imgBody", host);
  const fileInput = $("#imgFile", host);

  fileInput.onchange = (e) => { load([...e.target.files]); e.target.value = ""; };
  const drop = $("#imgDrop", host);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => load([...(e.dataTransfer?.files || [])]));

  async function load(files) {
    files = files.filter(isImage);
    if (!files.length) { toast("Choose picture files (PNG, JPG or WebP)"); return; }
    stage = "analysing"; body.innerHTML = `<p><span class="spinner"></span> Checking ${files.length} picture${files.length > 1 ? "s" : ""}…</p>`;
    // files chosen together are put in file-name order (phone cameras and screenshots number their files), then you can drag them into place
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const f of files) {
      try { const info = await inspect(f); pages.push({ info, result: null }); }
      catch (e) { toast(`${f.name}: ${e.message}`); }
    }
    stage = pages.length ? "ready" : "idle";
    drawAnalysis();
  }

  const range = (e) => `${e.low}–${e.high}%`;
  function drawAnalysis() {
    if (!pages.length) { body.innerHTML = ""; return; }
    const lo = Math.round(pages.reduce((s, p) => s + p.info.est.low, 0) / pages.length), hi = Math.round(pages.reduce((s, p) => s + p.info.est.high, 0) / pages.length);
    body.innerHTML = `
      <div class="img-est" role="status"><div class="img-est-n"><strong>${lo}–${hi}%</strong><span class="small muted">expected accuracy</span></div>
        <p class="small" style="margin:0">An estimate from picture quality alone (size of text, sharpness, contrast, resolution). After reading you get the engine's own measured confidence and every doubtful word is outlined on the page.</p></div>
      <h3 style="margin-bottom:4px">Page order</h3>
      <p class="small muted" style="margin-top:0">${pages.length > 1 ? "The pages are read and joined in this order, so sections, numbering and sentences carry on from one page to the next. Drag a page, or use the arrows, to put them in sequence." : "Add more pictures to continue the notes on further pages."}</p>
      <ol class="img-pages" id="imgList">${pages.map((p, i) => `<li class="img-page" draggable="true" data-i="${i}"><span class="img-num" aria-hidden="true">${i + 1}</span><div class="img-prev" data-i="${i}"></div>
        <div><strong class="small">${esc(p.info.file.name)}</strong> <span class="tag">${range(p.info.est)}</span>${p.result ? ' <span class="tag">read</span>' : ""}
        <ul class="img-factors">${p.info.est.factors.map((f) => `<li class="${f.ok ? "ok" : "bad"}"><span aria-hidden="true">${f.ok ? "✓" : "!"}</span> ${esc(f.text)}${f.tip ? ` <span class="muted">${esc(f.tip)}</span>` : ""}</li>`).join("")}</ul>
        <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" data-mv="-1" data-i="${i}" aria-label="Move page ${i + 1} earlier" ${i === 0 ? "disabled" : ""}>↑ Earlier</button><button class="btn sm" data-mv="1" data-i="${i}" aria-label="Move page ${i + 1} later" ${i === pages.length - 1 ? "disabled" : ""}>↓ Later</button><button class="btn sm" data-rm="${i}" aria-label="Remove page ${i + 1}">Remove</button></div></div></li>`).join("")}</ol>
      <div class="row" style="gap:10px;align-items:center;margin-top:8px"><label class="btn sm" for="imgFile2" style="cursor:pointer">+ Add more pictures</label><input id="imgFile2" type="file" accept="image/*" multiple hidden></div>
      <div class="row" style="gap:10px;align-items:center;margin-top:12px"><button class="btn primary" id="imgGo">${pages.every((p) => p.result) ? "Show the text again" : "Start extraction"}</button><span class="small muted">${pages.length} page${pages.length > 1 ? "s" : ""}${pages.some((p) => p.result) ? ", already-read pages are not read again" : ""}</span></div>
      <details class="img-keep" style="margin-top:12px"><summary><strong>Or keep them as pictures, without reading the text</strong></summary>
        <p class="small muted" style="margin:6px 0">Saved on this device as they are (dark bars trimmed). In Articles you can zoom, pan, switch to black &amp; white or dark view, and flip through the pages in the order above. Nothing is searched inside the picture, only its title and topic.</p>
        <div class="grid g2"><div><label for="imgKTitle">Title</label><input id="imgKTitle" value="${esc(pages[0].info.file.name.replace(/\.[^.]+$/, ""))}"></div>
          <div><label for="imgKTopic">Topic</label><input id="imgKTopic" list="imgTopics2" placeholder="e.g. REST APIs" autocomplete="off"><datalist id="imgTopics2">${topicNames().map((n) => `<option value="${esc(n)}">`).join("")}</datalist></div></div>
        <button class="btn" id="imgKeep" style="margin-top:8px">Keep as pictures</button><span id="imgKeepMsg" class="small" role="status" style="margin-left:8px"></span></details>
      <div id="imgProg" style="margin-top:10px"></div>`;
    pages.forEach((p, i) => { const host2 = body.querySelector(`.img-prev[data-i="${i}"]`); p.info.preview.className = "img-canvas"; p.info.preview.setAttribute("role", "img"); p.info.preview.setAttribute("aria-label", "Preview of " + p.info.file.name); host2.append(p.info.preview); });
    $("#imgGo", host).onclick = run;
    $("#imgKeep", host).onclick = keepPictures;
    $("#imgFile2", host).onchange = (e) => { load([...e.target.files]); e.target.value = ""; };
    body.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { move(+b.dataset.i, +b.dataset.i + +b.dataset.mv); }));
    body.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { pages.splice(+b.dataset.rm, 1); pages.length ? drawAnalysis() : (body.innerHTML = ""); }));
    // drag to reorder
    const list = $("#imgList", host);
    list.querySelectorAll(".img-page").forEach((li) => {
      li.addEventListener("dragstart", (e) => { from = +li.dataset.i; li.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(from)); } catch { /* ignore */ } });
      li.addEventListener("dragend", () => { li.classList.remove("drag"); list.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); });
      li.addEventListener("dragenter", (e) => { if (from !== null) e.preventDefault(); });
      li.addEventListener("dragover", (e) => { if (from === null) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; li.classList.add("over"); });
      li.addEventListener("dragleave", () => li.classList.remove("over"));
      li.addEventListener("drop", (e) => { e.preventDefault(); if (from !== null) move(from, +li.dataset.i); from = null; });
    });
  }
  async function keepPictures() {
    const btn = $("#imgKeep", host), msg = $("#imgKeepMsg", host); btn.disabled = true;
    const ttl = $("#imgKTitle", host).value.trim() || "Pictures", topic = $("#imgKTopic", host).value.trim() || ttl;
    try {
      const saved = [];
      for (let i = 0; i < pages.length; i++) {
        msg.textContent = `Saving page ${i + 1} of ${pages.length}…`;
        const { blob, w, h } = await exportPage(pages[i].info), id = newBlobId();
        await putBlob(id, blob); saved.push({ id, w, h, name: pages[i].info.file.name });
      }
      const a = addArticle({ title: ttl, topic, kind: "images", pages: saved, blocks: [] });
      toast("Saved to Articles");
      body.innerHTML = `<div class="callout ok"><strong>Kept ${saved.length} picture${saved.length > 1 ? "s" : ""} as “${esc(ttl)}”.</strong> <a href="#/articles?id=${a.id}">Open them in Articles</a> to zoom and read.</div>`;
      pages = []; stage = "idle";
    } catch (e) { msg.textContent = ""; toast("Could not save: " + e.message); btn.disabled = false; }
  }
  function move(a, b) {
    if (b < 0 || b >= pages.length || a === b) return;
    const [x] = pages.splice(a, 1); pages.splice(b, 0, x); drawAnalysis();
    body.querySelector(`#imgList [data-i="${b}"] [data-mv]`)?.focus();
  }

  async function run() {
    const prog = $("#imgProg", host), go = $("#imgGo", host); go.disabled = true;
    try {
      for (let i = 0; i < pages.length; i++) {
        const label = pages.length > 1 ? `Page ${i + 1} of ${pages.length}: ` : "";
        const status = (txt, f) => { prog.innerHTML = `<div class="small">${esc(label + txt)}</div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f * 100)}"><span style="width:${Math.round(f * 100)}%"></span></div>`; };
        status("Starting…", 0.01);
        if (!pages[i].result) pages[i].result = await extract(pages[i].info, status);
      }
      stage = "done"; drawResult();
    } catch (e) {
      prog.innerHTML = `<div class="callout warn"><strong>Could not read the picture.</strong> ${esc(e.message)}</div>`; go.disabled = false;
    }
  }

  function drawResult() {
    const rs = pages.map((p) => p.result), words = rs.reduce((s, r) => s + r.words, 0);
    const conf = words ? Math.round(rs.reduce((s, r) => s + r.conf * r.words, 0) / words) : 0, sure = words ? Math.round(rs.reduce((s, r) => s + r.sure * r.words, 0) / words) : 0;
    const unsure = rs.reduce((s, r) => s + r.unsure.length, 0);
    const blocks = mergePages(rs), md = toMarkdown(blocks);
    const warn = pages.length > 1 ? sequenceWarnings(rs.map((r) => r.blocks)) : [], sug = pages.length > 1 ? suggestOrder(rs.map((r) => r.blocks)) : null;
    const title = (blocks.find((b) => b.type === "title") || {}).text || pages[0].info.file.name.replace(/\.[^.]+$/, "");
    body.innerHTML = `
      <div class="img-est" role="status"><div class="img-est-n"><strong>${conf}%</strong><span class="small muted">measured confidence</span></div>
        <p class="small" style="margin:0"><strong>${sure}%</strong> of the ${words} words were read with high confidence, and <strong>${unsure}</strong> are doubtful (outlined below: <span style="color:#d03b3b">red</span> = unreadable, <span style="color:#e08a00">orange</span> = unsure). Read the text next to the page and fix anything wrong before saving. Unreadable words appear as <code>[…]</code>.</p></div>
      ${warn.length ? `<div class="callout warn" style="margin-top:10px" role="alert"><strong>Check the page order.</strong> ${warn.map((w) => esc(w.msg)).join(" ")} ${sug ? '<button class="btn sm" id="imgSort">Sort by section numbers</button>' : ""}</div>` : ""}
      ${pages.length > 1 ? `<p class="small" style="margin:10px 0 0">${pages.length} pages joined in your order. <button class="btn sm" id="imgReorder">Change order or add pages</button></p>` : ""}
      <div class="grid g2" style="margin-top:12px;align-items:start">
        <div><h3 style="margin-top:0">Page${pages.length > 1 ? "s" : ""} with doubtful words</h3><div id="imgMarks"></div></div>
        <div><h3 style="margin-top:0">Extracted text <span class="muted small">(editable)</span></h3>
          <textarea id="imgMd" rows="16" style="width:100%;font-family:ui-monospace,monospace;font-size:13px" spellcheck="false" aria-label="Extracted text, editable">${esc(md)}</textarea>
          <p class="small muted" style="margin:4px 0 0"># title, ## numbered section, - bullet, | table | rows |. A blank line starts a new paragraph.</p></div></div>
      <h3>Article preview</h3><article class="art" id="imgArt"></article>
      <div class="grid g2" style="margin-top:12px"><div><label for="imgTitle">Article title</label><input id="imgTitle" value="${esc(title)}"></div>
        <div><label for="imgTopic">Topic</label><input id="imgTopic" list="imgTopics" placeholder="e.g. REST APIs" autocomplete="off"><datalist id="imgTopics">${topicNames().map((n) => `<option value="${esc(n)}">`).join("")}</datalist></div></div>
      <label style="font-weight:400;display:block;margin-top:8px"><input type="checkbox" id="imgQ" checked> Also turn each numbered section into a practice question (you review them before they are added)</label>
      <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="imgSave">Save as article</button><button class="btn" id="imgBack">Start over</button></div>`;
    const marks = $("#imgMarks", host);
    pages.forEach((p) => { const c = markUnsure(p.info, p.result); c.className = "img-canvas"; marks.append(c); });
    const art = $("#imgArt", host), ta = $("#imgMd", host);
    const redraw = () => { art.innerHTML = articleHtml(fromMarkdown(ta.value)); };
    ta.oninput = redraw; redraw();
    $("#imgReorder", host)?.addEventListener("click", () => { if (confirm("Going back will discard edits you made to the text below. Pages already read are kept, so nothing is read twice. Continue?")) { stage = "ready"; drawAnalysis(); } });
    $("#imgSort", host)?.addEventListener("click", () => { pages = sug.map((i) => pages[i]); drawResult(); toast("Pages sorted by section numbers"); });
    $("#imgBack", host).onclick = () => { pages = []; stage = "idle"; body.innerHTML = ""; };
    $("#imgSave", host).onclick = async () => {
      const bl = fromMarkdown(ta.value);
      if (!bl.length) { toast("There is no text to save"); return; }
      const ttl = $("#imgTitle", host).value.trim() || title, topic = $("#imgTopic", host).value.trim() || ttl;
      const content = bl.filter((b) => b.type !== "title");
      const a = addArticle({ title: ttl, topic, blocks: content, source: { pages: pages.length, files: pages.map((p) => p.info.file.name), conf, sure } });
      toast("Saved to Articles");
      if ($("#imgQ", host).checked) await onQuestions?.(notesText(content), topic);
      body.innerHTML = `<div class="callout ok"><strong>Saved “${esc(ttl)}”.</strong> <a href="#/articles?id=${a.id}">Open it in Articles</a>.</div>`;
      pages = []; stage = "idle";
    };
  }
}
