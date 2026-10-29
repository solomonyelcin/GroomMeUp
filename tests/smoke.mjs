// Browser smoke test: loads every page, drives the main flows, fails on any uncaught error.
// Run: node tests/smoke.mjs   (needs playwright + a static server, see npm run test:smoke)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || "playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
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
const state = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")));
check(state.attempts.length === 1 && state.srs.ms03, "attempt + spaced repetition saved");

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

// mobile layout has no horizontal overflow
await page.setViewportSize({ width: 390, height: 800 });
for (const r of ["dashboard", "bank", "code", "market"]) {
  await page.goto(`${base}/#/${r}`); await page.waitForTimeout(400);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 1, `mobile ${r}: horizontal overflow ${over}px`);
}

check(errors.length === 0, "no uncaught errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close(); server.close();
console.log(fails ? `\n${fails} FAILED` : "\nAll smoke checks passed");
process.exit(fails ? 1 : 0);
