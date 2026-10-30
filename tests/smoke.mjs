// Browser smoke test: loads every page, drives the main flows, fails on any uncaught error.
// Run: node tests/smoke.mjs   (needs playwright + a static server, see npm run test:smoke)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || "playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push("console: " + m.text()); });
// External CDNs are not reachable in CI sandboxes; the app must degrade gracefully.
await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, (r) => r.abort());

let aiMode = "down";
const fakeAI = { choices: [{ message: { content: JSON.stringify({ score: 6.5, verdict: "Decent answer", strengths: ["Names the dual-write problem"], gaps: ["Mention the inbox table"], tips: ["Add a project example"], improved: "A stronger model answer.", followUp: "How would you relay events?" }) } }] };
await page.route(/text\.pollinations\.ai/, (r) => aiMode === "ok" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeAI) }) : r.fulfill({ status: 500, body: "busy" }));
let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok  :", m); };

await page.goto(base + "/#/dashboard");
await page.waitForSelector("h1");
check((await page.textContent("h1")).includes("Welcome"), "dashboard renders");

for (const r of ["bank", "practice", "quiz", "mock", "code", "log", "market", "plan", "settings", "dashboard"]) {
  await page.goto(`${base}/#/${r}`);
  await page.waitForFunction(() => !document.querySelector("#main .spinner") || document.querySelector("#main h1"), null, { timeout: 8000 });
  const h = await page.textContent("#main h1, #main h2");
  check(!!h && !/failed to load/i.test(h), `route ${r}: "${(h || "").trim().slice(0, 40)}"`);
}

// bank: search + filter
await page.goto(base + "/#/bank");
await page.waitForSelector(".q-card");
const total = await page.locator(".q-card").count();
await page.fill("#s", "saga");
const afterSearch = await page.locator(".q-card").count();
check(afterSearch > 0 && afterSearch < total, `bank search narrows ${total} -> ${afterSearch}`);

// practice: offline evaluation end to end
await page.goto(base + "/#/practice?q=ms03");
await page.waitForSelector("#ans");
await page.fill("#ans", "The transactional outbox solves the dual-write problem. You write the business change and an event row in the same transaction, and a relay publishes it with CDC. Delivery is at-least-once so the consumer must be idempotent using an inbox to drop duplicates.");
await page.click("#eval");
await page.waitForSelector(".eval", { timeout: 8000 });
const scoreText = await page.textContent(".eval .big");
check(parseFloat(scoreText) >= 7, `good answer scored ${scoreText.trim()}`);
check((await page.textContent("#result")).includes("AI evaluation failed"), "AI service down -> falls back to offline score with a notice");
const state = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")));
check(state.attempts.length === 1 && state.srs.ms03, "attempt + spaced repetition saved");

// free keyless AI is the default, and a good AI response is shown as AI feedback
check((await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).settings.provider)) === "pollinations", "keyless free AI is the default provider");
aiMode = "ok";
await page.goto(base + "/#/practice?q=ms01");
await page.waitForSelector("#ans");
await page.fill("#ans", "Split services by business capability and bounded context, each owning its own database. Avoid microservices for small teams or when operations maturity is low, a modular monolith is better then.");
await page.click("#eval");
await page.waitForSelector(".eval");
const aiText = await page.textContent("#result");
check(aiText.includes("Evaluated by AI") && aiText.includes("Names the dual-write problem") && aiText.includes("How would you relay events?"), "AI feedback rendered (score, strengths, gaps, follow-up)");
check(parseFloat(await page.textContent(".eval .big")) === 6.5, "AI score used instead of offline score");

// themes: every theme applies and changes the page colours; saved across reload
await page.goto(base + "/#/settings");
await page.waitForSelector(".theme-card");
const seen = new Set();
for (const t of ["chalk", "midnight", "forest", "graphite", "rose", "contrast", "system"]) {
  await page.click(`.theme-card[data-t="${t}"]`);
  const info = await page.evaluate(() => ({ attr: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, rail: getComputedStyle(document.querySelector(".rail")).backgroundColor }));
  if (t !== "system") { seen.add(info.bg + "|" + info.rail); check(info.attr === t, `theme ${t} applied`); }
}
check(seen.size === 6, `six themes look different (${seen.size} unique palettes)`);
await page.click('.theme-card[data-t="graphite"]');
await page.reload(); await page.waitForSelector("h1");
check((await page.evaluate(() => document.documentElement.dataset.theme)) === "graphite", "theme persists after reload");
await page.click("#themeBtn");
check((await page.evaluate(() => document.documentElement.dataset.theme)) !== "graphite", "rail theme button cycles themes");
await page.evaluate(() => localStorage.setItem("groommeup.theme", "chalk"));

// quiz: answer all
await page.goto(base + "/#/quiz");
await page.click("#start");
for (let i = 0; i < 10; i++) { await page.click(".opt >> nth=0"); await page.click("#nx"); }
await page.waitForSelector("text=By topic");
check((await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).quizzes.length)) === 1, "quiz result saved");

// coding: JS solution passes in a real worker
await page.goto(base + "/#/code?lang=js");
await page.waitForSelector(".editor textarea.code", { timeout: 15000 });
const sol = await page.evaluate(async () => { const m = await import("/js/data/coding-js.js"); return m.JS_CHALLENGES[0].solution; });
await page.fill(".editor textarea.code", sol);
await page.click("#run");
await page.waitForSelector("text=All tests passed", { timeout: 10000 });
check(true, "JS challenge passes in web worker");
await page.fill(".editor textarea.code", "function twoSum(a,b){ while(true){} }");
await page.click("#run");
await page.waitForSelector("text=Timed out", { timeout: 9000 });
check(true, "infinite loop is stopped by timeout");

// log: add interview
await page.goto(base + "/#/log");
await page.click("#new");
await page.fill("#co", "Acme Corp");
await page.fill("#qs", "Explain async await internals\nDesign a rate limiter *");
await page.click("#sv");
await page.waitForSelector("text=Acme Corp");
const log = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).log[0]);
check(log.questions.length === 2 && log.questions[1].hard && log.cats.includes("design"), "interview logged and topics detected: " + log.cats.join(","));
await page.click("[data-add]");
check((await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).custom.length)) === 1, "real question added to bank");

// mock interview end-to-end
await page.goto(base + "/#/mock");
await page.selectOption("#n", "4");
await page.click("#go");
for (let i = 0; i < 4; i++) { await page.fill("#ans", "I would explain the concept, give an example from my project, and discuss the trade-offs and failure modes carefully."); await page.click("#nx"); }
await page.waitForSelector("text=Interview debrief", { timeout: 15000 });
check(true, "mock interview debrief rendered");

// ---- import material ----
const fx = (n) => path.join(root, "tests/fixtures", n);
await page.goto(base + "/#/import");
await page.waitForSelector("#file", { state: "attached" });
await page.setInputFiles("#file", fx("sample.xlsx"));
await page.waitForSelector("[data-act=import]", { timeout: 10000 });
check(/Found \d+ question/.test(await page.textContent("#results")), "xlsx previewed");
await page.click("[data-act=import]");
await page.waitForSelector("text=Imported sample.xlsx");
const st1 = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")));
const nX = st1.custom.filter((q) => q.imported).length;
check(nX > 0 && st1.imports.length === 1 && Object.keys(st1.cats).length > 0, `xlsx imported: ${nX} questions, ${Object.keys(st1.cats).length} topics`);

for (const f of ["sample.docx", "sample.txt", "sample.pdf"]) {
  await page.goto(base + "/#/import");
  await page.waitForSelector("#file", { state: "attached" });
  await page.setInputFiles("#file", fx(f));
  try { await page.waitForSelector("[data-act=import]", { timeout: 15000 }); await page.click("[data-act=import]"); await page.waitForSelector(`text=Imported ${f}`); check(true, `${f} imported`); }
  catch (e) { check(false, `${f} import: ${(await page.textContent("#results")).slice(0, 160)}`); }
}
// re-import is idempotent
await page.goto(base + "/#/import");
await page.setInputFiles("#file", fx("sample.xlsx"));
await page.waitForSelector("[data-act=import]"); await page.click("[data-act=import]"); await page.waitForSelector("text=Imported sample.xlsx");
const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")));
const ids = st2.custom.map((q) => q.id);
check(new Set(ids).size === ids.length, "no duplicate ids after re-import");

// unsupported formats give a clear message
await page.goto(base + "/#/import");
await page.setInputFiles("#file", { name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("x") });
await page.waitForSelector("text=could not be imported");
check(/xlsx/i.test(await page.textContent("#results")), "old .xls explained");

// imported topics show up everywhere
const topicKey = Object.keys(st2.cats)[0];
await page.goto(base + "/#/bank?src=mine"); await page.waitForSelector(".q-card");
check((await page.locator(".q-card").count()) > 0, "bank filters to imported questions");
await page.goto(base + "/#/practice?mine=1"); await page.waitForSelector("#ans");
check(true, "practice serves imported questions");
await page.goto(base + "/#/quiz?mine=1"); await page.waitForSelector("#start");
check((await page.locator("#cc h4").count()) === 1, "quiz lists 'Your material' topics");
await page.click("#start");
const qn = await page.locator(".opt").count();
check(qn === 4, "generated multiple choice has 4 options");
await page.goto(base + "/#/mock?mine=1"); await page.waitForSelector("#r");
check((await page.inputValue("#r")) === "mine", "mock offers imported round");
await page.goto(base + "/#/dashboard"); await page.waitForSelector("#mine");
check(true, "dashboard shows imported material");

// AI extraction path (mocked)
aiMode = "extractor";
await page.route(/text\.pollinations\.ai/, (r) => aiMode === "extractor" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ topic: "Notes", q: "What does the outbox pattern guarantee?", a: "At-least-once publication of events written in the same transaction as state." }] }) } }] }) }) : r.fallback());
await page.goto(base + "/#/import");
await page.setInputFiles("#file", fx("notes-only.txt"));
await page.waitForSelector("[data-act=ai-extract]");
await page.click("[data-act=ai-extract]");
await page.waitForSelector("text=Found 1 question", { timeout: 10000 });
check(true, "AI extract turns loose notes into a reviewable preview");
aiMode = "ok";

// remove an import
await page.goto(base + "/#/import");
page.once("dialog", (d) => d.accept());
const before = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).imports.length);
await page.click("[data-rm] >> nth=0");
await page.waitForTimeout(300);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).imports.length);
check(after === before - 1, `import removed (${before} -> ${after})`);

// optional: the real workbook (never committed)
if (process.env.WORKBOOK_PATH) {
  await page.goto(base + "/#/import");
  await page.setInputFiles("#file", process.env.WORKBOOK_PATH);
  await page.waitForSelector("[data-act=import]", { timeout: 20000 });
  await page.click("[data-act=import]"); await page.waitForSelector("text=Imported");
  await page.goto(base + "/#/quiz?mine=1"); await page.click("#start"); await page.click(".opt >> nth=0");
  check(true, "real workbook imports and quizzes in the browser");
}

// mobile layout has no horizontal overflow
await page.setViewportSize({ width: 390, height: 800 });
for (const r of ["dashboard", "bank", "code", "market", "import", "quiz"]) {
  await page.goto(`${base}/#/${r}`); await page.waitForTimeout(400);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 1, `mobile ${r}: horizontal overflow ${over}px`);
}

check(errors.length === 0, "no uncaught errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close(); server.close();
console.log(fails ? `\n${fails} FAILED` : "\nAll smoke checks passed");
process.exit(fails ? 1 : 0);
