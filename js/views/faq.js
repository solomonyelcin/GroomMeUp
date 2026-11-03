import { FAQS, FAQ_SOURCES } from "../data/faqs.js";
import { DIAGRAMS } from "./faq-diagrams.js";
import { store, importQuestions } from "../store.js";
import { buildQuestions } from "../import/build.js";
import { esc, rich, toast, $, $$ } from "../ui.js";

const answer = (a) => `<div class="model" style="white-space:pre-wrap">${rich(a)}</div>`;

export function view(root, ctx) {
  let cur = FAQS.find((f) => f.id === ctx?.params?.get("t")) || FAQS[0];
  let q = "";
  root.innerHTML = `
    <header class="page-head"><h1>FAQs</h1>
      <p>The ten most asked .NET interview topics, each with the questions that come up again and again, a picture to anchor the idea, and what interviewers listen for.</p></header>
    <div class="callout" style="margin-bottom:12px"><strong>Study drafts.</strong> Questions follow themes from public interview guides; the answers were written for GroomMeUp, so check them against the official docs before relying on them in an interview. <a href="#faqsrc" id="srcLink">Sources</a></div>
    <div class="faq-tabs" id="tabs" role="tablist" aria-label="Interview topics"></div>
    <div class="row" style="margin:10px 0;gap:8px;align-items:flex-end"><div style="flex:1;min-width:200px"><input id="fq" type="search" placeholder="Filter the questions in this topic" aria-label="Filter questions"></div>
      <button class="btn sm" id="fx" type="button">Expand all</button></div>
    <div id="body"></div>
    <section class="card" id="faqsrc" style="margin-top:18px"><h2>Sources</h2><p class="small muted" style="margin-top:0">Public guides used to see which questions come up. The wording and answers here are original.</p>
      <ul class="small">${FAQ_SOURCES.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join("")}</ul></section>`;

  const tabs = $("#tabs");
  const drawTabs = () => {
    tabs.innerHTML = FAQS.map((f) => `<button class="faq-tab" role="tab" data-id="${f.id}" aria-selected="${f.id === cur.id}"><b>${f.n}</b><span>${esc(f.title)}</span><i>${f.companies} companies</i></button>`).join("");
  };
  const body = $("#body");
  const draw = () => {
    drawTabs();
    const needle = q.trim().toLowerCase();
    const items = cur.qa.map(([a, b], i) => ({ a, b, i })).filter((x) => !needle || (x.a + " " + x.b).toLowerCase().includes(needle));
    body.innerHTML = `
      <section class="card faq-hero"><div class="row between" style="align-items:flex-start;gap:10px"><div><h2 style="margin:0">${cur.n}. ${esc(cur.title)}</h2><p class="small muted" style="margin:2px 0 0">${esc(cur.sub)} · asked at ${cur.companies} companies</p></div>
        <button class="btn sm primary" id="addTopic" type="button">Add to my questions</button></div>
        <div class="faq-fig" aria-hidden="false">${DIAGRAMS[cur.diagram] ? DIAGRAMS[cur.diagram]() : ""}</div>
        <div class="callout" style="margin-top:10px"><strong>What interviewers listen for.</strong> ${esc(cur.tip)}</div></section>
      <div style="margin-top:12px">${items.length ? items.map((x) => `<details class="q-card faq-q"><summary class="q-head"><span class="faq-num">${x.i + 1}</span><span class="q-title">${esc(x.a)}</span></summary><div class="q-body">${answer(x.b)}</div></details>`).join("") : `<div class="card muted">No questions match "${esc(q)}".</div>`}</div>
      <div class="row" style="margin-top:14px;gap:8px">${(() => { const i = FAQS.indexOf(cur); return (i > 0 ? `<button class="btn" data-go="${FAQS[i - 1].id}">◀ ${esc(FAQS[i - 1].title)}</button>` : "") + (i < FAQS.length - 1 ? `<button class="btn primary" data-go="${FAQS[i + 1].id}">${esc(FAQS[i + 1].title)} ▶</button>` : ""); })()}<button class="btn" id="addAll" type="button">Add all 10 topics to my questions</button></div>`;
    $("#addTopic").onclick = () => addToBank([cur]);
    $("#addAll").onclick = () => addToBank(FAQS);
    $$("[data-go]", body).forEach((b) => (b.onclick = () => { cur = FAQS.find((f) => f.id === b.dataset.go); q = ""; $("#fq").value = ""; draw(); window.scrollTo({ top: 0 }); }));
    $("#fx").textContent = "Expand all";
  };
  function addToBank(list) {
    let n = 0;
    for (const f of list) {
      const items = f.qa.map(([a, b]) => ({ topic: f.title, sub: "FAQ", q: a, a: b, status: "", kind: "concept" }));
      const importId = "faq-" + f.id;
      const b = buildQuestions(items, { importId, existingCats: store.get().cats });
      importQuestions({ questions: b.questions, cats: b.cats, seeds: [], record: { id: importId, name: "FAQ: " + f.title, kind: "FAQ" }, seedConfident: false, update: true });
      n += b.questions.length;
    }
    toast(`${n} questions added. Find them in Browse, Practise and Quiz under "${list.length === 1 ? list[0].title : "the FAQ topics"}".`);
  }
  tabs.onclick = (e) => { const b = e.target.closest("[data-id]"); if (!b) return; cur = FAQS.find((f) => f.id === b.dataset.id); q = ""; $("#fq").value = ""; draw(); };
  $("#fq").oninput = (e) => { q = e.target.value; draw(); $("#fq").focus(); };
  $("#fx").onclick = (e) => { const open = e.target.textContent === "Expand all"; $$(".faq-q").forEach((d) => (d.open = open)); e.target.textContent = open ? "Collapse all" : "Expand all"; };
  $("#srcLink").onclick = (e) => { e.preventDefault(); $("#faqsrc").scrollIntoView({ behavior: "smooth" }); };
  draw();
}
