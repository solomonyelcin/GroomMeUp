import { store } from "../store.js";
import { PROVIDERS, pingAI } from "../ai.js";
import { esc, toast, busy, download, $, $$ } from "../ui.js";

export function view(root) {
  const s = store.get().settings;
  root.innerHTML = `
    <header class="page-head"><h1>Settings</h1><p>Everything is free. AI is optional: the app works fully offline with key-point scoring.</p></header>

    <section class="card"><h2>Your details</h2>
      <div class="grid g2"><div class="field"><label for="nm">First name (for the dashboard greeting)</label><input id="nm" type="text" value="${esc(s.name)}"></div>
      <div class="field"><label for="tg">Target date to be offer-ready</label><input id="tg" type="date" value="${esc(s.target)}"></div></div></section>

    <section class="card" style="margin-top:16px"><h2>Free AI feedback</h2>
      <p class="muted">Pick a provider, create a free key, and paste it below. The key is stored only in this browser and sent only to that provider. Free tiers have rate limits, so evaluate answers one at a time.</p>
      <div class="field"><label for="pv">Provider</label><select id="pv">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === s.provider ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>
      <div id="pbox"></div>
      <div class="callout warn small" style="margin-top:12px">Do not paste confidential company details into answers you send to an AI provider. Free tiers may use your input to improve their models.</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="saveAI">Save</button><button class="btn" id="test">Test connection</button></div></section>

    <section class="card" style="margin-top:16px"><h2>Run C# for real (optional)</h2>
      <p class="muted">Browsers cannot execute C#. If you host a free <a href="https://github.com/engineer-man/piston" target="_blank" rel="noopener noreferrer">Piston</a> runner (Docker) you can run C# challenges here. Leave empty to use rubric review instead.</p>
      <div class="field"><label for="pu">Piston API URL</label><input id="pu" type="text" placeholder="http://localhost:2000/api/v2" value="${esc(s.pistonUrl)}"></div>
      <button class="btn" id="savePu">Save runner URL</button></section>

    <section class="card" style="margin-top:16px"><h2>Your data</h2>
      <p class="muted">Progress, interview log and custom questions live in this browser. Export a backup now and then, and use it to move to another browser or device. API keys are never included in exports.</p>
      <div class="row"><button class="btn" id="exp">Export backup</button><label class="btn" style="margin:0">Import backup<input id="imp" type="file" accept="application/json" hidden></label><button class="btn danger" id="rst">Erase everything</button></div></section>
  `;
  const box = $("#pbox");
  const drawBox = () => {
    const p = $("#pv").value, meta = PROVIDERS[p];
    box.innerHTML = meta.needsKey ? `
      <div class="field"><label for="key">API key</label><input id="key" type="password" autocomplete="off" value="${esc(s.keys[p] || "")}" placeholder="Paste your ${esc(meta.name.split(" (")[0])} key"></div>
      <div class="field"><label for="mdl">Model</label><input id="mdl" type="text" value="${esc(s.models[p] || meta.model)}"><div class="hint">Get a free key at <a href="${meta.keyUrl}" target="_blank" rel="noopener noreferrer">${esc(meta.keyUrl.replace("https://", ""))}</a>. Model names change, so update this field if the provider retires one.</div></div>`
      : `<p class="small muted">No key needed. Answers are scored by how many key points they cover. Good for daily practice; add AI when you want critique of wording and depth.</p>`;
  };
  $("#pv").onchange = drawBox; drawBox();

  const saveAI = () => store.update((st) => {
    st.settings.name = $("#nm").value.trim(); st.settings.target = $("#tg").value;
    const p = $("#pv").value; st.settings.provider = p;
    if (PROVIDERS[p].needsKey) { st.settings.keys[p] = $("#key").value.trim(); st.settings.models[p] = $("#mdl").value.trim() || PROVIDERS[p].model; }
  });
  $("#saveAI").onclick = () => { saveAI(); toast("Saved"); };
  $("#test").onclick = async (e) => {
    saveAI();
    if (!PROVIDERS[$("#pv").value].needsKey) return toast("Offline mode needs no connection");
    if (!$("#key").value.trim()) return toast("Paste a key first", true);
    busy(e.currentTarget, true, "Testing");
    try { const r = await pingAI(); toast("Connected: " + r); } catch (err) { toast(err.message, true); }
    busy(e.currentTarget, false);
  };
  $("#savePu").onclick = () => { store.update((st) => (st.settings.pistonUrl = $("#pu").value.trim())); toast("Saved"); };
  $("#exp").onclick = () => download(`groommeup-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
  $("#imp").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { store.importJSON(await f.text()); toast("Backup imported"); location.reload(); } catch (err) { toast("Import failed: " + err.message, true); } };
  $("#rst").onclick = () => { if (confirm("This erases all progress, logs and custom questions in this browser. Continue?")) { store.reset(); toast("Erased"); location.hash = "#/dashboard"; location.reload(); } };
  void $$;
}
