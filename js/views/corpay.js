// Corpay interview prep: what is known, a plan, and links to the guides, questions, quiz and mock round.
import { esc } from "../ui.js";
import { MCQ } from "../data/index.js";
import { allQuestions } from "../store.js";
import { metaOf } from "../libmeta.js";
import { loadRemote } from "../github.js";

const FACTS = [
  ["Reported by candidates", "Recruiter call (about 30 min), then 2 to 4 technical rounds of about 1 hour, over about 2 weeks. A take-home API endpoint for one candidate. SOLID design task, easy and hard coding problems, \"what does this .NET snippet print?\"."],
  ["From public Chennai listings", "Alpha division: C# and modern .NET on AWS, serverless, Kafka, RabbitMQ, SQS/SNS, EventBridge, Kubernetes, SQL and NoSQL, Redis, DDD, Clean Architecture, observability, production support, 8+ years."],
  ["Inferred (guide sites)", "SQL joins and aggregates, OOP and SOLID, REST and layered design, idempotency, ACID, PCI, ACH versus wire. Not confirmed by candidates."],
  ["Not known", "Your exact rounds, whether coding is live, and whether your team uses AWS or Azure. Ask the recruiter on the first call."],
];
const PLAN = [
  ["Saturday", "Guides 2 and 3 (payments, AWS). Answer the payments and AWS questions aloud. Ten C# output snippets."],
  ["Sunday", "Guide 4: code the SOLID design and unique ID class in a plain editor, timed. SQL tasks. Write three STAR stories."],
  ["Monday morning", "One live mock with the Corpay round. Review weak topics. Prepare four questions to ask. Test mic, camera, internet."],
];

export function view(root) {
  let guides = [];
  const draw = () => {
    const nq = allQuestions().filter((q) => q.c === "corpay").length, nm = MCQ.filter((m) => m.c === "corpay").length;
    root.innerHTML = `<div class="card"><h2 style="margin:0 0 6px">Corpay technical interview prep</h2>
      <p class="muted" style="margin:0 0 12px">Built for a senior .NET full-stack profile. Each item below says how sure the information is, because public details about Corpay interviews are limited.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn primary" href="#/mock?round=corpay">Start Corpay mock</a><a class="btn" href="#/library?tab=questions&cat=corpay">${nq} questions</a><a class="btn" href="#/quiz?cat=corpay">${nm} quiz questions</a></div></div>
      <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Study guides</h3><div class="art-list">${guides.map((g) => { const me = metaOf("art", g.id); return `<a class="art-item" href="#/library?tab=articles&id=${encodeURIComponent(g.id)}"><strong>${esc(g.title)}</strong><span class="small muted">${me.done ? "read ✓" : me.pct > 3 ? me.pct + "% read" : "not started"}</span></a>`; }).join("") || '<p class="small muted"><span class="spinner"></span> Loading guides…</p>'}</div></div>
      <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">What is known about the process</h3>${FACTS.map(([h, t]) => `<p style="margin:0 0 10px"><strong>${esc(h)}.</strong> ${esc(t)}</p>`).join("")}</div>
      <div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Plan until the interview</h3>${PLAN.map(([d, t]) => `<p style="margin:0 0 8px"><strong>${esc(d)}:</strong> ${esc(t)}</p>`).join("")}</div>`;
  };
  draw();
  loadRemote().then((r) => { guides = r.filter((x) => x.group === "corpay").sort((a, b) => (a.order || 0) - (b.order || 0)); if (root.isConnected) draw(); });
}
