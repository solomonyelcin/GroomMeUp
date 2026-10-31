// Encrypted personal library: a question set locked with a passphrase (AES-GCM, key from PBKDF2-SHA256) so it can sit in a
// public repo without being readable. Decrypted only in your browser.
import { store, importQuestions } from "./store.js";
import { buildQuestions } from "./import/build.js";

export const LIB_URL = "library/library.enc.json";
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFor(pass, salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass.normalize("NFKC").trim()), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptLibrary(obj, pass, iter = 600000) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(pass, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj))));
  return { v: 1, kdf: "PBKDF2-SHA256", iter, cipher: "AES-256-GCM", salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

export async function decryptLibrary(env, pass) {
  if (!env || env.v !== 1) throw new Error("This is not a GroomMeUp library file.");
  const key = await keyFor(pass, unb64(env.salt), env.iter);
  try {
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.data))));
  } catch { throw new Error("Wrong passphrase."); }
}

export async function libraryAvailable(url = LIB_URL) {
  try { const r = await fetch(url, { method: "HEAD", cache: "no-cache" }); return r.ok; } catch { return false; }
}

export async function loadLibrary(pass, url = LIB_URL) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("The library file was not found on this site.");
  return decryptLibrary(await r.json(), pass);
}

// Adds the library to the question bank. A newer copy replaces the earlier import of the same library.
export function installLibrary(lib) {
  const importId = "lib" + Date.now().toString(36);
  const b = buildQuestions(lib.items, { importId, existingCats: store.get().cats });
  const out = importQuestions({ questions: b.questions, cats: b.cats, seeds: [], record: { id: importId, name: lib.name || "My library", kind: lib.kind || "Encrypted library" }, seedConfident: false, update: true });
  return { ...out, total: b.questions.length, topics: new Set(b.questions.map((q) => q.c)).size, importId };
}
