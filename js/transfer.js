// Move progress between devices with a pasteable code (gzip + base64). Questions are not included: reload them from your library or files.
import { store } from "./store.js";

const FIELDS = ["attempts", "srs", "quizzes", "code", "mocks", "log", "mcqSeen", "stars", "notes", "badges"];
const toB64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64 = (t) => { t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return Uint8Array.from(atob(t), (c) => c.charCodeAt(0)); };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function makeProgressCode() {
  const s = store.get(), o = { v: 1, t: Date.now(), target: s.settings.target || "", weekly: s.settings.weekly || 0 };
  for (const k of FIELDS) o[k] = s[k] ?? null;
  return "GMU1." + toB64(await pipe(new TextEncoder().encode(JSON.stringify(o)), new CompressionStream("gzip")));
}

export function mergeProgress(local, o) {
  const out = {};
  const key = (a) => a.qid + "|" + a.t;
  const seenA = new Set(local.attempts.map(key));
  out.attempts = [...local.attempts, ...(o.attempts || []).filter((a) => !seenA.has(key(a)))].sort((a, b) => a.t - b.t);
  out.srs = { ...local.srs }; for (const [id, v] of Object.entries(o.srs || {})) if (!out.srs[id] || (v.due || 0) > (out.srs[id].due || 0)) out.srs[id] = v;
  const byT = (a, b) => { const m = new Set(a.map((x) => x.t)); return [...a, ...(b || []).filter((x) => !m.has(x.t))].sort((x, y) => x.t - y.t); };
  out.quizzes = byT(local.quizzes, o.quizzes); out.mocks = byT(local.mocks || [], o.mocks);
  out.log = [...local.log]; const lk = new Set(local.log.map((x) => JSON.stringify(x))); for (const x of o.log || []) if (!lk.has(JSON.stringify(x))) out.log.push(x);
  out.code = { ...local.code }; for (const [id, v] of Object.entries(o.code || {})) { const a = out.code[id]; if (!a || (v.solved && !a.solved) || ((v.t || 0) > (a.t || 0) && !(a.solved && !v.solved))) out.code[id] = v; }
  out.mcqSeen = { ...local.mcqSeen }; for (const [id, v] of Object.entries(o.mcqSeen || {})) if (!out.mcqSeen[id] || (v.t || 0) > (out.mcqSeen[id].t || 0)) out.mcqSeen[id] = v;
  out.stars = { ...(local.stars || {}), ...(o.stars || {}) };
  out.notes = { ...(o.notes || {}), ...(local.notes || {}) };
  out.badges = { ...(o.badges || {}) }; for (const [id, t] of Object.entries(local.badges || {})) out.badges[id] = Math.min(t, out.badges[id] || t);
  return out;
}

export async function applyProgressCode(code) {
  const m = /^GMU1\.([A-Za-z0-9_-]+)$/.exec(String(code || "").trim());
  if (!m) throw new Error("That is not a GroomMeUp progress code. Copy the whole code, starting with GMU1.");
  let o;
  try { o = JSON.parse(new TextDecoder().decode(await pipe(fromB64(m[1]), new DecompressionStream("gzip")))); } catch { throw new Error("The code looks damaged. Copy it again in full."); }
  if (!o || o.v !== 1) throw new Error("Unsupported progress code version.");
  const before = store.get().attempts.length;
  store.update((s) => {
    const merged = mergeProgress(s, o);
    Object.assign(s, merged);
    if (!s.settings.target && o.target) s.settings.target = o.target;
    if (!s.settings.weekly && o.weekly) s.settings.weekly = o.weekly;
  });
  return { added: store.get().attempts.length - before };
}
