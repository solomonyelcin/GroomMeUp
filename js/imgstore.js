// Pictures kept as they are live in IndexedDB (localStorage is far too small for them). Everything stays on this device.
const DB = "groommeup-img", ST = "blobs";
let dbp = null;
const open = () => (dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(ST);
  r.onsuccess = () => res(r.result);
  r.onerror = () => { dbp = null; rej(r.error || new Error("Storage for pictures is not available in this browser.")); };
}));
const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(ST, mode), r = fn(t.objectStore(ST)); t.oncomplete = () => res(r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("Could not save the picture (storage may be full).")); }); };
export const putBlob = (id, blob) => tx("readwrite", (s) => s.put(blob, id));
export const getBlob = (id) => tx("readonly", (s) => s.get(id));
export const delBlob = (id) => tx("readwrite", (s) => s.delete(id)).catch(() => {});
export const newBlobId = () => "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
