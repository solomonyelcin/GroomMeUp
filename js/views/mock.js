import { allQuestions, store, recordAttempt } from "../store.js";
import { evaluateAnswer, mockSummary, aiEnabled } from "../ai.js";
import { CATEGORIES } from "../data/index.js";
import { esc, rich, shuffle, fmtTime, fmtDate, tape, scoreBadge, toast, speechSupported, startDictation, $ } from "../ui.js";
import { evalPanel } from "./evalpanel.js";

const ROUNDS = {
  full: { name: "Full loop (mixed)", cats: ["csharp", "aspnet", "efsql", "angular", "micro", "cloud", "design", "resume", "hr"], tip: "Like a real day of interviews: a bit of everything." },
  backend: { name: "Technical 1: .NET backend", cats: ["csharp", "aspnet", "efsql"], tip: "C#, ASP.NET Core, EF Core and SQL internals." },
  frontend: { name: "Technical: Angular & TypeScript", cats: ["angular"], tip: "Signals, RxJS, performance and architecture." },
  arch: { name: "Technical 2: architecture & data", cats: ["micro", "cloud", "design", "snowflake"], tip: "Microservices, cloud, Snowflake and system design." },
  resume: { name: "Project deep dive (your resume)", cats: ["resume"], tip: "Defend every number and decision on your resume." },
  hr: { name: "HR & behavioural", cats: ["hr", "ai"], tip: "Story-telling, salary, motivation." },
};

export function view(root, ctx) {
  let timerId = null;
  const mineKeys = Object.keys(CATEGORIES).filter((k) => CATEGORIES[k].mine);
  if (mineKeys.length) ROUNDS.mine = { name: "My imported material", cats: mineKeys, tip: "Questions from the files you imported, asked cold with no hints." };
  else delete ROUNDS.mine;
  const setup = () => {
    const past = store.get().mocks.slice(-4).reverse();
    root.innerHTML = `
      <header class="page-head"><h1>Mock interview</h1><p>No hints or model answers until the end, just like the real thing. Speak your answer out loud, then type or dictate it.</p></header>
      <div class="card">
        <div class="grid g2">
          <div class="field"><label for="r">Round</label><select id="r">${Object.entries(ROUNDS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("")}</select><div class="hint" id="rt"></div></div>
          <div class="grid g3" style="gap:12px">
            <div class="field"><label for="n">Questions</label><select id="n"><option>4</option><option selected>6</option><option>8</option><option>10</option></select></div>
            <div class="field"><label for="m">Minutes each</label><select id="m"><option>2</option><option selected>3</option><option>5</option></select></div>
            <div class="field"><label for="l">Level</label><select id="l"><option value="2">Core and senior</option><option value="3">Senior only</option><option value="0">Any</option></select></div>
          </div>
        </div>
        <button class="btn chalk" id="go">Start interview</button>
      </div>
      ${past.length ? `<div class="card" style="margin-top:16px"><h3>Previous mocks</h3>${past.map((m) => `<div class="row between small" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span>${fmtDate(m.t)}: ${esc(ROUNDS[m.round]?.name || m.round)}</span><span>${scoreBadge(m.avg)}</span></div>`).join("")}</div>` : ""}`;
    if (ctx?.params?.get("mine") === "1" && ROUNDS.mine) $("#r").value = "mine";
    const upd = () => ($("#rt").textContent = ROUNDS[$("#r").value].tip); $("#r").onchange = upd; upd();
    $("#go").onclick = () => {
      const round = $("#r").value, n = +$("#n").value, mins = +$("#m").value, lvl = +$("#l").value;
      let pool = allQuestions().filter((q) => ROUNDS[round].cats.includes(q.c));
      if (lvl) pool = pool.filter((q) => q.d >= Math.min(lvl, 2) || pool.length < n);
      pool = shuffle(pool).slice(0, n);
      if (!pool.length) return toast("No questions available for this round", true);
      run(round, pool, mins * 60);
    };
  };

  function run(round, pool, limit) {
    const answers = []; let i = 0, startedAt = 0, stopDictation = null;
    const stop = () => { clearInterval(timerId); if (stopDictation) { stopDictation(); stopDictation = null; } };
    const step = () => {
      stop();
      if (i >= pool.length) return grade(round, pool, answers);
      const q = pool[i];
      root.innerHTML = `<div class="card" style="max-width:820px">
        <div class="row between small muted"><span>Interviewer / question ${i + 1} of ${pool.length}</span><span class="timer" id="tm">${fmtTime(limit)}</span></div>
        <div style="margin:10px 0 16px">${tape((i / pool.length) * 100, { slim: true, label: "Interview progress" })}</div>
        <h2>${rich(q.q)}</h2>
        <div class="field"><label for="ans">Your answer</label><textarea id="ans" rows="8" placeholder="Think out loud: clarify, answer, example, trade-off."></textarea></div>
        <div class="row"><button class="btn primary" id="nx">${i + 1 >= pool.length ? "Submit and finish" : "Submit answer"}</button>${speechSupported() ? `<button class="btn" id="mic">Dictate</button>` : ""}<button class="btn" id="skip">Pass on this</button></div></div>`;
      startedAt = Date.now();
      timerId = setInterval(() => { const left = limit - (Date.now() - startedAt) / 1000; const t = $("#tm"); if (!t) return; t.textContent = fmtTime(Math.max(left, 0)); t.classList.toggle("low", left <= 30); if (left <= 0) { clearInterval(timerId); toast("Time is up. Wrap up your point.", true); } }, 500);
      $("#ans").focus();
      const mic = $("#mic");
      if (mic) mic.onclick = () => {
        if (stopDictation) { stopDictation(); stopDictation = null; mic.textContent = "Dictate"; return; }
        mic.textContent = "Stop dictation";
        stopDictation = startDictation((t) => { const a = $("#ans"); a.value += (a.value && !a.value.endsWith(" ") ? " " : "") + t; }, () => { stopDictation = null; if ($("#mic")) $("#mic").textContent = "Dictate"; });
      };
      const save = (skipped) => { answers.push({ q, text: skipped ? "" : $("#ans").value.trim(), secs: Math.round((Date.now() - startedAt) / 1000) }); i++; step(); };
      $("#nx").onclick = () => save(false);
      $("#skip").onclick = () => save(true);
    };
    step();
  }

  async function grade(round, pool, answers) {
    root.innerHTML = `<div class="card" style="max-width:640px"><h2>Interview complete</h2><p class="muted" id="gp"><span class="spinner"></span> Evaluating your answers${aiEnabled() ? " with AI (about 5 seconds each)" : ""}...</p></div>`;
    const results = [];
    for (let k = 0; k < answers.length; k++) {
      const a = answers[k];
      $("#gp").innerHTML = `<span class="spinner"></span> Evaluating answer ${k + 1} of ${answers.length}...`;
      const ev = a.text.split(/\s+/).filter(Boolean).length < 5
        ? { score: 0, source: "offline", verdict: "No answer given", strengths: [], gaps: ["No answer"], tips: [], improved: a.q.a }
        : await evaluateAnswer(a.q, a.text, { interviewer: true });
      results.push({ ...a, ev });
      recordAttempt(a.q, ev.score, "mock");
    }
    const avg = Math.round((results.reduce((s, r) => s + r.ev.score, 0) / results.length) * 10) / 10;
    const signal = avg >= 7.5 ? ["Strong yes", "moss"] : avg >= 6 ? ["Lean yes", "moss"] : avg >= 4.5 ? ["Lean no", "amber"] : ["No hire yet", "thread"];
    store.update((s) => s.mocks.push({ t: Date.now(), round, avg, items: results.map((r) => ({ qid: r.q.id, score: r.ev.score })) }));
    let summary = null;
    try { summary = await mockSummary({ round: ROUNDS[round].name, avg, items: results.map((r) => ({ q: r.q.q, score: r.ev.score, gaps: r.ev.gaps?.slice(0, 3) })) }); } catch { /* optional */ }

    const weak = results.filter((r) => r.ev.score < 6);
    root.innerHTML = `<div style="max-width:860px">
      <header class="page-head"><h1>Interview debrief</h1><p>${esc(ROUNDS[round].name)}</p></header>
      <div class="card"><div class="row between" style="align-items:flex-end"><div><div class="big-num">${avg}<small>/ 10</small></div><span class="tag ${signal[1]}" style="margin-top:8px">${signal[0]}</span></div>
        <div class="stat"><b>${results.length}</b><span>questions, ${weak.length} below 6</span></div></div>
        <div style="margin-top:14px">${tape(avg * 10, { label: "Mock score" })}</div>
        ${summary ? `<hr><p><strong>${esc(summary.verdict || "")}</strong></p>
          ${[["Strengths", summary.topStrengths], ["Gaps", summary.topGaps], ["Next steps", summary.nextSteps]].filter(([, a]) => a?.length).map(([t, a]) => `<h4 style="margin:10px 0 2px">${t}</h4><ul class="kp">${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("")}` : ""}
      </div>
      <h2 style="margin-top:24px">Question by question</h2>
      ${results.map((r, k) => `<details class="q-card"><summary class="q-head"><span class="q-title">${k + 1}. ${rich(r.q.q)}<br><span class="small muted">${r.secs}s</span></span>${scoreBadge(r.ev.score)}</summary><div class="q-body"><h4>Your answer</h4><p>${r.text ? esc(r.text) : "<em>No answer</em>"}</p>${evalPanel(r.ev)}</div></details>`).join("")}
      <div class="row" style="margin-top:20px"><button class="btn primary" id="again">Another mock</button>${weak.length ? `<a class="btn" href="#/practice?mode=weak">Practise the weak ones</a>` : ""}<a class="btn" href="#/dashboard">Dashboard</a></div></div>`;
    $("#again").onclick = setup;
  }

  setup();
  return () => clearInterval(timerId);
}
