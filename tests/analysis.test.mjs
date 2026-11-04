// Analysis numbers. Run with: node tests/analysis.test.mjs (also part of npm test)
import { activityByDay, weeklyScores, interviewStats, marketGap, insights, quizSeries } from "../js/analysis-data.js";
import { MARKET } from "../js/data/market.js";
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log("  FAIL:", m); } };
const now = new Date(2026, 10, 4, 12).getTime(); // 4 Nov 2026
const day = (n, h = 10) => new Date(2026, 10, 4 - n, h).getTime();
const s = {
  attempts: [{ qid: "a", cat: "aspnet", score: 8, t: day(0), mode: "practice" }, { qid: "b", cat: "aspnet", score: 4, t: day(0), mode: "practice" }, { qid: "c", cat: "csharp", score: 9, t: day(1), mode: "read" }, { qid: "d", cat: "csharp", score: 6, t: day(9), mode: "practice" }, { qid: "e", cat: "x", score: 1, t: day(2), mode: "self-rated" }],
  quizzes: [{ t: day(1), total: 10, correct: 7, cats: {} }],
  code: { j1: { t: day(0), solved: true } },
  mocks: [{ t: day(3), avg: 6.5, round: "Technical 1" }],
  log: [{ company: "Acme", round: "Technical 1", date: "2026-10-12", outcome: "Cleared", questions: [{ text: "q1", hard: true }, { text: "q2" }], cats: ["micro", "cloud"] }, { company: "acme", round: "Technical 2", date: "2026-10-20", outcome: "Rejected", questions: [{ text: "q3" }], cats: ["micro"] }, { company: "Beta", round: "HR", date: "2026-11-01", outcome: "Waiting", questions: [], cats: [] }],
};
console.log("Activity");
const act = activityByDay(s, 14, now);
ok(act.length === 14 && act[13].date === "2026-11-04", "14 days ending today");
ok(act[13].practice === 2 && act[13].code === 1 && act[13].total === 3, "today: 2 practice + 1 code");
ok(act[12].read === 1 && act[12].quiz === 10, "yesterday: 1 read + 10 quiz questions");
ok(act.reduce((n, r) => n + r.total, 0) === 3 + 11 + 1, "self-rated attempts are not counted; older attempt counted once");
console.log("Scores");
const w = weeklyScores(s, 4, now);
ok(w.length === 4 && w[3].avg === 6 && w[3].n === 2, "this week's average of 8 and 4 = 6: " + JSON.stringify(w[3]));
ok(w.every((x) => x.avg === null || x.n > 0), "empty weeks are null");
ok(quizSeries(s)[0].pct === 70, "quiz percentage");
console.log("Interviews");
const iv = interviewStats(s);
ok(iv.total === 3 && iv.companies === 2 && iv.questions === 3 && iv.hard === 1, "interview totals");
ok(iv.byOutcome.Cleared === 1 && iv.byOutcome.Rejected === 1 && iv.passRate === 50, "outcomes and pass rate");
ok(iv.byCat.micro === 2 && iv.byMonth.length === 2, "topics asked and months");
console.log("Market gap and insights");
const stats = { aspnet: { key: "aspnet", name: "ASP.NET", readiness: 30, attempted: 2, total: 20, coverage: 10 }, cloud: { key: "cloud", name: "Cloud", readiness: 20, attempted: 0, total: 20, coverage: 0 }, micro: { key: "micro", name: "Micro", readiness: 40, attempted: 3, total: 10, coverage: 30 } };
const gap = marketGap(MARKET, stats);
ok(gap.length === MARKET.demand.length && gap.some((g) => g.cat === "cloud" && g.trend === "rising"), "every demand skill is mapped");
const ins = insights({ s, stats, gap, act, iv, now });
ok(ins.some((i) => i.kind === "focus") && ins.some((i) => /real interviews/.test(i.text)), "insights mention a gap and real interviews: " + ins.map((i) => i.text.slice(0, 30)).join(" | "));
console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
