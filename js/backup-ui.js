// The screens for backups: the first-launch restore gate, the reminder bar and the Settings card.
import { store } from "./store.js";
import { applyProgressCode } from "./transfer.js";
import { libraryAvailable, loadLibrary, installLibrary } from "./library.js";
import { connected } from "./github.js";
import { esc, toast, busy, $ } from "./ui.js";
import { backupStatus, lastBackup, setPref, snoozeReminder, saveBackupFile, saveEncryptedToGitHub, openBackup, applyBackup, fetchGitHubBackup, summarise, setupDone, markSetupDone, requestPersistence, storageInfo, strongEnough } from "./backup.js";

const ago = (d) => (d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`);
const sumText = (x) => [`${x.answers} answer${x.answers === 1 ? "" : "s"}`, x.questions && `${x.questions} question${x.questions === 1 ? "" : "s"}`, x.notes && `${x.notes} note${x.notes === 1 ? "" : "s"}`, x.interviews && `${x.interviews} interview${x.interviews === 1 ? "" : "s"}`, x.articles && `${x.articles} article${x.articles === 1 ? "" : "s"}`].filter(Boolean).join(", ");

// ---------- first launch: restore before starting empty ----------
export const needsGate = () => !store.hasSaved() && !setupDone();

export function showGate() {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "gate"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "gt");
    el.innerHTML = `<div class="gate-card">
      <h1 id="gt" tabindex="-1">Welcome to GroomMeUp</h1>
      <p>Nothing is saved in this browser yet. If you used the app before, on this device or another, <strong>restore it now</strong> instead of starting empty.</p>
      <details class="gate-opt" open><summary>Restore from a backup file</summary>
        <p class="small muted">The <code>groommeup-backup-….json</code> file saved by “Back up now” (or the older “Export backup”).</p>
        <label class="btn" style="margin:0" for="gFile">Choose backup file</label><input id="gFile" type="file" accept=".json,application/json,.txt" hidden>
        <div id="gFilePass" hidden class="field" style="margin-top:8px"><label for="gFp">This file is encrypted. Passphrase</label><input id="gFp" type="password" autocomplete="off"><button class="btn primary sm" id="gFpGo" style="margin-top:6px">Unlock and restore</button></div></details>
      <details class="gate-opt"><summary>Paste a progress code</summary>
        <p class="small muted">A code starting with <code>GMU1.</code> from Settings on another device. It carries scores, streak, badges, notes and logs (not your question bank).</p>
        <textarea id="gCode" placeholder="GMU1...." style="min-height:64px"></textarea><button class="btn primary sm" id="gCodeGo" style="margin-top:6px">Restore from code</button></details>
      <details class="gate-opt"><summary>Restore the encrypted backup from GitHub</summary>
        <p class="small muted">The copy saved to <code>backup/progress.enc.json</code> in your repository by “Back up now”. Needs the passphrase you chose then.</p>
        <div class="field"><label for="gGhp">Passphrase</label><input id="gGhp" type="password" autocomplete="off"></div><button class="btn primary sm" id="gGhGo">Find and restore</button></details>
      <details class="gate-opt" id="gLib" hidden><summary>Unlock my encrypted question library</summary>
        <p class="small muted">Your questions from <code>library/library.enc.json</code>, decrypted only in this browser.</p>
        <div class="field"><label for="gLibp">Library passphrase</label><input id="gLibp" type="password" autocomplete="off"></div><button class="btn primary sm" id="gLibGo">Unlock library</button></details>
      <p id="gMsg" class="gate-msg" role="status" aria-live="polite"></p>
      <div class="row" style="gap:10px;margin-top:6px"><button class="btn primary" id="gDone">Start empty</button></div>
      <p class="small muted" style="margin:10px 0 0">Everything stays on your device. Nothing is sent anywhere.</p></div>`;
    document.body.append(el); document.body.classList.add("iv-lock", "gating");
    $("#gt", el).focus();
    let restored = false;
    const msg = (t, bad) => { const m = $("#gMsg", el); m.textContent = t; m.classList.toggle("bad", !!bad); };
    const done = (text) => { restored = true; $("#gDone", el).textContent = "Continue"; msg(text); };
    libraryAvailable().then((y) => { if (y) $("#gLib", el).hidden = false; });

    let pending = null; // an encrypted file waiting for its passphrase
    const open = async (text, pass) => {
      const r = await openBackup(text, pass);
      if (r.needsPass) { pending = text; $("#gFilePass", el).hidden = false; $("#gFp", el).focus(); msg("This backup is encrypted. Enter its passphrase."); return; }
      if (r.kind === "code") { const o = await applyProgressCode(r.text); done(`Restored from the code: ${o.added} answer${o.added === 1 ? "" : "s"}.`); return; }
      done("Restored " + sumText(applyBackup(r)) + ".");
    };
    $("#gFile", el).onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { await open(await f.text()); } catch (err) { msg(err.message, true); } };
    $("#gFpGo", el).onclick = async () => { try { await open(pending, $("#gFp", el).value); $("#gFilePass", el).hidden = true; } catch (err) { msg(err.message, true); } };
    $("#gCodeGo", el).onclick = async () => { try { await open($("#gCode", el).value); } catch (err) { msg(err.message, true); } };
    $("#gGhGo", el).onclick = async (e) => {
      const b = e.currentTarget, pass = $("#gGhp", el).value; if (!pass) { msg("Enter the backup passphrase.", true); return; }
      busy(b, true, "Looking");
      try { const t = await fetchGitHubBackup(); if (!t) throw new Error("No encrypted backup was found on GitHub yet. If you just made one, wait a minute for the site to update."); await open(t, pass); }
      catch (err) { msg(err.message, true); }
      busy(b, false);
    };
    $("#gLibGo", el).onclick = async (e) => {
      const b = e.currentTarget, pass = $("#gLibp", el).value; if (!pass.trim()) { msg("Enter the library passphrase.", true); return; }
      busy(b, true, "Unlocking");
      try { const o = installLibrary(await loadLibrary(pass)); done(`Library unlocked: ${o.total} questions in ${o.topics} topics.`); }
      catch (err) { msg(err.message, true); }
      busy(b, false);
    };
    $("#gDone", el).onclick = () => {
      markSetupDone(); if (restored) { try { localStorage.setItem("groommeup.tour", "seen"); } catch { /* ignore */ } }
      el.remove(); document.body.classList.remove("iv-lock", "gating"); resolve(restored);
    };
  });
}

// ---------- the reminder bar ----------
// The bar sits at the top of the page content. The router rebuilds #main on every page, so the bar is placed again each time.
export function mountBackupBar() {
  const main = $("#main"); if (!main) return;
  let bar = $("#backupBar");
  if (!bar || bar.parentNode !== main) {
    bar?.remove();
    bar = document.createElement("div"); bar.id = "backupBar"; bar.className = "backup-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Backup reminder"); bar.hidden = true;
    main.prepend(bar);
  }
  const draw = () => {
    const st = backupStatus(), p = lastBackup();
    if (!st.due) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = `<div class="bb-text"><strong>${st.never ? "You have not backed up yet." : `Your last backup was ${ago(st.days)}.`}</strong> <span>Your progress lives only in this browser and is lost if its site data is cleared.</span></div>
      <div class="bb-act"><button class="btn primary sm" id="bbNow">Back up now</button><a class="btn sm" href="#/settings?focus=backup">Options</a><button class="btn sm" id="bbLater">Later</button></div>`;
    $("#bbNow", bar).onclick = async (e) => {
      if (p.gh && connected()) { location.hash = "#/settings?focus=backup"; return; } // an encrypted GitHub copy needs the passphrase
      const b = e.currentTarget; busy(b, true, "Saving");
      try { const r = await saveBackupFile(); toast(r.shared ? "Backup shared" : "Backup saved to your Downloads"); } catch (err) { if (err.name !== "AbortError") toast("Could not save the backup: " + err.message, true); }
      busy(b, false); draw();
    };
    $("#bbLater", bar).onclick = () => { snoozeReminder(1); draw(); };
  };
  mountBackupBar.refresh = draw; draw();
}
addEventListener("groommeup:backup", () => mountBackupBar.refresh?.());

// ---------- the Settings card ----------
export function backupCardHtml() {
  return `<section class="card" id="backupCard" style="margin-top:16px" aria-labelledby="bkh"><h2 id="bkh">Back up your data</h2>
    <p class="muted" style="margin-top:0">Everything you do here is stored <strong>only in this browser</strong>. If the browser’s site data is cleared, it is gone unless you have a backup. Make one now and again whenever the reminder appears.</p>
    <p class="small" id="bkLast" aria-live="polite"></p>
    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary" id="bkNow">Back up now</button><button class="btn" id="bkShare" hidden>Share or save to…</button></div>
    <div class="field" style="margin-top:12px"><label style="font-weight:400;display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="bkGh"> <span>Also save an <strong>encrypted copy to my GitHub repo</strong> <span class="muted">(<code>backup/progress.enc.json</code>, readable on every device with your passphrase)</span></span></label></div>
    <div id="bkGhBox" hidden>
      <div class="field"><label for="bkPass">Passphrase (at least 10 characters)</label><input id="bkPass" type="password" autocomplete="new-password"><div class="hint">Not stored anywhere. <strong>If you forget it, that copy cannot be opened.</strong> The repository is public, so use something long that is not your library passphrase if you can.</div></div>
      <label style="font-weight:400;display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="bkSec"> <span>Include my AI key and GitHub token inside the encrypted copy <span class="muted">(only if the passphrase is strong)</span></span></label></div>
    <p id="bkMsg" class="small" style="margin:10px 0 0" aria-live="polite"></p>
    <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
    <h3 style="margin:0 0 6px">Storage protection</h3>
    <p class="small" id="bkPersist" aria-live="polite"></p>
    <button class="btn sm" id="bkProtect">Ask the browser to protect this data</button>
    <p class="small muted" style="margin:8px 0 0">Protection stops the browser from deleting the data on its own when space runs low. It does <strong>not</strong> stop “Clear browsing data” or “Clear site data”. Only a backup does. On a phone, adding the app to your home screen also helps.</p></section>`;
}

export function wireBackupCard(root = document) {
  const q = (s) => $(s, root), m = lastBackup();
  const paintLast = () => { const st = backupStatus(); q("#bkLast").innerHTML = st.never ? "<strong>No backup yet.</strong>" : `Last backup: <strong>${ago(st.days)}</strong> (${{ file: "file on this device", github: "encrypted copy on GitHub", code: "progress code", restored: "restored copy" }[st.kind] || "backup"}).`; };
  const paintStorage = async () => {
    const i = await storageInfo();
    q("#bkPersist").innerHTML = !i.supported ? "This browser cannot protect storage. Rely on backups." : i.persisted ? "<strong>Protected.</strong> The browser will not delete this data automatically." : "<strong>Not protected.</strong> The browser may delete this data if space runs low.";
    q("#bkProtect").hidden = !i.supported || i.persisted;
  };
  paintLast(); paintStorage();
  const gh = q("#bkGh"); gh.checked = !!m.gh && connected(); q("#bkGhBox").hidden = !gh.checked;
  gh.onchange = () => { if (gh.checked && !connected()) { gh.checked = false; q("#bkMsg").innerHTML = "Connect GitHub first (the GitHub card below): paste a token with Contents read and write."; return; } setPref({ gh: gh.checked }); q("#bkGhBox").hidden = !gh.checked; if (gh.checked) q("#bkPass").focus(); };
  if (navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] })) q("#bkShare").hidden = false;
  q("#bkNow").onclick = async (e) => {
    const b = e.currentTarget, msg = q("#bkMsg"), wantGh = gh.checked, pass = q("#bkPass").value;
    if (wantGh && !strongEnough(pass)) { msg.textContent = "Enter a passphrase of at least 10 characters for the GitHub copy, or untick that option."; q("#bkPass").focus(); return; }
    busy(b, true, "Backing up"); const done = [];
    try { await saveBackupFile(); done.push("saved a file to your device (check Downloads)"); } catch (err) { msg.textContent = "Could not save the file: " + err.message; busy(b, false); return; }
    if (wantGh) { try { await saveEncryptedToGitHub(pass, { secrets: q("#bkSec").checked }); done.push("saved an encrypted copy to GitHub"); } catch (err) { msg.textContent = `File saved, but the GitHub copy failed: ${err.message}`; busy(b, false); paintLast(); return; } }
    msg.textContent = "Done: " + done.join(" and ") + "."; busy(b, false); paintLast();
  };
  q("#bkShare").onclick = async () => { try { const r = await saveBackupFile({ share: true }); q("#bkMsg").textContent = r.shared ? "Shared." : "Saved to your device."; paintLast(); } catch (err) { if (err.name !== "AbortError") q("#bkMsg").textContent = err.message; } };
  q("#bkProtect").onclick = async () => { const r = await requestPersistence(); toast(r.persisted ? "Storage is now protected" : "The browser declined. It usually accepts after you install the app or use it regularly."); paintStorage(); };
  void esc;
}

// ask for protected storage once the first-run screen is over, then now and then until it is granted
export async function protectStorageOnce() {
  const m = lastBackup();
  if (m.persisted) return;
  if (m.persistAsked && Date.now() - m.persistAsked < 86400000) return;
  await requestPersistence();
}
