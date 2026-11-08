import { allQuestions, store, recordAttempt } from "../store.js";
import { evaluateAnswer, mockSummary, aiEnabled } from "../ai.js";
import { CATEGORIES } from "../data/index.js";
import { esc, rich, shuffle, fmtTime, fmtDate, tape, scoreBadge, toast, speechSupported, startDictation, $ } from "../ui.js";
import { evalPanel } from "./evalpanel.js";
import { runLive, canListen, canTalk } from "./livemock.js";
import { JS_CHALLENGES, SQL_CHALLENGES, CS_CHALLENGES } from "../data/index.js";

const ROUNDS = {
  full: { name: "Full loop (mixed)", cats: ["csharp", "aspnet", "efsql", "angular", "micro", "cloud", "design", "resume", "hr"], tip: "Like a real day of interviews: a bit of everything." },
  backend: { name: "Technical 1: .NET backend", cats: ["csharp", "aspnet", "efsql"], tip: "C#, ASP.NET Core, EF Core and SQL internals." },
  frontend: { name: "Technical: Angular & TypeScript", cats: ["angular"], tip: "Signals, RxJS, performance and architecture." },
  arch: { name: "Technical 2: architecture & data", cats: ["micro", "cloud", "design", "snowflake"], tip: "Microservices, cloud, Snowflake and system design." },
  resume: { name: "Project deep dive (your resume)", cats: ["resume"], tip: "Defend every number and decision on your resume." },
  hr: { name: "HR & behavioural", cats: ["hr", "ai"], tip: "Story-telling, salary, motivation." },
};

const LIVE_INTRO = { id: "live-intro", c: "live", live: true, d: 2, q: "Tell me about yourself: your background, your current role and the kind of work you do best.",
  a: "Open with a 60 to 90 second pitch: years of experience and current role (Senior Developer at Flex), the core stack (C#, .NET, ASP.NET Core, Angular, SQL Server, Azure), one or two project results with numbers (EO Workbench for 1000 concurrent users), and why this role is the right next step.",
  kp: [["Current role and years of experience", "years", "senior", "experience", "currently", "working as"], ["Core technology stack", "c#", ".net", "angular", "asp.net", "sql", "azure"], ["A project or achievement", "project", "built", "led", "delivered", "developed", "workbench"], ["Why this role or what you want next", "looking", "interested", "opportunity", "next", "grow", "role"]] };
const LIVE_WHY = { id: "live-why", c: "live", live: true, d: 2, q: "Why are you looking for a change, and why this kind of role?",
  a: "Keep it positive and forward looking: what you have achieved so far, what you want more of (scope, ownership, architecture, scale), and why this company or role fits. Do not criticise your current employer.",
  kp: [["Positive reason for the change", "grow", "learn", "scope", "challenge", "opportunity", "next step"], ["What you want more of", "ownership", "architecture", "scale", "lead", "impact"], ["Why this role fits", "fit", "role", "team", "company", "domain"]] };
const LIVE_STRENGTH = { id: "live-str", c: "live", live: true, d: 2, q: "What is your biggest strength, and tell me about a real weakness and how you are working on it.",
  a: "Pick a strength tied to the job with proof (for example owning a high load system end to end). Pick a genuine, non critical weakness (for example delegating or saying no) and show the concrete habit you use to improve it.",
  kp: [["A strength with proof", "strength", "good at", "example", "for example", "delivered"], ["A real weakness", "weakness", "improve", "used to", "tend to"], ["Steps taken to improve", "now i", "working on", "habit", "learned", "practice"]] };
const LIVE_CLOSE = { id: "live-close", c: "live", live: true, d: 1, q: "That covers my questions. Do you have any questions for us about the team, the work or the company?",
  a: "Ask two or three thoughtful questions: how success is measured in the first six months, the team structure and engineering practices, the roadmap and technical challenges. Avoid asking about salary or leave first.",
  kp: [["Asks about the team or the work", "team", "work", "roadmap", "project", "practices"], ["Asks about success or growth", "success", "expect", "growth", "first", "months", "learn"], ["Shows interest in the company", "company", "product", "culture", "customers", "mission"]] };

const LEVELS = {
  easy: { name: "Easy", perQ: 2.5, limit: 150, diffs: [1, 2], codeDiff: 1, auto: 9, showText: true, tip: "Fundamentals and friendly pace. Good for warming up." },
  medium: { name: "Medium", perQ: 2.5, limit: 180, diffs: [2], codeDiff: 2, auto: 9, showText: true, tip: "Core senior-level questions, like a typical technical round." },
  hard: { name: "Hard", perQ: 3, limit: 180, diffs: [3, 2], codeDiff: 3, auto: 9, showText: true, tip: "Deep internals, trade-offs and failure modes." },
  pro: { name: "Pro", perQ: 3, limit: 150, diffs: [3], codeDiff: 3, auto: 6, showText: false, tip: "Hardest questions, you only hear them (no text), shorter time per answer, quicker to move on. Pressure like a final round." },
};
const DURATIONS = [10, 15, 20, 25, 30];
const GENERIC_CODE_KP = [["Explains the approach before coding", "approach", "first", "then", "idea", "plan", "algorithm"], ["Handles edge cases", "edge", "empty", "null", "invalid", "error", "negative", "duplicate"], ["States complexity or trade-offs", "complexity", "o(", "time", "memory", "trade", "performance"], ["Writes working code", "return", "for", "foreach", "select", "function", "=>", "async"]];
function codeQuestion(ch, lang) {
  return { id: "live-code-" + ch.id, c: "live", live: true, code: true, d: ch.diff, q: `Programming question, ${lang}: ${ch.title}. ${ch.desc}`, a: ch.solution || "", kp: GENERIC_CODE_KP, hint: "Say your approach out loud first, then type the code in the box." };
}
function pickCode(diff, n) {
  const all = [...JS_CHALLENGES.map((c) => [c, "JavaScript"]), ...SQL_CHALLENGES.map((c) => [c, "SQL"]), ...CS_CHALLENGES.map((c) => [c, "C#"])];
  const near = shuffle(all).sort((x, y) => Math.abs(x[0].diff - diff) - Math.abs(y[0].diff - diff));
  const seen = new Set(), out = [];
  for (const [c, l] of near) { if (out.length >= n) break; if (seen.has(l) && n <= 3 && seen.size < 3) continue; seen.add(l); out.push(codeQuestion(c, l)); }
  return out;
}
// round + level + total minutes + programming yes/no -> an ordered interview
function livePlan(round, level, minutes, withCode) {
  const L = LEVELS[level], slots = Math.max(4, Math.floor(minutes / L.perQ));
  const hr = round === "hr", full = round === "full", social = hr || full;
  const codeN = withCode && !hr ? (minutes >= 30 ? 3 : minutes >= 20 ? 2 : 1) : 0;
  const lead = [{ q: LIVE_INTRO }];
  if (social && slots >= 6) lead.push({ q: LIVE_WHY });
  if (hr && slots >= 8) lead.push({ q: LIVE_STRENGTH });
  const close = social && slots >= 5 ? [{ q: LIVE_CLOSE }] : [];
  const techN = Math.max(2, slots - lead.length - close.length - codeN * 2);
  let pool = allQuestions().filter((q) => ROUNDS[round].cats.includes(q.c));
  const rank = (q) => { const k = L.diffs.indexOf(q.d); return k < 0 ? 9 : k; };
  pool = shuffle(pool).sort((x, y) => rank(x) - rank(y)).slice(0, techN);
  const code = pickCode(L.codeDiff, codeN).map((q) => ({ q }));
  // coding questions go after the first half of the technical ones
  const half = Math.ceil(pool.length / 2), tech = pool.map((q) => ({ q }));
  return { plan: [...lead, ...tech.slice(0, half), ...code, ...tech.slice(half), ...close], techN: pool.length, codeN: code.length };
}
const FILLER = /\b(um+|uh+|erm|you know|basically|actually|sort of|kind of|i mean)\b/gi;
const wordsOf = (t) => t.split(/\s+/).filter(Boolean).length;

export function view(root, ctx) {
  let timerId = null, stopLive = null;
  const mineKeys = Object.keys(CATEGORIES).filter((k) => CATEGORIES[k].mine);
  if (mineKeys.length) ROUNDS.mine = { name: "My imported material", cats: mineKeys, tip: "Questions from the files you imported, asked cold with no hints." };
  else delete ROUNDS.mine;
  const setup = () => {
    const past = store.get().mocks.slice(-4).reverse();
    root.innerHTML = `
      <header class="page-head"><h1>Mock interview</h1><p>No hints or model answers until the end, just like the real thing. Choose a live voice interview or a written one.</p></header>
      <div class="card">
        <div class="grid g2">
          <div class="field"><label for="md">How do you want to practise?</label><select id="md"><option value="live">Live voice interview</option><option value="text">Written (type or dictate)</option></select><div class="hint" id="mdt"></div></div>
          <div class="field"><label for="r">Round</label><select id="r">${Object.entries(ROUNDS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("")}</select><div class="hint" id="rt"></div></div>
        </div>
        <div class="grid" style="gap:14px;margin-top:6px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))" id="liveSet">
            <div class="field"><label for="lv">Level</label><select id="lv">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${k === "medium" ? " selected" : ""}>${v.name}</option>`).join("")}</select></div>
            <div class="field"><label for="du">Duration</label><select id="du">${DURATIONS.map((d) => `<option value="${d}"${d === 20 ? " selected" : ""}>${d} minutes</option>`).join("")}</select></div>
            <div class="field"><label for="pg">Programming questions</label><select id="pg"><option value="1" selected>Yes</option><option value="0">No</option></select></div>
            <div class="callout" id="lvt" style="grid-column:1/-1;margin:0"></div>
        </div>
        <div class="grid" style="gap:14px;margin-top:6px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))" id="textSet">
            <div class="field"><label for="n">Questions</label><select id="n"><option>4</option><option selected>6</option><option>8</option><option>10</option></select></div>
            <div class="field"><label for="m">Minutes each</label><select id="m"><option>2</option><option selected>3</option><option>5</option></select></div>
            <div class="field"><label for="l">Level</label><select id="l"><option value="2">Core and senior</option><option value="3">Senior only</option><option value="0">Any</option></select></div>
        </div>
        <button class="btn chalk" id="go" style="margin-top:14px">Start interview</button>
      </div>
      ${past.length ? `<div class="card" style="margin-top:16px"><h3>Previous mocks</h3>${past.map((m) => `<div class="row between small" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span>${fmtDate(m.t)}: ${esc(ROUNDS[m.round]?.name || m.round)}</span><span>${scoreBadge(m.avg)}</span></div>`).join("")}</div>` : ""}`;
    if (ctx?.params?.get("mine") === "1" && ROUNDS.mine) $("#r").value = "mine";
    const updMode = () => { const live = $("#md").value === "live"; $("#liveSet").hidden = !live; $("#textSet").hidden = live; $("#mdt").textContent = live ? (canListen() && canTalk() ? "Full voice mode: works in Chrome and Edge. The microphone is used only inside your browser." : "This browser has limited voice support, so some parts will be on screen or typed.") : "No voice, same as before."; };
    const updLv = () => { const L = LEVELS[$("#lv").value], m = +$("#du").value, r = $("#r").value, { techN, codeN } = livePlan(r, $("#lv").value, m, $("#pg").value === "1"); $("#lvt").textContent = `${L.tip} About ${techN} questions${codeN ? ` and ${codeN} programming question${codeN > 1 ? "s" : ""}` : ""}, plus the opening${r === "full" || r === "hr" ? " and closing" : ""}.` + (r === "hr" && $("#pg").value === "1" ? " (No programming in an HR round.)" : ""); };
    ["lv", "du", "pg", "r"].forEach((id) => $("#" + id).addEventListener("change", updLv)); $("#md").addEventListener("change", updLv);
    $("#md").onchange = updMode; updMode(); updLv();
    const upd = () => ($("#rt").textContent = ROUNDS[$("#r").value].tip); $("#r").onchange = upd; upd();
    $("#go").onclick = () => {
      if ($("#md").value === "live") { const r = $("#r").value, lv = $("#lv").value, m = +$("#du").value, { plan } = livePlan(r, lv, m, $("#pg").value === "1"); if (plan.length < 2) return toast("No questions available for this round", true); return startLive(r, plan, lv, m); }
      const round = $("#r").value, n = +$("#n").value, mins = +$("#m").value, lvl = +$("#l").value;
      let pool = allQuestions().filter((q) => ROUNDS[round].cats.includes(q.c));
      if (lvl) pool = pool.filter((q) => q.d >= Math.min(lvl, 2) || pool.length < n);
      pool = shuffle(pool).slice(0, n);
      if (!pool.length) return toast("No questions available for this round", true);
      run(round, pool, mins * 60);
    };
  };

  function startLive(round, plan, level, minutes) {
    const L = LEVELS[level];
    stopLive = runLive(root, plan, { limit: L.limit, codeLimit: 300, totalSec: minutes * 60, autoSec: L.auto, showText: L.showText || !canTalk() }, (answers) => { stopLive = null; grade(round, plan.map((p) => p.q).slice(0, answers.length), answers, { level, minutes }); });
  }

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

  async function grade(round, pool, answers, liveInfo = null) {
    const live = !!liveInfo;
    root.innerHTML = `<div class="card" style="max-width:640px"><h2>Interview complete</h2><p class="muted" id="gp"><span class="spinner"></span> Evaluating your answers${aiEnabled() ? " with AI (about 5 seconds each)" : ""}...</p></div>`;
    const results = [];
    for (let k = 0; k < answers.length; k++) {
      const a = answers[k];
      $("#gp").innerHTML = `<span class="spinner"></span> Evaluating answer ${k + 1} of ${answers.length}...`;
      const ev = a.text.split(/\s+/).filter(Boolean).length < 5
        ? { score: 0, source: "offline", verdict: "No answer given", strengths: [], gaps: ["No answer"], tips: [], improved: a.q.a }
        : await evaluateAnswer(a.q, a.text, { interviewer: true });
      results.push({ ...a, ev });
      if (!a.q.live) recordAttempt(a.q, ev.score, "mock");
    }
    const avg = Math.round((results.reduce((s, r) => s + r.ev.score, 0) / results.length) * 10) / 10;
    const signal = avg >= 7.5 ? ["Strong yes", "moss"] : avg >= 6 ? ["Lean yes", "moss"] : avg >= 4.5 ? ["Lean no", "amber"] : ["No hire yet", "thread"];
    store.update((s) => s.mocks.push({ t: Date.now(), round, avg, items: results.filter((r) => !r.q.live).map((r) => ({ qid: r.q.id, score: r.ev.score })), mode: live ? "live" : "text", level: liveInfo?.level, minutes: liveInfo?.minutes }));
    let summary = null;
    try { summary = await mockSummary({ round: ROUNDS[round].name, avg, items: results.map((r) => ({ q: r.q.q, score: r.ev.score, gaps: r.ev.gaps?.slice(0, 3) })) }); } catch { /* optional */ }

    const weak = results.filter((r) => r.ev.score < 6);
    const spoken = results.filter((r) => r.spoken && r.text);
    const delivery = (() => {
      if (!live || !spoken.length) return "";
      const words = spoken.reduce((n, r) => n + wordsOf(r.text), 0), secs = spoken.reduce((n, r) => n + r.secs, 0) || 1;
      const fill = spoken.reduce((n, r) => n + (r.text.match(FILLER) || []).length, 0), avg = Math.round(words / spoken.length);
      const wpm = secs / spoken.length >= 5 ? Math.round((words / secs) * 60) : "n/a";
      const tips = [];
      if (avg < 45) tips.push("Your answers are short. Aim for 60 to 150 words: definition, example, trade-off.");
      if (avg > 220) tips.push("Your answers run long. Lead with the answer in one sentence, then add detail.");
      if (fill / spoken.length > 3) tips.push("Many filler words (um, basically, actually). Pause silently instead.");
      if (results.some((r) => !r.text || wordsOf(r.text) < 5)) tips.push("Some questions were skipped or very short. Attempt every question, even a partial answer earns points.");
      return `<h3 style="margin-top:18px">How you came across</h3><div class="grid g3"><div class="stat"><b>${avg}</b><span>words per answer</span></div><div class="stat"><b>${wpm}</b><span>words per minute, including thinking time</span></div><div class="stat"><b>${fill}</b><span>filler words</span></div></div>${tips.length ? `<ul class="kp">${tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">Good length and pace.</p>`}`;
    })();
    const learn = (() => {
      const by = {};
      for (const r of weak) { if (r.q.live) continue; (by[r.q.c] ||= []).push(r); }
      const rows = Object.entries(by).sort((a, b) => b[1].length - a[1].length);
      if (!rows.length) return "";
      return `<h2 style="margin-top:24px">What to learn next</h2><div class="card">${rows.map(([c, rs]) => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)"><div class="row between"><strong>${esc(CATEGORIES[c]?.name || c)}</strong><span class="small muted">${rs.length} weak answer${rs.length > 1 ? "s" : ""}, avg ${Math.round((rs.reduce((s, r) => s + r.ev.score, 0) / rs.length) * 10) / 10}/10</span></div><ul class="kp">${[...new Set(rs.flatMap((r) => (r.ev.gaps || []).slice(0, 2)))].slice(0, 4).map((g) => `<li>${esc(g)}</li>`).join("")}</ul><a class="btn" href="#/quiz?cat=${encodeURIComponent(c)}">Quiz me on this topic</a></div>`).join("")}</div>`;
    })();
    root.innerHTML = `<div style="max-width:860px">
      <header class="page-head"><h1>Interview debrief</h1><p>${esc(ROUNDS[round].name)}${live ? ` · ${LEVELS[liveInfo.level].name} · ${liveInfo.minutes} minutes` : ""}</p></header>
      <div class="card"><div class="row between" style="align-items:flex-end"><div><div class="big-num">${avg}<small>/ 10</small></div><span class="tag ${signal[1]}" style="margin-top:8px">${signal[0]}</span></div>
        <div class="stat"><b>${results.length}</b><span>questions, ${weak.length} below 6</span></div></div>
        <div style="margin-top:14px">${tape(avg * 10, { label: "Mock score" })}</div>
        ${delivery}
        ${summary ? `<hr><p><strong>${esc(summary.verdict || "")}</strong></p>
          ${[["Strengths", summary.topStrengths], ["Gaps", summary.topGaps], ["Next steps", summary.nextSteps]].filter(([, a]) => a?.length).map(([t, a]) => `<h4 style="margin:10px 0 2px">${t}</h4><ul class="kp">${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("")}` : ""}
      </div>
      ${learn}
      <h2 style="margin-top:24px">Question by question</h2>
      ${results.map((r, k) => `<details class="q-card"><summary class="q-head"><span class="q-title">${k + 1}. ${rich(r.q.q)}<br><span class="small muted">${r.secs}s</span></span>${scoreBadge(r.ev.score)}</summary><div class="q-body"><h4>Your answer</h4><p>${r.text ? esc(r.text) : "<em>No answer</em>"}</p>${evalPanel(r.ev)}</div></details>`).join("")}
      <div class="row" style="margin-top:20px"><button class="btn primary" id="again">Another mock</button><button class="btn" id="dl">Download transcript</button>${weak.length ? `<a class="btn" href="#/practice?mode=weak">Practise the weak ones</a>` : ""}<a class="btn" href="#/dashboard">Dashboard</a></div></div>`;
    $("#again").onclick = setup;
    $("#dl").onclick = () => {
      const lines = [`# Interview transcript and feedback`, `${ROUNDS[round].name}${live ? ` | ${LEVELS[liveInfo.level].name} | ${liveInfo.minutes} minutes` : ""} | ${new Date().toLocaleString()}`, `Score ${avg}/10 (${signal[0]})`, ""];
      if (summary) lines.push(summary.verdict || "", ...[["Strengths", summary.topStrengths], ["Gaps", summary.topGaps], ["Next steps", summary.nextSteps]].flatMap(([t, a]) => (a?.length ? ["", `## ${t}`, ...a.map((x) => "- " + x)] : [])), "");
      results.forEach((r, k) => lines.push(`## ${k + 1}. ${r.q.q}`, `Score: ${r.ev.score}/10 | ${r.secs}s`, "", "Your answer:", r.text || "(no answer)", "", ...(r.ev.gaps?.length ? ["Gaps:", ...r.ev.gaps.map((x) => "- " + x), ""] : []), ...(r.ev.tips?.length ? ["Tips:", ...r.ev.tips.map((x) => "- " + x), ""] : []), ...(r.ev.improved ? ["Model answer:", r.ev.improved, ""] : [])));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" })); a.download = `interview-${new Date().toISOString().slice(0, 10)}.md`; document.body.appendChild(a); a.click(); a.remove();
    };
  }

  setup();
  return () => { clearInterval(timerId); if (stopLive) stopLive(); };
}
