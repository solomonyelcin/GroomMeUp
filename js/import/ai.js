// AI help for documents that are not already in question/answer form.
import { chat, parseJSON } from "../ai.js";
import { norm } from "./sheet.js";

export const MAX_CHUNKS = 8;
export function chunkText(text, size = 5000, max = MAX_CHUNKS) {
  const paras = text.split(/\n{2,}|\r?\n(?=[A-Z0-9#])/).map((p) => p.trim()).filter(Boolean);
  const chunks = []; let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) { chunks.push(cur); cur = ""; }
    cur += (cur ? "\n\n" : "") + p;
    while (cur.length > size * 1.5) { chunks.push(cur.slice(0, size)); cur = cur.slice(size); }
  }
  if (cur) chunks.push(cur);
  return { chunks: chunks.slice(0, max), truncated: chunks.length > max, total: chunks.length };
}

const SYS = {
  extract: `You extract interview question and answer pairs from messy document text.
Use ONLY what is in the text. Do not invent answers. Keep the author's wording, fixing only line breaks.
Return ONLY JSON: {"items":[{"topic": string, "q": string, "a": string}]}. If there are none, return {"items":[]}.`,
  generate: `You turn study notes into interview practice questions for a senior .NET full stack engineer.
Write 4 to 8 questions per excerpt, each with a model answer (40 to 120 words) grounded in the notes.
Return ONLY JSON: {"items":[{"topic": string (short, 1-3 words), "q": string, "a": string}]}.`,
};

export async function aiExtract(text, mode, { fallbackTopic = "Imported", onProgress } = {}) {
  const { chunks, truncated, total } = chunkText(text);
  const items = []; const seen = new Set(); let failed = 0, lastError = "";
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    try {
      const d = parseJSON(await chat(SYS[mode], chunks[i], { json: true, temperature: mode === "generate" ? 0.5 : 0 }));
      for (const x of Array.isArray(d) ? d : d.items || []) {
        const q = String(x.q || "").trim(), a = String(x.a || "").trim();
        if (q.length < 6 || a.length < 8) continue;
        const topic = String(x.topic || fallbackTopic).trim().slice(0, 60) || fallbackTopic;
        const key = norm(topic + "|" + q);
        if (seen.has(key)) continue; seen.add(key);
        items.push({ topic, sub: "", q, a, status: "", kind: /scenario/i.test(topic) ? "scenario" : "concept" });
      }
    } catch (e) { failed++; lastError = e.message; }
  }
  return { items, failed, lastError, truncated, total };
}

// Write model answers for questions that came without any. Returns the answered items and what is left.
const ANS_SYS = `You are a senior engineer coaching a candidate for senior .NET full stack interviews (C#, ASP.NET Core, EF Core, SQL Server, Angular, Azure, microservices, system design).
For each numbered interview question write a model answer a strong candidate would say: 60 to 110 words, accurate, plain text, covering the core idea, how it works, one concrete example or trade-off. If a question is behavioural, give a short STAR-style outline. If you are unsure, say what is generally true rather than inventing details. Do not use double quotes inside answers.
Return ONLY JSON: {"answers":[{"n": number, "a": string}]} with one entry per question, same numbering.`;

export async function aiAnswers(pending, { batch = 5, limit = 50, onProgress } = {}) {
  const todo = pending.slice(0, limit), done = [], failed = [];
  for (let i = 0; i < todo.length; i += batch) {
    const group = todo.slice(i, i + batch);
    onProgress?.(Math.min(i + batch, todo.length), todo.length);
    let got = [];
    for (let attempt = 0; attempt < 2 && !got.length; attempt++) {
      try {
        const user = group.map((g, k) => `${k + 1}. [${g.topic}] ${g.q}`).join("\n");
        const d = parseJSON(await chat(ANS_SYS, user, { json: true, temperature: attempt ? 0.2 : 0.3 }));
        got = (Array.isArray(d) ? d : d.answers || []).filter((x) => x && Number.isFinite(+x.n) && String(x.a || "").trim().length >= 25);
      } catch { /* retry once */ }
    }
    const byN = new Map(got.map((x) => [+x.n, String(x.a).trim()]));
    group.forEach((g, k) => (byN.has(k + 1) ? done.push({ ...g, a: byN.get(k + 1), ai: true }) : failed.push(g)));
  }
  return { done, failed, rest: pending.slice(limit) };
}
