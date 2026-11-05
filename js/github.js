// Publishing pictures to your own GitHub repo (folder content/) so they are available on every device.
// The site is static and cannot write to the repo by itself, so this uses the GitHub REST API from your browser
// with a fine-grained access token you paste in once. The token stays in this browser and is never exported.
const KEY = "groommeup.gh";
export const DEFAULTS = { owner: "solomonyelcin", repo: "GroomMeUp", branch: "main" };
export const MANIFEST = "content/articles.json";

export const getCfg = () => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; } };
export const setCfg = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } };
export const clearCfg = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
export const connected = () => !!getCfg().token;

async function api(method, path, body) {
  const c = getCfg();
  if (!c.token) throw new Error("GitHub is not connected. Add your access token in Settings.");
  const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error("GitHub rejected the token (expired or wrong). Make a new one in Settings.");
  if (res.status === 403 || res.status === 404) { if (method !== "GET" || path === "") throw new Error(res.status === 404 ? "Repository not found, or the token has no access to it." : "The token is not allowed to do this. It needs Contents: Read and write on this repository."); }
  return res;
}
const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("Could not read the picture.")); r.readAsDataURL(blob); });
const text64 = (s) => btoa(unescape(encodeURIComponent(s)));
const unText64 = (b) => decodeURIComponent(escape(atob(b.replace(/\n/g, ""))));

export async function testConnection() {
  const res = await api("GET", "");
  if (!res.ok) throw new Error("Could not reach the repository (" + res.status + ").");
  const j = await res.json();
  if (j.permissions && !j.permissions.push) throw new Error("The token can read the repository but not write to it. Give it Contents: Read and write.");
  return `${j.full_name} (${j.private ? "private" : "public"}), branch ${getCfg().branch}`;
}

async function sha(path) {
  const res = await api("GET", `contents/${path}?ref=${encodeURIComponent(getCfg().branch)}`);
  return res.ok ? (await res.json()).sha : null;
}
async function putFile(path, contentB64, message) {
  for (let i = 0; i < 3; i++) {
    const body = { message, content: contentB64, branch: getCfg().branch }, s = await sha(path); if (s) body.sha = s;
    const res = await api("PUT", `contents/${path}`, body);
    if (res.ok) return;
    if (res.status !== 409 && res.status !== 422) throw new Error("GitHub could not save " + path + " (" + res.status + ").");
  }
  throw new Error("GitHub kept refusing " + path + ". Try again in a moment.");
}
async function delFile(path, message) {
  const s = await sha(path); if (!s) return;
  await api("DELETE", `contents/${path}`, { message, sha: s, branch: getCfg().branch });
}

// read the manifest, change it, write it back (retries if something else changed it in between)
async function editManifest(fn, message) {
  for (let i = 0; i < 4; i++) {
    const res = await api("GET", `contents/${MANIFEST}?ref=${encodeURIComponent(getCfg().branch)}`);
    let list = [], s = null;
    if (res.ok) { const j = await res.json(); s = j.sha; try { list = JSON.parse(unText64(j.content)); } catch { list = []; } }
    list = fn(Array.isArray(list) ? list : []);
    const body = { message, content: text64(JSON.stringify(list, null, 1) + "\n"), branch: getCfg().branch }; if (s) body.sha = s;
    const put = await api("PUT", `contents/${MANIFEST}`, body);
    if (put.ok) return list;
    if (put.status !== 409 && put.status !== 422) throw new Error("GitHub could not update the list of pictures (" + put.status + ").");
  }
  throw new Error("The list of pictures changed on GitHub at the same time. Try again.");
}

// pages: [{ blob, w, h, name }] -> manifest entry (paths are relative to the site)
export async function publishImages(art, blobs, onProgress) {
  const pages = [];
  for (let i = 0; i < blobs.length; i++) {
    onProgress?.(`Uploading picture ${i + 1} of ${blobs.length}…`, i / (blobs.length + 1));
    const path = `content/${art.id}/${String(i + 1).padStart(2, "0")}.jpg`;
    await putFile(path, await b64(blobs[i]), `Add picture ${i + 1} of "${art.title}"`);
    pages.push({ path, w: art.pages[i].w, h: art.pages[i].h, name: art.pages[i].name });
  }
  onProgress?.("Updating the list…", blobs.length / (blobs.length + 1));
  const entry = { id: art.id, title: art.title, topic: art.topic, t: art.t, kind: "images", pages };
  await editManifest((l) => [entry, ...l.filter((x) => x.id !== art.id)], `Add "${art.title}"`);
  return entry;
}

export async function unpublish(id, paths = []) {
  await editManifest((l) => l.filter((x) => x.id !== id), "Remove pictures " + id);
  for (const p of paths) await delFile(p, "Remove " + p);
}

// what other devices published (public files on the site, no token needed)
export async function loadRemote() {
  try {
    const res = await fetch(MANIFEST + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return [];
    const l = await res.json();
    return (Array.isArray(l) ? l : []).filter((x) => x && x.id && Array.isArray(x.pages)).map((x) => ({ ...x, remote: true, pages: x.pages.map((p) => ({ ...p, url: p.path })) }));
  } catch { return []; }
}
