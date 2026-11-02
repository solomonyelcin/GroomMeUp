// Page furniture ("Saikat Banerjee Page 3", "Page 4 of 20", "- 7 -") is never a question, answer or topic.
const NUMBERED = /^\s*(?:Q(?:uestion)?\s*)?\d{1,4}\s*[.):\-–]/i;

export function isPageMarker(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 90 || /[?]\s*$/.test(t) || NUMBERED.test(t)) return false;
  if (/^[-–—\s]*\d{1,4}[-–—\s]*$/.test(t)) return true;                 // "- 7 -"
  const m = /\bpage\s*\.?\s*(?:\d+(?:\s*(?:of|\/)\s*\d+)?|\*)(?!\w)/i.exec(t);
  if (!m) return false;
  const rest = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).replace(/[|\-–—•·:,]+/g, " ").trim();
  return rest.split(/\s+/).filter(Boolean).length <= 6;                 // a name, a title or nothing around the page number
}

export function stripMarkers(blocks) {
  return blocks.filter((b) => b.type === "table" || !isPageMarker(b.text));
}
