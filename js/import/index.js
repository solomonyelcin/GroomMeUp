// Entry point: read any supported file and return question items.
import { readXlsx } from "./xlsx.js";
import { readDocx } from "./docx.js";
import { sheetsToItems, rowsToItems, parseCsv } from "./sheet.js";
import { parseBlocks, parseDocBlocks, textToBlocks } from "./text.js";

export const ACCEPT = ".xlsx,.xlsm,.csv,.tsv,.docx,.pdf,.txt,.md,.markdown";
const MAX_BYTES = 30 * 1024 * 1024;
const stem = (n) => n.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Imported questions";

export async function parseFile(file) {
  const name = file.name || "file";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (file.size > MAX_BYTES) throw new Error(`${name} is larger than 30 MB.`);
  if (["xls", "doc", "ppt", "pptx", "rtf", "odt", "ods"].includes(ext)) {
    throw new Error(`.${ext} files are not supported. Open it and use Save As ${ext.startsWith("x") || ext === "ods" ? ".xlsx" : ".docx"} (or export to PDF), then import that.`);
  }
  const buf = ext === "txt" || ext === "md" || ext === "markdown" || ext === "csv" || ext === "tsv" ? null : await file.arrayBuffer();
  const out = { name, ext, items: [], info: [], warnings: [], text: "", skipped: 0 };

  if (ext === "xlsx" || ext === "xlsm") {
    const sheets = await readXlsx(buf);
    const r = sheetsToItems(sheets);
    out.items = r.items; out.info = r.info; out.kind = "Excel workbook";
    out.skipped = r.info.reduce((s, i) => s + (i.noAnswer || 0), 0);
    out.text = sheets.filter((s) => !s.hidden).map((s) => s.rows.map((r) => r.filter(Boolean).join(" | ")).join("\n")).join("\n\n");
  } else if (ext === "csv" || ext === "tsv") {
    const text = await file.text();
    const r = rowsToItems(parseCsv(text), stem(name));
    out.items = r.items; out.kind = "Spreadsheet text"; out.skipped = r.noAnswer || 0; out.text = text;
    out.info = [{ name: stem(name), used: r.used, count: r.items.length, reason: r.reason }];
  } else if (ext === "docx") {
    const blocks = await readDocx(buf);
    const r = parseDocBlocks(blocks, { fallbackTopic: stem(name) });
    out.items = r.items; out.info = r.info; out.kind = "Word document"; out.skipped = r.skipped;
    out.text = blocks.map((b) => (b.type === "table" ? b.rows.map((x) => x.join(" | ")).join("\n") : b.text)).join("\n");
  } else if (ext === "pdf") {
    const { readPdf } = await import("./pdf.js");
    const { blocks } = await readPdf(buf);
    const r = parseBlocks(blocks, { fallbackTopic: stem(name), softWrap: true });
    out.items = r.items; out.kind = "PDF"; out.skipped = r.skipped;
    out.text = blocks.map((b) => b.text).join("\n");
    if (!out.text.trim()) out.warnings.push("No text could be read from this PDF. It may be a scan (images only). Run OCR first or export the text.");
  } else if (ext === "txt" || ext === "md" || ext === "markdown") {
    const text = await file.text();
    const r = parseBlocks(textToBlocks(text), { fallbackTopic: stem(name) });
    out.items = r.items; out.kind = ext === "txt" ? "Text file" : "Markdown"; out.skipped = r.skipped; out.text = text;
  } else {
    throw new Error(`Unsupported file type .${ext}. Use Excel (.xlsx), Word (.docx), PDF, text, markdown or CSV.`);
  }
  if (!out.info.length) out.info = summarise(out.items);
  return out;
}

export function summarise(items) {
  const m = new Map();
  for (const it of items) m.set(it.topic, (m.get(it.topic) || 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, used: true, count }));
}
