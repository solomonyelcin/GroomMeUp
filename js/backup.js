// Backups for a site with no backend. Everything lives in this browser, so the browser being cleared is the one real
// risk. This file makes copies you hold yourself: a file on your device, an encrypted copy in your GitHub repo,
// and a progress code, plus a reminder when the last one is old.
import { store } from "./store.js";
import { encryptLibrary, decryptLibrary } from "./library.js";
import { getCfg, setCfg, putText, DEFAULTS } from "./github.js";

import { ns } from "./account.js";
const META = ns("groommeup.backup"), SETUP = ns("groommeup.setup");
export const GH_BACKUP = "backup/progress.enc.json";
export const DUE_DAYS = 7;
const DAY = 86400000;

const rd = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

// ---------- what was backed up and when ----------
export const lastBackup = () => rd(META);
export function markBackup(kind) { const m = rd(META); wr(META, { ...m, last: Date.now(), kind, snooze: 0 }); try { dispatchEvent(new Event("groommeup:backup")); } catch { /* ignore */ } }
export const setPref = (patch) => wr(META, { ...rd(META), ...patch });
export const snoozeReminder = (days = 1) => setPref({ snooze: Date.now() + days * DAY });
export const setupDone = () => { try { return localStorage.getItem(SETUP) === "1"; } catch { return true; } };
export const markSetupDone = () => { try { localStorage.setItem(SETUP, "1"); } catch { /* ignore */ } };

// is there anything worth saving?
export function hasData(s = store.get()) {
  return (s.attempts?.length || 0) + (s.custom?.length || 0) + (s.log?.length || 0) + (s.quizzes?.length || 0) + (s.mocks?.length || 0) + (s.articles?.length || 0) + Object.keys(s.notes || {}).length + Object.keys(s.code || {}).length > 0;
}
export function backupStatus(now = Date.now()) {
  const m = lastBackup(), s = store.get();
  const days = m.last ? Math.floor((now - m.last) / DAY) : null;
  const due = hasData(s) && (!m.last || now - m.last > DUE_DAYS * DAY) && !(m.snooze && m.snooze > now);
  return { due, never: !m.last, days, last: m.last || 0, kind: m.kind || "" };
}

// ---------- the backup itself ----------
export function buildBackup({ secrets = false } = {}) {
  const s = store.get(), cfg = getCfg();
  const state = { ...s, settings: { ...s.settings, keys: secrets ? { ...(s.settings.keys || {}) } : {} } };
  const gh = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, ...(secrets && cfg.token ? { token: cfg.token } : {}) };
  return { format: "groommeup-backup", v: 2, t: Date.now(), secrets, state, gh };
}
export const backupName = (t = Date.now()) => `groommeup-backup-${new Date(t).toISOString().slice(0, 10)}.json`;

// a file on this device (plain, without keys or token). On phones it can also go through the share sheet (Drive, WhatsApp...).
export async function saveBackupFile({ share = false } = {}) {
  const b = buildBackup(), text = JSON.stringify(b), name = backupName(b.t);
  if (share && navigator.canShare) {
    const f = new File([text], name, { type: "application/json" });
    if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: "GroomMeUp backup" }); markBackup("file"); return { name, shared: true }; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  markBackup("file");
  return { name, shared: false };
}

export const strongEnough = (p) => String(p || "").trim().length >= 10;

// an encrypted copy in your repository: safe to sit in a public repo only while the passphrase is long and private
export async function saveEncryptedToGitHub(pass, { secrets = false } = {}) {
  if (!strongEnough(pass)) throw new Error("Use a passphrase of at least 10 characters. The file is public, so the passphrase is its only lock.");
  const env = await encryptLibrary(buildBackup({ secrets }), pass);
  env.kind = "groommeup-backup";
  await putText(GH_BACKUP, JSON.stringify(env) + "\n", "Encrypted progress backup " + new Date().toISOString().slice(0, 10));
  markBackup("github");
}

// ---------- reading a backup back ----------
// Accepts a backup file, a pasted progress code, or text of an encrypted backup.
export function sniff(text) {
  const t = String(text || "").trim();
  if (/^GMU1\.[A-Za-z0-9_-]+$/.test(t)) return { kind: "code", text: t };
  let j; try { j = JSON.parse(t); } catch { throw new Error("This is not a GroomMeUp backup. Choose the .json file saved by Back up now, or paste a code that starts with GMU1."); }
  if (j && j.cipher && j.data && j.salt) return { kind: "encrypted", env: j };
  if (j && j.format === "groommeup-backup" && j.state) return { kind: "plain", backup: j };
  if (j && Array.isArray(j.attempts)) return { kind: "plain", backup: { format: "groommeup-backup", v: 1, state: j, gh: null } }; // the older "Export backup" file
  throw new Error("This file is not a GroomMeUp backup.");
}

export async function openBackup(text, pass) {
  const x = sniff(text);
  if (x.kind === "encrypted") {
    if (!pass) return { needsPass: true, kind: "encrypted", env: x.env };
    const b = await decryptLibrary(x.env, pass);
    if (!b || b.format !== "groommeup-backup") throw new Error("This encrypted file is not a progress backup (it may be your question library).");
    return { kind: "plain", backup: b };
  }
  return x;
}

export function summarise(state) {
  return { answers: state.attempts?.length || 0, questions: (state.custom || []).length, notes: Object.keys(state.notes || {}).length, interviews: (state.log || []).length, articles: (state.articles || []).length };
}

// put a backup in place of what is in this browser
export function applyBackup(b) {
  if (b.kind === "code") throw new Error("Use applyProgressCode for codes.");
  const state = b.backup.state;
  const keys = state.settings?.keys && Object.values(state.settings.keys).some(Boolean);
  store.replaceAll(state, { keepKeys: !keys });
  if (b.backup.gh) { const cur = getCfg(); setCfg({ ...DEFAULTS, ...b.backup.gh, token: b.backup.gh.token || cur.token || "" }); }
  markBackup("restored");
  return summarise(store.get());
}

// where the encrypted GitHub copy can be read from without a token: this site, then GitHub's own raw host
export async function fetchGitHubBackup() {
  const c = getCfg(), urls = [GH_BACKUP + "?v=" + Date.now(), `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch}/${GH_BACKUP}`];
  for (const u of urls) { try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return await r.text(); } catch { /* try the next */ } }
  return null;
}

// ---------- keep the browser from throwing the data away ----------
export async function requestPersistence() {
  const out = { supported: !!(navigator.storage && navigator.storage.persist), persisted: false };
  if (!out.supported) return out;
  try {
    out.persisted = await navigator.storage.persisted();
    if (!out.persisted) out.persisted = await navigator.storage.persist();
  } catch { /* ignore */ }
  setPref({ persisted: out.persisted, persistAsked: Date.now() });
  return out;
}
export async function storageInfo() {
  const o = { supported: !!(navigator.storage && navigator.storage.persisted), persisted: false, usage: 0, quota: 0 };
  try { if (o.supported) o.persisted = await navigator.storage.persisted(); const e = await navigator.storage.estimate?.(); if (e) { o.usage = e.usage || 0; o.quota = e.quota || 0; } } catch { /* ignore */ }
  return o;
}
