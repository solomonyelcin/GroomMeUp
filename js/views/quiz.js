import { store, allQuestions, categoryStats, noteMcq, resetMcq } from "../store.js";
import { MCQ, CATEGORIES } from "../data/index.js";
import { mcqProblem } from "../import/quality.js";
import { esc, rich, richq, shuffle, fmtTime, toast, $, $$ } from "../ui.js";
import { ns } from "../account.js";

// The quiz only uses carefully written scenario questions (and multiple choice found in your own files, which carry
// their own options and marked answer). Nothing is made up from long answers any more: those options were weak.
function candidates() {
  const list = []; let descriptive = 0, rejected = 0;
  const written = (m) => !Array.isArray(m.o) || m.o.length !== 4 || !Number.isInteger(m.a) || m.a < 0 || m.a > 3 || new Set(m.o).size !== 4 || m.o.some((x) => !String(x).trim());
  for (const m of MCQ) if (!written(m)) list.push({ id: m.id, c: m.c, l: m.l || "m", kind: "written", mcq: m }); else rejected++;
  for (const q of allQuestions()) if (q.o) { if (!mcqProblem({ q: q.q, o: q.o, a: q.ans })) list.push({ id: "m:" + q.id, c: q.c, l: "m", kind: "file", mcq: { id: "m:" + q.id, c: q.c, l: "m", q: q.q, o: q.o, a: q.ans, e: q.exp || "" } }); else rejected++; } else if (q.imported) descriptive++;
  return { list, descriptive, rejected };
}

// Which questions come next: never one already answered correctly (until all are done), misses first, weak topics a little more often.
export function pickQuiz(list, n, picked, onlyMissed = false) {
  const stats = categoryStats(), seen = store.get().mcqSeen || {};
  const inTopics = list.filter((x) => picked.has(x.c));
  const wrong = inTopics.filter((x) => seen[x.id] && !seen[x.id].ok);
  if (onlyMissed) return { chosen: shuffle(wrong), reset: false };
  const fresh = inTopics.filter((x) => !seen[x.id]).map((x) => ({ x, k: -Math.log(Math.random()) / (1 + (100 - (stats[x.c]?.readiness ?? 0)) / 50) })).sort((a, b) => a.k - b.k).map((p) => p.x);
  const open = [...shuffle(wrong), ...fresh];
  const need = n * 2;
  if (open.length >= n) return { chosen: open.slice(0, need), reset: false };
  const done = inTopics.filter((x) => seen[x.id] && seen[x.id].ok);
  return { chosen: [...open, ...shuffle(done)].slice(0, need), reset: done.length > 0, resetIds: done.map((x) => x.id) };
}

const GLYPH = { csharp: "C#", aspnet: "API", efsql: "SQL", angular: "NG", micro: "μS", snowflake: "SF", cloud: "AZ", design: "SD", ai: "AI", "rm-csharp": ".NET", "rm-backend": "DB", "rm-cloud": "K8", "rm-arch": "ARC", "rm-aifund": "LLM", "rm-aidotnet": "MCP", "rm-prodai": "OPS", "rm-proj": "BLD", corpay: "CPY", accenture: "ACN" };
const SECTIONS = [
  ["Core .NET and backend", ["csharp", "aspnet", "efsql", "rm-csharp", "rm-backend"]],
  ["Architecture and messaging", ["micro", "design", "rm-arch"]],
  ["Cloud and data", ["cloud", "rm-cloud", "snowflake"]],
  ["Front end", ["angular"]],
  ["AI engineering", ["ai", "rm-aifund", "rm-aidotnet", "rm-prodai", "rm-proj"]],
  ["Interview prep", ["corpay", "accenture"]],
];
const LV = { j: "Junior", m: "Mid", s: "Senior" };
const BAR = { j: 60, m: 70, s: 75, all: 70 };
const fmtDur = (s) => (s >= 3600 ? Math.floor(s / 3600) + "h " + Math.round((s % 3600) / 60) + "m" : s >= 60 ? Math.round(s / 60) + " min" : s > 0 ? Math.round(s) + " s" : "0 s");
const ago = (t) => { if (!t) return "not tried"; const d = Math.floor((Date.now() - t) / 86400000); return d < 1 ? "today" : d === 1 ? "yesterday" : d + " days ago"; };
const PREF = () => ns("groommeup.quizprefs");
const getPref = () => { try { return { level: "all", n: 10, mode: "practice", ...JSON.parse(localStorage.getItem(PREF()) || "{}") }; } catch { return { level: "all", n: 10, mode: "practice" }; } };
const setPref = (p) => { try { localStorage.setItem(PREF(), JSON.stringify(p)); } catch { /* ignore */ } };
const ring = (pct, size = 58) => { const r = 22, c = 2 * Math.PI * r; return `<div class="qz-ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 58 58" width="${size}" height="${size}" aria-hidden="true"><circle class="bg" cx="29" cy="29" r="${r}"/><circle class="fg" cx="29" cy="29" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(100, pct)) / 100)}"/></svg><b>${pct == null ? "–" : Math.round(pct) + "%"}</b></div>`; };

function topicStats() {
  const out = {};
  for (const q of store.get().quizzes) {
    for (const [c, v] of Object.entries(q.cats || {})) { const o = (out[c] ||= { att: 0, ok: 0, secs: 0, last: 0 }); o.ok += v[0]; o.att += v[1]; o.secs += q.catSecs?.[c] || 0; o.last = Math.max(o.last, q.t); }
  }
  return out;
}

export function view(root, ctx) {
  let clock = null, keyOff = null, closeSheet = null;
  const { list, descriptive, rejected } = candidates();
  const counts = {}, lvl = {};
  list.forEach((m) => { counts[m.c] = (counts[m.c] || 0) + 1; (lvl[m.c] ||= { j: 0, m: 0, s: 0 })[m.l]++; });
  const stop = () => { clearInterval(clock); if (keyOff) keyOff(); keyOff = null; };

  // ---------------- hub: a card for every topic ----------------
  function hub() {
    stop(); root.onclick = null;
    const st = topicStats(), seen = store.get().mcqSeen || {}, qz = store.get().quizzes;
    const tot = Object.values(st).reduce((a, v) => ({ att: a.att + v.att, ok: a.ok + v.ok, secs: a.secs + v.secs }), { att: 0, ok: 0, secs: 0 });
    const missed = list.filter((x) => seen[x.id] && !seen[x.id].ok);
    const acc = tot.att ? Math.round((tot.ok / tot.att) * 100) : null;
    const known = Object.keys(counts);
    const card = (k) => {
      const meta = CATEGORIES[k] || { name: k, color: "#546178" }, s = st[k] || { att: 0, ok: 0, secs: 0, last: 0 }, n = counts[k], l = lvl[k];
      const rate = s.att ? (s.ok / s.att) * 100 : null;
      const cov = Math.round((list.filter((x) => x.c === k && seen[x.id]?.ok).length / n) * 100);
      const badge = !s.att ? "New" : cov >= 80 && rate >= 80 ? "Mastered" : rate >= 70 ? "Solid" : "Learning";
      return `<button class="qz-card" data-topic="${esc(k)}" style="--qa:${meta.color}" aria-label="${esc(meta.name)}: ${n} questions. Open quiz setup">
        <div class="qz-top"><div class="qz-ico" aria-hidden="true">${esc(GLYPH[k] || "★")}</div><div><h3>${esc(meta.name)}</h3><small>${n} questions</small></div>${ring(rate)}</div>
        <div class="qz-nums"><div><b>${s.att}</b><span>Attempts</span></div><div><b>${s.att ? Math.round(rate) + "%" : "–"}</b><span>Success</span></div><div><b>${s.secs ? fmtDur(s.secs) : "–"}</b><span>Time</span></div></div>
        <div><div class="qz-lv" title="Junior ${l.j}, Mid ${l.m}, Senior ${l.s}">${["j", "m", "s"].map((x) => `<i class="${x}" style="width:${(l[x] / n) * 100}%"></i>`).join("")}</div><div class="small muted" style="margin-top:4px">Junior ${l.j} · Mid ${l.m} · Senior ${l.s}</div></div>
        <div class="qz-cov" title="${cov}% answered correctly at least once"><i style="width:${cov}%"></i></div>
        <div class="qz-foot"><span class="qz-badge">${badge}</span><span>${ago(s.last)}</span><span class="qz-go">Start →</span></div></button>`;
    };
    const mine = known.filter((k) => CATEGORIES[k]?.mine);
    const placed = new Set(SECTIONS.flatMap((x) => x[1]));
    const other = known.filter((k) => !placed.has(k) && !CATEGORIES[k]?.mine);
    const sec = (title, keys) => { const ks = keys.filter((k) => counts[k]); return ks.length ? `<div class="qz-sec"><h2>${esc(title)}</h2><span>${ks.reduce((a, k) => a + counts[k], 0)} questions</span></div><div class="qz-grid">${ks.map(card).join("")}</div>` : ""; };
    const weakest = Object.entries(st).filter(([k, v]) => v.att >= 5 && counts[k]).sort((a, b) => a[1].ok / a[1].att - b[1].ok / b[1].att)[0];
    root.innerHTML = `<div class="qz">
      <div class="qz-hero"><h1>Quiz arena</h1><p>Scenario-based questions by level. Pick a topic card, choose Practice or Exam mode, and finish with a full report.</p>
        <div class="qz-stats"><div class="qz-stat"><b>${list.length}</b><span>Questions</span></div><div class="qz-stat"><b>${tot.att}</b><span>Answered</span></div><div class="qz-stat"><b>${acc == null ? "–" : acc + "%"}</b><span>Accuracy</span></div><div class="qz-stat"><b>${tot.secs ? fmtDur(tot.secs) : "–"}</b><span>Time spent</span></div><div class="qz-stat"><b>${qz.length}</b><span>Quizzes</span></div></div></div>
      <div class="qz-feature">
        <button class="qz-fcard" data-feat="mixed"><span class="fi" aria-hidden="true">∞</span><span><strong>Mixed interview</strong><small>All topics, shuffled</small></span></button>
        <button class="qz-fcard" data-feat="weak" ${weakest ? "" : "disabled"}><span class="fi" aria-hidden="true">↗</span><span><strong>Fix my weakest topic</strong><small>${weakest ? esc(CATEGORIES[weakest[0]]?.name || weakest[0]) + " · " + Math.round((weakest[1].ok / weakest[1].att) * 100) + "%" : "Answer a few questions first"}</small></span></button>
        <button class="qz-fcard" data-feat="missed" ${missed.length ? "" : "disabled"}><span class="fi" aria-hidden="true">↺</span><span><strong>Retry missed</strong><small>${missed.length} waiting</small></span></button>
      </div>
      ${SECTIONS.map(([t, ks]) => sec(t, ks)).join("")}${sec("Other topics", other)}${mine.length ? sec("Your material", mine) : ""}
      ${descriptive || rejected ? `<p class="small muted" style="margin-top:18px">Quizzes only use questions with clear options and a marked answer. ${descriptive ? `${descriptive} of your imported questions have no options, so they stay in the Library to read. ` : ""}${rejected ? `${rejected} had unclear options and were left out.` : ""}</p>` : ""}
      ${history()}</div>`;
    root.onclick = (e) => {
      const c = e.target.closest("[data-topic]"), f = e.target.closest("[data-feat]");
      if (c) sheet({ cats: new Set([c.dataset.topic]), title: CATEGORIES[c.dataset.topic]?.name || c.dataset.topic, color: CATEGORIES[c.dataset.topic]?.color });
      else if (f && !f.disabled) {
        const w = f.dataset.feat;
        if (w === "mixed") sheet({ cats: new Set(known), title: "Mixed interview" });
        if (w === "weak") sheet({ cats: new Set([weakest[0]]), title: CATEGORIES[weakest[0]]?.name || weakest[0], color: CATEGORIES[weakest[0]]?.color });
        if (w === "missed") sheet({ cats: new Set(known), title: "Retry missed questions", missed: true });
      }
    };
  }

  const history = () => {
    const qs = store.get().quizzes.slice(-6).reverse();
    if (!qs.length) return "";
    return `<div class="qz-sec"><h2>Recent quizzes</h2></div><div class="card">${qs.map((q) => `<div class="row between small" style="padding:7px 0;border-bottom:1px dashed var(--line)"><span>${new Date(q.t).toLocaleString()}${q.mode ? ` · ${q.mode === "exam" ? "Exam" : "Practice"}` : ""}${q.level && q.level !== "all" ? ` · ${LV[q.level]}` : ""}</span><strong>${q.correct}/${q.total} · ${Math.round((q.correct / q.total) * 100)}%</strong></div>`).join("")}</div>`;
  };

  // ---------------- setup sheet ----------------
  function sheet(opt) {
    const seen = store.get().mcqSeen || {}, P = getPref();
    const st = { level: P.level, n: P.n, mode: opt.missed ? "practice" : P.mode };
    const avail = () => list.filter((m) => opt.cats.has(m.c) && (st.level === "all" || m.l === st.level) && (opt.missed ? seen[m.id] && !seen[m.id].ok : true)).length;
    const el = document.createElement("div"); el.className = "qz-veil";
    const draw = () => {
      const a = avail(), n = Math.min(st.n, a), est = Math.max(1, Math.round(n * (st.mode === "exam" ? 0.9 : 0.7)));
      el.innerHTML = `<div class="qz-sheet" role="dialog" aria-modal="true" aria-label="Quiz setup"><div class="row between"><h2 style="margin:0">${esc(opt.title)}</h2><button class="btn sm" id="xs" aria-label="Close">✕</button></div>
        <label class="l">Level</label><div class="qz-seg" id="slv">${[["all", "All"], ["j", "Junior"], ["m", "Mid"], ["s", "Senior"]].map(([k, t]) => `<button data-v="${k}" aria-pressed="${st.level === k}">${t}</button>`).join("")}</div>
        <label class="l">Number of questions</label><div class="qz-seg" id="sn">${[10, 20, 30, 50].map((k) => `<button data-v="${k}" aria-pressed="${st.n === k}">${k}</button>`).join("")}</div>
        ${opt.missed ? "" : `<label class="l">Mode</label><div class="qz-modes" id="sm"><button data-v="practice" aria-pressed="${st.mode === "practice"}"><strong>Practice</strong><small>Untimed. See the answer and explanation after each question.</small></button><button data-v="exam" aria-pressed="${st.mode === "exam"}"><strong>Exam</strong><small>60 seconds per question. Answers revealed at the end.</small></button></div>`}
        <p class="small muted" style="margin:14px 0 4px">${a ? `${a} questions match. This quiz: ${n} questions, about ${est} min.` : "No questions match these choices."}</p>
        <div class="row" style="margin-top:10px"><button class="btn primary" id="go" ${a ? "" : "disabled"}>Start ${st.mode === "exam" ? "exam" : "quiz"}</button><button class="btn" id="cn">Cancel</button></div>
        <p class="qz-keys">Keys during a quiz: A to D (or 1 to 4) choose, Enter continues, F flags a question.</p></div>`;
      el.querySelector("#slv").onclick = (e) => { const b = e.target.closest("[data-v]"); if (b) { st.level = b.dataset.v; draw(); } };
      el.querySelector("#sn").onclick = (e) => { const b = e.target.closest("[data-v]"); if (b) { st.n = +b.dataset.v; draw(); } };
      const sm = el.querySelector("#sm"); if (sm) sm.onclick = (e) => { const b = e.target.closest("[data-v]"); if (b) { st.mode = b.dataset.v; draw(); } };
      el.querySelector("#xs").onclick = el.querySelector("#cn").onclick = close;
      const g = el.querySelector("#go"); if (g) { g.onclick = start; g.focus(); }
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() { document.removeEventListener("keydown", onKey); el.remove(); closeSheet = null; }
    function start() {
      setPref({ level: st.level, n: st.n, mode: st.mode });
      const pool0 = list.filter((m) => st.level === "all" || m.l === st.level);
      const { chosen, reset, resetIds } = pickQuiz(pool0, st.n, opt.cats, !!opt.missed);
      const pool = chosen.slice(0, st.n).map((c) => ({ ...c.mcq, id: c.id }));
      if (!pool.length) return;
      if (reset) { resetMcq(resetIds); toast("You have answered all of these correctly, so a new round starts from the beginning."); }
      close(); run(shuffle(pool), { mode: st.mode, level: st.level, cats: opt.cats });
    }
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    document.addEventListener("keydown", onKey); closeSheet = close;
    document.body.appendChild(el); draw();
  }

  // ---------------- the quiz ----------------
  function run(pool, cfg) {
    stop();
    const exam = cfg.mode === "exam", perQ = exam ? 60 : 0;
    const items = pool.map((m) => { const idx = shuffle(m.o.map((_, k) => k)); return { m, order: idx, ci: idx.indexOf(m.a), sel: -1, done: false, ok: false, ms: 0, flag: false }; });
    let i = 0, t0 = 0, left = perQ;
    const answered = () => items.filter((x) => x.done).length;
    const commit = (it, sel) => { if (it.done) return; it.sel = sel; it.done = true; it.ok = sel === it.ci; it.ms = Date.now() - t0; noteMcq(it.m.id, it.ok); };

    function step() {
      clearInterval(clock);
      if (i >= items.length) return finish();
      const it = items[i], m = it.m; t0 = Date.now(); left = perQ;
      const dots = items.map((x, k) => `<i class="${k === i ? "cur" : x.done ? (exam ? "done" : x.ok ? "ok" : "bad") : ""} ${x.flag ? "flag" : ""}"></i>`).join("");
      const C = 2 * Math.PI * 20;
      root.innerHTML = `<div class="qz qz-run"><div class="card">
        <div class="qz-bar"><span class="tag"><span class="dot" style="background:${CATEGORIES[m.c]?.color || "#546178"}"></span> ${esc(CATEGORIES[m.c]?.name || "General")}</span><span class="tag thread">${LV[m.l] || "Mid"}</span><span class="small muted" style="margin-left:auto">Question ${i + 1} of ${items.length}</span>
          ${exam ? `<div class="qz-clock" id="clk"><svg viewBox="0 0 46 46" width="46" height="46"><circle class="bg" cx="23" cy="23" r="20"/><circle class="fg" cx="23" cy="23" r="20" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><b id="tm">${fmtTime(perQ)}</b></div>` : ""}</div>
        <div class="qz-dots" aria-hidden="true">${dots}</div>
        <div class="qz-q">${richq(m.q)}</div>
        <div role="group" aria-label="Answer options">${it.order.map((o, k) => `<button class="qz-opt" data-k="${k}"><kbd>${"ABCD"[k]}</kbd><span>${rich(m.o[o])}</span></button>`).join("")}</div>
        <div id="fb"></div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="nx" ${exam ? "disabled" : "hidden"}>${i + 1 >= items.length ? "Finish" : "Next"}</button>${exam ? `<button class="btn" id="skip">Skip</button>` : ""}<button class="btn" id="fl" aria-pressed="${it.flag}">${it.flag ? "⚑ Flagged" : "⚐ Flag"}</button><button class="btn" id="quit" style="margin-left:auto">End quiz</button></div>
        <p class="qz-keys">A–D or 1–4 choose · Enter ${exam ? "confirms and moves on" : "continues"} · F flags</p></div></div>`;
      const opts = $$(".qz-opt");
      const reveal = () => {
        opts.forEach((b) => { b.disabled = true; const bk = +b.dataset.k; if (bk === it.ci) b.classList.add("right"); else if (bk === it.sel) b.classList.add("wrong"); });
        $("#fb").innerHTML = `<div class="qz-exp ${it.ok ? "ok" : "bad"}"><strong>${it.sel === -1 ? "Time is up." : it.ok ? "Correct." : "Not quite."}</strong> The answer is <strong>${"ABCD"[it.ci]}</strong>. ${rich(m.e)}</div>`;
        const nx = $("#nx"); nx.hidden = false; nx.disabled = false; nx.focus();
      };
      const next = () => { i++; step(); };
      const choose = (k) => {
        if (it.done) return;
        if (exam) { it.sel = k; opts.forEach((b) => b.classList.toggle("sel", +b.dataset.k === k)); $("#nx").disabled = false; return; }
        commit(it, k); reveal();
      };
      opts.forEach((b) => (b.onclick = () => choose(+b.dataset.k)));
      $("#nx").onclick = () => { if (exam) { if (it.sel < 0) return; commit(it, it.sel); } next(); };
      if ($("#skip")) $("#skip").onclick = () => { commit(it, -1); next(); };
      $("#fl").onclick = () => { it.flag = !it.flag; const b = $("#fl"); b.textContent = it.flag ? "⚑ Flagged" : "⚐ Flag"; b.setAttribute("aria-pressed", it.flag); const d = $$(".qz-dots i")[i]; if (d) d.classList.toggle("flag", it.flag); };
      $("#quit").onclick = () => { if (!answered()) { if (confirm("Leave this quiz? Nothing has been answered yet.")) { stop(); hub(); } return; } if (confirm(`End the quiz here? Your ${answered()} answer${answered() === 1 ? "" : "s"} so far will be saved and reported.`)) { clearInterval(clock); finish(true); } };
      if (exam) clock = setInterval(() => { left--; const t = $("#tm"); if (t) t.textContent = fmtTime(Math.max(left, 0)); const f = document.querySelector("#clk .fg"); if (f) f.setAttribute("stroke-dashoffset", String(C * (1 - Math.max(left, 0) / perQ))); $("#clk")?.classList.toggle("low", left <= 10); if (left <= 0) { clearInterval(clock); if (it.sel >= 0) commit(it, it.sel); else commit(it, -1); toast("Time is up. Moving on.", true); next(); } }, 1000);
      stop(); const onKey = (e) => {
        if (e.target.closest("input,textarea,select") || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase(), idx = "abcd".indexOf(k) >= 0 ? "abcd".indexOf(k) : "1234".indexOf(k);
        if (idx >= 0 && idx < 4) { e.preventDefault(); choose(idx); }
        else if (k === "f") { e.preventDefault(); $("#fl").click(); }
        else if (k === "enter") { const nx = $("#nx"); if (nx && !nx.hidden && !nx.disabled) { e.preventDefault(); nx.click(); } }
      };
      document.addEventListener("keydown", onKey); keyOff = () => document.removeEventListener("keydown", onKey);
      if (exam) clock = clock; // timer already running
    }

    function finish(early) {
      stop();
      const done = items.filter((x) => x.done);
      if (!done.length) return hub();
      const cats = {}, catSecs = {}, lv = { j: [0, 0], m: [0, 0], s: [0, 0] };
      done.forEach((x) => { const c = x.m.c; (cats[c] ||= [0, 0]); cats[c][1]++; if (x.ok) cats[c][0]++; catSecs[c] = (catSecs[c] || 0) + Math.round(x.ms / 1000); const l = lv[x.m.l] || lv.m; l[1]++; if (x.ok) l[0]++; });
      const correct = done.filter((x) => x.ok).length, secs = Math.round(done.reduce((a, x) => a + x.ms, 0) / 1000);
      store.update((s) => s.quizzes.push({ t: Date.now(), total: done.length, correct, cats, secs, catSecs, mode: cfg.mode, level: cfg.level }));
      report({ items: done, cats, catSecs, lv, correct, total: done.length, secs, cfg, early });
    }
    step();
  }

  // ---------------- report ----------------
  function report(r) {
    const { items, cats, catSecs, lv, correct, total, secs, cfg } = r;
    const pct = Math.round((correct / total) * 100), bar = BAR[cfg.level] || 70, lvName = cfg.level === "all" ? "a mixed" : LV[cfg.level];
    const verdict = pct >= bar ? ["pass", `Meets the bar for ${cfg.level === "all" ? "a mid-level" : lvName} (${bar}%)`] : pct >= bar - 10 ? ["near", `Close to the ${cfg.level === "all" ? "mid-level" : lvName} bar (${bar}%)`] : ["fail", `Below the ${cfg.level === "all" ? "mid-level" : lvName} bar (${bar}%): keep practising`];
    const col = pct >= bar ? "var(--moss)" : pct >= bar - 10 ? "var(--amber)" : "var(--thread)";
    const C = 2 * Math.PI * 64;
    const topics = Object.entries(cats).map(([c, [ok, t]]) => ({ c, ok, t, p: Math.round((ok / t) * 100), name: CATEGORIES[c]?.name || c })).sort((a, b) => a.p - b.p);
    const weak = topics.filter((t) => t.p < 70);
    const avg = Math.round(secs / total), slow = items.slice().sort((a, b) => b.ms - a.ms)[0];
    const link = (c) => c === "corpay" ? "#/library?tab=corpay" : c === "accenture" ? "#/library?tab=accenture" : c.startsWith("rm-") ? "#/library?tab=roadmap" : "#/library?tab=articles";
    const revItem = (x, k) => `<details class="qz-rev" data-ok="${x.ok ? 1 : 0}" data-fl="${x.flag ? 1 : 0}"><summary><span class="mk ${x.ok ? "ok" : "bad"}" aria-hidden="true">${x.ok ? "✓" : "✕"}</span><span style="flex:1">${richq(x.m.q).replace(/<pre[\s\S]*?<\/pre>/g, " [code] ")}</span><span class="small muted">${x.flag ? "⚑ " : ""}${Math.round(x.ms / 1000)}s</span></summary>
      <div class="body"><div class="qz-q" style="font-size:1rem">${richq(x.m.q)}</div>${x.m.o.map((o, j) => `<div class="small" style="padding:3px 0"><b>${j === x.m.a ? "✓ " : x.m.o[x.order?.[x.sel]] === o && !x.ok ? "✕ " : "• "}</b>${rich(o)}</div>`).join("")}<div class="qz-exp ${x.ok ? "ok" : "bad"}"><strong>${x.sel === -1 ? "No answer." : x.ok ? "You were right." : "Your answer: " + esc(x.m.o[x.order[x.sel]]) + "."}</strong> ${rich(x.m.e)}</div></div></details>`;
    root.innerHTML = `<div class="qz qz-run" style="max-width:860px"><div class="card">
      <div class="qz-rep-head"><div class="qz-bigring"><svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true"><circle class="bg" cx="75" cy="75" r="64"/><circle class="fg" cx="75" cy="75" r="64" stroke="${col}" stroke-dasharray="${C}" stroke-dashoffset="${C}" id="rg"/></svg><div><b>${pct}%</b><span>${correct} of ${total}</span></div></div>
        <div style="flex:1;min-width:220px"><h1 style="margin:0 0 6px">Your quiz report</h1><span class="qz-verdict ${verdict[0]}">${esc(verdict[1])}</span>
        <p class="muted" style="margin:10px 0 0">${cfg.mode === "exam" ? "Exam mode" : "Practice mode"} · ${total} questions · ${fmtDur(secs)} · about ${avg}s per question${r.early ? " · ended early" : ""}</p></div></div>
      <div class="qz-stats" style="margin-top:16px;color:inherit">${["j", "m", "s"].filter((l) => lv[l][1]).map((l) => `<div class="qz-stat" style="background:var(--soft);border-color:var(--line)"><b>${Math.round((lv[l][0] / lv[l][1]) * 100)}%</b><span>${LV[l]} (${lv[l][0]}/${lv[l][1]})</span></div>`).join("")}<div class="qz-stat" style="background:var(--soft);border-color:var(--line)"><b>${items.filter((x) => x.flag).length}</b><span>Flagged</span></div>${slow ? `<div class="qz-stat" style="background:var(--soft);border-color:var(--line)"><b>${Math.round(slow.ms / 1000)}s</b><span>Slowest answer</span></div>` : ""}</div>
      <h3 style="margin:22px 0 6px">By topic</h3>${topics.map((t) => `<div class="qz-tb"><span>${esc(t.name)}</span><div class="tr"><i style="width:${t.p}%;background:${t.p >= 70 ? "var(--moss)" : t.p >= 50 ? "var(--amber)" : "var(--thread)"}"></i></div><strong>${t.ok}/${t.t}${catSecs[t.c] ? ` <span class="small muted">· ${fmtDur(catSecs[t.c])}</span>` : ""}</strong></div>`).join("")}
      <h3 style="margin:22px 0 6px">What to do next</h3>${weak.length ? weak.map((t) => `<div class="callout" style="margin-bottom:8px"><strong>${esc(t.name)}</strong> (${t.p}%). <a href="${link(t.c)}">Study guides</a> · <a href="#/library?tab=questions&cat=${encodeURIComponent(t.c)}">Interview Q&A</a> · <a href="#/quiz?cat=${encodeURIComponent(t.c)}">Quiz this topic</a></div>`).join("") : `<p class="callout">Every topic is at or above 70%. Raise the level, try Exam mode, or add coding and a live mock interview.</p>`}
      <div class="row qz-noprint" style="margin-top:18px">${correct < total ? `<button class="btn primary" id="retry">Retry the ${total - correct} I missed</button>` : ""}<button class="btn ${correct < total ? "" : "primary"}" id="again">Back to topics</button><button class="btn" id="dl">Download report</button><button class="btn" id="shr">Share card</button></div>
      <h3 style="margin:24px 0 8px">Review every question</h3>
      <div class="qz-seg qz-noprint" id="rf" style="max-width:360px;margin-bottom:10px"><button data-f="all" aria-pressed="true">All ${total}</button><button data-f="bad" aria-pressed="false">Wrong ${total - correct}</button><button data-f="fl" aria-pressed="false">Flagged ${items.filter((x) => x.flag).length}</button></div>
      <div id="rv">${items.map(revItem).join("")}</div></div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => { const g = $("#rg"); if (g) g.setAttribute("stroke-dashoffset", String(C * (1 - pct / 100))); }));
    $("#rf").onclick = (e) => { const b = e.target.closest("[data-f]"); if (!b) return; $$("#rf button").forEach((x) => x.setAttribute("aria-pressed", x === b)); $$("#rv .qz-rev").forEach((d) => { d.hidden = b.dataset.f === "bad" ? d.dataset.ok === "1" : b.dataset.f === "fl" ? d.dataset.fl !== "1" : false; }); };
    $("#again").onclick = hub;
    if ($("#retry")) $("#retry").onclick = () => run(shuffle(items.filter((x) => !x.ok).map((x) => x.m)), { ...cfg, mode: "practice" });
    $("#dl").onclick = () => download(r, { pct, verdict, topics });
    $("#shr").onclick = () => shareCard(r, { pct, verdict, topics });
  }

  const saveBlob = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  function download(r, { pct, verdict, topics }) {
    const d = new Date().toLocaleString();
    const html = `<!doctype html><meta charset="utf-8"><title>GroomMeUp quiz report</title><style>body{font:15px/1.5 system-ui,Segoe UI,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#16202e}h1{margin:0}.big{font-size:44px;font-weight:800}.t{display:flex;gap:10px;align-items:center;margin:6px 0}.t .b{flex:1;height:10px;background:#e3e8ef;border-radius:9px;overflow:hidden}.t i{display:block;height:100%}.q{border:1px solid #d9e0ea;border-radius:10px;padding:12px 14px;margin:10px 0;break-inside:avoid}.ok{color:#1b7f55}.bad{color:#c0392b}pre{background:#0f1722;color:#e6edf6;padding:10px;border-radius:8px;white-space:pre-wrap}code{background:#eef2f7;padding:1px 4px;border-radius:4px}</style>
<h1>GroomMeUp quiz report</h1><p>${esc(d)} · ${r.cfg.mode === "exam" ? "Exam" : "Practice"} · ${r.total} questions · ${fmtDur(r.secs)}</p><div class="big">${pct}% <small style="font-size:18px;font-weight:600">${r.correct}/${r.total}</small></div><p><strong>${esc(verdict[1])}</strong></p>
<h2>By topic</h2>${topics.map((t) => `<div class="t"><span style="width:240px">${esc(t.name)}</span><span class="b"><i style="width:${t.p}%;background:${t.p >= 70 ? "#1b7f55" : t.p >= 50 ? "#d9a23a" : "#c0392b"}"></i></span><b>${t.ok}/${t.t}</b></div>`).join("")}
<h2>Questions</h2>${r.items.map((x, k) => `<div class="q"><b class="${x.ok ? "ok" : "bad"}">${x.ok ? "✓" : "✕"} ${k + 1}.</b> ${richq(x.m.q)}<p><b>Answer:</b> ${rich(x.m.o[x.m.a])}</p>${x.ok ? "" : `<p><b>You chose:</b> ${x.sel === -1 ? "no answer" : rich(x.m.o[x.order[x.sel]])}</p>`}<p>${rich(x.m.e)}</p></div>`).join("")}
<p style="color:#6b7686;font-size:13px">Tip: use your browser's Print and choose Save as PDF.</p>`;
    saveBlob(new Blob([html], { type: "text/html" }), "groommeup-quiz-report.html");
  }
  function shareCard(r, { pct, verdict, topics }) {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630; const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 1200, 630); grad.addColorStop(0, "#0f1b2d"); grad.addColorStop(1, "#1d4f91"); g.fillStyle = grad; g.fillRect(0, 0, 1200, 630);
    g.fillStyle = "#fff"; g.font = "700 34px system-ui, sans-serif"; g.fillText("GroomMeUp quiz result", 60, 90);
    g.font = "800 190px system-ui, sans-serif"; g.fillText(pct + "%", 60, 300);
    g.font = "500 34px system-ui, sans-serif"; g.fillStyle = "#cfe0f5"; g.fillText(`${r.correct} of ${r.total} correct · ${fmtDur(r.secs)} · ${r.cfg.mode === "exam" ? "Exam" : "Practice"}`, 60, 360);
    g.fillStyle = pct >= (BAR[r.cfg.level] || 70) ? "#5be3a2" : "#ffd27a"; g.font = "700 34px system-ui, sans-serif"; g.fillText(verdict[1], 60, 420);
    g.font = "600 26px system-ui, sans-serif";
    topics.slice(0, 5).forEach((t, k) => { const y = 120 + k * 80; g.fillStyle = "#cfe0f5"; g.fillText(t.name.slice(0, 26), 700, y); g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(700, y + 14, 440, 16); g.fillStyle = t.p >= 70 ? "#5be3a2" : t.p >= 50 ? "#ffd27a" : "#ff8a7a"; g.fillRect(700, y + 14, 4.4 * t.p, 16); g.fillStyle = "#fff"; g.fillText(t.p + "%", 1085, y); });
    g.fillStyle = "#9db8d8"; g.font = "500 24px system-ui, sans-serif"; g.fillText("solomonyelcin.github.io/GroomMeUp", 60, 570);
    c.toBlob(async (blob) => {
      const f = new File([blob], "groommeup-quiz-result.png", { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], text: `I scored ${pct}% on a GroomMeUp quiz` }); return; } } catch { /* fall back to download */ }
      saveBlob(blob, "groommeup-quiz-result.png"); toast("Result card saved as an image.");
    });
  }

  hub();
  const cat = ctx?.params?.get("cat");
  if (cat && counts[cat]) sheet({ cats: new Set([cat]), title: CATEGORIES[cat]?.name || cat, color: CATEGORIES[cat]?.color });
  return () => { stop(); if (closeSheet) closeSheet(); };
}
