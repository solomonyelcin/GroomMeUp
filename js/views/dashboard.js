import { store, categoryStats, codingStats, overallReadiness, weakTopics, streak, counts, allQuestions, isDue } from "../store.js";
import { aiEnabled } from "../ai.js";
import { CATEGORIES } from "../data/index.js";
import { esc, tape, tapeScale, pct, fmtDate } from "../ui.js";

export function view(root) {
  const s = store.get();
  const overall = overallReadiness();
  const stats = categoryStats();
  const rows = Object.values(stats).sort((a, b) => a.readiness - b.readiness);
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

  root.innerHTML = `
    <header class="page-head">
      <h1>Welcome back${name}.</h1>
      <p>Your goal: a senior role at a good company with a strong package. Readiness blends answer quality, topic coverage, quiz accuracy and coding tests.</p>
    </header>

    <section class="card" aria-labelledby="rd">
      <div class="row between" style="align-items:flex-end">
        <div>
          <h2 id="rd" style="margin-bottom:6px">Interview readiness</h2>
          <div class="big-num">${overall}<small>/ 100</small></div>
        </div>
        <div class="row" style="gap:28px">
          <div class="stat"><b>${streak()}</b><span>day streak</span></div>
          <div class="stat"><b>${s.attempts.length}</b><span>answers graded</span></div>
          <div class="stat"><b>${days === null ? "-" : days < 0 ? "Passed" : days}</b><span>${days === null ? "set a target date" : "days to target"}</span></div>
        </div>
      </div>
      <div style="margin-top:16px">${tape(overall, { label: "Overall readiness" })}${tapeScale()}</div>
    </section>

    ${!aiEnabled() ? `<div class="callout" style="margin-top:16px"><strong>AI feedback is off.</strong> Answers are scored by key-point coverage. For richer feedback on your wording and depth, add a free Gemini, Groq or OpenRouter key in <a href="#/settings">Settings</a> (takes two minutes, costs nothing).</div>` : ""}

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
        ${rows.map((r) => `
          <div>
            <div class="row between small" style="margin-bottom:4px">
              <a href="#/practice?cat=${r.key}" style="color:inherit;font-weight:600;text-decoration:none"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</a>
              <span class="muted">${r.attempted}/${r.total} tried${r.attempted ? `, avg ${(r.acc / 10).toFixed(1)}/10` : ""}${r.mcqAcc !== null ? `, quiz ${pct(r.mcqAcc)}` : ""}</span>
            </div>
            ${tape(r.readiness, { slim: true, label: r.name })}
          </div>`).join("")}
      </div>
    </section>
  `;
}
