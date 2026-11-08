// Two people, two devices, one fake GitHub: sign-in, progress sync, conflicts, sign-out, and that nobody sees anyone else's data.
// Run: PW_PATH=<playwright> node tests/accounts.mjs
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

// fake GitHub with several owners; tokens: tokA -> alice, tokB -> bob
const TOK = { tokA: "alice", tokB: "bob" }, repos = { alice: new Map(), bob: new Map() }; let shaN = 0;
const fake = async (route) => {
  const req = route.request(), u = new URL(req.url());
  const J = (o, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  const who = TOK[(req.headers().authorization || "").replace("Bearer ", "")]; if (!who) return J({ message: "bad" }, 401);
  if (u.pathname === "/user") return J({ login: who, name: who[0].toUpperCase() + who.slice(1), avatar_url: "" });
  const m = /^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/(.*))?\/?$/.exec(u.pathname); if (!m) return J({}, 404);
  if (m[1] !== who) return J({ message: "Not Found" }, 404); // nobody can reach another person's repository
  const store = repos[who], file = m[3] && decodeURIComponent(m[3]);
  if (!file) return J({ full_name: `${m[1]}/${m[2]}`, private: true, permissions: { push: true } });
  if (req.method() === "GET") { const f = store.get(file); if (!f) return J({ message: "Not Found" }, 404); if (/raw/.test(req.headers().accept || "")) return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: f.bytes }); return J({ sha: f.sha, content: f.bytes.toString("base64") }); }
  const body = JSON.parse(req.postData() || "{}");
  if (req.method() === "PUT") { const old = store.get(file); if (old && body.sha !== old.sha) return J({ message: "sha" }, 409); store.set(file, { sha: "s" + ++shaN, bytes: Buffer.from(body.content, "base64") }); return J({ content: { sha: "s" + shaN } }, old ? 200 : 201); }
  if (req.method() === "DELETE") { store.delete(file); return J({}); }
  return J({}, 400);
};
async function device() {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|text\.pollinations\.ai/, (r) => r.abort());
  await page.route("https://api.github.com/**", fake);
  await page.addInitScript(() => { try { if (!sessionStorage.getItem("i")) { sessionStorage.setItem("i", "1"); localStorage.setItem("groommeup.tour", "done"); if (!localStorage.getItem("groommeup.user")) { localStorage.setItem("groommeup.setup", "1"); localStorage.setItem("groommeup.backup", JSON.stringify({ snooze: Date.now() + 9e9 })); } } } catch { /* ignore */ } });
  return page;
}
const signIn = async (page, token, owner) => {
  await page.goto(base + "/#/settings?focus=gh"); await page.waitForSelector("#ghsave");
  await page.fill("#ghowner", owner); await page.fill("#ghrepo", "GroomMeUp-data"); await page.fill("#ghtoken", token);
  await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 15000 }).catch(() => {}), page.click("#ghsave")]);
  await page.waitForSelector("#acctLine strong", { timeout: 15000 });
};
const mark = (page, v) => page.evaluate(async (v) => { const { store } = await import("/js/store.js"); store.update((s) => { s.marker = v; }); }, v);
const getMark = (page) => page.evaluate(async () => (await import("/js/store.js")).store.get().marker || "");
const pushed = (who) => { const f = repos[who].get("progress/state.json"); return f ? JSON.parse(f.bytes.toString()) : null; };

// 1. a guest with progress signs in and the progress moves into the account
const D1 = await device();
await D1.goto(base + "/#/dashboard"); await D1.waitForSelector("#acctLine");
check(/Guest/.test(await D1.textContent("#acctLine")), "starts as a guest");
await mark(D1, "alice-1");
await signIn(D1, "tokA", "alice");
check((await D1.textContent("#acctLine")).includes("alice"), "signed in as alice");
check(await getMark(D1) === "alice-1", "guest progress moved into the account");
const keys1 = await D1.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("groommeup.v1")));
check(keys1.length === 1 && keys1[0] === "groommeup.v1.u.alice", "stored under alice's name only: " + keys1);
await D1.evaluate(async () => (await import("/js/sync.js")).pushNow());
check(pushed("alice")?.state.marker === "alice-1", "progress is in alice's repository");
check(!JSON.stringify(pushed("alice")).includes('"keys":{"'), "AI keys are not uploaded");

// 2. the same account on a second device gets that progress
const D2 = await device();
await signIn(D2, "tokA", "alice");
check(await getMark(D2) === "alice-1", "second device shows the same progress");

// 3. a change on device 2 reaches device 1
await mark(D2, "alice-2"); await D2.evaluate(async () => (await import("/js/sync.js")).pushNow());
const r = await D1.evaluate(async () => (await import("/js/sync.js")).pullAtStart({ reload: false }));
check(r === "applied" && await getMark(D1) === "alice-2", "a newer copy from another device is taken: " + r);

// 4. both changed: the newer one wins and the other is kept in the repo
await mark(D1, "alice-local-edit");
await new Promise((r) => setTimeout(r, 30));
await mark(D2, "alice-3"); await D2.evaluate(async () => (await import("/js/sync.js")).pushNow());
const r2 = await D1.evaluate(async () => (await import("/js/sync.js")).pullAtStart({ reload: false }));
check(r2 === "applied" && await getMark(D1) === "alice-3", "conflict: newer copy applied");
check([...repos.alice.keys()].some((k) => /^progress\/conflict-\d+\.json$/.test(k)), "conflict: the overwritten copy is saved in the repo");

// 5. library files go to the signed-in person's own repo only
await D1.goto(base + "/#/library?tab=add"); await D1.waitForSelector("#adrop");
await D1.setInputFiles("#afile", fx("article.md")); await D1.waitForSelector("#ac1 [data-go]");
await D1.check("#ac1 input[type=radio][value=article]"); await D1.click("#ac1 [data-go]"); await D1.waitForSelector("#ac1 .callout.ok");
check([...repos.alice.keys()].some((k) => /\/article\.json$/.test(k)) && ![...repos.bob.keys()].length, "alice's article is in alice's repo, bob's repo is untouched");

// 6. sign out wipes this browser, bob signs in on the same device and sees nothing of alice
await D1.goto(base + "/#/settings?focus=gh"); await D1.waitForSelector("#signout");
await Promise.all([D1.waitForNavigation({ waitUntil: "load" }).catch(() => {}), D1.click("#signout")]);
await D1.waitForSelector("#acctLine");
check(/Guest/.test(await D1.textContent("#acctLine")), "signed out: back to guest");
const left = await D1.evaluate(() => Object.keys(localStorage).filter((k) => /alice|\.u\./.test(k)));
check(left.length === 0 || left.every((k) => k === "groommeup.accounts"), "alice's token and progress are gone from the browser: " + left);
check((await D1.evaluate(() => localStorage.getItem("groommeup.accounts") || "")).indexOf("alice") < 0, "alice is forgotten");
await signIn(D1, "tokB", "bob");
check((await D1.textContent("#acctLine")).includes("bob") && await getMark(D1) === "", "bob signs in and starts with his own empty progress");
await D1.goto(base + "/#/library?tab=articles"); await D1.waitForTimeout(800);
check((await D1.locator(".art-item").count()) === 0 || !/Git Notes/.test(await D1.textContent("#main")), "bob does not see alice's library");
await mark(D1, "bob-1"); await D1.evaluate(async () => (await import("/js/sync.js")).pushNow());
check(pushed("bob")?.state.marker === "bob-1" && pushed("alice")?.state.marker === "alice-3", "each person's progress is in their own repo");

// 7. a wrong token or someone else's repo is refused
const D3 = await device();
await D3.goto(base + "/#/settings?focus=gh"); await D3.waitForSelector("#ghsave");
await D3.fill("#ghowner", "alice"); await D3.fill("#ghrepo", "GroomMeUp-data"); await D3.fill("#ghtoken", "tokB");
await D3.click("#ghsave"); await D3.waitForFunction(() => document.querySelector("#ghmsg").textContent.length > 5, null, { timeout: 8000 }); check(/not found, or the token has no access/.test(await D3.textContent("#ghmsg")), "the refusal is explained");
check(/Guest/.test(await D3.textContent("#acctLine")), "bob's token cannot open alice's repository, and does not sign in");

check(errors.length === 0, "no uncaught errors" + (errors.length ? ": " + errors.join(" | ").slice(0, 300) : ""));
await browser.close(); server.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
