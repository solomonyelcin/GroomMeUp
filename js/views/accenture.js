// Accenture online assessment prep: what candidates report, where to practise each section, a short plan and a test-day checklist.
import { esc } from "../ui.js";
import { MCQ, JS_CHALLENGES, SQL_CHALLENGES, CS_CHALLENGES } from "../data/index.js";
import { allQuestions, store } from "../store.js";

const FACTS = [
  ["From Accenture's careers page", "The assessment is done online in one sitting inside the time window given, typically 72 hours. The total testing time is shown before you start, and most take about 30 to 90 minutes depending on level. Recruiters and interviewers read the results together with your experience, and human discussion stays central."],
  ["Reported by candidates (Glassdoor, PracHub, LeetCode, 2025 to 2026)", "Cognitive and technical MCQs (one report says 90 questions in 90 minutes) covering pseudocode, DSA, DBMS, networks, cloud and MS Office, then 2 to 3 coding problems that are mostly easy to medium. Coding topics are arrays, strings, hashing and basic DSA, with some SQL or web questions. Experienced .NET candidates report an ASP.NET skill test, then a video interview and an HR round."],
  ["Difficulty signal", "Glassdoor candidates rate Accenture's .NET Developer interviews 2.6 and Full Stack Developer interviews 2.7 out of 5 for difficulty. Several people say the aptitude section is time-pressured and the coding is easy."],
  ["Not known", "Your exact sections, the number of questions, whether C# is offered in the coding language list, and whether the paper is fresher style or lateral style. Open the sample environment first and read the instruction screen."],
];
const AREAS = [
  ["Pseudocode and output tracing", "Trace loops, ++ and --, integer division, recursion and C# traps (closures, string immutability, new vs override, finally).", "ac", "#/quiz?cat=accenture"],
  ["Aptitude and logical reasoning", "Work, ratio, percentage, speed and distance, probability, number series. Skim the options first because the text is long.", "ac", "#/quiz?cat=accenture"],
  ["SQL and DBMS", "Joins, GROUP BY and HAVING, NULL behaviour, ranking, keys, normal forms and ACID. Five SQL problems run in your browser.", "sql", "#/code?lang=sql&id=ac-sq01"],
  ["Coding: arrays, strings, hashing", "Ten JavaScript problems run against hidden tests here. Five C# problems come with a rubric because C# cannot run in a browser.", "js", "#/code?lang=js&id=ac-js01"],
  ["C# input and output", "Read n and a line of numbers from standard input and print only the answer. Practise it once so the test platform is not a surprise.", "cs", "#/code?lang=cs&id=ac-cs01"],
  ["Networks, OS and cloud basics", "HTTP codes and methods, TCP vs UDP, ports, deadlock conditions, IaaS vs PaaS vs SaaS.", "ac", "#/quiz?cat=accenture"],
  [".NET and interview talk", "Async, threads, SOLID, DI lifetimes, REST vs WCF, indexes and isolation levels, plus your project walk-through and why Accenture.", "q", "#/library?tab=questions&cat=accenture"],
];
const PLAN = [
  ["Day 1", "Take one 15-question quiz on Accenture topics in exam mode with the timer, and read every explanation. Solve the 4 easiest JavaScript problems and the first 3 SQL ones without hints."],
  ["Day 2", "Do the C# stdin problem and two more C# problems, then the remaining JavaScript problems against a 20 minute clock. Answer the Accenture questions aloud for the project walk-through and SOLID."],
  ["Test day", "Warm up with 10 quiz questions, then close everything. Check webcam, microphone, power and internet, open the sample environment, confirm the language list, and start only when you have an uninterrupted hour or more."],
];
const TIPS = [
  "Two passes: answer what you know quickly, mark the rest, and return. Assume you cannot go back to a finished section.",
  "Set a hard cutoff per MCQ (about 60 to 90 seconds), because aptitude questions are long and easy to over-think.",
  "For coding, submit a simple correct solution first, since passing some test cases earns partial credit, then optimise.",
  "Handle empty input, duplicates, negative numbers and large values, and print exactly what the output format asks for.",
  "Trace pseudocode with a small table of variable values instead of reading it in your head.",
  "Stay in full screen, close notifications and other tabs, and keep your face in the camera. Even a pop-up can be flagged.",
  "Do it on your own. The email warns that malpractice means the application is declined and you are barred from later roles.",
];
const CHEAT = [
  ["Aptitude formulas", "Work: rates add (1/a + 1/b). Percent change: multiply factors (up 20% then down 20% is 0.96). Speed = distance / time; a train crossing a bridge covers its length plus the bridge. Ratio a:b with total T gives a/(a+b) x T. Probability of at least one = 1 minus none."],
  ["C# output traps", "Integer division truncates (7 / 2 is 3, -5 / 2 is -2). A for-loop variable captured by lambdas is shared. Strings are immutable. new hides, override replaces. finally runs before the value is returned. object == object compares references."],
  ["SQL patterns", "Second highest: MAX below MAX, DENSE_RANK() = 2, or DISTINCT ... OFFSET 1. Duplicates: GROUP BY col HAVING COUNT(*) > 1. No match: LEFT JOIN ... WHERE right.id IS NULL. NOT IN breaks with NULLs, use NOT EXISTS. COUNT(col) skips NULLs."],
  ["Complexity", "Hash lookup O(1) average, binary search O(log n), sorting O(n log n), nested loops O(n squared). A Dictionary or HashSet usually turns a brute-force pair search into a single pass."],
];

export function view(root) {
  const nq = allQuestions().filter((q) => q.c === "accenture").length, nm = MCQ.filter((m) => m.c === "accenture").length;
  const ac = (l) => l.filter((c) => String(c.topic || "").startsWith("Accenture"));
  const done = (l) => ac(l).filter((c) => store.get().code[c.id]?.solved).length;
  const nc = ac(JS_CHALLENGES).length + ac(SQL_CHALLENGES).length + ac(CS_CHALLENGES).length;
  const solved = done(JS_CHALLENGES) + done(SQL_CHALLENGES) + done(CS_CHALLENGES);
  const stat = { ac: `${nm} quiz questions`, sql: `${done(SQL_CHALLENGES)}/${ac(SQL_CHALLENGES).length} solved`, js: `${done(JS_CHALLENGES)}/${ac(JS_CHALLENGES).length} solved`, cs: `${done(CS_CHALLENGES)}/${ac(CS_CHALLENGES).length} done`, q: `${nq} questions` };
  root.innerHTML = `<div class="card"><h2 style="margin:0 0 6px">Accenture online assessment prep</h2>
    <p class="muted" style="margin:0 0 12px">Practice for the proctored cognitive, technical and coding assessment, aimed at a senior .NET full-stack profile. Each fact below says how sure it is, because the paper changes with role and track.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn primary" href="#/quiz?cat=accenture">Quiz: ${nm} questions</a><a class="btn" href="#/code?lang=js&id=ac-js01">Coding: ${solved}/${nc} solved</a><a class="btn" href="#/mock?round=accenture">Start Accenture mock</a><a class="btn" href="#/library?tab=questions&cat=accenture">${nq} interview questions</a></div></div>
    <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">What to practise</h3>${AREAS.map(([h, t, k, href]) => `<p style="margin:0 0 12px"><a href="${href}"><strong>${esc(h)}</strong></a> <span class="small muted">· ${esc(stat[k])}</span><br>${esc(t)}</p>`).join("")}</div>
    <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">What is known about the assessment</h3>${FACTS.map(([h, t]) => `<p style="margin:0 0 10px"><strong>${esc(h)}.</strong> ${esc(t)}</p>`).join("")}</div>
    <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Plan before the link expires</h3>${PLAN.map(([d, t]) => `<p style="margin:0 0 8px"><strong>${esc(d)}:</strong> ${esc(t)}</p>`).join("")}<p class="small muted" style="margin:8px 0 0">Check the exact expiry time in your Accenture email. Keep the test link private: it is personal to you and opening it can start your attempt.</p></div>
    <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Tips for the test</h3><ul style="margin:0;padding-left:20px">${TIPS.map((t) => `<li style="margin-bottom:6px">${esc(t)}</li>`).join("")}</ul></div>
    <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Quick revision</h3>${CHEAT.map(([h, t]) => `<details style="margin-bottom:8px"><summary style="cursor:pointer"><strong>${esc(h)}</strong></summary><p style="margin:8px 0 0">${esc(t)}</p></details>`).join("")}</div>
    <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Sources</h3><ul class="small" style="margin:0;padding-left:20px">
      <li><a href="https://www.accenture.com/dk-en/careers/explore-careers/area-of-interest/journey-to-accenture" target="_blank" rel="noopener">Accenture careers: our process</a></li>
      <li><a href="https://www.glassdoor.co.in/Interview/Accenture-Interview-E4138-RVW100547520.htm" target="_blank" rel="noopener">Glassdoor: Accenture .NET Developer interviews</a></li>
      <li><a href="https://www.glassdoor.com.au/Interview/Accenture-Interview-E4138-RVW51384764.htm" target="_blank" rel="noopener">Glassdoor: Senior .NET Developer reports</a></li>
      <li><a href="https://prachub.com/interview-experiences/accenture-in-india-software-engineer-interview-experience-90-mcqs-and-virtual-panel-b0f881f115" target="_blank" rel="noopener">PracHub: 90 MCQs and coding</a></li>
      <li><a href="https://leetcode.com/discuss/post/8381531/accenture-interview-experience-2026-fres-wj1a/" target="_blank" rel="noopener">LeetCode discuss: Accenture 2026 experience</a></li></ul></div>`;
}
