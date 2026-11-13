// Roadmap tab: the .NET AI Engineer Roadmap 2026-27, grouped by stage. Each track links its study guide, questions and quiz.
import { esc } from "../ui.js";
import { ROADMAP, STAGES } from "../data/roadmap.js";
import { MCQ } from "../data/index.js";
import { allQuestions, categoryStats } from "../store.js";
import { metaOf } from "../libmeta.js";
import { loadRemote } from "../github.js";

const NOTE = { Foundation: "Core .NET and backend skills every interview tests.", Platform: "Cloud and architecture: where senior interviews are decided.", AI: "How models work and how to use them from .NET.", Production: "Run AI safely and prove it with real projects." };

export function view(root) {
  let guides = {};
  const draw = () => {
    const qs = allQuestions(), stats = categoryStats();
    const card = (t) => {
      const g = guides[t.id], me = g ? metaOf("art", g.id) : {}, nq = qs.filter((q) => q.c === t.cat).length, nm = MCQ.filter((m) => m.c === t.cat).length;
      const ready = Math.round((stats[t.cat]?.readiness || 0));
      const status = !g ? "" : me.done ? "Guide read ✓" : me.pct > 3 ? `Guide ${me.pct}% read` : "Guide not started";
      return `<article class="card rm-card" aria-labelledby="rm-${t.id}"><div class="row between small muted"><span>Step ${t.n}</span><span>${esc(status)}</span></div>
        <h3 id="rm-${t.id}" style="margin:6px 0">${esc(t.title)}</h3><p class="small muted" style="margin:0 0 10px">${esc(t.goal)}</p>
        <div class="chips" style="margin-bottom:12px">${t.topics.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>
        <div class="small muted" style="margin-bottom:10px">${nq} interview questions · ${nm} quiz questions${ready ? ` · readiness ${ready}%` : ""}</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">${g ? `<a class="btn primary sm" href="#/library?tab=articles&id=${encodeURIComponent(g.id)}">Read guide</a>` : ""}<a class="btn sm" href="#/library?tab=questions&cat=${encodeURIComponent(t.cat)}">Questions</a>${nm ? `<a class="btn sm" href="#/quiz?cat=${encodeURIComponent(t.cat)}">Quiz</a>` : ""}</div></article>`;
    };
    root.innerHTML = `<div class="card" style="margin-bottom:16px"><h2 style="margin:0 0 6px">${esc(ROADMAP.title)}</h2>
      <p class="muted" style="margin:0">Eight steps from modern C# to production AI. Each has a study guide with interview points and a skill-upgrade checklist, interview questions and a quiz. Work through them in order, or jump to the gaps in your own profile.</p></div>
      ${STAGES.map((st) => { const ts = ROADMAP.tracks.filter((t) => t.stage === st); return `<section aria-label="${esc(st)}" style="margin-bottom:20px"><h3 style="margin:0 0 4px">${esc(st)}</h3><p class="small muted" style="margin:0 0 10px">${esc(NOTE[st] || "")}</p><div class="grid g2">${ts.map(card).join("")}</div></section>`; }).join("")}`;
  };
  draw();
  loadRemote().then((r) => { guides = Object.fromEntries(r.filter((x) => x.group === "roadmap").map((x) => [x.track, x])); if (root.isConnected) draw(); });
}
