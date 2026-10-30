// "Today's 5": a fresh set every day, chosen from what is due, weak or new, and frozen for the day.
import { store, allQuestions, lastScores, isDue } from "./store.js";
import { CATEGORIES, MARKET } from "./data/index.js";
import { generateQuestions } from "./ai.js";

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rng(seed) { // mulberry32
  let a = 0; for (const ch of seed) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function pickDaily(day, n = 5, qs = allQuestions(), last = lastScores()) {
  const rand = rng("groommeup" + day);
  const prio = (q) => { const l = last.get(q.id); return !l ? 2 : l.score < 6 ? 1 : isDue(q.id) ? 0 : 3; };
  const ranked = qs.filter((q) => !q.daily || q.daily === day).map((q) => ({ q, k: prio(q) + rand() * 1.4 })).sort((a, b) => a.k - b.k);
  const out = [], per = {};
  for (const { q } of ranked) { if ((per[q.c] || 0) >= 2) continue; per[q.c] = (per[q.c] || 0) + 1; out.push(q.id); if (out.length >= n) break; }
  return out;
}

// returns the frozen set for today, creating it on first call
export function todaySet() {
  const day = todayKey(), s = store.get();
  const have = s.daily && s.daily.date === day ? s.daily.ids.filter((id) => allQuestions().some((q) => q.id === id)) : null;
  if (have && have.length) return { day, ids: have };
  const ids = pickDaily(day);
  store.update((st) => { st.daily = { date: day, ids }; });
  return { day, ids };
}

export function dailyProgress(ids) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const done = new Set(store.get().attempts.filter((a) => a.t >= start.getTime() && ids.includes(a.qid)).map((a) => a.qid));
  return { done, n: done.size };
}

// five fresh AI-written questions, once a day, on a topic that rotates through your weakest areas and the market's most-wanted skills
export function freshTopic(day) {
  const idx = [...day].reduce((s, c) => s + c.charCodeAt(0), 0);
  const skills = MARKET.demand.map((d) => d.skill);
  const weak = Object.values(CATEGORIES).filter((c) => !c.mine).map((c) => c.name);
  const pool = [...skills, ...weak];
  return pool[idx % pool.length];
}
export const freshAvailable = () => store.get().dailyAI !== todayKey();

export async function addFreshAI(n = 5) {
  const day = todayKey(), topic = freshTopic(day);
  const qs = (await generateQuestions(topic, n, "senior")).map((q) => ({ ...q, daily: day }));
  if (!qs.length) throw new Error("The AI returned no usable questions. Try again in a minute.");
  store.update((s) => {
    s.custom.push(...qs);
    s.dailyAI = day;
    const cur = s.daily && s.daily.date === day ? s.daily.ids : [];
    s.daily = { date: day, ids: [...cur, ...qs.map((q) => q.id)] };
    s.custom = s.custom.filter((q) => !q.daily || q.daily === day || s.attempts.some((a) => a.qid === q.id)); // drop unanswered fresh ones from earlier days
  });
  return { topic, count: qs.length };
}
