// Find questions in documents that have no answers (a plain list of interview questions).
import { norm } from "./sheet.js";

const INTERROG = /^(what|why|how|when|where|which|who|explain|describe|define|differentiate|difference|compare|list|write|can|is|are|do|does|did|should|would|could|name|state|give|discuss|illustrate|tell|mention|elaborate|outline|design|implement|create|build|walk|suppose|imagine|consider|have you|your)\b/i;
const PREFIX = /^\s*(?:(?:Q(?:uestion)?\s*)?\d{1,3}(?:\.\d{1,3})?\s*[.):\-–]|[a-z]\s*[.)]|Q\s*[.:)]|[-*•▪◦●‣⁃])\s*(.*)$/i;
const shout = (t) => t.length >= 3 && t.length <= 60 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/[.?!]$/.test(t) && !/\d{3,}/.test(t);
const isQ = (t) => t.length >= 12 && (/\?\s*["')]*$/.test(t) || INTERROG.test(t));

export function extractQuestionList(blocks, fallbackTopic = "Imported questions") {
  const lines = [];
  for (const b of blocks) {
    if (b.type === "table") {
      for (const row of b.rows || []) { const c = String(row.find((x) => isQ(String(x || "").trim())) || "").trim(); if (c) lines.push({ t: c, h: 0, row: true }); }
      continue;
    }
    for (const p of String(b.text ?? "").split(/\r?\n/)) {
      let t = p.replace(/ /g, " ").trim(); let h = b.heading || 0;
      const md = /^(#{1,6})\s+(.*)$/.exec(t); if (md) { h = md[1].length; t = md[2]; }
      lines.push({ t, h });
    }
  }
  const out = []; let topic = fallbackTopic, cur = null;
  const flush = () => {
    if (!cur) return;
    const q = cur.replace(/\s+/g, " ").trim();
    if (isQ(q) && q.length <= 600) out.push({ topic, sub: "", q, a: "", status: "", kind: /scenario/i.test(topic + " " + q.slice(0, 40)) ? "scenario" : "concept" });
    cur = null;
  };
  const nextText = (i) => { for (let k = i + 1; k < lines.length; k++) if (lines[k].t) return lines[k].t; return ""; };
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li], t = l.t;
    if (!t) { flush(); continue; }
    // a short title-like line with no punctuation, followed by a numbered/bulleted question, is a section heading
    if (!isQ(t) && t.length <= 60 && !/[.?!:,;]$/.test(t) && !PREFIX.test(t) && PREFIX.test(nextText(li)) && (!cur || /[?.!]["')]*$/.test(cur))) { flush(); topic = t; continue; }
    if (l.row) { flush(); cur = t; flush(); continue; }
    const asHeading = l.h > 0 && !/\?\s*$/.test(t);
    if (asHeading || shout(t) || (/:$/.test(t) && t.length <= 60 && !isQ(t))) { flush(); topic = t.replace(/[:\s]+$/, "") || topic; continue; }
    const m = PREFIX.exec(t);
    if (m && m[1]) { flush(); cur = m[1]; continue; }
    if (cur && !/[?.!]["')]*$/.test(cur)) { cur += " " + t; continue; }   // a question wrapped over two lines
    if (isQ(t) && /^[A-Z0-9"'(]/.test(t)) { flush(); cur = t; continue; }
    flush();
  }
  flush();
  const seen = new Set();
  return out.filter((x) => { const k = norm(x.topic + "|" + x.q); if (seen.has(k)) return false; seen.add(k); return true; });
}

// questions that are not already covered by answered items
export function pendingFrom(list, items) {
  const have = new Set(items.map((i) => norm(i.q)));
  return list.filter((x) => !have.has(norm(x.q)));
}
