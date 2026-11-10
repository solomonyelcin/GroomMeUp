// Daily picks: a short list of fresh, relevant reading collected once a day by a GitHub Action (see scripts/daily-digest.mjs).
import { metaOf } from "./libmeta.js";

let cache = null;
export async function loadFeed(force = false) {
  if (cache && !force) return cache;
  try {
    const r = await fetch("content/daily/feed.json?v=" + Math.floor(Date.now() / 36e5), { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const f = await r.json();
    cache = { updated: f.updated || null, items: Array.isArray(f.items) ? f.items : [], topics: null };
  } catch { cache = { updated: null, items: [], failed: true }; }
  return cache;
}
export const isNew = (it) => !metaOf("pick", it.id).read && !metaOf("pick", it.id).hide && (Date.now() - Date.parse(it.added || it.date)) < 4 * 864e5;
export async function newCount() { const f = await loadFeed(); return f.items.filter(isNew).length; }
export const TOPIC_NAMES = { dotnet: ".NET and C#", efcore: "EF Core and SQL", angular: "Angular and frontend", azure: "Azure and DevOps", architecture: "Architecture and system design", security: "Security", interview: "Interviews and career" };
