// Quick quality checks on a picture before it is read (pure functions on grayscale pixels, so they can be tested).
// gray = { data: Uint8Array|Uint8ClampedArray, w, h }

export function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  return { data: g, w, h };
}

// rows/columns at the edges that are dark bars (phone status bars, black margins) are not part of the page
export function findContent({ data, w, h }) {
  const rowMean = (y) => { let s = 0; for (let x = 0; x < w; x += 2) s += data[y * w + x]; return s / Math.ceil(w / 2); };
  let top = 0, bottom = h - 1;
  while (top < h - 1 && rowMean(top) < 45) top++;
  while (bottom > top && rowMean(bottom) < 45) bottom--;
  const colMean = (x) => { let s = 0, n = 0; for (let y = top; y <= bottom; y += 2) { s += data[y * w + x]; n++; } return s / Math.max(1, n); };
  let left = 0, right = w - 1;
  while (left < w - 1 && colMean(left) < 45) left++;
  while (right > left && colMean(right) < 45) right--;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// estimated height of a line of text (pixels), from the row ink profile
export function textPitch({ data, w, h }, box) {
  const x0 = box.x, x1 = box.x + box.w, prof = new Float32Array(box.h);
  const step = Math.max(1, Math.floor(box.w / 400));
  let sum = 0, n = 0;
  for (let y = 0; y < box.h; y++) { let s = 0; for (let x = x0; x < x1; x += step) s += data[(box.y + y) * w + x]; prof[y] = s / Math.ceil(box.w / step); sum += prof[y]; n++; }
  const mean = sum / n; for (let y = 0; y < box.h; y++) prof[y] -= mean;
  const lo = Math.max(8, Math.round(box.h / 160)), hi = Math.min(Math.round(box.h / 4), 140), cs = [];
  let max = 0;
  for (let lag = lo; lag <= hi; lag++) { let c = 0; for (let y = 0; y + lag < box.h; y++) c += prof[y] * prof[y + lag]; c /= box.h - lag; cs.push(c); if (c > max) max = c; }
  if (max <= 0) return 0;
  for (let i = 1; i < cs.length - 1; i++) if (cs[i] >= max * 0.7 && cs[i] >= cs[i - 1] && cs[i] >= cs[i + 1]) return lo + i; // first clear peak = one line of text
  return 0; // line pitch in px (body text height is about 0.6 of this)
}

export function analyse(gray, box = findContent(gray)) {
  const { data, w } = gray;
  // contrast: spread between the dark ink and the light paper
  const sample = []; const sx = Math.max(1, Math.floor(box.w / 160)), sy = Math.max(1, Math.floor(box.h / 160));
  for (let y = box.y; y < box.y + box.h; y += sy) for (let x = box.x; x < box.x + box.w; x += sx) sample.push(data[y * w + x]);
  const lo = pct(sample, 0.05), hi = pct(sample, 0.95), contrast = hi - lo;
  // sharpness: mean edge strength relative to the contrast
  let edge = 0, ne = 0;
  for (let y = box.y + 1; y < box.y + box.h - 1; y += 2) for (let x = box.x + 1; x < box.x + box.w - 1; x += 2) { edge += Math.abs(data[y * w + x + 1] - data[y * w + x - 1]) + Math.abs(data[(y + 1) * w + x] - data[(y - 1) * w + x]); ne++; }
  const sharp = ne ? edge / ne / Math.max(20, contrast) : 0;
  const pitch = textPitch(gray, box);
  const longSide = Math.max(box.w, box.h);
  return { box, contrast, sharp, pitch, longSide, lo, hi };
}

// turn the measurements into an honest range with the reasons, so you know what would help
export function estimate(m) {
  let hiPct = 96, loPct = 88; const factors = [];
  const f = (ok, text, penalty = 0, tip = "") => { factors.push({ ok, text, tip }); hiPct -= penalty; loPct -= penalty * 1.6; };
  const bodyPx = m.pitch ? Math.round(m.pitch * 0.62) : 0;
  if (!m.pitch) f(false, "Could not measure the text size", 4, "Make sure the page fills the picture.");
  else if (bodyPx >= 20) f(true, `Text size is good (about ${bodyPx}px tall)`);
  else if (bodyPx >= 14) f(true, `Text size is fine (about ${bodyPx}px tall)`, 1.5);
  else f(false, `Text is small (about ${bodyPx}px tall)`, 8, "Take the photo closer, or use a higher resolution screenshot.");
  if (m.contrast >= 110) f(true, "Contrast between ink and paper is good");
  else if (m.contrast >= 70) f(true, "Contrast is acceptable", 2);
  else f(false, "Contrast is low", 8, "Use better light and avoid shadows.");
  if (m.sharp >= 0.17) f(true, "Image is sharp");
  else if (m.sharp >= 0.1) f(true, "Image is slightly soft", 2.5);
  else f(false, "Image looks blurry", 9, "Hold the phone steady and tap to focus.");
  if (m.longSide < 1000) f(false, `Low resolution (${m.longSide}px)`, 6, "Use the original image, not a thumbnail.");
  if (m.cropped) f(true, "Dark bars around the page were trimmed automatically");
  hiPct = Math.max(40, Math.min(98, Math.round(hiPct))); loPct = Math.max(30, Math.min(hiPct - 3, Math.round(loPct)));
  return { low: loPct, high: hiPct, factors };
}
