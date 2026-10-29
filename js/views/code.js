import { store } from "../store.js";
import { JS_CHALLENGES, SQL_CHALLENGES, CS_CHALLENGES, SCHEMA_HELP } from "../data/index.js";
import { runJS, runSQL, runOnPiston } from "../runner.js";
import { reviewCode, explainFailure, aiEnabled } from "../ai.js";
import { esc, rich, createEditor, busy, toast, scoreBadge, $, $$ } from "../ui.js";

const LANGS = {
  js: { name: "JavaScript", list: JS_CHALLENGES, monaco: "javascript" },
  sql: { name: "SQL", list: SQL_CHALLENGES, monaco: "sql" },
  cs: { name: "C#", list: CS_CHALLENGES, monaco: "csharp" },
};
const diffTag = (d) => ["", '<span class="tag moss">Easy</span>', '<span class="tag amber">Medium</span>', '<span class="tag thread">Hard</span>'][d] || "";

export function view(root, ctx) {
  let lang = ctx.params.get("lang") || "js";
  if (!LANGS[lang]) lang = "js";
  let current = null, editor = null;

  root.innerHTML = `
    <header class="page-head"><h1>Coding tests</h1>
      <p>JavaScript and SQL run instantly in your browser against hidden tests. C# challenges are reviewed against a rubric (by AI if you enable it) with a reference solution to compare.</p></header>
    <div class="row" role="tablist" aria-label="Language" id="tabs" style="margin-bottom:14px"></div>
    <div class="work"><div class="card flush clist" id="list"></div><div id="pane"></div></div>`;

  const done = (id) => store.get().code[id]?.solved;

  function drawTabs() {
    $("#tabs").innerHTML = Object.entries(LANGS).map(([k, v]) => {
      const n = v.list.filter((c) => done(c.id)).length;
      return `<button class="chip" role="tab" data-l="${k}" aria-pressed="${k === lang}" aria-selected="${k === lang}">${v.name} ${n}/${v.list.length}</button>`;
    }).join("");
  }
  function drawList() {
    drawTabs();
    $("#list").innerHTML = LANGS[lang].list.map((c) => `<button class="citem" data-id="${c.id}" aria-current="${current && current.id === c.id}">
      <span aria-hidden="true">${done(c.id) ? "✔" : "○"}</span><span style="flex:1"><strong>${esc(c.title)}</strong><br><span class="small muted">${esc(c.topic)}</span></span>${diffTag(c.diff)}</button>`).join("");
  }
  $("#tabs").onclick = (e) => { const b = e.target.closest("[data-l]"); if (b) { saveCode(); lang = b.dataset.l; current = null; drawList(); open(LANGS[lang].list.find((c) => !done(c.id)) || LANGS[lang].list[0]); } };
  $("#list").onclick = (e) => { const b = e.target.closest("[data-id]"); if (b) { saveCode(); open(LANGS[lang].list.find((c) => c.id === b.dataset.id)); } };

  function saveCode() {
    if (!current || !editor) return;
    const code = editor.get();
    store.update((s) => { const x = (s.code[current.id] ||= { tries: 0 }); x.code = code; });
  }

  async function open(ch) {
    if (editor) { editor.dispose(); editor = null; }
    current = ch; drawList();
    const saved = store.get().code[ch.id];
    const l = LANGS[lang];
    $("#pane").innerHTML = `<div class="card">
      <div class="row between"><h2 style="margin:0">${esc(ch.title)}</h2><span>${diffTag(ch.diff)} <span class="tag">${esc(ch.topic)}</span></span></div>
      <p style="margin-top:10px">${rich(ch.desc)}</p>
      ${lang === "sql" ? `<details><summary class="small" style="cursor:pointer">Schema</summary><pre class="out" style="margin-top:6px">${esc(SCHEMA_HELP)}</pre></details>` : ""}
      <div class="editor" id="ed" style="margin-top:12px" aria-label="Code editor"></div>
      <div class="row" style="margin-top:12px" id="btns">
        ${lang === "cs" ? `${aiEnabled() ? `<button class="btn primary" id="review">Review with AI</button>` : ""}${store.get().settings.pistonUrl ? `<button class="btn" id="runner">Run on your runner</button>` : ""}<button class="btn" id="ref">Show reference solution</button>`
          : `<button class="btn primary" id="run">Run tests</button>${lang === "js" ? `<button class="btn" id="hint">Hint</button>` : ""}<button class="btn" id="ref">Show solution</button>`}
        <button class="btn" id="reset">Reset code</button>
      </div>
      <div id="out" style="margin-top:14px"></div>
    </div>`;
    editor = await createEditor($("#ed"), saved?.code || ch.starter, l.monaco);
    if (current !== ch) return;

    $("#reset").onclick = () => { editor.set(ch.starter); $("#out").innerHTML = ""; };
    $("#ref").onclick = () => { $("#out").innerHTML = `<div class="card" style="background:var(--cobalt-tint)"><h3>Reference solution</h3><pre class="out">${esc(ch.solution)}</pre>${ch.complexity ? `<p class="small" style="margin:8px 0 0"><strong>Complexity:</strong> ${esc(ch.complexity)}</p>` : ""}<p class="small muted" style="margin-bottom:0">Study it, close it, and rewrite it from memory tomorrow.</p></div>`; };
    if ($("#hint")) $("#hint").onclick = () => ($("#out").innerHTML = `<div class="callout">${esc(ch.hint)}</div>`);
    if (lang === "js") $("#run").onclick = (e) => runJs(e.currentTarget, ch);
    if (lang === "sql") $("#run").onclick = (e) => runSql(e.currentTarget, ch);
    if (lang === "cs") csSetup(ch);
  }

  const markSolved = (ch, ok, extra = {}) => store.update((s) => {
    const x = (s.code[ch.id] ||= { tries: 0 });
    x.tries = (x.tries || 0) + 1; x.t = Date.now(); x.code = editor.get(); Object.assign(x, extra);
    if (ok && !x.solved) { x.solved = true; }
  });

  async function runJs(btn, ch) {
    busy(btn, true, "Running");
    const out = await runJS(editor.get(), ch);
    busy(btn, false);
    if (out.compileError) { markSolved(ch, false); drawList(); $("#out").innerHTML = `<div class="callout warn"><strong>Could not run:</strong> ${esc(out.compileError)}</div>`; return; }
    const pass = out.results.filter((r) => r.ok).length, total = out.results.length, all = pass === total;
    markSolved(ch, all); drawList();
    $("#out").innerHTML = `<div class="callout ${all ? "" : "warn"}" style="${all ? "background:var(--moss-tint);border-color:var(--moss)" : ""}"><strong>${all ? "All tests passed." : `${pass} of ${total} tests passed.`}</strong> ${all ? `Now say the complexity out loud${ch.complexity ? ` (reference: ${esc(ch.complexity)})` : ""} and walk through edge cases.` : "Read the failing case below."}</div>
      <div style="margin-top:8px">${out.results.map((r, k) => `<div class="t-row"><span aria-hidden="true">${r.ok ? "✔" : "✘"}</span><div><strong>Test ${k + 1}${r.hidden ? " (hidden)" : ""}</strong>${r.ok || r.hidden ? "" : `<div class="mono small">input: ${esc(r.input)}<br>expected: ${esc(r.expected)}<br>got: ${esc(r.got)}</div>`}${!r.ok && r.hidden ? `<div class="small muted">Fails a hidden edge case. Think about empty input, duplicates, negatives.</div>` : ""}</div></div>`).join("")}</div>
      ${out.logs.length ? `<h4>console.log</h4><pre class="out">${esc(out.logs.join("\n"))}</pre>` : ""}
      ${!all && aiEnabled() ? `<button class="btn sm" id="why" style="margin-top:10px">Explain why it fails</button><div id="whyout"></div>` : ""}`;
    const why = $("#why");
    if (why) why.onclick = async () => { busy(why, true, "Thinking"); try { $("#whyout").innerHTML = `<div class="callout" style="margin-top:10px">${esc(await explainFailure(ch, editor.get(), out.results.filter((r) => !r.ok && !r.hidden).slice(0, 2)))}</div>`; } catch (e) { toast(e.message, true); } busy(why, false); };
  }

  const table = (r) => !r || !r.columns.length ? "<em>No rows</em>" : `<div class="sqlres"><table class="tbl"><thead><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${r.values.slice(0, 50).map((row) => `<tr>${row.map((v) => `<td>${v === null ? "<em>NULL</em>" : esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

  async function runSql(btn, ch) {
    busy(btn, true, "Running");
    let r;
    try { r = await runSQL(editor.get(), ch); } catch (e) { busy(btn, false); return ($("#out").innerHTML = `<div class="callout warn">${esc(e.message)}</div>`); }
    busy(btn, false);
    markSolved(ch, !!r.ok); drawList();
    if (r.error) return ($("#out").innerHTML = `<div class="callout warn"><strong>SQL error:</strong> ${esc(r.error)}</div>`);
    $("#out").innerHTML = `<div class="callout" style="${r.ok ? "background:var(--moss-tint);border-color:var(--moss)" : "background:var(--thread-tint);border-color:var(--thread)"}"><strong>${r.ok ? "Correct." : "Not matching the expected result."}</strong> ${r.ok ? "Explain why you chose this approach and how an index would help." : `${!r.sameCols ? "Check column names and order: they must match the task. " : ""}${!r.sameRows ? "Rows differ from the expected result." : ""}`}</div>
      <h4>Your result</h4>${table(r.got)}
      ${r.ok ? "" : `<button class="btn sm" id="exp" style="margin-top:10px">Show expected output</button><div id="expo"></div>`}`;
    const exp = $("#exp"); if (exp) exp.onclick = () => ($("#expo").innerHTML = `<h4>Expected</h4>${table(r.expected)}`);
  }

  function csSetup(ch) {
    const rub = $("#out");
    const draw = (review) => {
      rub.innerHTML = `<h3>Self-check against the rubric</h3>
        ${ch.rubric.map((r, k) => { const rv = review?.rubric?.[k]; return `<label style="font-weight:400;display:flex;gap:8px;margin-bottom:6px"><input type="checkbox" class="rk" ${rv?.pass ? "checked" : ""}> <span>${esc(r)}${rv ? ` <span class="small ${rv.pass ? "" : "muted"}">${rv.pass ? "(AI: met)" : "(AI: not met)"} ${esc(rv.note || "")}</span>` : ""}</span></label>`; }).join("")}
        ${review ? `<div class="callout" style="margin:10px 0"><strong>AI review: ${review.score}/10.</strong> ${esc(review.summary || "")}${review.bugs?.length ? `<br><strong>Bugs:</strong> ${esc(review.bugs.join("; "))}` : ""}${review.improvements?.length ? `<br><strong>Improve:</strong> ${esc(review.improvements.join("; "))}` : ""}</div>` : ""}
        <div class="row"><button class="btn primary" id="done">Save my result</button><span class="small muted" id="sc"></span></div>`;
      const upd = () => { const n = $$(".rk").filter((c) => c.checked).length; $("#sc").textContent = `${n}/${ch.rubric.length} criteria met (${Math.round((n / ch.rubric.length) * 10)}/10)`; };
      $$(".rk").forEach((c) => (c.onchange = upd)); upd();
      $("#done").onclick = () => { const n = $$(".rk").filter((c) => c.checked).length; const s10 = Math.round((n / ch.rubric.length) * 10); markSolved(ch, n / ch.rubric.length >= 0.75, { best: Math.max(s10, store.get().code[ch.id]?.best || 0) }); drawList(); toast(n / ch.rubric.length >= 0.75 ? "Marked complete" : "Saved. Meet at least 75% of the rubric to complete it."); };
    };
    draw();
    const rv = $("#review");
    if (rv) rv.onclick = async () => { busy(rv, true, "Reviewing"); try { draw(await reviewCode(ch, editor.get(), "C#")); } catch (e) { toast(e.message, true); } busy(rv, false); };
    const run = $("#runner");
    if (run) run.onclick = async () => {
      busy(run, true, "Running");
      try { const r = await runOnPiston(store.get().settings.pistonUrl, "csharp", editor.get()); toast(r.code === 0 ? "Ran successfully" : "Runner reported errors"); const pre = document.createElement("pre"); pre.className = "out"; pre.textContent = (r.stdout + r.stderr).trim() || "(no output)"; rub.prepend(pre); }
      catch (e) { toast(e.message, true); }
      busy(run, false);
    };
  }

  drawList();
  const wanted = ctx.params.get("id");
  const first = LANGS[lang].list.find((c) => c.id === wanted) || LANGS[lang].list.find((c) => !done(c.id)) || LANGS[lang].list[0];
  open(first);
  return () => { saveCode(); if (editor) editor.dispose(); };
}
