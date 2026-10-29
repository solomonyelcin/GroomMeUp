import { runJSTests } from "./runner-core.js";

self.onmessage = async (e) => {
  const { code, ch } = e.data;
  try {
    self.postMessage({ type: "done", out: await runJSTests(code, ch) });
  } catch (err) {
    self.postMessage({ type: "done", out: { compileError: String(err && err.message ? err.message : err), results: [], logs: [] } });
  }
};
