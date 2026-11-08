// Live voice interview: the interviewer speaks, you answer by voice (or type), one question at a time.
// Uses the browser's built-in speech synthesis and recognition: free, nothing is uploaded by this app.
import { esc, rich, fmtTime, tape, toast, $ } from "./../ui.js";

const R = () => window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => !!R();
export const canTalk = () => "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

export const spokenText = (s) => String(s || "").replace(/```[\s\S]*?```/g, " (see the code on screen) ").replace(/[`*_~]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

function pickVoice() {
  const vs = speechSynthesis.getVoices();
  const en = vs.filter((v) => /^en/i.test(v.lang));
  return en.find((v) => /en-IN/i.test(v.lang)) || en.find((v) => /en-GB/i.test(v.lang)) || en.find((v) => /en-US/i.test(v.lang)) || en[0] || null;
}
export function say(text, onEnd) {
  if (!canTalk() || !text) { onEnd && setTimeout(onEnd, 0); return () => {}; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(spokenText(text));
  const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.98;
  let done = false; const fin = () => { if (done) return; done = true; clearInterval(guard); onEnd && onEnd(); };
  u.onend = fin; u.onerror = fin;
  // some browsers never fire onend for a cancelled or blocked utterance
  const guard = setInterval(() => { if (!speechSynthesis.speaking && !speechSynthesis.pending) fin(); }, 700);
  speechSynthesis.speak(u);
  return () => { done = true; clearInterval(guard); speechSynthesis.cancel(); };
}

function listener({ onFinal, onInterim, onState }) {
  const Rec = R(); if (!Rec) return null;
  let r = null, want = false;
  const make = () => {
    r = new Rec(); r.lang = "en-IN"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let fin = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript + " ") : (interim += e.results[i][0].transcript));
      if (fin) onFinal(fin); onInterim(interim);
    };
    r.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { want = false; onState("denied"); } };
    r.onend = () => { if (want) setTimeout(() => { if (want) { try { make(); r.start(); } catch { /* ignore */ } } }, 200); else onState("idle"); };
  };
  return {
    start() { want = true; onState("listening"); try { make(); r.start(); } catch { /* already started */ } },
    stop() { want = false; try { r && r.stop(); } catch { /* ignore */ } },
  };
}

/**
 * plan: [{ q: {id,q,a,kp,c,live?}, line?: spoken lead-in }]
 * opts: { limit (sec), autoSec (0 = off), showText }
 * onDone(answers) is called with [{ q, text, secs, spoken }]
 * returns a function that stops everything (call on leaving the page)
 */
export function runLive(root, plan, opts, onDone) {
  const answers = []; let i = 0, t0 = Date.now(), startedAt = 0, timer = null, cancelSay = () => {}, lis = null, lastHeard = 0, heard = false, finished = false, interim = "";
  const hardStop = () => { clearInterval(timer); cancelSay(); if (lis) lis.stop(); if (canTalk()) speechSynthesis.cancel(); };
  const textMode = !canListen();

  const frame = (inner) => (root.innerHTML = `<div class="card live-card" style="max-width:820px">${inner}</div>`);

  function ask() {
    clearInterval(timer);
    if (finished) return;
    if (i >= plan.length) return closing();
    const { q, line } = plan[i], qLimit = q.code ? (opts.codeLimit || 300) : opts.limit;
    heard = false; interim = ""; lastHeard = 0;
    frame(`
      <div class="row between small muted"><span>Question ${i + 1} of ${plan.length}</span><span>Interview time left <b id="tt">${fmtTime(Math.max(0, opts.totalSec - (Date.now() - t0) / 1000))}</b></span><span class="timer" id="tm" title="This answer">${fmtTime(qLimit)}</span></div>
      <div style="margin:10px 0 12px">${tape((i / plan.length) * 100, { slim: true, label: "Interview progress" })}</div>
      <div class="row" style="gap:10px;align-items:center;margin-bottom:8px"><span class="live-dot" id="ldot" aria-hidden="true"></span><strong id="lst">Interviewer is speaking…</strong></div>
      <h2 id="lq" ${opts.showText ? "" : 'hidden'}>${rich(q.q)}</h2>
      ${opts.showText ? "" : `<p class="muted" id="lhid">Question text is hidden. Use “Repeat question” to hear it again.</p>`}
      <div class="field"><label for="ans">Your answer ${textMode ? "(type it: this browser cannot listen)" : "(spoken words appear here, you can edit them)"}</label>
        <textarea id="ans" rows="${q.code ? 13 : 7}" ${q.code ? 'spellcheck="false" style="font-family:var(--font-mono)"' : ""} placeholder="${q.code ? "Say your approach out loud, then type your code here" : textMode ? "Type your answer" : "Start speaking after the question ends…"}"></textarea>
        <div class="small muted" id="lint" aria-live="polite" style="min-height:1.4em"></div></div>
      <div class="row"><button class="btn primary" id="ldone">Done answering</button><button class="btn" id="lrep">Repeat question</button><button class="btn" id="lskip">Pass on this</button><button class="btn" id="lstop">End interview</button></div>`);
    const ans = $("#ans"), st = $("#lst"), dot = $("#ldot");
    const setState = (s) => { if (!$("#lst")) return; st.textContent = s === "speak" ? "Interviewer is speaking…" : s === "listen" ? "Listening… answer now" : s === "denied" ? "Microphone blocked. Type your answer instead." : "Your turn"; dot.className = "live-dot " + s; };
    setState("speak");

    lis = textMode ? null : listener({
      onFinal: (t) => { heard = true; lastHeard = Date.now(); const a = $("#ans"); if (a) { a.value += (a.value && !/\s$/.test(a.value) ? " " : "") + t.trim(); a.scrollTop = a.scrollHeight; } },
      onInterim: (t) => { interim = t; if (t) lastHeard = Date.now(); const l = $("#lint"); if (l) l.textContent = t ? "… " + t : ""; },
      onState: (s) => { if (s === "denied") setState("denied"); },
    });
    const beginListening = () => { if (finished || !$("#ans")) return; startedAt = Date.now(); lastHeard = Date.now(); setState(textMode ? "turn" : "listen"); if (lis) lis.start(); ans.focus(); };
    cancelSay = say(line ? `${line} ${q.q}` : q.q, beginListening);

    timer = setInterval(() => {
      const t = $("#tm"); if (!t) return;
      if (!startedAt) return;
      const left = qLimit - (Date.now() - startedAt) / 1000; const tt = $("#tt"); if (tt) tt.textContent = fmtTime(Math.max(0, opts.totalSec - (Date.now() - t0) / 1000));
      t.textContent = fmtTime(Math.max(left, 0)); t.classList.toggle("low", left <= 30);
      if (left <= 0) { toast("Time is up. Moving on.", true); submit(false); return; }
      if (opts.autoSec && heard && !interim && Date.now() - lastHeard > opts.autoSec * 1000) submit(false);
    }, 500);

    $("#ldone").onclick = () => submit(false);
    $("#lskip").onclick = () => submit(true);
    $("#lrep").onclick = () => { if (lis) lis.stop(); cancelSay(); setState("speak"); cancelSay = say(q.q, () => { if (!finished && $("#ans")) { setState(textMode ? "turn" : "listen"); if (lis) lis.start(); } }); };
    $("#lstop").onclick = () => { if (confirm("End the interview now? Questions not answered will score zero.")) { finished = true; hardStop(); while (answers.length < plan.length) answers.push({ q: plan[answers.length].q, text: "", secs: 0, spoken: !textMode }); onDone(answers); } };
    ans.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(false); });
  }

  function submit(skipped) {
    if (finished) return;
    const a = $("#ans"); if (!a) return;
    clearInterval(timer); if (lis) lis.stop(); cancelSay();
    const text = skipped ? "" : (a.value + (interim ? " " + interim : "")).trim();
    const secs = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    answers.push({ q: plan[i].q, text, secs, spoken: !textMode });
    i++;
    if (i >= plan.length || (Date.now() - t0) / 1000 >= opts.totalSec) return closing(i < plan.length);
    const ack = ["Thank you.", "Okay, noted.", "Alright.", "Got it, thanks.", "Fair enough."][i % 5];
    frame(`<div class="row" style="gap:10px;align-items:center"><span class="live-dot speak" aria-hidden="true"></span><strong>${esc(ack)}</strong></div>`);
    cancelSay = say(ack + (i === plan.length - 1 ? " One last question." : " Next question."), ask);
  }

  function closing(early) {
    if (finished) return;
    finished = true; clearInterval(timer);
    frame(`<div class="row" style="gap:10px;align-items:center"><span class="live-dot speak" aria-hidden="true"></span><strong>That is all from my side. Thank you for your time.</strong></div><p class="muted"><span class="spinner"></span> Preparing your evaluation…</p>`);
    cancelSay = say(`${early ? "Our time is up. " : ""}That is all from my side. Thank you for your time. Let me prepare your evaluation.`, () => {});
    setTimeout(() => onDone(answers), 600);
  }

  // first screen: a click is needed so the browser allows speech and the microphone
  frame(`<h2>Ready for your live interview?</h2>
    <p>${plan.length} questions. The interviewer reads each one aloud, then listens. ${textMode ? "<strong>This browser cannot listen, so you will type your answers.</strong> Chrome or Edge give the full voice experience." : "Allow the microphone when asked."} Speak naturally, like a real interview. Press “Done answering” when you finish${opts.autoSec ? `, or pause for ${opts.autoSec} seconds and it moves on` : ""}.</p>
    ${canTalk() ? "" : `<p class="callout warn">This browser cannot speak, so you will read the questions on screen.</p>`}
    <div class="row"><button class="btn chalk" id="lbegin">Begin interview</button></div>`);
  $("#lbegin").onclick = () => { if (canTalk()) { speechSynthesis.getVoices(); } cancelSay = say("Hello, thank you for joining. Let's begin.", ask); };
  return () => { finished = true; hardStop(); };
}
