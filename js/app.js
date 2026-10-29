import { store } from "./store.js";
import { activeProvider, PROVIDERS } from "./ai.js";
import { $, $$, esc } from "./ui.js";

const ROUTES = [
  { id: "dashboard", label: "Dashboard", ico: "◧", mod: "./views/dashboard.js" },
  { id: "bank", label: "Question bank", ico: "☰", mod: "./views/bank.js" },
  { id: "practice", label: "Practice", ico: "✎", mod: "./views/practice.js" },
  { id: "quiz", label: "Quick quiz", ico: "?", mod: "./views/quiz.js" },
  { id: "mock", label: "Mock interview", ico: "◉", mod: "./views/mock.js" },
  { id: "code", label: "Coding tests", ico: "⌘", mod: "./views/code.js" },
  { id: "log", label: "Interview log", ico: "✓", mod: "./views/log.js" },
  { id: "market", label: "Market & resume", ico: "↗", mod: "./views/market.js" },
  { id: "plan", label: "Study plan", ico: "▤", mod: "./views/plan.js" },
  { id: "settings", label: "Settings", ico: "⚙", mod: "./views/settings.js" },
];

let cleanup = null;
let token = 0;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "") || "dashboard";
  const [path, query = ""] = raw.split("?");
  return { id: path.split("/")[0] || "dashboard", params: new URLSearchParams(query) };
}

function renderNav(current) {
  $("#nav").innerHTML = ROUTES.map((r) => `<a href="#/${r.id}" ${r.id === current ? 'aria-current="page"' : ""}><span class="ico" aria-hidden="true">${r.ico}</span>${esc(r.label)}</a>`).join("");
  const p = activeProvider();
  $("#railFoot").innerHTML = `AI: ${esc(p === "offline" ? "offline mode" : PROVIDERS[p].name.split(" (")[0])}<br>Data stays in this browser.`;
}

async function route() {
  const my = ++token;
  const { id, params } = parseHash();
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  renderNav(r.id);
  const root = $("#main");
  root.innerHTML = `<p class="muted"><span class="spinner"></span> Loading</p>`;
  try {
    const m = await import(r.mod);
    if (my !== token) return;
    root.innerHTML = "";
    cleanup = (await m.view(root, { params, go: (h) => { location.hash = h; } })) || null;
    window.scrollTo(0, 0);
    root.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><h2>This page failed to load</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/dashboard">Back to dashboard</a></div>`;
  }
}

addEventListener("hashchange", route);
store.subscribe(() => renderNav(parseHash().id));
route();
