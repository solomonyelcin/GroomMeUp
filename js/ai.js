// AI layer. Works with three FREE providers (you bring your own free API key, stored only in
// this browser) and always falls back to the offline keyword evaluator, so the app is usable at zero cost.
import { store } from "./store.js";

export const PROVIDERS = {
  offline: { name: "Offline (no AI, keyword scoring)", needsKey: false },
  pollinations: { name: "Free AI, no key needed (Pollinations)", needsKey: false, keyless: true, model: "openai", url: "https://text.pollinations.ai/openai", note: "Works with no signup. Quality and uptime vary, so the app falls back to offline scoring if it fails." },
  gemini: { name: "Google Gemini (free tier)", needsKey: true, model: "gemini-2.5-flash", keyUrl: "https://aistudio.google.com/apikey" },
  groq: { name: "Groq (free tier)", needsKey: true, model: "llama-3.3-70b-versatile", keyUrl: "https://console.groq.com/keys" },
  openrouter: { name: "OpenRouter (free models)", needsKey: true, model: "meta-llama/llama-3.3-70b-instruct:free", keyUrl: "https://openrouter.ai/keys" },
};

export const RESUME_CONTEXT = `Candidate: Solomon Yelcin, Senior .NET Full Stack Developer, 9+ years, Chennai (open to relocate/hybrid).
Stack: C#, .NET 10/8, ASP.NET Core, EF Core, Angular 20/22, TypeScript, React, SQL Server, MySQL, Snowflake, ElasticSearch, Azure, Docker, Kubernetes, Azure DevOps, RabbitMQ, MuleSoft, microservices.
Roles: Senior Developer at Flex (Dec 2021-present); Senior Process Associate at TCS (2019-2021); .NET Developer at Vega Intellisoft (2017-2019) and BFlux (2016-2017).
Projects: EO Workbench (excess & obsolete inventory, 1000 concurrent users), Material Margin Navigator (Snowflake, AIDLC), Machine Data Store (RabbitMQ + ElasticSearch telemetry), Process Instructions Online (legacy modernization).
Goal: a senior role at a good company with a strong package.`;

export const activeProvider = () => {
  const s = store.get().settings;
  const meta = PROVIDERS[s.provider];
  if (meta && s.provider !== "offline" && (!meta.needsKey || s.keys[s.provider])) return s.provider;
  return "offline";
};
export const aiEnabled = () => activeProvider() !== "offline";

export async function chat(system, user, opts = {}) {
  try { return await chatOnce(system, user, opts); }
  catch (e) {
    if (PROVIDERS[activeProvider()]?.keyless && !/abort/i.test(e.name + e.message)) { await new Promise((r) => setTimeout(r, 1200)); return chatOnce(system, user, opts); }
    throw e;
  }
}

async function chatOnce(system, user, { json = false, temperature = 0.3 } = {}) {
  const s = store.get().settings;
  const p = activeProvider();
  if (p === "offline") throw new Error("AI is off");
  const key = s.keys[p] || "";
  const model = s.models[p] || PROVIDERS[p].model;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    if (p === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature, ...(json ? { responseMimeType: "application/json" } : {}) },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message || `Gemini error ${r.status}`);
      return d.candidates?.[0]?.content?.parts?.map((x) => x.text).join("") || "";
    }
    const url = PROVIDERS[p].url || (p === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions");
    const headers = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    const r = await fetch(url, {
      method: "POST", signal: ctl.signal,
      headers,
      body: JSON.stringify({
        model, temperature,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        ...(json && p === "groq" ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const raw = await r.text();
    let d; try { d = JSON.parse(raw); } catch { if (r.ok && raw.trim()) return raw; throw new Error(`${p} returned an unreadable response`); }
    if (!r.ok) throw new Error((typeof d?.error === "string" ? d.error : d?.error?.message) || `${p} error ${r.status}`);
    return d.choices?.[0]?.message?.content || "";
  } finally { clearTimeout(timer); }
}

export function parseJSON(text) {
  if (!text) throw new Error("Empty AI response");
  const cleaned = text.replace(/```json|```/gi, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const a = cleaned.search(/[\[{]/);
  const b = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
  throw new Error("Could not parse AI response");
}

// ---------------- offline evaluator ----------------
export function offlineEvaluate(q, answer) {
  const text = (answer || "").toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const hit = [], miss = [];
  for (const [label, ...kws] of q.kp) {
    (kws.some((k) => text.includes(k.toLowerCase())) ? hit : miss).push(label);
  }
  const coverage = q.kp.length ? hit.length / q.kp.length : 0;
  let score = coverage * 9;
  if (words < 15) score = Math.min(score, 2);
  else if (words < 40) score *= 0.85;
  if (words >= 60 && coverage >= 0.6) score += 1; // depth bonus
  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
  const tips = [];
  if (words < 40) tips.push("Aim for 60-150 words: definition, example, pitfall.");
  if (!/\b(for example|e\.g\.|such as|in my|i used|at flex|project)\b/.test(text)) tips.push("Add a concrete example from your own project.");
  return {
    score, source: "offline",
    verdict: score >= 8 ? "Strong answer" : score >= 5 ? "Decent, but missing points" : "Needs work",
    strengths: hit.map((h) => `Covered: ${h}`), gaps: miss.map((m) => `Missing: ${m}`),
    tips, improved: q.a,
  };
}

// ---------------- AI evaluator ----------------
export async function evaluateAnswer(q, answer, { interviewer = false } = {}) {
  const off = offlineEvaluate(q, answer);
  if (!aiEnabled()) return off;
  const system = `You are a strict but fair senior interviewer for a ${interviewer ? "real" : "mock"} technical interview in 2026. Grade the candidate's answer.
Candidate background:\n${RESUME_CONTEXT}
Return ONLY JSON: {"score": number 0-10, "verdict": string, "strengths": string[], "gaps": string[], "tips": string[], "improved": string, "followUp": string}.
"improved" is a concise model answer (max 140 words) that the candidate could say aloud. "followUp" is one realistic follow-up question. Be specific and honest; do not inflate scores.`;
  const user = `Question: ${q.q}\n\nReference key points: ${q.kp.map((k) => k[0]).join("; ")}\n\nCandidate answer:\n${answer || "(no answer)"}`;
  try {
    const d = parseJSON(await chat(system, user, { json: true }));
    return {
      score: Math.max(0, Math.min(10, Number(d.score) || 0)), source: "ai", verdict: d.verdict || "",
      strengths: arr(d.strengths), gaps: arr(d.gaps), tips: arr(d.tips), improved: d.improved || q.a, followUp: d.followUp || "",
      offline: off,
    };
  } catch (e) {
    return { ...off, aiError: e.message };
  }
}
const arr = (x) => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);

export async function reviewCode(ch, code, lang) {
  if (!aiEnabled()) return null;
  const system = `You are a senior ${lang} engineer reviewing an interview solution. Return ONLY JSON:
{"score": number 0-10, "summary": string, "rubric": [{"item": string, "pass": boolean, "note": string}], "bugs": string[], "improvements": string[]}.`;
  const user = `Challenge: ${ch.title}\n${ch.desc}\n\nRubric:\n${(ch.rubric || []).map((r) => "- " + r).join("\n")}\n\nCandidate code:\n${code}`;
  const d = parseJSON(await chat(system, user, { json: true }));
  return { ...d, score: Math.max(0, Math.min(10, Number(d.score) || 0)), rubric: Array.isArray(d.rubric) ? d.rubric : [] };
}

export async function explainFailure(ch, code, failures) {
  const system = "You are a patient coding mentor. Explain in under 120 words why the code fails the tests and give a hint, NOT the full solution.";
  const user = `Challenge: ${ch.title}\n${ch.desc}\n\nCode:\n${code}\n\nFailures:\n${JSON.stringify(failures).slice(0, 1500)}`;
  return chat(system, user);
}

const kwFrom = (s) => [...new Set(s.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").split(/\s+/).filter((w) => w.length >= 5))].slice(0, 5);

export async function generateQuestions(topic, count, level) {
  const system = `You write realistic technical interview questions as asked in 2026 for senior .NET full stack roles in India. Return ONLY JSON: {"questions":[{"q": string, "a": string (model answer, 60-120 words), "keyPoints": string[] (3-5 short phrases)}]}`;
  const user = `Topic: ${topic}\nLevel: ${level}\nCount: ${count}\nCandidate background:\n${RESUME_CONTEXT}`;
  const d = parseJSON(await chat(system, user, { json: true, temperature: 0.6 }));
  const list = Array.isArray(d) ? d : d.questions || [];
  return list.filter((x) => x.q && x.a).map((x, i) => ({
    id: `ai${Date.now().toString(36)}${i}`, c: "custom", d: level === "senior" ? 3 : 2, custom: true, tags: [topic],
    q: String(x.q), a: String(x.a), f: [],
    kp: (Array.isArray(x.keyPoints) && x.keyPoints.length ? x.keyPoints : ["Core idea"]).map((k) => [String(k), ...kwFrom(String(k))]),
  }));
}

export async function mockSummary(report) {
  if (!aiEnabled()) return null;
  const system = `You are an interview coach. Given per-question scores from a mock interview, write a candid debrief. Return ONLY JSON: {"verdict": string, "hire": "strong yes|yes|lean no|no", "topStrengths": string[], "topGaps": string[], "nextSteps": string[]}.`;
  return parseJSON(await chat(system, JSON.stringify(report).slice(0, 6000), { json: true }));
}

export async function pingAI() {
  const t = await chat("Reply with the single word: ready", "ping", { temperature: 0 });
  return t.trim().slice(0, 60);
}
