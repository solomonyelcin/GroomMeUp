// Builds C#/.NET/SQL study guides (content/study/src/*.md) into shared articles and registers them in content/articles.json.
import fs from "node:fs";
import path from "node:path";
import { textToArticle } from "../js/import/blocks.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = path.join(root, "content/study/src"), man = path.join(root, "content/articles.json");
const files = fs.readdirSync(src).filter((f) => f.endsWith(".md")).sort();
const GROUPS = { cs: ["study-cs", "C# study guides"], net: ["study-net", ".NET study guides"], sql: ["study-sql", "SQL study guides"] };
const list = JSON.parse(fs.readFileSync(man, "utf8")).filter((x) => !String(x.group || "").startsWith("study-"));
const T = Date.parse("2026-11-20T02:00:00Z");
files.forEach((f, k) => {
  const key = f.split("-")[0], g = GROUPS[key];
  if (!g) throw new Error("unknown prefix " + f);
  const blocks = textToArticle(fs.readFileSync(path.join(src, f), "utf8"), { markdown: true });
  const title = blocks.find((b) => b.type === "title")?.text || f;
  const slug = "st-" + f.replace(/\.md$/, "");
  const dir = path.join(root, "content/study", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "article.json"), JSON.stringify(blocks));
  list.push({ id: slug, title, topic: g[1], t: T + k, kind: "doc", file: `content/study/${slug}/article.json`, group: g[0], order: k + 1, source: { file: "GroomMeUp study guide", format: "Guide" }, questionCount: 0 });
});
fs.writeFileSync(man, JSON.stringify(list, null, 1) + "\n");
console.log("built", files.length, "study guides");
