// Multiple-choice questions in prose:  "1. Question" / "A) opt" ... "D) opt" / "Ans : C"
// Item: { topic, sub, q, o:[...], correct, a, status, kind:"mcq" }
import { norm } from "./sheet.js";

// "Ans : c", "And : C", "Answer - B", "Correct answer: (d) because ..."  /  bare "Answer C" on a line of its own
const ANS_SEP = /^\s*(?:and|ans(?:wer)?|correct(?:\s+(?:answer|option|choice))?|key|right\s+answer)\s*[:.\-–=]\s*\(?(?:option\s*)?([A-Ea-e])\b\s*\)?\.?(?:\s+(.*))?$/i;
const ANS_BARE = /^\s*(?:ans(?:wer)?|correct(?:\s+(?:answer|option))?)\s+\(?(?:option\s*)?([A-Ea-e])\)?\.?\s*$/i;
const ANS = { test: (t) => ANS_SEP.test(t) || ANS_BARE.test(t), exec: (t) => ANS_SEP.exec(t) || ANS_BARE.exec(t) };
const OPT = /^\s*\(?([A-Ea-e])\s*[\).:]\s*(\S.*)$/;
// delimiter-less labels ("A Some text") are only trusted when A, B, C ... appear in order
const OPT_LOOSE = /^\s*\(?([A-Ea-e])(?:\s*[\).:]\s*|\s+)(\S.*)$/;
const OPT_ONLY = /^\s*\(?([A-Ea-e])\s*[\).:]?\s*$/;
const QSTART = /^\s*(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,4})\s*[.):\-–]\s*(\S.*)$/i;
const EXPL = /^\s*(?:explanation|reason|rationale|solution|note|why)\s*[:\-–]\s*(.*)$/i;
const L = "ABCDE";

function toLines(blocks) {
  const raw = [];
  for (const b of blocks) {
    if (b.type === "table") continue;
    for (const p of String(b.text ?? "").split(/\r?\n/)) raw.push(p.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim());
  }
  // repeated running headers/footers ("... Page 12"): same text once digits are ignored
  const shape = (t) => t.toLowerCase().replace(/\d+/g, "#");
  const freq = new Map();
  for (const t of raw) if (t) freq.set(shape(t), (freq.get(shape(t)) || 0) + 1);
  return raw.filter((t) => {
    if (!t) return true;
    if (ANS.test(t) || OPT.test(t) || QSTART.test(t)) return true;
    if (/(?:^|\s)page\s*\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(t) && t.length < 120) return false;
    return !(raw.length > 80 && t.length < 120 && (freq.get(shape(t)) || 0) >= 6);
  });
}

export function parseMcq(blocks, { fallbackTopic = "Imported MCQs" } = {}) {
  const lines = toLines(blocks);
  const items = []; let topic = fallbackTopic;
  let buf = [], pendingTopic = null;

  const finish = (ansLetter, tail) => {
    // find the start of the options: the first A-option that is followed by B, C ... in order
    const lab = (t) => { const m = OPT_LOOSE.exec(t) || OPT_ONLY.exec(t); return m ? m[1].toUpperCase() : ""; };
    let first = -1;
    for (let i = 0; i < buf.length && first < 0; i++) {
      if (lab(buf[i]) !== "A") continue;
      const after = buf.slice(i + 1).filter(Boolean);
      // "A) text" is followed by "B ..."; a bare "A" line has its text on the next line, so B comes one line later
      if (lab(after[0] || "") === "B" || (OPT_ONLY.test(buf[i]) && lab(after[1] || "") === "B")) first = i;
    }
    if (first < 1) return;
    const head = buf.slice(0, first), body = buf.slice(first);
    // the question starts at the LAST numbered line of the head; lines before it are headings
    let qi = -1; for (let i = head.length - 1; i >= 0; i--) if (QSTART.test(head[i])) { qi = i; break; }
    if (qi < 0) qi = head.findIndex((x) => x);
    if (qi < 0) return;
    const pre = head.slice(0, qi).filter(Boolean);
    const qLines = head.slice(qi).filter(Boolean);
    let q = qLines.join(" ");
    const qm = QSTART.exec(qLines[0]); if (qm) q = [qm[2], ...qLines.slice(1)].join(" ");
    q = q.replace(/\s+/g, " ").trim();
    // options (wrapped lines continue the previous option; a bare "A" line takes the next line as its text)
    const opts = []; let expl = []; let cur = -1;
    for (let i = 0; i < body.length; i++) {
      const t = body[i]; if (!t) continue;
      const only = OPT_ONLY.exec(t), m = OPT_LOOSE.exec(t);
      const lab = (m || only)?.[1]?.toUpperCase();
      if (lab && L.indexOf(lab) === opts.length) {
        if (m) { opts.push(m[2]); cur = opts.length - 1; }
        else { opts.push(""); cur = opts.length - 1; }
        continue;
      }
      if (cur >= 0 && opts[cur] === "") { opts[cur] = t; continue; }
      if (cur >= 0) opts[cur] += " " + t;
    }
    const ci = L.indexOf(ansLetter.toUpperCase());
    const o = opts.map((x) => x.replace(/\s+/g, " ").trim());
    if (o.length < 2 || ci < 0 || ci >= o.length || o.some((x) => !x)) return;
    if (pre.length) { const cand = pre[pre.length - 1]; if (cand.length <= 90 && !/[?.]$/.test(cand)) topic = cand.replace(/[:\s]+$/, ""); }
    const e = (tail || "").trim();
    items.push({ topic, sub: "", q, o, correct: ci, a: `Correct answer: ${L[ci]}) ${o[ci]}`, e, status: "", kind: "mcq" });
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!t) { buf.push(""); continue; }
    const am = ANS.exec(t);
    if (am && buf.filter(Boolean).length >= 3) {
      let tail = am[2] || "";
      // an explanation can follow on the next lines
      let j = i + 1; const ex = [];
      while (j < lines.length) {
        const n = lines[j]; if (!n) { j++; continue; }
        const em = EXPL.exec(n);
        if (em || (ex.length && !QSTART.test(n) && !OPT.test(n) && !ANS.test(n) && ex.length < 6 && !/^[A-Z][A-Za-z0-9 ,&/+#.\-()]{2,60}$/.test(n))) { ex.push(em ? em[1] : n); j++; continue; }
        break;
      }
      if (ex.length) { tail = (tail ? tail + " " : "") + ex.join(" "); i = j - 1; }
      finish(am[1], tail);
      buf = []; continue;
    }
    buf.push(t);
  }
  void pendingTopic;
  // remove exact duplicates (same topic + question)
  const seen = new Set();
  return items.filter((x) => { const k = norm(x.topic + "|" + x.q + "|" + x.o.join("|")); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Several questions that test the same fact (same correct option text in the same topic) are repetitive to study.
// Keep the first `keep` of each fact.
export function reduceRepeats(items, keep = 2) {
  const n = new Map(), kept = [], dropped = [];
  for (const it of items) {
    if (it.kind !== "mcq") { kept.push(it); continue; }
    const k = norm(it.topic + "|" + it.o[it.correct]);
    const c = n.get(k) || 0; n.set(k, c + 1);
    (c < keep ? kept : dropped).push(it);
  }
  return { kept, dropped };
}
