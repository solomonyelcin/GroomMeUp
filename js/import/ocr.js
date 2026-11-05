// Reads text from pictures (photos, screenshots, scanned pages) entirely in the browser.
// The reading engine is Tesseract.js (free, open source). It is fetched once from a public CDN and
// then kept by the browser, so nothing about your pictures is ever uploaded.
import { toGray, analyse, estimate } from "./imgmetrics.js";
import { layoutToArticle, mergeArticles } from "./ocrlayout.js";

const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js";
export const IMAGE_TYPES = /\.(png|jpe?g|webp|bmp|gif)$/i;
export const isImage = (f) => /^image\//.test(f.type) || IMAGE_TYPES.test(f.name || "");

async function decode(file) {
  if (typeof createImageBitmap === "function") { try { return await createImageBitmap(file); } catch { /* fall back */ } }
  const url = URL.createObjectURL(file);
  try { return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("This picture could not be opened.")); im.src = url; }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
}
const cnv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

// Step 1: open the picture, trim dark bars, measure its quality and estimate the accuracy you can expect.
export async function inspect(file) {
  const img = await decode(file);
  const W = img.width, H = img.height;
  // measure on a copy no larger than 1600px on the long side (fast), then map the crop back to full size
  const k = Math.min(1, 1600 / Math.max(W, H));
  const small = cnv(Math.round(W * k), Math.round(H * k));
  const sctx = small.getContext("2d", { willReadFrequently: true }); sctx.drawImage(img, 0, 0, small.width, small.height);
  const gray = toGray(sctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
  const m = analyse(gray);
  const box = { x: Math.round(m.box.x / k), y: Math.round(m.box.y / k), w: Math.round(m.box.w / k), h: Math.round(m.box.h / k) };
  m.cropped = box.w < W * 0.98 || box.h < H * 0.98;
  const full = { ...m, pitch: Math.round(m.pitch / k), longSide: Math.max(box.w, box.h) };
  const est = estimate(full);
  const preview = cnv(Math.min(720, box.w), Math.round(box.h * Math.min(720, box.w) / box.w));
  preview.getContext("2d").drawImage(img, box.x, box.y, box.w, box.h, 0, 0, preview.width, preview.height);
  return { file, img, box, metrics: full, est, preview };
}

// Step 2: prepare the cropped page for reading (grayscale, stretched contrast, sensible size)
function prepare(info) {
  const { img, box } = info;
  const target = box.w < 1400 ? 1.5 : box.w > 3200 ? 3200 / box.w : 1;
  const c = cnv(Math.round(box.w * target), Math.round(box.h * target));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height), p = d.data, hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) { const g = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0; p[i] = g; hist[g]++; }
  const n = c.width * c.height; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.01) { hi = v; break; } }
  const sc = 255 / Math.max(30, hi - lo);
  for (let i = 0; i < p.length; i += 4) { const g = Math.max(0, Math.min(255, (p[i] - lo) * sc)); p[i] = p[i + 1] = p[i + 2] = g; p[i + 3] = 255; }
  ctx.putImageData(d, 0, 0);
  return { canvas: c, scale: target };
}

let enginePromise = null;
async function engine(onStatus) {
  if (typeof window !== "undefined" && window.__ocrEngine) return window.__ocrEngine; // lets tests plug in a stand-in
  if (!enginePromise) {
    enginePromise = (async () => {
      onStatus?.("Downloading the reading engine (about 12 MB, only the first time)…", 0.02);
      let T;
      try { T = await import(/* @vite-ignore */ TESS); } catch { throw new Error("The reading engine could not be downloaded. Check your internet connection once; after that it works offline."); }
      const lib = T.default || T;
      let cur = onStatus;
      const worker = await lib.createWorker("eng", 1, { logger: (m) => { if (m.status === "recognizing text") cur?.("Reading the text…", 0.1 + m.progress * 0.85); else if (/load|init/i.test(m.status || "")) cur?.("Preparing the reading engine…", 0.05); } });
      await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "3" });
      return { worker, setStatus: (f) => { cur = f; } };
    })().then((e) => ({
      async recognize(canvas, onStatus2) {
        e.setStatus(onStatus2);
        const { data } = await e.worker.recognize(canvas, {}, { blocks: true });
        const lines = [];
        for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) lines.push({ words: (l.words || []).map((w) => ({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 })) });
        if (!lines.length && data.words) lines.push(...data.words.map((w) => ({ words: [{ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }] })));
        return { width: canvas.width, height: canvas.height, lines };
      },
    })).catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}

// Step 3: read one page. Returns the article blocks, markdown and a measured confidence.
export async function extract(info, onStatus) {
  const { canvas, scale } = prepare(info);
  const eng = await engine(onStatus);
  const raw = await eng.recognize(canvas, onStatus);
  const words = raw.lines.flatMap((l) => l.words).filter((w) => w.text && w.text.trim());
  const good = words.filter((w) => w.conf >= 80).length, unsure = words.filter((w) => w.conf < 60);
  const art = layoutToArticle(raw, { renumber: false });
  const conf = words.length ? words.reduce((s, w) => s + Math.max(0, w.conf), 0) / words.length : 0;
  return { ...art, raw, scale, words: words.length, conf: Math.round(conf), sure: words.length ? Math.round((good / words.length) * 100) : 0, unsure };
}

// draw the page with the words the engine was unsure about outlined, so you know where to look
export function markUnsure(info, result) {
  const { box } = info, k = result.scale;
  const c = cnv(Math.min(900, box.w), Math.round(box.h * Math.min(900, box.w) / box.w)), ctx = c.getContext("2d");
  ctx.drawImage(info.img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
  const f = c.width / (box.w * k);
  ctx.lineWidth = 2;
  for (const w of result.words ? result.raw.lines.flatMap((l) => l.words) : []) {
    if (w.conf >= 60) continue;
    ctx.strokeStyle = w.conf < 30 ? "#d03b3b" : "#e08a00";
    ctx.strokeRect(w.x0 * f - 1, w.y0 * f - 1, (w.x1 - w.x0) * f + 2, (w.y1 - w.y0) * f + 2);
  }
  return c;
}

// merge pages (in the order given) into one article
export const mergePages = (pages) => mergeArticles(pages.map((p) => p.blocks));
