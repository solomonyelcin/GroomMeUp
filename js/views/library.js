// The Library: questions, articles, FAQs and the place to add material, in one page with tabs.
import { esc } from "../ui.js";
import { newCount } from "../dailypicks.js";

const TABS = [["home", "Home", "./libhome.js"], ["roadmap", "Roadmap", "./roadmap.js"], ["daily", "Daily picks", "./daily.js"], ["questions", "Questions", "./bank.js"], ["articles", "Articles", "./articles.js"], ["faqs", "FAQs", "./faq.js"], ["add", "Add material", "./add.js"]];
export const TAB_ALIAS = { bank: "questions", articles: "articles", faq: "faqs", import: "add" };

export async function view(root, ctx) {
  const tab = TABS.find((t) => t[0] === ctx.params.get("tab")) || TABS[0];
  root.innerHTML = `<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Library</h1><nav class="mode-tabs" aria-label="Library sections">${TABS.map(([id, label]) => `<a href="#/library?tab=${id}" ${id === tab[0] ? 'aria-current="page"' : ""}>${esc(label)}</a>`).join("")}</nav><div class="lib-body" id="libBody"></div>`;
  const body = root.querySelector("#libBody");
  newCount().then((n) => { const a = root.querySelector('a[href="#/library?tab=daily"]'); if (n && a && !a.querySelector(".badge")) a.insertAdjacentHTML("beforeend", `<span class="badge" aria-label="${n} new">${n}</span>`); });
  const m = await import(tab[2] + "?v=" + encodeURIComponent(window.__V || "dev"));
  if (!body.isConnected) return null; // another page was opened while this one loaded
  const cleanup = (await m.view(body, ctx)) || null;
  // a section's own big heading becomes a sub-heading, the page's heading is the tab
  body.querySelectorAll("h1").forEach((h) => { const h2 = document.createElement("h2"); h2.id = h.id; h2.className = h.className; h2.innerHTML = h.innerHTML; h.replaceWith(h2); });
  return cleanup;
}
