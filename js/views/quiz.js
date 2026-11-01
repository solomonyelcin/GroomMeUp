import { store, allQuestions, categoryStats, noteMcq } from "../store.js";
import { MCQ, CATEGORIES } from "../data/index.js";
import { prepPlain, makeMcqFor } from "../import/build.js";
import { esc, rich, shuffle, fmtTime, tape, pct, $, $$ } from "../ui.js";

// Every question we have can become a quiz item: hand-written MCQs, real MCQs imported from files,
// and multiple choice generated from any question that has a model answer.
function candidates() {
  const qs = allQuestions();
  const prepared = prepPlain(qs);
  const list = [];
  for (const m of MCQ) list.push({ id: m.id, c: m.c, kind: "written", mcq: m });
  for (const q of qs) if (q.o) list.push({ id: "m:" + q.id, c: q.c, kind: "file", q });
  for (const x of prepared) if (!x.o.ai) list.push({ id: "m:" + x.o.id, c: x.o.c, kind: "made", q: x.o });
  return { list, prepared };
}

// Weakest topics (from the study plan's readiness numbers) come up more, new and missed questions come up more,
// anything asked in the last day comes up less.
function pickSmart(list, n, picked, onlyMissed = false) {
  const stats = categoryStats(), seen = store.get().mcqSeen || {}, now = Date.now();
  const pool = list.filter((x) => picked.has(x.c) && (!onlyMissed || (seen[x.id] && !seen[x.id].ok))).map((x) => {
    const readiness = stats[x.c]?.readiness ?? 0;
    let w = 1 + (100 - readiness) / 50;                  // 1 .. 3
    const s = seen[x.id];
    if (!s) w *= 1.6; else if (!s.ok) w *= 2.4; else if (now - s.t < 864e5) w *= 0.25; else if (now - s.t < 3 * 864e5) w *= 0.6;
    return { x, k: -Math.log(Math.random()) / w };       // weighted sampling without replacement
  }).sort((a, b) => a.k - b.k);
  return pool.slice(0, n).map((p) => p.x);
}

export function view(root, ctx) {
  let timerId = null;
  const mineOnly = ctx?.params?.get("mine") === "1";
  const { list, prepared } = candidates();
  const counts = {};
  list.forEach((m) => (counts[m.c] = (counts[m.c] || 0) + 1));
  const topicKeys = Object.keys(CATEGORIES).filter((k) => counts[k]);
  const picked = new Set(topicKeys.filter((k) => (mineOnly ? CATEGORIES[k].mine : true)));

  const setup = () => {
    const chip = (k) => `<button class="chip" data-c="${esc(k)}" aria-pressed="${picked.has(k)}">${esc(CATEGORIES[k].name)} (${counts[k]})</button>`;
    const seenAll = store.get().mcqSeen || {}, missedCount = list.filter((x) => seenAll[x.id] && !seenAll[x.id].ok).length;
    const builtIn = topicKeys.filter((k) => !CATEGORIES[k].mine), mine = topicKeys.filter((k) => CATEGORIES[k].mine);
    const weakest = Object.values(categoryStats()).filter((c) => !c.mine && counts[c.key]).sort((a, b) => a.readiness - b.readiness).slice(0, 3).map((c) => c.name);
    root.innerHTML = `
      <header class="page-head"><h1>Quick quiz</h1><p>Just press Start. Questions are picked for you from <strong>all</strong> topics, with your weakest areas${weakest.length ? ` (${esc(weakest.join(", "))})` : ""} and questions you missed coming up more often.</p></header>
      <div class="card">
        <div class="grid g3">
          <div><label for="n">How many questions</label><select id="n"><option>10</option><option>20</option><option>30</option><option>50</option></select></div>
          <div><label for="t">Time limit</label><select id="t"><option value="0">No limit</option><option value="60">1 minute per question</option><option value="30">30 seconds per question</option></select></div>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="start">Start quiz</button><span class="small muted" id="pool"></span></div>
        <label style="font-weight:400;display:block;margin-top:10px"><input type="checkbox" id="missed" ${missedCount ? "" : "disabled"}> Only questions I got wrong before <span class="small muted">(${missedCount} waiting)</span></label>
        <details style="margin-top:14px" ${mineOnly ? "open" : ""}><summary class="small" style="cursor:pointer;font-weight:600">Choose topics myself (optional)</summary>
          <div class="row" style="margin:10px 0"><button class="btn sm" id="all">Select all</button><button class="btn sm" id="none">Clear</button></div>
          <div id="cc" role="group" aria-label="Quiz topics">
            <div class="chips">${builtIn.map(chip).join("")}</div>
            ${mine.length ? `<h4 style="margin:14px 0 6px">Your material</h4><div class="chips">${mine.map(chip).join("")}</div>` : ""}
          </div></details>
      </div>
      ${history()}`;
    const upd = () => { const only = $("#missed")?.checked; const n = list.filter((m) => picked.has(m.c) && (!only || (seenAll[m.id] && !seenAll[m.id].ok))).length; $("#pool").textContent = `${n} questions available${picked.size < topicKeys.length ? ` in ${picked.size} topic${picked.size === 1 ? "" : "s"}` : ""}`; $("#start").disabled = !n; };
    upd(); $("#missed").onchange = upd;
    $("#cc").onclick = (e) => { const b = e.target.closest("[data-c]"); if (!b) return; const c = b.dataset.c; picked.has(c) ? picked.delete(c) : picked.add(c); b.setAttribute("aria-pressed", picked.has(c)); upd(); };
    $("#all").onclick = () => { topicKeys.forEach((k) => picked.add(k)); setup(); };
    $("#none").onclick = () => { picked.clear(); setup(); };
    $("#start").onclick = () => {
      const chosen = pickSmart(list, +$("#n").value * 2, picked, $("#missed").checked);          // a few spares in case some cannot be built
      const pool = [];
      for (const c of chosen) { const m = c.mcq || makeMcqFor(c.q, prepared); if (m) pool.push({ ...m, id: c.id }); if (pool.length >= +$("#n").value) break; }
      if (!pool.length) return;
      run(pool, +$("#t").value);
    };
  };

  const history = () => {
    const qs = store.get().quizzes.slice(-5).reverse();
    if (!qs.length) return "";
    return `<div class="card" style="margin-top:16px"><h3>Recent quizzes</h3>${qs.map((q) => `<div class="row between small" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span>${new Date(q.t).toLocaleString()}</span><strong>${q.correct}/${q.total} (${pct((q.correct / q.total) * 100)})</strong></div>`).join("")}</div>`;
  };

  function run(pool, perQ) {
    // shuffle options but remember which is correct
    const items = pool.map((m) => { const idx = shuffle(m.o.map((_, k) => k)); return { m, order: idx, correct: idx.indexOf(m.a) }; });
    let i = 0, correct = 0; const cats = {}; const wrong = [];
    const step = () => {
      clearInterval(timerId);
      if (i >= items.length) return done();
      const { m, order, correct: ci } = items[i];
      root.innerHTML = `
        <div class="card" style="max-width:760px">
          <div class="row between small muted"><span>Question ${i + 1} of ${items.length}</span><button class="btn sm" id="quit">End quiz</button>${perQ ? `<span class="timer" id="tm">${fmtTime(perQ)}</span>` : ""}</div>
          <div style="margin:10px 0 16px">${tape((i / items.length) * 100, { slim: true, label: "Quiz progress" })}</div>
          <h2>${rich(m.q)}</h2>
          <div role="group" aria-label="Answer options">${order.map((o, k) => `<button class="opt" data-k="${k}">${esc(m.o[o])}</button>`).join("")}</div>
          <div id="fb"></div>
        </div>`;
      $("#quit").onclick = () => {
        const n = Object.values(cats).reduce((a, [, t]) => a + t, 0);
        clearInterval(timerId);
        if (!n) return setup();
        if (confirm(`End the quiz here? Your ${n} answer${n === 1 ? "" : "s"} so far will be saved.`)) { items.length = n; done(); }
      };
      let left = perQ;
      if (perQ) timerId = setInterval(() => { left--; const t = $("#tm"); if (t) { t.textContent = fmtTime(Math.max(left, 0)); t.classList.toggle("low", left <= 10); } if (left <= 0) { clearInterval(timerId); answer(-1); } }, 1000);
      const answer = (k) => {
        clearInterval(timerId);
        const ok = k === ci;
        noteMcq(m.id, ok); (cats[m.c] ||= [0, 0]); cats[m.c][1]++; if (ok) { correct++; cats[m.c][0]++; } else wrong.push(m);
        $$(".opt").forEach((b) => { b.disabled = true; const bk = +b.dataset.k; if (bk === ci) b.classList.add("right"); else if (bk === k) b.classList.add("wrong"); });
        $("#fb").innerHTML = `<p class="callout" style="margin-top:12px"><strong>${k === -1 ? "Time is up." : ok ? "Correct." : "Not quite."}</strong> ${rich(m.e)}</p><button class="btn primary" id="nx">${i + 1 >= items.length ? "See results" : "Next"}</button>`;
        $("#nx").focus(); $("#nx").onclick = () => { i++; step(); };
      };
      $$(".opt").forEach((b) => (b.onclick = () => answer(+b.dataset.k)));
    };
    const done = () => {
      store.update((s) => s.quizzes.push({ t: Date.now(), total: items.length, correct, cats }));
      const p = (correct / items.length) * 100;
      root.innerHTML = `<div class="card" style="max-width:760px"><h1>${correct} / ${items.length}</h1><p class="muted">${p >= 80 ? "Strong. Keep this edge by mixing in coding and mock rounds." : p >= 60 ? "Solid base with gaps. Review the topics below." : "Good to know now. Drill the weak topics below before your next round."}</p>
        ${tape(p, { label: "Score" })}
        <h3 style="margin-top:20px">By topic</h3>${Object.entries(cats).map(([c, [ok, t]]) => `<div class="row between small" style="padding:4px 0"><span>${esc(CATEGORIES[c]?.name || c)}</span><strong>${ok}/${t}</strong></div>`).join("")}
        ${wrong.length ? `<h3 style="margin-top:20px">Review what you missed</h3>${wrong.map((m) => `<div class="callout" style="margin-bottom:8px"><strong>${rich(m.q)}</strong><br>Answer: ${esc(m.o[m.a])}. ${rich(m.e)}</div>`).join("")}` : ""}
        <div class="row" style="margin-top:16px">${wrong.length ? `<button class="btn primary" id="retry">Retry the ${wrong.length} I missed</button>` : ""}<button class="btn ${wrong.length ? "" : "primary"}" id="again">New quiz</button><a class="btn" href="#/practice?mode=weak">Practise weak questions</a></div></div>`;
      $("#again").onclick = setup;
      if ($("#retry")) $("#retry").onclick = () => run(wrong.slice(), perQ);
    };
    step();
  }

  setup();
  return () => clearInterval(timerId);
}
