import { MARKET, CATEGORIES } from "../data/index.js";
import { RESUME_CONTEXT } from "../ai.js";
import { esc, fmtDate } from "../ui.js";

const RESUME_FIXES = [
  ["Two similar latency numbers on MDS", "Your MDS bullets claim 30% and 40% latency reductions. Interviewers will ask how they differ. Merge them or define each (per-message processing vs end-to-end), and be ready with how each was measured.", "rs03"],
  ["Defend 30% cost and 60% efficiency (EO Workbench)", "Know the baseline, the metric owner and the time window. If part of the gain came from the business or other projects, say 'enabled' instead of 'achieved'.", "rs02"],
  ["Title vs duties at TCS", "'Senior Process Associate' next to 20 applications built reads oddly. Add one line that the role was a development role, and name 2 concrete apps.", "rs05"],
  ["Claim size: 20 enterprise applications", "Say 'delivered or enhanced' if some were incremental, and lead with the two most impressive.", "rs05"],
  ["AIDLC 35% faster cycles", "Be explicit about what AI did and how the 35% was measured. This is a hot topic in 2026 interviews.", "rs04"],
  ["Add a skills line for what's in demand", "Kubernetes, OpenTelemetry, OIDC/OAuth, and AI-assisted engineering appear in most senior postings. Add them only where you can answer questions.", "ai04"],
];

export function view(root) {
  const m = MARKET;
  root.innerHTML = `
    <header class="page-head"><h1>Market &amp; resume</h1>
      <p>What the 2026 hiring market asks for in senior .NET full stack roles, how interview rounds usually run, and what to fix on your resume before applying. Research updated ${fmtDate(m.updated)}.</p></header>

    <section class="card" aria-labelledby="dm"><h2 id="dm">Skills employers ask for</h2>
      <div class="stack">${m.demand.map((d) => `<div><div class="row between small" style="margin-bottom:3px"><strong>${esc(d.skill)}</strong><span class="muted">${["", "nice to have", "useful", "common", "very common", "near universal"][d.weight]}</span></div><div class="tape slim" role="img" aria-label="${esc(d.skill)} demand ${d.weight} of 5"><div class="fill" style="width:${d.weight * 20}%"></div><div class="ticks"></div></div><div class="small muted" style="margin-top:3px">${esc(d.note)}</div></div>`).join("")}</div>
    </section>

    <section class="card" aria-labelledby="rt"><h2 id="rt">How a typical process runs</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Round</th><th>What they test</th><th>How to handle it</th></tr></thead><tbody>
      ${m.roundTypes.map((r) => `<tr><td><strong>${esc(r.round)}</strong></td><td>${esc(r.focus)}</td><td>${esc(r.tip)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted" style="margin-top:10px">Hiring is concentrated in ${m.hiringCities.map(esc).join(", ")}.</p>
    </section>

    <section class="card" aria-labelledby="sl"><h2 id="sl">Pay: what to expect and how to verify</h2>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Level</th><th>Indicative range</th></tr></thead><tbody>${m.salaryIndicative.rows.map((r) => `<tr><td>${esc(r.level)}</td><td>${esc(r.range)}</td></tr>`).join("")}</tbody></table></div>
      <p class="callout" style="margin-top:12px">${esc(m.salaryIndicative.note)}</p>
      <p class="small">With 9+ years, you are in the senior band, and the upper end is mostly reached by product companies, GCCs and strong negotiation on total compensation (fixed, variable, joining bonus, stock). Practise the salary question in a mock round.</p>
    </section>

    <section class="card" aria-labelledby="rv"><h2 id="rv">Resume checks before you apply</h2>
      <div class="stack">${RESUME_FIXES.map(([t, d, q]) => `<div><strong>${esc(t)}</strong><p class="muted" style="margin:2px 0 4px">${esc(d)}</p><a class="btn sm" href="#/practice?q=${q}">Practise this question</a></div>`).join("")}</div>
    </section>

    <section class="card" aria-labelledby="st"><h2 id="st">Strategy</h2><ol class="kp" style="line-height:1.8">${m.strategy.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></section>

    <section class="card" aria-labelledby="pr"><h2 id="pr">Profile the app uses for AI feedback</h2>
      <p class="muted small">When AI feedback is on, this summary of your resume is sent along with your answer so feedback fits your level. Nothing else leaves your browser.</p>
      <pre class="out" style="max-height:none">${esc(RESUME_CONTEXT)}</pre></section>

    <section class="card" aria-labelledby="src"><h2 id="src">Sources</h2><ul class="kp">${m.sources.map((s) => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a></li>`).join("")}</ul>
      <p class="small muted">Interview questions were adapted from these and similar public guides, rewritten with original answers. Add real questions from your own interviews in the Interview log, because they matter most.</p></section>
  `;
  void CATEGORIES;
}
