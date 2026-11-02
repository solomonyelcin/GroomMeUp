// Search over questions: plain keyword search, plus an "extended" mode where the connected AI adds related terms.
import { allQuestions } from "./store.js";
import { CATEGORIES } from "./data/index.js";
import { chat, parseJSON, aiEnabled } from "./ai.js";
import { esc, $ } from "./ui.js";

const STOP = new Set("the a an of to in on for and or is are what how why when which who do does can with vs versus about".split(" "));
const toks = (s) => (String(s || "").toLowerCase().match(/[a-z0-9#+.]{2,}/g) || []).filter((w) => !STOP.has(w));

export function searchPool(query, pool = allQuestions(), extra = []) {
  const words = toks(query), ex = toks(extra.join(" ")).filter((w) => !words.includes(w));
  const phrase = String(query || "").trim().toLowerCase();
  if (!words.length) return [];
  const out = [];
  for (const q of pool) {
    const head = q.q.toLowerCase(), topic = (CATEGORIES[q.c]?.name || "").toLowerCase();
    const body = (String(q.a || "") + " " + (q.o || []).join(" ") + " " + (q.kp || []).map((k) => k[0]).join(" ")).toLowerCase();
    let sc = 0, hit = 0;
    for (const w of words) {
      let s = 0; if (head.includes(w)) s += 4; if (topic.includes(w)) s += 2; if (body.includes(w)) s += 1;
      if (s) hit++; sc += s;
    }
    if (words.length > 1 && hit < Math.ceil(words.length / 2)) continue; // most words must appear
    for (const w of ex) { if (head.includes(w)) sc += 1.5; else if (body.includes(w)) sc += 0.5; }
    if (phrase.length > 3 && (head.includes(phrase) || body.includes(phrase))) sc += 5;
    if (sc > 0 && hit > 0) out.push({ q, score: sc });
  }
  return out.sort((a, b) => b.score - a.score);
}

export async function aiRelatedTerms(query) {
  const sys = `You help search a bank of software interview questions. Given a search phrase, return related technical terms, synonyms, abbreviations, and neighbouring concepts a good answer would involve (6 to 12 short terms, lowercase).
Return ONLY JSON: {"terms":[string]}.`;
  const d = parseJSON(await chat(sys, query.slice(0, 300), { json: true, temperature: 0 }));
  return (Array.isArray(d) ? d : d.terms || []).map((t) => String(t).toLowerCase().trim()).filter((t) => t && t.length < 40).slice(0, 12);
}

// Draws a search box into `el`. pool(): the questions to search. ext: show the AI "extended" option.
export function mountSearch(el, { pool = allQuestions, title = "Search", placeholder = "e.g. saga, OnPush, deadlock", ext = true } = {}) {
  const id = "s" + Math.random().toString(36).slice(2, 7);
  const canAI = ext && aiEnabled();
  el.innerHTML = `<div class="row" style="gap:8px;align-items:flex-end"><div style="flex:1;min-width:180px"><label for="${id}q">${esc(title)}</label><input id="${id}q" type="search" placeholder="${esc(placeholder)}" autocomplete="off"></div>
    ${canAI ? `<button class="btn" id="${id}x" title="Ask the AI for related terms, then search with them too">Extended search (AI)</button>` : ""}</div>
    ${ext && !canAI ? `<p class="small muted" style="margin:4px 0 0">Connect a free AI in Settings to also search by related terms and meaning.</p>` : ""}
    <div id="${id}r" aria-live="polite" style="margin-top:8px"></div>`;
  const input = $("#" + id + "q", el), out = $("#" + id + "r", el);
  const show = (hits, note = "") => {
    if (!input.value.trim()) { out.innerHTML = ""; return; }
    if (!hits.length) { out.innerHTML = `<p class="muted small">No questions match.${canAI ? " Try Extended search (AI)." : ""}</p>`; return; }
    const ids = hits.map((h) => h.q.id).map(encodeURIComponent).join(",");
    out.innerHTML = `${note}<p class="small muted" style="margin:0 0 6px">${hits.length} match${hits.length === 1 ? "" : "es"}${hits.length > 8 ? ", showing the best 8" : ""}. <a href="#/bank?ids=${ids}">Open all in Browse</a> · <a href="#/practice?ids=${ids}">Practise these</a></p>
      ${hits.slice(0, 8).map((h) => `<a class="sr-hit" href="#/bank?ids=${encodeURIComponent(h.q.id)}" style="display:block;padding:7px 0;border-bottom:1px dashed var(--line);color:inherit;text-decoration:none"><strong>${esc(h.q.q.length > 140 ? h.q.q.slice(0, 140) + "…" : h.q.q)}</strong><br><span class="small muted">${esc(CATEGORIES[h.q.c]?.name || "My questions")}</span></a>`).join("")}`;
  };
  let t = null;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => show(searchPool(input.value, pool())), 150); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && canAI) { e.preventDefault(); extended(); } });
  async function extended() {
    const q = input.value.trim(); if (!q) { input.focus(); return; }
    const b = $("#" + id + "x", el); b.disabled = true; const old = b.textContent; b.textContent = "Searching...";
    try {
      const terms = await aiRelatedTerms(q);
      show(searchPool(q, pool(), terms), terms.length ? `<p class="small" style="margin:0 0 6px">Also searched for: ${terms.map((x) => `<span class="tag">${esc(x)}</span>`).join(" ")}<br><span class="muted">Your search words were sent to your AI provider.</span></p>` : "");
    } catch (e) {
      show(searchPool(q, pool()), `<p class="small" style="color:var(--bad,#b3261e);margin:0 0 6px">The AI could not help (${esc(e.message || "error")}). Showing normal results.</p>`);
    }
    b.disabled = false; b.textContent = old;
  }
  if (canAI) $("#" + id + "x", el).onclick = extended;
}
