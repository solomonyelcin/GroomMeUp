import { store, categoryStats, codingStats, overallReadiness, weakTopics, streak, counts, allQuestions, isDue } from "../store.js";
import { aiEnabled, activeProvider, PROVIDERS } from "../ai.js";
import { CATEGORIES } from "../data/index.js";
import { esc, tape, tapeScale, pct, fmtDate } from "../ui.js";

export function view(root) {
  const s = store.get();
  const overall = overallReadiness();
  const stats = categoryStats();
  const rows = Object.values(stats).filter((r) => !r.mine).sort((a, b) => a.readiness - b.readiness);
  const mineRows = Object.values(stats).filter((r) => r.mine && r.total).sort((a, b) => a.readiness - b.readiness);
  const rowHtml = (r) => `
          <div>
            <div class="row between small" style="margin-bottom:4px">
              <a href="#/practice?cat=${encodeURIComponent(r.key)}" style="color:inherit;font-weight:600;text-decoration:none"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</a>
              <span class="muted">${r.attempted}/${r.total} tried${r.attempted ? `, avg ${(r.acc / 10).toFixed(1)}/10` : ""}${r.mcqAcc !== null ? `, quiz ${pct(r.mcqAcc)}` : ""}</span>
            </div>
            ${tape(r.readiness, { slim: true, label: r.name })}
          </div>`;
  const cd = codingStats();
  const due = allQuestions().filter((q) => isDue(q.id) && s.attempts.some((a) => a.qid === q.id)).length;
  const fresh = allQuestions().filter((q) => !s.attempts.some((a) => a.qid === q.id)).length;
  const n = counts();
  const weak = weakTopics(3);

  const days = s.settings.target ? Math.ceil((new Date(s.settings.target) - Date.now()) / 86400000) : null;
  const name = s.settings.name ? `, ${esc(s.settings.name)}` : "";

  // topics seen in real interviews
  const seen = {};
  for (const e of s.log) for (const c of e.cats || []) seen[c] = (seen[c] || 0) + 1;
  const seenTop = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const nextCoding = (() => {
    const left = [["js", "JavaScript"], ["sql", "SQL"], ["cs", "C#"]].find(([k]) => cd[k][0] < cd[k][1]);
    return left ? `#/code?lang=${left[0]}` : "#/code";
  })();

  const tried = s.attempts.length;
  const myCount = allQuestions().filter((q) => q.imported).length;
  const next = !tried ? { t: "Practise your first 5 questions", d: "Answer in your own words and get a score with feedback.", h: "#/practice" }
    : due ? { t: `Review ${due} question${due > 1 ? "s" : ""} that are due`, d: "Spaced repetition brings weak answers back at the right time.", h: "#/practice?mode=due" }
    : weak[0] && weak[0].attempted ? { t: `Strengthen ${weak[0].name}`, d: "This is your weakest topic right now.", h: `#/practice?cat=${encodeURIComponent(weak[0].key)}` }
    : { t: "Take a 10-question quiz", d: "A fast way to find blind spots.", h: "#/quiz" };
  const tile = (h, ico, t, d, id) => `<a class="tile" href="${h}" ${id ? `data-tile="${id}"` : ""}><span class="tile-ico" aria-hidden="true">${ico}</span><span><strong>${t}</strong><span class="small muted">${d}</span></span></a>`;

  root.innerHTML = `
    <header class="page-head">
      <h1>Welcome back${name}.</h1>
      <p>Pick what you want to do. Not sure? Use the highlighted next step.</p>
    </header>

    <section aria-labelledby="start">
      <a class="next-step" href="${next.h}"><span class="small" style="opacity:.85">YOUR NEXT STEP</span><strong id="start">${esc(next.t)}</strong><span>${esc(next.d)}</span><span class="go" aria-hidden="true">Go →</span></a>
      <div class="tiles" id="startgrid">
        ${tile("#/practice", "✎", "Practise answers", "Write or speak an answer, get a score")}
        ${tile("#/quiz", "?", "Quick quiz", "Multiple choice, instant answers")}
        ${tile("#/code", "⌘", "Coding tests", "JavaScript, SQL and C# challenges")}
        ${tile("#/mock", "◉", "Mock interview", "A timed round with no hints")}
        ${tile("#/import", "⇪", myCount ? "Add more questions" : "Add my questions", myCount ? `${myCount} of yours added` : "Excel, Word, PDF or text", "import")}
        ${tile("#/bank", "☰", "Browse questions", "Search and read model answers")}
      </div>
    </section>

    <h2 style="margin:28px 0 12px">Your progress</h2>

    <section class="card" aria-labelledby="rd">
      <div class="row between" style="align-items:flex-end">
        <div>
          <h2 id="rd" style="margin-bottom:6px">Interview readiness</h2>
          <div class="big-num">${overall}<small>/ 100</small></div>
        </div>
        <div class="row" style="gap:28px">
          <div class="stat"><b>${streak()}</b><span>day streak</span></div>
          <div class="stat"><b>${s.attempts.filter((a) => a.mode !== "self-rated").length}</b><span>answers graded</span></div>
          <div class="stat"><b>${days === null ? "-" : days < 0 ? "Passed" : days}</b><span>${days === null ? "set a target date" : "days to target"}</span></div>
        </div>
      </div>
      <div style="margin-top:16px">${tape(overall, { label: "Overall readiness" })}${tapeScale()}</div>
    </section>

    ${!aiEnabled() ? `<div class="callout" style="margin-top:16px"><strong>AI feedback is off.</strong> Answers are scored by key-point coverage only. Turn on free AI in <a href="#/settings">Settings</a>.</div>` : PROVIDERS[activeProvider()].keyless ? `<div class="callout" style="margin-top:16px"><strong>Free AI is on (no key).</strong> Your answers are sent to a free public AI service for feedback, so keep confidential employer details out. It is less consistent than a personal key: add a free Gemini or Groq key in <a href="#/settings">Settings</a> for sharper feedback. If the service is down you automatically get offline scoring.</div>` : ""}

    <div class="grid g2" style="margin-top:16px">
      <section class="card" aria-labelledby="today">
        <h2 id="today">Today's session</h2>
        <p class="muted">Aim for about 90 minutes: 30 theory, 30 coding, 15 quiz or mock, 15 reflection.</p>
        <div class="stack">
          <div class="row between"><span><strong>${due}</strong> answered questions are due for review</span><a class="btn primary sm" href="#/practice?mode=due">Review due</a></div>
          <div class="row between"><span><strong>${fresh}</strong> questions you have not tried</span><a class="btn sm" href="#/practice?mode=new">Try new</a></div>
          <div class="row between"><span>Weakest area: <strong>${esc(weak[0]?.name || "-")}</strong></span><a class="btn sm" href="#/practice?cat=${weak[0]?.key || ""}">Drill it</a></div>
          <div class="row between"><span>Coding: JS ${cd.js[0]}/${cd.js[1]}, SQL ${cd.sql[0]}/${cd.sql[1]}, C# ${cd.cs[0]}/${cd.cs[1]}</span><a class="btn sm" href="${nextCoding}">Solve next</a></div>
          <div class="row between"><span>10-question timed quiz</span><a class="btn sm" href="#/quiz">Start quiz</a></div>
          <div class="row between"><span>Simulate a real interview round</span><a class="btn chalk sm" href="#/mock">Start mock</a></div>
        </div>
      </section>

      <section class="card" aria-labelledby="real">
        <h2 id="real">From your real interviews</h2>
        ${s.log.length ? `
          <p class="muted">${s.log.length} interview${s.log.length > 1 ? "s" : ""} logged. Latest: <strong>${esc(s.log[s.log.length - 1].company)}</strong> (${esc(s.log[s.log.length - 1].round || "round")}), ${fmtDate(s.log[s.log.length - 1].date)}.</p>
          ${seenTop.length ? `<p class="small muted" style="margin-bottom:6px">Topics that came up most:</p><div class="chips">${seenTop.map(([c, k]) => `<a class="tag" href="#/practice?cat=${c}">${esc(CATEGORIES[c]?.name || c)} x${k}</a>`).join("")}</div>` : ""}
        ` : `<p class="muted">Nothing logged yet. After every real interview, record the questions asked and the feedback you got. The app turns them into practice and shows which topics keep coming up.</p>`}
        <a class="btn sm" href="#/log" style="margin-top:12px">${s.log.length ? "Open interview log" : "Log your first interview"}</a>
      </section>
    </div>

    <section class="card" style="margin-top:16px" aria-labelledby="cats">
      <div class="row between"><h2 id="cats">Topic readiness (weakest first)</h2><span class="small muted">${n.questions} questions, ${n.mcq} quiz items, ${n.coding} coding tests</span></div>
      <div class="stack">
        ${rows.map(rowHtml).join("")}
      </div>
    </section>
    ${mineRows.length ? `<section class="card" style="margin-top:16px" aria-labelledby="mine">
      <div class="row between"><h2 id="mine">Your imported material</h2><a class="btn sm" href="#/import">Manage</a></div>
      <details><summary class="small" style="cursor:pointer;margin-bottom:10px">${mineRows.length} topics, ${mineRows.reduce((a, r) => a + r.total, 0)} questions</summary><div class="stack">${mineRows.map(rowHtml).join("")}</div></details>
    </section>` : ""}
  `;
}
