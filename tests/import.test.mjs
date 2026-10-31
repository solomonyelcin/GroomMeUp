// Import pipeline tests (Node). Run with: npm test
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "../js/import/index.js";
import { buildQuestions, makeMcqs, deriveKeyPoints, hash32, optionText } from "../js/import/build.js";
import { offlineEvaluate } from "../js/ai.js";
import { encryptLibrary, decryptLibrary } from "../js/library.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log("  FAIL:", m); } };
const load = (name) => new File([fs.readFileSync(path.join(dir, name))], name);
const qs = (r) => r.items.map((i) => i.q);

console.log("Excel (header on row 2, hidden sheet, junk sheet, header-less sheet)");
let r = await parseFile(load("sample.xlsx"));
ok(r.items.length === 9, `9 questions expected, got ${r.items.length}: ${JSON.stringify(qs(r))}`);
ok(!qs(r).some((q) => /Hidden question/.test(q)), "hidden sheet must be ignored");
ok(r.info.find((i) => i.name === "Dashboard")?.used === false, "junk Dashboard sheet skipped with a reason");
ok(r.info.find((i) => i.name === "Docker Basics")?.noAnswer === 1 && r.info.find((i) => i.name === "Docker Basics")?.dup === 1, "no-answer row and duplicate counted for Docker Basics");
ok(r.info.find((i) => i.name === "No header")?.inferred === true && r.items.filter((i) => i.topic === "No header").length === 3, "header-less sheet read by inference");
const dock = r.items.filter((i) => i.topic === "Docker Basics");
ok(dock.length === 3 && dock[0].status === "Confident" && dock[0].sub === "Images", "sub topic and status read");
ok(dock.find((i) => /1\.5 GB/.test(i.q))?.kind === "scenario", "Scenario sub topic -> scenario kind");
ok(r.items.filter((i) => i.topic === "Git").length === 3, "Q/A short headers recognised");

console.log("Word: Q:/A: markers, headings, tables");
r = await parseFile(load("sample.docx"));
ok(r.items.length === 7, `7 expected, got ${r.items.length}: ${JSON.stringify(qs(r))}`);
ok(r.items.find((i) => /Redis/.test(i.q))?.topic === "Redis", "heading becomes topic");
ok(r.items.find((i) => /consumer group/.test(i.q))?.topic === "Kafka", "second heading switches topic");
ok(r.items.find((i) => /DNS/.test(i.q))?.topic === "Networking", "table rows imported under their heading");
ok(/translates domain names/.test(r.items.find((i) => /DNS/.test(i.q))?.a || ""), "table answer read");
console.log("Word: auto-numbered questions with plain answers");
r = await parseFile(load("sample-numbered.docx"));
ok(r.items.length === 2 && r.items[0].topic === "Concurrency" && /lock ordering/.test(r.items[0].a), `numbered docx: ${JSON.stringify(r.items.map((i) => i.q))}`);

console.log("Text and Markdown");
r = await parseFile(load("sample.txt"));
ok(r.items.length === 4, `txt 4 expected, got ${r.items.length}: ${JSON.stringify(qs(r))}`);
ok(r.items[0].topic === "CONCURRENCY" && /atomic operations/.test(r.items[0].a) && /\n/.test(r.items[0].a), "ALL-CAPS heading, multi-line answer kept");
ok(r.items.find((i) => /mock/.test(i.q))?.topic === "TESTING", "plain '?' questions detected under second heading");
r = await parseFile(load("sample.md"));
ok(r.items.length === 3 && r.items.every((i) => /Unit tests|Security/.test(i.topic)), `md: ${JSON.stringify(r.items.map((i) => [i.topic, i.q]))}`);
ok(r.items.find((i) => /CSRF/.test(i.q))?.topic === "Security", "markdown section switches topic");

console.log("CSV (quoted commas)");
r = await parseFile(load("sample.csv"));
ok(r.items.length === 3 && r.items.some((i) => /with commas/.test(i.q)), `csv: ${r.items.length}`);

console.log("Notes without Q&A pairs yield nothing (so the app can offer AI)");
r = await parseFile(load("notes-only.txt"));
ok(r.items.length === 0 && r.text.length > 50, "notes-only: no items, text preserved for AI");

console.log("Unsupported and invalid files fail clearly");
for (const [name, bytes, re] of [["old.xls", [1, 2, 3], /Save As \.xlsx/], ["old.doc", [1], /Save As \.docx/], ["x.exe", [1], /Unsupported/], ["broken.xlsx", [80, 75, 3, 4, 0, 0], /not a valid/]]) {
  try { await parseFile(new File([new Uint8Array(bytes)], name)); ok(false, name + " should throw"); } catch (e) { ok(re.test(e.message), `${name}: ${e.message}`); }
}

console.log("Building questions");
const all = (await parseFile(load("sample.xlsx"))).items;
const b = buildQuestions(all, { importId: "i1" });
ok(b.questions.length === 9 && Object.keys(b.cats).length === 3, "9 questions in 3 topics (Docker Basics, Git, No header)");
ok(new Set(b.questions.map((q) => q.id)).size === 9, "ids unique");
const b2 = buildQuestions(all, { importId: "i2", existingCats: b.cats });
ok(b.questions.every((q, i) => q.id === b2.questions[i].id), "ids are stable across re-imports (progress survives)");
ok(Object.keys(b2.newCats).length === 0, "existing topics are reused");
ok(b.seeds.length === 1, "Confident rows are seeded");
ok(b.questions.every((q) => q.kp.length >= 1 && q.kp.every((k) => k.length >= 2)), "every question has scoring key points");
ok(hash32("a") !== hash32("b"), "hash differs");
for (const q of b.questions) {
  const w = q.a.split(/\s+/).length;
  if (w >= 15) { ok(offlineEvaluate(q, q.a).score >= 7, `model answer scores high: ${q.q}`); ok(offlineEvaluate(q, "no idea at all about this").score <= 2, `junk scores low: ${q.q}`); }
}
console.log("Quiz questions from imports");
const m = makeMcqs(b.questions, { count: 20, rand: (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })() });
ok(m.length >= 6, `MCQs made: ${m.length}`);
for (const x of m) {
  ok(x.o.length === 4 && new Set(x.o).size === 4, `4 distinct options for "${x.q}"`);
  ok(x.o[x.a] === optionText(b.questions.find((q) => "m:" + q.id === x.id).a), "correct option is the real answer");
  ok(x.e.length > 20, "explanation carries the full answer");
}
const tiny = makeMcqs(b.questions.slice(0, 3), { count: 5 });
ok(tiny.length === 0, "too few questions to make distractors -> no MCQ (no crash)");
ok(deriveKeyPoints("Yes.").length === 1, "very short answers still get a key point");

// Optional: your own workbook, never committed. WORKBOOK_PATH=/path/to/file.xlsx npm test
if (process.env.WORKBOOK_PATH) {
  console.log("Local workbook:", process.env.WORKBOOK_PATH);
  const w = await parseFile(new File([fs.readFileSync(process.env.WORKBOOK_PATH)], "workbook.xlsx"));
  const wb = buildQuestions(w.items, { importId: "w" });
  ok(w.items.length > 0 && new Set(wb.questions.map((q) => q.id)).size === wb.questions.length, `${w.items.length} questions, ids unique`);
  console.log(`  ${w.items.length} questions, ${Object.keys(wb.cats).length} topics, ${wb.seeds.length} confident, ${makeMcqs(wb.questions, { count: 9999 }).length} quiz questions`);
}

// ---- answers kept in cell notes ("Show answer") ----
console.log("Answers in cell notes");
{
  const n = await parseFile(load("notes-answers.xlsx"));
  ok(n.items.length === 2 && n.pending.length === 0, `notes workbook: 2 items, none pending (got ${n.items.length}/${n.pending.length}); Dashboard labels are not questions`);
  ok(n.items[0].topic === "Demo Topic" && n.items[0].sub === "Basics" && /^Encapsulation hides internal state behind members\. It keeps data private/.test(n.items[0].a), "wrapped note text is re-joined and the wrapper lines are dropped");
  ok(n.items[1].kind === "scenario" && /\nint Salary \{ get; private set; \}\n/.test(n.items[1].a), "code lines inside a note keep their line breaks; scenario detected from sub topic");
}
// ---- encrypted library ----
console.log("Encrypted library");
{
  const lib = { name: "T", items: [{ topic: "A", sub: "s", q: "What is DI?", a: "Dependency injection: pass dependencies in.\n\ncode()", kind: "concept" }] };
  const env = await encryptLibrary(lib, "correct horse 123", 1000);
  ok(!JSON.stringify(env).includes("What is DI"), "ciphertext does not contain the plain text");
  const back = await decryptLibrary(env, "correct horse 123");
  ok(back.items[0].q === "What is DI?" && back.items[0].a.includes("\n\ncode()"), "round trip keeps text and line breaks");
  let bad = ""; try { await decryptLibrary(env, "wrong"); } catch (e) { bad = e.message; }
  ok(bad === "Wrong passphrase.", "wrong passphrase is rejected");
  const t = JSON.parse(JSON.stringify(env)); t.data = t.data.slice(0, -4) + (t.data.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
  let tamper = ""; try { await decryptLibrary(t, "correct horse 123"); } catch (e) { tamper = e.message; }
  ok(tamper !== "", "tampered file is rejected");
}
// ---- multiple-choice documents ----
console.log("Multiple choice documents");
{
  const mk = (n) => load(n);
  const t1 = await parseFile(mk("mcq-sample.txt"));
  ok(t1.kind.includes("multiple choice") && t1.items.length === 3, `txt MCQs: 3 expected, got ${t1.items.length} (${t1.kind})`);
  ok(t1.items.every((i) => i.o.length === 4), "every MCQ has 4 options");
  ok(t1.items[0].correct === 1 && t1.items[0].o[1] === "UDP", "Ans: B -> UDP");
  ok(t1.items[1].correct === 1 && /Host names/.test(t1.items[1].o[1]) && /DNS maps/.test(t1.items[1].e), "(B) labels, 'Answer - b' lowercase and explanation");
  ok(t1.items[2].correct === 0 && t1.items[2].o[0] === "Authorization", "'A text' labels without a delimiter, 'Correct Answer: A'");
  ok(t1.items.every((i) => i.topic === "Networking basics"), "heading becomes the topic");
  const t2 = await parseFile(mk("mcq-phone.txt"));
  ok(t2.items.length === 2 && t2.items[0].o.join(",") === "Singleton,Scoped,Transient,Pooled" && t2.items[0].correct === 1, "letter on its own line, text on the next line");
  ok(t2.items[1].o[1] === "sealed" && t2.items[1].correct === 1, "two-space separated labels");
}
// ---- documents that contain only questions ----
console.log("Questions without answers");
{
  const x = await parseFile(load("questions-only.xlsx"));
  ok(x.items.length === 0 && x.pending.length === 4 && x.pending[0].topic === "Angular", `xlsx question-only column: ${x.pending.length} pending`);
  const t = await parseFile(load("questions-only.txt"));
  ok(t.items.length === 0 && t.pending.length === 5, `txt: 5 pending expected, got ${t.pending.length}`);
  ok(t.pending.filter((p) => p.topic === "MICROSERVICES").length === 3 && t.pending.filter((p) => p.topic === "REST").length === 2, "headings become topics, bullets and numbers both work");
  const d = await parseFile(load("questions-only.docx"));
  ok(d.items.length === 0 && d.pending.length === 5, `docx: 5 pending expected, got ${d.pending.length} (items ${d.items.length})`);
}

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
