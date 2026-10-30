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

export function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const headers = (rows[r] || []).map((c) => String(c || "").trim());
    if (headers.filter(Boolean).length < 2) continue;
    const taken = new Set();
    const q = pick(headers, COL.q, taken, /^(s\.?\s?no|sr|no\.?|#|id)$/i); if (q < 0) continue; taken.add(q);
    const a = pick(headers, COL.a, taken, BAD_A); if (a < 0) continue; taken.add(a);
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

export function rowsToItems(rows, topic) {
  const h = findHeader(rows) || inferColumns(rows);
  if (!h) return { items: [], used: false, reason: "no Question and Answer columns found" };
  const items = []; let noAnswer = 0, dup = 0;
  const seen = new Set();
  for (let r = h.row + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const q = String(row[h.q] || "").replace(/\s+/g, " ").trim();
    const a = String(row[h.a] || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
    if (!q || q.length < 4) continue;
    if (/^questions?$/i.test(q)) continue; // repeated header
    if (!a) { noAnswer++; continue; }
    const key = norm(q);
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    const sub = h.sub >= 0 ? String(row[h.sub] || "").trim() : "";
    const status = h.status >= 0 ? String(row[h.status] || "").trim() : "";
    items.push({ topic, sub, q, a, status, kind: /scenario/i.test(sub + " " + topic) ? "scenario" : "concept" });
  }
  return { items, used: true, noAnswer, dup, inferred: !!h.inferred };
}

export function sheetsToItems(sheets) {
  const all = [], info = [];
  for (const s of sheets) {
    if (s.hidden) { info.push({ name: s.name, used: false, reason: "hidden sheet" }); continue; }
    const r = rowsToItems(s.rows, s.name);
    info.push({ name: s.name, used: r.used, count: r.items.length, reason: r.reason, noAnswer: r.noAnswer || 0, dup: r.dup || 0, inferred: r.inferred });
    all.push(...r.items);
  }
  return { items: all, info };
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
