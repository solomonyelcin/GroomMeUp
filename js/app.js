import { store } from "./store.js";
import { activeProvider, PROVIDERS } from "./ai.js";
import { $, $$, esc, toast } from "./ui.js";
import { THEMES, getTheme, cycleTheme, applyTheme } from "./theme.js";
import { startTour, maybeAutoTour, endTour } from "./tour.js";
import { checkBadges } from "./progress.js";

const ROUTES = [
  { id: "dashboard", label: "Home", ico: "◧", group: "Start", mod: "./views/dashboard.js" },
  { id: "import", label: "Add my questions", ico: "⇪", group: "Start", mod: "./views/import.js" },
  { id: "practice", label: "Practise answers", ico: "✎", group: "Learn", mod: "./views/practice.js" },
  { id: "bank", label: "Browse questions", ico: "☰", group: "Learn", mod: "./views/bank.js" },
  { id: "jd", label: "Match a job", ico: "⌖", group: "Learn", mod: "./views/jd.js" },
  { id: "quiz", label: "Quick quiz", ico: "?", group: "Test yourself", mod: "./views/quiz.js" },
  { id: "code", label: "Coding tests", ico: "⌘", group: "Test yourself", mod: "./views/code.js" },
  { id: "mock", label: "Mock interview", ico: "◉", group: "Test yourself", mod: "./views/mock.js" },
  { id: "log", label: "Log real interviews", ico: "✓", group: "Track", mod: "./views/log.js" },
  { id: "achievements", label: "Progress & badges", ico: "★", group: "Track", mod: "./views/achievements.js" },
  { id: "plan", label: "Study plan", ico: "▤", group: "Track", mod: "./views/plan.js" },
  { id: "market", label: "Market & resume", ico: "↗", group: "Track", mod: "./views/market.js" },
  { id: "settings", label: "Settings & AI", ico: "⚙", group: "Settings", mod: "./views/settings.js" },
];
// the five places a phone user needs most, always one tap away
const TABS = [["dashboard", "Home", "◧"], ["practice", "Practise", "✎"], ["quiz", "Quiz", "?"], ["code", "Code", "⌘"]];

let cleanup = null;
let token = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "") || "dashboard";
  const [path, query = ""] = raw.split("?");
  return { id: path.split("/")[0] || "dashboard", params: new URLSearchParams(query) };
}

let installEvt = null;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; renderNav(parseHash().id); });
window.addEventListener("appinstalled", () => { installEvt = null; renderNav(parseHash().id); toast("GroomMeUp installed"); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

function renderNav(current) {
  let html = "", g = "";
  for (const r of ROUTES) {
    if (r.group !== g) { g = r.group; html += `<div class="nav-group">${esc(g)}</div>`; }
    html += `<a href="#/${r.id}" ${r.id === current ? 'aria-current="page"' : ""}><span class="ico" aria-hidden="true">${r.ico}</span>${esc(r.label)}</a>`;
  }
  $("#nav").innerHTML = html;
  $("#tabbar").innerHTML = TABS.map(([id, label, ico]) => `<a href="#/${id}" ${id === current ? 'aria-current="page"' : ""}><span class="ico" aria-hidden="true">${ico}</span><span>${label}</span></a>`).join("")
    + `<button type="button" id="tabMore" aria-label="Open full menu"><span class="ico" aria-hidden="true">☰</span><span>More</span></button>`;
  $("#tabMore").onclick = () => setMenu(true);
  $("#pageTitle").textContent = ROUTES.find((r) => r.id === current)?.label || "GroomMeUp";
  const p = activeProvider();
  const tn = THEMES.find((x) => x.id === getTheme())?.name || "Theme";
  $("#railFoot").innerHTML = `<button class="rail-btn" id="tourBtn2">Take the quick tour</button>${installEvt && !standalone() ? `<button class="rail-btn" id="installBtn" style="margin-top:6px">Install app</button>` : isIos() && !standalone() ? `<div class="small" style="margin:6px 0">To install: tap Share, then "Add to Home Screen".</div>` : ""}<button class="rail-btn" id="themeBtn" title="Switch theme" style="margin-top:6px">Colours: ${esc(tn)}</button><div style="margin-top:8px">AI: ${esc(p === "offline" ? "off (offline scoring)" : PROVIDERS[p].keyless ? "free, no key" : PROVIDERS[p].name.split(" (")[0])}<br>Progress stays in this browser.</div>`;
  const ib = $("#installBtn"); if (ib) ib.onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; renderNav(current); };
  $("#themeBtn").onclick = () => { cycleTheme(); renderNav(current); };
  $("#tourBtn2").onclick = () => { setMenu(false); startTour(); };
}

// ---- menu drawer (phones) ----
function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  $("#menuBtn").setAttribute("aria-expanded", String(open));
  $("#scrim").hidden = !open;
  if (open) $("#nav a[aria-current], #nav a").focus({ preventScroll: true }); else if (document.activeElement && $("#rail").contains(document.activeElement)) $("#menuBtn").focus({ preventScroll: true });
}
$("#menuBtn").onclick = () => setMenu(!document.body.classList.contains("menu-open"));
$("#menuClose").onclick = () => setMenu(false);
$("#scrim").onclick = () => setMenu(false);
$("#tourBtn").onclick = () => startTour();
addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("menu-open")) setMenu(false); });
$("#nav").addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
matchMedia("(min-width: 861px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });

async function route() {
  const my = ++token;
  const { id, params } = parseHash();
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  setMenu(false);
  endTour();
  { const tt = $("#toasts"); if (tt) tt.innerHTML = ""; }
  renderNav(r.id);
  const root = $("#main");
  root.innerHTML = `<p class="muted"><span class="spinner"></span> Loading</p>`;
  try {
    const m = await import(r.mod + "?v=" + encodeURIComponent(window.__V || "dev"));
    if (my !== token) return;
    root.innerHTML = "";
    cleanup = (await m.view(root, { params, go: (h) => { location.hash = h; } })) || null;
    window.scrollTo(0, 0);
    root.focus({ preventScroll: true });
    if (r.id === "dashboard") maybeAutoTour();
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><h2>This page failed to load</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/dashboard">Back to dashboard</a></div>`;
  }
}

applyTheme();
addEventListener("groommeup:save-error", () => toast("Browser storage is full, so your latest changes were not saved. Export a backup in Settings and remove old imports.", true));
addEventListener("hashchange", route);
store.subscribe(() => { renderNav(parseHash().id); checkBadges(); });
checkBadges();
route();
