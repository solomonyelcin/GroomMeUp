// Build the encrypted library from your Excel workbook.
//   LIB_PASS='your passphrase' node tools/make-library.mjs "My workbook.xlsx" library/library.enc.json "Library name"
// The passphrase is never stored; keep the Excel file out of the repository.
import fs from "node:fs";
import { parseFile } from "../js/import/index.js";
import { encryptLibrary, decryptLibrary } from "../js/library.js";

const [src, out = "library/library.enc.json", name = "My library"] = process.argv.slice(2);
const pass = process.env.LIB_PASS;
if (!src || !pass) { console.error("Usage: LIB_PASS=... node tools/make-library.mjs <workbook.xlsx> [out.json] [name]"); process.exit(1); }
const res = await parseFile(new File([fs.readFileSync(src)], src.split("/").pop()));
if (!res.items.length) { console.error("No questions found in", src); process.exit(1); }
const lib = { name, kind: "Excel workbook (encrypted library)", items: res.items.map(({ topic, sub, q, a, status, kind, o, correct, e }) => ({ topic, sub, q, a, status: status || "", kind, ...(o ? { o, correct, e } : {}) })) };
const env = await encryptLibrary(lib, pass);
const back = await decryptLibrary(env, pass); // prove it opens before writing
if (back.items.length !== lib.items.length) throw new Error("round trip failed");
fs.mkdirSync(out.replace(/[^/]+$/, "") || ".", { recursive: true });
fs.writeFileSync(out, JSON.stringify(env));
console.log(`Encrypted ${lib.items.length} questions to ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
