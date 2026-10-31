// Extract text lines from a PDF with the bundled PDF.js (works offline).
export async function readPdf(buffer) {
  const lib = await import("../vendor/pdfjs/pdf.min.mjs");
  lib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  const doc = await lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const pages = [];
  const sizes = [];
  const maxPages = Math.min(doc.numPages, 400);
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((i) => typeof i.str === "string" && i.str.trim() !== "" || i.hasEOL).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], h: Math.abs(i.height || i.transform[3] || 10) }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.max(2, last.h * 0.45)) last.parts.push(it);
      else lines.push({ y: it.y, h: it.h, parts: [it] });
    }
    const out = [];
    for (const ln of lines) {
      ln.parts.sort((a, b) => a.x - b.x);
      let text = "", prevEnd = null;
      for (const pt of ln.parts) {
        const gap = prevEnd === null ? 0 : pt.x - prevEnd;
        if (text && gap > pt.h * 0.18 && !text.endsWith(" ") && !pt.s.startsWith(" ")) text += " ";
        text += pt.s; prevEnd = pt.x + pt.s.length * pt.h * 0.5;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (text) { out.push({ y: ln.y, text, size: Math.max(...ln.parts.map((x) => x.h)) }); sizes.push(Math.max(...ln.parts.map((x) => x.h))); }
    }
    pages.push(out);
  }
  const med = sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] || 10;
  // Running headers/footers: only the first/last two lines of a page can be one, and only if the same text
  // (ignoring digits) sits there on at least half the pages. Lines in the middle of a page are never dropped,
  // and answer/option/question lines are never treated as headers ("And : C" repeats on most pages!).
  const shape = (t) => t.toLowerCase().replace(/\d+/g, "#");
  const edge = (pg) => [...pg.slice(0, 2), ...pg.slice(-2)];
  const freq = new Map();
  for (const pg of pages) for (const t of new Set(edge(pg).map((l) => shape(l.text)))) freq.set(t, (freq.get(t) || 0) + 1);
  const content = /^\s*(?:(?:Q(?:uestion)?\s*)?\d{1,4}\s*[.):\-–]|\(?[A-Ea-e]\s*[).:]\s|(?:and|ans(?:wer)?|correct\s+answer|key)\s*[:.\-–=])/i;
  const isEdge = (pg, l) => pg.indexOf(l) < 2 || pg.indexOf(l) >= pg.length - 2;
  const repeated = (pg, l) => pages.length >= 2 && l.text.length < 120 && isEdge(pg, l) && !content.test(l.text) && (freq.get(shape(l.text)) || 0) >= Math.max(2, Math.ceil(pages.length * 0.5));
  const pageNo = /^(?:page\s*)?\d{1,4}(?:\s*(?:\/|of)\s*\d{1,4})?$/i;
  const blocks = [];
  for (const pg of pages) {
    let prevY = null, gaps = [];
    for (let i = 1; i < pg.length; i++) gaps.push(pg[i - 1].y - pg[i].y);
    const g = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || med * 1.3;
    pg.forEach((l) => {
      if (repeated(pg, l) || pageNo.test(l.text)) return;
      if (prevY !== null && prevY - l.y > g * 1.7) blocks.push({ text: "" });
      prevY = l.y;
      blocks.push({ text: l.text, heading: l.size >= med * 1.12 && l.text.length <= 90 && !/[.,;]$/.test(l.text) ? 2 : 0 });
    });
    blocks.push({ text: "" });
  }
  return { blocks, pages: doc.numPages };
}
