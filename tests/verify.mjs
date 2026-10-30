// Data + logic verification. Run with: npm test
import { createRequire } from "node:module";
import { QUESTIONS, MCQ, JS_CHALLENGES, SQL_CHALLENGES, SQL_SCHEMA, CS_CHALLENGES, CATEGORIES } from "../js/data/index.js";
import { runJSTests, runSQLTest } from "../js/runner-core.js";
import { offlineEvaluate, parseJSON } from "../js/ai.js";

const require = createRequire(import.meta.url);
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL:", msg); } };

console.log("Questions");
const ids = new Set();
for (const q of QUESTIONS) {
  ok(!ids.has(q.id), `duplicate id ${q.id}`); ids.add(q.id);
  ok(CATEGORIES[q.c], `${q.id} bad category ${q.c}`);
  ok(q.q && q.a && q.a.length > 80, `${q.id} missing text`);
  ok(Array.isArray(q.kp) && q.kp.length >= 3, `${q.id} needs >=3 key points`);
  for (const k of q.kp) ok(Array.isArray(k) && k.length >= 2 && k.every((x) => typeof x === "string"), `${q.id} malformed kp ${JSON.stringify(k)}`);
  // the model answer itself should earn a high offline score
  const e = offlineEvaluate(q, q.a);
  ok(e.score >= 7, `${q.id} model answer only scores ${e.score} offline (missing: ${e.gaps.join("; ")})`);
  // an empty / junk answer should score low
  ok(offlineEvaluate(q, "I do not know").score <= 2, `${q.id} junk answer scored too high`);
}
console.log(`  ${QUESTIONS.length} questions, categories: ` + Object.keys(CATEGORIES).map((c) => `${c}=${QUESTIONS.filter((q) => q.c === c).length}`).join(" "));

console.log("MCQ");
const mids = new Set();
for (const m of MCQ) {
  ok(!mids.has(m.id), `dup mcq ${m.id}`); mids.add(m.id);
  ok(m.o.length === 4 && m.a >= 0 && m.a < 4, `${m.id} bad options`);
  ok(CATEGORIES[m.c], `${m.id} bad category`);
}
const dist = [0, 0, 0, 0]; MCQ.forEach((m) => dist[m.a]++);
console.log(`  ${MCQ.length} MCQ, answer position spread: ${dist.join("/")}`);

console.log("JS challenges: reference solutions pass all tests, starters fail");
for (const ch of JS_CHALLENGES) {
  const r = await runJSTests(ch.solution, ch);
  ok(!r.compileError, `${ch.id} compile: ${r.compileError}`);
  const bad = r.results.filter((x) => !x.ok);
  ok(bad.length === 0, `${ch.id} solution fails: ${JSON.stringify(bad.slice(0, 1))}`);
  const s = await runJSTests(ch.starter, ch);
  ok(s.compileError || s.results.some((x) => !x.ok), `${ch.id} starter code already passes (tests too weak)`);
  console.log(`  ${ch.id} ${ch.title}: ${r.results.filter((x) => x.ok).length}/${r.results.length}`);
}

console.log("SQL challenges: reference queries run, a wrong query is rejected");
let SQL = null;
try { SQL = await require("sql.js")(); } catch { console.log("  (sql.js not installed: run `npm install` to verify SQL challenges)"); }
for (const ch of SQL ? SQL_CHALLENGES : []) {
  const r = runSQLTest(SQL, SQL_SCHEMA, ch, ch.solution);
  ok(r.ok, `${ch.id} reference fails against itself: ${r.error || ""}`);
  ok(r.expected && r.expected.values.length > 0, `${ch.id} returns no rows (weak test)`);
  const w = runSQLTest(SQL, SQL_SCHEMA, ch, "SELECT 1 AS x");
  ok(!w.ok, `${ch.id} accepts a wrong query`);
  console.log(`  ${ch.id} ${ch.title}: ${r.expected.values.length} rows`);
}

console.log("C# challenges");
for (const ch of CS_CHALLENGES) {
  ok(ch.solution.length > 100 && ch.starter && ch.rubric.length >= 4, `${ch.id} incomplete`);
}
console.log(`  ${CS_CHALLENGES.length} challenges`);

// parseJSON survives the kinds of damage free AI models produce
{
  const item = (i) => `{"q":"Question ${i}?","a":"Answer ${i} text here."}`;
  const cases = {
    "clean": `{"questions":[${item(1)},${item(2)}]}`,
    "code fences": "```json\n{\"questions\":[" + item(1) + "]}\n```",
    "trailing comma": `{"questions":[${item(1)},${item(2)},]}`,
    "cut off mid-string": `{"questions":[${item(1)},${item(2)},{"q":"Third que`,
    "cut off after item": `{"questions":[${item(1)},${item(2)},`,
    "unescaped quote in later item": `{"questions":[${item(1)},{"q":"What does "async" mean?","a":"Not blocking."},${item(3)}]}`,
    "prose around it": `Sure! Here you go: {"questions":[${item(1)}]} Hope that helps.`,
  };
  const need = { "clean": 2, "code fences": 1, "trailing comma": 2, "cut off mid-string": 2, "cut off after item": 2, "unescaped quote in later item": 1, "prose around it": 1 };
  for (const [name, txt] of Object.entries(cases)) {
    let n = -1; try { const d = parseJSON(txt); n = (d.questions || []).filter((x) => x.q && x.a).length; } catch { /* counted as failure */ }
    ok(n >= need[name], `parseJSON salvages ${name}: ${n} usable`);
  }
  let threw = false; try { parseJSON("I cannot help with that."); } catch { threw = true; }
  ok(threw, "parseJSON rejects text with no data");
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
