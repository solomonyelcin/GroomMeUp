// One front door for your own material. A file is read both ways (as an article and as questions),
// and the page recommends which fits, with the numbers behind it. You choose.
import { addArticle, importQuestions, store } from "../store.js";
import { buildQuestions } from "../import/build.js";
import { loadRemote, connected, publishDoc, fetchJson } from "../github.js";
import { fetchPage, htmlToArticle, getHelper, DEFAULT_HELPER } from "../import/web.js";
import { textToArticle, toMarkdown } from "../import/blocks.js";
import { fileToArticle, ARTICLE_TYPES } from "../import/article.js";
import { blocksToQA } from "../import/blocks.js";
import { parseFile, ACCEPT } from "../import/index.js";
import { putBlob, newBlobId } from "../imgstore.js";
import { esc, toast, $ } from "../ui.js";

const words = (t) => (String(t).match(/\S+/g) || []).length;
const blockWords = (blocks) => blocks.reduce((s, b) => s + words(b.text || (b.items || []).join(" ") || (b.rows || []).flat().join(" ")), 0);

// Decide what to suggest. Pure, so it is tested without a browser.
export function advise(res, art, hq = []) {
  // questions written as headings ("Question 3: ...") with their answers underneath are the most exact source
  const byHead = hq.length >= 3 && hq.length >= (res?.items || []).length;
  const items = byHead ? hq : res?.items || [], pend = res?.pending || [];
  const nQ = items.length, mcq = items.filter((i) => i.kind === "mcq").length;
  const answered = items.filter((i) => String(i.a || "").trim().length >= 15 || i.kind === "mcq").length;
  const total = Math.max(1, art ? blockWords(art.blocks) : words(res?.text || ""));
  const used = items.reduce((s, i) => s + words(i.q) + words(i.a) + (i.o ? i.o.reduce((a, o) => a + words(o), 0) : 0), 0);
  const coverage = Math.min(1, used / total), pct = Math.round(coverage * 100);
  const sheet = res?.ext === "xlsx" || res?.ext === "xlsm" || res?.ext === "csv" || res?.ext === "tsv";
  const facts = [];
  if (nQ) facts.push(`${nQ} question${nQ === 1 ? "" : "s"} with answers found${byHead ? " under headings" : ""}${mcq ? ` (${mcq} multiple choice)` : ""}, about ${pct}% of the text`);
  if (pend.length) facts.push(`${pend.length} question${pend.length === 1 ? "" : "s"} found without an answer`);
  if (!nQ && !pend.length) facts.push("no question and answer pattern found");
  let rec, why;
  if (nQ >= 5 && coverage >= 0.5 && answered / nQ >= 0.8) { rec = sheet ? "questions" : "both"; why = sheet ? "It is laid out as a question and answer sheet, so every row can become a question reliably." : "Most of it is clear question and answer pairs, which can be pulled out reliably. Keeping the whole document as an article as well loses nothing (tables, code and the text between questions stay readable)."; }
  else if (nQ >= 3 && coverage >= 0.2) { rec = "both"; why = `Only part of the file (${pct}%) is question and answer pairs. Keeping the whole thing as an article loses nothing, and the questions can be pulled out alongside it.`; }
  else if (pend.length >= 8 && nQ < 3) { rec = "questions"; why = "It is a list of questions without answers. You can have AI draft answers, which are marked as AI drafts."; }
  else { rec = "article"; why = sheet ? "A table or workbook without question and answer columns reads best as a table. Nothing is guessed." : "It reads as notes or explanation, not a repeating question and answer pattern. Extracting questions would be guesswork, so keep the exact text."; }
  return { rec, why, facts, nQ, pending: pend.length, pct, byHead };
}

export function view(root, ctx) {
  root.innerHTML = `
    <header class="page-head"><h1>Add material</h1>
      <p>Drop a file, paste text or give a web address. It is read in your browser, and the page suggests whether to keep it as an <strong>article</strong> to read, pull out <strong>questions</strong> to practise, or both. You decide.</p></header>
    <label class="drop" id="adrop" for="afile">
      <strong>Drop files here, or click to choose</strong>
      <span class="muted small">PDF, Word (.docx), Excel (.xlsx), CSV, text or markdown. Pictures of notes: use “Import from pictures” below.</span>
      <input id="afile" type="file" accept="${ACCEPT}" multiple hidden>
    </label>
    <section class="card" style="margin-top:14px"><div class="grid g2">
      <div><label for="ptext">Paste text</label><textarea id="ptext" style="min-height:84px" placeholder="Paste notes, questions and answers, or an article"></textarea><div class="row" style="margin-top:6px"><input id="ptitle" placeholder="Title (optional)" autocomplete="off" style="flex:1"><button class="btn" id="pgoText">Read it</button></div></div>
      <div><label for="purl">Web address</label><input id="purl" placeholder="https://…" inputmode="url" autocomplete="off"><div class="row" style="margin-top:6px"><button class="btn" id="pgoUrl">Fetch and preview</button><span class="small muted" id="purlMsg" aria-live="polite"></span></div><p class="small muted" style="margin:6px 0 0">Sites usually block direct reading, so the page goes through a small free helper (${getHelper() ? "yours, set in Settings" : "a public one until you set your own in Settings"}). It sees the address you give. Pages behind a login do not work.</p></div>
    </div></section>
    <p class="small muted" id="storeNote" style="margin:10px 0 0"></p>
    <div id="cards"></div>
    <section class="card" id="ready" style="margin-top:14px" hidden><h2 style="margin-top:0">Ready to add</h2><p class="small muted" style="margin-top:0">Questions that came with articles saved in your GitHub repository. One tap adds them to practice, quizzes and mock interviews on this device.</p><div id="readyBody"></div></section>
    <div id="importHost" style="margin-top:16px"></div>`;
  const cards = $("#cards"), importHost = $("#importHost");
  $("#storeNote").innerHTML = connected() ? "Everything you add here is saved in your GitHub repository, so it shows on all your devices. Nothing is kept on this device." : '<strong>GitHub is not connected</strong>, so what you add stays on this device only. <a href="#/settings?focus=gh">Connect it in Settings</a> to keep your library in your own repository.';
  let n = 0, cleanup = null;
  import("./import.js?v=" + encodeURIComponent(window.__V || "dev")).then(async (m) => { cleanup = (await m.view(importHost, { ...ctx, embedded: true })) || null; importHost.querySelectorAll("h1").forEach((h) => { const h2 = document.createElement("h2"); h2.innerHTML = h.innerHTML; h.replaceWith(h2); }); });

  loadRemote().then((rs) => { const pk = rs.filter((r) => r.questions); if (!pk.length || !$("#ready")) return; $("#ready").hidden = false; drawReady(pk); }).catch(() => {});
  function drawReady(pk) {
    const have = new Set((store.get().imports || []).map((i) => i.id));
    $("#readyBody").innerHTML = pk.map((r) => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><div><strong>${esc(r.title)}</strong><br><span class="small muted">${r.questionCount || ""} questions with answers</span></div>${have.has("pack-" + r.id) ? '<span class="tag">Added</span>' : `<button class="btn primary sm" data-pack="${esc(r.id)}">Add the questions</button>`}</div>`).join("");
    $("#readyBody").querySelectorAll("[data-pack]").forEach((b) => (b.onclick = async () => {
      const r = pk.find((x) => x.id === b.dataset.pack); b.disabled = true;
      try {
        const items = r.mine ? await fetchJson(r.questions) : await (await fetch(r.questions + "?v=" + (r.t || 0), { cache: "no-cache" })).json(), importId = "pack-" + r.id;
        const built = buildQuestions(items, { importId, existingCats: store.get().cats });
        const out = importQuestions({ questions: built.questions, cats: built.cats, seeds: built.seeds, record: { id: importId, name: r.title, kind: "Questions from an article" }, seedConfident: false, update: true });
        toast(`${out.added} question${out.added === 1 ? "" : "s"} added`); drawReady(pk);
      } catch (e) { b.disabled = false; toast("Could not add: " + e.message, true); }
    }));
  }

  async function handle(files) {
    for (const file of files) {
      const id = ++n, host = document.createElement("section");
      host.className = "card"; host.style.marginTop = "14px"; host.id = "ac" + id;
      host.innerHTML = `<span class="spinner"></span> Reading ${esc(file.name)} both ways...`; cards.prepend(host);
      if (/\.(png|jpe?g|webp|gif|bmp|heic|tiff?)$/i.test(file.name)) { host.innerHTML = `<div class="callout"><strong>${esc(file.name)} is a picture.</strong> Use “Import from pictures” below to read it or keep it as a picture.</div>`; continue; }
      const [art, res] = await Promise.allSettled([fileToArticle(file), parseFile(file)]);
      const A = art.status === "fulfilled" ? art.value : null, R = res.status === "fulfilled" ? res.value : null;
      if (!A && !R) { host.innerHTML = `<div class="callout warn"><strong>${esc(file.name)} could not be read.</strong> ${esc((art.reason || res.reason)?.message || "Unknown error")}</div>`; continue; }
      draw(host, file, A, R, A ? null : art.reason?.message);
    }
  }

  function draw(host, file, A, R, artErr) {
    const hq = A ? blocksToQA(A.blocks) : [], adv = advise(R, A, hq), useHead = adv.byHead;
    const canArticle = !!A && A.blocks.length > 0, canQ = useHead || !!R && (R.items.length > 0 || (R.pending || []).length > 0 || (R.text || "").length > 100);
    const rec = !canArticle ? "questions" : !canQ ? "article" : adv.rec;
    const opt = (v, title, sub, off) => `<label class="${rec === v ? "rec" : ""}"><input type="radio" name="m${host.id}" value="${v}" ${rec === v ? "checked" : ""} ${off ? "disabled" : ""}><span><strong>${title}</strong>${rec === v ? ' <span class="tag">Suggested</span>' : ""}<br><span class="small muted">${sub}</span></span></label>`;
    const s = A?.stats;
    host.innerHTML = `
      <div class="row between"><h2 style="margin:0">${esc(file.name)} <span class="tag">${esc(A?.kind || R?.kind || "")}</span></h2><button class="btn sm" data-x>Dismiss</button></div>
      <div class="advice ${canArticle || canQ ? "rec" : ""}" role="status" style="margin-top:10px">
        <p style="margin:0 0 6px"><strong>What I found:</strong> ${esc(adv.facts.join("; "))}.${s ? ` As an article: ${s.blocks} blocks, ${s.headings} heading${s.headings === 1 ? "" : "s"}, ${s.tables} table${s.tables === 1 ? "" : "s"}, ${s.lists} list${s.lists === 1 ? "" : "s"}${s.pictures ? `, ${s.pictures} picture${s.pictures === 1 ? "" : "s"}` : ""}.` : ""}</p>
        <p class="small" style="margin:0"><strong>Suggestion:</strong> ${esc(canArticle && canQ ? adv.why : !canArticle ? `The text could not be kept as an article${artErr ? " (" + artErr + ")" : ""}. Questions can still be pulled out.` : "No question pattern was found, so keep it as an article.")}</p>
        <p class="small muted" style="margin:6px 0 0">An article keeps your exact content (for PDFs the layout is rebuilt from the text, so check columns and tables). Questions depend on how clearly the file is laid out, so check the ones flagged.</p></div>
      ${(A?.warnings || []).map((w) => `<div class="callout warn" style="margin-top:8px">${esc(w)}</div>`).join("")}
      <div class="choice" role="radiogroup" aria-label="What to do with this file">
        ${opt("article", "Keep as an article", "Read it here in the same structure: headings, lists, tables, pictures.", !canArticle)}
        ${opt("questions", "Extract questions", "Review the questions found, then add them to practice and mock interviews. Quizzes only use questions that come with clear options and a marked answer.", !canQ)}
        ${opt("both", "Both", "Save the article and review its questions.", !canArticle || !canQ)}
      </div>
      ${canArticle ? `<div class="grid g2"><div><label for="t${host.id}">Article title</label><input id="t${host.id}" value="${esc(A.title)}"></div><div><label for="p${host.id}">Topic (optional)</label><input id="p${host.id}" placeholder="e.g. Caching" autocomplete="off"></div></div>
        ${A.keepOriginal ? `<label style="font-weight:400;display:block;margin-top:8px"><input type="checkbox" id="o${host.id}" checked> Also keep the original file, so I can open it exactly as it is (${connected() ? "kept in your GitHub repository" : "kept on this device only"}, ${(file.size / 1024 / 1024).toFixed(1)} MB)</label>` : ""}` : ""}
      <button class="btn primary" data-go style="margin-top:12px">Continue</button> <span class="small muted" data-msg aria-live="polite"></span>`;
    host.querySelector("[data-x]").onclick = () => host.remove();
    host.querySelector("[data-go]").onclick = async (e) => {
      const btn = e.currentTarget, mode = host.querySelector(`input[name=m${host.id}]:checked`)?.value || rec;
      btn.disabled = true; const msg = host.querySelector("[data-msg]");
      try {
        let saved = null;
        if (mode !== "questions") {
          const keep = host.querySelector("#o" + host.id)?.checked;
          const ttl = host.querySelector("#t" + host.id).value.trim() || A.title, topic = host.querySelector("#p" + host.id).value.trim() || ttl;
          const meta = { title: ttl, topic, blocks: A.blocks, source: { file: file.name, format: A.kind, size: file.size, warnings: A.warnings } };
          if (connected()) {
            const images = A.images.map((im) => ({ id: im.id, blob: new Blob([im.bytes], { type: im.type }), type: im.type }));
            const { entry } = await publishDoc({ ...meta, id: newBlobId(), t: Date.now() }, keep ? { blob: file, name: file.name, type: file.type || "application/octet-stream", size: file.size } : null, (t) => { msg.textContent = t; }, images);
            saved = { id: entry.id };
          } else {
            let orig = null;
            if (keep) { orig = { id: newBlobId(), name: file.name, type: file.type || "application/octet-stream", size: file.size, ext: A.ext }; await putBlob(orig.id, file); }
            const imgs = []; for (const im of A.images) { await putBlob(im.id, new Blob([im.bytes], { type: im.type })); imgs.push(im.id); }
            saved = addArticle({ ...meta, kind: "doc", original: orig, imageIds: imgs });
          }
          toast(connected() ? "Saved to your GitHub repository" : "Saved on this device");
        }
        let qdone = "";
        if (mode !== "article" && useHead) {
          const importId = "doc" + Date.now().toString(36), built = buildQuestions(hq, { importId, existingCats: store.get().cats });
          const out = importQuestions({ questions: built.questions, cats: built.cats, seeds: built.seeds, record: { id: importId, name: file.name, kind: "Questions from headings" }, seedConfident: false, update: true });
          qdone = `${out.added} question${out.added === 1 ? "" : "s"} added (${out.skipped || 0} already there). <a href="#/library?tab=questions&src=${importId}">See them</a>`;
        } else if (mode !== "article") { msg.textContent = "Reading questions below..."; await importHost.__readQuestions?.([file]); }
        host.querySelector(".choice").insertAdjacentHTML("afterend", `<div class="callout ok" style="margin-top:10px"><strong>Done.</strong> ${saved ? `<a href="#/library?tab=articles&id=${saved.id}">Open the article</a>${mode === "both" ? " · " : ""}` : ""}${qdone || (mode !== "article" ? "Review the questions in the card below." : "")}</div>`);
        host.querySelector("[data-go]").remove(); host.querySelectorAll("input,button[data-x]").forEach((x) => { if (x.type) x.disabled = true; });
        msg.textContent = "";
      } catch (err) { btn.disabled = false; msg.textContent = ""; toast("Could not save: " + err.message, true); }
    };
  }

  // pasted text and web addresses go through the same advice card as files
  const asResult = (name, kind, blocks, title) => ({ title, blocks, kind, warnings: [], images: [], keepOriginal: false, name, ext: "txt", size: 0, stats: { headings: blocks.filter((b) => b.type === "h" || b.type === "title").length, tables: blocks.filter((b) => b.type === "table").length, lists: blocks.filter((b) => b.type === "ul" || b.type === "ol").length, pictures: 0, blocks: blocks.length } });
  async function fromText(text, name, kind, title, blocks) {
    const id = ++n, host = document.createElement("section"); host.className = "card"; host.style.marginTop = "14px"; host.id = "ac" + id; cards.prepend(host);
    const file = new File([text], name.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80) + ".txt", { type: "text/plain" });
    const A = asResult(file.name, kind, blocks, title), R = await parseFile(file).catch(() => null); A.size = file.size;
    draw(host, file, A, R);
  }
  $("#pgoText").onclick = async () => {
    const text = $("#ptext").value; if (text.trim().length < 20) return toast("Paste some text first.", true);
    const md = /(^|\n)#{1,6}\s|\*\*|\n\s*\|.*\|\s*\n/.test(text), title = $("#ptitle").value.trim() || (text.trim().split("\n")[0] || "Pasted text").replace(/^#+\s*/, "").slice(0, 70);
    const blocks = textToArticle(text, { markdown: md }); if (!blocks.some((b) => b.type === "title")) blocks.unshift({ type: "title", text: title.replace(/([\\*`\[\]~])/g, "\\$1") });
    await fromText(text, title, "Pasted text", title, blocks); $("#ptext").value = ""; $("#ptitle").value = "";
  };
  $("#pgoUrl").onclick = async (e) => {
    const btn = e.currentTarget, m = $("#purlMsg"), addr = $("#purl").value.trim(); if (!addr) return toast("Enter a web address.", true);
    btn.disabled = true; m.textContent = "Fetching…";
    try {
      const r = await fetchPage(addr);
      if (r.kind === "file") { m.textContent = ""; await handle([new File([r.blob], r.name, { type: r.blob.type })]); }
      else {
        const { title, blocks } = htmlToArticle(r.text, r.url); if (blocks.length < 2) throw new Error("No readable text was found on that page.");
        const host = new URL(r.url).hostname.replace(/^www\./, "");
        await fromText(toMarkdown(blocks), title || host, "Web page (" + host + ")", title || host, blocks);
      }
      m.textContent = ""; $("#purl").value = "";
    } catch (err) { m.textContent = ""; toast(err.message, true); }
    btn.disabled = false;
  };

  const drop = $("#adrop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handle([...(e.dataTransfer?.files || [])]));
  $("#afile").onchange = (e) => { handle([...e.target.files]); e.target.value = ""; };
  return () => { try { cleanup?.(); } catch { /* ignore */ } };
}
void ARTICLE_TYPES;
