// Builds the roadmap study guides (content/roadmap/src/*.md) into shared articles and registers them in content/articles.json.
// Run: node scripts/build-roadmap.mjs
import fs from "node:fs";
import path from "node:path";
import { textToArticle } from "../js/import/blocks.js";
import { ROADMAP } from "../js/data/roadmap.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "content/roadmap/src");
const man = path.join(root, "content/articles.json");
const files = fs.readdirSync(src).filter((f) => f.endsWith(".md")).sort();
const list = JSON.parse(fs.readFileSync(man, "utf8")).filter((x) => x.group !== "roadmap");
const T = Date.parse("2026-11-13T18:00:00Z");

files.forEach((f, k) => {
  const track = ROADMAP.tracks[k];
  const blocks = textToArticle(fs.readFileSync(path.join(src, f), "utf8"), { markdown: true });
  const title = blocks.find((b) => b.type === "title")?.text || track.title;
  const slug = "rm-" + f.replace(/^\d+-/, "").replace(/\.md$/, "");
  const dir = path.join(root, "content/roadmap", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "article.json"), JSON.stringify(blocks));
  list.push({ id: slug, title, topic: "Roadmap " + track.n + ": " + track.title, t: T + k, kind: "doc", file: `content/roadmap/${slug}/article.json`, group: "roadmap", track: track.id, order: track.n, source: { file: "GroomMeUp study guide", format: "Guide" }, questionCount: 0 });
});
fs.writeFileSync(man, JSON.stringify(list, null, 1) + "\n");
console.log("built", files.length, "guides");
