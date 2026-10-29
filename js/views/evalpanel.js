import { esc, rich, scoreClass } from "../ui.js";

export function evalPanel(ev, { showModel = true } = {}) {
  const li = (a) => (a && a.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  const col = ev.score >= 8 ? "var(--moss)" : ev.score >= 5 ? "var(--amber)" : "var(--thread)";
  return `<div class="eval" style="border-left-color:${col}" aria-live="polite">
    <div class="row" style="gap:16px;align-items:center">
      <div class="big score ${scoreClass(ev.score)}" style="padding:8px 14px">${(Math.round(ev.score * 10) / 10)}<span class="small" style="font-weight:500"> / 10</span></div>
      <div><strong>${esc(ev.verdict || "")}</strong><br><span class="small muted">${ev.source === "ai" ? "Evaluated by AI" : "Scored on key-point coverage (turn on free AI in Settings for deeper feedback)"}</span></div>
    </div>
    ${ev.aiError ? `<p class="callout warn small" style="margin-top:12px">AI evaluation failed (${esc(ev.aiError)}), so this is the offline score.</p>` : ""}
    ${ev.strengths?.length ? `<h4 style="margin:14px 0 2px">What worked</h4>${li(ev.strengths)}` : ""}
    ${ev.gaps?.length ? `<h4 style="margin:14px 0 2px">What to add</h4>${li(ev.gaps)}` : ""}
    ${ev.tips?.length ? `<h4 style="margin:14px 0 2px">Delivery tips</h4>${li(ev.tips)}` : ""}
    ${showModel ? `<h4 style="margin:14px 0 6px">${ev.source === "ai" ? "A stronger answer" : "Model answer"}</h4><div class="model">${rich(ev.improved || "")}</div>` : ""}
    ${ev.followUp ? `<h4 style="margin:14px 0 2px">Expect this follow-up</h4><p>${esc(ev.followUp)}</p>` : ""}
  </div>`;
}
