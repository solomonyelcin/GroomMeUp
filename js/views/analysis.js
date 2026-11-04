import { store, categoryStats, codingStats, overallReadiness } from "../store.js";
import { metrics, level } from "../progress.js";
import { MARKET } from "../data/market.js";
import { activityByDay, weeklyScores, quizSeries, mockSeries, interviewStats, marketGap, insights } from "../analysis-data.js";
import { barsV, lineChart, hbars, segmented, scatter, wireTips } from "../charts.js";
import { esc, fmtDate, $, $$ } from "../ui.js";

const RANGES = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];
const isDark = () => { const m = /\d+/g, c = (getComputedStyle(document.body).backgroundColor.match(m) || [255, 255, 255]).map(Number); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) < 128; };
const tbl = (head, rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const table = (title, head, rows) => `<details class="viz-table"><summary>${esc(title)}</summary>${tbl(head, rows)}</details>`;
const empty = (t, href, cta) => `<p class="muted" style="margin:6px 0">${esc(t)} ${href ? `<a href="${href}">${esc(cta)}</a>` : ""}</p>`;

export function view(root) {
  let days = 30;
  let off = () => {};
  const draw = () => {
    off();
    const s = store.get(), stats = categoryStats(), m = metrics(s), lv = level(m.xp), cd = codingStats();
    const act = activityByDay(s, days), tot = (k) => act.reduce((n, r) => n + r[k], 0), allActs = tot("total");
    const weeks = days <= 7 ? 4 : days <= 30 ? 6 : 13, ws = weeklyScores(s, weeks), scored = ws.filter((w) => w.n);
    const qs = quizSeries(s), ms = mockSeries(s), iv = interviewStats(s), gap = marketGap(MARKET, stats);
    const ins = insights({ s, stats, gap, act, iv });
    const rangeAttempts = s.attempts.filter((a) => a.mode !== "read" && a.mode !== "self-rated" && a.t >= act[0].t);
    const avgScore = rangeAttempts.length ? Math.round((rangeAttempts.reduce((n, a) => n + a.score, 0) / rangeAttempts.length) * 10) / 10 : null;
    const quizAll = s.quizzes.reduce((n, q) => [n[0] + q.correct, n[1] + q.total], [0, 0]);
    const topics = Object.values(stats).filter((c) => !c.mine || c.attempted > 0).sort((a, b) => b.readiness - a.readiness);
    const weak = [...topics].sort((a, b) => a.readiness - b.readiness).slice(0, 5);
    const tile = (n, l, sub) => `<div class="viz-tile"><div class="viz-n">${n}</div><div class="viz-l">${esc(l)}</div>${sub ? `<div class="small muted">${esc(sub)}</div>` : ""}</div>`;
    const every = days <= 7 ? 1 : days <= 30 ? 3 : 10;
    root.innerHTML = `
      <header class="page-head"><h1>Analysis</h1><p>How your preparation is going: what you practise, where you are strong or weak, what happens in real interviews, and how your skills line up with what employers ask for. Everything is calculated on this device from your own activity.</p></header>
      <div class="row between viz-bar"><nav class="viz-jump small" aria-label="Sections"><a href="#v-learn">Learning</a><a href="#v-skills">Skills</a><a href="#v-int">Interviews</a><a href="#v-market">Market</a></nav>
        <div class="seg" role="group" aria-label="Time range">${RANGES.map(([d, l]) => `<button data-days="${d}" aria-pressed="${d === days}">${l}</button>`).join("")}</div></div>
      <div class="viz-root" id="viz">
        <section class="card" aria-labelledby="v-ins"><h2 id="v-ins">What to do next</h2><ul class="viz-ins">${ins.slice(0, 6).map((i) => `<li class="k-${i.kind}"><span aria-hidden="true">${{ warn: "⚠", focus: "◎", trend: "↗", good: "✓", info: "i" }[i.kind]}</span><span>${esc(i.text)}${i.cat ? ` <a href="#/bank?cat=${encodeURIComponent(i.cat)}">Open questions</a>` : ""}</span></li>`).join("")}</ul></section>

        <div class="viz-tiles">${tile(overallReadiness() + "%", "Interview readiness", "all topics and coding")}${tile(`${m.studied}`, "Questions studied", `of ${m.total}`)}${tile(`${m.streak}`, "Day streak", `best ${m.best}`)}${tile(avgScore === null ? "–" : avgScore + "/10", "Average answer score", `last ${days} days`)}${tile(quizAll[1] ? Math.round((quizAll[0] / quizAll[1]) * 100) + "%" : "–", "Quiz accuracy", `${quizAll[1]} questions`)}${tile(`Lv ${lv.lv}`, lv.name, `${m.xp} XP`)}</div>

        <section class="card" id="v-learn" aria-labelledby="h-act"><h2 id="h-act">Learning activity</h2>
          <p class="small muted" style="margin-top:0">Questions answered per day (practice, read-and-mark, quiz and coding). ${allActs} in the last ${days} days.</p>
          ${allActs ? barsV(act.map((r) => ({ label: r.label, value: r.total, tip: `${r.label}: ${r.total} (${r.practice} practised, ${r.read} read, ${r.quiz} quiz, ${r.code} coding)` })), { labelEvery: every }) : empty("No activity in this period yet.", "#/practice", "Start practising")}
          ${segmented([{ label: "Practised in your own words", value: tot("practice"), color: "var(--v1)" }, { label: "Quiz questions", value: tot("quiz"), color: "var(--v2)" }, { label: "Read and marked", value: tot("read") + tot("code"), color: "var(--v3)" }])}
          ${table("View as table", ["Day", "Practised", "Read", "Quiz", "Coding"], act.filter((r) => r.total).reverse().map((r) => [r.label, r.practice, r.read, r.quiz, r.code]))}
        </section>

        <div class="grid g2">
          <section class="card" aria-labelledby="h-sc"><h2 id="h-sc">Answer quality over time</h2><p class="small muted" style="margin-top:0">Average score of your written answers per week (out of 10).</p>
            ${scored.length ? lineChart(ws.map((w) => ({ label: w.label, value: w.avg, tip: w.n ? `Week of ${w.label}: ${w.avg}/10 from ${w.n} answers` : `Week of ${w.label}: no answers` })), { w: 420, h: 200, min: 0, max: 10, labelEvery: weeks > 8 ? 2 : 1 }) : empty("Answer a few questions in Practise to see your trend.", "#/practice", "Practise now")}
            ${scored.length >= 2 ? `<p class="small" style="margin-bottom:0">${(() => { const dlt = Math.round((scored[scored.length - 1].avg - scored[0].avg) * 10) / 10; return dlt === 0 ? `No change since ${scored[0].label}.` : `${dlt > 0 ? "Up" : "Down"} ${Math.abs(dlt)} points since ${scored[0].label}.`; })()}</p>` : ""}</section>
          <section class="card" aria-labelledby="h-qz"><h2 id="h-qz">Quiz accuracy</h2><p class="small muted" style="margin-top:0">Share of correct answers in each quiz.</p>
            ${qs.length ? lineChart(qs.slice(-12).map((q) => ({ label: q.label, value: q.pct, tip: `${q.label}: ${q.pct}% of ${q.total}` })), { w: 420, h: 200, min: 0, max: 100, unit: "%", labelEvery: Math.ceil(Math.min(12, qs.length) / 4) }) : empty("Take a quick quiz to see how you do.", "#/quiz", "Start a quiz")}</section>
        </div>

        <section class="card" id="v-skills" aria-labelledby="h-sk"><h2 id="h-sk">Skills by topic</h2>
          <p class="small muted" style="margin-top:0">Readiness blends answer scores, how many questions you have seen and quiz accuracy. Topics you have not started are shown at 0.</p>
          ${hbars(topics.slice(0, 16).map((c) => ({ label: c.name, sub: `${c.attempted}/${c.total} seen`, value: Math.round(c.readiness), text: Math.round(c.readiness) + "%", tip: `${c.name}: readiness ${Math.round(c.readiness)}%, ${c.attempted} of ${c.total} questions seen, average score ${c.attempted ? (c.acc / 10).toFixed(1) : "–"}/10`, href: `#/bank?cat=${encodeURIComponent(c.key)}` })))}
          ${topics.length > 16 ? `<p class="small muted">Showing the 16 strongest of ${topics.length} topics. The table has them all.</p>` : ""}
          <h3 style="margin:16px 0 6px">Needs the most work</h3>${hbars(weak.map((c) => ({ label: c.name, value: Math.round(c.readiness), text: Math.round(c.readiness) + "%", href: `#/practice?cat=${encodeURIComponent(c.key)}`, color: "var(--v2)" })))}
          <h3 style="margin:16px 0 6px">Coding challenges solved</h3>${hbars([["JavaScript", cd.js], ["SQL", cd.sql], ["C#", cd.cs]].map(([l, [a, b]]) => ({ label: l, value: a, max: b || 1, text: `${a}/${b}`, color: "var(--v3)" })))}
          ${table("View all topics as a table", ["Topic", "Readiness", "Seen", "Total", "Avg score /10", "Quiz accuracy"], topics.map((c) => [c.name, Math.round(c.readiness) + "%", c.attempted, c.total, c.attempted ? (c.acc / 10).toFixed(1) : "–", c.mcqAcc === null ? "–" : Math.round(c.mcqAcc) + "%"]))}
        </section>

        <section class="card" id="v-int" aria-labelledby="h-iv"><h2 id="h-iv">Real interviews and mock rounds</h2>
          ${iv.total ? `<div class="viz-tiles small-tiles">${tile(iv.total, "Interviews logged", `${iv.companies} companies`)}${tile(iv.passRate === null ? "–" : iv.passRate + "%", "Moved forward", "of decided rounds")}${tile(iv.questions, "Questions remembered", `${iv.hard} marked hard`)}</div>
            <div class="grid g2" style="margin-top:12px"><div><h3 style="margin:0 0 6px">Outcomes</h3>${hbars(Object.entries(iv.byOutcome).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: n, max: iv.total, text: String(n) })))}</div>
              <div><h3 style="margin:0 0 6px">Rounds attended</h3>${hbars(Object.entries(iv.byRound).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => ({ label: k, value: n, max: iv.total, text: String(n), color: "var(--v3)" })))}</div></div>
            ${iv.byMonth.length > 1 ? `<h3 style="margin:16px 0 6px">Interviews per month</h3>${barsV(iv.byMonth.map((x) => ({ label: x.label, value: x.n, tip: `${x.label}: ${x.n} interview${x.n === 1 ? "" : "s"}` })), { h: 150 })}` : ""}
            <h3 style="margin:16px 0 6px">Topics that actually came up, and your readiness in them</h3>
            ${Object.keys(iv.byCat).length ? hbars(Object.entries(iv.byCat).filter(([c]) => stats[c]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => ({ label: stats[c].name, sub: `asked in ${n}`, value: Math.round(stats[c].readiness), text: Math.round(stats[c].readiness) + "%", tip: `${stats[c].name}: asked in ${n} interviews, your readiness ${Math.round(stats[c].readiness)}%`, href: `#/bank?cat=${c}`, color: stats[c].readiness < 50 ? "var(--v2)" : "var(--v1)" }))) : empty("Topics are tagged when you log questions.")}
            <p class="small muted">Orange bars are topics that came up in your interviews where your readiness is below 50%.</p>`
          : empty("You have not logged a real interview yet. Logging each round shows which topics really come up and how your results trend.", "#/log", "Log an interview")}
          <h3 style="margin:16px 0 6px">Mock interviews</h3>
          ${ms.length ? lineChart(ms.slice(-12).map((x) => ({ label: x.label, value: x.avg, tip: `${x.label} (${x.round}): ${x.avg}/10` })), { min: 0, max: 10, h: 170, labelEvery: Math.ceil(Math.min(12, ms.length) / 6) }) + `<p class="small muted" style="margin-bottom:0">${ms.length} mock round${ms.length === 1 ? "" : "s"}; latest ${ms[ms.length - 1].avg}/10.</p>` : empty("Run a mock interview to see your score trend.", "#/mock", "Start a mock round")}
        </section>

        <section class="card" id="v-market" aria-labelledby="h-mk"><h2 id="h-mk">Market needs against your skills</h2>
          <p class="small muted" style="margin-top:0">Employer demand for senior .NET full stack roles (from the research in <a href="#/market">Market &amp; resume</a>, updated ${esc(fmtDate(MARKET.updated))}) against your readiness. Topics in the top-left corner are in high demand and still weak.</p>
          ${scatter(gap.filter((g) => g.readiness !== null).map((g) => ({ x: g.readiness, y: g.weight, label: (g.trend === "rising" ? "▲ " : "") + g.skill.split(/[+(/,]/)[0].trim().slice(0, 24), tip: `${g.skill}: demand ${g.weight}/5, ${g.trend === "rising" ? "rising, " : ""}your readiness ${g.readiness}%` })))}
          <p class="small muted" style="margin:4px 0 12px">▲ marks skills whose demand is rising in 2026.</p>
          ${tbl(["Skill employers ask for", "Demand", "Trend", "Your readiness", ""], [...gap].sort((a, b) => b.weight - a.weight || (a.readiness ?? 0) - (b.readiness ?? 0)).map((g) => [g.skill, `${g.weight}/5`, g.trend === "rising" ? "▲ rising" : "steady", g.readiness === null ? "–" : g.readiness + "%", g.cat ? "Practise" : ""]))}
          <p class="small" style="margin:10px 0 0">Hiring is concentrated in ${MARKET.hiringCities.map(esc).join(", ")}. <a href="#/market">Salary, interview rounds and resume checks</a></p>
        </section>
      </div>`;
    const viz = $("#viz");
    viz.classList.toggle("viz-dark", isDark());
    off = wireTips(viz);
    $$("[data-days]", root).forEach((b) => (b.onclick = () => { days = +b.dataset.days; draw(); }));
    // the last table column links to practice for that topic
    $$("#v-market tbody tr", root).forEach((tr, i) => { const g = [...gap].sort((a, b) => b.weight - a.weight || (a.readiness ?? 0) - (b.readiness ?? 0))[i]; const td = tr.lastElementChild; if (g && g.cat) td.innerHTML = `<a class="btn sm" href="#/practice?cat=${g.cat}">Practise</a>`; });
  };
  draw();
  return () => off();
}
