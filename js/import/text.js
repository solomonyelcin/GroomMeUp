// Parse prose (Word, PDF, text, markdown) into question items.
// Blocks: [{ text, heading?: number }]. An empty text is a blank line.
import { norm, rowsToItems } from "./sheet.js";

const Q_MARK = /^\s*(?:Q(?:uestion)?\s*\.?\s*\d*\s*[:.)\-–—]\s*|Q\d+\s*[.)]?\s+)(\S.*)$/i;
const A_MARK = /^\s*(?:A(?:ns(?:wer)?)?\s*\.?\s*\d*\s*[:.)\-–—]\s*)(.*)$/i;
const NUMBERED = /^\s*(?:\d{1,3}|[a-z])\s*[.)]\s+(\S.*)$/i;
const BULLET = /^\s*(?:[-*•▪◦●]|\d+[.)])\s+/;
const INTERROG = /^(what|why|how|when|where|which|who|explain|describe|define|differentiate|difference|compare|list|write|can|is|are|do|does|should|name|state|give|discuss|illustrate|tell|mention|elaborate|outline)\b/i;
const looksLikeQuestion = (t) => /\?\s*["')]*$/.test(t) || INTERROG.test(t);
const isShoutHeading = (t) => t.length >= 3 && t.length <= 60 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/[.?!:]$/.test(t) && !/\d{3,}/.test(t);

function joinAnswer(lines, softWrap) {
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push(para.join(softWrap ? " " : "\n")); para = []; } };
  for (const l of lines) {
    if (!l.trim()) { flush(); continue; }
    if (softWrap && BULLET.test(l)) { flush(); }
    para.push(l.trim());
  }
  flush();
  return out.join("\n").replace(/[ \t]{2,}/g, " ").trim();
}

export function parseBlocks(blocks, { fallbackTopic = "Imported questions", softWrap = false } = {}) {
  const lines = [];
  for (const b of blocks) {
    if (b.type === "table") continue;
    const parts = String(b.text ?? "").split(/\r?\n/);
    for (const p of parts) {
      let t = p.replace(/ /g, " ").replace(/\s+$/g, "");
      let h = b.heading || 0;
      const md = /^(#{1,6})\s+(.*)$/.exec(t); if (md) { h = md[1].length; t = md[2]; }
      lines.push({ t: t.trim(), raw: t, h });
    }
  }
  const markerMode = lines.filter((l) => A_MARK.test(l.t) && l.t.length > 2).length >= 2 && lines.filter((l) => Q_MARK.test(l.t)).length >= 2;

  const items = []; let topic = fallbackTopic, cur = null, skipped = 0;
  const flush = () => {
    if (!cur) return;
    const a = joinAnswer(cur.a, softWrap);
    const q = cur.q.replace(/\s+/g, " ").trim();
    if (q.length >= 4 && a.length >= 8) items.push({ topic, sub: "", q, a, status: "", kind: /scenario/i.test(topic) ? "scenario" : "concept" });
    else if (q.length >= 4) skipped++;
    cur = null;
  };
  for (const l of lines) {
    const t = l.t;
    if (!t) { if (cur && (cur.inA || !markerMode)) cur.a.push(""); continue; }
    if (l.h && !(l.h >= 2 && looksLikeQuestion(t) && /\?\s*$/.test(t))) {
      flush(); topic = t.replace(/[:\s]+$/, "") || topic; continue;
    }
    if (l.h && /\?\s*$/.test(t)) { flush(); cur = { q: t, a: [], inA: false }; continue; }
    let m;
    if ((m = Q_MARK.exec(t))) { flush(); cur = { q: m[1], a: [], inA: false }; continue; }
    if (cur && markerMode && !cur.inA && (m = A_MARK.exec(t))) { cur.inA = true; if (m[1]) cur.a.push(m[1]); continue; }
    if (!l.h && isShoutHeading(t) && (!cur || cur.a.length)) { flush(); topic = t; continue; }
    const num = NUMBERED.exec(t);
    if (num && looksLikeQuestion(num[1]) && (!markerMode || /\?\s*$/.test(num[1]))) { flush(); cur = { q: num[1], a: [], inA: false }; continue; }
    if (!markerMode && /\?\s*["')]*$/.test(t) && t.length <= 300 && /^[A-Z0-9"'(]/.test(t) && (!cur || cur.a.some((x) => x.trim()) || !cur.a.length)) {
      flush(); cur = { q: t, a: [], inA: false }; continue;
    }
    if (cur) { if (markerMode && !cur.inA) cur.q += " " + t; else cur.a.push(l.raw.trim() ? l.raw : t); }
  }
  flush();
  // de-duplicate
  const seen = new Set(), out = [];
  for (const it of items) { const k = norm(it.topic + "|" + it.q); if (!seen.has(k)) { seen.add(k); out.push(it); } }
  return { items: out, skipped };
}

// Word documents: prose blocks plus tables. Tables with Question/Answer columns are read like sheets.
export function parseDocBlocks(blocks, opts = {}) {
  const prose = parseBlocks(blocks, opts);
  const items = [...prose.items];
  const info = [];
  let heading = opts.fallbackTopic || "Imported questions", n = 0;
  for (const b of blocks) {
    if (b.type === "p" && b.heading && b.text) heading = b.text;
    if (b.type === "table" && b.rows.length >= 3) {
      n++;
      const r = rowsToItems(b.rows, heading);
      info.push({ name: `Table ${n} (${heading})`, used: r.used, count: r.items.length, reason: r.reason });
      for (const it of r.items) if (!items.some((x) => norm(x.q) === norm(it.q))) items.push(it);
    }
  }
  return { items, skipped: prose.skipped, info };
}

export const textToBlocks = (text) => text.replace(/^﻿/, "").split(/\r?\n/).map((t) => ({ text: t }));
