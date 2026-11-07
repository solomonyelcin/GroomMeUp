// The shared block model for articles and its markdown form (editable in a text box, stable on a round trip).
// Blocks: title | h{n,level,text} | p | ul/ol{items,lv,start} | table{rows} | code | quote | img{id,alt} | hr.
// Inline marks inside text: **bold** *italic* ~~strike~~ `code` [text](url); a backslash makes one literal.
export const escMd = (t) => String(t).replace(/([\\*`\[\]~])/g, "\\$1");

export function toMarkdown(blocks) {
  const out = [];
  const lead = (t) => (/^(#{1,6}\s|[-*+]\s|\d{1,4}[.)]\s|>|```|~~~|\||!\[|---)/.test(t) ? "\\" + t : t);
  for (const b of blocks) {
    if (b.type === "title") out.push("# " + b.text);
    else if (b.type === "h") out.push(`${"#".repeat(Math.min(4, b.level || 1) + 1)} ${b.n ? b.n + ". " : ""}${b.text}`);
    else if (b.type === "p") out.push(lead(b.text).replace(/\n/g, "  \n"));
    else if (b.type === "ul" || b.type === "ol") {
      let k = (b.start || 1) - 1;
      out.push(b.items.map((x, i) => { const lv = (b.lv && b.lv[i]) || 0; if (lv === 0) k++; return "  ".repeat(lv) + (b.type === "ol" ? (lv === 0 ? k : 1) + ". " : "- ") + x; }).join("\n"));
    } else if (b.type === "table") {
      const [h, ...r] = b.rows; const cell = (c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, "<br>"); const row = (c) => "| " + c.map(cell).join(" | ") + " |";
      out.push([row(h), row(h.map(() => "---")), ...r.map(row)].join("\n"));
    } else if (b.type === "code") out.push("```" + (b.lang || "") + "\n" + b.text + "\n```");
    else if (b.type === "quote") out.push(b.text.split("\n").map((x) => "> " + x).join("\n"));
    else if (b.type === "img") out.push(`![${(b.alt || "").replace(/[\]\n]/g, " ")}](blob:${b.id})`);
    else if (b.type === "hr") out.push("---");
  }
  return out.join("\n\n");
}
export const fromMarkdown = (md) => textToArticle(md, { markdown: true });

const UL = /^(\s*)([-*+•])\s+(.*)$/, OL = /^(\s*)(\d{1,4})[.)]\s+(.*)$/;
const isRule = (l) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, "").replace(/(^|[^\\])\|$/, "$1").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n"));
const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");

export function textToArticle(text, { markdown = false } = {}) {
  const lines = String(text).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const med = (() => { const a = lines.filter((l) => l.trim()).map((l) => l.trim().length).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; })();
  const wrapped = !markdown && med >= 60; // hard-wrapped prose is joined back into paragraphs; short lines stay as they are
  const inline = (t) => (markdown ? t.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, "[$1]($2)") : escMd(t));
  const blocks = []; let i = 0, sawTitle = false;
  const blank = (k) => k >= lines.length || !lines[k].trim();
  while (i < lines.length) {
    let l = lines[i];
    if (!l.trim()) { i++; continue; }
    const fence = /^\s*(```|~~~)\s*([\w+#-]*)/.exec(l);
    if (fence) { const body = []; i++; while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]); i++; blocks.push({ type: "code", text: body.join("\n"), ...(fence[2] ? { lang: fence[2] } : {}) }); continue; }
    if (markdown) {
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
      if (h) { const lvl = h[1].length, tx = inline(h[2]); if (lvl === 1 && !sawTitle && !blocks.length) { blocks.push({ type: "title", text: tx }); sawTitle = true; } else { const nm = lvl === 2 ? /^(\d{1,3})[.)]\s+(.*)$/.exec(tx) : null; blocks.push({ type: "h", n: nm ? +nm[1] : 0, level: Math.max(1, Math.min(4, lvl === 1 ? 1 : lvl - 1)), text: nm ? nm[2] : tx }); } i++; continue; }
      const im = /^!\[([^\]]*)\]\(blob:([\w-]+)\)\s*$/.exec(l.trim());
      if (im) { blocks.push({ type: "img", id: im[2], alt: im[1] }); i++; continue; }
      if (i + 1 < lines.length && /^\s*(=+|-+)\s*$/.test(lines[i + 1]) && l.trim() && !UL.test(l) && lines[i + 1].trim().length >= 2) { const eq = lines[i + 1].trim()[0] === "="; if (eq && !sawTitle && !blocks.length) { blocks.push({ type: "title", text: inline(l.trim()) }); sawTitle = true; } else blocks.push({ type: "h", n: 0, level: eq ? 1 : 2, text: inline(l.trim()) }); i += 2; continue; }
    }
    if (isRule(l)) { blocks.push({ type: "hr" }); i++; continue; }
    // tables: pipe tables (markdown) or tab/aligned columns are only taken when the shape is clear
    if (l.includes("|") && i + 1 < lines.length && isSep(lines[i + 1])) {
      const rows = [cells(l)]; i += 2; while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      const w = rows[0].length; blocks.push({ type: "table", rows: rows.map((r) => Array.from({ length: w }, (_, k) => inline(r[k] || ""))) }); continue;
    }
    if (/^\s*>/.test(l)) { const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); blocks.push({ type: "quote", text: inline(q.join(markdown ? " " : "\n").trim()) }); continue; }
    const ulm = UL.exec(l), olm = OL.exec(l);
    // a numbered line that is a short title on its own (not followed by another number) is a heading in plain text
    const numberedHeading = !markdown && olm && !/[.,;:]$/.test(l.trim()) && l.trim().length <= 70 && (i === 0 || !lines[i - 1].trim()) && (blank(i + 1) || !(OL.test(lines[i + 1]) || UL.test(lines[i + 1])));
    if (numberedHeading) { blocks.push({ type: "h", n: +olm[2], level: 1, text: inline(olm[3].trim()) }); i++; continue; }
    if (ulm || olm) {
      const kind = ulm ? "ul" : "ol", items = [], lv = [], start = olm ? +olm[2] : 1; let base = null;
      while (i < lines.length) {
        const m = (kind === "ul" ? UL : OL).exec(lines[i]); const other = (kind === "ul" ? OL : UL).exec(lines[i]);
        if (m) { const ind = m[1].length; base ??= ind; const level = Math.max(0, Math.round((ind - base) / 2)); items.push(inline(m[3].trim())); lv.push(Math.min(level, 4)); i++; }
        else if (other && other[1].length > (base ?? 0)) { const ind = other[1].length; const level = Math.max(1, Math.round((ind - (base ?? 0)) / 2)); items.push(inline(other[3].trim())); lv.push(Math.min(level, 4)); i++; } // a nested list of the other kind
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += " " + inline(lines[i].trim()); i++; }
        else break;
      }
      blocks.push({ type: kind, items, lv, ...(kind === "ol" ? { start } : {}) }); continue;
    }
    // plain text heading: a short ALL CAPS line standing alone
    if (!markdown && /[A-Z]/.test(l) && l.trim() === l.trim().toUpperCase() && l.trim().length <= 80 && l.trim().length >= 4 && (blank(i + 1) || UL.test(lines[i + 1]) || OL.test(lines[i + 1])) && (i === 0 || blank(i - 1)) && !/[.!?]$/.test(l.trim())) {
      if (!sawTitle && !blocks.length) { blocks.push({ type: "title", text: inline(l.trim()) }); sawTitle = true; } else blocks.push({ type: "h", n: 0, level: 1, text: inline(l.trim()) });
      i++; continue;
    }
    // paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() && !(markdown && /^(#{1,6})\s/.test(lines[i])) && !/^\s*(```|~~~)/.test(lines[i]) && !(para.length && (UL.test(lines[i]) || OL.test(lines[i])) && markdown === false && false)) {
      if (para.length && (isRule(lines[i]) || /^\s*>/.test(lines[i]) || (UL.test(lines[i]) && !/^\s{2,}/.test(lines[i])))) break;
      para.push(lines[i++]);
    }
    let txt;
    if (markdown) { txt = para.map((x, k) => { const hard = k < para.length - 1 && (/ {2,}$/.test(x) || /\\$/.test(x)); return x.trim().replace(/\\$/, "") + (hard ? "\n" : k < para.length - 1 ? " " : ""); }).join("").replace(/(\w)- (\w)/g, "$1-$2"); }
    else { const body = para.map((x) => x.trim()); txt = wrapped ? body.join(" ").replace(/(\w)- (\w)/g, "$1-$2") : body.join("\n"); }
    if (markdown) txt = txt.replace(/^\\(?=[#>|`~+\-*\d])/, "");
    blocks.push({ type: "p", text: markdown ? txt : inline(txt) });
  }
  return blocks;
}


// ---------------------------------------------------------------------------------------------- questions from a structured article
// Headings such as "Question 3: ..." or "Algorithm 2: ..." are questions, the blocks under them are the answer, and a part heading above
// them is the topic. Numbered items that start with a bold label ("1. **Pillars:** ...") become "Explain: Pillars". Nothing is rewritten.
const unesc = (t) => String(t).replace(/\\([\\*`\[\]~])/g, "$1");
const plainText = (t) => unesc(t).replace(/\*\*|~~/g, "").replace(/(^|[^*\w])\*([^*]+)\*/g, "$1$2").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
const answerMd = (t) => unesc(t).replace(/~~/g, "").replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2").replace(/\[([^\]]+)\]\(([^)]*)\)/g, "$1 ($2)");
export function blocksToText(bl) {
  const out = [];
  for (const b of bl) {
    if (b.type === "p" || b.type === "quote") out.push(answerMd(b.text));
    else if (b.type === "h") out.push("**" + plainText(b.text) + "**");
    else if (b.type === "ul") out.push(b.items.map((x, i) => "  ".repeat((b.lv && b.lv[i]) || 0) + "• " + answerMd(x)).join("\n"));
    else if (b.type === "ol") out.push(b.items.map((x, i) => (b.start || 1) + i + ". " + answerMd(x)).join("\n"));
    else if (b.type === "code") out.push(b.text.split("\n").map((x) => (x.trim() ? "`" + x.replace(/`/g, "'") + "`" : "")).join("\n"));
    else if (b.type === "table") { const [h, ...r] = b.rows; out.push(r.map((row) => row.map((c, k) => (k === 0 ? "**" + plainText(c) + "**" : plainText(h[k]) + ": " + answerMd(c))).join(" · ")).join("\n")); }
  }
  return out.join("\n\n").trim();
}
const QHEAD = /^(?:q(?:uestion)?\.?\s*\d+|algorithm\s*\d+|problem\s*\d+|exercise\s*\d+)\s*[:.)\-–—]\s*(.*)$/i;
export function blocksToQA(blocks) {
  const items = []; let topic = "Imported notes", cur = null, level = 9;
  const close = () => { if (cur) { const a = blocksToText(cur.body); if (a.length >= 20) items.push({ topic: cur.topic, sub: "", q: cur.q, a, kind: cur.kind, status: "" }); cur = null; } };
  const explain = (b, k) => { const m = /^\*\*([^*]+?):?\*\*:?\s*(.*)$/s.exec(b.items[k]); return m && m[2] ? { label: plainText(m[1]).replace(/:$/, "").trim(), rest: m[2] } : null; };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "h") {
      const m = QHEAD.exec(plainText(b.text));
      if (m && m[1]) { close(); cur = { q: m[1].trim(), topic, body: [], kind: /^(algorithm|problem|exercise)/i.test(b.text) ? "concept" : /\?$/.test(m[1]) ? "concept" : "concept" }; level = b.level || 1; continue; }
      if (cur && (b.level || 1) > level) { cur.body.push(b); continue; } // a sub-heading inside an answer
      close(); level = 9; if ((b.level || 1) === 1) topic = plainText(b.text).trim() || topic;
      continue;
    }
    if (cur) { cur.body.push(b); continue; }
    if (b.type === "ol") {
      for (let k = 0; k < b.items.length; k++) {
        const e = explain(b, k); if (!e) continue;
        const body = [{ type: "p", text: e.rest }];
        if (k === b.items.length - 1 && blocks[i + 1] && blocks[i + 1].type === "ul") body.push(blocks[i + 1]); // bullets that belong to the last item
        const nxt = blocks[i + 1], follow = k === b.items.length - 1 && nxt && nxt.type === "ul";
        void follow;
        const a = blocksToText(body); if (a.length >= 20) items.push({ topic, sub: "", q: "Explain: " + e.label, a, kind: "concept", status: "" });
      }
    }
  }
  close();
  return items;
}
