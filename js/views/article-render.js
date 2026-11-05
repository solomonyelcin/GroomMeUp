import { esc } from "../ui.js";
import { toMarkdown } from "../import/ocrlayout.js";

// one place that draws article blocks, used by the Import preview and the Articles page
export function articleHtml(blocks) {
  return blocks.map((b) => {
    if (b.type === "title") return `<h2 class="art-title">${esc(b.text)}</h2>`;
    if (b.type === "h") return `<h3 class="art-h">${b.n ? `<span class="art-n">${b.n}</span>` : ""}${esc(b.text)}</h3>`;
    if (b.type === "ul") return `<ul class="art-ul">${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    if (b.type === "table") { const [h, ...r] = b.rows; return `<div class="art-tablewrap"><table class="art-table"><thead><tr>${h.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${r.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; }
    return `<p>${esc(b.text).replace(/\[…\]/g, '<mark class="art-gap" title="The engine could not read this word. Edit the text to fix it.">[…]</mark>')}</p>`;
  }).join("");
}

// plain text for turning sections into practice questions: "heading" lines followed by their text
export function notesText(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === "title") continue;
    if (b.type === "h") out.push(b.text.replace(/[?:]+$/, ""));
    else if (b.type === "p") out.push(b.text);
    else if (b.type === "ul") out.push(b.items.map((x) => "• " + x).join("\n"));
    else if (b.type === "table") out.push(b.rows.map((r) => r.join(": ")).join("\n"));
  }
  return out.join("\n\n");
}
export { toMarkdown };
