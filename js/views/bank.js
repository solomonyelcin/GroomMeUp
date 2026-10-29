import { store, allQuestions, lastScores, isDue } from "../store.js";
import { CATEGORIES } from "../data/index.js";
import { generateQuestions, aiEnabled } from "../ai.js";
import { esc, rich, scoreBadge, toast, busy, $, $$ } from "../ui.js";

const filt = { text: "", cat: "all", diff: 0, status: "all" };
let shown = 40;

export function view(root, ctx) {
  if (ctx.params.get("cat")) filt.cat = ctx.params.get("cat");
  root.innerHTML = `
    <header class="page-head">
      <h1>Question bank</h1>
      <p>Search and filter every question. Open one to see the model answer and key points, or practise it with feedback.</p>
    </header>
    <div class="card">
      <div class="grid g3">
        <div><label for="s">Search</label><input id="s" type="search" placeholder="e.g. saga, OnPush, deadlock" value="${esc(filt.text)}"></div>
        <div><label for="d">Difficulty</label><select id="d"><option value="0">Any</option><option value="1">Warm-up</option><option value="2">Core</option><option value="3">Senior / hard</option></select></div>
        <div><label for="st">Status</label><select id="st"><option value="all">All</option><option value="new">Not tried</option><option value="weak">Weak (under 6)</option><option value="due">Due for review</option><option value="strong">Strong (8+)</option></select></div>
      </div>
      <div class="chips" id="cats" style="margin-top:12px" role="group" aria-label="Category filter"></div>
    </div>
    <div class="row between" style="margin:16px 0 10px"><span id="count" class="muted" aria-live="polite"></span><div class="row"><button class="btn sm" id="add">Add your own question</button><button class="btn sm" id="gen">Generate with AI</button></div></div>
    <div id="forms"></div>
    <div id="list"></div>
  `;
  $("#d").value = String(filt.diff); $("#st").value = filt.status;

  const catsEl = $("#cats");
  const draw = () => {
    catsEl.innerHTML = [["all", "All topics"], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.name]), ["custom", "My questions"]]
      .map(([k, n]) => `<button class="chip" data-c="${k}" aria-pressed="${filt.cat === k}">${esc(n)}</button>`).join("");
    list();
  };

  function list() {
    const last = lastScores();
    const t = filt.text.trim().toLowerCase();
    const qs = allQuestions().filter((q) => {
      if (filt.cat !== "all" && q.c !== filt.cat) return false;
      if (filt.diff && q.d !== filt.diff) return false;
      const l = last.get(q.id);
      if (filt.status === "new" && l) return false;
      if (filt.status === "weak" && !(l && l.score < 6)) return false;
      if (filt.status === "strong" && !(l && l.score >= 8)) return false;
      if (filt.status === "due" && !(l && isDue(q.id))) return false;
      if (t && !(q.q + " " + q.a + " " + q.kp.map((k) => k[0]).join(" ")).toLowerCase().includes(t)) return false;
      return true;
    });
    $("#count").textContent = `${qs.length} question${qs.length === 1 ? "" : "s"}`;
    const diffName = ["", "Warm-up", "Core", "Senior"];
    $("#list").innerHTML = qs.slice(0, shown).map((q) => {
      const cat = CATEGORIES[q.c] || { name: "My questions", color: "#546178" };
      const l = last.get(q.id);
      return `<details class="q-card" data-id="${q.id}">
        <summary class="q-head"><span class="dot" style="background:${cat.color};margin-top:8px" title="${esc(cat.name)}"></span>
          <span class="q-title">${rich(q.q)}<br><span class="small muted">${esc(cat.name)} / ${diffName[q.d] || "Core"}</span></span>${scoreBadge(l ? l.score : null)}</summary>
        <div class="q-body">
          <h4>Model answer</h4><div class="model">${rich(q.a)}</div>
          <h4>Points interviewers listen for</h4><ul class="kp">${q.kp.map((k) => `<li>${esc(k[0])}</li>`).join("")}</ul>
          ${q.f && q.f.length ? `<h4>Likely follow-ups</h4><ul class="kp">${q.f.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
          <div class="row" style="margin-top:14px"><a class="btn primary sm" href="#/practice?q=${q.id}">Practise this question</a><a class="btn sm" href="#/practice?q=${q.id}&flash=1">Flashcard</a></div>
        </div></details>`;
    }).join("") + (qs.length > shown ? `<button class="btn" id="more" style="margin-top:12px">Show ${Math.min(40, qs.length - shown)} more</button>` : "") + (qs.length === 0 ? `<div class="card muted">No questions match. Clear a filter or add your own.</div>` : "");
    const more = $("#more"); if (more) more.onclick = () => { shown += 40; list(); };
  }

  catsEl.onclick = (e) => { const b = e.target.closest("[data-c]"); if (b) { filt.cat = b.dataset.c; shown = 40; draw(); } };
  $("#s").oninput = (e) => { filt.text = e.target.value; shown = 40; list(); };
  $("#d").onchange = (e) => { filt.diff = +e.target.value; shown = 40; list(); };
  $("#st").onchange = (e) => { filt.status = e.target.value; shown = 40; list(); };

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
      $("#forms").innerHTML = ""; toast("Question saved"); filt.cat = "custom"; draw();
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
      busy(e.currentTarget, true, "Generating");
      try {
        const qs = await generateQuestions(topic, +$("#gn").value, $("#gl").value);
        if (!qs.length) throw new Error("The AI returned no usable questions. Try again.");
        store.update((s) => s.custom.push(...qs));
        toast(`${qs.length} questions added to "My questions"`); $("#forms").innerHTML = ""; filt.cat = "custom"; draw();
      } catch (err) { toast(err.message, true); busy(e.currentTarget, false); }
    };
  };

  draw();
}
