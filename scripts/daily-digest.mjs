// Daily digest: read public RSS/Atom feeds, keep what matches your skills, write content/daily/feed.json.
// Runs in a GitHub Action (free). No dependencies. Only titles, short excerpts and links are stored, never full articles.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

const decode = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const strip = (h) => decode(decode(h)).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (x, name) => { const m = x.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? m[1] : ""; };

// RSS 2.0 and Atom, both
export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = strip(tag(b, "title"));
    let url = strip(tag(b, "link"));
    if (!url) { const m = b.match(/<link[^>]*?href=["']([^"']+)["'][^>]*>/i); const alt = b.match(/<link[^>]*?rel=["']alternate["'][^>]*?href=["']([^"']+)["']/i); url = decode((alt || m || [])[1] || ""); }
    const when = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const t = Date.parse(strip(when));
    const summary = strip(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content"));
    if (title && /^https?:\/\//.test(url)) items.push({ title, url, t: Number.isFinite(t) ? t : 0, summary: summary.length > 320 ? summary.slice(0, 320).replace(/\s+\S*$/, "") + "…" : summary });
  }
  return items;
}

const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// which of your topics an item belongs to, and how strongly
export function scoreItem(it, source, cfg) {
  const topics = []; let score = source.weight || 1;
  const T = it.title.toLowerCase(), S = (it.summary || "").toLowerCase();
  for (const [key, def] of Object.entries(cfg.topics)) {
    let hit = 0;
    for (const k of def.keywords) { const re = new RegExp(k.length <= 3 || /^[a-z]+$/i.test(k) ? `(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)` : esc(k), "i"); if (re.test(T)) hit += 3; else if (re.test(S)) hit += 1; }
    if (hit) { topics.push(key); score += Math.min(hit, 8); }
  }
  return { topics, score };
}

export function buildFeed(prev, fetched, cfg, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10), keepFrom = now - cfg.keepDays * 864e5;
  const have = new Map((prev.items || []).map((x) => [x.url, x]));
  const fresh = [];
  for (const { source, items } of fetched) for (const it of items) {
    if (have.has(it.url)) continue;
    if (it.t && it.t < keepFrom) continue;
    const { topics, score } = scoreItem(it, source, cfg);
    if (!topics.length || score < cfg.minScore) continue;
    fresh.push({ id: "d" + hash(it.url), title: it.title, url: it.url, source: source.name, date: it.t ? new Date(it.t).toISOString().slice(0, 10) : day, summary: it.summary, topics, score, added: day });
  }
  fresh.sort((a, b) => b.score - a.score || (b.date > a.date ? 1 : -1));
  const take = fresh.slice(0, cfg.maxNewPerRun);
  const items = [...take, ...have.values()].filter((x) => Date.parse(x.date) >= keepFrom).sort((a, b) => (b.added > a.added ? 1 : b.added < a.added ? -1 : b.score - a.score)).slice(0, 300);
  return { updated: new Date(now).toISOString(), items, added: take.length };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

async function get(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "GroomMeUp-daily-digest (+https://github.com/solomonyelcin/GroomMeUp)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.text(); } finally { clearTimeout(t); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "daily");
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  let prev = { items: [] }; try { prev = JSON.parse(fs.readFileSync(path.join(dir, "feed.json"), "utf8")); } catch { /* first run */ }
  const fetched = [], report = [];
  await Promise.all(cfg.sources.map(async (source) => {
    try { const items = parseFeed(await get(source.url)); fetched.push({ source, items }); report.push(`ok    ${source.name}: ${items.length} items`); }
    catch (e) { report.push(`FAIL  ${source.name}: ${e.message}`); }
  }));
  console.log(report.sort().join("\n"));
  if (!fetched.length) { console.log("No source could be read, keeping the old feed."); process.exit(0); }
  const feed = buildFeed(prev, fetched, cfg);
  fs.writeFileSync(path.join(dir, "feed.json"), JSON.stringify({ updated: feed.updated, items: feed.items }, null, 1) + "\n");
  console.log(`${feed.added} new pick(s), ${feed.items.length} kept.`);
}
