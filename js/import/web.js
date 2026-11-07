// A web page becomes an article: the main content only, with headings, lists, tables, code, quotes and links.
// Reading another site from the browser needs a helper that fetches the page (see tools/url-helper/worker.js).
import { escMd } from "./blocks.js";

const KEY = "groommeup.helper";
export const DEFAULT_HELPER = "https://api.allorigins.win/raw?url={url}"; // a public free proxy, used only until you set your own
export const getHelper = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const setHelper = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* ignore */ } };

// returns { kind:"html", text, url } or { kind:"file", blob, name }
export async function fetchPage(address, { fetchImpl = fetch } = {}) {
  let u; try { u = new URL(/^[a-z]+:\/\//i.test(address) ? address : "https://" + address); } catch { throw new Error("That is not a web address."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https addresses work.");
  const tries = [u.toString()]; const helper = getHelper() || DEFAULT_HELPER; tries.push(helper.replace("{url}", encodeURIComponent(u.toString())));
  let last = "";
  for (const t of tries) {
    try {
      const res = await fetchImpl(t, { redirect: "follow" });
      if (!res.ok) { last = `The site answered ${res.status}.`; continue; }
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (/pdf/.test(type) || /\.pdf($|\?)/i.test(u.pathname)) return { kind: "file", blob: await res.blob(), name: decodeURIComponent(u.pathname.split("/").pop() || "page") .replace(/(\.pdf)?$/i, ".pdf") };
      const text = await res.text();
      if (text.length < 80) { last = "The page was empty."; continue; }
      return { kind: "html", text: text.slice(0, 4e6), url: u.toString() };
    } catch (e) { last = e.message || "Network error"; }
  }
  throw new Error(`Could not read that address (${last}). Sites often block this; try another helper in Settings, or paste the text, or save the page as a PDF and add that.`);
}

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "NAV", "FOOTER", "ASIDE", "FORM", "IFRAME", "SVG", "BUTTON", "HEADER", "TEMPLATE", "SELECT", "INPUT", "CANVAS", "VIDEO", "AUDIO"]);
const JUNK = /(cookie|consent|newsletter|subscribe|advert|sidebar|breadcrumb|share|social|comment|related|promo|popup|modal|menu)/i;
const sp = (t) => t.replace(/\s+/g, " ");

export function htmlToArticle(html, baseUrl = "") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const abs = (h) => { try { return new URL(h, baseUrl || undefined).toString(); } catch { return ""; } };
  const metaTitle = (doc.querySelector('meta[property="og:title"]') || {}).content || doc.title || "";
  const root = doc.querySelector("article") || doc.querySelector("main") || doc.querySelector('[role="main"]') || bestBlock(doc.body) || doc.body;
  const inline = (n) => {
    let o = "";
    for (const c of n.childNodes) {
      if (c.nodeType === 3) o += escMd(sp(c.nodeValue)); else if (c.nodeType !== 1 || SKIP.has(c.tagName)) continue;
      else {
        const t = c.tagName, inner = inline(c);
        if (t === "BR") o += "\n"; else if (!inner.trim()) { o += inner; continue; }
        else if (t === "B" || t === "STRONG") o += "**" + inner.trim() + "**" + (/\s$/.test(inner) ? " " : "");
        else if (t === "I" || t === "EM") o += "*" + inner.trim() + "*" + (/\s$/.test(inner) ? " " : "");
        else if (t === "CODE" || t === "KBD" || t === "SAMP") o += "`" + c.textContent.replace(/`/g, "'") + "`";
        else if (t === "S" || t === "DEL") o += "~~" + inner.trim() + "~~";
        else if (t === "A" && /^(https?:|mailto:)/i.test(abs(c.getAttribute("href") || ""))) o += `[${inner.trim()}](${abs(c.getAttribute("href"))})`;
        else o += inner;
      }
    }
    return o;
  };
  const blocks = []; let title = "";
  const pushP = (t) => { t = t.replace(/[ \t]+\n/g, "\n").replace(/\s+$/, "").replace(/^\s+/, ""); if (t) blocks.push({ type: "p", text: t }); };
  const list = (el, lvl, out) => {
    for (const li of el.children) {
      if (li.tagName !== "LI") continue;
      const own = document.createElement("div"); own.append(...[...li.childNodes].filter((x) => !(x.nodeType === 1 && /^(UL|OL)$/.test(x.tagName))).map((x) => x.cloneNode(true)));
      out.items.push(inline(own).trim()); out.lv.push(Math.min(lvl, 4));
      for (const sub of li.children) if (/^(UL|OL)$/.test(sub.tagName)) list(sub, lvl + 1, out);
    }
  };
  const walk = (el) => {
    for (const c of el.children) {
      const t = c.tagName;
      if (SKIP.has(t) || c.hidden || c.getAttribute("aria-hidden") === "true" || JUNK.test((c.id || "") + " " + (c.className && c.className.baseVal === undefined ? c.className : ""))) continue;
      if (/^H[1-6]$/.test(t)) { const x = inline(c).trim(); if (!x) continue; const n = +t[1]; if (n === 1 && !title && !blocks.length) { title = x; blocks.push({ type: "title", text: x }); } else blocks.push({ type: "h", n: 0, level: n <= 2 ? 1 : n === 3 ? 2 : 3, text: x }); }
      else if (t === "P") pushP(inline(c));
      else if (t === "UL" || t === "OL") { const b = { type: t === "UL" ? "ul" : "ol", items: [], lv: [] }; if (t === "OL" && c.getAttribute("start")) b.start = +c.getAttribute("start") || 1; list(c, 0, b); if (b.items.length) blocks.push(b); }
      else if (t === "PRE") blocks.push({ type: "code", text: c.textContent.replace(/\n$/, "") });
      else if (t === "BLOCKQUOTE") { const x = inline(c).trim(); if (x) blocks.push({ type: "quote", text: x }); }
      else if (t === "HR") blocks.push({ type: "hr" });
      else if (t === "TABLE") {
        const rows = [...c.querySelectorAll("tr")].map((tr) => [...tr.children].filter((x) => /^T[HD]$/.test(x.tagName)).map((x) => inline(x).trim().replace(/\n+/g, " ")));
        const w = Math.max(0, ...rows.map((r) => r.length)); if (rows.length && w) { rows.forEach((r) => { while (r.length < w) r.push(""); }); blocks.push({ type: "table", rows }); }
      }
      else if (t === "IMG" || t === "PICTURE" || t === "FIGURE") { const cap = c.querySelector("figcaption"); if (cap) pushP("*" + inline(cap).trim() + "*"); }
      else if (c.children.length && [...c.children].some((x) => /^(H[1-6]|P|UL|OL|PRE|BLOCKQUOTE|TABLE|DIV|SECTION|ARTICLE|FIGURE|DL)$/.test(x.tagName))) walk(c);
      else if (t === "DL") { for (const x of c.children) pushP(x.tagName === "DT" ? "**" + inline(x).trim() + "**" : inline(x)); }
      else pushP(inline(c));
    }
  };
  walk(root);
  if (!title) { const h = metaTitle.split(/\s[|–—-]\s/)[0].trim(); if (h) { title = escMd(h); blocks.unshift({ type: "title", text: title }); } }
  return { title: title.replace(/\\([\\*`\[\]~])/g, "$1").replace(/[*`~]/g, "") || "Web page", blocks };
}
// the container that holds the most paragraph text
function bestBlock(body) {
  if (!body) return null; let best = null, bw = 0;
  for (const el of body.querySelectorAll("div, section")) { if (JUNK.test((el.id || "") + " " + (typeof el.className === "string" ? el.className : ""))) continue; const w = [...el.children].filter((c) => c.tagName === "P").reduce((s, p) => s + p.textContent.length, 0); if (w > bw) { bw = w; best = el; } }
  return bw > 300 ? best : null;
}
