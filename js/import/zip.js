// Minimal ZIP reader (enough for .xlsx and .docx). Uses the browser/Node built-in DecompressionStream,
// so there are no dependencies. Runs the same in the browser and in Node 18+.
const MAX_UNZIPPED = 80 * 1024 * 1024; // refuse zip bombs

export async function unzip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This is not a valid .xlsx/.docx file (it is not a zip archive). Old .xls and .doc files are not supported: open them and Save As .xlsx or .docx.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    total += usize;
    if (total > MAX_UNZIPPED) throw new Error("This file expands to an unreasonable size and was not opened.");
    entries.set(name, { method, csize, usize, lho, flags });
    p += 46 + nlen + elen + clen;
  }
  const bytes = async (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const nlen = dv.getUint16(e.lho + 26, true), elen = dv.getUint16(e.lho + 28, true);
    const start = e.lho + 30 + nlen + elen;
    const raw = u8.subarray(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method !== 8) throw new Error("Unsupported zip compression method " + e.method);
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  return {
    names: [...entries.keys()],
    has: (n) => entries.has(n),
    bytes,
    text: async (n) => { const b = await bytes(n); return b ? dec.decode(b) : null; },
  };
}
