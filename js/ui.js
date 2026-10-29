// Small UI helpers shared by all views.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
export const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
export const pct = (n) => `${Math.round(n)}%`;

// Inline text with `code` and **bold**
export const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

export function toast(msg, isErr = false) {
  const t = document.createElement("div");
  t.className = "toast" + (isErr ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 3200);
}

export const scoreClass = (s) => (s == null ? "none" : s >= 8 ? "hi" : s >= 5 ? "mid" : "lo");
export const scoreBadge = (s) => `<span class="score ${scoreClass(s)}" title="Last score out of 10">${s == null ? "-" : (Math.round(s * 10) / 10)}</span>`;

// The measuring tape progress readout.
export function tape(value, { slim = false, label = "" } = {}) {
  const v = Math.max(0, Math.min(100, value));
  return `<div class="tape ${slim ? "slim" : ""}" role="img" aria-label="${esc(label)} ${Math.round(v)} percent"><div class="fill" style="width:${v}%"></div><div class="ticks"></div></div>`;
}
export const tapeScale = () => `<div class="tape-scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>`;

export function busy(btn, on, text) {
  if (on) { btn.dataset.t = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${esc(text || "Working")}`; }
  else { btn.disabled = false; btn.innerHTML = btn.dataset.t || btn.innerHTML; }
}

export function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- code editor: Monaco from CDN, with a plain textarea fallback ----
let monacoPromise;
function loadMonaco() {
  if (monacoPromise) return monacoPromise;
  const base = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs";
  monacoPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 8000);
    const s = document.createElement("script");
    s.src = base + "/loader.js";
    s.onload = () => {
      window.require.config({ paths: { vs: base } });
      window.MonacoEnvironment = { getWorkerUrl: () => URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${base}/../'};importScripts('${base}/base/worker/workerMain.js');`], { type: "text/javascript" })) };
      window.require(["vs/editor/editor.main"], () => { clearTimeout(timer); resolve(window.monaco); }, reject);
    };
    s.onerror = () => { clearTimeout(timer); reject(new Error("load failed")); };
    document.head.appendChild(s);
  });
  monacoPromise.catch(() => { monacoPromise = null; });
  return monacoPromise;
}

export async function createEditor(container, value, language) {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    const monaco = await loadMonaco();
    container.innerHTML = "";
    const ed = monaco.editor.create(container, {
      value, language, theme: "vs-dark", automaticLayout: true, minimap: { enabled: false }, fontSize: 14,
      fontFamily: "JetBrains Mono, Consolas, monospace", scrollBeyondLastLine: false, tabSize: 2, padding: { top: 10 },
    });
    return { get: () => ed.getValue(), set: (v) => ed.setValue(v), focus: () => ed.focus(), dispose: () => ed.dispose() };
  } catch {
    container.innerHTML = `<textarea class="code" spellcheck="false" aria-label="Code editor">${esc(value)}</textarea>`;
    const ta = container.firstChild;
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("  ", s, ta.selectionEnd, "end"); }
    });
    void dark;
    return { get: () => ta.value, set: (v) => (ta.value = v), focus: () => ta.focus(), dispose: () => {} };
  }
}

// ---- speech to text (optional, browser built-in, free) ----
export function speechSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
export function startDictation(onText, onEnd) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new R();
  r.lang = "en-IN"; r.continuous = true; r.interimResults = false;
  r.onresult = (e) => { let t = ""; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript + " "; if (t) onText(t); };
  r.onend = onEnd; r.onerror = onEnd;
  r.start();
  return () => r.stop();
}
