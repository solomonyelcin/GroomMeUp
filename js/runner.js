// Browser-side runners: JS in a Web Worker (with a hard timeout), SQL via sql.js (WASM).
import { runSQLTest } from "./runner-core.js";
import { SQL_SCHEMA } from "./data/index.js";

export function runJS(code, ch, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let worker;
    try { worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" }); }
    catch (e) { return resolve({ compileError: "Your browser blocked the code worker: " + e.message, results: [], logs: [] }); }
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ compileError: `Timed out after ${timeoutMs / 1000}s. Check for an infinite loop or a promise that never resolves.`, results: [], logs: [] });
    }, timeoutMs);
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); resolve(e.data.out); };
    worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); resolve({ compileError: e.message || "Worker error", results: [], logs: [] }); };
    worker.postMessage({ code, ch });
  });
}

let sqlPromise;
function loadSQL() {
  if (sqlPromise) return sqlPromise;
  const base = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/";
  sqlPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = base + "sql-wasm.js";
    s.onload = () => window.initSqlJs({ locateFile: (f) => base + f }).then(resolve, reject);
    s.onerror = () => reject(new Error("Could not load the SQL engine (sql.js). Check your internet connection."));
    document.head.appendChild(s);
  });
  sqlPromise.catch(() => { sqlPromise = null; });
  return sqlPromise;
}

export async function runSQL(query, ch) {
  const SQL = await loadSQL();
  return runSQLTest(SQL, SQL_SCHEMA, ch, query);
}

export async function runOnPiston(url, language, code) {
  const r = await fetch(url.replace(/\/$/, "") + "/execute", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, version: "*", files: [{ content: code }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || `Runner error ${r.status}`);
  return { stdout: d.run?.stdout || "", stderr: d.run?.stderr || d.compile?.stderr || "", code: d.run?.code };
}
