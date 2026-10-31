// Local-first storage. Everything lives in the browser's localStorage; nothing is sent anywhere
// except the AI calls you explicitly enable in Settings.
import { QUESTIONS, CATEGORIES, MCQ, JS_CHALLENGES, SQL_CHALLENGES, CS_CHALLENGES } from "./data/index.js";

const KEY = "groommeup.v1";
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 16, 35]; // days per Leitner box

const fresh = () => ({
  attempts: [],        // {qid, cat, score, t, mode}
  srs: {},             // qid -> {box, due}
  quizzes: [],         // {t, total, correct, cats:{cat:[correct,total]}}
  code: {},            // challengeId -> {solved, tries, best, code, t}
  log: [],             // real interviews
  custom: [],          // user-added, AI generated and imported questions
  mcqSeen: {},         // quiz question id -> { t, ok } of the last time it was asked
  daily: null,         // { date, ids } frozen set for today
  dailyAI: "",         // date of the last AI refresh
  cats: {},            // topics created by imports: key -> {name, color}
  imports: [],         // {id, name, kind, t}
  mocks: [],           // mock interview reports
  badges: null,        // badge id -> time earned (null until first check, so old progress is not celebrated)
  settings: { provider: "pollinations", aiChoice: false, keys: {}, models: {}, target: "", pistonUrl: "", name: "" },
});

let state = load();
const listeners = new Set();

// Imported topics join the shared CATEGORIES object so every page sees them.
function syncCats() {
  for (const k of Object.keys(CATEGORIES)) if (k.startsWith("u:") && !state.cats[k]) delete CATEGORIES[k];
  for (const [k, v] of Object.entries(state.cats || {})) CATEGORIES[k] = { ...v, mine: true };
}
syncCats();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw);
    const f = fresh();
    const settings = { ...f.settings, ...(parsed.settings || {}) };
    // one-time migration: people who never chose a provider get the free keyless AI
    if (!settings.aiChoice && settings.provider === "offline") settings.provider = "pollinations";
    return { ...f, ...parsed, settings };
  } catch { return fresh(); }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) {
    console.warn("Could not save", e);
    try { dispatchEvent(new CustomEvent("groommeup:save-error", { detail: e })); } catch { /* not in a browser */ }
    return false;
  }
}

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  update(fn) { fn(state); syncCats(); persist(); listeners.forEach((l) => l(state)); },
  exportJSON() { return JSON.stringify({ ...state, settings: { ...state.settings, keys: {} } }, null, 2); },
  importJSON(text) {
    const d = JSON.parse(text);
    if (!d || typeof d !== "object") throw new Error("Not a GroomMeUp export");
    const keep = state.settings;
    state = { ...fresh(), ...d, settings: { ...fresh().settings, ...(d.settings || {}), keys: keep.keys } };
    syncCats(); persist(); listeners.forEach((l) => l(state));
  },
  reset() { state = fresh(); syncCats(); persist(); listeners.forEach((l) => l(state)); },
};

export const allQuestions = () => [...QUESTIONS, ...state.custom];
export const questionById = (id) => allQuestions().find((q) => q.id === id);

// ---------- spaced repetition (Leitner) ----------
export function rateQuestion(qid, score10) {
  store.update((s) => {
    const cur = s.srs[qid] || { box: 0, due: 0 };
    let box = cur.box;
    if (score10 >= 8) box = Math.min(box + 1, INTERVALS.length - 1);
    else if (score10 >= 5) box = Math.max(box, 1);
    else box = 0;
    s.srs[qid] = { box, due: Date.now() + INTERVALS[box] * DAY };
  });
}
export const isDue = (qid) => { const x = state.srs[qid]; return !x || x.due <= Date.now(); };

export function recordAttempt(q, score, mode = "practice") {
  store.update((s) => { s.attempts.push({ qid: q.id, cat: q.c, score, t: Date.now(), mode }); });
  rateQuestion(q.id, score);
}

// ---------- analytics ----------
export function lastScores() {
  const m = new Map();
  for (const a of state.attempts) m.set(a.qid, a);
  return m;
}

export function categoryStats() {
  const last = lastScores();
  const qs = allQuestions();
  const mcqByCat = {};
  for (const quiz of state.quizzes) for (const [c, [ok, tot]] of Object.entries(quiz.cats)) {
    const x = (mcqByCat[c] ||= [0, 0]); x[0] += ok; x[1] += tot;
  }
  const out = {};
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    const inCat = qs.filter((q) => q.c === key);
    const attempted = inCat.filter((q) => last.has(q.id));
    const acc = attempted.length ? attempted.reduce((s, q) => s + last.get(q.id).score, 0) / attempted.length * 10 : 0;
    const coverage = inCat.length ? (attempted.length / inCat.length) * 100 : 0;
    const [mok, mtot] = mcqByCat[key] || [0, 0];
    const mcqAcc = mtot ? (mok / mtot) * 100 : null;
    const parts = [];
    if (attempted.length) parts.push([acc, 0.5]);
    parts.push([coverage, 0.3]);
    if (mcqAcc !== null) parts.push([mcqAcc, 0.2]);
    const wsum = parts.reduce((s, p) => s + p[1], 0);
    const readiness = attempted.length || mtot ? parts.reduce((s, p) => s + p[0] * p[1], 0) / wsum : 0;
    out[key] = { key, mine: !!meta.mine, name: meta.name, color: meta.color, total: inCat.length, attempted: attempted.length, acc, coverage, mcqAcc, readiness };
  }
  return out;
}

export function codingStats() {
  const solved = (list) => list.filter((c) => state.code[c.id]?.solved).length;
  return {
    js: [solved(JS_CHALLENGES), JS_CHALLENGES.length],
    sql: [solved(SQL_CHALLENGES), SQL_CHALLENGES.length],
    cs: [solved(CS_CHALLENGES), CS_CHALLENGES.length],
  };
}

const mean = (xs) => (xs.length ? xs.reduce((s, c) => s + c.readiness, 0) / xs.length : 0);
export function overallReadiness() {
  const all = Object.values(categoryStats());
  const own = all.filter((c) => c.mine), built = all.filter((c) => !c.mine);
  // imported topics count as half of the theory score once they exist, so 16 untouched sheets don't sink it
  const theory = own.length ? (mean(built) + mean(own)) / 2 : mean(built);
  const cd = codingStats();
  const tot = cd.js[1] + cd.sql[1] + cd.cs[1];
  const done = cd.js[0] + cd.sql[0] + cd.cs[0];
  const coding = tot ? (done / tot) * 100 : 0;
  return Math.round(theory * 0.7 + coding * 0.3);
}

export function weakTopics(n = 4) {
  // imported topics only count once you have started them, otherwise untouched sheets always look "weakest"
  return Object.values(categoryStats()).filter((c) => !c.mine || c.attempted > 0).sort((a, b) => a.readiness - b.readiness).slice(0, n);
}

export function streak() {
  const days = new Set(state.attempts.filter((a) => a.mode !== "self-rated").map((a) => new Date(a.t).toDateString()));
  for (const q of state.quizzes) days.add(new Date(q.t).toDateString());
  for (const c of Object.values(state.code)) if (c.t) days.add(new Date(c.t).toDateString());
  let n = 0; const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const counts = () => ({
  questions: allQuestions().length, mcq: MCQ.length,
  coding: JS_CHALLENGES.length + SQL_CHALLENGES.length + CS_CHALLENGES.length,
});

// ---------- imports ----------
const DAYS3 = 3 * DAY;
export function importQuestions({ questions, cats, seeds = [], record, seedConfident = true, update = true }) {
  const res = { added: 0, updated: 0, skipped: 0, seeded: 0 };
  store.update((s) => {
    // importing the same file again replaces its earlier import (fixes questions read badly the first time)
    const incoming = new Set(questions.map((q) => q.id));
    const olds = new Set(s.imports.filter((i) => i.name === record.name && i.id !== record.id).map((i) => i.id));
    if (olds.size) {
      const gone = new Set(s.custom.filter((q) => olds.has(q.src) && !incoming.has(q.id)).map((q) => q.id));
      s.custom = s.custom.filter((q) => !gone.has(q.id));
      s.attempts = s.attempts.filter((a) => !gone.has(a.qid));
      for (const id of gone) delete s.srs[id];
      s.imports = s.imports.filter((i) => !olds.has(i.id));
      res.replaced = gone.size;
    }
    for (const [k, v] of Object.entries(cats)) if (!s.cats[k]) s.cats[k] = v;
    const index = new Map(s.custom.map((q, i) => [q.id, i]));
    const seedSet = new Set(seedConfident ? seeds : []);
    const attempted = new Set(s.attempts.map((a) => a.qid));
    for (const q of questions) {
      if (index.has(q.id)) {
        if (update) { s.custom[index.get(q.id)] = q; res.updated++; } else { res.skipped++; continue; }
      } else { s.custom.push(q); index.set(q.id, s.custom.length - 1); res.added++; }
      if (seedSet.has(q.id) && !attempted.has(q.id)) {
        s.attempts.push({ qid: q.id, cat: q.c, score: 8, t: Date.now(), mode: "self-rated" });
        s.srs[q.id] = { box: 2, due: Date.now() + DAYS3 };
        res.seeded++;
      }
    }
    s.imports.push({ id: record.id, name: record.name, kind: record.kind, t: Date.now() });
    // a re-import takes ownership of its questions, so drop import records that own nothing now
    const owned = new Set(s.custom.map((q) => q.src));
    s.imports = s.imports.filter((i) => owned.has(i.id));
  });
  return res;
}

// imported questions that are really multiple-choice but were read as plain text by an older import
export const isBrokenMcq = (q) => !!q.imported && !q.o && /(^|\s)A\)\s.+\sB\)\s.+\sC\)\s/s.test(q.a || "");
export function removeBroken() {
  let n = 0;
  store.update((s) => {
    const gone = new Set(s.custom.filter(isBrokenMcq).map((q) => q.id)); n = gone.size;
    s.custom = s.custom.filter((q) => !gone.has(q.id));
    s.attempts = s.attempts.filter((a) => !gone.has(a.qid));
    for (const id of gone) delete s.srs[id];
  });
  return n;
}

export function removeImport(id) {
  let removed = 0;
  store.update((s) => {
    const gone = new Set(s.custom.filter((q) => q.src === id).map((q) => q.id));
    removed = gone.size;
    s.custom = s.custom.filter((q) => !gone.has(q.id));
    s.attempts = s.attempts.filter((a) => !gone.has(a.qid));
    for (const q of gone) delete s.srs[q];
    s.imports = s.imports.filter((i) => i.id !== id);
    const live = new Set(s.custom.map((q) => q.c));
    for (const k of Object.keys(s.cats)) if (!live.has(k)) delete s.cats[k];
  });
  return removed;
}

export const importedQuestions = () => state.custom.filter((q) => q.imported);

export function noteMcq(id, ok) {
  store.update((st) => { (st.mcqSeen ||= {})[id] = { t: Date.now(), ok: !!ok }; });
}
