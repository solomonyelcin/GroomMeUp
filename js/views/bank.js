import { store, allQuestions, lastScores, isDue, isBrokenMcq, removeBroken, markStudy, toggleStar, setNote, updateQuestion, deleteQuestion } from "../store.js";
import { CATEGORIES } from "../data/index.js";
import { generateQuestions, aiEnabled } from "../ai.js";
import { esc, rich, scoreBadge, toast, busy, $, $$ } from "../ui.js";
import { isBogusTopic } from "../import/clean.js";

const filt = { text: "", cat: "all", diff: 0, status: "all", src: "", kind: "all", ids: null, sort: "topic" };
const readMode = () => { try { return localStorage.getItem("groommeup.read") === "1"; } catch { return false; } };
const revealed = new Set();
const setReadMode = (v) => { try { localStorage.setItem("groommeup.read", v ? "1" : "0"); } catch { /* ignore */ } };
let shown = 40;
let rank = new Map(), idx = 0, curId = null;
const shuffleRank = (q) => { if (!rank.has(q.id)) rank.set(q.id, Math.random()); return rank.get(q.id); };
const isPhone = () => window.matchMedia("(max-width: 860px)").matches;
const getView = () => { try { return localStorage.getItem("groommeup.bankview") || (isPhone() ? "one" : "list"); } catch { return isPhone() ? "one" : "list"; } };
const setView = (v) => { try { localStorage.setItem("groommeup.bankview", v); } catch { /* ignore */ } };
const canSpeak = () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
const plain = (t) => String(t || "").replace(/`/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

export function view(root, ctx) {
  if (ctx.params.get("cat")) filt.cat = ctx.params.get("cat");
  if (ctx.params.has("src")) { filt.src = ctx.params.get("src"); filt.cat = "all"; }
  filt.ids = ctx.params.get("ids") ? new Set(ctx.params.get("ids").split(",")) : null;
  const onKey = (e) => {
    if (getView() !== "one" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1);
  };
  document.addEventListener("keydown", onKey);
  root.innerHTML = `
    <header class="page-head" id="bankHead">
      <h1>Question bank</h1>
      <p>Search, filter and read questions with their answers. Pick a topic, or open Options for more filters.</p>
    </header>
    <div id="broken"></div>
    <div id="idnote"></div>
    <div class="bank-tools">
      <input id="s" type="search" placeholder="Search questions and answers" aria-label="Search questions" value="${esc(filt.text)}">
      <select id="so" aria-label="Sort questions"><option value="topic">Sort: topic order</option><option value="az">Sort: A to Z</option><option value="weak">Sort: weakest first</option><option value="hard">Sort: hardest first</option><option value="easy">Sort: easiest first</option><option value="new">Sort: newest added</option><option value="shuffle">Sort: shuffled</option></select>
      <div class="seg" role="group" aria-label="View"><button id="vl" aria-pressed="false">List</button><button id="v1" aria-pressed="false">One by one</button></div>
    </div>
    <div class="bank-bar row between"><span id="count" class="small muted" aria-live="polite"></span><button class="btn sm" id="xall" type="button">Expand all</button></div>
    <details class="card filters" id="filters">
      <summary id="fsum">Options and filters</summary>
      <div class="row" style="margin:12px 0 4px;gap:8px">
        <button class="btn sm" id="shuf">Shuffle</button>
        <label class="read-toggle"><input type="checkbox" id="rd"> Show answers</label>
      </div>
      <div class="grid g3">
        <div><label for="d">Difficulty</label><select id="d"><option value="0">Any</option><option value="1">Warm-up</option><option value="2">Core</option><option value="3">Senior / hard</option></select></div>
        <div><label for="st">Status</label><select id="st"><option value="all">All</option><option value="new">Not tried</option><option value="weak">Weak or to revise</option><option value="due">Due for review</option><option value="strong">Strong (8+)</option><option value="star">Starred</option><option value="note">With my note</option></select></div>
      </div>
      <div class="grid g3" style="margin-top:12px">
        <div><label for="tp">Topic</label><select id="tp"></select></div>
        <div><label for="sc">Source</label><select id="sc"></select></div>
        <div><label for="kd">Type</label><select id="kd"><option value="all">Any</option><option value="concept">Concept</option><option value="scenario">Scenario-based</option><option value="mcq">Multiple choice</option></select></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn sm" id="add">Add your own question</button><button class="btn sm" id="gen">Generate with AI</button></div>
    </details>
    <div class="bank-layout"><aside class="trail" id="trail" aria-label="Topics"></aside>
      <div class="bank-main"><div id="forms"></div><div id="list"></div></div></div>
    <div class="focusbar" id="focusbar" hidden></div>
  `;
  $("#rd").checked = readMode();
  $("#d").value = String(filt.diff); $("#st").value = filt.status; $("#so").value = filt.sort;
  let cur = []; // the questions currently listed, in order

  const checkBroken = () => {
    const n = allQuestions().filter(isBrokenMcq).length;
    const badTopics = Object.values(CATEGORIES).filter((v) => v.mine && isBogusTopic(v.name)).map((v) => v.name);
    $("#idnote").dataset.bad = badTopics.length;
    $("#broken").innerHTML = badTopics.length ? `<div class="callout warn" style="margin-bottom:12px"><strong>"${esc(badTopics[0])}"${badTopics.length > 1 ? ` and ${badTopics.length - 1} more` : ""} ${badTopics.length > 1 ? "are" : "is"} a page header, not a topic.</strong> <a href="#/import">Open Add my questions</a> and use Rename / merge under Topics to move those questions to the right topic, or import the file again (the importer now ignores page headers).</div>` : n ? `<div class="callout warn" style="margin-bottom:12px"><strong>${n} imported questions were read wrongly</strong> (options mixed into the answer) by an older version of the importer. Remove them, then import your file again in <a href="#/import">Add my questions</a>.<div class="row" style="margin-top:8px"><button class="btn sm primary" id="rmbad">Remove these ${n}</button></div></div>` : "";
    const b = $("#rmbad"); if (b) b.onclick = () => { const k = removeBroken(); toast(`${k} removed. Now import your file again.`); checkBroken(); list(); };
  };
  const draw = () => {
    checkBroken();
    const mine = Object.entries(CATEGORIES).filter(([, v]) => v.mine);
    const opt = ([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`;
    $("#tp").innerHTML = `<option value="all">All topics</option><optgroup label="Built-in topics">${Object.entries(CATEGORIES).filter(([, v]) => !v.mine).map(([k, v]) => opt([k, v.name])).join("")}<option value="custom">My questions</option></optgroup>${mine.length ? `<optgroup label="Your material">${mine.map(([k, v]) => opt([k, v.name])).join("")}</optgroup>` : ""}`;
    $("#tp").value = filt.cat;
    if ($("#tp").value !== filt.cat) { filt.cat = "all"; $("#tp").value = "all"; }
    const imps = store.get().imports;
    $("#sc").innerHTML = `<option value="">All sources</option><option value="builtin">Built-in only</option>${imps.length ? `<option value="mine">All my imports</option>` : ""}${imps.map((i) => opt([i.id, i.name])).join("")}`;
    $("#sc").value = filt.src; if ($("#sc").value !== filt.src) { filt.src = ""; $("#sc").value = ""; }
    $("#kd").value = filt.kind;
    list();
  };

  function go(d) {
    if (!cur.length) return;
    const next = idx + d; if (next < 0 || next >= cur.length) return;
    stopSpeak(); idx = next; curId = cur[idx].id; list(true);
  }
  function stopSpeak() { if (canSpeak()) speechSynthesis.cancel(); }

  function list(scrollToCard) {
    const last = lastScores(), s = store.get();
    const t = filt.text.trim().toLowerCase();
    const pass = (q, skipCat) => {
      if (filt.ids && !filt.ids.has(q.id)) return false;
      if (!skipCat && filt.cat !== "all" && q.c !== filt.cat) return false;
      if (filt.src === "builtin" && (q.imported || q.custom)) return false;
      if (filt.src === "mine" && !q.imported) return false;
      if (filt.src && filt.src !== "builtin" && filt.src !== "mine" && q.src !== filt.src) return false;
      if (filt.kind !== "all" && (q.kind || "concept") !== filt.kind) return false;
      if (filt.diff && q.d !== filt.diff) return false;
      const l = last.get(q.id);
      if (filt.status === "new" && l) return false;
      if (filt.status === "weak" && !(l && l.score < 6)) return false;
      if (filt.status === "strong" && !(l && l.score >= 8)) return false;
      if (filt.status === "due" && !(l && isDue(q.id))) return false;
      if (filt.status === "star" && !(s.stars || {})[q.id]) return false;
      if (filt.status === "note" && !(s.notes || {})[q.id]) return false;
      if (t && !(q.q + " " + q.a + " " + (q.o || []).join(" ") + " " + q.kp.map((k) => k[0]).join(" ")).toLowerCase().includes(t)) return false;
      return true;
    };
    const qs = allQuestions().filter((q) => pass(q, false));
    const all = allQuestions();
    const studiedAll = all.filter((q) => last.has(q.id)).length;
    const studiedHere = qs.filter((q) => last.has(q.id)).length;
    const nf = ["text", "cat", "diff", "status", "src", "kind"].filter((k) => filt[k] && filt[k] !== "all" && filt[k] !== 0).length;
    $("#fsum").textContent = nf ? `Options and filters (${nf} active)` : "Options and filters";
    $("#count").innerHTML = `<b>${studiedAll} of ${all.length}</b> studied` + (qs.length !== all.length ? ` · showing ${qs.length} (${studiedHere} studied)` : "");
    $("#idnote").innerHTML = filt.ids ? `<div class="callout" style="margin-bottom:10px">Showing the ${qs.length} questions matched to your job description. <a href="#/bank">Show all</a></div>` : "";
    {
      const pos = new Map(allQuestions().map((q, i) => [q.id, i])), nm = (q) => (CATEGORIES[q.c]?.name || "My questions");
      const sc = (q) => { const l = last.get(q.id); return l ? l.score : 5.5; };
      const by = {
        topic: (a, b) => nm(a).localeCompare(nm(b)) || pos.get(a.id) - pos.get(b.id),
        az: (a, b) => a.q.localeCompare(b.q),
        weak: (a, b) => sc(a) - sc(b) || pos.get(a.id) - pos.get(b.id),
        hard: (a, b) => (b.d || 2) - (a.d || 2) || pos.get(a.id) - pos.get(b.id),
        easy: (a, b) => (a.d || 2) - (b.d || 2) || pos.get(a.id) - pos.get(b.id),
        new: (a, b) => pos.get(b.id) - pos.get(a.id),
        shuffle: (a, b) => shuffleRank(a) - shuffleRank(b),
      };
      qs.sort(by[filt.sort] || by.topic);
      // topic sidebar: counts with every filter except the topic itself
      const cnt = new Map(); let tot = 0;
      for (const q of allQuestions()) if (pass(q, true)) { cnt.set(q.c, (cnt.get(q.c) || 0) + 1); tot++; }
      const items = [...cnt].sort((a, b) => b[1] - a[1] || nm({ c: a[0] }).localeCompare(nm({ c: b[0] })));
      $("#trail").innerHTML = `<div class="trail-h">Topics</div><button class="trail-item" data-cat="all" aria-pressed="${filt.cat === "all"}"><span>All topics</span><b>${tot}</b></button>` + items.map(([k, n]) => `<button class="trail-item" data-cat="${esc(k)}" aria-pressed="${filt.cat === k}"><span class="dot" style="background:${(CATEGORIES[k] || {}).color || "#546178"}"></span><span class="trail-n">${esc(nm({ c: k }))}</span><b>${n}</b></button>`).join("");
      $$("#trail [data-cat]").forEach((b) => (b.onclick = () => { filt.cat = b.dataset.cat; $("#tp").value = filt.cat; shown = 40; idx = 0; curId = null; list(); }));
    }
    cur = qs;
    const view1 = getView() === "one";
    $("#vl").setAttribute("aria-pressed", String(!view1)); $("#v1").setAttribute("aria-pressed", String(view1));
    root.classList.toggle("bank-one", view1); $("#xall").hidden = view1;
    document.body.classList.toggle("focus-mode", view1 && qs.length > 0);
    const diffName = ["", "Warm-up", "Core", "Senior"];
    const meta = (q) => {
      const cat = CATEGORIES[q.c] || { name: "My questions", color: "#546178" };
      return { cat, sub: `${esc(cat.name)} / ${q.imported ? (q.sub ? esc(q.sub) : "Imported") : diffName[q.d] || "Core"}${q.kind === "scenario" ? " / Scenario" : ""}` };
    };
    const body = (q) => {
      const show = readMode() || revealed.has(q.id);
      const ai = show && q.ai ? `<p class="callout warn small" style="margin:0 0 8px"><strong>AI draft answer.</strong> Written by AI from your question, so double-check it before relying on it.</p>` : "";
      const reveal = show ? "" : `<div class="row" style="margin-top:12px"><button class="btn primary sm" data-rev="${q.id}">Show answer</button></div>`;
      if (q.o) return `<h4>Options</h4><div class="mcq-opts">${q.o.map((o, k) => `<div class="mcq-opt ${show && k === q.ans ? "right" : ""}"><b>${"ABCDE"[k]}</b><span>${esc(o)}</span>${show && k === q.ans ? `<em>correct</em>` : ""}</div>`).join("")}</div>${reveal}${show && q.e ? `<div class="model" style="margin-top:8px">${rich(q.e)}</div>` : ""}${ai}`;
      if (!show) return reveal;
      return `${ai}<h4>Model answer</h4><div class="model">${rich(q.a)}</div><h4>Points interviewers listen for</h4><ul class="kp">${q.kp.map((k) => `<li>${esc(k[0])}</li>`).join("")}</ul>${q.f && q.f.length ? `<h4>Likely follow-ups</h4><ul class="kp">${q.f.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}`;
    };
    const actions = (q) => {
      const starred = !!(s.stars || {})[q.id], note = (s.notes || {})[q.id] || "";
      return `<div class="q-actions" data-q="${q.id}">
        <button class="btn sm good" data-mark="know">✓ I know this</button><button class="btn sm" data-mark="revise">↻ Revise again</button>
        <button class="btn sm" data-star aria-pressed="${starred}">${starred ? "★ Starred" : "☆ Star"}</button>${canSpeak() ? `<button class="btn sm" data-speak>🔊 Listen</button>` : ""}<button class="btn sm" data-copy>⧉ Copy</button>${q.imported || q.custom ? `<button class="btn sm" data-edit>✎ Edit</button><button class="btn sm danger" data-del>🗑 Delete</button>` : ""}</div>
        <details class="note" ${note ? "open" : ""}><summary>${note ? "My note" : "Add a note"}</summary><textarea data-note="${q.id}" placeholder="Your own words, a gotcha, an example from work…" maxlength="2000">${esc(note)}</textarea></details>`;
    };
    if (!qs.length) { $("#list").innerHTML = `<div class="card muted">No questions match. Clear a filter or add your own.</div>`; $("#focusbar").hidden = true; return; }
    if (view1) {
      if (curId) { const at = qs.findIndex((q) => q.id === curId); if (at >= 0) idx = at; }
      if (idx >= qs.length) idx = qs.length - 1; if (idx < 0) idx = 0;
      const q = qs[idx]; curId = q.id;
      const m = meta(q), l = last.get(q.id);
      const pager = `<div class="pager"><button class="btn" data-go="-1" ${idx === 0 ? "disabled" : ""}>◀ Previous</button><span class="pos">${idx + 1} / ${qs.length}</span><button class="btn primary" data-go="1" ${idx >= qs.length - 1 ? "disabled" : ""}>Next ▶</button></div>`;
      $("#list").innerHTML = `<div class="one-card" id="oneCard"><div class="row between"><span class="small muted"><b>${idx + 1} / ${qs.length}</b> · <span class="dot" style="background:${m.cat.color}"></span> ${m.sub}</span>${l ? scoreBadge(l.score) : ""}</div><h2>${rich(q.q)}</h2><div>${body(q)}</div>${actions(q)}</div><div class="pager-desk">${pager}</div>`;
      const fb = $("#focusbar"); fb.hidden = false; fb.innerHTML = pager;
      if (scrollToCard) $("#oneCard").scrollIntoView({ block: "start" });
      wire(); return;
    }
    $("#focusbar").hidden = true;
    $("#list").innerHTML = qs.slice(0, shown).map((q) => {
      const m = meta(q), l = last.get(q.id);
      return `<details class="q-card" data-id="${q.id}" style="border-left:4px solid ${m.cat.color}" ${readMode() || q.o ? "open" : ""}>
        <summary class="q-head"><span class="dot" style="background:${m.cat.color};margin-top:8px" title="${esc(m.cat.name)}"></span>
          <span class="q-title">${rich(q.q)}<br><span class="small muted">${m.sub}</span></span>${scoreBadge(l ? l.score : null)}</summary>
        <div class="q-body">${body(q)}${actions(q)}</div></details>`;
    }).join("") + (qs.length > shown ? `<button class="btn" id="more" style="margin-top:12px">Show ${Math.min(40, qs.length - shown)} more</button>` : "");
    const more = $("#more"); if (more) more.onclick = () => { shown += 40; list(); };
    wire();
  }

  function wire() {
    $$("[data-rev]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); revealed.add(b.dataset.rev); list(); }));
    $$("[data-go]").forEach((b) => (b.onclick = () => go(+b.dataset.go)));
    $$(".q-actions").forEach((box) => {
      const q = cur.find((x) => x.id === box.dataset.q); if (!q) return;
      box.querySelectorAll("[data-mark]").forEach((b) => (b.onclick = () => {
        markStudy(q, b.dataset.mark === "know");
        toast(b.dataset.mark === "know" ? "Marked as known" : "Added to revise: it will come back soon");
        if (getView() === "one" && idx < cur.length - 1) go(1); else list();
      }));
      const st = box.querySelector("[data-star]"); if (st) st.onclick = () => { const on = toggleStar(q.id); st.setAttribute("aria-pressed", String(on)); st.textContent = on ? "★ Starred" : "☆ Star"; };
      const cp = box.querySelector("[data-copy]"); if (cp) cp.onclick = async () => {
        const txt = plain(q.q) + (q.o ? "\n" + q.o.map((o, k) => `${"ABCDE"[k]}) ${o}`).join("\n") + `\nAnswer: ${"ABCDE"[q.ans]}` : "\n" + plain(q.a));
        try { await navigator.clipboard.writeText(txt); toast("Copied"); } catch { toast("Could not copy on this browser", true); }
      };
      const ed = box.querySelector("[data-edit]"); if (ed) ed.onclick = () => openEdit(q);
      const dl = box.querySelector("[data-del]"); if (dl) dl.onclick = () => { if (!confirm("Delete this question? Your practice history for it is removed too.")) return; deleteQuestion(q.id); curId = null; toast("Deleted"); draw(); };
      const sp = box.querySelector("[data-speak]"); if (sp) sp.onclick = () => {
        if (speechSynthesis.speaking) { stopSpeak(); sp.textContent = "🔊 Listen"; return; }
        const show = readMode() || revealed.has(q.id);
        const text = plain(q.q) + ". " + (q.o ? q.o.map((o, k) => `Option ${"ABCDE"[k]}. ${o}.`).join(" ") + (show ? ` The correct answer is option ${"ABCDE"[q.ans]}. ${plain(q.e)}` : "") : (show ? plain(q.a) : ""));
        const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.onend = () => { sp.textContent = "🔊 Listen"; };
        speechSynthesis.speak(u); sp.textContent = "⏹ Stop";
      };
    });
    $$("[data-note]").forEach((ta) => (ta.oninput = () => { clearTimeout(ta._t); ta._t = setTimeout(() => setNote(ta.dataset.note, ta.value), 500); }, ta.onblur = () => setNote(ta.dataset.note, ta.value)));
  }

  function openEdit(q) {
    const topics = Object.entries(CATEGORIES).filter(([k, v]) => v.mine || k === "custom");
    const dlg = document.createElement("dialog"); dlg.className = "card"; dlg.style.cssText = "max-width:680px;width:94vw;max-height:90vh;overflow:auto;padding:16px";
    dlg.innerHTML = `<h2 style="margin-top:0">Edit question</h2>
      <div class="field"><label for="eq">Question</label><textarea id="eq" style="min-height:70px">${esc(q.q)}</textarea></div>
      ${q.o ? `<div class="field"><label for="ee">Explanation</label><textarea id="ee" style="min-height:80px">${esc(q.e || "")}</textarea></div><p class="small muted">The options and the correct answer cannot be edited here.</p>` : `<div class="field"><label for="ea">Answer</label><textarea id="ea" style="min-height:140px">${esc(q.a || "")}</textarea></div>`}
      <div class="field"><label for="et">Topic</label><input id="et" list="etl" value="${esc(CATEGORIES[q.c]?.name || "My questions")}"><datalist id="etl">${topics.map(([, v]) => `<option value="${esc(v.name)}">`).join("")}</datalist></div>
      <div class="row"><button class="btn primary" id="esave">Save</button><button class="btn" id="ecancel">Cancel</button></div>`;
    document.body.appendChild(dlg); dlg.showModal();
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.querySelector("#ecancel").onclick = close; dlg.addEventListener("cancel", () => dlg.remove());
    dlg.querySelector("#esave").onclick = () => {
      const nq = dlg.querySelector("#eq").value.trim(); if (!nq) return toast("The question cannot be empty", true);
      const t = dlg.querySelector("#et").value.trim();
      updateQuestion(q.id, { q: nq, a: dlg.querySelector("#ea")?.value, e: dlg.querySelector("#ee")?.value, topic: t && t !== (CATEGORIES[q.c]?.name || "") ? t : "" });
      close(); toast("Saved"); draw();
    };
  }

  // swipe left / right on the question card (phone)
  let sx = 0, sy = 0;
  root.addEventListener("touchstart", (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (getView() !== "one" || e.target.closest("textarea,input,select,pre")) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) go(dx < 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener("click", focusbarClick);
  function focusbarClick(e) { const b = e.target.closest("#focusbar [data-go]"); if (b) go(+b.dataset.go); }

  $("#vl").onclick = () => { setView("list"); stopSpeak(); list(); };
  $("#v1").onclick = () => { setView("one"); list(true); };
  $("#shuf").onclick = () => { rank = new Map(); filt.sort = "shuffle"; $("#so").value = "shuffle"; idx = 0; curId = null; shown = 40; list(); };
  $("#so").onchange = (e) => { filt.sort = e.target.value; shown = 40; idx = 0; curId = null; list(); };
  $("#xall").onclick = (e) => { const open = e.target.textContent === "Expand all"; $$(".q-card").forEach((d) => (d.open = open)); e.target.textContent = open ? "Collapse all" : "Expand all"; };
  $("#rd").onchange = (e) => { revealed.clear(); setReadMode(e.target.checked); list(); };
  const reset = () => { shown = 40; idx = 0; curId = null; list(); };
  $("#tp").onchange = (e) => { filt.cat = e.target.value; reset(); };
  $("#sc").onchange = (e) => { filt.src = e.target.value; reset(); };
  $("#kd").onchange = (e) => { filt.kind = e.target.value; reset(); };
  $("#s").oninput = (e) => { filt.text = e.target.value; reset(); };
  $("#d").onchange = (e) => { filt.diff = +e.target.value; reset(); };
  $("#st").onchange = (e) => { filt.status = e.target.value; reset(); };

  $("#add").onclick = () => {
    $("#forms").innerHTML = `<div class="card"><h3>Add a question</h3>
      <div class="field"><label for="nq">Question</label><textarea id="nq" style="min-height:70px"></textarea></div>
      <div class="field"><label for="na">Your model answer (what a strong answer says)</label><textarea id="na" style="min-height:100px"></textarea></div>
      <div class="field"><label for="nk">Key points, one per line (used for scoring)</label><textarea id="nk" style="min-height:80px" placeholder="idempotency&#10;retry with backoff"></textarea></div>
      <div class="row"><button class="btn primary" id="save">Save question</button><button class="btn" id="cancel">Cancel</button></div></div>`;
    $("#cancel").onclick = () => ($("#forms").innerHTML = "");
    $("#save").onclick = () => {
      const q = $("#nq").value.trim(), a = $("#na").value.trim();
      if (!q || !a) return toast("Add a question and a model answer", true);
      const kps = $("#nk").value.split("\n").map((x) => x.trim()).filter(Boolean);
      const kw = (s) => [...new Set(s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 5))].slice(0, 4);
      const kp = (kps.length ? kps : [a.split(/[.!?]/)[0]]).map((k) => [k, ...kw(k)]);
      store.update((s) => s.custom.push({ id: "c" + Date.now().toString(36), c: "custom", d: 2, custom: true, q, a, kp, f: [] }));
      $("#forms").innerHTML = ""; toast("Question saved"); filt.cat = "custom"; filt.src = ""; draw();
    };
  };

  $("#gen").onclick = () => {
    if (!aiEnabled()) return toast("Turn on a free AI provider in Settings to generate questions", true);
    $("#forms").innerHTML = `<div class="card"><h3>Generate fresh questions</h3>
      <div class="grid g3"><div class="field"><label for="gt">Topic</label><input id="gt" type="text" placeholder="e.g. Kubernetes autoscaling for .NET APIs"></div>
      <div class="field"><label for="gn">How many</label><select id="gn"><option>3</option><option selected>5</option><option>8</option></select></div>
      <div class="field"><label for="gl">Level</label><select id="gl"><option value="senior">Senior</option><option value="mid">Mid-level</option></select></div></div>
      <div class="row"><button class="btn primary" id="go">Generate</button><button class="btn" id="cancel">Cancel</button></div></div>`;
    $("#cancel").onclick = () => ($("#forms").innerHTML = "");
    $("#go").onclick = async (e) => {
      const topic = $("#gt").value.trim(); if (!topic) return toast("Enter a topic", true);
      const btn = e.currentTarget;
      busy(btn, true, "Generating");
      try {
        const qs = await generateQuestions(topic, +$("#gn").value, $("#gl").value);
        if (!qs.length) throw new Error("The AI returned no usable questions. Try again.");
        store.update((s) => s.custom.push(...qs));
        toast(`${qs.length} questions added to "My questions"`); $("#forms").innerHTML = ""; filt.cat = "custom"; draw();
      } catch (err) { toast(err.message, true); busy(btn, false); }
    };
  };

  draw();
  return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", focusbarClick); document.body.classList.remove("focus-mode"); stopSpeak(); };
}
