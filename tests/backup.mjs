// Wipe and restore, end to end: a browser that lost its data must be able to come back from a backup file,
// a progress code, or the encrypted GitHub copy, and must be offered that before starting empty.
// Run: PW_PATH=<playwright> node tests/backup.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || "playwright");
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok  :", m); };
const browser = await chromium.launch(), errors = [];
const DAY = 86400000;

async function newDevice({ setup = true, persist = true } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|text\.pollinations\.ai/, (r) => r.abort());
  await page.addInitScript(({ setup, persist }) => {
    try { if (!sessionStorage.getItem("init")) { sessionStorage.setItem("init", "1"); localStorage.setItem("groommeup.tour", "done"); if (setup) localStorage.setItem("groommeup.setup", "1"); } } catch {}
    window.__persistCalls = 0; let granted = false;
    try { Object.defineProperty(navigator, "storage", { configurable: true, value: { persisted: async () => granted, persist: async () => { window.__persistCalls++; granted = persist; return granted; }, estimate: async () => ({ usage: 1000, quota: 1e9 }) } }); } catch {}
  }, { setup, persist });
  return { ctx, page };
}

// ---------------------------------------------------------------- 1. a working device
const seed = () => {
  const now = Date.now();
  return { attempts: [1, 2, 3, 4, 5].map((i) => ({ qid: "q" + i, cat: "csharp", score: 6 + (i % 3), t: now - i * 3600000, mode: "practice" })), srs: { q1: { box: 2, due: now + DAY } }, quizzes: [{ t: now - 7200000, total: 4, correct: 3, cats: { csharp: [3, 4] } }],
    custom: [{ id: "uc1", c: "u:rest", d: 2, q: "What is idempotency?", a: "Same result when repeated.", imported: true, src: "imp1" }, { id: "uc2", c: "u:rest", d: 2, q: "What is a resource?", a: "Anything with a URI.", imported: true, src: "imp1" }], cats: { "u:rest": { name: "REST APIs", color: "#3a7" } }, imports: [{ id: "imp1", name: "rest.xlsx", kind: "Excel", t: now }],
    notes: { uc1: "PUT and DELETE are idempotent" }, log: [{ company: "Acme", date: "2026-10-01", outcome: "offer" }], articles: [{ id: "a1", title: "REST notes", topic: "REST", blocks: [{ type: "p", text: "Hello" }], t: now }],
    settings: { provider: "groq", aiChoice: true, keys: { groq: "gsk_SECRET_KEY" }, models: {}, target: "Senior .NET", pistonUrl: "", name: "Sol" } };
};
const A = await newDevice();
await A.page.addInitScript((s) => { if (!localStorage.getItem("groommeup.v1")) { localStorage.setItem("groommeup.v1", JSON.stringify(s)); localStorage.setItem("groommeup.gh", JSON.stringify({ owner: "solomonyelcin", repo: "GroomMeUp", branch: "main", token: "test-token" })); } }, seed());
let ghPuts = {}; // what GitHub received
await A.page.route(/api\.github\.com/, async (r) => {
  const u = new URL(r.request().url()), m = r.request().method(), p = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/?/, "");
  const j = (b, st = 200) => r.fulfill({ status: st, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(b) });
  if (m === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (m === "GET") return j({ message: "Not Found" }, 404);
  if (m === "PUT") { ghPuts[p] = Buffer.from(JSON.parse(r.request().postData()).content, "base64").toString(); return j({ content: {} }, 201); }
  return j({}, 500);
});
await A.page.goto(base + "/#/dashboard"); await A.page.waitForSelector("h1");
check((await A.page.$$(".gate")).length === 0, "a browser that already has data does not show the restore screen");
check(await A.page.evaluate(() => window.__persistCalls) >= 1, "persistent storage is requested on launch");
check(await A.page.isVisible("#backupBar"), "the reminder shows when there has never been a backup");
check((await A.page.textContent("#backupBar")).includes("not backed up"), "and says so");
// back up now from the bar: a file download
const [dl] = await Promise.all([A.page.waitForEvent("download"), A.page.click("#bbNow")]);
const file = fs.readFileSync(await dl.path(), "utf8"), bk = JSON.parse(file);
check(/^groommeup-backup-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), "the file is named with the date: " + dl.suggestedFilename());
check(bk.format === "groommeup-backup" && bk.state.attempts.length === 5 && bk.state.custom.length === 2 && bk.state.notes.uc1 && bk.state.articles.length === 1, "the backup holds answers, questions, notes and articles");
check(!file.includes("gsk_SECRET_KEY") && !file.includes("test-token"), "the plain file never contains the AI key or GitHub token");
await A.page.waitForSelector("#backupBar", { state: "hidden" });
check(true, "the reminder goes away after backing up");
// reminder timing
const setLast = (ms) => A.page.evaluate((t) => { const k = "groommeup.backup", m = JSON.parse(localStorage.getItem(k) || "{}"); m.last = t; m.snooze = 0; localStorage.setItem(k, JSON.stringify(m)); }, ms);
await setLast(Date.now() - 6 * DAY); await A.page.goto(base + "/#/practice"); await A.page.goto(base + "/#/dashboard"); await A.page.waitForSelector("h1");
check(await A.page.isHidden("#backupBar"), "6 days old: no reminder yet");
await setLast(Date.now() - 8 * DAY); await A.page.reload(); await A.page.waitForSelector("h1");
check(await A.page.isVisible("#backupBar") && (await A.page.textContent("#backupBar")).includes("8 days ago"), "8 days old: reminder says how old it is");
await A.page.click("#bbLater");
check(await A.page.isHidden("#backupBar"), "Later hides it");
await A.page.reload(); await A.page.waitForSelector("h1");
check(await A.page.isHidden("#backupBar"), "and it stays hidden for a day");
// the Settings card: encrypted copy to GitHub
await A.page.goto(base + "/#/settings?focus=backup"); await A.page.waitForSelector("#bkNow");
check((await A.page.textContent("#bkPersist")).includes("Not protected") || (await A.page.textContent("#bkPersist")).includes("Protected"), "storage protection status is shown");
await A.page.check("#bkGh");
await A.page.fill("#bkPass", "short");
await A.page.click("#bkNow");
check((await A.page.textContent("#bkMsg")).includes("at least 10"), "a short passphrase is refused for the public copy");
check(Object.keys(ghPuts).length === 0, "nothing was sent to GitHub with a weak passphrase");
const PASS = "correct horse battery staple";
await A.page.fill("#bkPass", PASS);
const [dl2] = await Promise.all([A.page.waitForEvent("download"), A.page.click("#bkNow")]);
await A.page.waitForFunction(() => /Done/.test(document.querySelector("#bkMsg").textContent));
check((await A.page.textContent("#bkMsg")).includes("encrypted copy to GitHub"), "Back up now saved a file and an encrypted GitHub copy");
const env = ghPuts["contents/backup/progress.enc.json"];
check(!!env && !env.includes("REST APIs") && !env.includes("gsk_SECRET_KEY") && JSON.parse(env).cipher === "AES-256-GCM", "the GitHub copy is encrypted (no readable content)");
const plainAfter = JSON.parse(fs.readFileSync(await dl2.path(), "utf8"));
check(plainAfter.state.attempts.length === 5, "the device file is still written alongside it");
const code = await A.page.evaluate(async () => (await import("/js/transfer.js")).makeProgressCode());
check(code.startsWith("GMU1."), "a progress code can be made");
await A.ctx.close();

// ---------------------------------------------------------------- 2. a wiped device
const restoredOk = async (page, label) => {
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1") || "{}"));
  check(st.attempts?.length === 5 && st.custom?.length === 2 && st.notes?.uc1 && st.log?.length === 1 && st.articles?.length === 1 && st.cats?.["u:rest"], label + ": answers, questions, notes, interviews, articles and topics are back");
  return st;
};
{ // 2a. start empty
  const B = await newDevice({ setup: false });
  await B.page.goto(base + "/#/dashboard"); await B.page.waitForSelector(".gate");
  check((await B.page.textContent(".gate")).includes("Restore from a backup file") && (await B.page.textContent(".gate")).includes("Restore the encrypted backup from GitHub"), "an empty browser is offered restore options before starting");
  check((await B.page.textContent("#gDone")) === "Start empty", "with an explicit Start empty choice");
  check(await B.page.evaluate(() => window.__persistCalls) === 0, "storage is not requested until the screen is dismissed");
  await B.page.click("#gDone"); await B.page.waitForSelector("h1");
  check((await B.page.$$(".gate")).length === 0, "Start empty continues to the app");
  check(await B.page.evaluate(() => window.__persistCalls) >= 1, "then storage protection is requested");
  await B.page.reload(); await B.page.waitForSelector("h1");
  check((await B.page.$$(".gate")).length === 0, "the screen does not come back on the next visit");
  check(await B.page.isHidden("#backupBar"), "no reminder for an empty app");
  await B.ctx.close();
}
{ // 2b. restore from the backup file
  const B = await newDevice({ setup: false });
  await B.page.goto(base + "/#/dashboard"); await B.page.waitForSelector(".gate");
  await B.page.setInputFiles("#gFile", { name: "groommeup-backup.json", mimeType: "application/json", buffer: Buffer.from(file) });
  await B.page.waitForFunction(() => /Restored/.test(document.querySelector("#gMsg").textContent));
  check((await B.page.textContent("#gMsg")).includes("5 answers") && (await B.page.textContent("#gMsg")).includes("2 questions"), "the screen says what came back: " + (await B.page.textContent("#gMsg")));
  check((await B.page.textContent("#gDone")) === "Continue", "the button becomes Continue");
  await B.page.click("#gDone"); await B.page.waitForSelector("h1");
  await restoredOk(B.page, "file");
  const st = await B.page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")));
  check(!st.settings.keys.groq, "the plain file does not bring a key back (add it again in Settings)");
  check(await B.page.evaluate(() => localStorage.getItem("groommeup.tour")) === "seen", "no welcome tour after a restore");
  await B.page.goto(base + "/#/bank"); await B.page.waitForSelector("h1");
  check((await B.page.textContent("body")).includes("What is idempotency?") || (await B.page.textContent("body")).includes("REST APIs"), "restored questions appear in the app");
  await B.ctx.close();
}
{ // 2c. restore from the encrypted GitHub copy
  const B = await newDevice({ setup: false });
  let served = true;
  await B.page.route(/backup\/progress\.enc\.json/, (r) => (served ? r.fulfill({ status: 200, contentType: "application/json", body: env }) : r.fulfill({ status: 404, body: "nf" })));
  await B.page.route(/raw\.githubusercontent\.com/, (r) => r.fulfill({ status: 404, body: "nf" }));
  await B.page.goto(base + "/#/dashboard"); await B.page.waitForSelector(".gate");
  await B.page.click(".gate-opt:has-text('encrypted backup from GitHub') summary");
  await B.page.fill("#gGhp", ""); await B.page.click("#gGhGo");
  check((await B.page.textContent("#gMsg")).includes("Enter the backup passphrase"), "a passphrase is required");
  await B.page.fill("#gGhp", "wrong passphrase here"); await B.page.click("#gGhGo");
  await B.page.waitForFunction(() => /Wrong passphrase/.test(document.querySelector("#gMsg").textContent));
  check(await B.page.evaluate(() => localStorage.getItem("groommeup.v1")) === null, "a wrong passphrase restores nothing");
  await B.page.fill("#gGhp", PASS); await B.page.click("#gGhGo");
  await B.page.waitForFunction(() => /Restored/.test(document.querySelector("#gMsg").textContent));
  await B.page.click("#gDone"); await B.page.waitForSelector("h1");
  await restoredOk(B.page, "GitHub copy");
  await B.ctx.close();
  const C = await newDevice({ setup: false });
  served = false;
  await C.page.route(/backup\/progress\.enc\.json/, (r) => r.fulfill({ status: 404, body: "nf" }));
  await C.page.route(/raw\.githubusercontent\.com/, (r) => r.fulfill({ status: 404, body: "nf" }));
  await C.page.goto(base + "/#/dashboard"); await C.page.waitForSelector(".gate");
  await C.page.click(".gate-opt:has-text('encrypted backup from GitHub') summary"); await C.page.fill("#gGhp", PASS); await C.page.click("#gGhGo");
  await C.page.waitForFunction(() => /No encrypted backup/.test(document.querySelector("#gMsg").textContent));
  check(true, "when no GitHub copy exists the screen says so");
  await C.ctx.close();
}
{ // 2d. an encrypted file picked from disk asks for its passphrase
  const B = await newDevice({ setup: false });
  await B.page.goto(base + "/#/dashboard"); await B.page.waitForSelector(".gate");
  await B.page.setInputFiles("#gFile", { name: "progress.enc.json", mimeType: "application/json", buffer: Buffer.from(env) });
  await B.page.waitForSelector("#gFp:visible");
  await B.page.fill("#gFp", PASS); await B.page.click("#gFpGo");
  await B.page.waitForFunction(() => /Restored/.test(document.querySelector("#gMsg").textContent));
  await B.page.click("#gDone"); await B.page.waitForSelector("h1");
  await restoredOk(B.page, "encrypted file");
  await B.ctx.close();
}
{ // 2e. a progress code
  const B = await newDevice({ setup: false });
  await B.page.goto(base + "/#/dashboard"); await B.page.waitForSelector(".gate");
  await B.page.click(".gate-opt:has-text('progress code') summary"); await B.page.fill("#gCode", "GMU1.notacode"); await B.page.click("#gCodeGo");
  await B.page.waitForFunction(() => /damaged|not a GroomMeUp/.test(document.querySelector("#gMsg").textContent));
  check(true, "a damaged code is reported, not applied");
  await B.page.fill("#gCode", code); await B.page.click("#gCodeGo");
  await B.page.waitForFunction(() => /Restored from the code/.test(document.querySelector("#gMsg").textContent));
  await B.page.click("#gDone"); await B.page.waitForSelector("h1");
  const st = await B.page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")));
  check(st.attempts.length === 5 && st.log.length === 1, "code: answers and interview log are back (the question bank comes from the file or library)");
  await B.ctx.close();
}
{ // 2f. library unlock on the gate
  const B = await newDevice({ setup: false });
  await B.page.goto(base + "/#/dashboard"); await B.page.waitForSelector(".gate");
  const libEnv = await B.page.evaluate(async () => (await import("/js/library.js")).encryptLibrary({ name: "My library", kind: "test", items: [{ topic: "Design Patterns", q: "What is the factory pattern?", a: "Creates objects without exposing the creation logic.", status: "", kind: "qa" }] }, "lib passphrase", 1000));
  await B.page.route(/library\/library\.enc\.json/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(libEnv) }));
  await B.page.reload(); await B.page.waitForSelector(".gate");
  await B.page.waitForSelector("#gLib:not([hidden])"); await B.page.click("#gLib summary");
  await B.page.fill("#gLibp", "nope"); await B.page.click("#gLibGo");
  await B.page.waitForFunction(() => /Wrong passphrase/.test(document.querySelector("#gMsg").textContent));
  await B.page.fill("#gLibp", "lib passphrase"); await B.page.click("#gLibGo");
  await B.page.waitForFunction(() => /Library unlocked/.test(document.querySelector("#gMsg").textContent));
  await B.page.click("#gDone"); await B.page.waitForSelector("h1");
  check((await B.page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")).custom.length)) >= 1, "the encrypted library is unlocked from the restore screen");
  await B.ctx.close();
}
{ // 2g. the Settings restore of a file replaces everything after confirmation; keys typed on this device survive a keyless file
  const B = await newDevice({ setup: true });
  await B.page.addInitScript(() => { if (!localStorage.getItem("groommeup.v1")) localStorage.setItem("groommeup.v1", JSON.stringify({ attempts: [], settings: { provider: "groq", keys: { groq: "KEEP_ME" }, models: {} } })); });
  await B.page.goto(base + "/#/settings"); await B.page.waitForSelector("#imp", { state: "attached" });
  B.page.once("dialog", (d) => d.accept());
  await Promise.all([B.page.waitForEvent("load"), B.page.setInputFiles("#imp", { name: "b.json", mimeType: "application/json", buffer: Buffer.from(file) })]);
  await B.page.waitForSelector("h1");
  const st = await restoredOk(B.page, "Settings restore");
  check(st.settings.keys.groq === "KEEP_ME", "a key already typed on this device is kept when restoring a keyless backup");
  await B.ctx.close();
}
{ // 2h. the encrypted copy can carry the AI key and GitHub token when asked
  const B = await newDevice({ setup: true });
  await B.page.addInitScript((st) => { if (!localStorage.getItem("groommeup.v1")) { localStorage.setItem("groommeup.v1", JSON.stringify(st)); localStorage.setItem("groommeup.gh", JSON.stringify({ owner: "solomonyelcin", repo: "GroomMeUp", branch: "main", token: "tok_SECRET" })); } }, seed());
  await B.page.goto(base + "/#/dashboard"); await B.page.waitForSelector("h1");
  const sealed = await B.page.evaluate(async () => { const b = await import("/js/backup.js"), l = await import("/js/library.js"); return JSON.stringify(await l.encryptLibrary(b.buildBackup({ secrets: true }), "a long secret passphrase", 1000)); });
  check(!sealed.includes("gsk_SECRET_KEY") && !sealed.includes("tok_SECRET"), "secrets inside the encrypted copy are not readable");
  await B.ctx.close();
  const C = await newDevice({ setup: false });
  await C.page.goto(base + "/#/dashboard"); await C.page.waitForSelector(".gate");
  await C.page.setViewportSize({ width: 390, height: 800 });
  await C.page.screenshot({ path: path.join(process.env.SHOT_DIR || "/tmp", "gate-mobile.png") });
  await C.page.setInputFiles("#gFile", { name: "p.enc.json", mimeType: "application/json", buffer: Buffer.from(sealed) });
  await C.page.fill("#gFp", "a long secret passphrase"); await C.page.click("#gFpGo");
  await C.page.waitForFunction(() => /Restored/.test(document.querySelector("#gMsg").textContent));
  await C.page.click("#gDone"); await C.page.waitForSelector("h1");
  const got = await C.page.evaluate(() => ({ s: JSON.parse(localStorage.getItem("groommeup.v1")), g: JSON.parse(localStorage.getItem("groommeup.gh")) }));
  check(got.s.settings.keys.groq === "gsk_SECRET_KEY" && got.g.token === "tok_SECRET", "AI key and GitHub token come back from an encrypted copy that included them");
  await C.page.setViewportSize({ width: 390, height: 800 }); await C.page.goto(base + "/#/settings?focus=backup"); await C.page.waitForSelector("#bkNow"); await C.page.waitForTimeout(400);
  await C.page.screenshot({ path: path.join(process.env.SHOT_DIR || "/tmp", "backup-card-mobile.png") });
  check(await C.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the backup card fits a phone");
  await C.ctx.close();
}
await browser.close(); server.close();
check(errors.length === 0, "no uncaught errors" + (errors.length ? ": " + errors.join(" | ") : ""));
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
