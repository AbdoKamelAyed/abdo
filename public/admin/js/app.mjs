// Admin application shell: sign-in, routing, shared state. Screens live in ./views/.

import { createRegistryFromSchemas } from '../shared/core/registry.mjs';
import { GitHubError, GitHubStore } from '../shared/core/github-store.mjs';
import { Workspace } from '../shared/core/workspace.mjs';
import { clear, h, toast } from './dom.mjs';
import { drafts, session } from './session.mjs';
import { translate } from './strings.mjs';
import { renderAppearance } from './views/appearance.mjs';
import { renderArticleEditor } from './views/article.mjs';
import { renderHomepage } from './views/homepage.mjs';
import { renderLists } from './views/lists.mjs';
import { renderLogin } from './views/login.mjs';
import { renderMedia } from './views/media.mjs';
import { renderNavigation } from './views/navigation.mjs';
import { renderOverview } from './views/overview.mjs';
import { renderProfile } from './views/profile.mjs';
import { renderProjectEditor } from './views/project.mjs';
import { renderPublish } from './views/publish.mjs';
import { renderSearch } from './views/search.mjs';
import { renderTags } from './views/tags.mjs';
import { renderTopics } from './views/topics.mjs';

const ROUTES = ['overview', 'articles', 'projects', 'profile', 'media', 'topics', 'tags', 'homepage', 'navigation', 'search', 'appearance', 'publish'];

const ctx = {
  config: null, registry: null, store: null, workspace: null, repoInfo: null, repoCheck: null,
  ui: 'en', validation: { errors: [], warnings: [], content: null }, view: null, mediaUrls: new Map(),
};

export const app = ctx;

// ---------------------------------------------------------------- helpers shared by screens

ctx.t = (key, params = {}) => translate(ctx.ui, key, params);
ctx.dir = () => (ctx.ui === 'ar' ? 'rtl' : 'ltr');
ctx.content = () => ctx.validation.content ?? ctx.workspace.content();
ctx.languages = () => ctx.content().languages.filter((l) => l.enabled);
ctx.langName = (code) => ctx.content().languages.find((l) => l.code === code)?.nativeName ?? code;
ctx.langDir = (code) => ctx.content().languages.find((l) => l.code === code)?.direction ?? 'ltr';

/** A display title in the admin language, falling back to any other language the item has. */
ctx.titleOf = (translations, key = 'title') => {
  const tr = translations?.[ctx.ui] ?? Object.values(translations ?? {})[0];
  return tr?.[key] || ctx.t('untitled');
};

ctx.navigate = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

ctx.fail = (error) => {
  if (error instanceof GitHubError && error.kind === 'auth') { toast(error.message, 'error'); logout(); return; }
  toast(error?.message ?? String(error), 'error');
};

/** Display URL for a media file (blob URL, cached). Returns null if it cannot be loaded. */
ctx.mediaUrl = async (name) => {
  if (ctx.mediaUrls.has(name)) return ctx.mediaUrls.get(name);
  const promise = (async () => {
    const entry = ctx.workspace.mediaFiles().get(name);
    if (!entry) return null;
    const bytes = entry.bytes ?? await ctx.store.readBlob(entry.sha);
    const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    return URL.createObjectURL(new Blob([bytes], { type: types[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream' }));
  })().catch(() => null);
  ctx.mediaUrls.set(name, promise);
  return promise;
};

// ---------------------------------------------------------------- change tracking

let saveTimer; let validateTimer;
const listeners = new Set();
ctx.onValidation = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Unpublished work is kept in this browser (IndexedDB) shortly after every change. Screens that want to tell
// the author so (the Studio's "saved" note) listen here; `ok` is false when the browser refused to store it.
const savedListeners = new Set();
ctx.draftSavedAt = null;
ctx.onDraftSaved = (fn) => { savedListeners.add(fn); return () => savedListeners.delete(fn); };

ctx.changed = () => {
  clearTimeout(saveTimer); clearTimeout(validateTimer);
  updateBadge();
  validateTimer = setTimeout(() => { revalidate(); }, 150);
  saveTimer = setTimeout(async () => {
    if (!ctx.workspace) return; // signed out meanwhile
    const ok = (await drafts.save(drafts.key(ctx.repoInfo), ctx.workspace.exportState())) !== null;
    ctx.draftSavedAt = ok ? Date.now() : null;
    for (const fn of savedListeners) fn({ ok });
  }, 400);
};

export function revalidate() {
  ctx.validation = ctx.workspace.validate(ctx.registry);
  updateBadge();
  for (const fn of listeners) fn(ctx.validation);
}
ctx.revalidate = revalidate;

function updateBadge() {
  const badge = document.getElementById('staged-badge');
  if (!badge || !ctx.workspace) return;
  const n = ctx.workspace.staged.size;
  badge.textContent = n ? ctx.t('unpublished_count', { n }) : ctx.t('all_published');
  badge.className = `badge${n ? ' badge--pending' : ''}`;
}

/** Problems that belong to one content file (path relative to the content folder). */
ctx.problemsFor = (rel, validation = ctx.validation) => ({
  errors: validation.errors.filter((e) => e.file === `content/${rel}`),
  warnings: validation.warnings.filter((w) => w.file === `content/${rel}`),
});

// ---------------------------------------------------------------- sign-in / sign-out

async function login({ token, owner, repo, branch, remember }) {
  const store = new GitHubStore({ token, owner, repo, branch, apiBase: ctx.config.apiBase });
  const check = await store.verify();
  const snapshot = await store.readSnapshot();
  const workspace = new Workspace(snapshot);
  const repoInfo = { owner, repo, branch };
  const saved = await drafts.load(drafts.key(repoInfo));
  const restored = saved ? workspace.importState(saved) : { restored: 0, conflicts: [] };

  Object.assign(ctx, { store, workspace, repoInfo, repoCheck: check });
  session.setToken(token, remember);
  session.saveRepo(repoInfo);
  revalidate();
  if (restored.restored) toast(ctx.t('restored_changes', { n: restored.restored }), 'info');
  if (restored.conflicts.length) toast(ctx.t('restored_conflicts', { n: restored.conflicts.length }), 'error');
  const target = location.hash && location.hash !== '#/login' ? location.hash : '#/overview';
  renderShell();
  if (location.hash === target) render(); else location.hash = target; // a hash change renders by itself
}

ctx.reload = async () => {
  const snapshot = await ctx.store.readSnapshot();
  ctx.workspace.rebase(snapshot);
  ctx.mediaUrls.clear();
  revalidate();
  ctx.changed();
};

function logout() {
  session.clearToken();
  Object.assign(ctx, { store: null, workspace: null, validation: { errors: [], warnings: [], content: null } });
  for (const p of ctx.mediaUrls.values()) p.then((u) => u && URL.revokeObjectURL(u));
  ctx.mediaUrls.clear();
  renderShell();
  if (location.hash === '#/login') render(); else location.hash = '#/login';
}

// ---------------------------------------------------------------- shell and routing

function applyLanguage() {
  document.documentElement.lang = ctx.ui;
  document.documentElement.dir = ctx.dir();
  document.title = ctx.t('app_title');
}

function renderShell() {
  const root = document.getElementById('app');
  clear(root);
  const signedIn = Boolean(ctx.workspace);
  const header = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: signedIn ? '#/overview' : '#/login' }, 'ABDO', h('span', {}, ctx.t('admin'))),
    signedIn ? h('span', { class: 'repo-name', dir: 'ltr' }, `${ctx.repoInfo.owner}/${ctx.repoInfo.repo}@${ctx.repoInfo.branch}`) : null,
    h('span', { class: 'spacer' }),
    signedIn ? h('a', { id: 'staged-badge', class: 'badge', href: '#/publish' }) : null,
    h('button', { type: 'button', class: 'button button--small', id: 'lang-toggle', onclick: () => { ctx.ui = ctx.ui === 'ar' ? 'en' : 'ar'; session.setUiLang(ctx.ui); applyLanguage(); renderShell(); render(); } }, ctx.ui === 'ar' ? 'English' : 'العربية'),
    signedIn ? h('button', { type: 'button', class: 'button button--small', id: 'logout', onclick: logout }, ctx.t('sign_out')) : null);
  const nav = signedIn ? h('nav', { class: 'nav', 'aria-label': ctx.t('main_navigation') }, ROUTES.map((r) => h('a', { href: `#/${r}`, dataset: { route: r } }, ctx.t(`nav_${r}`)))) : null;
  root.append(header, h('div', { class: 'layout' }, nav, h('main', { id: 'main', tabindex: '-1' })));
  updateBadge();
}

function render() {
  const main = document.getElementById('main');
  if (!main) return;
  ctx.view?.dispose?.();
  ctx.view = null;
  clear(main);

  const [, route = 'overview', param] = location.hash.split('/').map(decodeURIComponent);
  if (!ctx.workspace) { ctx.view = renderLogin(ctx, { onLogin: (v) => login(v), repo: session.repo() ?? ctx.config.defaultRepo }); main.append(ctx.view.el); return; }

  for (const a of document.querySelectorAll('.nav a')) a.classList.toggle('is-active', a.dataset.route === route);
  const views = {
    overview: () => renderOverview(ctx),
    articles: () => (param ? renderArticleEditor(ctx, param) : renderLists(ctx, 'article')),
    projects: () => (param ? renderProjectEditor(ctx, param) : renderLists(ctx, 'project')),
    profile: () => renderProfile(ctx),
    media: () => renderMedia(ctx),
    topics: () => renderTopics(ctx, param),
    tags: () => renderTags(ctx, param),
    homepage: () => renderHomepage(ctx),
    navigation: () => renderNavigation(ctx),
    search: () => renderSearch(ctx),
    appearance: () => renderAppearance(ctx),
    publish: () => renderPublish(ctx),
  };
  const make = views[route] ?? views.overview;
  ctx.view = make();
  main.append(ctx.view.el);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
ctx.render = render;

// ---------------------------------------------------------------- boot

async function boot() {
  ctx.ui = session.uiLang();
  applyLanguage();
  try {
    ctx.config = await (await fetch('config.json', { cache: 'no-store' })).json();
    const schemas = await Promise.all(ctx.config.schemas.map(async (name) => (await fetch(`schemas/${name}`)).json()));
    ctx.registry = createRegistryFromSchemas(schemas);
  } catch {
    document.getElementById('app').append(h('p', { class: 'fatal' }, ctx.t('load_failed')));
    return;
  }
  window.addEventListener('hashchange', render);

  const repo = session.repo() ?? ctx.config.defaultRepo;
  const token = session.token();
  renderShell();
  if (token && repo) {
    try { await login({ token, ...repo, remember: true }); return; } catch (error) { session.clearToken(); if (error?.kind !== 'auth') toast(error.message, 'error'); }
  }
  location.hash = '#/login';
  render();
}

boot();
