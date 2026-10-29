import { store } from "../store.js";
import { CATEGORIES } from "../data/index.js";
import { generateQuestions, aiEnabled, offlineEvaluate } from "../ai.js";
import { esc, fmtDate, toast, busy, $, $$ } from "../ui.js";

const OUTCOMES = ["Waiting", "Cleared", "Rejected", "Offer", "Declined offer"];

// Rough keyword mapping so logged questions can be tagged to a topic automatically.
const HINTS = {
  csharp: ["c#", "async", "await", "linq", "garbage", "gc ", "span", "boxing", "delegate", "thread", "solid"],
  aspnet: ["asp.net", "middleware", "dependency injection", "di ", "web api", "jwt", "oauth", "rest", "minimal api", "authorization", "caching"],
  efsql: ["entity framework", "ef core", "sql", "index", "join", "deadlock", "transaction", "stored procedure", "n+1", "query"],
  angular: ["angular", "rxjs", "signal", "typescript", "observable", "change detection", "onpush", "ngrx", "component", "directive"],
  micro: ["microservice", "saga", "rabbitmq", "kafka", "outbox", "cqrs", "circuit", "idempot", "message queue", "event"],
  snowflake: ["snowflake", "warehouse", "micro-partition", "snowpipe", "time travel", "data warehouse"],
  cloud: ["azure", "docker", "kubernetes", "k8s", "ci/cd", "pipeline", "devops", "terraform", "bicep", "helm"],
  design: ["design a", "system design", "scalab", "rate limit", "high availability", "architecture"],
  resume: ["your project", "your role", "resume", "flex", "tcs", "workbench", "what did you"],
  hr: ["salary", "notice period", "why are you", "tell me about yourself", "strength", "weakness", "conflict", "ctc", "relocat"],
  ai: ["llm", "ai ", "copilot", "prompt", "rag", "machine learning"],
};
const guess = (t) => { const l = " " + t.toLowerCase() + " "; return Object.entries(HINTS).filter(([, kws]) => kws.some((k) => l.includes(k))).map(([c]) => c); };

export function view(root) {
  let editing = null;
  const draw = () => {
    const log = [...store.get().log].reverse();
    const qCount = log.reduce((s, e) => s + (e.questions?.length || 0), 0);
    root.innerHTML = `
      <header class="page-head"><h1>Interview log</h1>
        <p>Record every real interview: the questions asked, how you answered, and the feedback you got. Real questions are the best signal there is, so they feed straight into your practice.</p></header>
      <div class="row between" style="margin-bottom:14px"><span class="muted">${log.length} interview${log.length === 1 ? "" : "s"}, ${qCount} real questions captured</span><button class="btn primary" id="new">Log an interview</button></div>
      <div id="formArea"></div>
      <div id="entries">${log.length ? log.map(entry).join("") : `<div class="card muted">No interviews logged yet. Right after your next interview, write down every question you remember while it is fresh, even the ones you fumbled. That is exactly what to practise.</div>`}</div>`;
    $("#new").onclick = () => form(null);
    $$("[data-edit]").forEach((b) => (b.onclick = () => form(b.dataset.edit)));
    $$("[data-del]").forEach((b) => (b.onclick = () => { if (confirm("Delete this interview entry?")) { store.update((s) => (s.log = s.log.filter((e) => e.id !== b.dataset.del))); draw(); } }));
    $$("[data-add]").forEach((b) => (b.onclick = () => addToBank(b.dataset.add, +b.dataset.i)));
    $$("[data-addall]").forEach((b) => (b.onclick = () => addAll(b.dataset.addall, b)));
  };

  const entry = (e) => `<article class="card">
    <div class="row between"><div><h3 style="margin:0">${esc(e.company)} <span class="muted" style="font-weight:400">/ ${esc(e.round || "Round")}</span></h3><span class="small muted">${fmtDate(e.date)}${e.role ? `, ${esc(e.role)}` : ""}</span></div>
      <div class="row"><span class="tag ${e.outcome === "Offer" || e.outcome === "Cleared" ? "moss" : e.outcome === "Rejected" ? "thread" : "amber"}">${esc(e.outcome)}</span><button class="btn sm" data-edit="${e.id}">Edit</button><button class="btn sm danger" data-del="${e.id}">Delete</button></div></div>
    ${e.questions?.length ? `<h4 style="margin:14px 0 6px">Questions asked</h4><ol class="kp">${e.questions.map((q, i) => `<li style="margin-bottom:8px">${esc(q.text)} ${q.hard ? '<span class="tag thread">fumbled</span>' : ""}${q.added ? '<span class="tag moss">in your bank</span>' : `<button class="btn sm" data-add="${e.id}" data-i="${i}" style="margin-left:6px">Add to practice</button>`}</li>`).join("")}</ol>
      ${e.questions.some((q) => !q.added) && aiEnabled() ? `<button class="btn sm" data-addall="${e.id}">Add all with AI model answers</button>` : ""}` : ""}
    ${e.feedback ? `<h4 style="margin:14px 0 4px">Feedback received</h4><p>${esc(e.feedback)}</p>` : ""}
    ${e.reflection ? `<h4 style="margin:14px 0 4px">What I'll fix</h4><p>${esc(e.reflection)}</p>` : ""}
    ${e.package ? `<p class="small muted">Package discussed: ${esc(e.package)}</p>` : ""}
    ${(e.cats || []).length ? `<div class="chips">${e.cats.map((c) => `<a class="tag" href="#/practice?cat=${c}">${esc(CATEGORIES[c]?.name || c)}</a>`).join("")}</div>` : ""}
  </article>`;

  function form(id) {
    editing = id ? store.get().log.find((e) => e.id === id) : null;
    const e = editing || { company: "", role: "", round: "Technical 1", date: new Date().toISOString().slice(0, 10), outcome: "Waiting", questions: [], feedback: "", reflection: "", package: "" };
    $("#formArea").innerHTML = `<div class="card"><h2>${editing ? "Edit" : "Log"} interview</h2>
      <div class="grid g3">
        <div class="field"><label for="co">Company</label><input id="co" type="text" value="${esc(e.company)}"></div>
        <div class="field"><label for="ro">Role</label><input id="ro" type="text" value="${esc(e.role)}" placeholder="e.g. Senior Software Engineer"></div>
        <div class="field"><label for="rd">Round</label><input id="rd" type="text" value="${esc(e.round)}"></div>
        <div class="field"><label for="dt">Date</label><input id="dt" type="date" value="${esc(e.date)}"></div>
        <div class="field"><label for="oc">Outcome</label><select id="oc">${OUTCOMES.map((o) => `<option ${o === e.outcome ? "selected" : ""}>${o}</option>`).join("")}</select></div>
        <div class="field"><label for="pk">Package discussed (optional)</label><input id="pk" type="text" value="${esc(e.package)}" placeholder="fixed, variable, joining bonus"></div>
      </div>
      <div class="field"><label for="qs">Questions asked (one per line; add * at the end if you fumbled it)</label><textarea id="qs" rows="7" placeholder="Explain how async/await works under the hood&#10;Design a rate limiter *">${esc((e.questions || []).map((q) => q.text + (q.hard ? " *" : "")).join("\n"))}</textarea><div class="hint">Topics are detected automatically so the dashboard can show what keeps coming up.</div></div>
      <div class="field"><label for="fb">Feedback you received (from recruiter or interviewer)</label><textarea id="fb" rows="3" style="min-height:70px">${esc(e.feedback)}</textarea></div>
      <div class="field"><label for="rf">What will you do differently?</label><textarea id="rf" rows="3" style="min-height:70px">${esc(e.reflection)}</textarea></div>
      <div class="row"><button class="btn primary" id="sv">Save</button><button class="btn" id="cn">Cancel</button></div></div>`;
    $("#cn").onclick = () => ($("#formArea").innerHTML = "");
    $("#sv").onclick = () => {
      const company = $("#co").value.trim();
      if (!company) return toast("Add the company name", true);
      const old = new Map((editing?.questions || []).map((q) => [q.text, q]));
      const questions = $("#qs").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const hard = /\*\s*$/.test(l); const text = l.replace(/\*\s*$/, "").trim();
        return { text, hard, added: old.get(text)?.added || false };
      });
      const cats = [...new Set(questions.flatMap((q) => guess(q.text)))];
      const rec = { id: editing?.id || "l" + Date.now().toString(36), company, role: $("#ro").value.trim(), round: $("#rd").value.trim(), date: $("#dt").value, outcome: $("#oc").value, package: $("#pk").value.trim(), questions, feedback: $("#fb").value.trim(), reflection: $("#rf").value.trim(), cats };
      store.update((s) => { const i = s.log.findIndex((x) => x.id === rec.id); i >= 0 ? (s.log[i] = rec) : s.log.push(rec); });
      toast("Interview saved"); draw();
    };
    $("#formArea").scrollIntoView({ behavior: "smooth" });
  }

  const makeQ = (text, hard, cat) => {
    const words = [...new Set(text.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").split(/\s+/).filter((w) => w.length >= 5))].slice(0, 4);
    return { id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), c: cat || "custom", d: hard ? 3 : 2, custom: true, real: true, q: text, a: "(Write your best answer here by editing, or generate a model answer with AI.)", kp: [["Core idea", ...words]], f: [] };
  };
  function addToBank(eid, i) {
    const e = store.get().log.find((x) => x.id === eid); const q = e.questions[i];
    store.update((s) => { s.custom.push(makeQ(q.text, q.hard, guess(q.text)[0])); s.log.find((x) => x.id === eid).questions[i].added = true; });
    toast("Added. Find it in Question bank under the topic or 'My questions'."); draw();
  }
  async function addAll(eid, btn) {
    const e = store.get().log.find((x) => x.id === eid);
    busy(btn, true, "Writing answers");
    try {
      const todo = e.questions.map((q, i) => ({ q, i })).filter((x) => !x.q.added);
      const { chat, parseJSON } = await import("../ai.js");
      const d = parseJSON(await chat("You are a senior interviewer. For each question write a model answer (60-120 words) and 3-5 key phrases. Return ONLY JSON: {\"items\":[{\"a\":string,\"keyPoints\":string[]}]} in the same order.", todo.map((x, k) => `${k + 1}. ${x.q.text}`).join("\n"), { json: true }));
      const items = d.items || [];
      store.update((s) => {
        todo.forEach((x, k) => {
          const it = items[k]; const base = makeQ(x.q.text, x.q.hard, guess(x.q.text)[0]);
          if (it?.a) { base.a = String(it.a); base.kp = (it.keyPoints?.length ? it.keyPoints : ["Core idea"]).map((p) => [String(p), ...String(p).toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 5).slice(0, 3)]); }
          s.custom.push(base); s.log.find((l) => l.id === eid).questions[x.i].added = true;
        });
      });
      toast(`${todo.length} real questions added to your bank`); draw();
    } catch (err) { toast(err.message, true); busy(btn, false); }
  }
  void generateQuestions; void offlineEvaluate;

  draw();
}
