// Library home, daily picks and the improved articles reader, on desktop and phone. Run: PW_PATH=<playwright> node tests/libui.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || "playwright");
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const today = new Date().toISOString().slice(0, 10);
const FEED = { updated: new Date().toISOString(), items: [
  { id: "d1", title: "What's new in EF Core 10", url: "https://example.org/efcore-10", source: ".NET Blog", date: today, added: today, summary: "Entity Framework improvements for SQL Server.", topics: ["efcore", "dotnet"], score: 9 },
  { id: "d2", title: "Angular signals in practice", url: "https://example.org/signals", source: "Angular Blog", date: today, added: today, summary: "Signals with RxJS.", topics: ["angular"], score: 7 },
  { id: "d3", title: "Outbox pattern explained", url: "https://example.org/outbox", source: "Milan Jovanovic", date: "2026-10-01", added: "2026-10-01", summary: "Reliable messaging.", topics: ["architecture"], score: 6 }] };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  if (p === "/content/daily/feed.json") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(FEED)); }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok  :", m); };
const browser = await chromium.launch(), errors = [];
const SHOTS = process.env.SHOT_DIR || "/tmp";
async function open(w, h, seed) {
  const c = await browser.newContext({ serviceWorkers: "block", viewport: { width: w, height: h } });
  await c.addInitScript((s) => { try { localStorage.setItem("groommeup.tour", "done"); localStorage.setItem("groommeup.setup", "1"); localStorage.setItem("groommeup.backup", JSON.stringify({ snooze: Date.now() + 9e11 })); if (s && !localStorage.getItem("groommeup.v1")) localStorage.setItem("groommeup.v1", JSON.stringify(s)); } catch {} }, seed || null);
  const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p;
}
const blocks = (n) => Array.from({ length: n }, (_, i) => ({ type: "p", text: `Paragraph ${i} about dependency injection lifetimes, scoped services and middleware. `.repeat(8) }));
const seed = { custom: [], articles: [
  { id: "a1", kind: "doc", title: "DI notes", topic: "Notes", t: Date.now() - 1000, blocks: [{ type: "title", text: "DI notes" }, ...blocks(40)] },
  { id: "a2", kind: "doc", title: "Azure cheat sheet", topic: "Notes", t: Date.now() - 5000, blocks: [{ type: "title", text: "Azure cheat sheet" }, ...blocks(3)] }] };

for (const [name, w, h] of [["desk", 1280, 900], ["phone", 390, 800]]) {
  const page = await open(w, h, seed);
  await page.goto(base + "/#/library"); await page.waitForSelector("#lq");
  check(await page.locator(".mode-tabs a").count() === 7, `${name}: seven Library tabs`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: home has no horizontal scroll`);
  await page.waitForSelector(".lib-tile"); const tiles = await page.locator(".lib-tile b").allTextContents();
  check(tiles[0] === "11" && Number(tiles[3]) === 2, `${name}: home counts articles (${tiles[0]}) and new picks (${tiles[3]})`);
  await page.waitForSelector(".mode-tabs .badge"); check((await page.textContent(".mode-tabs .badge")) === "2", `${name}: Daily picks tab shows 2 new`);
  await page.screenshot({ path: `${SHOTS}/lib-${name}-home.png`, fullPage: true });
  // search across everything
  await page.fill("#lq", "lifetime"); await page.waitForSelector(".lib-row");
  const tags = await page.locator(".lib-row .tag").allTextContents();
  check(tags.includes("Article") && tags.includes("Question"), `${name}: one search finds articles and questions (${[...new Set(tags)].join(", ")})`);
  await page.fill("#lq", "outbox"); await page.waitForSelector(".lib-row");
  check((await page.locator(".lib-row .tag").allTextContents()).includes("Pick"), `${name}: search finds daily picks`);
  await page.click('[data-type="faqs"]'); await page.fill("#lq", "zzzzqq"); check(/Nothing matches/.test(await page.textContent("#lhBody")), `${name}: empty search says so`);
  await page.fill("#lq", ""); await page.click('[data-type="all"]');
  // roadmap
  await page.goto(base + "/#/library?tab=roadmap"); await page.waitForSelector(".rm-card");
  check(await page.locator(".rm-card").count() === 8, `${name}: Roadmap shows the eight tracks`);
  await page.waitForSelector('.rm-card a:has-text("Read guide")'); check(await page.locator('.rm-card a:has-text("Read guide")').count() === 8, `${name}: every track links its study guide`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: roadmap has no horizontal scroll`);
  await page.screenshot({ path: `${SHOTS}/lib-${name}-roadmap.png`, fullPage: true });
  await page.locator('.rm-card a:has-text("Read guide")').first().click(); await page.waitForFunction(() => /senior interview guide/.test(document.querySelector("article.art")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
  check(/C#|\.NET/.test(await page.textContent("article.art")), `${name}: a roadmap guide opens in the reader`);
  await page.goto(base + "/#/library?tab=articles"); await page.waitForSelector(".art-group");
  check((await page.locator(".art-group").allTextContents()).join().includes("Roadmap"), `${name}: Articles groups the roadmap guides`);
  // daily picks
  await page.goto(base + "/#/library?tab=daily"); await page.waitForSelector(".pick");
  check(await page.locator(".pick").count() === 2, `${name}: Daily picks shows the 2 new items by default`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: daily picks has no horizontal scroll`);
  await page.screenshot({ path: `${SHOTS}/lib-${name}-daily.png`, fullPage: true });
  await page.click('[data-topic="angular"]'); check(await page.locator(".pick").count() === 1, `${name}: topic filter narrows the picks`);
  await page.click('[data-topic="all"]'); await page.click('[data-show="all"]'); check(await page.locator(".pick").count() === 3, `${name}: All shows older picks too`);
  await page.locator(".pick [data-save]").first().click(); await page.click('[data-show="saved"]'); check(await page.locator(".pick").count() === 1, `${name}: saving a pick lists it under Saved`);
  await page.click('[data-show="all"]'); await page.locator(".pick [data-hide]").first().click(); check(await page.locator(".pick").count() === 2, `${name}: hiding removes a pick`);
  const href = await page.locator(".pick a.btn", { hasText: "Add to library" }).first().getAttribute("href");
  check(/#\/library\?tab=add&url=https%3A%2F%2Fexample\.org/.test(href), `${name}: Add to library carries the address`);
  // articles reader
  await page.goto(base + "/#/library?tab=articles"); await page.waitForSelector(".art-item");
  if (name === "phone") { check(await page.isHidden(".faq-main"), "phone: the list shows first, the article is on its own screen"); }
  await page.click('.art-item[data-id="a1"]'); await page.waitForSelector("#astar");
  if (name === "phone") { check(await page.isHidden(".faq-side") && await page.isVisible("#aback"), "phone: opening an article shows it full screen with a back button"); }
  check(/min read/.test(await page.textContent(".art-bar")), `${name}: reading time shown`);
  await page.click("#astar"); check((await page.textContent("#astar")).includes("Starred"), `${name}: star an article`);
  const fs0 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".art")).fontSize));
  await page.click("#afsp"); const fs1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".art")).fontSize));
  check(fs1 > fs0, `${name}: A+ makes the text larger (${fs0} to ${fs1})`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(1000);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).libmeta);
  check(st.art.a1.fav === true && st.art.a1.done === true && st.prefs.size === 110, `${name}: star, read progress and text size are remembered`);
  await page.screenshot({ path: `${SHOTS}/lib-${name}-article.png` });
  if (name === "phone") { await page.click("#aback"); await page.waitForSelector(".art-item"); }
  await page.click('[data-filt="star"]'); check(await page.locator(".art-item").count() === 1, `${name}: Starred filter`);
  await page.click('[data-filt="unread"]'); const ul = await page.textContent(".art-list"); check(/Azure/.test(ul) && !/DI notes/.test(ul), `${name}: Unread filter hides the finished article`);
  await page.goto(base + "/#/library"); await page.waitForSelector(".lib-tile");
  check((await page.textContent("#lhBody")).includes("Starred"), `${name}: home shows starred items`);
  await page.close();
}
check(errors.length === 0, "no uncaught errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
