// Turn parsed items into app questions: stable ids, categories, key points for scoring, and quiz questions.
import { norm } from "./sheet.js";

export const hash32 = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
export const slug = (s) => norm(s).replace(/\s+/g, "-").slice(0, 40) || "topic";
export const catKey = (topic) => "u:" + slug(topic);

const STOP = new Set(("about above after again against also always among and any are because been before being between both but can could did does doing done during each either else even every for from further had has have having here how however into its itself just like made make many may might more most much must needs not now off once only other our out over own same should since some such than that the their them then there these they this those through thus too under until upon use used uses using very was were what when where whether which while who whom why will with within without would you your yours it is be as at by in of on or to an a if so do no we he she his her one two use usually typically generally mainly means mean called known allows allow help helps helping often example examples").split(/\s+/));
const TOKEN = /[A-Za-z][A-Za-z0-9+#._-]*[A-Za-z0-9+#]|[A-Za-z]{2,}/g;
const stem = (w) => { w = w.toLowerCase(); if (w.length <= 7) return w; const s = w.replace(/(ations?|ation|ments?|ness|ings?|ing|ed|es|s|ly)$/, ""); return s.length >= 5 ? s : w; };

function tokens(text) {
  const out = [];
  for (const m of text.matchAll(TOKEN)) {
    const w = m[0]; const lw = w.toLowerCase();
    const acronym = /^[A-Z]{2,6}$/.test(w) || /[#+]/.test(w) || /^\.[A-Za-z]/.test(w);
    if (STOP.has(lw)) continue;
    if (!acronym && lw.length < 4) continue;
    out.push(stem(lw));
  }
  return out;
}

export function docFreq(answers) {
  const df = new Map();
  for (const a of answers) for (const t of new Set(tokens(a))) df.set(t, (df.get(t) || 0) + 1);
  return df;
}

function pieces(answer) {
  let parts = answer.split(/(?<=[.!?])\s+|\n+|;\s+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 3);
  if (parts.length < 3) {
    const more = [];
    for (const p of parts.length ? parts : [answer]) more.push(...p.split(/[,:]\s+|\s+(?:and|or|but|while|whereas|because)\s+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 3));
    if (more.length > parts.length) parts = more;
  }
  if (parts.length > 5) { // merge the tail so no content is lost but we keep 5 scoring points
    const head = parts.slice(0, 4); head.push(parts.slice(4).join(" ")); parts = head;
  }
  return parts.length ? parts : [answer];
}

export function deriveKeyPoints(answer, df, total = 1) {
  const kps = []; const used = new Set();
  for (const p of pieces(answer)) {
    const ranked = [...new Set(tokens(p))].filter((t) => !used.has(t))
      .map((t) => [t, ((df && df.get(t)) || 1) / total, t.length])
      .sort((a, b) => a[1] - b[1] || b[2] - a[2]);
    const kws = ranked.slice(0, 3).map((x) => x[0]);
    if (!kws.length) continue;
    kws.forEach((k) => used.add(k));
    const words = p.split(/\s+/);
    kps.push([words.slice(0, 9).join(" ") + (words.length > 9 ? "…" : ""), ...kws]);
  }
  if (!kps.length) kps.push([answer.split(/\s+/).slice(0, 9).join(" "), ...tokens(answer).slice(0, 3)]);
  return kps;
}

const SEEN = /^(confident|done|learned|learnt|mastered|complete[d]?|known|strong|ready|yes)$/i;
export const isConfident = (s) => SEEN.test(String(s || "").trim());

const diffOf = (it) => /senior|architect|advanced|complex|performance|scenario/i.test(`${it.sub} ${it.topic}`) || it.kind === "scenario" ? 3 : /basic|intro|fundamental|beginner/i.test(`${it.sub} ${it.topic}`) ? 1 : 2;

// existingCats: current state.cats, used to keep colours stable and add new topics.
export function buildQuestions(items, { importId, existingCats = {} } = {}) {
  const df = docFreq(items.map((i) => i.a));
  const cats = { ...existingCats };
  const newCats = {};
  const questions = [], seeds = [];
  for (const it of items) {
    const key = catKey(it.topic);
    if (!cats[key]) { const idx = Object.keys(cats).length; cats[key] = newCats[key] = { name: it.topic, color: `hsl(${(idx * 47 + 12) % 360} 58% 42%)` }; }
    const id = "w" + hash32(norm(it.topic) + "|" + norm(it.q));
    questions.push({ id, c: key, d: diffOf(it), q: it.q, a: it.a, kp: deriveKeyPoints(it.a, df, items.length), f: [], imported: true, src: importId, sub: it.sub || "", kind: it.kind });
    if (isConfident(it.status)) seeds.push(id);
  }
  return { questions, cats, newCats, seeds };
}

// ---------- quiz questions made from your own Q&A ----------
const sentences = (a) => a.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9(])/);
export function optionText(a, max = 150) {
  const ss = sentences(a); let t = ss[0];
  if (t.length < 45 && ss[1]) t += " " + ss[1];
  if (t.length > max) { t = t.slice(0, max); t = t.slice(0, Math.max(t.lastIndexOf(" "), 40)).replace(/[,;:\s]+$/, "") + "…"; }
  return t;
}
const jacc = (a, b) => { const A = new Set(tokens(a)), B = new Set(tokens(b)); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

export function makeMcqs(questions, { count = 20, rand = Math.random, cats = null } = {}) {
  const pool = questions.filter((q) => q.a && q.a.length >= 30 && (!cats || cats.has(q.c)));
  const all = questions.filter((q) => q.a && q.a.length >= 30);
  const order = [...pool].sort(() => rand() - 0.5);
  const out = [];
  for (const q of order) {
    if (out.length >= count) break;
    const correct = optionText(q.a);
    const cands = all.filter((o) => o.id !== q.id).map((o) => ({ o, t: optionText(o.a) }))
      .filter((x) => norm(x.t) !== norm(correct) && jacc(x.t, correct) < 0.5);
    const score = (x) => (x.o.c === q.c ? 0 : 100) + (x.o.sub && x.o.sub === q.sub ? 0 : 12) + Math.abs(x.t.length - correct.length) / 3 + rand() * 6;
    const picked = [];
    for (const x of cands.sort((a, b) => score(a) - score(b))) {
      if (picked.length >= 3) break;
      if (picked.some((p) => jacc(p.t, x.t) >= 0.5 || norm(p.t) === norm(x.t))) continue;
      picked.push(x);
    }
    if (picked.length < 3) continue;
    const opts = [{ t: correct, ok: true }, ...picked.map((p) => ({ t: p.t, ok: false }))].sort(() => rand() - 0.5);
    out.push({ id: "m:" + q.id, c: q.c, q: q.q, o: opts.map((x) => x.t), a: opts.findIndex((x) => x.ok), e: q.a, imported: true });
  }
  return out;
}
