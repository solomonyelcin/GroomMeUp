// Who is using this browser. A person signs in with their GitHub token, and from then on their progress, settings and library are
// theirs alone: this browser keeps each person's data under their own name, and the data itself lives in their own private repository.
// Signed out ("guest"), everything works exactly as before and stays in this browser.
const USER = "groommeup.user", ACCTS = "groommeup.accounts";
const rd = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const currentUser = () => rd(USER) || "";
// the storage key for the person using the browser right now
export const ns = (key) => { const u = currentUser(); return u ? `${key}.u.${u}` : key; };
export const PER_USER = ["groommeup.v1", "groommeup.gh", "groommeup.backup", "groommeup.setup", "groommeup.read", "groommeup.faq", "groommeup.libpass", "groommeup.sync", "groommeup.profile"];
export const accounts = () => { try { return JSON.parse(rd(ACCTS) || "[]"); } catch { return []; } };
export function rememberAccount(login, profile) {
  try {
    const l = accounts().filter((a) => a.login !== login); l.unshift({ login, name: profile?.name || "", avatar: profile?.avatar || "" });
    localStorage.setItem(ACCTS, JSON.stringify(l.slice(0, 8)));
  } catch { /* ignore */ }
}
export const setUser = (login) => { try { login ? localStorage.setItem(USER, login) : localStorage.removeItem(USER); } catch { /* ignore */ } };
// remove everything this browser holds for one person (their token, progress and settings); used when signing out on a shared device
export function wipeUser(login) { try { for (const k of PER_USER) localStorage.removeItem(`${k}.u.${login}`); localStorage.setItem(ACCTS, JSON.stringify(accounts().filter((a) => a.login !== login))); } catch { /* ignore */ } }
export const profile = () => { try { return JSON.parse(rd(ns("groommeup.profile")) || "null"); } catch { return null; } };
