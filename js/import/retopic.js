// Work out which real topic each question in an odd topic (page header, question, code line) belongs to.
// Uses the connected AI when there is one; otherwise a word-overlap guess plus the neighbouring questions.
import { chat, parseJSON, aiEnabled } from "../ai.js";
import { norm } from "./sheet.js";

const STOP = new Set("the a an of to in on for and or is are was be by with what why how when which who does do can you your it its this that between difference different types type explain describe define use used using from as at not".split(" "));
const words = (t) => (String(t || "").toLowerCase().match(/[a-z][a-z0-9#+.]{1,}/g) || []).filter((w) => !STOP.has(w));

// qs: questions to place [{id, c, q, a, src}], all: every imported question in stored order, topics: [{key, name}] real topics
export async function proposeTopics(qs, all, topics, { onProgress } = {}) {
  const out = new Map(); // id -> { topic, isNew, by }
  let usedAI = false, aiFailed = 0;
  const known = new Map(topics.map((t) => [norm(t.name), t.name]));
  if (aiEnabled() && qs.length) {
    const sys = `You sort interview questions into subjects. You get a list of existing subjects and numbered questions.
For each question, choose the best existing subject. Only if none fits at all, give a short new subject name (1 to 3 words, for example "SQL Server" or "ASP.NET Core").
Reuse the same new name for related questions. Never use page headers, author names or the question text as a subject.
Return ONLY JSON: {"assign":[{"i": number, "topic": string}]}.`;
    const B = 30;
    for (let s = 0; s < qs.length; s += B) {
      onProgress?.(Math.min(s + B, qs.length), qs.length);
      const batch = qs.slice(s, s + B);
      const user = `Existing subjects: ${topics.map((t) => t.name).join("; ") || "(none)"}\n\nQuestions:\n` + batch.map((q, i) => `${i}. ${q.q.slice(0, 200)}${q.a ? " -- " + String(q.a).slice(0, 120) : ""}`).join("\n");
      try {
        const d = parseJSON(await chat(sys, user, { json: true, temperature: 0 }));
        for (const a of d.assign || d.items || []) {
          const q = batch[Number(a.i)], name = String(a.topic || "").replace(/\s+/g, " ").trim().slice(0, 60);
          if (!q || !name) continue;
          const ex = known.get(norm(name));
          out.set(q.id, { topic: ex || name, isNew: !ex, by: "AI" });
        }
        usedAI = true;
      } catch { aiFailed++; }
    }
  }
  // offline fallback for anything still unplaced
  const todo = qs.filter((q) => !out.has(q.id));
  if (todo.length && topics.length) {
    const vocab = topics.map((t) => { const m = new Map(); for (const w of words(t.name)) m.set(w, (m.get(w) || 0) + 4); for (const q of all.filter((x) => x.c === t.key)) for (const w of words(q.q + " " + String(q.a || "").slice(0, 200))) m.set(w, (m.get(w) || 0) + 1); return m; });
    const real = new Set(topics.map((t) => t.key)), byKey = new Map(topics.map((t) => [t.key, t.name]));
    const pos = new Map(all.map((q, i) => [q.id, i]));
    for (const q of todo) {
      const ws = [...new Set(words(q.q + " " + String(q.a || "").slice(0, 200)))];
      let best = -1, bestScore = 0;
      vocab.forEach((m, i) => { let sc = 0; for (const w of ws) sc += Math.min(m.get(w) || 0, 6); if (sc > bestScore) { bestScore = sc; best = i; } });
      if (best >= 0 && bestScore >= 6) { out.set(q.id, { topic: topics[best].name, isNew: false, by: "word match" }); continue; }
      // otherwise the nearest earlier (then later) real topic in the same file
      const i = pos.get(q.id); let hit = null;
      for (let j = i - 1; j >= 0 && !hit; j--) if (all[j].src === q.src && real.has(all[j].c)) hit = all[j].c;
      for (let j = i + 1; j < all.length && !hit; j++) if (all[j].src === q.src && real.has(all[j].c)) hit = all[j].c;
      if (hit) out.set(q.id, { topic: byKey.get(hit), isNew: false, by: "neighbouring questions" });
    }
  }
  return { map: out, usedAI, aiFailed, unplaced: qs.filter((q) => !out.has(q.id)).length };
}
