// Library storage test against a fake GitHub: what you add must land in the (private) repo, nothing may stay on the device,
// and a second device with the same token must see it. Also: paste text, web address, quiz from an article.
// Run: PW_PATH=<playwright> node tests/library.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || "playwright");
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".pdf": "application/pdf" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok  :", m); };
const fx = (n) => path.join(root, "tests/fixtures", n);
const browser = await chromium.launch(), errors = [];

// ---- a tiny fake of the GitHub contents API (private repo) ----
const repo = new Map(); let shaN = 0, rawReads = 0, writes = [];
const fake = async (route) => {
  const req = route.request(), u = new URL(req.url()), m = /^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/(.*))?\/?$/.exec(u.pathname);
  const json = (o, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (u.pathname === "/user") return json({ login: "solomonyelcin" });
  if (!m) return json({ message: "nf" }, 404);
  if (req.headers().authorization !== "Bearer tok123") return json({ message: "bad" }, 401);
  const file = m[3] && decodeURIComponent(m[3]);
  if (!file) return json({ full_name: `${m[1]}/${m[2]}`, private: true, permissions: { push: true } });
  if (req.method() === "GET") {
    const f = repo.get(file); if (!f) return json({ message: "Not Found" }, 404);
    if (/raw/.test(req.headers().accept || "")) { rawReads++; return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/octet-stream" }, body: f.bytes }); }
    return json({ sha: f.sha, content: f.bytes.toString("base64") });
  }
  const body = JSON.parse(req.postData() || "{}");
  if (req.method() === "PUT") { const old = repo.get(file); if (old && body.sha !== old.sha) return json({ message: "sha" }, 409); repo.set(file, { sha: "s" + ++shaN, bytes: Buffer.from(body.content, "base64") }); writes.push(file); return json({ content: { sha: "s" + shaN } }, old ? 200 : 201); }
  if (req.method() === "DELETE") { repo.delete(file); return json({}); }
  return json({}, 400);
};
async function device() {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|text\.pollinations\.ai/, (r) => r.abort());
  await page.route("https://api.github.com/**", fake);
  await page.addInitScript(() => { try { if (!sessionStorage.getItem("i")) { sessionStorage.setItem("i", "1"); localStorage.setItem("groommeup.tour", "done"); localStorage.setItem("groommeup.setup", "1"); localStorage.setItem("groommeup.backup", JSON.stringify({ snooze: Date.now() + 9e9 })); localStorage.setItem("groommeup.gh", JSON.stringify({ owner: "me", repo: "GroomMeUp-data", branch: "main", token: "tok123" })); } } catch { /* ignore */ } });
  return page;
}
const localState = (page) => page.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem("groommeup.v1") || "{}");
  const n = await new Promise((res) => { const r = indexedDB.open("groommeup-img", 1); r.onupgradeneeded = () => r.result.createObjectStore("blobs"); r.onsuccess = () => { const c = r.result.transaction("blobs").objectStore("blobs").count(); c.onsuccess = () => res(c.result); }; r.onerror = () => res(-1); });
  return { articles: (s.articles || []).length, blobs: n };
});

const A = await device();
await A.goto(base + "/#/settings?focus=gh"); await A.waitForSelector("#ghsave");
await A.click("#ghsave"); await A.waitForFunction(() => localStorage.getItem("groommeup.user") === "solomonyelcin", null, { timeout: 8000 });
await A.waitForLoadState("load"); await A.waitForTimeout(800);
check(true, "Settings tests the connection and signs in");

// ---- a Word file with a picture goes to the repo, nothing stays on the device ----
await A.goto(base + "/#/library?tab=add"); await A.waitForSelector("#adrop");
check(/saved in your GitHub repository/.test(await A.textContent("#storeNote")), "Add page says everything is saved in the repository");
await A.setInputFiles("#afile", fx("article.docx")); await A.waitForSelector("#ac1 [data-go]");
await A.check("#ac1 input[type=radio][value=article]");
await A.click("#ac1 [data-go]"); await A.waitForSelector("#ac1 .callout.ok", { timeout: 15000 });
const ids = [...repo.keys()].filter((k) => /\/article\.json$/.test(k)).map((k) => k.split("/")[1]);
check(ids.length === 1 && repo.has(`content/${ids[0]}/original.docx`) && [...repo.keys()].some((k) => /\/img\/1\.png$/.test(k)) && repo.has("content/articles.json"), "article, original file, picture and list are in the repo: " + [...repo.keys()].join(", "));
const man = JSON.parse(repo.get("content/articles.json").bytes.toString());
check(man[0].kind === "doc" && man[0].original.ext === "docx" && man[0].images.length === 1, "list entry describes the document");
const blocks = JSON.parse(repo.get(man[0].file).bytes.toString());
check(blocks.some((b) => b.type === "img" && b.path && !b.id), "picture block points at the repo path");
let ls = await localState(A);
check(ls.articles === 0 && ls.blobs === 0, "nothing stored on the device: " + JSON.stringify(ls));

// ---- reading it back: text, picture, original (through the token) ----
await A.click("#ac1 .callout.ok a"); await A.waitForSelector(".art");
await A.waitForFunction(() => { const i = document.querySelector(".art img"); return i && i.naturalWidth > 0; }, null, { timeout: 8000 });
check(/Caching Guide/.test(await A.textContent(".art")) && (await A.locator(".art table").count()) === 1, "article reads back from the repo, with its picture");
await A.click("#mOrig"); await A.waitForSelector("#aorig a[download]");
const dl = A.waitForEvent("download"); await A.click("#aorig a[download]");
check((await dl).suggestedFilename() === "article.docx", "original downloads from the repo");
await A.click("#mRead");

// ---- edit goes back to the repo ----
await A.click("#aedit"); await A.waitForSelector("#amd");
await A.fill("#amd", (await A.inputValue("#amd")) + "\n\nAdded line from the test.");
await A.click("#asave"); await A.waitForSelector(".art");
check(/Added line from the test/.test(repo.get(man[0].file).bytes.toString()), "edit is written to the repo");

// ---- paste text (4 sections) -> article in repo -> quiz from it ----
await A.goto(base + "/#/library?tab=add"); await A.waitForSelector("#adrop");
const md = "# Messaging basics\n\n## Queues\nA queue decouples producers from consumers so spikes are absorbed and work can be retried later without callers waiting.\n\n## Topics\nA topic fans one message out to many independent subscribers, each receiving its own copy of every message.\n\n## Dead letters\nA dead letter queue holds messages that could not be processed after several attempts so they can be inspected later.\n\n## Ordering\nOrdering is only guaranteed inside one partition, so related messages must share a partition key to stay in sequence.";
await A.fill("#ptext", md); await A.click("#pgoText"); await A.waitForSelector("#ac1 [data-go]");
await A.check("#ac1 input[type=radio][value=article]"); await A.click("#ac1 [data-go]"); await A.waitForSelector("#ac1 .callout.ok");
check([...repo.keys()].filter((k) => /\/article\.json$/.test(k)).length === 2, "pasted text saved to the repo as an article");
await A.click("#ac1 .callout.ok a"); await A.waitForSelector("#aquiz");
await A.click("#aquiz"); await A.waitForSelector("#main h1, #main h2");
await A.waitForTimeout(400);
check(/quiz/i.test(await A.evaluate(() => location.hash)) && /cat=/.test(await A.evaluate(() => location.hash)), "Quiz me on this opens the quiz for that article: " + await A.evaluate(() => location.hash));
const quizText = await A.textContent("#main");
check(/Messaging basics|Queues|question/i.test(quizText), "quiz page shows the article's topic");
await A.click("#start"); await A.waitForSelector(".opt");
check((await A.locator(".opt").count()) === 4, "the quiz asks multiple choice questions with four options");

// ---- web address through the helper ----
await A.route("https://api.allorigins.win/**", (r) => r.fulfill({ status: 200, contentType: "text/html", headers: { "access-control-allow-origin": "*" }, body: `<html><head><title>Cache Aside | Docs</title></head><body><nav>menu menu</nav><article><h1>Cache Aside</h1><p>Load data on demand into a cache from a data store. This can improve <strong>performance</strong> and help maintain consistency.</p><h2>Context</h2><p>Applications use a cache to improve repeated access to information held in a data store, see <a href="https://example.com/x">the docs</a>.</p><ul><li>Read through</li><li>Write behind</li></ul><pre>var v = cache.Get(k);</pre><table><tr><th>Layer</th><th>Latency</th></tr><tr><td>L1</td><td>1 ns</td></tr></table></article><footer>footer junk</footer></body></html>` }));
await A.route("https://docs.example.org/**", (r) => r.abort()); // direct reading is blocked, as on most sites
await A.goto(base + "/#/library?tab=add"); await A.waitForSelector("#adrop");
await A.fill("#purl", "https://docs.example.org/cache-aside"); await A.click("#pgoUrl"); await A.waitForSelector("#ac1 [data-go]", { timeout: 15000 });
const card = await A.textContent("#ac1");
check(/Web page \(docs\.example\.org\)/.test(card) && /1 table/.test(card) && !/menu menu|footer junk/.test(card), "web page read through the helper, menus and footer left out: " + card.slice(0, 200).replace(/\s+/g, " "));
await A.check("#ac1 input[type=radio][value=article]"); await A.click("#ac1 [data-go]"); await A.waitForSelector("#ac1 .callout.ok");
const urlBlocks = [...repo.entries()].filter(([k]) => /\/article\.json$/.test(k)).map(([, v]) => JSON.parse(v.bytes.toString())).find((b) => b[0]?.text === "Cache Aside");
check(urlBlocks && urlBlocks.some((b) => b.type === "code") && urlBlocks.some((b) => b.type === "ul" && b.items.length === 2) && urlBlocks.some((b) => b.type === "p" && b.text.includes("[the docs](https://example.com/x)")), "web page kept headings, list, code, table and link");

// ---- a second device with the same token sees everything ----
const B = await device();
await B.goto(base + "/#/library?tab=articles"); await B.waitForFunction(() => document.querySelectorAll(".art-item").length >= 3, null, { timeout: 10000 });
check((await B.locator(".art-item").count()) >= 3, "a second device lists the same library from the repo");
const lsB = await localState(B); check(lsB.articles === 0 && lsB.blobs === 0, "second device stores nothing either");

// ---- delete removes it from the repo ----
await B.click(".art-item:has-text('Cache Aside')"); await B.waitForSelector("#adel");
B.once("dialog", (d) => d.accept()); await B.click("#adel"); await B.waitForTimeout(800);
check(![...repo.keys()].some((k) => k.endsWith("/article.json") && JSON.parse(repo.get(k).bytes.toString())[0]?.text === "Cache Aside"), "delete removes the article from the repo");
const left = JSON.parse(repo.get("content/articles.json").bytes.toString());
check(left.length === 2, "list updated: " + left.length);

// ---- without GitHub the app says so and keeps working locally ----
const C = await browser.newPage({ serviceWorkers: "block" }); // (plain page, no token)
await C.addInitScript(() => { try { localStorage.setItem("groommeup.tour", "done"); localStorage.setItem("groommeup.setup", "1"); localStorage.setItem("groommeup.backup", JSON.stringify({ snooze: Date.now() + 9e9 })); } catch { /* ignore */ } });
await C.goto(base + "/#/library?tab=add"); await C.waitForSelector("#storeNote");
check(/GitHub is not connected/.test(await C.textContent("#storeNote")), "unconnected: tells you the library stays on this device");

check(errors.length === 0, "no uncaught errors" + (errors.length ? ": " + errors.join(" | ").slice(0, 300) : ""));
await browser.close(); server.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
