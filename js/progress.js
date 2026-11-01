// Motivation layer: streaks, levels, badges, daily challenges and a weekly goal.
// Everything is derived from the saved attempts, so it can never drift out of sync.
import { store, allQuestions } from "./store.js";
import { toast } from "./ui.js";

const dk = (t) => new Date(t).toDateString();
const startOfWeek = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function metrics(s = store.get()) {
  const graded = s.attempts.filter((a) => a.mode !== "self-rated");
  const studiedIds = new Set(graded.map((a) => a.qid));
  Object.keys(s.mcqSeen || {}).forEach((k) => studiedIds.add(k));
  const activity = [
    ...graded.map((a) => a.t), ...s.quizzes.map((q) => q.t), ...(s.mocks || []).map((m) => m.t),
    ...Object.values(s.code).filter((c) => c.t).map((c) => c.t),
    ...Object.values(s.mcqSeen || {}).map((m) => m.t).filter(Boolean),
  ];
  const days = new Set(activity.map(dk));
  let cur = 0; const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { cur++; d.setDate(d.getDate() - 1); }
  let best = 0, run = 0, prev = null;
  for (const t of [...new Set(activity.map((t) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); }))].sort((a, b) => a - b)) {
    run = prev !== null && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = t;
  }
  const sod = startOfDay(), sow = startOfWeek();
  const countSince = (t0) => graded.filter((a) => a.t >= t0).length + s.quizzes.filter((q) => q.t >= t0).reduce((n, q) => n + q.total, 0);
  const solved = Object.values(s.code).filter((c) => c.solved).length;
  const strong = new Set(graded.filter((a) => a.score >= 8).map((a) => a.qid)).size;
  const topics = new Set(graded.map((a) => a.cat)).size;
  const quizCorrect = s.quizzes.reduce((n, q) => n + q.correct, 0);
  const perfect = s.quizzes.some((q) => q.total >= 10 && q.correct === q.total);
  const reads = graded.filter((a) => a.mode === "read").length;
  const xp = (graded.length - reads) * 10 + reads * 4 + quizCorrect * 5 + s.quizzes.length * 20 + solved * 50 + (s.mocks || []).length * 40 + cur * 5;
  return {
    studied: studiedIds.size, total: allQuestions().length, streak: cur, best, today: countSince(sod), week: countSince(sow),
    quizzes: s.quizzes.length, perfect, solved, mocks: (s.mocks || []).length, strong, topics, xp,
    quizToday: s.quizzes.some((q) => q.t >= sod), codeToday: Object.values(s.code).some((c) => c.t >= sod) || (s.mocks || []).some((m) => m.t >= sod),
    days, goal: s.settings.weekly || 30,
  };
}

export function level(xp) {
  const lv = Math.floor(Math.sqrt(xp / 60)) + 1;
  const lo = 60 * (lv - 1) ** 2, hi = 60 * lv ** 2;
  const names = ["Rookie", "Apprentice", "Practitioner", "Contender", "Seasoned", "Senior", "Staff", "Principal", "Architect", "Legend"];
  return { lv, name: names[Math.min(lv - 1, names.length - 1)], lo, hi, pct: Math.round(((xp - lo) / (hi - lo)) * 100) };
}

const tier = (id, ico, name, desc, key, goal) => ({ id, ico, name, desc, prog: (m) => ({ cur: Math.min(m[key], goal), goal }) });
export const BADGES = [
  tier("s1", "🌱", "First step", "Study your first question", "studied", 1),
  tier("s10", "📘", "Warming up", "Study 10 questions", "studied", 10),
  tier("s50", "📚", "Getting serious", "Study 50 questions", "studied", 50),
  tier("s100", "💯", "Century", "Study 100 questions", "studied", 100),
  tier("s250", "🎯", "Sharp shooter", "Study 250 questions", "studied", 250),
  tier("s500", "🏔️", "Half a thousand", "Study 500 questions", "studied", 500),
  tier("s1000", "👑", "Thousand club", "Study 1000 questions", "studied", 1000),
  tier("k3", "🔥", "On a roll", "3-day streak", "best", 3),
  tier("k7", "⚡", "Week warrior", "7-day streak", "best", 7),
  tier("k14", "🚀", "Fortnight focus", "14-day streak", "best", 14),
  tier("k30", "🏆", "Unstoppable", "30-day streak", "best", 30),
  tier("q1", "❓", "Quiz starter", "Finish a quiz", "quizzes", 1),
  tier("q10", "🧠", "Quiz regular", "Finish 10 quizzes", "quizzes", 10),
  { id: "qp", ico: "✨", name: "Flawless", desc: "Score 100% on a quiz of 10 or more", prog: (m) => ({ cur: m.perfect ? 1 : 0, goal: 1 }) },
  tier("c1", "⌘", "First solve", "Complete a coding challenge", "solved", 1),
  tier("c5", "🛠️", "Code craftsman", "Complete 5 coding challenges", "solved", 5),
  tier("c15", "🧩", "Problem crusher", "Complete 15 coding challenges", "solved", 15),
  tier("m1", "🎤", "Mock debut", "Finish a mock interview", "mocks", 1),
  tier("m5", "🎙️", "Interview ready", "Finish 5 mock interviews", "mocks", 5),
  tier("t5", "🧭", "Well rounded", "Practise in 5 different topics", "topics", 5),
  tier("g25", "⭐", "Strong answers", "Score 8+ on 25 different questions", "strong", 25),
];
export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

export function earned(m = metrics()) { return BADGES.filter((b) => { const p = b.prog(m); return p.cur >= p.goal; }); }

// Called after every save: records newly earned badges and celebrates them.
let busy = false;
export function checkBadges() {
  if (busy) return; busy = true;
  try {
    const s = store.get(), m = metrics(s), now = earned(m).filter((b) => !(s.badges || {})[b.id]);
    if (!now.length) return;
    const first = !s.badges;
    store.update((x) => { x.badges ||= {}; for (const b of now) x.badges[b.id] = Date.now(); });
    if (!first) {
      now.slice(0, 2).forEach((b) => toast(`${b.ico} Badge unlocked: ${b.name}`));
      if (now.length > 2) toast(`…and ${now.length - 2} more badges. See Progress & badges.`);
    }
  } finally { busy = false; }
}

export function challenges(m = metrics()) {
  return [
    { t: "Answer 5 questions today", cur: Math.min(m.today, 5), goal: 5 },
    { t: "Finish a quick quiz", cur: m.quizToday ? 1 : 0, goal: 1 },
    { t: "Try a coding test or mock interview", cur: m.codeToday ? 1 : 0, goal: 1 },
  ];
}
export const nextMilestone = (m) => MILESTONES.find((x) => x > m.studied) || null;
