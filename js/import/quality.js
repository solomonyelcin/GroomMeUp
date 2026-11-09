// Spot extracted items that are probably wrong, so the person can review them before importing.
import { norm } from "./sheet.js";
const INTERROG = /^(what|why|how|when|where|which|who|explain|describe|define|differentiate|difference|compare|list|write|can|is|are|do|does|did|should|would|name|state|give|discuss|design|implement|create|tell|walk|suppose)\b/i;

export function flag(it) {
  const q = it.q || "";
  if (q.length < 12) return "question is very short";
  if (q.length > 500) return "question is very long";
  if (it.o) {
    if (it.o.length < 3) return "fewer than 3 options";
    if (new Set(it.o.map(norm)).size < it.o.length) return "two options are identical";
    return "";
  }
  const a = it.a || "";
  if (!/\?\s*["')]*$/.test(q) && !INTERROG.test(q)) return "does not look like a question";
  if (a.length < 20) return "answer is very short";
  if (/\?\s*$/.test(a) && a.length < 200) return "answer looks like another question";
  if (a.length < 160 && !/\n/.test(a) && /^(what|why|how|explain|describe|define|compare|design|write|list|difference)\b/i.test(a.trim()) && a.split(/[.!?]\s+/).length <= 1) return "answer looks like another question";
  if (/(^|\n)\s*(?:Q\.?\s*)?\d{1,3}\s*[.)]\s+[A-Z].{8,}\?/.test(a)) return "answer contains another question";
  if (a.length > 4000) return "answer is very long";
  return "";
}

// ---- quiz gate: a question only goes into a quiz when it has clear options and one correct answer ----
export const questionLike = (t) => { t = String(t || "").trim(); return /\?\s*["')]*$/.test(t) || (INTERROG.test(t) && t.length >= 12 && t.length < 160 && !/[.]\s*$/.test(t)); };
// returns "" when the multiple-choice item is clean, otherwise the reason it is not
export function mcqProblem(m) {
  if (!m || typeof m.q !== "string" || m.q.trim().length < 12) return "no clear question";
  const o = m.o;
  if (!Array.isArray(o) || o.length < 2 || o.length > 8) return "needs 2 to 8 options";
  if (o.some((x) => typeof x !== "string" || !x.trim())) return "an option is empty";
  if (new Set(o.map(norm)).size < o.length) return "two options are identical";
  if (!Number.isInteger(m.a) || m.a < 0 || m.a >= o.length) return "no marked correct answer";
  if (o.some((x) => norm(x) === norm(m.q))) return "an option repeats the question";
  if (o.some(questionLike)) return "an option is itself a question";
  return "";
}
