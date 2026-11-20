// C#, .NET and SQL study: guides to read, with links to the matching questions and quiz.
import { esc } from "../ui.js";
import { MCQ } from "../data/index.js";
import { allQuestions } from "../store.js";
import { metaOf } from "../libmeta.js";
import { loadRemote } from "../github.js";

const TRACKS = [
  ["study-cs", "C#", "Language, memory, async, modern C#, design.", "csharp"],
  ["study-net", ".NET and ASP.NET Core", "Runtime, APIs, EF Core, security, resilience, ops.", "aspnet"],
  ["study-sql", "SQL Server and T-SQL", "Joins, windows, indexes, transactions, T-SQL, exercises.", "efsql"],
];

export function view(root) {
  let guides = [];
  const draw = () => {
    root.innerHTML = `<div class="card"><h2 style="margin:0 0 6px">C#, .NET and SQL study</h2><p class="muted" style="margin:0">Read the guides here, practise the open questions in Questions, and test yourself with the multiple-choice Quiz. Each guide ends with ten practice questions.</p></div>` +
      TRACKS.map(([g, name, desc, cat]) => {
        const list = guides.filter((x) => x.group === g).sort((a, b) => (a.order || 0) - (b.order || 0));
        const nq = allQuestions().filter((q) => q.c === cat).length, nm = MCQ.filter((m) => m.c === cat).length;
        return `<div class="card" style="margin-top:16px"><h3 style="margin:0">${esc(name)}</h3><p class="small muted" style="margin:2px 0 10px">${esc(desc)}</p>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><a class="btn" href="#/library?tab=questions&cat=${cat}">${nq} questions</a><a class="btn primary" href="#/quiz?cat=${cat}">${nm} quiz questions</a></div>
          <div class="art-list">${list.map((x) => { const me = metaOf("art", x.id); return `<a class="art-item" href="#/library?tab=articles&id=${encodeURIComponent(x.id)}"><strong>${esc(x.title)}</strong><span class="small muted">${me.done ? "read ✓" : me.pct > 3 ? me.pct + "% read" : "not started"}</span></a>`; }).join("") || '<p class="small muted"><span class="spinner"></span> Loading guides…</p>'}</div></div>`;
      }).join("");
  };
  draw();
  loadRemote().then((r) => { guides = r; if (root.isConnected) draw(); });
}
