import { store } from "../store.js";
import { getCfg, setCfg, clearCfg, testConnection } from "../github.js";
import { getHelper, setHelper, DEFAULT_HELPER } from "../import/web.js";
import { backupCardHtml, wireBackupCard } from "../backup-ui.js";
import { openBackup, applyBackup, summarise } from "../backup.js";
import { makeProgressCode, applyProgressCode } from "../transfer.js";
import { PROVIDERS, pingAI } from "../ai.js";
import { esc, toast, busy, download, $, $$ } from "../ui.js";
import { THEMES, getTheme, setTheme } from "../theme.js";

export function view(root, ctx) {
  const ghc = getCfg();
  const s = store.get().settings;
  root.innerHTML = `
    <header class="page-head"><h1>Settings</h1><p>Everything is free. AI is optional: the app works fully offline with key-point scoring.</p></header>

    ${backupCardHtml()}
    <section class="card"><h2>Your details</h2>
      <div class="grid g2"><div class="field"><label for="nm">First name (for the dashboard greeting)</label><input id="nm" type="text" value="${esc(s.name)}"></div>
      <div class="field"><label for="tg">Target date to be offer-ready</label><input id="tg" type="date" value="${esc(s.target)}"></div></div></section>

    <section class="card" style="margin-top:16px"><h2>Appearance</h2>
      <p class="muted">Pick a theme. It applies instantly and is remembered on this device.</p>
      <div class="themes" role="radiogroup" aria-label="Theme">${THEMES.map((t) => `<button class="theme-card" role="radio" aria-checked="${t.id === getTheme()}" data-t="${t.id}"><span class="sw" data-theme="${t.id === "system" ? "chalk" : t.id}"><i style="background:var(--rail-bg)"></i><i style="background:var(--paper)"></i><i style="background:var(--cobalt)"></i><i style="background:var(--chalk)"></i></span><strong>${esc(t.name)}</strong><span class="small muted">${esc(t.note)}</span></button>`).join("")}</div></section>

    <section class="card" style="margin-top:16px"><h2>AI feedback</h2>
      <p class="muted">Free AI with no key is on by default. For better quality, create a free key with Gemini, Groq or OpenRouter and paste it here. Keys stay in this browser and go only to that provider. Free tiers have rate limits.</p>
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
      <div class="row"><button class="btn" id="exp">Export backup</button><label class="btn" style="margin:0">Restore from file<input id="imp" type="file" accept=".json,application/json,.txt" hidden></label><button class="btn danger" id="rst">Erase everything</button></div></section>

    <section class="card" style="margin-top:16px" aria-labelledby="gh" id="ghCard"><h2 id="gh">Your library in your own GitHub repository</h2>
      <p class="muted" style="margin-top:0">Files, articles and pictures you add are saved in a repository of yours, so they show on every device and nothing stays in this browser. Use a <strong>private</strong> repository: <a href="https://github.com/new?name=GroomMeUp-data&amp;visibility=private&amp;description=My+GroomMeUp+library" target="_blank" rel="noopener noreferrer">create GroomMeUp-data</a> (free), then make a <strong>fine-grained personal access token</strong> limited to that one repository with permission <em>Contents: Read and write</em> (GitHub &rarr; Settings &rarr; Developer settings &rarr; Fine-grained tokens). Put your GitHub user name and that repository below. The token stays in this browser and is never included in backups. In a private repository only you can read the files.</p>
      <div class="grid g2"><div class="field"><label for="ghowner">GitHub user name</label><input id="ghowner" value="${esc(ghc.owner)}" autocomplete="off"></div><div class="field"><label for="ghrepo">Repository</label><input id="ghrepo" value="${esc(ghc.repo)}" autocomplete="off"></div></div>
      <div class="grid g2"><div class="field"><label for="ghbranch">Branch</label><input id="ghbranch" value="${esc(ghc.branch)}" autocomplete="off"></div><div class="field"><label for="ghtoken">Access token</label><input id="ghtoken" type="password" placeholder="${ghc.token ? "Saved (paste to replace)" : "github_pat_…"}" autocomplete="off"></div></div>
      <div class="row"><button class="btn primary" id="ghsave">Save and test</button><button class="btn" id="ghclear">Disconnect</button></div><p id="ghmsg" class="small" style="margin:8px 0 0" aria-live="polite"></p>
      <div class="field" style="margin-top:14px"><label for="helper">Web address helper (for “From a web address”)</label><input id="helper" value="${esc(getHelper())}" placeholder="${esc(DEFAULT_HELPER)}" autocomplete="off"><p class="small muted" style="margin:4px 0 0">Leave empty to use a public free helper. For privacy and reliability, deploy your own free one from <code>tools/url-helper/worker.js</code> (Cloudflare Workers) and paste its address here, with <code>{url}</code> where the page address goes.</p></div></section>

    <section class="card" style="margin-top:16px" aria-labelledby="mv"><h2 id="mv">Move progress to another device</h2>
      <p class="muted">Your streak, badges, scores and notes stay in each browser. To carry them to your phone or laptop: tap <strong>Copy progress code</strong> here, then paste it below on the other device and tap <strong>Merge</strong>. Nothing is overwritten: the two histories are combined. Your questions are not included, so load them from your library or files on each device.</p>
      <div class="row"><button class="btn" id="cpc">Copy progress code</button></div>
      <div class="field" style="margin-top:12px"><label for="pcode">Paste a progress code from another device</label><textarea id="pcode" style="min-height:70px" placeholder="GMU1...."></textarea></div>
      <div class="row"><button class="btn primary" id="mrg">Merge</button></div><p id="pmsg" class="small" style="margin:8px 0 0" aria-live="polite"></p></section>
  `;
  $$(".theme-card").forEach((b) => (b.onclick = () => { setTheme(b.dataset.t); $$(".theme-card").forEach((x) => x.setAttribute("aria-checked", x === b)); }));
  $("#cpc").onclick = async () => {
    try { const c = await makeProgressCode(); try { await navigator.clipboard.writeText(c); $("#pmsg").textContent = "Copied. Paste it on your other device under Settings, Move progress."; } catch { $("#pcode").value = c; $("#pcode").select(); $("#pmsg").textContent = "Select and copy the code that appeared in the box below, then paste it on your other device."; } }
    catch (e) { $("#pmsg").textContent = "Could not create the code: " + e.message; }
  };
  $("#mrg").onclick = async () => {
    try { const r = await applyProgressCode($("#pcode").value); $("#pmsg").textContent = `Merged. ${r.added} new answer${r.added === 1 ? "" : "s"} added; badges, streak and notes combined.`; $("#pcode").value = ""; }
    catch (e) { $("#pmsg").textContent = e.message; }
  };
  const box = $("#pbox");
  const drawBox = () => {
    const p = $("#pv").value, meta = PROVIDERS[p];
    box.innerHTML = meta.needsKey ? `
      <div class="field"><label for="key">API key</label><input id="key" type="password" autocomplete="off" value="${esc(s.keys[p] || "")}" placeholder="Paste your ${esc(meta.name.split(" (")[0])} key"></div>
      <div class="field"><label for="mdl">Model</label><input id="mdl" type="text" value="${esc(s.models[p] || meta.model)}"><div class="hint">Get a free key at <a href="${meta.keyUrl}" target="_blank" rel="noopener noreferrer">${esc(meta.keyUrl.replace("https://", ""))}</a>. Model names change, so update this field if the provider retires one.</div></div>`
      : meta.keyless ? `<p class="small muted">${esc(meta.note)} Your answer, the question and a short profile are sent to text.pollinations.ai. Choose Offline to keep everything on this device.</p>`
      : `<p class="small muted">No AI. Answers are scored by how many key points they cover. Fast and private, good for daily practice.</p>`;
  };
  $("#pv").onchange = drawBox; drawBox();

  const saveAI = () => store.update((st) => {
    st.settings.name = $("#nm").value.trim(); st.settings.target = $("#tg").value;
    const p = $("#pv").value; st.settings.provider = p; st.settings.aiChoice = true;
    if (PROVIDERS[p].needsKey) { st.settings.keys[p] = $("#key").value.trim(); st.settings.models[p] = $("#mdl").value.trim() || PROVIDERS[p].model; }
  });
  $("#saveAI").onclick = () => { saveAI(); toast("Saved"); };
  $("#test").onclick = async (e) => {
    saveAI();
    if ($("#pv").value === "offline") return toast("Offline mode needs no connection");
    if (!$("#key").value.trim()) return toast("Paste a key first", true);
    const btn = e.currentTarget;
    busy(btn, true, "Testing");
    try { const r = await pingAI(); toast("Connected: " + r); } catch (err) { toast(err.message, true); }
    busy(btn, false);
  };
  $("#savePu").onclick = () => { store.update((st) => (st.settings.pistonUrl = $("#pu").value.trim())); toast("Saved"); };
  $("#exp").onclick = () => download(`groommeup-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
  $("#imp").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const text = await f.text(); let r = await openBackup(text);
      if (r.needsPass) { const pass = prompt("This backup is encrypted. Passphrase:"); if (!pass) return; r = await openBackup(text, pass); }
      if (r.kind === "code") { const o = await applyProgressCode(text); toast(`Merged ${o.added} answers from the code`); return; }
      if (!confirm("Replace everything in this browser with this backup? Your current progress here will be overwritten.")) return;
      applyBackup(r); toast("Backup restored"); location.reload();
    } catch (err) { toast("Restore failed: " + err.message, true); }
  };
  $("#rst").onclick = () => { if (confirm("This erases all progress, logs and custom questions in this browser. Continue?")) { store.reset(); toast("Erased"); location.hash = "#/dashboard"; location.reload(); } };
  $("#ghsave").onclick = async (e) => {
    const old = getCfg(), tok = $("#ghtoken").value.trim() || old.token || "";
    setCfg({ owner: $("#ghowner").value.trim(), repo: $("#ghrepo").value.trim(), branch: $("#ghbranch").value.trim() || "main", token: tok });
    const m = $("#ghmsg"); if (!tok) { m.textContent = "Saved. Paste a token to connect."; return; }
    const btn = e.currentTarget; busy(btn, true, "Testing");
    try { m.textContent = "Connected to " + (await testConnection()) + "."; $("#ghtoken").value = ""; } catch (err) { m.textContent = err.message; }
    busy(btn, false);
  };
  $("#helper").onchange = (e) => { const v = e.target.value.trim(); if (v && !v.includes("{url}")) { toast("The helper address must contain {url}.", true); return; } setHelper(v); toast("Helper saved"); };
  $("#ghclear").onclick = () => { clearCfg(); $("#ghmsg").textContent = "Disconnected. The token was removed from this browser."; $("#ghtoken").placeholder = "github_pat_…"; };
  wireBackupCard(root);
  if (ctx?.params?.get("focus") === "gh") setTimeout(() => $("#ghCard")?.scrollIntoView({ block: "start" }), 80);
  if (ctx?.params?.get("focus") === "backup") setTimeout(() => $("#backupCard")?.scrollIntoView({ block: "start" }), 80); // after the router has scrolled to the top
  void $$;
}
