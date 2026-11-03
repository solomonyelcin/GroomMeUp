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

// A topic name that is really a question, a level-marked line, a SQL statement or a page header.
export function isBogusTopic(name) {
  const t = String(name || "").trim();
  if (!t) return false;
  if (isPageMarker(t)) return true;
  if (/^\(\s*[BIA]\s*\)/i.test(t) || /\?\s*$/.test(t)) return true;
  if (/^(?:SET|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK|DECLARE|EXEC|EXECUTE|GRANT|TRUNCATE)\s+\S/.test(t)) return true;
  if (/^(?:what|why|how|when|where|which|who|explain|describe|define|differentiate|difference|compare|can|is|are|do|does)\b/i.test(t) && t.split(/\s+/).length >= 5) return true;
  return t.split(/\s+/).length > 10;
}

// Question text without the numbering or level marker it had in the source document:
// "(A) What is ...", "(b) ...", "(1) ...", "12. ...", "Q3: ...", "1) ...", "[4] ..." -> "What is ..."
const LEAD = /^\s*(?:\(\s*(?:[A-Za-z]|\d{1,4})\s*\)|\[\s*\d{1,4}\s*\]|(?:Q(?:uestion)?\s*\.?\s*)?\d{1,4}\s*[.):\-–—]|[A-Za-z]\s?[.)](?=\s))\s*/i;
export function cleanQuestion(text) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) { // markers can stack: "1. (B) What is ..."
    const m = LEAD.exec(t);
    if (!m) break;
    const rest = t.slice(m[0].length).trim();
    if (rest.length < 4 || !/[A-Za-z]/.test(rest)) break;
    t = rest;
  }
  t = t.replace(/^[\s\-–—:.,;]+/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}
