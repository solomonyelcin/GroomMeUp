// Tiny SVG/HTML chart helpers for the Analysis page. Colours come from CSS variables set on .viz-root.
import { esc } from "./ui.js";

const W0 = 640;
const tipAttr = (t) => (t ? ` data-tip="${esc(t)}" tabindex="0"` : "");
const nice = (max) => { if (max <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

// Vertical bars. rows: [{label, value, tip}]
export function barsV(rows, { h = 190, w: W = W0, color = "var(--v1)", labelEvery = 1, unit = "" } = {}) {
  const pl = 34, pr = 8, pt = 10, pb = 26, iw = W - pl - pr, ih = h - pt - pb;
  const max = nice(Math.max(1, ...rows.map((r) => r.value)));
  const bw = Math.max(3, Math.min(34, (iw / rows.length) * 0.62)), step = iw / rows.length;
  const grid = [0, 0.5, 1].map((f) => { const y = pt + ih - f * ih; return `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="var(--v-grid)" stroke-width="1"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--v-mute)">${Math.round(max * f)}${unit}</text>`; }).join("");
  const bars = rows.map((r, i) => {
    const x = pl + i * step + (step - bw) / 2, bh = Math.max(r.value ? 2 : 0, (r.value / max) * ih), y = pt + ih - bh, rr = Math.min(4, bw / 2, bh);
    const path = bh ? `M${x} ${y + bh}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + bw - rr}Q${x + bw} ${y} ${x + bw} ${y + rr}V${y + bh}Z` : "";
    return `<g${tipAttr(r.tip)} class="viz-hit"><rect x="${pl + i * step}" y="${pt}" width="${step}" height="${ih + pb - 6}" fill="transparent"/>${path ? `<path d="${path}" fill="${color}"/>` : ""}</g>${i % labelEvery === 0 ? `<text x="${x + bw / 2}" y="${h - 8}" text-anchor="middle" font-size="10.5" fill="var(--v-mute)">${esc(r.label)}</text>` : ""}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${h}" class="viz-svg" role="img" aria-label="Bar chart">${grid}${bars}</svg>`;
}

// Line with points. pts: [{label, value|null, tip}], min/max fixed so the axis is honest.
export function lineChart(pts, { h = 190, w: W = W0, min = 0, max = 10, color = "var(--v1)", unit = "", ticks = [0, 0.5, 1], labelEvery = 1 } = {}) {
  const pl = 34, pr = 14, pt = 12, pb = 26, iw = W - pl - pr, ih = h - pt - pb;
  const X = (i) => pl + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw), Y = (v) => pt + ih - ((v - min) / (max - min)) * ih;
  const grid = ticks.map((f) => { const v = min + f * (max - min), y = Y(v); return `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="var(--v-grid)"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--v-mute)">${Math.round(v * 10) / 10}${unit}</text>`; }).join("");
  let d = "", pen = false;
  pts.forEach((p, i) => { if (p.value === null || p.value === undefined) { pen = false; return; } d += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`; pen = true; });
  const dots = pts.map((p, i) => (p.value === null || p.value === undefined ? "" : `<g${tipAttr(p.tip)} class="viz-hit"><circle cx="${X(i)}" cy="${Y(p.value)}" r="16" fill="transparent"/><circle cx="${X(i)}" cy="${Y(p.value)}" r="4.5" fill="${color}" stroke="var(--v-surface)" stroke-width="2"/></g>`)).join("");
  const labels = pts.map((p, i) => (i % labelEvery === 0 || i === pts.length - 1 ? `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" font-size="10.5" fill="var(--v-mute)">${esc(p.label)}</text>` : "")).join("");
  return `<svg viewBox="0 0 ${W} ${h}" class="viz-svg" role="img" aria-label="Line chart">${grid}<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${labels}</svg>`;
}

// Horizontal bar rows (HTML so labels wrap well on a phone). rows: [{label, sub, value, max, text, tip, href}]
export function hbars(rows, { color = "var(--v1)" } = {}) {
  return `<div class="hb">${rows.map((r) => `<div class="hb-row viz-hit"${tipAttr(r.tip)}><div class="hb-l">${r.href ? `<a href="${esc(r.href)}">${esc(r.label)}</a>` : esc(r.label)}${r.sub ? `<span class="small muted"> ${esc(r.sub)}</span>` : ""}</div><div class="hb-t" aria-hidden="true"><span style="width:${Math.max(r.value ? 2 : 0, Math.min(100, (r.value / (r.max || 100)) * 100))}%;background:${r.color || color}"></span></div><div class="hb-v">${esc(r.text ?? String(r.value))}</div></div>`).join("")}</div>`;
}

// One segmented bar with a legend. parts: [{label, value, color}]
export function segmented(parts) {
  const tot = parts.reduce((n, p) => n + p.value, 0) || 1;
  return `<div class="seg-bar" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${p.value}`).join(", "))}">${parts.filter((p) => p.value).map((p) => `<span class="viz-hit" data-tip="${esc(`${p.label}: ${p.value} (${Math.round((p.value / tot) * 100)}%)`)}" tabindex="0" style="flex:${p.value};background:${p.color}"></span>`).join("")}</div>
    <div class="legend">${parts.map((p) => `<span><i style="background:${p.color}"></i>${esc(p.label)} <b>${p.value}</b></span>`).join("")}</div>`;
}

// Quadrant scatter, e.g. market demand (y) against your readiness (x). pts: [{x, y, label, tip, href}]
export function scatter(pts, { h = 300, w: W = W0, xl = "Your readiness (%)", yl = "Market demand (1-5)", ymin = 0, ymax = 5.5 } = {}) {
  const pl = 44, pr = 16, pt = 14, pb = 40, iw = W - pl - pr, ih = h - pt - pb;
  const X = (v) => pl + (v / 100) * iw, Y = (v) => pt + ih - ((v - ymin) / (ymax - ymin)) * ih;
  const lab = [];
  const order = new Map(); // points on the same demand level get their labels staggered so they do not collide
  [...pts].sort((a, b) => a.y - b.y || a.x - b.x).forEach((p, i, arr) => { const same = arr.filter((q, j) => j < i && Math.abs(q.y - p.y) < 0.2).length; order.set(p, same); });
  const dots = pts.map((p) => {
    const cx = X(p.x), cy = Y(p.y), right = cx < W - 190, k = order.get(p) || 0, dy = [0, -16, 16, -32, 32][k % 5];
    lab.push(`<text x="${cx + (right ? 9 : -9)}" y="${cy + 4 + dy}" text-anchor="${right ? "start" : "end"}" font-size="11" fill="var(--v-ink)" stroke="var(--v-surface)" stroke-width="4" paint-order="stroke">${esc(p.label)}</text>`);
    return `<g${tipAttr(p.tip)} class="viz-hit"><circle cx="${cx}" cy="${cy}" r="16" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="6" fill="${p.color || "var(--v1)"}" stroke="var(--v-surface)" stroke-width="2"/></g>`;
  }).join("");
  const mx = X(50), my = Y(3.2);
  return `<svg viewBox="0 0 ${W} ${h}" class="viz-svg" role="img" aria-label="Scatter chart: ${esc(yl)} against ${esc(xl)}">
    <rect x="${pl}" y="${pt}" width="${mx - pl}" height="${my - pt}" fill="var(--v-focus)" opacity=".45"/>
    
    ${[0, 25, 50, 75, 100].map((v) => `<line x1="${X(v)}" x2="${X(v)}" y1="${pt}" y2="${pt + ih}" stroke="var(--v-grid)"/><text x="${X(v)}" y="${h - 22}" text-anchor="middle" font-size="11" fill="var(--v-mute)">${v}</text>`).join("")}
    ${[1, 2, 3, 4, 5].map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--v-grid)"/><text x="${pl - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--v-mute)">${v}</text>`).join("")}
    <line x1="${mx}" x2="${mx}" y1="${pt}" y2="${pt + ih}" stroke="var(--v-axis)" stroke-dasharray="4 4"/><line x1="${pl}" x2="${W - pr}" y1="${my}" y2="${my}" stroke="var(--v-axis)" stroke-dasharray="4 4"/>
    ${dots}${lab.join("")}
    <text x="${pl + iw / 2}" y="${h - 4}" text-anchor="middle" font-size="11.5" fill="var(--v-mute)">${esc(xl)}</text>
    <text transform="translate(12 ${pt + ih / 2}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="var(--v-mute)">${esc(yl)}</text></svg>`;
}

// Tooltip layer: hover, keyboard focus and tap all show the [data-tip] text of the nearest mark.
export function wireTips(root) {
  const tip = document.createElement("div"); tip.className = "viz-tip"; tip.setAttribute("role", "status"); tip.hidden = true; root.appendChild(tip);
  const show = (el) => {
    const t = el.getAttribute("data-tip"); if (!t) return;
    tip.textContent = t; tip.hidden = false;
    const r = el.getBoundingClientRect(), b = root.getBoundingClientRect();
    const w = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(b.width - w - 4, r.left - b.left + r.width / 2 - w / 2)) + "px";
    tip.style.top = Math.max(0, r.top - b.top - tip.offsetHeight - 6) + "px";
  };
  const hide = () => { tip.hidden = true; };
  root.addEventListener("pointerover", (e) => { const el = e.target.closest("[data-tip]"); el ? show(el) : hide(); });
  root.addEventListener("focusin", (e) => { const el = e.target.closest("[data-tip]"); if (el) show(el); });
  root.addEventListener("focusout", hide);
  root.addEventListener("pointerleave", hide);
  root.addEventListener("click", (e) => { const el = e.target.closest("[data-tip]"); el ? show(el) : hide(); });
  return () => tip.remove();
}
