// Live voice interview with a faked speech engine: the interviewer "speaks", we "say" answers.
// Run: PW_PATH=<playwright> node tests/live.mjs
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

const FAKE = () => {
  window.__spoken = [];
  const synth = { speaking: false, pending: false, getVoices: () => [], cancel() { this.speaking = false; },
    speak(u) { window.__spoken.push(u.text); this.speaking = true; setTimeout(() => { this.speaking = false; u.onend && u.onend(); }, 30); } };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.SpeechRecognition = function () { window.__rec = this; this.start = () => { window.__listening = true; }; this.stop = () => { window.__listening = false; setTimeout(() => this.onend && this.onend(), 0); }; };
  window.__say = (t) => window.__rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] });
};

async function ctx(withVoice, w = 1280, h = 900) {
  const c = await browser.newContext({ serviceWorkers: "block", viewport: { width: w, height: h } });
  await c.addInitScript(() => { try { localStorage.setItem("groommeup.tour", "done"); localStorage.setItem("groommeup.setup", "1"); localStorage.setItem("groommeup.backup", JSON.stringify({ snooze: Date.now() + 9e11 })); } catch {} });
  if (withVoice) await c.addInitScript(FAKE);
  if (!withVoice) await c.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p;
}

// answer every question until the debrief appears; returns how many were asked
async function unusedRunThrough(page, texts, { skipAt = -1 } = {}) {
  let asked = 0;
  for (;;) {
    const r = await Promise.race([page.waitForSelector("#ldone:not([disabled])", { timeout: 20000 }).then(() => "q"), page.waitForSelector("text=Interview debrief", { timeout: 20000 }).then(() => "d")]);
    if (r === "d") return asked;
    await page.waitForFunction(() => window.__listening !== false || !window.SpeechRecognition);
    const t = texts[asked % texts.length]; const voice = await page.evaluate(() => !!window.__rec);
    if (voice && t) { await page.evaluate((x) => window.__say(x), t); } else if (t) await page.fill("#ans", t);
    if (asked === skipAt) await page.click("#lskip"); else await page.click("#ldone");
    asked++;
    await page.waitForFunction((n) => { const c = document.querySelector(".live-card"); return !c || !document.querySelector("#ans") || !/Question \d+ of/.test(c.textContent) || document.querySelector("#tm") === null || true; }, asked);
    await page.waitForTimeout(150);
  }
}
const SAY = [
  "I am a senior full stack engineer with nine years of experience. Currently I work at Flex building the EO Workbench in C# and Angular with SQL Server on Azure. I led the project that delivered one thousand concurrent users and I am looking for a bigger scope and ownership of architecture in the next role.",
  "um I would explain the concept basically with an example from my project and the trade-offs and failure modes, for example in ASP.NET Core middleware and dependency injection.",
  "I would first explain my approach, handle the edge cases like empty input, then return the result and discuss time complexity and trade-offs, actually using EF Core and SQL indexes.",
];

{
  const page = await ctx(true);
  await page.goto(base + "/#/mock"); await page.waitForSelector("#md");
  check((await page.inputValue("#md")) === "live", "live voice is the default way to practise");
  check(await page.isVisible("#lv") && await page.isVisible("#du") && await page.isVisible("#pg") && !(await page.isVisible("#n")), "live setup shows level, duration and programming (not the written-mode fields)");
  check((await page.$$eval("#lv option", (o) => o.map((x) => x.textContent))).join() === "Easy,Medium,Hard,Pro", "levels are Easy, Medium, Hard, Pro");
  check((await page.$$eval("#du option", (o) => o.map((x) => x.value))).join() === "10,15,20,25,30", "durations run from 10 to 30 minutes");
  check((await page.$$eval("#pg option", (o) => o.map((x) => x.textContent))).join() === "Yes,No", "programming questions are Yes or No");
  const hint = async () => await page.textContent("#lvt");
  await page.selectOption("#r", "backend"); await page.selectOption("#lv", "medium"); await page.selectOption("#du", "10"); await page.selectOption("#pg", "1");
  const h10 = await hint(); await page.selectOption("#du", "30"); const h30 = await hint();
  check(/programming question/.test(h10) && /3 programming questions/.test(h30), "the hint says how many programming questions: " + h30.slice(0, 90));
  await page.selectOption("#pg", "0"); check(!/programming question/.test((await hint()).replace(/No programming/, "")), "No removes programming questions");
  // run a 10 minute medium interview with programming
  await page.selectOption("#du", "10"); await page.selectOption("#pg", "1");
  await page.click("#go"); await page.waitForSelector("#lbegin");
  await page.click("#lbegin"); await page.waitForSelector("#ldone");
  await page.waitForFunction(() => window.__listening === true);
  check(/tell me about yourself/i.test(await page.textContent("#lq")), "the interview opens with a self introduction");
  check(await page.evaluate(() => window.__spoken.some((t) => /Hello, thank you for joining/.test(t))), "the interviewer greets by voice");
  check(await page.evaluate(() => window.__spoken.some((t) => /tell me about yourself/i.test(t))), "the question is spoken aloud");
  check(/Interview time left/.test(await page.textContent(".live-card")), "total interview time is shown");
  await page.evaluate((t) => window.__say(t), SAY[0]); await page.waitForFunction(() => document.querySelector("#ans").value.includes("nine years"));
  check(true, "spoken words land in the answer box");
  let codeSeen = false;
  const asked = await (async () => {
    let n = 0;
    for (;;) {
      if (n > 0) {
        const r = await Promise.race([page.waitForSelector("#ldone", { timeout: 20000 }).then(() => "q"), page.waitForSelector("text=Interview debrief", { timeout: 20000 }).then(() => "d")]);
        if (r === "d") return n;
        await page.waitForFunction(() => window.__listening === true);
        const isCode = await page.evaluate(() => /Programming question/.test(document.querySelector("#lq")?.textContent || ""));
        if (isCode) { codeSeen = true; check(await page.evaluate(() => document.querySelector("#ans").rows >= 12), "programming question gives a big code box"); }
        await page.evaluate((x) => window.__say(x), SAY[n % 3]);
      }
      await page.click(n === 3 ? "#lskip" : "#ldone"); n++;
      await page.waitForTimeout(250);
    }
  })();
  check(asked >= 4, "a 10 minute interview asked " + asked + " questions");
  check(codeSeen, "a programming question was asked when Yes was chosen");
  check(await page.evaluate(() => window.__spoken.some((t) => /That is all from my side/.test(t))), "the interviewer closes by voice");
  const txt = await page.textContent("body");
  check(/Medium · 10 minutes/.test(txt), "the debrief names the level and duration");
  check(/How you came across/.test(txt) && /filler words/.test(txt), "delivery stats (pace, length, fillers) are shown");
  check(/Question by question/.test(txt) && /tell me about yourself/i.test(txt), "every question including the self intro is reviewed");
  check(/What to learn next/.test(txt) || /Practise the weak ones/.test(txt), "weak topics are listed with a way to practise");
  check(await page.isVisible("#dl"), "a download of the transcript and feedback is offered");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl")]);
  const body = fs.readFileSync(await dl.path(), "utf8");
  check(/tell me about yourself/i.test(body) && /nine years/.test(body) && /Score/i.test(body), "the downloaded transcript has questions, answers and scores");
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("groommeup.v1")));
  check(st.mocks.length === 1 && st.mocks[0].mode === "live" && st.mocks[0].level === "medium" && st.mocks[0].minutes === 10 && st.mocks[0].items.every((i) => !String(i.qid).startsWith("live-")), "the mock is saved with level and duration, the fixed questions do not pollute history");
  check(st.attempts.every((a) => !String(a.qid).startsWith("live-")), "no fake question ids in attempts");
  // pro hides the question text; programming No means none
  await page.click("#again"); await page.selectOption("#r", "backend"); await page.selectOption("#lv", "pro"); await page.selectOption("#du", "15"); await page.selectOption("#pg", "0");
  await page.click("#go"); await page.click("#lbegin"); await page.waitForSelector("#ldone");
  check(await page.evaluate(() => document.querySelector("#lq").hidden === true), "Pro level hides the question text (voice only)");
  await page.click("#lrep"); check(await page.evaluate(() => window.__spoken.filter((t) => /tell me about yourself/i.test(t)).length >= 2), "Repeat question speaks it again");
  // leaving mid interview stops the voice
  await page.goto(base + "/#/dashboard"); await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__listening === false), "leaving the page stops listening");
  await page.close();
}

{ // no speech support at all: typing still works end to end, on a phone
  const page = await ctx(false, 390, 800);
  await page.goto(base + "/#/mock"); await page.waitForSelector("#md");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "setup has no horizontal scroll on a phone");
  await page.selectOption("#r", "hr"); await page.selectOption("#du", "10"); await page.selectOption("#pg", "1"); await page.click("#go"); await page.waitForSelector("#lbegin");
  check(/cannot listen|type your answers/i.test(await page.textContent(".live-card")), "without a microphone the page says you will type");
  await page.click("#lbegin"); await page.waitForSelector("#ldone");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "interview screen has no horizontal scroll on a phone");
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || "/tmp", "live-phone.png") });
  for (let k = 0; k < 12; k++) {
    const r = await Promise.race([page.waitForSelector("#ldone", { timeout: 20000 }).then(() => "q"), page.waitForSelector("text=Interview debrief", { timeout: 20000 }).then(() => "d")]);
    if (r === "d") break;
    await page.fill("#ans", "I have nine years of experience with C# and Angular, and I led a project at Flex with strong results and a clear example.");
    await page.click("#ldone"); await page.waitForTimeout(250);
  }
  await page.waitForSelector("text=Interview debrief", { timeout: 20000 });
  check(true, "typed answers complete an HR round");
  await page.close();
}
check(errors.length === 0, "no uncaught errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
