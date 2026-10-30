// Theme handling. "system" follows the OS light/dark setting; the rest are fixed themes.
export const THEMES = [
  { id: "system", name: "Match my device", note: "Chalk by day, Midnight by night" },
  { id: "chalk", name: "Chalk", note: "Light. Ink, cobalt and chalk yellow" },
  { id: "midnight", name: "Midnight", note: "Dark. Deep indigo, easy on the eyes" },
  { id: "forest", name: "Forest", note: "Light. Calm green" },
  { id: "graphite", name: "Graphite", note: "Dark. Neutral with amber" },
  { id: "rose", name: "Rose", note: "Light. Warm berry" },
  { id: "contrast", name: "High contrast", note: "Dark. Maximum legibility" },
];
const KEY = "groommeup.theme";
const mq = matchMedia("(prefers-color-scheme: dark)");

export const getTheme = () => { try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; } };
const resolve = (t) => (t === "system" ? (mq.matches ? "midnight" : "chalk") : t);

export function applyTheme(t = getTheme()) {
  document.documentElement.setAttribute("data-theme", resolve(t));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--rail-bg").trim() || "#151A33");
}
export function setTheme(t) { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } applyTheme(t); }
export function cycleTheme() {
  const ids = THEMES.map((x) => x.id); const i = ids.indexOf(getTheme());
  const next = ids[(i + 1) % ids.length]; setTheme(next); return THEMES.find((x) => x.id === next);
}
mq.addEventListener?.("change", () => { if (getTheme() === "system") applyTheme(); });
