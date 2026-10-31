// Turn spreadsheet-like rows (Excel sheets, CSV, Word tables) into question items.
// Item: { topic, sub, q, a, status, kind }
export const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const COL = {
  q: [/^questions?$/i, /^q$/i, /^que?stions?\b/i, /question/i],
  a: [/^answers?$/i, /^model answers?$/i, /^answer hint$/i, /^ans\.?$/i, /^solutions?$/i, /^response$/i, /^explanation$/i, /^hint$/i, /answer/i, /solution/i],
  sub: [/sub.?topic/i, /sub.?categ/i, /^section$/i, /^chapter$/i, /^module$/i, /^category$/i, /^topic$/i, /^area$/i, /^tags?$/i, /^group$/i],
  status: [/learning.?status/i, /^status$/i, /confiden/i, /^progress$/i, /^state$/i],
};
const BAD_A = /show|view|click|hide|reveal|link|button/i;

function pick(headers, list, taken, bad) {
  for (const rx of list) {
    const i = headers.findIndex((h, k) => !taken.has(k) && h && rx.test(h) && !(bad && bad.test(h)));
    if (i >= 0) return i;
  }
  return -1;
}

export function findHeader(rows, noteCols = new Set()) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const headers = (rows[r] || []).map((c) => String(c || "").trim());
    if (headers.filter(Boolean).length < 2) continue;
    const taken = new Set();
    const q = pick(headers, COL.q, taken, /^(s\.?\s?no|sr|no\.?|#|id)$/i); if (q < 0) continue; taken.add(q);
    let a = pick(headers, COL.a, taken, BAD_A);
    // a "Show answer" column whose cells carry the answer as a note
    if (a < 0) a = headers.findIndex((h, k) => !taken.has(k) && noteCols.has(k) && /answer|solution|hint/i.test(h));
    if (a < 0) continue; taken.add(a);
    const sub = pick(headers, COL.sub, taken); if (sub >= 0) taken.add(sub);
    const status = pick(headers, COL.status, taken);
    return { row: r, q, a, sub, status };
  }
  return null;
}

// No header row: find a column that is mostly questions and the longest text column next to it.
export function inferColumns(rows) {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  let best = null;
  for (let c = 0; c < width; c++) {
    const vals = rows.map((r) => String(r[c] || "").trim()).filter(Boolean);
    if (vals.length < 3) continue;
    const qLike = vals.filter((v) => /\?\s*$/.test(v) || /^(what|why|how|when|explain|describe|define|difference|compare|write|which|list)\b/i.test(v)).length / vals.length;
    if (qLike < 0.5) continue;
    let aCol = -1, aLen = 0;
    for (let k = 0; k < width; k++) {
      if (k === c) continue;
      const avg = rows.reduce((s, r) => s + String(r[k] || "").length, 0) / rows.length;
      if (avg > aLen) { aLen = avg; aCol = k; }
    }
    if (aCol >= 0 && aLen >= 25) { best = { q: c, a: aCol, sub: -1, status: -1, row: -1, inferred: true }; break; }
  }
  return best;
}

// header with a Question column but no Answer column: a plain list of questions
// notes that wrap a comment body: "======", "ID#...", "<label> (date)" lines, then the text, hard-wrapped
export function noteText(t) {
  let lines = String(t || "").replace(/\r/g, "").split("\n");
  if (lines[0] && /^=+$/.test(lines[0].trim())) lines.shift();
  if (lines[0] && /^ID#/.test(lines[0].trim())) lines.shift();
  if (lines[0] && /\(\d{4}-\d\d-\d\d[ T][\d:]+\)\s*$/.test(lines[0])) lines.shift();
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    // re-join prose that was wrapped at a fixed width; keep code and blank lines as they are
    if (prev && prev.trim() && l.trim() && prev.length >= 40 && !/[:;{}]$/.test(prev.trim()) && !/^\s|^[-*•]|^\d+[.)]\s/.test(l) && !/[{};]\s*$/.test(l)) out[out.length - 1] = prev + " " + l;
    else out.push(l);
  }
  return out.join("\n").trim();
}

function findQuestionOnly(rows) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const headers = (rows[r] || []).map((c) => String(c || "").trim());
    if (!headers.some(Boolean)) continue;
    const taken = new Set();
    const q = pick(headers, COL.q.slice(0, 3), taken, /^(s\.?\s?no|sr|no\.?|#|id)$/i); if (q < 0) continue; taken.add(q);
    if (pick(headers, COL.a, taken, BAD_A) >= 0) continue;
    const sub = pick(headers, COL.sub, taken);
    return { row: r, q, sub };
  }
  // no header at all: one column that is mostly questions
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (let c = 0; c < width; c++) {
    const vals = rows.map((r) => String(r[c] || "").trim()).filter(Boolean);
    if (vals.length >= 3 && vals.filter((v) => /\?\s*$/.test(v) || /^(what|why|how|when|explain|describe|define|difference|compare|write|which|list)\b/i.test(v)).length / vals.length >= 0.6) return { row: -1, q: c, sub: -1 };
  }
  return null;
}

export function rowsToItems(rows, topic, notes = {}) {
  const noteCols = new Set(Object.keys(notes).map((k) => +k.split(":")[1]));
  const h = findHeader(rows, noteCols) || inferColumns(rows);
  if (!h) {
    const qo = findQuestionOnly(rows);
    if (!qo) return { items: [], pending: [], used: false, reason: "no Question and Answer columns found" };
    const pending = [], seenQ = new Set();
    for (let r = qo.row + 1; r < rows.length; r++) {
      const row = rows[r] || [], q = String(row[qo.q] || "").replace(/\s+/g, " ").trim();
      if (q.length < 8 || /^questions?$/i.test(q) || seenQ.has(norm(q))) continue;
      seenQ.add(norm(q));
      const sub = qo.sub >= 0 ? String(row[qo.sub] || "").trim() : "";
      pending.push({ topic, sub, q, a: "", status: "", kind: /scenario/i.test(sub + " " + topic) ? "scenario" : "concept" });
    }
    return { items: [], pending, used: pending.length > 0, noAnswer: pending.length, dup: 0, reason: pending.length ? "" : "no questions found" };
  }
  const items = [], pending = []; let noAnswer = 0, dup = 0;
  const seen = new Set();
  for (let r = h.row + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const q = String(row[h.q] || "").replace(/\s+/g, " ").trim();
    let a = String(row[h.a] || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
    if (!a || BAD_A.test(a) && a.length < 30) { // answer held in a cell note ("Show answer")
      const nt = Object.entries(notes).filter(([k]) => +k.split(":")[0] === r).map(([, v]) => noteText(v)).find((v) => v && v.length > 2);
      if (nt) a = nt;
    }
    if (!q || q.length < 4) continue;
    if (/^questions?$/i.test(q)) continue; // repeated header
    if (!a) { noAnswer++; if (q.length >= 8 && !pending.some((p) => norm(p.q) === norm(q))) pending.push({ topic, sub: h.sub >= 0 ? String(row[h.sub] || "").trim() : "", q, a: "", status: "", kind: /scenario/i.test(topic + " " + (h.sub >= 0 ? row[h.sub] : "")) ? "scenario" : "concept" }); continue; }
    const key = norm(q);
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    const sub = h.sub >= 0 ? String(row[h.sub] || "").trim() : "";
    const status = h.status >= 0 ? String(row[h.status] || "").trim() : "";
    items.push({ topic, sub, q, a, status, kind: /scenario/i.test(sub + " " + topic) ? "scenario" : "concept" });
  }
  return { items, pending, used: true, noAnswer, dup, inferred: !!h.inferred };
}

export function sheetsToItems(sheets) {
  const all = [], info = [], pending = [];
  for (const s of sheets) {
    if (s.hidden) { info.push({ name: s.name, used: false, reason: "hidden sheet" }); continue; }
    const r = rowsToItems(s.rows, s.name, s.notes);
    info.push({ name: s.name, used: r.used, count: r.items.length, reason: r.reason, noAnswer: r.noAnswer || 0, dup: r.dup || 0, inferred: r.inferred });
    all.push(...r.items); pending.push(...(r.pending || []));
  }
  return { items: all, info, pending };
}

// ---------- CSV / TSV ----------
export function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = [",", "\t", ";"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
