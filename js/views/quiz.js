import { store } from "../store.js";
import { MCQ, CATEGORIES } from "../data/index.js";
import { esc, rich, shuffle, fmtTime, tape, pct, $, $$ } from "../ui.js";

export function view(root) {
  let timerId = null;
  const picked = new Set(Object.keys(CATEGORIES));

  const setup = () => {
    const counts = {};
    MCQ.forEach((m) => (counts[m.c] = (counts[m.c] || 0) + 1));
    root.innerHTML = `
      <header class="page-head"><h1>Quick quiz</h1><p>Fast multiple choice to find blind spots. Options are shuffled every time, and each answer comes with the reasoning.</p></header>
      <div class="card">
        <h3>Topics</h3>
        <div class="chips" id="cc" role="group" aria-label="Quiz topics">${Object.entries(CATEGORIES).filter(([k]) => counts[k]).map(([k, v]) => `<button class="chip" data-c="${k}" aria-pressed="${picked.has(k)}">${esc(v.name)} (${counts[k]})</button>`).join("")}</div>
        <div class="grid g3" style="margin-top:16px">
          <div><label for="n">Questions</label><select id="n"><option>10</option><option>20</option><option value="99">All selected</option></select></div>
          <div><label for="t">Time limit</label><select id="t"><option value="0">No limit</option><option value="60">1 minute per question</option><option value="30">30 seconds per question</option></select></div>
        </div>
        <div class="row" style="margin-top:8px"><button class="btn primary" id="start">Start quiz</button></div>
      </div>
      ${history()}`;
    $("#cc").onclick = (e) => { const b = e.target.closest("[data-c]"); if (!b) return; const c = b.dataset.c; picked.has(c) ? picked.delete(c) : picked.add(c); b.setAttribute("aria-pressed", picked.has(c)); };
    $("#start").onclick = () => {
      const pool = shuffle(MCQ.filter((m) => picked.has(m.c))).slice(0, +$("#n").value);
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
          <div class="row between small muted"><span>Question ${i + 1} of ${items.length}</span>${perQ ? `<span class="timer" id="tm">${fmtTime(perQ)}</span>` : ""}</div>
          <div style="margin:10px 0 16px">${tape((i / items.length) * 100, { slim: true, label: "Quiz progress" })}</div>
          <h2>${rich(m.q)}</h2>
          <div role="group" aria-label="Answer options">${order.map((o, k) => `<button class="opt" data-k="${k}">${esc(m.o[o])}</button>`).join("")}</div>
          <div id="fb"></div>
        </div>`;
      let left = perQ;
      if (perQ) timerId = setInterval(() => { left--; const t = $("#tm"); if (t) { t.textContent = fmtTime(Math.max(left, 0)); t.classList.toggle("low", left <= 10); } if (left <= 0) { clearInterval(timerId); answer(-1); } }, 1000);
      const answer = (k) => {
        clearInterval(timerId);
        const ok = k === ci;
        (cats[m.c] ||= [0, 0]); cats[m.c][1]++; if (ok) { correct++; cats[m.c][0]++; } else wrong.push(m);
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
        <h3 style="margin-top:20px">By topic</h3>${Object.entries(cats).map(([c, [ok, t]]) => `<div class="row between small" style="padding:4px 0"><span>${esc(CATEGORIES[c].name)}</span><strong>${ok}/${t}</strong></div>`).join("")}
        ${wrong.length ? `<h3 style="margin-top:20px">Review what you missed</h3>${wrong.map((m) => `<div class="callout" style="margin-bottom:8px"><strong>${rich(m.q)}</strong><br>Answer: ${esc(m.o[m.a])}. ${rich(m.e)}</div>`).join("")}` : ""}
        <div class="row" style="margin-top:16px"><button class="btn primary" id="again">New quiz</button><a class="btn" href="#/practice?mode=weak">Practise weak questions</a></div></div>`;
      $("#again").onclick = setup;
    };
    step();
  }

  setup();
  return () => clearInterval(timerId);
}
