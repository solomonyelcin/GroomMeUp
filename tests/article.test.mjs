// Unit tests for importing files as articles (Word, Excel, text, markdown, CSV) and the block markdown round trip.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileToArticle } from "../js/import/article.js";
import { toMarkdown, fromMarkdown } from "../js/import/blocks.js";
import { inlineHtml, articleHtml, tocOf } from "../js/views/article-render.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const file = (n) => new File([fs.readFileSync(path.join(dir, n))], n);
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const J = (x) => JSON.stringify(x);

console.log("Word");
{
  const a = await fileToArticle(file("article.docx")), B = a.blocks, t = (ty) => B.filter((b) => b.type === ty);
  check(a.title === "Caching Guide" && B[0].type === "title", "title from Title style: " + a.title);
  check(t("h").length === 3 && t("h")[0].level === 1 && t("h")[1].level === 2, "headings with levels " + J(t("h").map((h) => [h.text, h.level])));
  const p = B.find((b) => b.type === "p");
  check(p.text.includes("**hot data**") && p.text.includes("*not free*"), "bold and italic kept: " + p.text);
  check(B.some((b) => b.type === "p" && b.text.includes("\\* star") && b.text.includes("\\[bracket\\]")), "literal * and [ escaped");
  const ul = t("ul")[0]; check(ul && ul.items.join() === "In-memory,Distributed,Redis" && J(ul.lv) === "[0,0,1]", "bullets with nesting " + J(ul));
  const ol = t("ol")[0]; check(ol && ol.items.length === 3 && ol.items[0] === "Measure first", "numbered list " + J(ol));
  const tb = t("table")[0]; check(tb && tb.rows.length === 3 && tb.rows[2][0] === "Redis", "table");
  check(t("code").length === 1 && t("code")[0].text.includes("cache.Get"), "code block " + J(t("code")));
  check(t("quote").length === 1, "quote");
  check(t("img").length === 1 && a.images.length === 1 && a.images[0].bytes.length > 50, "picture found");
  const html = articleHtml(B); check(!/<script/i.test(html) && html.includes("<ol") && html.includes("<strong>hot data</strong>"), "renders");
  check(tocOf(B).length === 3, "contents list");
}
console.log("Excel");
{
  const a = await fileToArticle(file("article.xlsx")), tb = a.blocks.filter((b) => b.type === "table");
  check(tb.length === 2, "two visible sheets as tables, hidden skipped: " + tb.length);
  check(tb[0].rows[1][1] === "2026-03-14", "date shown as a date: " + tb[0].rows[1][1]);
  check(tb[0].rows[1][2] === "50%" && tb[0].rows[2][2] === "100%", "percent shown as percent: " + tb[0].rows[1][2]);
  check(a.blocks.some((b) => b.type === "h" && b.text === "Plan") && a.warnings.some((w) => /hidden/.test(w)), "sheet names and hidden warning");
  check(a.keepOriginal, "original kept for workbook");
}
console.log("Markdown, text, CSV");
{
  const a = await fileToArticle(file("article.md")), B = a.blocks;
  check(a.title === "Git Notes", "md title");
  check(B.find((b) => b.type === "p").text.includes("`git status`") && B.find((b) => b.type === "p").text.includes("[the book](https://git-scm.com/book)"), "inline kept");
  const ul = B.find((b) => b.type === "ul"); check(ul && J(ul.lv) === "[0,0,1,1]", "md nested list " + J(ul));
  check(B.some((b) => b.type === "ol" && b.items.length === 2), "md numbered");
  check(B.some((b) => b.type === "quote") && B.some((b) => b.type === "code" && b.lang === "bash") && B.some((b) => b.type === "hr"), "quote, code, rule");
  const tb = B.find((b) => b.type === "table"); check(tb && tb.rows[2][0] === "a|b", "table with escaped pipe " + J(tb));
  const md = toMarkdown(B), again = fromMarkdown(md);
  check(J(again) === J(B), "markdown round trip is stable");
  const tx = await fileToArticle(file("article.txt")), T = tx.blocks;
  check(T[0].type === "title" && T[0].text === "THREADING NOTES", "txt caps title");
  check(T.some((b) => b.type === "h" && b.text === "KEY IDEAS"), "txt caps heading");
  check(T.some((b) => b.type === "ul" && b.items.length === 2), "txt bullets");
  check(T.some((b) => b.type === "h" && b.n === 1 && /Race/.test(b.text)) && T.some((b) => b.type === "h" && b.n === 2), "txt numbered headings " + J(T.filter((b) => b.type === "h")));
  check(T.find((b) => b.type === "p").text.includes("\n"), "short lines keep their breaks");
  const c = await fileToArticle(file("article.csv")), cr = c.blocks.find((b) => b.type === "table").rows;
  check(cr[1][0] === "Smith, Ann" && cr[2][1] === "QA\nlead", "csv quotes and line breaks " + J(cr));
  check(!c.keepOriginal, "text formats do not store an original");
}
console.log("Hostile text and limits");
{
  const html = inlineHtml('<img src=x onerror=alert(1)> **b** [x](javascript:alert(1)) [ok](https://a.com?q=1&r="2")');
  check(!/<img|<a href="javascript/i.test(html) && html.includes('href="https://a.com'), "no markup or script injection: " + html);
  let err = ""; try { await fileToArticle(new File(["x"], "a.doc")); } catch (e) { err = e.message; }
  check(/Save As \.docx/.test(err), "old .doc explained");
  err = ""; try { await fileToArticle(new File(["x"], "a.png")); } catch (e) { err = e.message; }
  check(/pictures/i.test(err), "pictures pointed to the picture import");
  const big = await fileToArticle(new File(["word ".repeat(40) + "\n\n"].concat(Array.from({ length: 60000 }, (_, i) => `Paragraph number ${i} with some filler words to make it long.\n\n`)), "big.txt"));
  check(big.blocks.length < 60000 && big.warnings.some((w) => /very large/.test(w)) && big.keepOriginal, "very large file is capped and says so");
}

console.log("PDF structure and questions from headings");
{
  const { linesToBlocks } = await import("../js/import/pdfnative.js");
  const R = (t, o = {}) => ({ t, b: !!o.b, i: !!o.i, m: !!o.m });
  const L = (y, x0, text, o = {}) => ({ y, x0, x1: x0 + text.length * 5, h: o.h || 10, runs: o.runs || [R(text, o)], text, bold: !!o.bold, mono: !!o.mono, segs: o.segs || [{ x0, x1: x0 + text.length * 5, runs: [R(text)] }], cw: 6 });
  const pg = (lines) => ({ width: 600, height: 800, lines });
  const lines = [
    L(100, 50, "Study Guide", { h: 24 }), L(140, 50, "Part I: Basics", { h: 14, bold: true, runs: [R("Part I: Basics", { b: true })] }),
    L(170, 50, "Question 1: What is DI?", { bold: true, runs: [R("Question 1: What is DI?", { b: true })] }),
    L(190, 50, "Why it matters: decouples code and", { runs: [R("Why it matters:", { b: true }), R(" decouples code and")] }), L(204, 50, "makes tests easy, a self-", {}), L(218, 50, "contained idea.", {}),
    L(245, 66, "Constructor: preferred form.", { runs: [R("Constructor:", { b: true }), R(" preferred form.")] }), L(260, 66, "Property: optional only.", { runs: [R("Property:", { b: true }), R(" optional only.")] }),
    L(290, 50, "var x = new Foo();", { mono: true, runs: [R("var x = new Foo();", { m: true })] }),
    L(330, 50, "Name", { segs: [{ x0: 50, x1: 90, runs: [R("Name", { b: true })] }, { x0: 250, x1: 300, runs: [R("Use", { b: true })] }] }),
    L(356, 50, "Redis", { segs: [{ x0: 50, x1: 90, runs: [R("Redis")] }, { x0: 250, x1: 330, runs: [R("Caching layer")] }] }),
    L(380, 50, "Question 2: Why test code?", { bold: true, runs: [R("Question 2: Why test code?", { b: true })] }),
    L(400, 50, "Tests catch regressions before users do and document intent.", {}),
    L(780, 250, "Page 1 of 2", {}),
  ];
  const { blocks } = linesToBlocks([pg(lines), pg([L(100, 50, "More text after the break of the page that runs on.", {}), L(780, 250, "Page 2 of 2", {})])]);
  const ty = blocks.map((b) => b.type + (b.level || ""));
  check(blocks[0].type === "title" && blocks[0].text === "Study Guide", "pdf: title " + ty);
  check(blocks.some((b) => b.type === "h" && b.level === 1 && /Part I/.test(b.text)) && blocks.filter((b) => b.type === "h" && b.level === 2).length === 2, "pdf: part and question headings " + ty);
  check(blocks.some((b) => b.type === "p" && b.text.startsWith("**Why it matters:**") && b.text.includes("self-contained")), "pdf: bold label and hyphen join kept");
  check(blocks.some((b) => b.type === "ul" && b.items.length === 2 && b.items[0].startsWith("**Constructor:**")), "pdf: indented bold-label bullets");
  check(blocks.some((b) => b.type === "code" && b.text === "var x = new Foo();"), "pdf: monospace is code");
  const tb = blocks.find((b) => b.type === "table"); check(tb && tb.rows.length === 2 && tb.rows[1][1] === "Caching layer", "pdf: table by columns " + J(tb));
  check(!blocks.some((b) => /Page \d of/.test(b.text || "")), "pdf: page footers dropped");
  const { blocksToQA } = await import("../js/import/blocks.js");
  const qa = blocksToQA(blocks);
  check(qa.length === 2 && qa[0].q === "What is DI?" && qa[0].topic.startsWith("Part I") && /Constructor/.test(qa[0].a) && /Redis/.test(qa[0].a), "questions from Question headings " + J(qa.map((x) => x.q)));
}

console.log(`\n${pass + fail} checks, ${fail} failures`);
process.exit(fail ? 1 : 0);
