import { esc } from "../ui.js";
import { toMarkdown } from "../import/blocks.js";
import { getBlob } from "../imgstore.js";

// Inline marks. The text is escaped first, so nothing in an imported file can add markup or script.
export function inlineHtml(text) {
  const keep = [];
  const hold = (h) => "\u0000" + (keep.push(h) - 1) + "\u0000";
  let s = String(text ?? "");
  s = s.replace(/\\([\\*`\[\]~])/g, (_, c) => hold(esc(c)));
  s = s.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/\[…\]/g, () => hold('<mark class="art-gap" title="The engine could not read this word. Edit the text to fix it.">[…]</mark>'));
  s = esc(s);
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, t, u) => hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`));
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>").replace(/~~([^~\n]+?)~~/g, "<s>$1</s>").replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/\n/g, "<br>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

const listHtml = (b) => {
  const tag = b.type, lv = b.lv || [], first = (b.start || 1);
  let h = "", depth = -1, open = [];
  b.items.forEach((x, i) => {
    const l = Math.min(lv[i] || 0, depth + 1);
    if (l > depth) { while (depth < l) { h += `<${tag} class="art-${tag}"${tag === "ol" && depth < 0 && first !== 1 ? ` start="${first}"` : ""}>`; open.push(`</${tag}>`); depth++; } }
    else { while (depth > l) { h += "</li>" + open.pop(); depth--; } h += "</li>"; }
    h += `<li>${inlineHtml(x)}`;
  });
  while (depth >= 0) { h += "</li>" + open.pop(); depth--; }
  return h;
};
// the headings of an article, for a contents list
export const tocOf = (blocks) => blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.type === "h").map(({ b, i }) => ({ id: "ah" + i, text: b.text.replace(/\\([\\*`\[\]~])/g, "$1").replace(/\*\*|~~|`/g, ""), level: b.level || 1, n: b.n }));

// one place that draws article blocks, used by the Import preview and the Articles page
export function articleHtml(blocks) {
  return blocks.map((b, i) => {
    if (b.type === "title") return `<h2 class="art-title">${inlineHtml(b.text)}</h2>`;
    if (b.type === "h") return `<h3 class="art-h art-h${b.level || 1}" id="ah${i}">${b.n ? `<span class="art-n">${b.n}</span>` : ""}${inlineHtml(b.text)}</h3>`;
    if (b.type === "ul" || b.type === "ol") return listHtml(b);
    if (b.type === "code") return `<pre class="art-code"><code>${esc(b.text)}</code></pre>`;
    if (b.type === "quote") return `<blockquote class="art-quote">${inlineHtml(b.text)}</blockquote>`;
    if (b.type === "hr") return `<hr class="art-hr">`;
    if (b.type === "img") return `<figure class="art-img"><img data-blob="${esc(b.id)}" alt="${esc(b.alt || "")}" hidden><figcaption class="small muted">${esc(b.alt || "")}</figcaption></figure>`;
    if (b.type === "table") {
      const [h, ...r] = b.rows;
      return `<div class="art-tablewrap" tabindex="0"><table class="art-table"><thead><tr>${h.map((c) => `<th>${inlineHtml(c)}</th>`).join("")}</tr></thead><tbody>${r.map((row) => `<tr>${row.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    return `<p>${inlineHtml(b.text)}</p>`;
  }).join("");
}

// pictures inside an article live in the browser's file store; show them once the HTML is in the page
export function hydrateImages(el) {
  const urls = [];
  el.querySelectorAll("img[data-blob]").forEach(async (img) => {
    try {
      const blob = await getBlob(img.dataset.blob);
      if (!blob) { img.closest("figure").querySelector("figcaption").textContent = "(picture not on this device)"; return; }
      const u = URL.createObjectURL(blob); urls.push(u); img.src = u; img.hidden = false;
    } catch { /* leave the caption */ }
  });
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}

// plain text for turning sections into practice questions: "heading" lines followed by their text
const unmark = (t) => String(t || "").replace(/\\([\\*`\[\]~])/g, "$1").replace(/\*\*|~~/g, "").replace(/\[([^\]]+)\]\((?:https?:|mailto:)[^)]*\)/g, "$1");
export function notesText(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === "title" || b.type === "img" || b.type === "hr") continue;
    if (b.type === "h") out.push(unmark(b.text).replace(/[?:]+$/, ""));
    else if (b.type === "p" || b.type === "quote") out.push(unmark(b.text));
    else if (b.type === "code") out.push(b.text);
    else if (b.type === "ul" || b.type === "ol") out.push(b.items.map((x, i) => (b.type === "ol" ? i + 1 + ". " : "• ") + unmark(x)).join("\n"));
    else if (b.type === "table") out.push(b.rows.map((r) => r.map(unmark).join(": ")).join("\n"));
  }
  return out.join("\n\n");
}
// everything searchable in an article
export const searchText = (a) => [a.title, a.name, ...(a.blocks || []).map((b) => b.text || (b.items || []).join(" ") || (b.rows || []).flat().join(" ") || b.alt || "")].join(" ").toLowerCase();
export { toMarkdown };
