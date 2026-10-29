// Pure, DOM-free test runners. Used by the browser worker AND by the Node verification script,
// so every reference solution in the repo is proven to pass its own tests.

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

const clone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const show = (v) => { try { return v === undefined ? "undefined" : JSON.stringify(v, (_, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x)); } catch { return String(v); } };

export async function runJSTests(code, ch) {
  const logs = [];
  const fakeConsole = { log: (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : show(x))).join(" ")) };
  let userFn;
  try {
    const factory = new Function("console", `${code}\n;return typeof ${ch.fn} !== 'undefined' ? ${ch.fn} : undefined;`);
    userFn = factory(fakeConsole);
  } catch (e) {
    return { compileError: String(e && e.message ? e.message : e), results: [], logs };
  }
  if (typeof userFn !== "function") {
    return { compileError: `Could not find a function or class named "${ch.fn}". Keep that name.`, results: [], logs };
  }
  const results = [];
  for (const t of ch.tests) {
    const started = Date.now();
    try {
      let got;
      if (t.call) got = await new Function("fn", `return ${t.call}`)(userFn);
      else got = await userFn(...clone(t.args));
      results.push({ ok: deepEqual(got, t.expected), got: show(got), expected: show(t.expected), hidden: !!t.hidden, input: t.call ? "custom scenario" : show(t.args), ms: Date.now() - started });
    } catch (e) {
      results.push({ ok: false, got: "Error: " + (e && e.message ? e.message : e), expected: show(t.expected), hidden: !!t.hidden, input: t.call ? "custom scenario" : show(t.args), ms: Date.now() - started });
    }
  }
  return { results, logs };
}

// `SQL` is an initialised sql.js module (browser: window.initSqlJs result, Node: require('sql.js')).
export function runSQLTest(SQL, schema, ch, userQuery) {
  const db = new SQL.Database();
  try {
    db.exec(schema);
    let expected;
    try { expected = db.exec(ch.solution)[0] || { columns: [], values: [] }; }
    catch (e) { return { error: "Reference query failed: " + e.message }; }
    let got;
    try { got = db.exec(userQuery)[0] || { columns: [], values: [] }; }
    catch (e) { return { error: e.message }; }
    const norm = (r) => r.values.map((row) => JSON.stringify(row));
    const cols = (r) => r.columns.map((c) => c.toLowerCase());
    const sameCols = JSON.stringify(cols(got)) === JSON.stringify(cols(expected));
    let a = norm(got), b = norm(expected);
    if (!ch.ordered) { a = [...a].sort(); b = [...b].sort(); }
    const sameRows = JSON.stringify(a) === JSON.stringify(b);
    return { ok: sameCols && sameRows, sameCols, sameRows, got, expected };
  } finally { db.close(); }
}
