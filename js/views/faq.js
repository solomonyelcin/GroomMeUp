import { ns } from "../account.js";
import { FAQS, FAQ_SOURCES } from "../data/faqs.js";
import { DIAGRAMS } from "./faq-diagrams.js";
import { store, importQuestions } from "../store.js";
import { buildQuestions } from "../import/build.js";
import { esc, rich, toast, $, $$ } from "../ui.js";

const KEY = ns("groommeup.faq");
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };
const qid = (f, i) => f.id + ":" + i;
const answer = (a) => `<div class="model" style="white-space:pre-wrap">${rich(a)}</div>`;

export function view(root, ctx) {
  const st = load(); st.done ||= {};
  let cur = FAQS.find((f) => f.id === ctx?.params?.get("t")) || FAQS.find((f) => f.id === st.last) || FAQS[0];
  let q = "", openId = null;
  const doneCount = (f) => f.qa.filter((_, i) => st.done[qid(f, i)]).length;

  root.innerHTML = `
    <header class="page-head"><h1>FAQs</h1>
      <p>The most asked interview topics: the questions that keep coming up, a picture to anchor the idea, and what interviewers listen for.</p></header>
    <div class="callout" style="margin-bottom:12px"><strong>Study drafts.</strong> Questions follow themes from public interview guides; the answers were written for GroomMeUp, so check them against the official docs before relying on them in an interview. <a href="#faqsrc" id="srcLink">Sources</a></div>
    <div class="faq-layout">
      <aside class="faq-side" aria-label="Topics">
        <input id="fq" type="search" placeholder="Search all topics and questions" aria-label="Search all FAQs" autocomplete="off">
        <div class="faq-tabs" id="faqtabs" role="tablist" aria-label="Interview topics"></div>
      </aside>
      <div class="faq-main" id="faqmain"></div>
    </div>
    <section class="card" id="faqsrc" style="margin-top:18px"><h2>Sources</h2><p class="small muted" style="margin-top:0">Public guides used to see which questions come up. The wording and answers here are original.</p>
      <ul class="small">${FAQ_SOURCES.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join("")}</ul></section>`;

  const tabs = $("#faqtabs"), main = $("#faqmain");
  const drawTabs = () => {
    const needle = q.trim().toLowerCase();
    const list = FAQS.filter((f) => !needle || (f.title + " " + f.sub).toLowerCase().includes(needle) || f.qa.some(([a, b]) => (a + " " + b).toLowerCase().includes(needle)));
    tabs.innerHTML = list.map((f) => { const d = doneCount(f); return `<button class="faq-tab" role="tab" data-id="${f.id}" aria-selected="${!needle && f.id === cur.id}"><b>${f.n || "•"}</b><span>${esc(f.title)}</span><i>${f.companies ? f.companies + " companies · " : ""}${d}/${f.qa.length} done</i></button>`; }).join("") || `<p class="small muted">No topic matches.</p>`;
  };
  const card = (f, x, showTopic) => {
    const key = qid(f, x.i), d = !!st.done[key];
    return `<details class="q-card faq-q" data-key="${key}" ${openId === key ? "open" : ""}><summary class="q-head"><span class="faq-num ${d ? "ok" : ""}">${d ? "✓" : x.i + 1}</span><span class="q-title">${esc(x.a)}${showTopic ? `<br><span class="small muted">${esc(f.title)}</span>` : ""}</span></summary>
      <div class="q-body">${answer(x.b)}<div class="q-actions"><button class="btn sm ${d ? "" : "good"}" data-done="${key}">${d ? "↺ Mark as not done" : "✓ Got it"}</button><button class="btn sm" data-copy="${key}">⧉ Copy</button>${showTopic ? `<button class="btn sm" data-open="${f.id}">Open topic</button>` : ""}</div></div></details>`;
  };
  const draw = () => {
    drawTabs();
    const needle = q.trim().toLowerCase();
    if (needle) {
      const hits = FAQS.flatMap((f) => f.qa.map(([a, b], i) => ({ f, x: { a, b, i } })).filter(({ x }) => (x.a + " " + x.b).toLowerCase().includes(needle)));
      main.innerHTML = `<div class="row between" style="margin-bottom:8px"><p class="small muted" style="margin:0">${hits.length} match${hits.length === 1 ? "" : "es"} for "${esc(q.trim())}" across all topics</p><button class="btn sm" id="clr" type="button">Clear search</button></div>${hits.length ? hits.slice(0, 40).map(({ f, x }) => card(f, x, true)).join("") : `<div class="card muted">Nothing found. Try a shorter word.</div>`}`;
      $("#clr").onclick = () => { q = ""; $("#fq").value = ""; draw(); };
    } else {
      const i = FAQS.indexOf(cur), d = doneCount(cur), n = cur.qa.length;
      const nav = `<div class="faq-nav"><button class="btn sm" data-go="${i > 0 ? FAQS[i - 1].id : ""}" ${i > 0 ? "" : "disabled"} aria-label="Previous topic">◀</button><span class="faq-nav-t"><b>${esc(cur.title)}</b><span class="small muted">${i + 1} of ${FAQS.length}</span></span><button class="btn sm" data-go="${i < FAQS.length - 1 ? FAQS[i + 1].id : ""}" ${i < FAQS.length - 1 ? "" : "disabled"} aria-label="Next topic">▶</button></div>`;
      main.innerHTML = `${nav}
        <section class="card faq-hero"><div class="row between" style="align-items:flex-start;gap:10px"><div><h2 style="margin:0">${cur.n ? cur.n + ". " : ""}${esc(cur.title)}</h2><p class="small muted" style="margin:2px 0 0">${esc(cur.sub || "")}${cur.companies ? ` · asked at ${cur.companies} companies` : ""}</p></div>
          <button class="btn sm primary" id="addTopic" type="button">Add to my questions</button></div>
          ${DIAGRAMS[cur.diagram] ? `<div class="faq-fig">${DIAGRAMS[cur.diagram]()}</div>` : ""}
          <div class="callout" style="margin-top:10px"><strong>What interviewers listen for.</strong> ${esc(cur.tip || "")}</div></section>
        <div class="row between" style="margin:14px 0 8px"><div style="flex:1;max-width:340px"><div class="bar" aria-hidden="true"><span style="width:${Math.round((d / n) * 100)}%"></span></div><span class="small muted" data-prog>${d} of ${n} understood</span></div><button class="btn sm" id="fx" type="button">Expand all</button></div>
        ${cur.qa.map(([a, b], k) => card(cur, { a, b, i: k }, false)).join("")}
        <div class="row" style="margin-top:14px;gap:8px">${i < FAQS.length - 1 ? `<button class="btn primary" data-go="${FAQS[i + 1].id}">Next: ${esc(FAQS[i + 1].title)} ▶</button>` : ""}<button class="btn" id="addAll" type="button">Add all topics to my questions</button></div>`;
      $("#addTopic").onclick = () => addToBank([cur]);
      $("#addAll").onclick = () => addToBank(FAQS);
      $("#fx").onclick = (e) => { const o = e.target.textContent === "Expand all"; $$(".faq-q", main).forEach((x) => (x.open = o)); e.target.textContent = o ? "Collapse all" : "Expand all"; };
    }
  };
  const select = (f) => { cur = f; q = ""; openId = null; $("#fq").value = ""; st.last = f.id; save(st); draw(); main.scrollIntoView({ block: "start" }); };
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
  tabs.onclick = (e) => { const b = e.target.closest("[data-id]"); if (b) select(FAQS.find((f) => f.id === b.dataset.id)); };
  main.onclick = (e) => {
    const g = e.target.closest("[data-go]"); if (g && g.dataset.go) return select(FAQS.find((f) => f.id === g.dataset.go));
    const o = e.target.closest("[data-open]"); if (o) return select(FAQS.find((f) => f.id === o.dataset.open));
    const dn = e.target.closest("[data-done]");
    if (dn) {
      const k = dn.dataset.done; st.done[k] ? delete st.done[k] : (st.done[k] = 1); save(st);
      const on = !!st.done[k], det = dn.closest(".faq-q"), num = det.querySelector(".faq-num"), [fid, i] = k.split(":");
      dn.textContent = on ? "↺ Mark as not done" : "✓ Got it"; dn.classList.toggle("good", !on);
      num.classList.toggle("ok", on); num.textContent = on ? "✓" : +i + 1;
      const f = FAQS.find((x) => x.id === fid), d = doneCount(f), tab = tabs.querySelector(`[data-id="${fid}"] i`);
      if (tab) tab.textContent = `${f.companies ? f.companies + " companies · " : ""}${d}/${f.qa.length} done`;
      const bar = main.querySelector(".bar span"), lbl = main.querySelector("[data-prog]");
      if (bar && f === cur) { bar.style.width = Math.round((d / f.qa.length) * 100) + "%"; if (lbl) lbl.textContent = `${d} of ${f.qa.length} understood`; }
      if (!on) return;
      // collapse this one, open the next with a transition and move focus there
      const next = det.nextElementSibling && det.nextElementSibling.classList.contains("faq-q") ? det.nextElementSibling : null;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      det.classList.add("closing");
      setTimeout(() => {
        det.open = false; det.classList.remove("closing");
        if (!next) { toast(d === f.qa.length ? "Topic complete. Nice work." : "That was the last question here."); return; }
        next.open = true; next.classList.add("opening");
        next.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
        const sm = next.querySelector("summary"); sm.focus({ preventScroll: true });
        setTimeout(() => next.classList.remove("opening"), 400);
      }, calm ? 0 : 220);
      return;
    }
    const cp = e.target.closest("[data-copy]");
    if (cp) { const [fid, i] = cp.dataset.copy.split(":"); const f = FAQS.find((x) => x.id === fid), [a, b] = f.qa[+i]; navigator.clipboard?.writeText(a + "\n\n" + b).then(() => toast("Copied"), () => toast("Could not copy on this browser", true)); }
  };
  $("#fq").oninput = (e) => { q = e.target.value; draw(); };
  $("#srcLink").onclick = (e) => { e.preventDefault(); $("#faqsrc").scrollIntoView({ behavior: "smooth" }); };
  draw();
}
