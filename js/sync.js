// Keeps a signed-in person's progress, settings and imported questions in their own repository (progress/state.json),
// so the same account looks the same on every device. The AI keys never leave the browser. Guests are not synced.
import { store } from "./store.js";
import { connected, fetchJson, putText } from "./github.js";
import { currentUser, ns } from "./account.js";

const PATH = "progress/state.json";
const rd = () => { try { return { remoteT: 0, localT: 0, dirty: false, last: 0, error: "", ...JSON.parse(localStorage.getItem(ns("groommeup.sync")) || "{}") }; } catch { return { remoteT: 0, localT: 0, dirty: false, last: 0, error: "" }; } };
const wr = (patch) => { try { localStorage.setItem(ns("groommeup.sync"), JSON.stringify({ ...rd(), ...patch })); } catch { /* ignore */ } fire(); };
const ls = new Set(); const fire = () => ls.forEach((f) => { try { f(); } catch { /* ignore */ } });
export const onSyncChange = (f) => { ls.add(f); return () => ls.delete(f); };
export const syncMeta = rd;
export function syncLabel() {
  if (!currentUser()) return "";
  const m = rd();
  if (m.error) return "Sync problem: " + m.error;
  if (m.dirty) return "Saving to your repository…";
  if (!m.last) return "Not synced yet";
  const mins = Math.round((Date.now() - m.last) / 60000);
  return mins < 1 ? "Synced just now" : mins < 60 ? `Synced ${mins} min ago` : "Synced " + new Date(m.last).toLocaleString();
}
const payload = () => ({ format: "groommeup-sync", v: 1, t: Date.now(), state: JSON.parse(store.exportJSON()) });
let timer = null, applying = false, pushing = false;

export async function pushNow() {
  if (!currentUser() || !connected() || pushing) return false;
  pushing = true;
  try { const p = payload(); await putText(PATH, JSON.stringify(p), "Sync progress"); wr({ remoteT: p.t, dirty: false, last: Date.now(), error: "" }); return true; }
  catch (e) { wr({ error: /too large|1000000|413|422/i.test(e.message) ? "your progress is too large to sync (over 1 MB)" : e.message }); return false; }
  finally { pushing = false; }
}
const schedule = () => { clearTimeout(timer); timer = setTimeout(pushNow, 4000); };

// Look at the repository: take a newer copy from another device, or send ours. Returns "applied", "pushed", "current" or "off".
export async function pullAtStart({ reload = true } = {}) {
  if (!currentUser() || !connected()) return "off";
  let remote;
  try { remote = await fetchJson(PATH); } catch (e) { wr({ error: e.message }); return "off"; }
  const m = rd();
  if (!remote || !remote.state) { if (store.hasSaved()) { await pushNow(); return "pushed"; } return "current"; }
  if (remote.t <= m.remoteT && !m.dirty) { wr({ last: Date.now(), error: "" }); return "current"; }
  if (m.dirty && remote.t <= m.localT) { await pushNow(); return "pushed"; }
  if (m.dirty) { try { await putText(`progress/conflict-${m.localT}.json`, JSON.stringify(payload()), "Keep this device's progress before taking a newer copy"); } catch { /* best effort */ } }
  applying = true;
  try { store.replaceAll(remote.state); wr({ remoteT: remote.t, dirty: false, last: Date.now(), error: "" }); } finally { applying = false; }
  if (reload) location.reload(); else dispatchEvent(new HashChangeEvent("hashchange"));
  return "applied";
}

export function startSync() {
  if (!currentUser()) return;
  store.subscribe(() => { if (applying) return; wr({ dirty: true, localT: Date.now() }); schedule(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (rd().dirty) pushNow(); } else pullAtStart({ reload: false }); });
  setInterval(fire, 60000); // keeps "synced 3 min ago" honest
  pullAtStart();
}
