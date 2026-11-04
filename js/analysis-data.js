// Numbers behind the Analysis page. Pure functions over the saved state, so they are easy to test.
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]}`; };

// Which market-demand skill maps to which topic, and whether it is rising (a reading of the notes in MARKET).
export const DEMAND_MAP = [
  { match: /asp\.net|web api|c#/i, cat: "aspnet", trend: "steady" },
  { match: /angular|react/i, cat: "angular", trend: "steady" },
  { match: /sql server/i, cat: "efsql", trend: "steady" },
  { match: /azure|docker|kubernetes/i, cat: "cloud", trend: "rising" },
  { match: /microservices/i, cat: "micro", trend: "steady" },
  { match: /system design/i, cat: "design", trend: "steady" },
  { match: /snowflake/i, cat: "snowflake", trend: "rising" },
  { match: /ai-assisted|llm/i, cat: "ai", trend: "rising" },
  { match: /security|oidc/i, cat: "aspnet", trend: "rising" },
];

// Questions answered per day for the last `days` days, split by kind.
export function activityByDay(s, days, now = Date.now()) {
  const t0 = startOfDay(now) - (days - 1) * 864e5;
  const rows = [];
  const idx = new Map();
  for (let i = 0; i < days; i++) { const t = t0 + i * 864e5; const r = { t, date: dayKey(t), label: shortDate(t), practice: 0, read: 0, quiz: 0, code: 0, total: 0 }; rows.push(r); idx.set(r.date, r); }
  for (const a of s.attempts || []) { if (a.mode === "self-rated") continue; const r = idx.get(dayKey(a.t)); if (!r) continue; if (a.mode === "read") r.read++; else r.practice++; }
  for (const q of s.quizzes || []) { const r = idx.get(dayKey(q.t)); if (r) r.quiz += q.total; }
  for (const c of Object.values(s.code || {})) { if (!c.t) continue; const r = idx.get(dayKey(c.t)); if (r) r.code++; }
  for (const r of rows) r.total = r.practice + r.read + r.quiz + r.code;
  return rows;
}

// Average practice score (out of 10) per week, newest week last. Weeks with no answers have avg null.
export function weeklyScores(s, weeks, now = Date.now()) {
  const sow = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) { const a = sow - i * 7 * 864e5; out.push({ t: a, label: shortDate(a), sum: 0, n: 0, avg: null }); }
  for (const a of s.attempts || []) {
    if (a.mode === "read" || a.mode === "self-rated") continue;
    const w = out.find((x) => a.t >= x.t && a.t < x.t + 7 * 864e5); if (!w) continue; w.sum += a.score; w.n++;
  }
  for (const w of out) w.avg = w.n ? Math.round((w.sum / w.n) * 10) / 10 : null;
  return out;
}

export const quizSeries = (s) => [...(s.quizzes || [])].sort((a, b) => a.t - b.t).map((q) => ({ t: q.t, label: shortDate(q.t), pct: q.total ? Math.round((q.correct / q.total) * 100) : 0, total: q.total }));
export const mockSeries = (s) => [...(s.mocks || [])].sort((a, b) => a.t - b.t).map((m) => ({ t: m.t, label: shortDate(m.t), avg: m.avg, round: m.round }));

// Real interviews from the log.
export function interviewStats(s) {
  const log = s.log || [];
  const byOutcome = {}, byRound = {}, byCat = {}, month = new Map();
  let questions = 0, hard = 0;
  for (const e of log) {
    byOutcome[e.outcome || "Waiting"] = (byOutcome[e.outcome || "Waiting"] || 0) + 1;
    if (e.round) byRound[e.round] = (byRound[e.round] || 0) + 1;
    for (const c of e.cats || []) byCat[c] = (byCat[c] || 0) + 1;
    const n = (e.questions || []).length; questions += n; hard += (e.questions || []).filter((q) => q.hard).length;
    const m = (e.date || "").slice(0, 7); if (m) month.set(m, (month.get(m) || 0) + 1);
  }
  const byMonth = [...month].sort().map(([k, n]) => ({ key: k, label: MON[+k.slice(5, 7) - 1] + " " + k.slice(0, 4), n }));
  const companies = new Set(log.map((e) => (e.company || "").trim().toLowerCase()).filter(Boolean)).size;
  const decided = (byOutcome.Cleared || 0) + (byOutcome.Offer || 0) + (byOutcome.Rejected || 0);
  const passRate = decided ? Math.round((((byOutcome.Cleared || 0) + (byOutcome.Offer || 0)) / decided) * 100) : null;
  return { total: log.length, byOutcome, byRound, byCat, byMonth, questions, hard, companies, passRate };
}

// Market demand against your readiness, per demand skill.
export function marketGap(market, stats) {
  return market.demand.map((d) => {
    const m = DEMAND_MAP.find((x) => x.match.test(d.skill)) || {};
    const st = m.cat ? stats[m.cat] : null;
    return { skill: d.skill, weight: d.weight, cat: m.cat || null, trend: m.trend || "steady", readiness: st ? Math.round(st.readiness) : null, name: st ? st.name : null };
  });
}

// Plain-language findings, most useful first.
export function insights({ s, stats, gap, act, iv, now = Date.now() }) {
  const out = [];
  const lastActive = [...act].reverse().find((r) => r.total > 0);
  const total = act.reduce((n, r) => n + r.total, 0);
  if (!total) out.push({ kind: "warn", text: "No practice recorded in this period. Even 10 minutes a day beats a long session once a week." });
  else if (lastActive && now - lastActive.t > 2 * 864e5) out.push({ kind: "warn", text: `Your last practice was on ${lastActive.label}. A short session today keeps the streak and your recall fresh.` });
  const hot = gap.filter((g) => g.readiness !== null && g.weight >= 4).sort((a, b) => a.readiness - b.readiness)[0];
  if (hot && hot.readiness < 60) out.push({ kind: "focus", text: `Biggest gap: "${hot.skill}" is in high demand (${hot.weight}/5) but your readiness in ${hot.name} is ${hot.readiness}%. Start there.`, cat: hot.cat });
  const rising = gap.filter((g) => g.trend === "rising" && g.readiness !== null && g.readiness < 50)[0];
  if (rising) out.push({ kind: "trend", text: `Rising demand: ${rising.skill}. You are at ${rising.readiness}% in ${rising.name}, so building it now puts you ahead.`, cat: rising.cat });
  const strong = Object.values(stats).filter((c) => c.attempted >= 3 && c.readiness >= 75).sort((a, b) => b.readiness - a.readiness)[0];
  if (strong) out.push({ kind: "good", text: `Strongest area: ${strong.name} (${Math.round(strong.readiness)}%). Use it for your opening stories in interviews.` });
  const uncovered = Object.values(stats).filter((c) => !c.mine && c.total >= 5 && c.coverage < 25).sort((a, b) => a.coverage - b.coverage)[0];
  if (uncovered) out.push({ kind: "focus", text: `You have barely started ${uncovered.name} (${Math.round(uncovered.coverage)}% of its questions seen).`, cat: uncovered.key });
  if (iv.total) {
    const askedWeak = Object.entries(iv.byCat).filter(([c]) => stats[c] && stats[c].readiness < 50).sort((a, b) => b[1] - a[1])[0];
    if (askedWeak) out.push({ kind: "focus", text: `${stats[askedWeak[0]].name} came up in ${askedWeak[1]} of your real interviews and your readiness there is ${Math.round(stats[askedWeak[0]].readiness)}%.`, cat: askedWeak[0] });
    if (iv.passRate !== null) out.push({ kind: "info", text: `${iv.passRate}% of your decided interviews moved forward (${iv.total} logged, ${iv.questions} questions remembered).` });
  } else out.push({ kind: "info", text: "Log your real interviews after each round. The Analysis page will then show which topics actually come up for you." });
  return out;
}
