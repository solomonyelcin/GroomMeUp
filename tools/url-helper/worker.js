// Optional free helper for "Add material → From a web address".
// Browsers stop pages from reading other websites, so this tiny Cloudflare Worker fetches the page for the app.
// Deploy: Cloudflare dashboard → Workers & Pages → Create Worker → paste this → Deploy (free plan is plenty).
// Then in GroomMeUp Settings set the helper address to:  https://YOUR-WORKER.workers.dev/?url={url}
// It only fetches web pages and files (http/https), nothing else, and keeps no data.
export default {
  async fetch(req) {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Expose-Headers": "content-type" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const target = new URL(req.url).searchParams.get("url") || "";
    let u; try { u = new URL(target); } catch { return new Response("Bad address", { status: 400, headers: cors }); }
    if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname)) return new Response("Not allowed", { status: 403, headers: cors });
    const r = await fetch(u.toString(), { headers: { "User-Agent": "Mozilla/5.0 GroomMeUp reader", Accept: "text/html,application/pdf,*/*" }, redirect: "follow" });
    if (Number(r.headers.get("content-length") || 0) > 15e6) return new Response("Too large", { status: 413, headers: cors });
    return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": r.headers.get("content-type") || "text/html" } });
  },
};
