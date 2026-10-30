// Tiny helpers for reading Office XML without a DOM (so the same code runs in Node tests).
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decodeXml = (s) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, g) => {
    if (g[0] === "#") { const n = g[1] === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); try { return String.fromCodePoint(n); } catch { return ""; } }
    return NAMED[g] ?? m;
  }).replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => (h.toUpperCase() === "000D" ? "" : String.fromCharCode(parseInt(h, 16))));

export const attr = (tag, name) => {
  const m = new RegExp(`(?:^|[\\s<])${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
};
