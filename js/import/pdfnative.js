// Reads a text-based PDF into article blocks using what the file itself says: real fonts (bold, italic, monospace),
// sizes and positions. Headings, lists, tables, code and inline marks come from that, not from guessing at pixels.
// Scanned PDFs (pictures of pages) have no text; they go through "Import from pictures" instead.
import { escMd } from "./blocks.js";

const BOLD = /bold|black|heavy|semibold|demi/i, ITAL = /italic|oblique/i, MONO = /mono|courier|consolas|menlo|monaco|typewriter|code/i;
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const mode = (vals, round = 1) => { const m = new Map(); for (const [v, w] of vals) { const k = Math.round(v / round) * round; m.set(k, (m.get(k) || 0) + w); } let best = 0, bw = -1; for (const [k, w] of m) if (w > bw) { best = k; bw = w; } return best; };

// ------------------------------------------------------------------ 1. pdf.js items -> lines
export async function extractPdfLines(buffer, { maxPages = 400 } = {}) {
  const lib = await import("../vendor/pdfjs/pdf.min.mjs");
  lib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const doc = await lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p), vp = page.getViewport({ scale: 1 });
    try { await page.getOperatorList(); } catch { /* font names are a bonus */ }
    const tc = await page.getTextContent();
    const fontInfo = {};
    const style = (name) => {
      if (fontInfo[name]) return fontInfo[name];
      let real = "", fam = (tc.styles[name] || {}).fontFamily || "";
      try { const o = page.commonObjs.get(name); real = (o && (o.name || o.loadedName)) || ""; } catch { /* not loaded */ }
      return (fontInfo[name] = { b: BOLD.test(real), i: ITAL.test(real), m: fam === "monospace" || MONO.test(real) });
    };
    const items = tc.items.filter((it) => typeof it.str === "string" && it.str !== "" && it.width >= 0).map((it) => {
      const h = Math.abs(it.transform[3]) || it.height || 10;
      return { t: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h, ...style(it.fontName) };
    });
    pages.push({ width: vp.width, height: vp.height, lines: groupLines(items) });
  }
  return { pages, numPages: doc.numPages, truncated: doc.numPages > maxPages };
}

// items on one baseline become a line of styled runs
export function groupLines(items) {
  const real = items.filter((i) => i.t.trim() && i.h > 0.5).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of real) { const r = rows[rows.length - 1]; if (r && Math.abs(r.y - it.y) <= Math.max(1.5, r.h * 0.35)) r.items.push(it); else rows.push({ y: it.y, h: it.h, items: [it] }); }
  // spaces sit between the real items; keep them so words are not glued, and add one where the gap says so
  const spaces = items.filter((i) => !i.t.trim()), trust = spaces.length >= real.length * 0.1; // files that spell their spaces out are trusted; others are judged by the gap
  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    const parts = []; let prevEnd = null, prev = null; const segs = []; let seg = [];
    for (const it of r.items) {
      if (prev) {
        const gap = it.x - prevEnd, hasSpace = /\s$/.test(prev.t) || /^\s/.test(it.t) || spaces.some((s) => Math.abs(s.y - r.y) <= r.h * 0.4 && s.x >= prevEnd - 1 && s.x <= it.x + 1);
        if (gap > r.h * 1.4) { segs.push(seg); seg = []; parts.push({ t: " ", b: false, i: false, m: false }); }
        else if (hasSpace || gap > r.h * (trust ? 0.6 : 0.22)) { parts.push({ t: " ", b: prev.b && it.b, i: prev.i && it.i, m: prev.m && it.m }); }
      }
      parts.push({ t: it.t, b: it.b, i: it.i, m: it.m }); seg.push(it); prev = it; prevEnd = it.x + it.w;
    }
    segs.push(seg);
    const x0 = r.items[0].x, x1 = Math.max(...r.items.map((i) => i.x + i.w));
    const chars = (f) => parts.reduce((s, p) => s + (f(p) ? p.t.replace(/\s/g, "").length : 0), 0), all = Math.max(1, chars(() => true));
    const size = mode(r.items.map((i) => [i.h, i.t.length]), 0.5);
    return { y: r.y, x0, x1, h: size, runs: merge(parts), text: parts.map((p) => p.t).join("").replace(/\s+/g, " ").trim(), bold: chars((p) => p.b) / all > 0.92, mono: chars((p) => p.m) / all > 0.7,
      segs: segs.map((s) => ({ x0: s[0].x, x1: Math.max(...s.map((i) => i.x + i.w)), runs: merge(s.flatMap((it, k) => (k ? [{ t: " ", b: false, i: false, m: false }] : []).concat([{ t: it.t, b: it.b, i: it.i, m: it.m }]))) })), cw: (() => { const m = r.items.find((i) => i.m && i.t.length > 2); return m ? m.w / m.t.length : 0; })() };
  });
}
const merge = (runs) => { const out = []; for (const r of runs) { const l = out[out.length - 1]; if (l && l.b === r.b && l.i === r.i && l.m === r.m) l.t += r.t; else out.push({ ...r }); } return out; };
const JOIN = "\u0001"; // where one line continued into the next
const wrap = (runs, { plainBold = false } = {}) => {
  let out = "";
  for (const r of merge(runs)) {
    if (r.t === JOIN) { out += JOIN; continue; }
    const t = r.t.replace(/\s+/g, " "); if (!t) continue; if (!t.trim()) { out += t; continue; }
    const lead = /^\s*/.exec(t)[0], trail = /\s*$/.exec(t)[0], core = t.trim();
    let o = r.m ? "`" + core.replace(/`/g, "'") + "`" : escMd(core);
    if (r.i && !r.m) o = "*" + o + "*"; if (r.b && !plainBold && !r.m) o = "**" + o + "**";
    out += lead + o + trail;
  }
  return out.replace(/(\w{2})-\u0001(?=\w)/g, "$1-").replace(/\u0001/g, " ").replace(/\*\*(\s+)\*\*/g, "$1").replace(/ +/g, " ")
    .replace(/([A-Za-z]) (ffi|ffl|fi|fl|ff) (?=[a-z])/g, "$1$2").replace(/(^|[\s(\[*`"“])(ffi|ffl|fi|fl|ff) (?=[a-z]{2})/g, "$1$2") // ligatures come out as separate pieces
    .replace(/\*\*([:,.;)]+)\*\*/g, "$1").replace(/` +([,.;:)])(?!\w)/g, "`$1").replace(/\( +/g, "(").trim();
};

// ------------------------------------------------------------------ 2. lines -> blocks (pure, unit tested)
const BULLET = /^[-•·▪●○◦■□◆▸►‣⁃–—-]\s*(?=\S)/u, NUMBER = /^(\d{1,3})[.)]\s+(?=\S)/, TERMINAL = /[.!?:;)]["'”]?$/;
const PART = /^(part|chapter|unit|module)\s+([ivxlcdm]+|\d+)\b/i, SECTION = /^(section|topic|lesson)\s+(\d+|[ivxlcdm]+)\b/i, QUESTION = /^(q(uestion)?\.?\s*\d+|question)\s*[:.)\-–—]/i;
const norm = (t) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

export function linesToBlocks(pages) {
  const notes = [];
  // running headers and footers: the same text (digits aside) in the top or bottom band of several pages
  const band = new Map();
  pages.forEach((pg) => { const seen = new Set(); for (const l of pg.lines) { if (l.y < pg.height * 0.08 || l.y > pg.height * 0.9) { const k = norm(l.text); if (!seen.has(k)) { seen.add(k); band.set(k, (band.get(k) || 0) + 1); } } } });
  const need = pages.length >= 4 ? Math.max(2, Math.ceil(pages.length * 0.4)) : 2;
  const isNoise = (pg, l) => (l.y < pg.height * 0.08 || l.y > pg.height * 0.9) && ((pages.length >= 2 && band.get(norm(l.text)) >= need) || /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(l.text));
  const all = []; // { l, pg, first }
  pages.forEach((pg, pi) => { const keep = pg.lines.filter((l) => !isNoise(pg, l)).sort((a, b) => a.y - b.y || a.x0 - b.x0); keep.forEach((l, i) => all.push({ l, pg, pi, top: i === 0 })); });
  if (!all.length) return { blocks: [], notes };
  // page geometry
  const body = mode(all.filter((x) => !x.l.mono).map((x) => [x.l.h, x.l.text.length]), 0.5) || 10;
  const left = (() => { const c = new Map(), ls = all.filter((x) => !x.l.mono && Math.abs(x.l.h - body) < 1); for (const x of ls) { const k = Math.round(x.l.x0 / 3) * 3; c.set(k, (c.get(k) || 0) + 1); } const ok = [...c].filter(([, n]) => n >= Math.max(3, ls.length * 0.04)).map(([k]) => k); return ok.length ? Math.min(...ok) : Math.min(...ls.map((x) => x.l.x0)); })();
  const right = Math.max(...all.map((x) => x.l.x1));
  const steps = []; for (let i = 1; i < all.length; i++) { const a = all[i - 1], b = all[i]; if (a.pi === b.pi && Math.abs(a.l.h - b.l.h) < 1 && !a.l.mono) { const d = b.l.y - a.l.y; if (d > 0 && d < body * 2.4) steps.push(d); } }
  const step = median(steps) || body * 1.3;
  // headings by size: the sizes above body text, largest first
  const sizes = [...new Set(all.filter((x) => x.l.h >= body * 1.12 && x.l.text.length <= 120 && !x.l.mono).map((x) => Math.round(x.l.h)))].sort((a, b) => b - a);
  const lvlOf = (h) => Math.min(3, sizes.indexOf(Math.round(h)) + 1);
  const hasPart = all.some((x) => PART.test(x.l.text) && x.l.bold);
  if (all.filter((x) => x.l.x0 > right * 0.45 && x.l.x1 - x.l.x0 < right * 0.5).length > all.length * 0.35 && all.filter((x) => x.l.x0 < right * 0.3).length > all.length * 0.3) notes.push("This PDF looks like it has two columns. The text is read line by line, so check that the order makes sense.");

  const blocks = []; let para = null, list = null, code = null, tab = null, title = false, prev = null;
  const flush = () => {
    if (para) { blocks.push({ type: "p", text: wrap(para.runs) }); para = null; }
    if (list) { const { kind, items, lv, start } = list; if (list.glyphless && items.length < 2) blocks.push({ type: "p", text: items[0] }); else blocks.push(kind === "ol" ? { type: "ol", items, lv, start } : { type: "ul", items, lv }); list = null; }
    if (code) { const cw = code.lines.map((c) => c.cw).find(Boolean) || body * 0.6, min = Math.min(...code.lines.map((c) => c.x0)); let ind = code.lines.map((c) => Math.round((c.x0 - min) / cw)); if (ind.slice(1).every((n) => n === 0)) ind = ind.map(() => 0); blocks.push({ type: "code", text: code.lines.map((c, i) => " ".repeat(Math.max(0, ind[i])) + c.text.replace(/\s+$/, "")).join("\n") }); code = null; }
    if (tab) { blocks.push(tableBlock(tab, step, body)); tab = null; }
  };
  const gapOf = (a, b) => (a && b && a.pi === b.pi ? b.l.y - a.l.y : 0);
  const i2 = (i) => all[i];

  for (let i = 0; i < all.length; i++) {
    const cur = all[i], l = cur.l, t = l.text, gap = gapOf(prev, cur), newBlockGap = !prev || cur.pi !== prev.pi ? false : gap > step * 1.3;
    const firstRuns = l.runs.find((r) => r.t.trim());
    // --- code
    if (l.mono && t.length && !code && prev && prev.pi === cur.pi && (para || list) && !TERMINAL.test(prev.l.text) && l.x1 - l.x0 < (right - left) * 0.9) { // a code word or two in the middle of a sentence
      if (para) para.runs.push({ t: " ", b: false, i: false, m: false }, ...l.runs); else { list.pending = list.pending.concat([{ t: " ", b: false, i: false, m: false }], l.runs); finishItem(list); }
      prev = cur; continue;
    }
    if (l.mono && t.length) { if (!code) { flush(); code = { lines: [] }; } code.lines.push(l); prev = cur; continue; }
    if (code) flush();
    // --- title: one big line at the very top of the first page
    if (!title && cur.pi === 0 && !blocks.length && sizes.length && Math.round(l.h) === sizes[0] && l.h >= body * 1.5) { flush(); const lines = [l.text]; let j = i + 1; while (j < all.length && all[j].pi === 0 && Math.round(all[j].l.h) === sizes[0] && all[j].l.y - all[j - 1].l.y < l.h * 1.8) lines.push(all[j++].l.text); blocks.push({ type: "title", text: escMd(lines.join(" ")) }); title = true; i = j - 1; prev = all[i]; continue; }
    // --- tables: lines split into 2+ cells by wide gaps
    const cells = l.segs.length;
    if (cells >= 2 && cells <= 8 && !l.mono) { if (!tab) { flush(); tab = { lines: [] }; } tab.lines.push({ l, y: cur.pi * 1e5 + l.y }); prev = cur; continue; }
    if (tab) {
      // a wrapped cell: one segment sitting under a column and close to the previous line
      const fits = columnsOf(tab.lines, body * 0.8).some((c) => l.x0 >= c[0] - 3 && l.x1 <= c[1] + 3);
      const headingish = l.h >= body * 1.12 || QUESTION.test(t) || PART.test(t) || (l.bold && t.length < 90 && gap > step * 1.4);
      if (fits && !headingish && gap < step * 1.9 && gap > 0) { tab.lines.push({ l, y: cur.pi * 1e5 + l.y }); prev = cur; continue; }
      flush();
    }
    // --- headings
    const part = PART.test(t) || SECTION.test(t), q = QUESTION.test(t);
    const sized = l.h >= body * 1.12 && t.length <= 120 && !TERMINAL.test(t.replace(/:$/, ""));
    const boldLine = l.bold && t.length <= 110 && cells === 1;
    if ((part && (l.bold || sized)) || (q && l.bold) || sized || (boldLine && !NUMBER.test(t) && (newBlockGap || !prev || cur.top) && !/[.,;]$/.test(t))) {
      flush();
      let level = sized ? lvlOf(l.h) : 3; if (part && PART.test(t)) level = Math.min(level || 1, 1) || 1; else if (q) level = hasPart ? 2 : 1; else if (part) level = 2;
      let n = 0, text = wrap(l.runs, { plainBold: true }); const nh = !q && !part ? /^(\d{1,3})[.)]\s+(\S.*)$/.exec(text) : null; if (nh) { n = +nh[1]; text = nh[2]; }
      // a heading that wraps onto the next line of the same size
      let txt = text; while (i + 1 < all.length && all[i + 1].pi === cur.pi && Math.abs(all[i + 1].l.h - l.h) < 0.6 && all[i + 1].l.y - all[i].l.y < l.h * 1.6 && all[i + 1].l.bold === l.bold && sized) { i++; txt += " " + wrap(all[i].l.runs, { plainBold: true }); }
      blocks.push({ type: "h", n, level: Math.max(1, Math.min(4, level)), text: txt, _sz: l.h }); prev = all[i]; continue;
    }
    // --- list items: glyph, number, or an indented block of items
    const indented = l.x0 >= (para && !para.indented ? para.x0 : left) + body * 0.9, bm = BULLET.exec(t) && (l.x0 >= left - 2), nm = NUMBER.exec(t);
    const strip = (re) => { let m = re.exec(t)[0].replace(/\s/g, "").length; return l.runs.map((r) => { if (m <= 0) return { ...r }; const out = []; for (const c of r.t) { if (m > 0) { if (!/\s/.test(c)) m--; continue; } out.push(c); } return { ...r, t: out.join("") }; }); };
    if (bm || nm) {
      const kind = nm ? "ol" : "ul", lv = 0;
      if (para) { blocks.push({ type: "p", text: wrap(para.runs) }); para = null; }
      if (!list || list.kind !== kind) { flush(); list = { kind, items: [], lv: [], runs: null, start: nm ? +nm[1] : 1 }; }
      list.items.push(null); list.lv.push(lv); list.cur = strip(bm ? BULLET : NUMBER); list.curX = l.x0; list.hang = l.x0;
      list.pending = list.cur; finishItem(list); prev = cur; list.lastY = cur; continue;
    }
    // indented text without a marker: bullets drawn as pictures leave only the indent
    if (indented && para && !para.indented && prev && TERMINAL.test(prev.l.text)) flush(); // "…as follows:" then an indented run of items
    if (indented && list && !list.glyphless && prev && TERMINAL.test(prev.l.text) && l.x0 > list.hang + body * 0.9 && (newBlockGap || firstRuns?.b)) flush(); // bullets under a numbered item
    if (indented && (!para || (para.indented && prev && TERMINAL.test(prev.l.text)))) {
      const startsItem = !list || list.glyphless && (firstRuns?.b || (TERMINAL.test(prev.l.text) && gap > step * 1.08 && /^[A-Z0-9"“(]/.test(t)));
      if (!list || (list.glyphless && startsItem)) {
        if (!list) { flush(); list = { kind: "ul", items: [], lv: [], glyphless: true, start: 1 }; }
        list.items.push(null); list.lv.push(0); list.pending = l.runs; finishItem(list, true); prev = cur; list.lastY = cur; continue;
      }
      if (list && list.glyphless) { list.pending = list.pending.concat([{ t: JOIN, b: false, i: false, m: false }], l.runs); finishItem(list, true); prev = cur; continue; }
    }
    // continuation of a list item: same or deeper indent, no gap
    if (list && !newBlockGap && l.x0 >= list.hang - 2 && !list.glyphless) { list.pending = list.pending.concat([{ t: JOIN, b: false, i: false, m: false }], l.runs); finishItem(list); prev = cur; continue; }
    if (list) flush();
    // --- paragraphs
    const short = prev && prev.pi === cur.pi && prev.l.x1 < right - body * 8 && TERMINAL.test(prev.l.text) && !prev.l.bold;
    const pageJoin = prev && prev.pi !== cur.pi && para && !TERMINAL.test(prev.l.text.replace(/[,]$/, ""));
    if (para && (newBlockGap || short || (!pageJoin && prev.pi !== cur.pi && false))) flush();
    if (!para) para = { runs: [], indented, x0: l.x0 };
    if (para.runs.length) para.runs.push({ t: JOIN, b: false, i: false, m: false });
    para.runs.push(...l.runs); prev = cur;
  }
  flush();
  // no big title line: the largest heading among the first few blocks is the title (a small label above it becomes plain text)
  if (!title) {
    const head = blocks.slice(0, 4).map((b, i) => ({ b, i })).filter((x) => x.b.type === "h");
    if (head.length) { const best = head.reduce((a, c) => ((c.b._sz || 0) > (a.b._sz || 0) ? c : a)); if (best.b._sz > body * 1.3) { const before = blocks.slice(0, best.i).map((b) => (b.type === "h" ? { type: "p", text: b.text } : b)); blocks.splice(0, best.i + 1, { type: "title", text: best.b.text }, ...before); } }
  }
  blocks.forEach((b) => delete b._sz);
  return { blocks: blocks.filter((b) => (b.text ?? "x") !== "" || b.type === "hr"), notes };
}

// a list item's text is kept as runs until the item ends, so bold labels survive
function finishItem(list) { list.items[list.items.length - 1] = wrap(list.pending).replace(/\*\*:\*\*/g, ":"); }

// columns are the stretches of the page that some cell text covers; the empty strips between them separate columns
function columnsOf(lines, gap) {
  const iv = lines.flatMap(({ l }) => l.segs.map((s) => [s.x0, s.x1])).sort((a, b) => a[0] - b[0]), out = [];
  for (const [a, b] of iv) { const last = out[out.length - 1]; if (last && a - last[1] < gap) last[1] = Math.max(last[1], b); else out.push([a, b]); }
  return out;
}
function tableBlock(tab, step, body) {
  const cols = columnsOf(tab.lines, body * 0.8).map((c) => c[0]);
  const colOf = (x, x1) => { let k = 0, best = 1e9; const cx = (x + x1) / 2; const ivs = columnsOf(tab.lines, body * 0.8); ivs.forEach((c, i) => { const d = cx >= c[0] && cx <= c[1] ? 0 : Math.min(Math.abs(cx - c[0]), Math.abs(cx - c[1])); if (d < best) { best = d; k = i; } }); return k; };
  const rows = []; let last = null;
  for (const { l, y } of tab.lines) {
    const startNew = last === null || y - last > step * 1.28;
    if (startNew) rows.push(cols.map(() => []));
    const row = rows[rows.length - 1];
    for (const s of l.segs) { const c = colOf(s.x0, s.x1); if (row[c].length) row[c].push({ t: JOIN, b: false, i: false, m: false }); row[c].push(...s.runs); }
    last = y;
  }
  return { type: "table", rows: rows.map((r) => r.map((c) => wrap(c))) };
}

export async function readPdfNative(buffer) {
  const { pages, numPages, truncated } = await extractPdfLines(buffer);
  const chars = pages.reduce((s, p) => s + p.lines.reduce((a, l) => a + l.text.length, 0), 0);
  if (chars < 20) return { blocks: [], pages: numPages, scanned: true };
  const { blocks, notes } = linesToBlocks(pages);
  return { blocks, pages: numPages, truncated, notes };
}
