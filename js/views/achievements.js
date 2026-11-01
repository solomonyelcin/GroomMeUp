import { store, categoryStats } from "../store.js";
import { metrics, level, BADGES, challenges, nextMilestone } from "../progress.js";
import { esc, $, fmtDate, download } from "../ui.js";

export function view(root) {
  const draw = () => {
    const s = store.get(), m = metrics(s), lv = level(m.xp), ch = challenges(m), nm = nextMilestone(m);
    const done = BADGES.filter((b) => { const p = b.prog(m); return p.cur >= p.goal; }).length;
    const weekPct = Math.min(100, Math.round((m.week / m.goal) * 100));
    const cells = Array.from({ length: 28 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (27 - i)); return { on: m.days.has(d.toDateString()), label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), today: i === 27 }; });
    root.innerHTML = `
      <header class="page-head"><h1>Progress &amp; badges</h1><p>Small daily wins add up. Keep the streak alive, hit the daily challenges and unlock every badge.</p></header>
      <section class="card">
        <div class="row between" style="align-items:center;gap:16px">
          <div><div class="small muted">Level ${lv.lv}</div><h2 style="margin:0">${esc(lv.name)}</h2></div>
          <div class="row" style="gap:24px"><div class="stat"><b>🔥 ${m.streak}</b><span>day streak</span></div><div class="stat"><b>${m.best}</b><span>best streak</span></div><div class="stat"><b>${m.xp}</b><span>XP</span></div></div>
        </div>
        <div class="bar" style="margin-top:12px" role="progressbar" aria-valuenow="${lv.pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${lv.pct}%"></span></div>
        <p class="small muted" style="margin:6px 0 0">${lv.hi - m.xp} XP to level ${lv.lv + 1}. Earn XP from graded answers, quizzes, coding tests, mocks and streak days.</p>
      </section>
      <section class="card" style="margin-top:16px">
        <h3 style="margin-top:0">Today's challenges</h3>
        ${ch.map((c) => `<div class="chal ${c.cur >= c.goal ? "done" : ""}"><span class="chk" aria-hidden="true">${c.cur >= c.goal ? "✓" : ""}</span><span>${esc(c.t)}</span><span class="small muted">${c.cur}/${c.goal}</span></div>`).join("")}
        <p class="small muted" style="margin:8px 0 0">${ch.every((c) => c.cur >= c.goal) ? "All done today. Come back tomorrow to keep your streak." : "Finish all three to make today count."}</p>
      </section>
      <div class="grid g2" style="margin-top:16px">
        <section class="card"><h3 style="margin-top:0">Weekly goal</h3>
          <div class="bar" role="progressbar" aria-valuenow="${weekPct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${weekPct}%"></span></div>
          <p style="margin:8px 0 6px"><b>${m.week}</b> of <b>${m.goal}</b> questions this week</p>
          <label for="wg" class="small">Questions per week</label>
          <select id="wg">${[10, 20, 30, 50, 75, 100].map((n) => `<option ${n === m.goal ? "selected" : ""}>${n}</option>`).join("")}</select>
        </section>
        <section class="card"><h3 style="margin-top:0">Next milestone</h3>
          ${nm ? `<div class="bar"><span style="width:${Math.round((m.studied / nm) * 100)}%"></span></div><p style="margin:8px 0 0"><b>${m.studied}</b> of <b>${nm}</b> questions studied (${m.total} loaded)</p>` : `<p style="margin:0"><b>${m.studied}</b> questions studied. Every milestone reached.</p>`}
        </section>
      </div>
      <section class="card" style="margin-top:16px"><h3 style="margin-top:0">Last 4 weeks</h3>
        <div class="heat" aria-label="Activity in the last 28 days">${cells.map((c) => `<i class="${c.on ? "on" : ""} ${c.today ? "today" : ""}" title="${esc(c.label)}${c.on ? ": studied" : ""}"></i>`).join("")}</div>
      </section>
      <section class="card" style="margin-top:16px"><h3 style="margin-top:0">Topic strength</h3>
        <p class="small muted" style="margin-top:0">Studied questions out of all questions, with how well you scored on them.</p>
        ${Object.values(categoryStats()).filter((c) => c.total).sort((a, b) => a.readiness - b.readiness).map((c) => `<div class="tstr"><div class="row between small"><span>${esc(c.name)}</span><span class="muted">${c.attempted}/${c.total} studied${c.attempted ? ` · ${Math.round(c.acc)}%` : ""}</span></div><div class="bar" role="progressbar" aria-valuenow="${Math.round(c.readiness)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(2, Math.round(c.readiness))}%;background:${esc(c.color || "var(--cobalt)")}"></span></div></div>`).join("")}</section>
      <section class="card" style="margin-top:16px"><h3 style="margin-top:0">Daily reminder</h3>
        <p class="small muted" style="margin-top:0">GroomMeUp cannot send notifications while it is closed, so add a repeating reminder to your phone or laptop calendar.</p>
        <div class="row" style="align-items:flex-end"><div><label for="rt">Time</label><input id="rt" type="time" value="20:00"></div><button class="btn" id="ics">Add daily reminder</button></div></section>
      <h2 style="margin:24px 0 10px">Badges <span class="small muted">${done} of ${BADGES.length}</span></h2>
      <div class="badge-grid">${BADGES.map((b) => {
        const p = b.prog(m), ok = p.cur >= p.goal, when = (s.badges || {})[b.id];
        return `<div class="badge ${ok ? "" : "locked"}"><span class="b-ico" aria-hidden="true">${b.ico}</span><strong>${esc(b.name)}</strong><span class="small muted">${esc(b.desc)}</span>${ok ? `<span class="small ok">${when ? "Earned " + fmtDate(when) : "Earned"}</span>` : `<span class="small muted">${p.cur} / ${p.goal}</span>`}</div>`;
      }).join("")}</div>`;
    $("#ics").onclick = () => {
      const [h, m] = ($("#rt").value || "20:00").split(":"), d = new Date(), p2 = (n) => String(n).padStart(2, "0");
      const day = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`, url = location.href.split("#")[0];
      download("groommeup-daily-reminder.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GroomMeUp//EN", "BEGIN:VEVENT", "UID:groommeup-daily@" + location.host, `DTSTAMP:${day}T000000Z`, `DTSTART:${day}T${h}${m}00`, `DTEND:${day}T${p2(+h)}${p2(Math.min(+m + 15, 59))}00`, "RRULE:FREQ=DAILY", "SUMMARY:GroomMeUp: today's 5 questions", `DESCRIPTION:Keep your streak alive. ${url}`, `URL:${url}`, "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:GroomMeUp", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n"), "text/calendar");
    };
    $("#wg").onchange = (e) => { store.update((x) => { x.settings.weekly = +e.target.value; }); draw(); };
  };
  draw();
}
