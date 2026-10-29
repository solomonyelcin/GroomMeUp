import { allQuestions, questionById, lastScores, isDue, recordAttempt, rateQuestion } from "../store.js";
import { evaluateAnswer } from "../ai.js";
import { CATEGORIES } from "../data/index.js";
import { esc, rich, shuffle, fmtTime, busy, toast, speechSupported, startDictation, $ } from "../ui.js";
import { evalPanel } from "./evalpanel.js";

export function view(root, ctx) {
  const p = ctx.params;
  const cat = p.get("cat") || "all";
  const mode = p.get("mode") || "mixed";
  const flash = p.get("flash") === "1";
  const single = p.get("q");

  const last = lastScores();
  let pool = allQuestions();
  if (single) pool = pool.filter((q) => q.id === single);
  else {
    if (cat !== "all") pool = pool.filter((q) => q.c === cat);
    if (mode === "due") pool = pool.filter((q) => last.has(q.id) && isDue(q.id));
    else if (mode === "new") pool = pool.filter((q) => !last.has(q.id));
    else if (mode === "weak") pool = pool.filter((q) => last.has(q.id) && last.get(q.id).score < 6);
  }
  // order: never-tried and weak first, strong last, with shuffle inside buckets
  const bucket = (q) => { const l = last.get(q.id); return !l ? 1 : l.score < 6 ? 0 : isDue(q.id) ? 2 : 3; };
  pool = shuffle(pool).sort((a, b) => bucket(a) - bucket(b));

  let i = 0, timerId = null, stopDictation = null, startedAt = 0;

  root.innerHTML = `
    <header class="page-head">
      <h1>Practice</h1>
      <p>Answer in your own words, as you would out loud in the interview. You get a score, what you missed, and a model answer.</p>
    </header>
    <div class="card">
      <div class="grid g3">
        <div><label for="fcat">Topic</label><select id="fcat"><option value="all">All topics</option>${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join("")}</select></div>
        <div><label for="fmode">Which questions</label><select id="fmode"><option value="mixed">Mixed (weak and new first)</option><option value="due">Due for review</option><option value="new">Not tried yet</option><option value="weak">Weak ones (under 6)</option></select></div>
        <div><label for="fstyle">Style</label><select id="fstyle"><option value="write">Write or speak an answer</option><option value="flash">Flashcard (self-rate)</option></select></div>
      </div>
    </div>
    <div id="stage" style="margin-top:16px"></div>`;
  $("#fcat").value = cat; $("#fmode").value = mode; $("#fstyle").value = flash ? "flash" : "write";
  const reload = () => { const q = new URLSearchParams(); if ($("#fcat").value !== "all") q.set("cat", $("#fcat").value); if ($("#fmode").value !== "mixed") q.set("mode", $("#fmode").value); if ($("#fstyle").value === "flash") q.set("flash", "1"); ctx.go("#/practice" + (q.toString() ? "?" + q : "")); };
  ["fcat", "fmode", "fstyle"].forEach((id) => ($("#" + id).onchange = reload));

  const stage = $("#stage");
  function stopAll() { clearInterval(timerId); if (stopDictation) { stopDictation(); stopDictation = null; } }

  function show() {
    stopAll();
    if (!pool.length) {
      stage.innerHTML = `<div class="card"><h2>Nothing to practise here</h2><p class="muted">${mode === "due" ? "No answered questions are due for review. Come back tomorrow or try new questions." : "No questions match this selection."}</p><a class="btn primary" href="#/practice">Show all questions</a></div>`;
      return;
    }
    if (i >= pool.length) {
      stage.innerHTML = `<div class="card"><h2>Set complete</h2><p class="muted">You went through ${pool.length} question${pool.length > 1 ? "s" : ""}. Spaced repetition has scheduled your weak ones to return sooner.</p><div class="row"><button class="btn primary" id="again">Go again</button><a class="btn" href="#/dashboard">Dashboard</a></div></div>`;
      $("#again").onclick = () => { i = 0; pool = shuffle(pool); show(); };
      return;
    }
    const q = pool[i];
    const c = CATEGORIES[q.c] || { name: "My questions", color: "#546178" };
    stage.innerHTML = `<div class="card">
      <div class="row between"><span class="small muted"><span class="dot" style="background:${c.color}"></span>${esc(c.name)} / question ${i + 1} of ${pool.length}</span><span class="timer" id="tm" aria-label="Time on this question">00:00</span></div>
      <h2 style="margin-top:12px">${rich(q.q)}</h2>
      <div id="answerArea"></div>
    </div><div id="result" style="margin-top:16px"></div>`;
    startedAt = Date.now();
    timerId = setInterval(() => { const s = (Date.now() - startedAt) / 1000; const t = $("#tm"); if (t) { t.textContent = fmtTime(s); t.classList.toggle("low", s > 180); } }, 500);
    flash ? flashUI(q) : writeUI(q);
  }

  function nextBtn() { return `<button class="btn primary" id="next">${i + 1 >= pool.length ? "Finish" : "Next question"}</button>`; }
  const goNext = () => { i++; show(); window.scrollTo({ top: 0 }); };

  function writeUI(q) {
    $("#answerArea").innerHTML = `
      <div class="field" style="margin-top:14px"><label for="ans">Your answer</label><textarea id="ans" placeholder="Structure it: definition, how it works, an example from your projects, a pitfall or trade-off." rows="7"></textarea>
        <div class="hint" id="wc">0 words. Aim for 80 to 180.</div></div>
      <div class="row"><button class="btn primary" id="eval">Evaluate my answer</button>
        ${speechSupported() ? `<button class="btn" id="mic" aria-pressed="false">Dictate</button>` : ""}
        <button class="btn" id="peek">I'm stuck: show the model answer</button><button class="btn" id="skip">Skip</button></div>`;
    const ans = $("#ans");
    ans.oninput = () => { const w = ans.value.trim().split(/\s+/).filter(Boolean).length; $("#wc").textContent = `${w} word${w === 1 ? "" : "s"}. Aim for 80 to 180.`; };
    ans.focus();
    const mic = $("#mic");
    if (mic) mic.onclick = () => {
      if (stopDictation) { stopDictation(); stopDictation = null; mic.setAttribute("aria-pressed", "false"); mic.textContent = "Dictate"; return; }
      mic.setAttribute("aria-pressed", "true"); mic.textContent = "Stop dictation";
      stopDictation = startDictation((t) => { ans.value += (ans.value && !ans.value.endsWith(" ") ? " " : "") + t; ans.oninput(); }, () => { stopDictation = null; mic.setAttribute("aria-pressed", "false"); mic.textContent = "Dictate"; });
    };
    $("#skip").onclick = goNext;
    $("#peek").onclick = () => {
      $("#result").innerHTML = `<div class="card"><h3>Model answer</h3><div class="model">${rich(q.a)}</div><h4>Points to hit</h4><ul class="kp">${q.kp.map((k) => `<li>${esc(k[0])}</li>`).join("")}</ul><p class="small muted">Not scored. Close the page and try to say it from memory.</p><div class="row">${nextBtn()}<button class="btn" id="retry">Try answering it</button></div></div>`;
      $("#next").onclick = goNext; $("#retry").onclick = () => { $("#result").innerHTML = ""; $("#ans").focus(); };
      rateQuestion(q.id, 2); // seeing the answer means it needs to come back soon
    };
    $("#eval").onclick = async (e) => {
      const text = ans.value.trim();
      if (text.split(/\s+/).length < 8) return toast("Write a fuller answer first (at least a couple of sentences)", true);
      busy(e.currentTarget, true, "Evaluating");
      stopAll();
      const ev = await evaluateAnswer(q, text);
      recordAttempt(q, ev.score, "practice");
      busy(e.currentTarget, false); e.currentTarget.disabled = true;
      $("#result").innerHTML = evalPanel(ev) + `<div class="row" style="margin-top:14px">${nextBtn()}<button class="btn" id="redo">Try again</button></div>`;
      $("#next").onclick = goNext; $("#redo").onclick = () => { $("#result").innerHTML = ""; $("#eval").disabled = false; ans.focus(); };
      $("#result").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
  }

  function flashUI(q) {
    $("#answerArea").innerHTML = `<p class="muted">Say your answer out loud first, then reveal it and rate yourself honestly.</p><button class="btn primary" id="reveal">Reveal answer</button>`;
    $("#reveal").onclick = () => {
      stopAll();
      $("#answerArea").innerHTML = `<h3 style="margin-top:14px">Model answer</h3><div class="model">${rich(q.a)}</div><h4>Points to hit</h4><ul class="kp">${q.kp.map((k) => `<li>${esc(k[0])}</li>`).join("")}</ul>
        <p style="margin-top:14px"><strong>How did you do?</strong></p>
        <div class="row"><button class="btn danger" data-s="2">Blank</button><button class="btn" data-s="5">Partly</button><button class="btn" data-s="8">Good</button><button class="btn primary" data-s="10">Nailed it</button></div>`;
      stage.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { recordAttempt(q, +b.dataset.s, "flash"); goNext(); }));
    };
  }

  show();
  return stopAll;
}
