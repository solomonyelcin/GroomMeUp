// Small inline SVG illustrations for the FAQs. They use the app's colour variables so they work in every theme.
const W = 640;
const C = { ink: "var(--ink)", mute: "var(--ink-3)", line: "var(--line)", card: "var(--card)", a: "var(--cobalt)", at: "var(--cobalt-tint)", g: "var(--moss, #2f855a)", gt: "var(--moss-tint, #e3f4ea)", w: "var(--chalk, #d69e2e)", wt: "var(--chalk-tint, #fdf3d8)", r: "var(--bad, #c53030)" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg = (h, body, label) => `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" style="width:100%;height:auto;max-width:720px;font-family:inherit">${body}<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.mute}"/></marker></defs></svg>`;
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || "middle"}" font-size="${o.s || 13}" font-weight="${o.w || 500}" fill="${o.c === C.w ? C.ink : o.c || C.ink}"${o.halo ? ` stroke="${C.card}" stroke-width="5" paint-order="stroke" stroke-linejoin="round"` : ""}>${esc(s)}</text>`;
const lines = (x, y, arr, o = {}) => arr.map((s, i) => T(x, y + i * ((o.s || 13) + 3), s, o)).join("");
const B = (x, y, w, h, fill = C.card, stroke = C.line, r = 10) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c || C.mute}" stroke-width="${o.w || 1.6}" ${o.d ? 'stroke-dasharray="5 4"' : ""} ${o.arrow === false ? "" : 'marker-end="url(#ah)"'}/>`;
const box = (x, y, w, h, title, sub = [], o = {}) => B(x, y, w, h, o.fill || C.card, o.stroke || C.line) + T(x + w / 2, y + (sub.length ? 21 : h / 2 + 5), title, { w: 700, c: o.c || C.ink, s: o.s || 13 }) + lines(x + w / 2, y + 39, sub, { s: 11.5, c: C.mute });

export const DIAGRAMS = {
  di() {
    const X = 190, LW = 430;
    const lane = (y, name, desc, color, tint, dots) => B(X, y, LW, 52, tint, color) + T(16, y + 24, name, { a: "start", w: 700, c: color }) + T(16, y + 42, desc, { a: "start", s: 11, c: C.mute }) + dots;
    const req = (x, w, n) => B(x, 30, w, 24, C.at, C.a, 6) + T(x + w / 2, 47, n, { s: 12, w: 700, c: C.a });
    const dot = (x, y, c) => `<circle cx="${x}" cy="${y}" r="9" fill="${c}"/>`;
    return svg(300, `${T(320, 18, "Two HTTP requests, three lifetimes", { w: 700 })}${req(200, 200, "Request 1")}${req(410, 200, "Request 2")}
      ${lane(66, "Singleton", "one for the whole app", C.a, C.at, `${L(215, 92, 395, 92, { d: true, arrow: false, c: C.a })}${L(415, 92, 600, 92, { d: true, arrow: false, c: C.a })}<circle cx="405" cy="92" r="11" fill="${C.a}"/>`)}
      ${lane(130, "Scoped", "one per request", C.g, C.gt, `${dot(300, 156, C.g)}${dot(510, 156, C.g)}`)}
      ${lane(194, "Transient", "new every time", C.w, C.wt, [225, 275, 325, 435, 485, 535].map((x) => dot(x, 220, C.w)).join(""))}
      ${T(320, 280, "Careful: a Singleton must never hold a Scoped service (captive dependency).", { s: 12, c: C.r, w: 600 })}`, "Singleton, Scoped and Transient lifetimes across two requests");
  },
  middleware() {
    const names = ["Exception\nhandler", "HTTPS\nredirect", "Static\nfiles", "Routing", "CORS", "Authen-\ntication", "Author-\nization", "Endpoint"];
    const bw = 66, gap = 10, x0 = 12;
    const boxes = names.map((n, i) => { const x = x0 + i * (bw + gap), last = i === names.length - 1; const [a, b] = n.split("\n"); return B(x, 70, bw, 56, last ? C.gt : C.card, last ? C.g : C.a) + T(x + bw / 2, b ? 93 : 103, a, { s: 11.5, w: 700 }) + (b ? T(x + bw / 2, 108, b, { s: 11.5, w: 700 }) : ""); }).join("");
    const arrows = names.slice(0, -1).map((_, i) => L(x0 + i * (bw + gap) + bw, 90, x0 + (i + 1) * (bw + gap), 90)).join("");
    return svg(220, `${T(320, 22, "A request travels in, the response travels back out", { w: 700 })}${boxes}${arrows}
      ${L(12 + 7 * 76 + 33, 140, 45, 140, { c: C.g })}${T(320, 160, "response comes back through the same components in reverse order", { s: 12, c: C.g, w: 600 })}
      ${T(320, 190, "A component that does not call next() short-circuits the request. Order matters.", { s: 12, c: C.mute })}`, "ASP.NET Core middleware pipeline");
  },
  jwt() {
    const ll = (x, n) => B(x - 70, 14, 140, 32, C.at, C.a) + T(x, 35, n, { w: 700, c: C.a }) + L(x, 46, x, 262, { d: true, arrow: false });
    const msg = (y, a, b, s, c = C.ink) => L(a, y, b, y) + T(Math.min(a, b) < 320 && Math.max(a, b) > 320 ? (Math.min(a, b) + 320) / 2 + 4 : (a + b) / 2, y - 6, s, { s: 11.5, c, halo: true });
    return svg(280, `${ll(90, "Client")}${ll(320, "API")}${ll(550, "Auth server")}
      ${msg(76, 90, 550, "1. login (user + password)")}
      ${msg(110, 550, 90, "2. signed JWT (+ refresh token)", C.g)}
      ${msg(150, 90, 320, "3. GET /orders + Bearer JWT")}
      ${B(236, 160, 168, 44, C.wt, C.w)}${lines(320, 178, ["4. verify signature, issuer,", "audience, expiry; read claims"], { s: 11 })}
      ${msg(236, 320, 90, "5. 200 OK (or 401 / 403)", C.g)}
      ${T(320, 274, "No session on the server: the signed token carries the identity.", { s: 11.5, c: C.mute })}`, "JWT login and bearer token flow");
  },
  efcore() {
    return svg(260, `${T(160, 20, "N+1 queries", { w: 700, c: C.r })}${T(480, 20, "Include / projection", { w: 700, c: C.g })}
      ${B(10, 30, 300, 190, C.card, C.r)}${B(330, 30, 300, 190, C.card, C.g)}
      ${box(22, 44, 70, 34, "App")}${box(222, 44, 80, 34, "Database")}
      ${L(92, 61, 222, 61)}${T(157, 55, "1 query: the orders", { s: 10, halo: true })}
      ${[0, 1, 2, 3].map((i) => L(92, 100 + i * 22, 222, 100 + i * 22, { c: C.r }) + T(157, 95 + i * 22, `items of order ${i + 1}`, { s: 10, c: C.r, halo: true })).join("")}
      ${T(160, 204, "1 + N round trips: slow as data grows", { s: 12, c: C.r, w: 600 })}
      ${box(342, 44, 70, 34, "App")}${box(542, 44, 80, 34, "Database")}
      ${L(412, 55, 542, 55, { c: C.g })}${T(477, 49, "1 query (JOIN)", { s: 10, halo: true })}
      ${L(542, 69, 412, 69, { c: C.g })}${T(477, 83, "orders + items", { s: 10, c: C.g, halo: true })}
      ${B(344, 104, 276, 64, C.gt, C.g)}${lines(482, 124, ["context.Orders.Include(o => o.Items)", "or .Select(o => new OrderDto { ... })"], { s: 11 })}
      ${T(480, 204, "One round trip, only the data you need", { s: 12, c: C.g, w: 600 })}
      ${T(320, 248, "Tip: add AsNoTracking() for read-only queries and keep DbContext scoped per request.", { s: 11.5, c: C.mute })}`, "N+1 queries compared with eager loading");
  },
  rest() {
    const col = (x, t, c, tint, rows) => B(x, 14, 150, 218, tint, c) + T(x + 75, 38, t, { w: 700, c }) + lines(x + 75, 62, rows, { s: 11.5 });
    return svg(300, `${col(10, "2xx Success", C.g, C.gt, ["200 OK", "201 Created", "202 Accepted", "204 No Content"])}
      ${col(170, "3xx Redirect", C.a, C.at, ["301 Moved", "304 Not Modified", "307 / 308 Redirect"])}
      ${col(330, "4xx Client error", C.w, C.wt, ["400 Bad request", "401 Not signed in", "403 Not allowed", "404 Not found", "409 Conflict", "422 Invalid data", "429 Too many"])}
      ${col(490, "5xx Server error", C.r, "var(--card)", ["500 Server error", "502 Bad gateway", "503 Unavailable", "504 Timeout"])}
      ${T(320, 258, "GET, PUT, DELETE are idempotent. POST is not. GET is also safe (no changes).", { s: 12, c: C.mute })}
      ${T(320, 280, "GET read · POST create · PUT replace · PATCH change part · DELETE remove", { s: 12, c: C.ink, w: 600 })}`, "HTTP status code families and method idempotency");
  },
  oop() {
    const p = (x, t, d, c, tint) => B(x, 20, 148, 150, tint, c) + T(x + 74, 46, t, { w: 700, c }) + lines(x + 74, 70, d, { s: 11.5 });
    return svg(220, `${p(8, "Encapsulation", ["hide the state", "private fields", "public methods", "valid objects only"], C.a, C.at)}
      ${p(168, "Abstraction", ["show what, not how", "interfaces", "abstract classes", "small contracts"], C.g, C.gt)}
      ${p(328, "Inheritance", ["reuse a base type", "Dog : Animal", "'is-a' relationship", "prefer composition"], C.w, C.wt)}
      ${p(488, "Polymorphism", ["one call, many forms", "virtual / override", "IPaymentGateway", "Stripe, PayPal ..."], C.r, "var(--card)")}
      ${T(320, 198, "Example: checkout depends on IPaymentGateway (abstraction); each gateway hides its keys (encapsulation).", { s: 11.5, c: C.mute })}`, "The four pillars of object-oriented programming");
  },
  patterns() {
    const col = (x, t, c, tint, items) => B(x, 14, 200, 198, tint, c) + T(x + 100, 40, t, { w: 700, c }) + lines(x + 100, 68, items, { s: 12 });
    return svg(250, `${col(8, "Creational", C.a, C.at, ["Singleton", "Factory Method", "Abstract Factory", "Builder", "Prototype"])}
      ${col(220, "Structural", C.g, C.gt, ["Adapter", "Decorator", "Facade", "Proxy", "Composite"])}
      ${col(432, "Behavioural", C.w, C.wt, ["Strategy", "Observer", "Mediator", "Command", "Template Method"])}
      ${T(320, 238, "How objects are created · how they are composed · how they talk to each other", { s: 12, c: C.mute })}`, "Design pattern categories with examples");
  },
  solid() {
    const p = (x, l, t, d, c, tint) => B(x, 18, 120, 176, tint, c) + T(x + 60, 62, l, { s: 38, w: 800, c }) + lines(x + 60, 86, t.split("|"), { w: 700, s: 12, c }) + lines(x + 60, 126, d, { s: 11 });
    return svg(220, `${p(6, "S", "Single|responsibility", ["one reason", "to change"], C.a, C.at)}
      ${p(132, "O", "Open|closed", ["extend with new", "code, do not edit"], C.g, C.gt)}
      ${p(258, "L", "Liskov|substitution", ["subtypes can stand", "in for the base"], C.w, C.wt)}
      ${p(384, "I", "Interface|segregation", ["many small", "interfaces"], C.r, "var(--card)")}
      ${p(510, "D", "Dependency|inversion", ["depend on", "abstractions"], C.a, C.at)}
      ${T(320, 210, "Fewer surprises when requirements change.", { s: 12, c: C.mute })}`, "The five SOLID principles");
  },
  microservices() {
    return svg(300, `${box(10, 118, 90, 44, "Clients", ["web, mobile"])}${box(130, 118, 100, 44, "API gateway", ["auth, routing"], { fill: C.at, stroke: C.a })}
      ${L(100, 140, 130, 140)}
      ${[["Orders", 24], ["Payments", 96], ["Inventory", 168], ["Shipping", 240]].map(([n, y]) => box(290, y, 110, 40, n) + box(440, y, 62, 40, "DB", [], { fill: C.gt, stroke: C.g }) + L(400, y + 20, 440, y + 20, { arrow: false }) + L(230, 140, 290, y + 20)).join("")}
      ${B(530, 24, 100, 256, C.wt, C.w)}${T(580, 50, "Message bus", { w: 700, c: C.w, s: 12 })}${lines(580, 72, ["events:", "OrderPlaced", "PaymentTaken", "StockReserved"], { s: 11 })}
      ${[44, 116, 188, 260].map((y) => L(502, y, 530, y, { d: true, c: C.w, arrow: false })).join("")}
      ${T(320, 296, "Each service owns its data. Use events, outbox, idempotent consumers and sagas.", { s: 11.5, c: C.mute })}`, "Microservices with an API gateway, one database per service and a message bus");
  },
  project() {
    const steps = [["Context", "what and who for"], ["Scale", "users, data, traffic"], ["Architecture", "main parts and why"], ["My role", "what I owned"], ["Result", "a number that shows impact"]];
    return svg(170, `${T(320, 22, "Two-minute project story", { w: 700 })}${steps.map(([t, d], i) => { const x = 8 + i * 126; return B(x, 44, 114, 72, i === 4 ? C.gt : C.card, i === 4 ? C.g : C.a) + T(x + 57, 72, `${i + 1}. ${t}`, { w: 700, s: 12.5 }) + lines(x + 57, 92, d.split(" ").reduce((a, w) => { const l = a[a.length - 1]; (l && (l + " " + w).length < 16) ? a[a.length - 1] = l + " " + w : a.push(w); return a; }, []), { s: 10.5, c: C.mute }); }).join("")}
      ${steps.slice(0, -1).map((_, i) => L(8 + i * 126 + 114, 80, 8 + (i + 1) * 126, 80)).join("")}
      ${T(320, 148, "Then use STAR for one hard problem: Situation, Task, Action, Result.", { s: 12, c: C.mute })}`, "Structure for explaining your current project");
  },
};
