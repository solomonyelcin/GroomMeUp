import { allQuestions } from "../store.js";
import { CATEGORIES } from "../data/index.js";
import { esc, $, $$ } from "../ui.js";

const STOP = new Set(("a an and are as at be been but by can could do does for from has have how if in into is it its may more most of on or our out over per should so such than that the their then there these they this those to up us use used using via was we were what when where which while who will with within without you your about across also any apply applying around based both build building candidate company day each etc experience experienced years year work working team teams strong skills skill knowledge ability able required requirements requirement preferred plus responsibilities responsibility role job looking join help ensure including include includes good great new well must need needs like one two three other various related relevant excellent understanding proven demonstrated familiarity hands-on hands environment environments solutions solution software engineer engineers developer developers development senior lead principal position opportunity").split(" "));
const tok = (t) => (String(t).toLowerCase().match(/[a-z][a-z0-9+#.\-]*/g) || []).map((w) => w.replace(/^[.\-]+|[.\-]+$/g, "")).filter((w) => w.length >= 2 && !STOP.has(w));

export function match(jd, n = 30) {
  const qs = allQuestions().filter((q) => q.c !== "resume" && q.c !== "hr");
  const docs = qs.map((q) => ({ q, qt: new Set(tok(q.q + " " + (CATEGORIES[q.c]?.name || ""))), at: new Set(tok(q.a + " " + (q.o || []).join(" ") + " " + (q.kp || []).map((k) => k[0]).join(" "))) }));
  const df = new Map(); for (const d of docs) for (const w of new Set([...d.qt, ...d.at])) df.set(w, (df.get(w) || 0) + 1);
  const tf = new Map(); for (const w of tok(jd)) tf.set(w, (tf.get(w) || 0) + 1);
  const N = docs.length || 1, weight = new Map();
  for (const [w, c] of tf) { const d = df.get(w) || 0; if (d && d <= N * 0.35) weight.set(w, (1 + Math.log(c)) * Math.log(1 + N / d)); }
  const scored = docs.map((d) => { let s = 0; const hit = []; for (const [w, wt] of weight) { if (d.qt.has(w)) { s += wt * 2; hit.push(w); } else if (d.at.has(w)) { s += wt; hit.push(w); } } return { q: d.q, s, hit }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const skills = [...weight].sort((a, b) => b[1] - a[1]).slice(0, 14).map((x) => x[0]);
  return { top: scored.slice(0, n), skills, total: scored.length };
}

export function view(root) {
  root.innerHTML = `
    <header class="page-head"><h1>Match a job</h1><p>Paste the job description you are preparing for. GroomMeUp finds the questions in your library that match its skills, so you practise what that interviewer is likely to ask. It runs on your device: nothing is sent anywhere.</p></header>
    <div class="card"><label for="jd">Job description</label><textarea id="jd" style="min-height:180px" placeholder="Paste the job ad here: responsibilities, required skills, tech stack…"></textarea>
      <div class="row" style="margin-top:12px"><label for="jn" style="margin:0">Questions</label><select id="jn"><option>20</option><option selected>30</option><option>50</option></select><button class="btn primary" id="go">Find matching questions</button></div></div>
    <div id="out" style="margin-top:16px"></div>`;
  $("#go").onclick = () => {
    const jd = $("#jd").value.trim();
    if (jd.split(/\s+/).length < 12) { $("#out").innerHTML = `<div class="callout warn">Paste a longer job description (a few sentences at least).</div>`; return; }
    const r = match(jd, +$("#jn").value);
    if (!r.top.length) { $("#out").innerHTML = `<div class="callout warn">No matching questions found. Try a description with more technical terms, or add more questions in <a href="#/import">Add my questions</a>.</div>`; return; }
    const ids = r.top.map((x) => x.q.id).join(",");
    $("#out").innerHTML = `<div class="card"><h2 style="margin-top:0">${r.top.length} questions match (${r.total} relevant in total)</h2>
      <p class="small muted" style="margin-top:0">Skills I found in the ad that your library covers:</p>
      <div class="chips" style="margin-bottom:12px">${r.skills.map((w) => `<span class="tag">${esc(w)}</span>`).join("")}</div>
      <div class="row"><a class="btn primary" href="#/practice?ids=${ids}">Practise these</a><a class="btn" href="#/bank?ids=${ids}">Read them in Browse</a></div></div>
      <div class="card" style="margin-top:12px">${r.top.slice(0, 12).map((x) => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)"><strong>${esc(x.q.q)}</strong><br><span class="small muted">${esc(CATEGORIES[x.q.c]?.name || "My questions")} · matches ${esc(x.hit.slice(0, 4).join(", "))}</span></div>`).join("")}${r.top.length > 12 ? `<p class="small muted" style="margin:8px 0 0">…and ${r.top.length - 12} more in the lists above.</p>` : ""}</div>`;
  };
}
