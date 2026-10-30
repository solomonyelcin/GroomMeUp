// Read a .docx into ordered blocks: paragraphs (with heading/list info) and tables. No dependencies.
import { unzip } from "./zip.js";
import { decodeXml, attr } from "./xml.js";

const paraText = (xml) => {
  let out = "";
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>|<w:cr\s*\/>/g)) {
    if (m[0].startsWith("<w:tab")) out += "\t";
    else if (m[0].startsWith("<w:br") || m[0].startsWith("<w:cr")) out += "\n";
    else out += m[1];
  }
  return decodeXml(out);
};

export async function readDocx(buffer) {
  const zip = await unzip(buffer);
  const xml = await zip.text("word/document.xml");
  if (!xml) throw new Error("This zip file is not a Word document (word/document.xml is missing).");
  const body = xml.slice(xml.indexOf("<w:body"));
  const blocks = [];
  for (const m of body.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\s*\/>/g)) {
    const chunk = m[0];
    if (chunk.startsWith("<w:tbl")) {
      const rows = [];
      for (const tr of chunk.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
        const cells = [];
        for (const tc of tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) {
          cells.push([...tc[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paraText(p[0]).trim()).filter(Boolean).join("\n"));
        }
        rows.push(cells);
      }
      blocks.push({ type: "table", rows });
    } else {
      const style = (/<w:pStyle\b[^>]*>/.exec(chunk) || [""])[0];
      const sid = attr(style, "w:val") || "";
      const hm = /^(?:heading|title|subtitle|überschrift)\s*(\d)?$/i.exec(sid.replace(/\s+/g, " "));
      blocks.push({ type: "p", text: paraText(chunk).trim(), heading: hm ? (hm[1] ? +hm[1] : 1) : 0, list: /<w:numPr>/.test(chunk) });
    }
  }
  return blocks;
}
