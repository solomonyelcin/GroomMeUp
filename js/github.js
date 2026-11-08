// Publishing pictures to your own GitHub repo (folder content/) so they are available on every device.
// The site is static and cannot write to the repo by itself, so this uses the GitHub REST API from your browser
// with a fine-grained access token you paste in once. The token stays in this browser and is never exported.
import { ns } from "./account.js";
const KEY = ns("groommeup.gh");
export const DEFAULTS = { owner: "solomonyelcin", repo: "GroomMeUp-data", branch: "main" };
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
  return `${j.full_name} (${j.private ? "private, only you can read your files" : "PUBLIC: anything you add here can be read by anyone. Use a private repository for your library"}), branch ${getCfg().branch}`;
}

// who owns the token (GitHub login), used to sign in
export async function whoami(token = getCfg().token) {
  const res = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, cache: "no-store" });
  if (res.status === 401) throw new Error("GitHub rejected that token. Check that it is copied completely and has not expired.");
  if (!res.ok) throw new Error("GitHub could not tell who this token belongs to (" + res.status + ").");
  const j = await res.json(); return { login: j.login, name: j.name || "", avatar: j.avatar_url || "" };
}

// Read a file from the data repository with the token, so private repositories work too.
export async function fetchBlob(path) {
  const c = getCfg();
  const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(c.branch)}`, { headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub could not read " + path + " (" + res.status + ").");
  return res.blob();
}
export async function fetchJson(path) { const b = await fetchBlob(path); return b ? JSON.parse(await b.text()) : null; }

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
  await editManifest((l) => l.filter((x) => x.id !== id), "Remove " + id);
  for (const p of paths) await delFile(p, "Remove " + p);
}

// An article made from a file or from pasted text or a web page. Everything goes into the data repository under content/<id>/:
// article.json (the text blocks), original.<ext> (the file, if kept), img/ (pictures from Word files), questions.json (optional).
// original: { blob, name, type, size }; images: [{ id, blob, type, name }] where each img block's id is replaced by a path.
export async function publishDoc(art, original, onProgress, images = []) {
  const dir = `content/${art.id}`, entry = { id: art.id, title: art.title, topic: art.topic, t: art.t || Date.now(), kind: "doc", file: `${dir}/article.json`, source: art.source };
  const blocks = JSON.parse(JSON.stringify(art.blocks)), paths = [];
  for (let i = 0; i < images.length; i++) {
    onProgress?.(`Uploading picture ${i + 1} of ${images.length}…`, 0.1 + 0.3 * (i / images.length));
    const ext = (images[i].type.split("/")[1] || "png").replace("jpeg", "jpg"), path = `${dir}/img/${i + 1}.${ext}`;
    await putFile(path, await b64(images[i].blob), `Add picture ${i + 1} of "${art.title}"`); paths.push(path);
    blocks.forEach((b) => { if (b.type === "img" && b.id === images[i].id) { b.path = path; delete b.id; } });
  }
  if (paths.length) entry.images = paths;
  if (original) { onProgress?.("Uploading the original file…", 0.5); const ext = (original.name.split(".").pop() || "bin").toLowerCase(); const path = `${dir}/original.${ext}`; await putFile(path, await b64(original.blob), `Add original of "${art.title}"`); entry.original = { path, name: original.name, ext, type: original.type, size: original.size }; }
  onProgress?.("Uploading the article…", 0.7);
  await putFile(entry.file, text64(JSON.stringify(blocks)), `Add article "${art.title}"`);
  if (art.questions?.length) { entry.questions = `${dir}/questions.json`; await putFile(entry.questions, text64(JSON.stringify(art.questions)), `Add questions of "${art.title}"`); entry.questionCount = art.questions.length; }
  onProgress?.("Updating the list…", 0.9);
  await editManifest((l) => [entry, ...l.filter((x) => x.id !== art.id)], `Add "${art.title}"`);
  return { entry, blocks };
}

// change the text or title of an article that is already in the repository
export async function updateDoc(entry, { title, topic, blocks }) {
  if (blocks) await putFile(entry.file, text64(JSON.stringify(blocks)), `Edit article "${title || entry.title}"`);
  await editManifest((l) => l.map((x) => (x.id === entry.id ? { ...x, ...(title ? { title } : {}), ...(topic ? { topic } : {}) } : x)), `Rename "${title || entry.title}"`);
}

// What is available besides this device: the shared samples published on the site, and (when connected) everything in your
// own data repository, which may be private. Yours wins when both have the same id.
async function readManifest(fromRepo) {
  try {
    if (fromRepo) { const l = await fetchJson(MANIFEST); return Array.isArray(l) ? l : []; }
    const res = await fetch(MANIFEST + "?v=" + Date.now(), { cache: "no-store" });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}
export async function loadRemote() {
  const out = new Map();
  for (const fromRepo of connected() ? [false, true] : [false]) {
    for (const x of await readManifest(fromRepo)) {
      if (!x || !x.id) continue;
      try {
        if (Array.isArray(x.pages)) out.set(x.id, { ...x, remote: true, mine: fromRepo, pages: x.pages.map((p) => ({ ...p, url: fromRepo ? null : p.path })) });
        else if (x.kind === "doc" && x.file) {
          const blocks = fromRepo ? await fetchJson(x.file) : await (await fetch(x.file + "?v=" + (x.t || 0), { cache: "no-cache" })).json();
          if (Array.isArray(blocks)) out.set(x.id, { ...x, remote: true, mine: fromRepo, blocks });
        }
      } catch { /* skip this one */ }
    }
  }
  return [...out.values()];
}

// pictures of a private repository have no public address: fetch them with the token and give the viewer local addresses
export async function resolvePages(a) {
  if (!a.mine) return a.pages;
  return Promise.all(a.pages.map(async (p) => { if (p.url) return p; const b = await fetchBlob(p.path); return { ...p, url: b ? URL.createObjectURL(b) : null }; }));
}
export async function urlFor(path, mine) { if (!mine) return path; const b = await fetchBlob(path); return b ? URL.createObjectURL(b) : null; }

// save a small text file (used for the encrypted progress backup)
export const putText = (path, text, message) => putFile(path, text64(text), message);
