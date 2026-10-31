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
