// A reading-friendly picture viewer: zoom (buttons, wheel, pinch, double click), drag to pan, rotate,
// and views that make notes easier to read (grayscale, black and white, inverted for dark rooms).
import { getBlob } from "../imgstore.js";
import { esc, $ } from "../ui.js";

const KEY = "groommeup.imgview";
const MODES = { normal: ["Original", ""], gray: ["Grayscale", "grayscale(1)"], bw: ["Black & white", "grayscale(1) contrast(2.4) brightness(1.12)"], invert: ["Dark mode", "invert(1) hue-rotate(180deg) contrast(1.05)"], invbw: ["Dark B&W", "grayscale(1) invert(1) contrast(2.2)"] };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } };

export function mountViewer(host, pages) {
  const pref = { mode: "normal", bright: 100, contrast: 100, ...load() };
  let idx = 0, z = 1, fit = 1, tx = 0, ty = 0, rot = 0, nat = { w: 1, h: 1 }, url = null, gone = false;
  const I = (d, extra = "") => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICON = {
    prev: I('<path d="M15 5l-7 7 7 7"/>'), next: I('<path d="M9 5l7 7-7 7"/>'),
    out: I('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>'), in: I('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>'),
    look: I('<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none"/>'),
    rot: I('<path d="M20 11a8 8 0 10-2.3 5.7M20 4v5h-5"/>'),
    full: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    exit: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  };
  host.innerHTML = `<div class="iv" id="ivRoot">
    <div class="iv-bar" role="toolbar" aria-label="Picture controls">
      <div class="iv-seg" role="group" aria-label="Page">
        <button class="iv-btn" data-a="prev" aria-label="Previous page" title="Previous page ( [ )">${ICON.prev}</button>
        <span class="iv-pg" id="ivPg" aria-live="polite"></span>
        <button class="iv-btn" data-a="next" aria-label="Next page" title="Next page ( ] )">${ICON.next}</button></div>
      <div class="iv-seg" role="group" aria-label="Zoom">
        <button class="iv-btn" data-a="out" aria-label="Zoom out" title="Zoom out ( - )">${ICON.out}</button>
        <button class="iv-btn iv-pct" data-pop="zoom" aria-haspopup="true" aria-expanded="false" aria-controls="ivPopZoom" title="Zoom options"><span id="ivZ">100%</span></button>
        <button class="iv-btn" data-a="in" aria-label="Zoom in" title="Zoom in ( + )">${ICON.in}</button></div>
      <div class="iv-seg" role="group" aria-label="View">
        <button class="iv-btn iv-wide" data-pop="look" aria-haspopup="true" aria-expanded="false" aria-controls="ivPopLook" title="Black &amp; white, dark mode, brightness">${ICON.look}<span>Look</span></button>
        <button class="iv-btn" data-a="rot" aria-label="Rotate" title="Rotate">${ICON.rot}</button>
        <button class="iv-btn" data-a="full" aria-label="Full screen" title="Full screen">${ICON.full}</button></div>
      <div class="iv-pop" id="ivPopZoom" role="group" aria-label="Zoom options" hidden>
        <button class="btn sm" data-a="fit">Fit page</button><button class="btn sm" data-a="w">Fit width</button><button class="btn sm" data-a="one">Actual size</button></div>
      <div class="iv-pop iv-poplook" id="ivPopLook" role="group" aria-label="Look" hidden>
        <div class="iv-modes">${Object.entries(MODES).map(([k, [n]]) => `<button class="iv-mode" data-m="${k}" data-k="${k}" aria-pressed="${pref.mode === k}"><span class="iv-chip" aria-hidden="true">Aa</span>${n}</button>`).join("")}</div>
        <label class="iv-sl">Brightness <output id="ivBo">${pref.bright}%</output><input type="range" id="ivB" min="50" max="170" value="${pref.bright}"></label>
        <label class="iv-sl">Contrast <output id="ivCo">${pref.contrast}%</output><input type="range" id="ivC" min="50" max="260" value="${pref.contrast}"></label>
        <button class="btn sm" data-a="reset">Reset look</button></div>
    </div>
    <div class="iv-stage" id="ivStage" tabindex="0" aria-label="Picture. Arrow keys move, plus and minus zoom."><img id="ivImg" alt="" draggable="false"></div>
    <button class="iv-exit" id="ivExit" aria-label="Exit full screen" title="Exit full screen (Esc)" hidden>${ICON.exit}</button>
    <p class="iv-hint small muted">Scroll or pinch to zoom, drag to move, double-click to zoom in or out. Swipe sideways to change page when the whole page is showing.</p></div>`;
  const stage = $("#ivStage", host), img = $("#ivImg", host);

  const filter = () => { const f = [MODES[pref.mode][1], `brightness(${pref.bright}%)`, `contrast(${pref.contrast}%)`].filter(Boolean).join(" "); img.style.filter = f; };
  const apply = () => {
    const rw = rot % 180 ? nat.h : nat.w, rh = rot % 180 ? nat.w : nat.h, sw = rw * z, sh = rh * z, W = stage.clientWidth, H = stage.clientHeight;
    // keep the picture reachable: it may not be dragged completely out of view
    tx = sw <= W ? (W - sw) / 2 : Math.min(0, Math.max(W - sw, tx));
    ty = sh <= H ? (H - sh) / 2 : Math.min(0, Math.max(H - sh, ty));
    img.style.transform = `translate(${tx + sw / 2 - nat.w / 2}px, ${ty + sh / 2 - nat.h / 2}px) rotate(${rot}deg) scale(${z})`;
    $("#ivZ", host).textContent = Math.round(z * 100) + "%";
  };
  const fitZoom = (mode = "fit") => { const rw = rot % 180 ? nat.h : nat.w, rh = rot % 180 ? nat.w : nat.h, W = stage.clientWidth, H = stage.clientHeight; fit = Math.min(W / rw, H / rh); return mode === "w" ? W / rw : fit; };
  const zoomTo = (nz, cx, cy) => { // zoom around a point (default the middle)
    const W = stage.clientWidth, H = stage.clientHeight; cx ??= W / 2; cy ??= H / 2;
    nz = Math.max(Math.min(fit, 0.2), Math.min(8, nz)); const k = nz / z;
    tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; z = nz; apply();
  };
  const setFit = (mode) => { z = fitZoom(mode); tx = 0; ty = 0; apply(); if (mode === "w") { ty = 0; apply(); } };

  async function show(i) {
    idx = (i + pages.length) % pages.length; $("#ivPg", host).textContent = `${idx + 1} / ${pages.length}`;
    const blob = pages[idx].id ? await getBlob(pages[idx].id).catch(() => null) : null; // a copy on this device first, else the one on GitHub
    if (gone) return;
    if (!blob && !pages[idx].url) { img.removeAttribute("src"); stage.insertAdjacentHTML("beforeend", `<p class="iv-miss">This picture is no longer stored on this device.</p>`); return; }
    stage.querySelector(".iv-miss")?.remove();
    const old = url; url = blob ? URL.createObjectURL(blob) : null; img.src = url || pages[idx].url; if (old) URL.revokeObjectURL(old);
    img.alt = pages[idx].name || `Page ${idx + 1}`;
    await img.decode().catch(() => {});
    if (gone) return;
    nat = { w: img.naturalWidth || pages[idx].w || 1, h: img.naturalHeight || pages[idx].h || 1 };
    img.style.width = nat.w + "px"; img.style.height = nat.h + "px"; rot = 0;
    setFit(); filter();
  }

  const act = {
    prev: () => show(idx - 1), next: () => show(idx + 1), in: () => zoomTo(z * 1.25), out: () => zoomTo(z / 1.25),
    fit: () => setFit("fit"), w: () => setFit("w"), one: () => { z = 1; tx = 0; ty = 0; apply(); },
    rot: () => { rot = (rot + 90) % 360; setFit(); },
    full: () => setFull(true),
    reset: () => { pref.mode = "normal"; pref.bright = 100; pref.contrast = 100; $("#ivB", host).value = 100; $("#ivC", host).value = 100; sync(); },
  };
  // full screen: only the picture and one exit button. Works without the Fullscreen API too (iPhone Safari lacks it).
  const root = $("#ivRoot", host), exitBtn = $("#ivExit", host);
  const isFull = () => root.classList.contains("iv-full");
  function setFull(on) {
    if (on === isFull()) return;
    closePops(); root.classList.toggle("iv-full", on); exitBtn.hidden = !on; document.body.classList.toggle("iv-lock", on);
    if (on) { root.requestFullscreen?.().catch(() => {}); stage.focus({ preventScroll: true }); }
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(() => { setFit(); });
  }
  const onFsChange = () => { if (!document.fullscreenElement && isFull() && usedNative) setFull(false); };
  let usedNative = false;
  document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement === root) usedNative = true; onFsChange(); });
  exitBtn.onclick = () => setFull(false);
  // popovers (zoom options, look)
  const pops = { zoom: $("#ivPopZoom", host), look: $("#ivPopLook", host) };
  function closePops(except) { for (const [k, el] of Object.entries(pops)) if (k !== except) { el.hidden = true; host.querySelector(`[data-pop="${k}"]`)?.setAttribute("aria-expanded", "false"); } }
  host.querySelectorAll("[data-pop]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const el = pops[b.dataset.pop], open = el.hidden; closePops(b.dataset.pop); el.hidden = !open; b.setAttribute("aria-expanded", String(open)); }));
  const outside = (e) => { if (!e.target.closest?.(".iv-pop,[data-pop]")) closePops(); };
  document.addEventListener("pointerdown", outside);
  host.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (isFull()) setFull(false); else closePops(); } });
  host.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { act[b.dataset.a](); if (b.closest(".iv-pop") && b.dataset.a !== "reset") closePops(); }));
  const sync = () => { $("#ivBo", host).textContent = pref.bright + "%"; $("#ivCo", host).textContent = pref.contrast + "%"; host.querySelectorAll(".iv-mode").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === pref.mode))); filter(); save(pref); };
  host.querySelectorAll(".iv-mode").forEach((b) => (b.onclick = () => { pref.mode = b.dataset.m; sync(); }));
  $("#ivB", host).oninput = (e) => { pref.bright = +e.target.value; sync(); };
  $("#ivC", host).oninput = (e) => { pref.contrast = +e.target.value; sync(); };

  // mouse and touch: drag to pan, two fingers to pinch, wheel to zoom, double click to toggle
  const pts = new Map(); let last = null, pinch = null;
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } });
  stage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], r = stage.getBoundingClientRect(), d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomTo(pinch.z * d / pinch.d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); }
    else if (pts.size === 1 && last) { tx += e.clientX - last[0]; ty += e.clientY - last[1]; last = [e.clientX, e.clientY]; apply(); }
  });
  let down = null;
  stage.addEventListener("pointerdown", (e) => { down = pts.size === 1 ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; });
  const up = (e) => {
    if (down && pts.size === 1 && pages.length > 1 && z <= fit * 1.05) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) > 60 && Math.abs(dy) < 45 && Date.now() - down.t < 700) show(idx + (dx < 0 ? 1 : -1)); }
    down = null; pts.delete(e.pointerId); pinch = null; last = pts.size === 1 ? [...pts.values()][0] : null; };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomTo(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  stage.addEventListener("dblclick", (e) => { const r = stage.getBoundingClientRect(); if (z > fit * 1.3) setFit(); else zoomTo(Math.max(1.5, fit * 2.5), e.clientX - r.left, e.clientY - r.top); });
  stage.addEventListener("keydown", (e) => {
    const step = 60, k = e.key;
    if (k === "+" || k === "=") zoomTo(z * 1.25); else if (k === "-") zoomTo(z / 1.25); else if (k === "0") setFit();
    else if (k === "ArrowLeft") { tx += step; apply(); } else if (k === "ArrowRight") { tx -= step; apply(); } else if (k === "ArrowUp") { ty += step; apply(); } else if (k === "ArrowDown") { ty -= step; apply(); }
    else if (k === "[" || k === "PageUp") show(idx - 1); else if (k === "]" || k === "PageDown") show(idx + 1); else return;
    e.preventDefault();
  });
  const ro = new ResizeObserver(() => { if (img.naturalWidth) { const wasFit = Math.abs(z - fit) < 0.001; fitZoom(); if (wasFit) z = fit; apply(); } });
  ro.observe(stage);
  show(0);
  return () => { gone = true; ro.disconnect(); document.removeEventListener("pointerdown", outside); document.body.classList.remove("iv-lock"); if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {}); if (url) URL.revokeObjectURL(url); };
}
