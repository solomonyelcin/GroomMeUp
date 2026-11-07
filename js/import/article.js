// Turns a file into an article that keeps the structure of the original: headings, paragraphs, lists, tables,
// bold/italic/links, pictures (Word), sheets (Excel). Nothing is summarised or rewritten.
//
// Inline formatting is stored as light markdown inside the text: **bold** *italic* ~~strike~~ `code` [text](url),
// with a backslash in front of any of these characters that is meant literally.
import { unzip } from "./zip.js";
import { decodeXml, attr } from "./xml.js";
import { readXlsx } from "./xlsx.js";
import { layoutToArticle, mergeArticles } from "./ocrlayout.js";
import { newBlobId } from "../imgstore.js";
import { escMd, textToArticle } from "./blocks.js";
export { escMd, textToArticle };

export const ARTICLE_TYPES = /\.(pdf|docx|xlsx|xlsm|csv|tsv|txt|md|markdown)$/i;
const MAX_BLOCKS_BYTES = 1500000; // the article text is kept in the app's own storage, so it is capped (the original file is kept whole)
const MAX_ROWS = 3000;
const stem = (n) => n.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Imported article";

// ---------------------------------------------------------------------------------------------- Word
const wrapRun = (t, r) => {
  if (!t) return "";
  if (!t.trim()) return t;
  const lead = /^\s*/.exec(t)[0], trail = /\s*$/.exec(t)[0], core = t.trim();
  let o = r.code ? "`" + core.replace(/`/g, "'") + "`" : escMd(core);
  if (r.i) o = "*" + o + "*"; if (r.b) o = "**" + o + "**"; if (r.s) o = "~~" + o + "~~";
  return lead + o + trail;
};

export async function readDocxArticle(buffer) {
  const zip = await unzip(buffer);
  const xml = await zip.text("word/document.xml");
  if (!xml) throw new Error("This is not a Word document (word/document.xml is missing).");
  // styles: id -> { name, numPr }
  const styles = {};
  const sx = (await zip.text("word/styles.xml")) || "";
  for (const m of sx.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = attr(" " + m[1], "w:styleId"); if (!id) continue;
    styles[id] = { name: (attr((/<w:name\b[^>]*>/.exec(m[2]) || [""])[0], "w:val") || id).toLowerCase(), num: /<w:numPr>/.test(m[2]) ? m[2] : null, basedOn: attr((/<w:basedOn\b[^>]*>/.exec(m[2]) || [""])[0], "w:val") };
  }
  // lists: numId -> level -> "ul" | "ol"
  const nx = (await zip.text("word/numbering.xml")) || "", abs = {}, nums = {};
  for (const m of nx.matchAll(/<w:abstractNum\b([^>]*)>([\s\S]*?)<\/w:abstractNum>/g)) {
    const id = attr(" " + m[1], "w:abstractNumId"), lv = {};
    for (const l of m[2].matchAll(/<w:lvl\b([^>]*)>([\s\S]*?)<\/w:lvl>/g)) lv[attr(" " + l[1], "w:ilvl")] = { fmt: attr((/<w:numFmt\b[^>]*>/.exec(l[2]) || [""])[0], "w:val") || "decimal", start: +attr((/<w:start\b[^>]*>/.exec(l[2]) || [""])[0], "w:val") || 1 };
    abs[id] = lv;
  }
  for (const m of nx.matchAll(/<w:num\b([^>]*)>([\s\S]*?)<\/w:num>/g)) nums[attr(" " + m[1], "w:numId")] = attr((/<w:abstractNumId\b[^>]*>/.exec(m[2]) || [""])[0], "w:val");
  const listKind = (numId, lvl) => { const a = abs[nums[numId]]; const f = a && a[String(lvl)] ? a[String(lvl)].fmt : "bullet"; return f === "bullet" || f === "none" ? "ul" : "ol"; };
  // relationships: hyperlinks and pictures
  const rels = {}, relx = (await zip.text("word/_rels/document.xml.rels")) || "";
  for (const m of relx.matchAll(/<Relationship\b[^>]*>/g)) rels[attr(m[0], "Id")] = { t: attr(m[0], "Target"), type: attr(m[0], "Type") || "", ext: attr(m[0], "TargetMode") === "External" };
  const images = [];
  const imageFor = async (rid) => {
    const r = rels[rid]; if (!r || r.ext || !/image/.test(r.type) || images.length >= 40) return null;
    const path = r.t.startsWith("/") ? r.t.slice(1) : "word/" + r.t.replace(/^\.?\//, "");
    const bytes = await zip.bytes(path); if (!bytes || bytes.length > 4e6) return null;
    const ext = (path.split(".").pop() || "png").toLowerCase();
    if (!["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) return null;
    const id = newBlobId(); images.push({ id, bytes, type: ext === "jpg" ? "image/jpeg" : "image/" + ext, name: path.split("/").pop() });
    return id;
  };

  const body = xml.slice(xml.indexOf("<w:body"));
  const blocks = [];
  const cellText = async (tc) => { const out = []; for (const p of tc.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) { const r = await runsOf(p[0]); if (r.text.trim()) out.push(r.text.trim()); } return out.join("\n"); };
  async function runsOf(p) {
    // runs (and hyperlink groups) in order; a picture inside a paragraph becomes its own block after the text
    let parts = [], pics = [];
    const re = /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>|<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
    const runText = async (rx, link) => {
      const pr = (/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(rx) || ["", ""])[1];
      const f = { b: /<w:b\s*\/>|<w:b\s[^>]*w:val="(?:1|true|on)"/.test(pr) && !/<w:b\s[^>]*w:val="(?:0|false)"/.test(pr), i: /<w:i\s*\/>|<w:i\s[^>]*w:val="(?:1|true|on)"/.test(pr) && !/<w:i\s[^>]*w:val="(?:0|false)"/.test(pr), s: /<w:strike\s*\/>/.test(pr), code: /w:ascii="(?:Courier New|Consolas|Menlo|Monaco|Lucida Console)"/i.test(pr) };
      let t = "";
      for (const m of rx.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>|<w:cr\s*\/>|<w:drawing\b[\s\S]*?<\/w:drawing>|<w:pict\b[\s\S]*?<\/w:pict>/g)) {
        if (m[0].startsWith("<w:tab")) t += "\t"; else if (m[0].startsWith("<w:br") || m[0].startsWith("<w:cr")) t += /w:type="page"/.test(m[0]) ? "" : "\n";
        else if (m[0].startsWith("<w:drawing") || m[0].startsWith("<w:pict")) { const rid = attr((/<a:blip\b[^>]*>/.exec(m[0]) || [""])[0], "r:embed") || attr((/<v:imagedata\b[^>]*>/.exec(m[0]) || [""])[0], "r:id"); const id = rid && (await imageFor(rid)); if (id) pics.push({ id, alt: attr((/<wp:docPr\b[^>]*>/.exec(m[0]) || [""])[0], "descr") || "" }); }
        else t += decodeXml(m[1]);
      }
      return { t: decodeXml(t) === t ? t : t, f, link };
    };
    const runs = [];
    for (const m of p.matchAll(re)) {
      if (m[0].startsWith("<w:hyperlink")) {
        const rid = attr(" " + m[1], "r:id"), anchor = attr(" " + m[1], "w:anchor"), url = rid && rels[rid] && rels[rid].ext ? rels[rid].t : null;
        for (const rm of m[2].matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) runs.push(await runText(rm[1], /^(https?:|mailto:)/i.test(url || "") ? url : null));
        void anchor;
      } else runs.push(await runText(m[3], null));
    }
    // join runs with the same look so "**a****b**" never appears
    const merged = [];
    for (const r of runs) { const l = merged[merged.length - 1]; if (l && l.link === r.link && l.f.b === r.f.b && l.f.i === r.f.i && l.f.s === r.f.s && l.f.code === r.f.code) l.t += r.t; else merged.push({ ...r }); }
    let out = "";
    for (const r of merged) { let seg = r.t.split("\n").map((x) => wrapRun(x, r.f)).join("\n"); if (r.link && seg.trim()) seg = `[${seg.trim()}](${r.link})`; out += seg; }
    return { text: out.replace(/[ \t]+\n/g, "\n").replace(/\t/g, "    ").replace(/\n{2,}/g, "\n").trim(), pics };
  }
  const flat = (st) => { // follow basedOn for the list and heading info
    let s = styles[st], n = 0; while (s && n++ < 6) { if (s.num) return s; s = styles[s.basedOn]; } return styles[st];
  };
  let list = null; // list being built: { type, items, lv, start, numId }
  const endList = () => { if (list) { const { numId, ...b } = list; blocks.push(b); list = null; } };
  for (const m of body.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\s*\/>/g)) {
    const chunk = m[0];
    if (chunk.startsWith("<w:tbl")) {
      endList();
      if (/<w:tbl\b[\s\S]*<w:tbl\b/.test(chunk.slice(5))) { /* nested table: read as the outer one */ }
      const rows = [];
      for (const tr of chunk.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) { const cells = []; for (const tc of tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) cells.push(await cellText(tc[0])); rows.push(cells); }
      const w = Math.max(0, ...rows.map((r) => r.length)); rows.forEach((r) => { while (r.length < w) r.push(""); });
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }
    const sid = attr((/<w:pStyle\b[^>]*>/.exec(chunk) || [""])[0], "w:val") || "";
    const st = styles[sid] || { name: sid.toLowerCase() }, name = st.name.replace(/\s+/g, " ");
    const { text, pics } = await runsOf(chunk);
    const hm = /^(?:heading|überschrift|titre|título)\s*(\d)$/.exec(name), isTitle = /^(title|titel)$/.test(name);
    const ppr = (/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(chunk) || ["", ""])[1];
    const direct = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(ppr);
    const sty = flat(sid), viaStyle = !direct && sty && sty.num ? /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(sty.num) : null;
    const np = direct || viaStyle;
    if (np && text && !hm && !isTitle) {
      const numId = attr((/<w:numId\b[^>]*>/.exec(np[1]) || [""])[0], "w:val"), lvl = +attr((/<w:ilvl\b[^>]*>/.exec(np[1]) || [""])[0], "w:val") || (/\s(\d)$/.test(name) ? +/\s(\d)$/.exec(name)[1] - 1 : 0);
      if (numId !== "0") {
        const kind = /bullet/.test(name) ? "ul" : /number/.test(name) && !abs[nums[numId]] ? "ol" : listKind(numId, lvl);
        if (!list || list.type !== kind || (kind === "ol" && list.numId !== numId && lvl === 0)) { endList(); list = { type: kind, items: [], lv: [], numId, ...(kind === "ol" ? { start: (abs[nums[numId]] && abs[nums[numId]]["0"] && abs[nums[numId]]["0"].start) || 1 } : {}) }; }
        list.items.push(text.replace(/\n/g, " ")); list.lv.push(lvl);
        for (const pic of pics) { endList(); blocks.push({ type: "img", ...pic }); }
        continue;
      }
    }
    endList();
    if (text) {
      if (isTitle) blocks.push({ type: "title", text: text.replace(/\n/g, " ") });
      else if (hm) blocks.push({ type: "h", n: 0, level: Math.min(4, +hm[1]), text: text.replace(/\n/g, " ").replace(/^\*\*(.*)\*\*$/, "$1") });
      else if (/^(quote|intense quote|block text|citation)$/.test(name)) blocks.push({ type: "quote", text });
      else if (/^(code|source code|macro text|html preformatted|preformatted text)$/.test(name)) blocks.push({ type: "code", text: text.replace(/`/g, "").replace(/\\([\\*`\[\]~])/g, "$1") });
      else if (/^(subtitle)$/.test(name)) blocks.push({ type: "p", text: "**" + text.replace(/\*\*/g, "") + "**" });
      else blocks.push({ type: "p", text });
    }
    for (const pic of pics) blocks.push({ type: "img", ...pic });
  }
  endList();
  return { blocks, images };
}

// ---------------------------------------------------------------------------------------------- Excel and CSV
export function parseDelimited(text) {
  const delim = (text.split("\n", 1)[0].match(/\t/g) || []).length > (text.split("\n", 1)[0].match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && !cur) q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function rowsToTableBlocks(rows, { name, heading = false } = {}) {
  rows = rows.map((r) => r.map((c) => String(c ?? "")));
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop();
  while (rows.length && rows[0].every((c) => !c.trim())) rows.shift();
  if (!rows.length) return [];
  let w = Math.max(...rows.map((r) => r.length));
  while (w > 0 && rows.every((r) => !(r[w - 1] || "").trim())) w--;
  let lead = 0; while (lead < w && rows.every((r) => !(r[lead] || "").trim())) lead++;
  rows = rows.map((r) => Array.from({ length: w - lead }, (_, k) => escMd(r[k + lead] || "")));
  const out = [];
  if (heading && name) out.push({ type: "h", n: 0, level: 1, text: escMd(name) });
  const shown = rows.slice(0, MAX_ROWS);
  out.push({ type: "table", rows: shown, ...(rows.length > MAX_ROWS ? { cut: rows.length } : {}) });
  if (rows.length > MAX_ROWS) out.push({ type: "p", text: `Showing the first ${MAX_ROWS} of ${rows.length} rows. Open the original file to see every row.` });
  return out;
}

// ---------------------------------------------------------------------------------------------- PDF
export async function readPdfArticle(buffer) {
  const { readPdfNative } = await import("./pdfnative.js");
  return readPdfNative(buffer);
}
const escapeBlock = (b) => {
  const e = (t) => escMd(t).replace(/\\\[…\\\]/g, "[…]");
  if (b.text != null) return { ...b, text: e(b.text) };
  if (b.items) return { ...b, items: b.items.map(e) };
  if (b.rows) return { ...b, rows: b.rows.map((r) => r.map(e)) };
  return b;
};

// ---------------------------------------------------------------------------------------------- one entry point
// Returns { title, blocks, kind, warnings, images:[{id,bytes,type}], original:{ keep, type } , stats }
export async function fileToArticle(file) {
  const name = file.name || "file", ext = (name.split(".").pop() || "").toLowerCase();
  if (file.size > 40 * 1024 * 1024) throw new Error(`${name} is larger than 40 MB.`);
  if (["doc", "xls", "ppt", "pptx", "odt", "ods", "rtf"].includes(ext)) throw new Error(`.${ext} files cannot be read directly. In its own app choose Save As ${ext.startsWith("x") || ext === "ods" ? ".xlsx" : ".docx"} (or export to PDF), then import that.`);
  if (!ARTICLE_TYPES.test(name)) throw new Error(`.${ext || "?"} is not supported here. Use PDF, Word (.docx), Excel (.xlsx), CSV, text or markdown. Pictures go through "Import from pictures".`);
  let blocks = [], images = [], kind = "", warnings = [], keepOriginal = true;
  if (ext === "docx") { const r = await readDocxArticle(await file.arrayBuffer()); blocks = r.blocks; images = r.images; kind = "Word document"; if (!blocks.length) warnings.push("No text was found in this document."); }
  else if (ext === "pdf") {
    const r = await readPdfArticle(await file.arrayBuffer()); blocks = r.blocks; kind = "PDF";
    if (r.scanned) warnings.push("No text could be read: this PDF looks like a scan (pictures of pages). Save its pages as pictures and use “Import from pictures”, or keep the original to read it as it is.");
    if (r.truncated) warnings.push("Only the first 400 pages were read.");
    for (const n of r.notes || []) warnings.push(n);
    if (blocks.length) warnings.push("Pictures and drawings inside a PDF are not extracted. Use “Open original” to see them.");
  } else if (ext === "xlsx" || ext === "xlsm") {
    const sheets = (await readXlsx(await file.arrayBuffer(), { formatted: true }));
    const vis = sheets.filter((s) => !s.hidden), many = vis.length > 1;
    for (const s of vis) blocks.push(...rowsToTableBlocks(s.rows, { name: s.name, heading: many || s.name !== "Sheet1" }));
    if (sheets.length !== vis.length) warnings.push(`${sheets.length - vis.length} hidden sheet(s) were skipped.`);
    kind = "Excel workbook"; if (!blocks.length) warnings.push("The workbook has no data.");
  } else if (ext === "csv" || ext === "tsv") { blocks = rowsToTableBlocks(parseDelimited(await file.text()), { name: stem(name) }); kind = "Spreadsheet text"; keepOriginal = false; }
  else { blocks = textToArticle(await file.text(), { markdown: ext !== "txt" }); kind = ext === "txt" ? "Text file" : "Markdown"; keepOriginal = false; }
  // a title: the document's own, else the first heading, else the file name
  let title = (blocks.find((b) => b.type === "title") || {}).text;
  if (!title && ext !== "xlsx" && ext !== "xlsm" && ext !== "csv" && ext !== "tsv") title = (blocks.find((b) => b.type === "h") || {}).text;
  title = (title || "").replace(/\\([\\*`\[\]~])/g, "$1").replace(/[*`~]|\]\([^)]*\)|\[/g, "").trim();
  if (!title || title.length > 120) title = stem(name);
  let size = JSON.stringify(blocks).length;
  if (size > MAX_BLOCKS_BYTES) {
    let keep = blocks.length; while (keep > 1 && JSON.stringify(blocks.slice(0, keep)).length > MAX_BLOCKS_BYTES) keep = Math.floor(keep * 0.9);
    blocks = blocks.slice(0, keep); blocks.push({ type: "p", text: "This file is longer than the app can keep as text, so the rest is not shown here. Use “Open original” to read all of it." }); warnings.push("The file is very large: only the first part is kept as an article. The original file is kept whole."); keepOriginal = true;
  }
  const stats = { headings: blocks.filter((b) => b.type === "h" || b.type === "title").length, tables: blocks.filter((b) => b.type === "table").length, lists: blocks.filter((b) => b.type === "ul" || b.type === "ol").length, pictures: images.length, blocks: blocks.length };
  return { title, blocks, kind, warnings, images, keepOriginal, stats, name, ext, size: file.size };
}
