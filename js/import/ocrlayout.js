// Turns OCR word boxes into a readable article: reading order across columns, a title, numbered
// headings, bullets, tables and paragraphs. Pure functions, no browser needed, so it is unit tested.
//
// Input:  { width, height, lines: [{ words: [{ text, conf, x0, y0, x1, y1 }] }] }
// Output: { blocks: [{ type: "title"|"h"|"p"|"ul"|"table", ... }], markdown, stats }

const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const clean = (t) => t.replace(/\s+/g, " ").trim();

function toLine(l) {
  // drop table borders, ruled-paper marks and other specks that are not words
  const ws = l.words.filter((w) => w.text && w.text.trim() && !/^[|\]\[!¦_~.,'`^\\/-]{1,3}$/.test(w.text.trim()) && !(w.conf < 35 && w.text.trim().length <= 2 && !/^\d+[.)]?$/.test(w.text.trim()))).sort((a, b) => a.x0 - b.x0);
  if (!ws.length) return null;
  while (ws.length > 1 && /^[A-Za-z]$/.test(ws[0].text.trim()) && !/^[aAI]$/.test(ws[0].text.trim()) && ws[1].x0 - ws[0].x1 > 0) ws.shift(); // a stray letter from a table border or margin mark
  if (!ws.length) return null;
  const x0 = Math.min(...ws.map((w) => w.x0)), x1 = Math.max(...ws.map((w) => w.x1));
  const y0 = Math.min(...ws.map((w) => w.y0)), y1 = Math.max(...ws.map((w) => w.y1));
  return { words: ws, x0, x1, y0, y1, h: med(ws.map((w) => w.y1 - w.y0)), cy: (y0 + y1) / 2 };
}

// split a line wherever there is a wide empty gap (two columns or table cells printed on one text line)
function splitAtGaps(line, minGap) {
  const parts = []; let cur = [line.words[0]];
  for (let i = 1; i < line.words.length; i++) {
    const w = line.words[i], p = line.words[i - 1];
    if (w.x0 - p.x1 > minGap) { parts.push(cur); cur = []; }
    cur.push(w);
  }
  parts.push(cur);
  return parts.map((ws) => toLine({ words: ws }));
}

// find the vertical gutter between two columns, or null for a single column page
export function findGutter(lines, width) {
  const body = lines.filter((l) => l.x1 - l.x0 < width * 0.62);
  if (body.length < 8) return null;
  const lo = Math.round(width * 0.3), hi = Math.round(width * 0.7), cover = new Uint16Array(width + 1);
  for (const l of body) for (let x = Math.max(0, Math.floor(l.x0)); x <= Math.min(width, Math.ceil(l.x1)); x++) cover[x]++;
  let best = null, runStart = -1;
  for (let x = lo; x <= hi + 1; x++) {
    const free = x <= hi && cover[x] <= Math.max(1, body.length * 0.03);
    if (free && runStart < 0) runStart = x;
    if (!free && runStart >= 0) { const len = x - runStart; if (!best || len > best.len) best = { from: runStart, to: x, len }; runStart = -1; }
  }
  if (!best || best.len < width * 0.012) return null;
  const mid = (best.from + best.to) / 2;
  const left = body.filter((l) => l.x1 <= mid).length, right = body.filter((l) => l.x0 >= mid).length;
  if (left < 4 || right < 4) return null;
  return mid;
}

const BULLET = /^[•·*+\-–—«»▪●○◦@®©\u2460-\u2473\u2776-\u277F]\s*(?=\S)/u;
const PAGENO = /^[-–— ]*(page\s*)?\d{1,3}(\s*(of|\/)\s*\d{1,3})?[-–— ]*$/i; // "3", "Page 3", "3 / 10" are page numbers, not content
const NUMHEAD = /^(\d{1,2})\s*[.)]\s+(\S.*)$/;

const medConf = (l) => med(l.words.map((w) => w.conf));
function cleanLine(text) {
  return clean(text.replace(/^[|\]\[!¦]+\s*/, "").replace(/\s*[|¦]+$/, "").replace(/\s+([,.;:?!])/g, "$1"));
}

export function layoutToArticle(ocr, { renumber = true } = {}) {
  const W = ocr.width || 1000;
  let lines = ocr.lines.map(toLine).filter(Boolean);
  const hAll = med(lines.map((l) => l.h)) || 20;

  // 1. reading order: full width lines (title) first, then left column, then right column
  const gutter = findGutter(lines, W);
  let ordered = [];
  if (gutter) {
    const split = [];
    for (const l of lines) {
      const crosses = l.x0 < gutter - 4 && l.x1 > gutter + 4;
      if (crosses && l.x1 - l.x0 < W * 0.62) split.push(...splitAtGaps(l, hAll * 1.5).filter(Boolean)); // a left and a right line glued together
      else split.push(l);
    }
    const spanning = split.filter((l) => l.x0 < gutter - 4 && l.x1 > gutter + 4);
    const left = split.filter((l) => !spanning.includes(l) && (l.x0 + l.x1) / 2 < gutter);
    const right = split.filter((l) => !spanning.includes(l) && (l.x0 + l.x1) / 2 >= gutter);
    const top = spanning.filter((l) => l.cy < Math.min(...[...left, ...right].map((x) => x.y0)) + hAll * 2).sort((a, b) => a.cy - b.cy);
    const rest = spanning.filter((l) => !top.includes(l));
    const byY = (a, b) => a.cy - b.cy;
    ordered = [...top, ...[...left, ...rest.filter((l) => (l.x0 + l.x1) / 2 < gutter)].sort(byY), ...[...right, ...rest.filter((l) => (l.x0 + l.x1) / 2 >= gutter)].sort(byY)];
  } else ordered = [...lines].sort((a, b) => a.cy - b.cy);

  // 2. text of each line, with noise removed
  const lineText = (l) => { const med = medConf(l); let out = [], gapOpen = false; for (const w of l.words) { if (w.conf < 30 && med >= 55 && w.text.length <= 6) { if (!gapOpen) out.push("[…]"); gapOpen = true; } else { out.push(w.text); gapOpen = false; } } return out.join(" "); };
  ordered = ordered.filter((l) => !PAGENO.test(l.words.map((w) => w.text).join(" ").trim()));
  const items = ordered.map((l) => ({ l, t: cleanLine(lineText(l)) })).filter((x) => x.t.replace(/[^\p{L}\p{N}]/gu, "").length >= 2 || /^[•*+-]/.test(x.t));

  // 3. blocks
  const blocks = [];
  let para = null, ul = null, ulX = 0, prev = null, colOf = (l) => (gutter ? ((l.x0 + l.x1) / 2 < gutter ? 0 : 1) : 0);
  const flush = () => { if (para) blocks.push({ type: "p", text: clean(para.join(" ")) }); if (ul) blocks.push({ type: "ul", items: ul }); para = null; ul = null; };

  // tables: runs of >= 3 consecutive lines that each have 2+ cells and the same cell count
  const cellsOf = (l) => splitAtGaps(l, hAll * 1.6).filter(Boolean).map((p) => cleanLine(p.words.map((w) => w.text).join(" ")));
  const tableAt = (i) => {
    const first = cellsOf(items[i].l); if (first.length < 2 || first.length > 5 || items[i].l.x1 - items[i].l.x0 < W * 0.25) return null;
    const rows = [first]; let j = i + 1;
    while (j < items.length && colOf(items[j].l) === colOf(items[i].l)) {
      const c = cellsOf(items[j].l);
      const g = items[j].l.y0 - items[j - 1].l.y1;
      if (c.length >= 1 && (c.length < first.length || g < hAll * 0.1) && g < hAll * 0.9 && rows.length >= 2 && !NUMHEAD.test(items[j].t)) rows[rows.length - 1] = rows[rows.length - 1].map((x, k) => (x + " " + (c[k] || "")).trim()); // wrapped cell
      else if (c.length === first.length && g < hAll * 1.6) rows.push(c);
      else break;
      j++;
    }
    return rows.length >= 3 ? { rows, next: j } : null;
  };

  for (let i = 0; i < items.length; i++) {
    const { l, t } = items[i];
    const big = l.h > hAll * 1.45 && (l.x1 - l.x0) > W * 0.3;
    if (big && !blocks.some((b) => b.type === "title")) { flush(); blocks.push({ type: "title", text: cleanLine(t.replace(/^[•*+\-–—«»★☆]+\s*|\s*[•*+\-–—«»★☆]+$/gu, "").replace(/(^|\s)\d{1,2}[.)](?=\s)/g, " ")) }); prev = l; continue; }
    const tb = tableAt(i);
    if (tb) { flush(); blocks.push({ type: "table", rows: tb.rows }); i = tb.next - 1; prev = items[i].l; continue; }

    const newCol = !!prev && (colOf(prev) !== colOf(l) || l.y0 < prev.y0), gap = prev && !newCol ? l.y0 - prev.y1 : 999;
    const head = t.match(NUMHEAD);
    const isHead = head && t.length <= 64 && !/[.,;]$/.test(t) && !/^\d+[.)]\s+(HTTP|GET|POST)\b/.test(t) && (l.h >= hAll * 0.95 || t.length <= 40) && (!prev || gap > hAll * 0.5 || newCol);
    const bm = BULLET.exec(t);
    if (isHead) { flush(); blocks.push({ type: "h", n: +head[1], text: head[2].replace(/\s*[:?]\s*$/, (m) => m.trim()).replace(/\s+\?/, "?") }); }
    else if (bm) { if (para) { blocks.push({ type: "p", text: clean(para.join(" ")) }); para = null; } ul ||= []; ulX = l.x0; ul.push(t.slice(bm[0].length).trim()); }
    else if (ul && gap < hAll * 0.9 && !newCol && l.x0 > ulX + hAll * 1.5) ul[ul.length - 1] += " " + t; // wrapped bullet (indented under its marker)
    else if (ul && gap < hAll * 1.3 && !newCol && Math.abs(l.x0 - ulX) < hAll * 1.5 && t.length < 70) ul.push(t); // bullet whose marker the OCR missed
    else {
      if (ul) { blocks.push({ type: "ul", items: ul }); ul = null; }
      if (para && (gap > hAll * 1.7 || newCol)) flush();
      (para ||= []).push(t);
    }
    prev = l;
  }
  flush();

  // 4. repair heading numbers (OCR reads 1 as 4 and so on) when the sequence is clearly 1, 2, 3 ...
  const heads = blocks.filter((b) => b.type === "h");
  if (renumber) repairNumbers(heads);
  // headings that are only a number-less label stay as they are

  const stats = { lines: lines.length, columns: gutter ? 2 : 1, headings: heads.length, tables: blocks.filter((b) => b.type === "table").length, bullets: blocks.filter((b) => b.type === "ul").reduce((s, b) => s + b.items.length, 0) };
  return { blocks, markdown: toMarkdown(blocks), stats };
}

export function toMarkdown(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === "title") out.push("# " + b.text);
    else if (b.type === "h") out.push(`## ${b.n}. ${b.text}`);
    else if (b.type === "p") out.push(b.text);
    else if (b.type === "ul") out.push(b.items.map((x) => "- " + x).join("\n"));
    else if (b.type === "table") {
      const [h, ...r] = b.rows; const row = (c) => "| " + c.join(" | ") + " |";
      out.push([row(h), row(h.map(() => "---")), ...r.map(row)].join("\n"));
    }
  }
  return out.join("\n\n");
}

// Markdown back into blocks (the review box is editable, so what you save is what you edited)
export function fromMarkdown(md) {
  const blocks = [], paras = String(md).replace(/\r/g, "").split(/\n\s*\n/);
  for (const p of paras) {
    const lines = p.split("\n").map((x) => x.trimEnd()).filter((x) => x.trim());
    if (!lines.length) continue;
    if (/^#\s/.test(lines[0])) { blocks.push({ type: "title", text: lines[0].replace(/^#\s+/, "") }); lines.shift(); }
    if (lines.length && /^##\s/.test(lines[0])) { const m = lines[0].replace(/^##\s+/, "").match(/^(\d{1,2})[.)]\s+(.*)$/); blocks.push({ type: "h", n: m ? +m[1] : 0, text: m ? m[2] : lines[0].replace(/^##\s+/, "") }); lines.shift(); }
    if (!lines.length) continue;
    if (lines.every((x) => /^\|.*\|$/.test(x.trim()))) {
      const rows = lines.filter((x) => !/^\|\s*:?-{2,}/.test(x.trim())).map((x) => x.trim().slice(1, -1).split("|").map((c) => c.trim()));
      blocks.push({ type: "table", rows });
    } else if (lines.every((x) => /^[-*•]\s/.test(x))) blocks.push({ type: "ul", items: lines.map((x) => x.replace(/^[-*•]\s+/, "")) });
    else blocks.push({ type: "p", text: lines.join(" ") });
  }
  return blocks;
}


// Numbers of headings should run n, n+1, n+2 ... in reading order. If most of them already do, fix the odd ones (OCR reads 1 as 4 and so on).
export function repairNumbers(heads) {
  if (heads.length < 3) return;
  const votes = new Map();
  heads.forEach((h, i) => { if (h.n) votes.set(h.n - i, (votes.get(h.n - i) || 0) + 1); });
  let best = 0, bestV = 0;
  for (const [off, v] of votes) if (v > bestV || (v === bestV && off < best)) { best = off; bestV = v; }
  if (bestV >= heads.length / 2 && best >= 0) heads.forEach((h, i) => { h.n = i + best; });
}

const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const endsSentence = (t) => /[.?!:;)"”]$/.test(t.trim());

// Join pages read one by one into a single article. Pages are in the order the person chose, so text that runs on
// from one page to the next is joined, numbering carries on, and running headers or page numbers are dropped.
export function mergeArticles(pages) {
  const out = []; let firstTitle = null;
  const header = new Map(); // text that is the first or last line on several pages is a running header or footer
  pages.forEach((bl) => { for (const b of [bl[0], bl[bl.length - 1]]) if (b && b.type === "p" && b.text.length < 60) header.set(norm(b.text), (header.get(norm(b.text)) || 0) + 1); });
  pages.forEach((bl, pi) => {
    bl = bl.map((b) => ({ ...b, items: b.items && [...b.items], rows: b.rows && b.rows.map((r) => [...r]) }));
    bl = bl.filter((b, i) => !((i === 0 || i === bl.length - 1) && b.type === "p" && header.get(norm(b.text)) >= 2 && pages.length > 1));
    bl.forEach((b, i) => {
      if (b.type === "title") {
        if (!firstTitle) { firstTitle = norm(b.text); out.push(b); }
        else if (norm(b.text) !== firstTitle) out.push({ type: "h", n: 0, text: b.text });
        return;
      }
      const last = out[out.length - 1];
      if (i === 0 && last) {
        if (b.type === "p" && last.type === "p" && !endsSentence(last.text)) { last.text += " " + b.text; return; } // sentence runs on to the next page
        if (b.type === "ul" && last.type === "ul") { last.items.push(...b.items); return; }
        if (b.type === "table" && last.type === "table" && last.rows[0].length === b.rows[0].length) { last.rows.push(...b.rows); return; }
        if (b.type === "p" && last.type === "ul" && /^[a-z(]/.test(b.text)) { last.items[last.items.length - 1] += " " + b.text; return; }
      }
      out.push(b);
    });
  });
  repairNumbers(out.filter((b) => b.type === "h" && b.n));
  return out;
}

// Do the pages follow each other? Compares the numbering where one page ends and the next begins.
export function sequenceWarnings(pages) {
  const nums = pages.map((bl) => { const h = bl.filter((b) => b.type === "h" && b.n); return h.length ? { first: h[0].n, last: h[h.length - 1].n } : null; });
  const w = []; let prev = null;
  nums.forEach((n, i) => {
    if (!n) return;
    if (prev && n.first <= prev.n.last && n.first !== prev.n.last) w.push({ page: i, msg: `Page ${i + 1} starts at section ${n.first} but page ${prev.i + 1} ends at ${prev.n.last}. Are the pages in the right order?` });
    prev = { n, i };
  });
  return w;
}
// the order that makes the numbering run upwards, or null when it cannot be told
export function suggestOrder(pages) {
  const nums = pages.map((bl) => { const h = bl.filter((b) => b.type === "h" && b.n); return h.length ? h[0].n : null; });
  if (nums.some((n) => n === null) || new Set(nums).size !== nums.length) return null;
  const idx = nums.map((_, i) => i).sort((a, b) => nums[a] - nums[b]);
  return idx.every((v, i) => v === i) ? null : idx;
}
