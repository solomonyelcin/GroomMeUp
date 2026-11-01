// A short, skippable walkthrough. Shown once on first visit; reopen any time with "Tour".
import { $, esc } from "./ui.js";

const KEY = "groommeup.tour";
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };
const phone = () => matchMedia("(max-width: 860px)").matches;

const STEPS = [
  { title: "Welcome to GroomMeUp", body: "This is your free interview coach. In 2 minutes you will know where everything is. You can skip any time." },
  { title: "Find your way around", body: () => phone() ? "Tap <b>Menu</b> (top left) to see every page, grouped as Start, Learn, Test yourself and Track. The bar at the bottom has the four you will use most." : "The menu on the left lists every page, grouped as Start, Learn, Test yourself and Track.", target: () => (phone() ? "#menuBtn" : "#rail") },
  { title: "Start here on Home", body: "The big tiles are the quickest way in. If you are not sure what to do, tap the highlighted <b>next step</b>.", route: "#/dashboard", target: () => "#startgrid" },
  { title: "Add your own questions", body: "Have an Excel, Word, PDF or text file of questions and answers? Add it here and it appears in practice, quizzes and mock interviews.", route: "#/dashboard", target: () => "[data-tile=import]" },
  { title: "A simple daily routine", body: "<b>1. Learn:</b> practise answers out loud.<br><b>2. Test yourself:</b> a quick quiz, a coding test, or a mock interview.<br><b>3. Track:</b> your Home page shows weak topics and what is due for review. About 90 minutes a day is plenty." },
  { title: "Make it yours", body: "In <b>Settings & AI</b> you can switch the free AI on, and pick colours that are easy on your eyes. Everything is saved on this device only.", route: "#/settings" },
  { title: "You are ready", body: "Start with 5 practice questions today. You can reopen this tour any time from <b>Tour</b>.", route: "#/dashboard" },
];

let i = 0, hl = null, box = null, scrim = null, tourNav = false;

function clear() { hl?.classList.remove("tour-hl"); hl = null; }
async function show() {
  const s = STEPS[i];
  if (s.route && location.hash.replace(/^#\/?/, "").split("?")[0] !== s.route.slice(2)) {
    tourNav = true; location.hash = s.route;
    await new Promise((r) => setTimeout(r, 450));
    tourNav = false;
  }
  clear();
  const sel = s.target?.();
  const el = sel && document.querySelector(sel);
  if (el) { el.classList.add("tour-hl"); hl = el; el.scrollIntoView({ block: "center", behavior: "auto" }); }
  const body = typeof s.body === "function" ? s.body() : s.body;
  box.innerHTML = `<div class="tour-step">Step ${i + 1} of ${STEPS.length}</div><h2 id="tourT">${esc(s.title)}</h2><p>${body}</p>
    <div class="tour-actions"><button class="btn" data-t="skip">${i === STEPS.length - 1 ? "Close" : "Skip tour"}</button><span style="flex:1"></span>${i ? `<button class="btn" data-t="back">Back</button>` : ""}<button class="btn primary" data-t="next">${i === STEPS.length - 1 ? "Done" : "Next"}</button></div>`;
  box.querySelector("[data-t=next]").focus();
}

export function endTour() { if (box && !tourNav) end(); }
function end() {
  clear(); box?.remove(); scrim?.remove(); box = scrim = null; set("done");
  document.removeEventListener("keydown", onKey, true);
}
function onKey(e) { if (e.key === "Escape") end(); }

export function startTour() {
  if (box) return;
  document.body.classList.remove("menu-open");
  i = 0;
  scrim = document.createElement("div"); scrim.className = "tour-scrim";
  box = document.createElement("div"); box.className = "tour-box"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "tourT");
  document.body.append(scrim, box);
  box.addEventListener("click", (e) => {
    const t = e.target.closest("[data-t]")?.dataset.t; if (!t) return;
    if (t === "skip" || (t === "next" && i === STEPS.length - 1)) return end();
    i += t === "next" ? 1 : -1; show();
  });
  scrim.addEventListener("click", end);
  document.addEventListener("keydown", onKey, true);
  show();
}

export function maybeAutoTour() {
  if (get() || box) return;
  set("seen");            // never nag twice, even if closed by navigating away
  setTimeout(startTour, 600);
}
void $;
