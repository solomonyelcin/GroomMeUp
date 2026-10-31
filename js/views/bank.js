import { store, allQuestions, lastScores, isDue, isBrokenMcq, removeBroken } from "../store.js";
import { CATEGORIES } from "../data/index.js";
import { generateQuestions, aiEnabled } from "../ai.js";
import { esc, rich, scoreBadge, toast, busy, $, $$ } from "../ui.js";

const filt = { text: "", cat: "all", diff: 0, status: "all", src: "", kind: "all" };
const readMode = () => { try { return localStorage.getItem("groommeup.read") === "1"; } catch { return false; } };
const revealed = new Set();
const setReadMode = (v) => { try { localStorage.setItem("groommeup.read", v ? "1" : "0"); } catch { /* ignore */ } };
let shown = 40;
let rank = new Map(), idx = 0;
const shuffleRank = (q) => { if (!rank.has(q.id)) rank.set(q.id, Math.random()); return rank.get(q.id); };
const isPhone = () => window.matchMedia("(max-width: 860px)").matches;
const getView = () => { try { return localStorage.getItem("groommeup.bankview") || (isPhone() ? "one" : "list"); } catch { return isPhone() ? "one" : "list"; } };
const setView = (v) => { try { localStorage.setItem("groommeup.bankview", v); } catch { /* ignore */ } };

export function view(root, ctx) {
  if (ctx.params.get("cat")) filt.cat = ctx.params.get("cat");
  if (ctx.params.has("src")) { filt.src = ctx.params.get("src"); filt.cat = "all"; }
  root.innerHTML = `
    <header class="page-head">
      <h1>Question bank</h1>
      <p>Read questions with their answers. Filters are tucked away: open them only when you need to narrow things down.</p>
    </header>
    <div id="broken"></div>
    <details class="card filters" id="filters">
      <summary id="fsum">Search and filter</summary>
      <div class="grid g3">
        <div><label for="s">Search</label><input id="s" type="search" placeholder="e.g. saga, OnPush, deadlock" value="${esc(filt.text)}"></div>
        <div><label for="d">Difficulty</label><select id="d"><option value="0">Any</option><option value="1">Warm-up</option><option value="2">Core</option><option value="3">Senior / hard</option></select></div>
        <div><label for="st">Status</label><select id="st"><option value="all">All</option><option value="new">Not tried</option><option value="weak">Weak (under 6)</option><option value="due">Due for review</option><option value="strong">Strong (8+)</option></select></div>
      </div>
      <div class="grid g3" style="margin-top:12px">
        <div><label for="tp">Topic</label><select id="tp"></select></div>
        <div><label for="sc">Source</label><select id="sc"></select></div>
        <div><label for="kd">Type</label><select id="kd"><option value="all">Any</option><option value="concept">Concept</option><option value="scenario">Scenario-based</option><option value="mcq">Multiple choice</option></select></div>
      </div>
    </details>
    <div class="row between" style="margin:16px 0 10px"><span id="count" class="muted" aria-live="polite"></span><div class="row"><div class="seg" role="group" aria-label="View"><button id="vl" aria-pressed="false">List</button><button id="v1" aria-pressed="false">One by one</button></div><button class="btn sm" id="shuf">Shuffle</button><label class="read-toggle"><input type="checkbox" id="rd"> Show answers</label><button class="btn sm" id="add">Add your own question</button><button class="btn sm" id="gen">Generate with AI</button></div></div>
    <div id="forms"></div>
    <div id="list"></div>
  `;
  $("#rd").checked = readMode();
  $("#d").value = String(filt.diff); $("#st").value = filt.status;

  const checkBroken = () => {
    const n = allQuestions().filter(isBrokenMcq).length;
    $("#broken").innerHTML = n ? `<div class="callout warn" style="margin-bottom:12px"><strong>${n} imported questions were read wrongly</strong> (options mixed into the answer) by an older version of the importer. Remove them, then import your file again in <a href="#/import">Add my questions</a>: multiple-choice questions will then show their options and the correct answer.<div class="row" style="margin-top:8px"><button class="btn sm primary" id="rmbad">Remove these ${n}</button></div></div>` : "";
    const b = $("#rmbad"); if (b) b.onclick = () => { const k = removeBroken(); toast(`${k} removed. Now import your file again.`); checkBroken(); list(); };
  };
  const draw = () => {
    checkBroken();
    const mine = Object.entries(CATEGORIES).filter(([, v]) => v.mine);
    const opt = ([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`;
    $("#tp").innerHTML = `<option value="all">All topics</option><optgroup label="Built-in topics">${Object.entries(CATEGORIES).filter(([, v]) => !v.mine).map(([k, v]) => opt([k, v.name])).join("")}<option value="custom">My questions</option></optgroup>${mine.length ? `<optgroup label="Your material">${mine.map(([k, v]) => opt([k, v.name])).join("")}</optgroup>` : ""}`;
    $("#tp").value = filt.cat;
    if ($("#tp").value !== filt.cat) { filt.cat = "all"; $("#tp").value = "all"; }
    const imps = store.get().imports;
    $("#sc").innerHTML = `<option value="">All sources</option><option value="builtin">Built-in only</option>${imps.length ? `<option value="mine">All my imports</option>` : ""}${imps.map((i) => opt([i.id, i.name])).join("")}`;
    $("#sc").value = filt.src; if ($("#sc").value !== filt.src) { filt.src = ""; $("#sc").value = ""; }
    $("#kd").value = filt.kind;
    list();
  };

  function list() {
    const last = lastScores();
    const t = filt.text.trim().toLowerCase();
    const qs = allQuestions().filter((q) => {
      if (filt.cat !== "all" && q.c !== filt.cat) return false;
      if (filt.src === "builtin" && (q.imported || q.custom)) return false;
      if (filt.src === "mine" && !q.imported) return false;
      if (filt.src && filt.src !== "builtin" && filt.src !== "mine" && q.src !== filt.src) return false;
      if (filt.kind !== "all" && (q.kind || "concept") !== filt.kind) return false;
      if (filt.diff && q.d !== filt.diff) return false;
      const l = last.get(q.id);
      if (filt.status === "new" && l) return false;
      if (filt.status === "weak" && !(l && l.score < 6)) return false;
      if (filt.status === "strong" && !(l && l.score >= 8)) return false;
      if (filt.status === "due" && !(l && isDue(q.id))) return false;
      if (t && !(q.q + " " + q.a + " " + (q.o || []).join(" ") + " " + q.kp.map((k) => k[0]).join(" ")).toLowerCase().includes(t)) return false;
      return true;
    });
    const all = allQuestions();
    const studiedAll = all.filter((q) => last.has(q.id)).length;
    const studiedHere = qs.filter((q) => last.has(q.id)).length;
    const nf = ["text", "cat", "diff", "status", "src", "kind"].filter((k) => filt[k] && filt[k] !== "all" && filt[k] !== 0).length;
    $("#fsum").textContent = nf ? `Search and filter (${nf} active)` : "Search and filter";
    $("#count").innerHTML = `<b>${studiedAll} of ${all.length}</b> studied` + (qs.length !== all.length ? ` · showing ${qs.length} (${studiedHere} studied)` : "");
    qs.sort((a, b) => shuffleRank(a) - shuffleRank(b));
    const diffName = ["", "Warm-up", "Core", "Senior"];
    const view1 = getView() === "one";
    $("#vl").setAttribute("aria-pressed", String(!view1)); $("#v1").setAttribute("aria-pressed", String(view1));
    const meta = (q) => {
      const cat = CATEGORIES[q.c] || { name: "My questions", color: "#546178" };
      return { cat, sub: `${esc(cat.name)} / ${q.imported ? (q.sub ? esc(q.sub) : "Imported") : diffName[q.d] || "Core"}${q.kind === "scenario" ? " / Scenario" : ""}` };
    };
    const body = (q) => {
      const show = readMode() || revealed.has(q.id);
      const ai = show && q.ai ? `<p class="callout warn small" style="margin:0 0 8px"><strong>AI draft answer.</strong> Written by AI from your question, so double-check it before relying on it.</p>` : "";
      const reveal = show ? "" : `<div class="row" style="margin-top:12px"><button class="btn primary sm" data-rev="${q.id}">Show answer</button></div>`;
      if (q.o) return `<h4>Options</h4><div class="mcq-opts">${q.o.map((o, k) => `<div class="mcq-opt ${show && k === q.ans ? "right" : ""}"><b>${"ABCDE"[k]}</b><span>${esc(o)}</span>${show && k === q.ans ? `<em>correct</em>` : ""}</div>`).join("")}</div>${reveal}${show && q.e ? `<div class="model" style="margin-top:8px">${rich(q.e)}</div>` : ""}${ai}`;
      if (!show) return reveal;
      return `${ai}<h4>Model answer</h4><div class="model">${rich(q.a)}</div><h4>Points interviewers listen for</h4><ul class="kp">${q.kp.map((k) => `<li>${esc(k[0])}</li>`).join("")}</ul>${q.f && q.f.length ? `<h4>Likely follow-ups</h4><ul class="kp">${q.f.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}`;
    };
    const wire = () => $$("[data-rev]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); revealed.add(b.dataset.rev); list(); }));
    if (!qs.length) { $("#list").innerHTML = `<div class="card muted">No questions match. Clear a filter or add your own.</div>`; return; }
    if (view1) {
      if (idx >= qs.length) idx = qs.length - 1; if (idx < 0) idx = 0;
      const q = qs[idx], m = meta(q), l = last.get(q.id);
      const pager = `<div class="pager"><button class="btn" data-go="-1" ${idx === 0 ? "disabled" : ""}>◀ Previous</button><span class="pos">${idx + 1} / ${qs.length}</span><button class="btn primary" data-go="1" ${idx >= qs.length - 1 ? "disabled" : ""}>Next ▶</button></div>`;
      $("#list").innerHTML = `${pager}<div class="one-card"><div class="row between"><span class="small muted"><span class="dot" style="background:${m.cat.color}"></span> ${m.sub}</span>${scoreBadge(l ? l.score : null)}</div><h2>${rich(q.q)}</h2><div>${body(q)}</div></div>${pager}`;
      wire();
      $$("[data-go]").forEach((b) => (b.onclick = () => { idx += +b.dataset.go; list(); window.scrollTo({ top: 0 }); }));
      return;
    }
    $("#list").innerHTML = qs.slice(0, shown).map((q) => {
      const m = meta(q), l = last.get(q.id);
      return `<details class="q-card" data-id="${q.id}" ${readMode() || q.o ? "open" : ""}>
        <summary class="q-head"><span class="dot" style="background:${m.cat.color};margin-top:8px" title="${esc(m.cat.name)}"></span>
          <span class="q-title">${rich(q.q)}<br><span class="small muted">${m.sub}</span></span>${scoreBadge(l ? l.score : null)}</summary>
        <div class="q-body">${body(q)}</div></details>`;
    }).join("") + (qs.length > shown ? `<button class="btn" id="more" style="margin-top:12px">Show ${Math.min(40, qs.length - shown)} more</button>` : "");
    wire();
    const more = $("#more"); if (more) more.onclick = () => { shown += 40; list(); };
  }

  $("#vl").onclick = () => { setView("list"); list(); };
  $("#v1").onclick = () => { setView("one"); list(); };
  $("#shuf").onclick = () => { rank = new Map(); idx = 0; shown = 40; idx = 0; list(); };
  $("#rd").onchange = (e) => { revealed.clear(); setReadMode(e.target.checked); list(); };
  $("#tp").onchange = (e) => { filt.cat = e.target.value; shown = 40; idx = 0; list(); };
  $("#sc").onchange = (e) => { filt.src = e.target.value; shown = 40; idx = 0; list(); };
  $("#kd").onchange = (e) => { filt.kind = e.target.value; shown = 40; idx = 0; list(); };
  $("#s").oninput = (e) => { filt.text = e.target.value; shown = 40; idx = 0; list(); };
  $("#d").onchange = (e) => { filt.diff = +e.target.value; shown = 40; idx = 0; list(); };
  $("#st").onchange = (e) => { filt.status = e.target.value; shown = 40; idx = 0; list(); };

  $("#add").onclick = () => {
    $("#forms").innerHTML = `<div class="card"><h3>Add a question</h3>
      <div class="field"><label for="nq">Question</label><textarea id="nq" style="min-height:70px"></textarea></div>
      <div class="field"><label for="na">Your model answer (what a strong answer says)</label><textarea id="na" style="min-height:100px"></textarea></div>
      <div class="field"><label for="nk">Key points, one per line (used for scoring)</label><textarea id="nk" style="min-height:80px" placeholder="idempotency&#10;retry with backoff"></textarea></div>
      <div class="row"><button class="btn primary" id="save">Save question</button><button class="btn" id="cancel">Cancel</button></div></div>`;
    $("#cancel").onclick = () => ($("#forms").innerHTML = "");
    $("#save").onclick = () => {
      const q = $("#nq").value.trim(), a = $("#na").value.trim();
      if (!q || !a) return toast("Add a question and a model answer", true);
      const kps = $("#nk").value.split("\n").map((x) => x.trim()).filter(Boolean);
      const kw = (s) => [...new Set(s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 5))].slice(0, 4);
      const kp = (kps.length ? kps : [a.split(/[.!?]/)[0]]).map((k) => [k, ...kw(k)]);
      store.update((s) => s.custom.push({ id: "c" + Date.now().toString(36), c: "custom", d: 2, custom: true, q, a, kp, f: [] }));
      $("#forms").innerHTML = ""; toast("Question saved"); filt.cat = "custom"; filt.src = ""; draw();
    };
  };

  $("#gen").onclick = () => {
    if (!aiEnabled()) return toast("Turn on a free AI provider in Settings to generate questions", true);
    $("#forms").innerHTML = `<div class="card"><h3>Generate fresh questions</h3>
      <div class="grid g3"><div class="field"><label for="gt">Topic</label><input id="gt" type="text" placeholder="e.g. Kubernetes autoscaling for .NET APIs"></div>
      <div class="field"><label for="gn">How many</label><select id="gn"><option>3</option><option selected>5</option><option>8</option></select></div>
      <div class="field"><label for="gl">Level</label><select id="gl"><option value="senior">Senior</option><option value="mid">Mid-level</option></select></div></div>
      <div class="row"><button class="btn primary" id="go">Generate</button><button class="btn" id="cancel">Cancel</button></div></div>`;
    $("#cancel").onclick = () => ($("#forms").innerHTML = "");
    $("#go").onclick = async (e) => {
      const topic = $("#gt").value.trim(); if (!topic) return toast("Enter a topic", true);
      const btn = e.currentTarget;
      busy(btn, true, "Generating");
      try {
        const qs = await generateQuestions(topic, +$("#gn").value, $("#gl").value);
        if (!qs.length) throw new Error("The AI returned no usable questions. Try again.");
        store.update((s) => s.custom.push(...qs));
        toast(`${qs.length} questions added to "My questions"`); $("#forms").innerHTML = ""; filt.cat = "custom"; draw();
      } catch (err) { toast(err.message, true); busy(btn, false); }
    };
  };

  draw();
}
