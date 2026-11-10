// Small per-person Library memory: starred / read / progress for articles and daily picks, plus reading preferences.
// Lives in the app state, so it is saved with your progress and follows you to other devices when you are signed in.
import { store } from "./store.js";

const grp = (g) => (store.get().libmeta?.[g]) || {};
export const metaOf = (g, id) => grp(g)[id] || {};
export function setMeta(g, id, patch) {
  store.update((s) => { const m = (s.libmeta ||= {}); const o = (m[g] ||= {}); o[id] = { ...(o[id] || {}), ...patch, t: Date.now() }; });
}
export const prefs = () => ({ size: 100, wide: false, ...(store.get().libmeta?.prefs || {}) });
export function setPrefs(patch) { store.update((s) => { const m = (s.libmeta ||= {}); m.prefs = { ...(m.prefs || {}), ...patch }; }); }
export const readMinutes = (words) => Math.max(1, Math.round(words / 200));
