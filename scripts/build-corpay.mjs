// Builds the Corpay prep guides (content/corpay/src/*.md) into shared articles and registers them in content/articles.json.
import fs from "node:fs";
import path from "node:path";
import { textToArticle } from "../js/import/blocks.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "content/corpay/src"), man = path.join(root, "content/articles.json");
const files = fs.readdirSync(src).filter((f) => f.endsWith(".md")).sort();
const list = JSON.parse(fs.readFileSync(man, "utf8")).filter((x) => x.group !== "corpay");
const T = Date.parse("2026-11-14T02:00:00Z");
files.forEach((f, k) => {
  const blocks = textToArticle(fs.readFileSync(path.join(src, f), "utf8"), { markdown: true });
  const title = blocks.find((b) => b.type === "title")?.text || f;
  const slug = "cp-" + f.replace(/^\d+-/, "").replace(/\.md$/, "");
  const dir = path.join(root, "content/corpay", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "article.json"), JSON.stringify(blocks));
  list.push({ id: slug, title, topic: "Corpay interview prep", t: T + k, kind: "doc", file: `content/corpay/${slug}/article.json`, group: "corpay", order: k + 1, source: { file: "GroomMeUp prep guide", format: "Guide" }, questionCount: 0 });
});
fs.writeFileSync(man, JSON.stringify(list, null, 1) + "\n");
console.log("built", files.length, "Corpay guides");
