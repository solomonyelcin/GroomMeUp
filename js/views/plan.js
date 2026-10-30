import { store, categoryStats, codingStats } from "../store.js";
import { CATEGORIES } from "../data/index.js";
import { esc, tape } from "../ui.js";

// A 4-week plan that adapts to the weakest topics.
export function view(root) {
  const s = store.get();
  const stats = categoryStats();
  const weak = Object.values(stats).filter((x) => !x.mine).sort((a, b) => a.readiness - b.readiness);
  const w = (i) => weak[i]?.key || "csharp";
  const name = (k) => CATEGORIES[k].name;
  const cd = codingStats();
  const days = s.settings.target ? Math.ceil((new Date(s.settings.target) - Date.now()) / 86400000) : null;

  const weeks = [
    { t: "Week 1: foundations and your weakest topics", goal: "Close the biggest gaps first.", items: [
      `Practice 5 questions a day from ${name(w(0))} and ${name(w(1))}, aiming for 7+ on each.`,
      "Solve 1 JavaScript and 1 SQL challenge daily. Do the easy ones in under 15 minutes.",
      "Take one 10-question quiz on Monday and Friday and review every wrong answer.",
      "Write your 90-second 'tell me about yourself' and say it aloud 3 times.",
    ] },
    { t: "Week 2: depth and your projects", goal: "Own your resume stories.", items: [
      "Practise all 'My resume defence' questions until each scores 8+. Draw the EO Workbench and MDS architectures from memory.",
      `Cover ${name(w(2))} and ${name(w(3))}.`,
      "Solve the medium coding challenges. Do the C# ones and self-review against the rubric.",
      "Fix the resume risks listed in Market & resume, then re-save the PDF.",
    ] },
    { t: "Week 3: architecture and mock rounds", goal: "Think like a senior.", items: [
      "Three system design questions, each with a timer: clarify, estimate, design, failure modes.",
      "Two mock interviews: one 'Technical 2: architecture' and one 'Full loop'.",
      "Hard coding challenges (LRU, promise pool, window-function SQL).",
      "Prepare 5 STAR stories with metrics you can defend: conflict, failure, leadership, tight deadline, ambiguity.",
    ] },
    { t: "Week 4: apply, interview, iterate", goal: "Turn practice into offers.", items: [
      "Apply in waves of 10 to product companies, GCCs and strong service firms. Tailor the top third of your resume to each posting.",
      "Log every real interview the same day in the Interview log, then practise the questions you fumbled.",
      "Mock the salary conversation and know your range, walk-away number and notice-period options.",
      "Keep one daily quiz and one coding problem going so you stay sharp while interviewing.",
    ] },
  ];

  root.innerHTML = `
    <header class="page-head"><h1>Study plan</h1><p>A four-week plan built from your current scores. It re-orders itself as your weakest topics change.</p></header>
    <div class="card"><div class="row between"><div><h3 style="margin:0">Target date</h3><span class="small muted">${days === null ? "Set one to count down on the dashboard." : days < 0 ? "That date has passed. Pick a new one." : `${days} days left`}</span></div>
      <div class="row"><input id="td" type="date" value="${esc(s.settings.target || "")}" style="width:auto" aria-label="Target date"><button class="btn primary" id="sv">Save</button></div></div></div>
    <div class="card" style="margin-top:16px"><h3>Right now your focus order is</h3>
      <div class="stack">${weak.slice(0, 5).map((r, i) => `<div class="row between small"><span>${i + 1}. <strong>${esc(r.name)}</strong></span><span style="width:50%">${tape(r.readiness, { slim: true, label: r.name })}</span></div>`).join("")}</div>
      <p class="small muted" style="margin-top:10px">Coding solved: JS ${cd.js[0]}/${cd.js[1]}, SQL ${cd.sql[0]}/${cd.sql[1]}, C# ${cd.cs[0]}/${cd.cs[1]}.</p></div>
    ${weeks.map((k) => `<section class="card" style="margin-top:16px"><h2>${esc(k.t)}</h2><p class="muted">${esc(k.goal)}</p><ul class="kp" style="line-height:1.8">${k.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>`).join("")}
    <div class="callout" style="margin-top:16px">Daily rhythm that works: 30 minutes of theory, 30 of coding, 15 of quiz or mock, 15 reviewing mistakes. Consistency beats marathon days.</div>`;
  root.querySelector("#sv").onclick = () => { store.update((x) => (x.settings.target = root.querySelector("#td").value)); location.reload(); };
}
