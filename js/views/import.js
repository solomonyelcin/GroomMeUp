import { store, importQuestions, removeImport, importedQuestions } from "../store.js";
import { parseFile, ACCEPT } from "../import/index.js";
import { buildQuestions, isConfident } from "../import/build.js";
import { aiExtract, MAX_CHUNKS } from "../import/ai.js";
import { aiEnabled } from "../ai.js";
import { CATEGORIES } from "../data/index.js";
import { esc, rich, toast, busy, fmtDate, $, $$ } from "../ui.js";

export function view(root) {
  const results = []; // { id, res, opts }
  let nextId = 1;

  root.innerHTML = `
    <header class="page-head"><h1>Import material</h1>
      <p>Bring in your own question banks and prep notes. Each Excel sheet or document section becomes its own topic that works everywhere: Question bank, Practice, Mock interview and Quick quiz.</p></header>

    <label class="drop" id="drop" for="file">
      <strong>Drop files here, or click to choose</strong>
      <span class="muted small">Excel (.xlsx), Word (.docx), PDF, text, markdown or CSV. Files are read in your browser and never uploaded.</span>
      <input id="file" type="file" accept="${ACCEPT}" multiple hidden>
    </label>
    <div id="results" style="margin-top:16px"></div>

    <section class="card" style="margin-top:16px" aria-labelledby="mine"><h2 id="mine">Your imported material</h2><div id="mineBody"></div></section>

    <section class="card" style="margin-top:16px" aria-labelledby="fmt"><h2 id="fmt">How to lay out your files</h2>
      <div class="grid g2">
        <div><h3>Excel or CSV</h3><p class="small muted">One sheet per topic. Put headers in a row near the top: <code>Question</code> and <code>Answer</code> are required. Optional: <code>Sub Topic</code> (or Category), <code>Learning Status</code>. A sub topic containing the word "Scenario" marks scenario questions, and rows marked "Confident" start as already learned. Sheets without those columns, hidden sheets and dashboards are skipped.</p></div>
        <div><h3>Word, PDF, text, markdown</h3><p class="small muted">Questions as <code>Q: ...</code> followed by <code>A: ...</code>, or numbered questions ("1. What is ...?") with the answer underneath, or markdown headings that are questions. Headings become topics. Word tables with Question and Answer columns work too. For loose notes, use the AI option on the preview to extract or generate questions.</p></div>
      </div>
      <p class="small muted" style="margin-bottom:0">Old .xls and .doc files need Save As .xlsx or .docx first. Scanned PDFs (pictures of text) cannot be read without OCR.</p></section>
  `;

  const results$ = $("#results");

  // ---------- file handling ----------
  async function handle(files) {
    for (const file of files) {
      const id = nextId++;
      results$.insertAdjacentHTML("afterbegin", `<div class="card" id="r${id}"><span class="spinner"></span> Reading ${esc(file.name)}...</div>`);
      try {
        const res = await parseFile(file);
        results.push({ id, res, opts: { seed: true, update: true } });
        draw(results[results.length - 1]);
      } catch (e) {
        $("#r" + id).innerHTML = `<div class="callout warn"><strong>${esc(file.name)} could not be imported.</strong> ${esc(e.message)}</div><button class="btn sm" data-act="dismiss" data-id="${id}" style="margin-top:8px">Dismiss</button>`;
      }
    }
  }
  $("#file").onchange = (e) => { handle([...e.target.files]); e.target.value = ""; };
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handle([...(e.dataTransfer?.files || [])]));

  // ---------- preview card ----------
  function draw(r) {
    const { res, opts } = r, items = res.items;
    const el = $("#r" + r.id); if (!el) return;
    const topics = new Map();
    for (const it of items) { const t = topics.get(it.topic) || { n: 0, sc: 0 }; t.n++; if (it.kind === "scenario") t.sc++; topics.set(it.topic, t); }
    const scenario = items.filter((i) => i.kind === "scenario").length;
    const confident = items.filter((i) => isConfident(i.status)).length;
    const skipped = res.info.filter((i) => !i.used);
    const noAns = res.info.reduce((s, i) => s + (i.noAnswer || 0), 0) || res.skipped || 0;
    const dups = res.info.reduce((s, i) => s + (i.dup || 0), 0);
    const few = items.length < 3;
    el.innerHTML = `
      <div class="row between"><h2 style="margin:0">${esc(res.name)} <span class="tag">${esc(res.kind)}</span></h2><button class="btn sm" data-act="dismiss" data-id="${r.id}">Dismiss</button></div>
      ${items.length ? `<p style="margin-top:10px"><strong>Found ${items.length} question${items.length === 1 ? "" : "s"}</strong> in ${topics.size} topic${topics.size === 1 ? "" : "s"}${scenario ? `, ${scenario} scenario-based` : ""}${confident ? `, ${confident} marked Confident` : ""}.</p>` : `<p class="callout warn" style="margin-top:10px"><strong>No question and answer pairs found.</strong> ${res.warnings.map(esc).join(" ") || "The file may be loose notes rather than Q&A."}</p>`}
      ${[...(noAns ? [`${noAns} row${noAns === 1 ? "" : "s"} without an answer skipped`] : []), ...(dups ? [`${dups} duplicate${dups === 1 ? "" : "s"} ignored`] : []), ...skipped.map((s) => `sheet "${s.name}" skipped (${s.reason})`)].length
        ? `<p class="small muted">${[...(noAns ? [`${noAns} without an answer skipped`] : []), ...(dups ? [`${dups} duplicate${dups === 1 ? "" : "s"} ignored`] : []), ...skipped.map((s) => `sheet "${esc(s.name)}" skipped (${esc(s.reason)})`)].join("; ")}.</p>` : ""}
      ${items.length ? `
        <details ${topics.size <= 6 ? "open" : ""}><summary class="small" style="cursor:pointer;margin:8px 0">Topics found</summary>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Topic</th><th>Questions</th><th>Scenario</th></tr></thead><tbody>${[...topics].map(([n, t]) => `<tr><td>${esc(n)}</td><td>${t.n}</td><td>${t.sc}</td></tr>`).join("")}</tbody></table></div></details>
        <details><summary class="small" style="cursor:pointer;margin:8px 0">Preview a few questions</summary>
          ${items.slice(0, 3).map((i) => `<div class="callout" style="margin-bottom:8px"><strong>${esc(i.q)}</strong><br><span class="small">${esc(i.a.length > 220 ? i.a.slice(0, 220) + "…" : i.a)}</span></div>`).join("")}</details>
        <div class="stack" style="margin:12px 0">
          ${confident ? `<label style="font-weight:400"><input type="checkbox" data-opt="seed" data-id="${r.id}" ${opts.seed ? "checked" : ""}> Start the ${confident} "Confident" question${confident === 1 ? "" : "s"} as already learned (self-rated 8/10, due for review in 3 days)</label>` : ""}
          <label style="font-weight:400"><input type="checkbox" data-opt="update" data-id="${r.id}" ${opts.update ? "checked" : ""}> If I imported a question before, replace it with this version (my practice history is kept)</label>
        </div>
        <button class="btn primary" data-act="import" data-id="${r.id}">Import ${items.length} questions</button>` : ""}
      ${res.text && res.text.length > 100 ? `
        <details ${few ? "open" : ""} style="margin-top:14px"><summary class="small" style="cursor:pointer">${few ? "Use AI to read this file" : "Not what you expected? Use AI instead"}</summary>
          <p class="small muted" style="margin:8px 0">${aiEnabled() ? `The text is sent to your AI provider in up to ${MAX_CHUNKS} pieces (about ${Math.round(MAX_CHUNKS * 5)}k characters). Skip this for confidential material.` : `Turn on AI in <a href="#/settings">Settings</a> first (free keyless AI is available).`}</p>
          <div class="row"><button class="btn" data-act="ai-extract" data-id="${r.id}" ${aiEnabled() ? "" : "disabled"}>Find the Q&A pairs in it</button><button class="btn" data-act="ai-generate" data-id="${r.id}" ${aiEnabled() ? "" : "disabled"}>Make questions from these notes</button></div>
          <p class="small muted" id="aip${r.id}" aria-live="polite"></p></details>` : ""}`;
  }

  results$.addEventListener("change", (e) => {
    const o = e.target.dataset.opt; if (!o) return;
    const r = results.find((x) => x.id === +e.target.dataset.id); if (r) r.opts[o] = e.target.checked;
  });
  results$.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const id = +btn.dataset.id, r = results.find((x) => x.id === id), act = btn.dataset.act;
    if (act === "dismiss") { $("#r" + id)?.remove(); const i = results.findIndex((x) => x.id === id); if (i >= 0) results.splice(i, 1); return; }
    if (!r) return;
    if (act === "import") return doImport(r);
    if (act === "ai-extract" || act === "ai-generate") {
      busy(btn, true, "Working");
      const mode = act === "ai-extract" ? "extract" : "generate";
      const note = $("#aip" + id);
      const out = await aiExtract(r.res.text, mode, { fallbackTopic: r.res.name.replace(/\.[^.]+$/, ""), onProgress: (i, n) => { if (note) note.textContent = `Reading part ${i} of ${n}...`; } });
      busy(btn, false);
      if (!out.items.length) { toast(out.lastError ? `AI could not read it: ${out.lastError}` : "The AI found nothing usable in this file.", true); if (note) note.textContent = ""; return; }
      r.res.items = out.items; r.res.info = []; r.res.skipped = 0; r.res.kind = r.res.kind + " + AI";
      draw(r);
      toast(`AI found ${out.items.length} questions${out.failed ? ` (${out.failed} part${out.failed === 1 ? "" : "s"} failed)` : ""}${out.truncated ? `, from the first ${MAX_CHUNKS} of ${out.total} parts` : ""}. Review, then import.`);
    }
  });

  function doImport(r) {
    const importId = "imp" + Date.now().toString(36) + r.id;
    const b = buildQuestions(r.res.items, { importId, existingCats: store.get().cats });
    const out = importQuestions({ questions: b.questions, cats: b.cats, seeds: b.seeds, record: { id: importId, name: r.res.name, kind: r.res.kind }, seedConfident: r.opts.seed, update: r.opts.update });
    const el = $("#r" + r.id);
    const topicKeys = [...new Set(b.questions.map((q) => q.c))];
    el.innerHTML = `<h2 style="margin-top:0">Imported ${esc(r.res.name)}</h2>
      <p><strong>${out.added} new</strong>${out.updated ? `, ${out.updated} updated` : ""}${out.skipped ? `, ${out.skipped} already there` : ""}${out.seeded ? `, ${out.seeded} started as learned` : ""}. They are now in ${topicKeys.length} topic${topicKeys.length === 1 ? "" : "s"}.</p>
      <div class="row"><a class="btn primary" href="#/practice?mine=1">Practise them</a><a class="btn" href="#/quiz?mine=1">Quiz me</a><a class="btn" href="#/bank?src=${importId}">Browse in Question bank</a><a class="btn" href="#/mock?mine=1">Mock interview</a></div>`;
    const i = results.findIndex((x) => x.id === r.id); if (i >= 0) results.splice(i, 1);
    drawMine();
  }

  // ---------- imported material list ----------
  function drawMine() {
    const s = store.get(), mine = importedQuestions();
    const box = $("#mineBody");
    if (!mine.length) { box.innerHTML = `<p class="muted">Nothing imported yet. Drop a file above to get started.</p>`; return; }
    const topics = new Map();
    for (const q of mine) topics.set(q.c, (topics.get(q.c) || 0) + 1);
    const scen = mine.filter((q) => q.kind === "scenario").length;
    box.innerHTML = `
      <p>${mine.length} question${mine.length === 1 ? "" : "s"} in ${topics.size} topic${topics.size === 1 ? "" : "s"}${scen ? `, ${scen} scenario-based` : ""}. Storage used by this app in your browser: about ${Math.round(JSON.stringify(localStorage.getItem("groommeup.v1") || "").length / 1024)} KB of roughly 5,000 KB.</p>
      <div class="row" style="margin-bottom:12px"><a class="btn primary sm" href="#/practice?mine=1">Practise</a><a class="btn sm" href="#/quiz?mine=1">Quiz</a><a class="btn sm" href="#/mock?mine=1">Mock interview</a><a class="btn sm" href="#/bank?src=mine">Browse</a></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>File</th><th>Questions</th><th>Imported</th><th></th></tr></thead><tbody>
      ${s.imports.map((i) => `<tr><td>${esc(i.name)} <span class="small muted">${esc(i.kind || "")}</span></td><td>${mine.filter((q) => q.src === i.id).length}</td><td>${fmtDate(i.t)}</td><td><a class="btn sm" href="#/bank?src=${i.id}">Open</a> <button class="btn sm danger" data-rm="${i.id}">Remove</button></td></tr>`).join("")}
      </tbody></table></div>
      <details style="margin-top:10px"><summary class="small" style="cursor:pointer">Topics</summary><div class="chips" style="margin-top:8px">${[...topics].map(([k, n]) => `<a class="tag" href="#/practice?cat=${encodeURIComponent(k)}"><span class="dot" style="background:${CATEGORIES[k]?.color || "#888"}"></span>${esc(CATEGORIES[k]?.name || k)} (${n})</a>`).join("")}</div></details>`;
    $$("[data-rm]", box).forEach((b) => (b.onclick = () => {
      const name = s.imports.find((i) => i.id === b.dataset.rm)?.name;
      if (!confirm(`Remove everything imported from "${name}"? Your practice history for those questions is removed too.`)) return;
      const n = removeImport(b.dataset.rm); toast(`Removed ${n} questions`); drawMine();
    }));
  }
  drawMine();
}
