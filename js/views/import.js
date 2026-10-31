import { store, importQuestions, removeImport, importedQuestions } from "../store.js";
import { parseFile, ACCEPT } from "../import/index.js";
import { buildQuestions, isConfident } from "../import/build.js";
import { aiExtract, aiAnswers, MAX_CHUNKS } from "../import/ai.js";
import { flag } from "../import/quality.js";
import { reduceRepeats } from "../import/mcq.js";
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
        <div><h3>Word, PDF, text, markdown</h3><p class="small muted">Questions as <code>Q: ...</code> followed by <code>A: ...</code>, or numbered questions ("1. What is ...?") with the answer underneath, or markdown headings that are questions. Headings become topics. Word tables with Question and Answer columns work too. Multiple choice works too: a numbered question, options <code>A)</code> to <code>D)</code>, then <code>Ans : C</code>. A file of questions with no answers can have answers written by AI. For loose notes, use the AI option on the preview.</p></div>
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
        const r0 = { id, res, opts: { seed: true, update: true, dedupe: false }, excl: new Set(), filter: "flagged", shown: 25, editing: new Set() };
        prepare(r0); results.push(r0);
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

  // mark items that look wrong (they start unticked) and compute what would actually be imported
  function prepare(r) {
    r.flags = r.res.items.map((it) => flag(it));
    r.excl = new Set(r.flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0));
  }
  function chosen(r) {
    let list = r.res.items.filter((_, i) => !r.excl.has(i));
    let dropped = 0;
    if (r.opts.dedupe && list.some((x) => x.kind === "mcq")) { const rr = reduceRepeats(list, 2); dropped = rr.dropped.length; list = rr.kept; }
    return { list, dropped };
  }
  const letter = (i) => "ABCDE"[i];
  function rowHtml(r, it, i) {
    const on = !r.excl.has(i), ed = r.editing.has(i), fl = r.flags[i];
    const body = it.o
      ? `<div class="small">${it.o.map((o, k) => `<div class="${k === it.correct ? "opt-ok" : ""}">${letter(k)}) ${esc(o)}</div>`).join("")}</div>`
      : ed ? `<textarea data-edit="a" data-id="${r.id}" data-i="${i}" rows="4" style="margin-top:6px">${esc(it.a)}</textarea>` : `<div class="small muted">${esc(it.a.length > 260 ? it.a.slice(0, 260) + "…" : it.a)}</div>`;
    return `<div class="rv ${on ? "" : "off"}"><label class="rv-check"><input type="checkbox" data-incl="${i}" data-id="${r.id}" ${on ? "checked" : ""} aria-label="Include this question"></label>
      <div class="rv-main">${ed && !it.o ? `<textarea data-edit="q" data-id="${r.id}" data-i="${i}" rows="2">${esc(it.q)}</textarea>` : `<strong>${esc(it.q)}</strong>`}
      ${fl ? `<span class="tag warn-tag">Check: ${esc(fl)}</span>` : ""} <span class="small muted">${esc(it.topic)}</span>${body}
      ${it.o ? "" : `<button class="btn sm" data-act="edit" data-id="${r.id}" data-i="${i}" style="margin-top:6px">${ed ? "Done editing" : "Edit"}</button>`}</div></div>`;
  }

  // ---------- preview card ----------
  function draw(r) {
    const { res, opts } = r, items = res.items;
    const el = $("#r" + r.id); if (!el) return;
    const { list, dropped } = chosen(r);
    const topics = new Map();
    for (const it of list) { const t = topics.get(it.topic) || { n: 0, sc: 0 }; t.n++; if (it.kind === "scenario") t.sc++; topics.set(it.topic, t); }
    const scenario = list.filter((i) => i.kind === "scenario").length;
    const mcqN = list.filter((i) => i.kind === "mcq").length;
    const confident = list.filter((i) => isConfident(i.status)).length;
    const skipped = res.info.filter((i) => !i.used);
    const noAns = res.info.reduce((s, i) => s + (i.noAnswer || 0), 0) || res.skipped || 0;
    const dups = res.info.reduce((s, i) => s + (i.dup || 0), 0);
    const nFlag = r.flags.filter(Boolean).length, off = r.excl.size - r.flags.filter((f, i) => f && r.excl.has(i)).length;
    const pending = res.pending || [];
    const few = items.length < 3;
    const hasMcq = items.some((x) => x.kind === "mcq");
    const shownIdx = items.map((_, i) => i).filter((i) => r.filter === "all" || r.flags[i]).slice(0, r.shown);
    const totalShown = items.filter((_, i) => r.filter === "all" || r.flags[i]).length;
    const notes = [...(noAns && !pending.length ? [`${noAns} without an answer skipped`] : []), ...(dups ? [`${dups} duplicate${dups === 1 ? "" : "s"} ignored`] : []), ...skipped.map((x) => `sheet "${esc(x.name)}" skipped (${esc(x.reason)})`)];
    el.innerHTML = `
      <div class="row between"><h2 style="margin:0">${esc(res.name)} <span class="tag">${esc(res.kind)}</span></h2><button class="btn sm" data-act="dismiss" data-id="${r.id}">Dismiss</button></div>
      ${items.length ? `<p style="margin-top:10px"><strong>Found ${items.length} question${items.length === 1 ? "" : "s"}</strong> in ${new Set(items.map((i) => i.topic)).size} topic${new Set(items.map((i) => i.topic)).size === 1 ? "" : "s"}${hasMcq ? `, ${items.filter((i) => i.kind === "mcq").length} multiple-choice with the correct answer` : ""}${items.some((i) => i.kind === "scenario") ? `, ${items.filter((i) => i.kind === "scenario").length} scenario-based` : ""}.</p>`
        : pending.length ? "" : `<p class="callout warn" style="margin-top:10px"><strong>No question and answer pairs found.</strong> ${res.warnings.map(esc).join(" ") || "The file may be loose notes rather than Q&A."}</p>`}
      ${notes.length ? `<p class="small muted">${notes.join("; ")}.</p>` : ""}
      ${nFlag ? `<div class="callout warn" style="margin:8px 0"><strong>${nFlag} item${nFlag === 1 ? "" : "s"} look${nFlag === 1 ? "s" : ""} wrong</strong> and ${nFlag === 1 ? "is" : "are"} unticked below. Review them, fix or tick what is right, then import.</div>` : ""}
      ${pending.length ? `<div class="callout" style="margin:8px 0"><strong>${pending.length} question${pending.length === 1 ? "" : "s"} found without answers.</strong>
        <p class="small" style="margin:6px 0">${aiEnabled() ? `AI can write a model answer for each. The questions are sent to your AI provider in groups of 5 (up to 50 per click). The answers are marked <em>AI draft</em> because AI can be wrong; check anything important.` : `Turn on AI in <a href="#/settings">Settings</a> (the free option needs no key) and AI can write the answers.`}</p>
        <button class="btn primary" data-act="ai-answers" data-id="${r.id}" ${aiEnabled() ? "" : "disabled"}>Write answers with AI${pending.length > 50 ? " (next 50)" : ""}</button> <span class="small muted" id="aia${r.id}" aria-live="polite"></span>
        <details style="margin-top:8px"><summary class="small" style="cursor:pointer">See the ${pending.length} questions</summary><ol class="small" style="max-height:200px;overflow:auto">${pending.slice(0, 100).map((x) => `<li>${esc(x.q)}</li>`).join("")}</ol></details></div>` : ""}
      ${items.length ? `
        <details ${topics.size <= 6 ? "open" : ""}><summary class="small" style="cursor:pointer;margin:8px 0">Topics found</summary>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Topic</th><th>Questions</th>${mcqN ? "" : "<th>Scenario</th>"}</tr></thead><tbody>${[...topics].map(([n, t]) => `<tr><td>${esc(n)}</td><td>${t.n}</td>${mcqN ? "" : `<td>${t.sc}</td>`}</tr>`).join("")}</tbody></table></div></details>
        <details ${nFlag ? "open" : ""}><summary class="small" style="cursor:pointer;margin:8px 0">Review questions${nFlag ? ` (${nFlag} to check)` : ""}</summary>
          <div class="row small" style="margin-bottom:8px"><label style="font-weight:400"><input type="radio" name="flt${r.id}" value="flagged" data-flt="${r.id}" ${r.filter === "flagged" ? "checked" : ""}> To check (${nFlag})</label><label style="font-weight:400"><input type="radio" name="flt${r.id}" value="all" data-flt="${r.id}" ${r.filter === "all" ? "checked" : ""}> Everything (${items.length})</label></div>
          <div class="rv-list">${shownIdx.map((i) => rowHtml(r, items[i], i)).join("") || `<p class="muted small">Nothing to check here.</p>`}</div>
          ${totalShown > r.shown ? `<button class="btn sm" data-act="more" data-id="${r.id}" style="margin-top:8px">Show ${Math.min(25, totalShown - r.shown)} more of ${totalShown - r.shown}</button>` : ""}</details>
        <div class="stack" style="margin:12px 0">
          ${hasMcq ? `<label style="font-weight:400"><input type="checkbox" data-opt="dedupe" data-id="${r.id}" ${opts.dedupe ? "checked" : ""}> Skip repeats: many questions test the same fact, so keep at most 2 per fact${dropped || opts.dedupe ? ` (${opts.dedupe ? `skips ${dropped}` : "would skip some"})` : ""}</label>` : ""}
          ${confident ? `<label style="font-weight:400"><input type="checkbox" data-opt="seed" data-id="${r.id}" ${opts.seed ? "checked" : ""}> Start the ${confident} "Confident" question${confident === 1 ? "" : "s"} as already learned (self-rated 8/10, due for review in 3 days)</label>` : ""}
          <label style="font-weight:400"><input type="checkbox" data-opt="update" data-id="${r.id}" ${opts.update ? "checked" : ""}> If I imported a question before, replace it with this version (my practice history is kept)</label>
        </div>
        <button class="btn primary" data-act="import" data-id="${r.id}" ${list.length ? "" : "disabled"}>Import ${list.length} question${list.length === 1 ? "" : "s"}</button>` : ""}
      ${res.text && res.text.length > 100 && !hasMcq ? `
        <details ${few && !pending.length ? "open" : ""} style="margin-top:14px"><summary class="small" style="cursor:pointer">${few ? "Use AI to read this file" : "Not what you expected? Use AI instead"}</summary>
          <p class="small muted" style="margin:8px 0">${aiEnabled() ? `The text is sent to your AI provider in up to ${MAX_CHUNKS} pieces (about ${Math.round(MAX_CHUNKS * 5)}k characters). Skip this for confidential material.` : `Turn on AI in <a href="#/settings">Settings</a> first (free keyless AI is available).`}</p>
          <div class="row"><button class="btn" data-act="ai-extract" data-id="${r.id}" ${aiEnabled() ? "" : "disabled"}>Find the Q&A pairs in it</button><button class="btn" data-act="ai-generate" data-id="${r.id}" ${aiEnabled() ? "" : "disabled"}>Make questions from these notes</button></div>
          <p class="small muted" id="aip${r.id}" aria-live="polite"></p></details>` : ""}`;
  }

  results$.addEventListener("change", (e) => {
    const t = e.target, r = results.find((x) => x.id === +(t.dataset.id || t.dataset.flt)); if (!r) return;
    if (t.dataset.opt) { r.opts[t.dataset.opt] = t.checked; return draw(r); }
    if (t.dataset.flt) { r.filter = t.value; r.shown = 25; return draw(r); }
    if (t.dataset.incl !== undefined) { const i = +t.dataset.incl; t.checked ? r.excl.delete(i) : r.excl.add(i); return keepOpen(r); }
  });
  // redraw the card but keep the review panel open and the scroll position
  function keepOpen(r) {
    const y = window.scrollY; draw(r); const d = $("#r" + r.id)?.querySelectorAll("details")[1]; if (d) d.open = true; window.scrollTo(0, y);
  }
  results$.addEventListener("input", (e) => {
    const t = e.target; if (!t.dataset.edit) return;
    const r = results.find((x) => x.id === +t.dataset.id); if (!r) return;
    r.res.items[+t.dataset.i][t.dataset.edit] = t.value;
  });
  results$.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const id = +btn.dataset.id, r = results.find((x) => x.id === id), act = btn.dataset.act;
    if (act === "dismiss") { $("#r" + id)?.remove(); const i = results.findIndex((x) => x.id === id); if (i >= 0) results.splice(i, 1); return; }
    if (!r) return;
    if (act === "import") return doImport(r);
    if (act === "more") { r.shown += 25; return keepOpen(r); }
    if (act === "edit") { const i = +btn.dataset.i; r.editing.has(i) ? (r.editing.delete(i), r.flags[i] = flag(r.res.items[i]), r.flags[i] ? r.excl.add(i) : r.excl.delete(i)) : r.editing.add(i); return keepOpen(r); }
    if (act === "ai-answers") {
      busy(btn, true, "Writing answers");
      const note = $("#aia" + id);
      const out = await aiAnswers(r.res.pending, { onProgress: (i, n) => { if (note) note.textContent = `Answering ${i} of ${n}...`; } });
      busy(btn, false);
      if (!out.done.length) { toast("The AI could not write answers right now. Try again in a minute, or switch provider in Settings.", true); if (note) note.textContent = ""; return; }
      const startAt = r.res.items.length;
      r.res.items.push(...out.done);
      r.res.pending = [...out.failed, ...out.rest]; r.res.skipped = 0;
      r.flags.push(...out.done.map((x) => flag(x)));
      out.done.forEach((_, k) => { if (r.flags[startAt + k]) r.excl.add(startAt + k); });
      r.res.kind = r.res.kind.includes("AI") ? r.res.kind : r.res.kind + " + AI answers";
      draw(r);
      toast(`Wrote ${out.done.length} answers (marked AI draft)${out.failed.length ? `, ${out.failed.length} failed` : ""}${out.rest.length ? `, ${out.rest.length} still waiting` : ""}.`);
      return;
    }
    if (act === "ai-extract" || act === "ai-generate") {
      busy(btn, true, "Working");
      const mode = act === "ai-extract" ? "extract" : "generate";
      const note = $("#aip" + id);
      const out = await aiExtract(r.res.text, mode, { fallbackTopic: r.res.name.replace(/\.[^.]+$/, ""), onProgress: (i, n) => { if (note) note.textContent = `Reading part ${i} of ${n}...`; } });
      busy(btn, false);
      if (!out.items.length) { toast(out.lastError ? `AI could not read it: ${out.lastError}` : "The AI found nothing usable in this file.", true); if (note) note.textContent = ""; return; }
      out.items.forEach((x) => (x.ai = mode === "generate"));
      r.res.items = out.items; r.res.info = []; r.res.skipped = 0; r.res.pending = []; r.res.kind = r.res.kind + " + AI";
      prepare(r); draw(r);
      toast(`AI found ${out.items.length} questions${out.failed ? ` (${out.failed} part${out.failed === 1 ? "" : "s"} failed)` : ""}${out.truncated ? `, from the first ${MAX_CHUNKS} of ${out.total} parts` : ""}. Review, then import.`);
    }
  });

  function doImport(r) {
    const importId = "imp" + Date.now().toString(36) + r.id;
    const { list } = chosen(r);
    const b = buildQuestions(list, { importId, existingCats: store.get().cats });
    const out = importQuestions({ questions: b.questions, cats: b.cats, seeds: b.seeds, record: { id: importId, name: r.res.name, kind: r.res.kind }, seedConfident: r.opts.seed, update: r.opts.update });
    const el = $("#r" + r.id);
    const topicKeys = [...new Set(b.questions.map((q) => q.c))];
    el.innerHTML = `<h2 style="margin-top:0">Imported ${esc(r.res.name)}</h2>
      <p><strong>${out.added} new</strong>${out.updated ? `, ${out.updated} updated` : ""}${out.skipped ? `, ${out.skipped} already there` : ""}${out.replaced ? `, ${out.replaced} from an earlier import of this file replaced` : ""}${out.seeded ? `, ${out.seeded} started as learned` : ""}. They are now in ${topicKeys.length} topic${topicKeys.length === 1 ? "" : "s"}.</p>
      ${(r.res.pending || []).length ? `<p class="small muted">${r.res.pending.length} questions without answers were not imported.</p>` : ""}
      <div class="row"><a class="btn primary" href="#/quiz?mine=1">Quiz me</a><a class="btn" href="#/practice?mine=1">Practise them</a><a class="btn" href="#/bank?src=${importId}">Browse in Question bank</a><a class="btn" href="#/mock?mine=1">Mock interview</a></div>`;
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
