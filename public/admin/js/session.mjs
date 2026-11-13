// Everything the admin remembers, and where.
//
//   access token   memory only; optionally sessionStorage ("this tab"). Never localStorage, never a file.
//   repository     localStorage (owner/name/branch: not secret)
//   language       localStorage
//   word goal      localStorage, key abdo.goal.<record id>.<language> (a number; kept by the Studio's Checks panel)
//   unpublished    IndexedDB, per repository and branch (content the owner is still working on)
//
// Every storage call is wrapped: private windows and blocked storage must never break the admin.

const TOKEN_KEY = 'abdo.admin.token';
const REPO_KEY = 'abdo.admin.repo';
const LANG_KEY = 'abdo.admin.lang';

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
let memoryToken = null;

export const session = {
  token() { return memoryToken ?? safe(() => sessionStorage.getItem(TOKEN_KEY)); },
  setToken(token, rememberForTab) {
    memoryToken = token;
    safe(() => (rememberForTab ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY)));
  },
  clearToken() { memoryToken = null; safe(() => sessionStorage.removeItem(TOKEN_KEY)); },
  repo() { return safe(() => JSON.parse(localStorage.getItem(REPO_KEY) ?? 'null')); },
  saveRepo(repo) { safe(() => localStorage.setItem(REPO_KEY, JSON.stringify({ owner: repo.owner, repo: repo.repo, branch: repo.branch }))); },
  uiLang() { return safe(() => localStorage.getItem(LANG_KEY)) ?? (String(navigator.language).startsWith('ar') ? 'ar' : 'en'); },
  setUiLang(lang) { safe(() => localStorage.setItem(LANG_KEY, lang)); },
};

// ---------------------------------------------------------------- unpublished changes (IndexedDB)

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('abdo-admin', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function run(mode, action) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => { db.close(); resolve(request?.result ?? null); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch { return null; }
}

export const drafts = {
  key: ({ owner, repo, branch }) => `${owner}/${repo}@${branch}`,
  load: (key) => run('readonly', (s) => s.get(key)),
  save: (key, state) => run('readwrite', (s) => s.put(state, key)),
  clear: (key) => run('readwrite', (s) => s.delete(key)),
};
