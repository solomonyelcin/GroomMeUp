// Read an .xlsx workbook into plain rows. No dependencies.
import { unzip } from "./zip.js";
import { decodeXml, attr } from "./xml.js";

const MAX_ROWS = 20000, MAX_COLS = 60;
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const textOf = (xml) => {
  xml = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  const out = []; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return decodeXml(out.join(""));
};

// number formats: dates and percentages show as they do in Excel instead of as raw numbers
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const pad = (n) => String(n).padStart(2, "0");
function fmtDate(serial, withTime) {
  const ms = Math.round((serial - 25569) * 86400000), d = new Date(ms);
  if (isNaN(d)) return String(serial);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return withTime && serial % 1 ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}
function formatNumber(raw, kind) {
  const n = Number(raw); if (!isFinite(n)) return raw;
  if (kind === "date") return fmtDate(n, true);
  if (kind === "pct") return String(Number((n * 100).toPrecision(12))) + "%";
  return String(Number(n.toPrecision(15))); // 0.1+0.2 shows as 0.3, not 0.30000000000000004
}

export async function readXlsx(buffer, { formatted = false } = {}) {
  const zip = await unzip(buffer);
  if (!zip.has("xl/workbook.xml")) throw new Error("This zip file is not an Excel workbook (xl/workbook.xml is missing).");
  const wbXml = await zip.text("xl/workbook.xml");
  const relXml = (await zip.text("xl/_rels/workbook.xml.rels")) || "";
  const rels = {};
  for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], "Id"), t = attr(m[0], "Target"); if (id && t) rels[id] = t; }
  const shared = [];
  const ss = await zip.text("xl/sharedStrings.xml");
  if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)) shared.push(m[1] ? textOf(m[1]) : "");

  const xfKind = []; // per cell style: "date", "pct" or ""
  if (formatted) {
    const st = await zip.text("xl/styles.xml");
    if (st) {
      const custom = {};
      for (const m of st.matchAll(/<numFmt\b[^>]*>/g)) custom[attr(m[0], "numFmtId")] = attr(m[0], "formatCode") || "";
      const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st);
      if (xfs) for (const m of xfs[1].matchAll(/<xf\b[^>]*>/g)) {
        const id = +attr(m[0], "numFmtId") || 0, code = custom[id] || "";
        xfKind.push(BUILTIN_DATE.has(id) || (code && /[ymdhs]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"|\\./g, "")) && !/^general$/i.test(code)) ? "date" : id === 9 || id === 10 || /%/.test(code) ? "pct" : "");
      }
    }
  }
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name"), rid = attr(m[0], "r:id"), state = attr(m[0], "state") || "visible";
    let target = rels[rid]; if (!name || !target) continue;
    target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.?\//, "");
    const xml = await zip.text(target);
    if (!xml) continue;
    const rows = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = c[1], body = c[2] || "";
      const ref = attr(" " + head, "r"); if (!ref) continue;
      const r = parseInt(ref.replace(/[^0-9]/g, ""), 10) - 1, col = colIndex(ref);
      if (r < 0 || r >= MAX_ROWS || col < 0 || col >= MAX_COLS) continue;
      const t = attr(" " + head, "t");
      let val = "";
      if (t === "s") { const v = /<v>([\s\S]*?)<\/v>/.exec(body); val = v ? shared[+v[1]] ?? "" : ""; }
      else if (t === "inlineStr") val = textOf(body);
      else if (t === "b") val = /<v>1<\/v>/.test(body) ? "TRUE" : "FALSE";
      else if (t === "e") val = "";
      else { const v = /<v>([\s\S]*?)<\/v>/.exec(body); val = v ? decodeXml(v[1]) : ""; if (formatted && val !== "") val = formatNumber(val, xfKind[+attr(" " + head, "s") || 0] || ""); }
      (rows[r] ||= [])[col] = val;
    }
    const width = Math.min(MAX_COLS, rows.reduce((w, r) => Math.max(w, r ? r.length : 0), 0));
    const dense = [];
    for (let i = 0; i < rows.length; i++) { const r = rows[i] || []; dense.push(Array.from({ length: width }, (_, k) => (r[k] == null ? "" : String(r[k])))); }
    // cell notes/comments (some workbooks keep the answer in a "Show answer" note)
    const notes = {};
    const relPath = target.replace(/([^/]+)$/, "_rels/$1.rels");
    const srel = await zip.text(relPath);
    if (srel) for (const rm of srel.matchAll(/<Relationship\b[^>]*>/g)) {
      if (!/\/comments$/.test(attr(rm[0], "Type") || "")) continue;
      let ct = attr(rm[0], "Target") || "";
      ct = ct.startsWith("/") ? ct.slice(1) : target.replace(/[^/]+$/, "") + ct;
      ct = ct.split("/").reduce((a, p2) => { if (p2 === "..") a.pop(); else if (p2 !== ".") a.push(p2); return a; }, []).join("/");
      const cx = await zip.text(ct); if (!cx) continue;
      for (const cm of cx.matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
        const ref = attr(" " + cm[1], "ref"); if (!ref) continue;
        notes[parseInt(ref.replace(/[^0-9]/g, ""), 10) - 1 + ":" + colIndex(ref)] = textOf(cm[2]);
      }
    }
    sheets.push({ name, hidden: state !== "visible", rows: dense, notes });
  }
  return sheets;
}
