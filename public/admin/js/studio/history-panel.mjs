// Revision history from Git: the commits that changed this file, a word-by-word comparison with any of
// them, and restoring an older text. Nothing here is stored by the admin: history is the repository's,
// so it is only what has been published; unpublished edits in this browser are not in it yet.

import { META, diffTranslation, restoreTranslation } from '../../shared/core/revisions.mjs';
import { confirmDialog, h, toast } from '../dom.mjs';

const dateText = (ctx, iso) => {
  const d = new Date(iso ?? '');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(ctx.ui === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

/** Words of a diff, with removed text struck through and added text underlined (as <del> and <ins>, never colour alone). */
function runsView(runs, dir) {
  return h('span', { class: 'diff', dir: dir ?? 'auto' }, runs.map((run) => (run.op === 'same' ? run.text : h(run.op === 'add' ? 'ins' : 'del', {}, run.text))));
}

const blockLabel = (ctx, entry) => { const key = `block_${entry.type}`; return ctx.t(key); };

/**
 * @param {{ ctx: object, rel: string, getRecord: () => object, getLang: () => string, getEditor: () => object, onRestored: () => void }} args
 */
export function historyPanel({ ctx, rel, getRecord, getLang, getEditor, onRestored }) {
  const host = h('div', { class: 'history' });
  const el = h('section', { class: 'panel', dataset: { panel: 'history' } }, h('h3', {}, ctx.t('panel_history')), h('p', { class: 'small muted' }, ctx.t('rev_intro')), host);
  const cache = new Map(); // commit sha -> parsed file
  let commits = null; let selected = null; let busy = false;

  const versionAt = async (sha) => {
    if (!cache.has(sha)) cache.set(sha, await ctx.store.readJsonAt(rel, sha));
    return cache.get(sha);
  };

  async function load() {
    if (busy) return;
    busy = true; draw();
    try { commits = await ctx.store.listFileCommits(rel, { limit: 30 }); } catch (error) { commits = null; ctx.fail(error); }
    busy = false; draw();
  }

  async function choose(commit) {
    if (busy) return;
    busy = true; draw();
    try { const file = await versionAt(commit.sha); selected = { commit, file }; } catch (error) { ctx.fail(error); }
    busy = false; draw();
  }

  async function restore(scope, old) {
    const ok = await confirmDialog({ title: ctx.t(scope === 'all' ? 'rev_restore_all' : 'rev_restore_body'), message: ctx.t('rev_restore_confirm', { date: dateText(ctx, selected.commit.date) }), confirmLabel: ctx.t('rev_restore'), cancelLabel: ctx.t('cancel') });
    if (!ok) return;
    const record = getRecord(); const lang = getLang();
    const restored = restoreTranslation(record.translations[lang], old, scope);
    const editor = getEditor();
    editor.replaceAll(restored.body); // one undoable step
    if (scope === 'all') {
      const tr = record.translations[lang];
      for (const key of META) { if (restored[key] === undefined) delete tr[key]; else tr[key] = restored[key]; }
      if (restored.seo === undefined) delete tr.seo; else tr.seo = restored.seo;
      onRestored();
    }
    toast(ctx.t('rev_restored', { date: dateText(ctx, selected.commit.date) }), 'info');
  }

  function compareView() {
    const { commit, file } = selected;
    const lang = getLang();
    const old = file?.translations?.[lang];
    if (!old) return h('p', { class: 'muted' }, ctx.t('rev_no_language'));
    const current = getRecord().translations[lang];
    const diff = diffTranslation(old, current);
    const dir = ctx.langDir(lang);
    const changed = diff.body.filter((e) => e.status !== 'same');
    const labels = { title: 'field_title', subtitle: 'field_subtitle', excerpt: 'field_excerpt', summary: 'field_summary', coverAlt: 'field_cover_alt' };
    return h('div', { class: 'history__compare', dataset: { compare: commit.sha } },
      h('h4', {}, ctx.t('rev_compare_title', { date: dateText(ctx, commit.date) })),
      diff.identical ? h('p', { class: 'muted' }, ctx.t('rev_identical')) : h('p', { class: 'small' }, ctx.t('rev_summary', diff.summary)),
      ...diff.meta.map((m) => { const key = labels[m.key]; return h('p', {}, h('strong', {}, `${ctx.t(key)}: `), runsView(m.runs, dir)); }),
      ...changed.map((entry) => h('div', { class: `diff-block diff-block--${entry.status}`, dataset: { status: entry.status } },
        h('p', { class: 'small muted' }, `${blockLabel(ctx, entry)} · ${ctx.t(`rev_${entry.status}`)}`),
        ...(entry.status === 'changed' ? [...entry.fields.map((f) => h('p', {}, runsView(f.runs, dir))), entry.props?.length ? h('p', { class: 'small muted' }, ctx.t('rev_settings_changed', { list: entry.props.join(', ') })) : null]
          : entry.status === 'moved' ? [] : [h('p', { dir }, entry.status === 'added' ? summaryText(entry.after) : summaryText(entry.before))]))),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'button button--small', dataset: { restore: 'body' }, onclick: () => restore('body', old) }, ctx.t('rev_restore_body')),
        h('button', { type: 'button', class: 'button button--small', dataset: { restore: 'all' }, onclick: () => restore('all', old) }, ctx.t('rev_restore_all'))),
      commit.url ? h('p', { class: 'small' }, h('a', { href: commit.url, target: '_blank', rel: 'noopener noreferrer' }, ctx.t('view_commit'))) : null);
  }
  const summaryText = (block) => { const text = (block?.text ?? block?.items?.[0]?.text ?? block?.items?.[0] ?? ''); return typeof text === 'string' ? text.slice(0, 200) : ''; };

  function draw() {
    if (!ctx.store) { host.replaceChildren(h('p', { class: 'muted' }, ctx.t('rev_unavailable'))); return; }
    if (commits === null) { host.replaceChildren(h('button', { type: 'button', class: 'button button--small', id: 'load-history', disabled: busy || null, onclick: load }, busy ? ctx.t('rev_loading') : ctx.t('rev_load'))); return; }
    host.replaceChildren(
      commits.length ? h('ol', { class: 'history__list' }, commits.map((c) => h('li', { class: selected?.commit.sha === c.sha ? 'is-active' : '' },
        h('button', { type: 'button', class: 'linklike', dataset: { commit: c.sha }, disabled: busy || null, onclick: () => choose(c) }, h('strong', {}, dateText(ctx, c.date)), ' ', c.message || ctx.t('rev_no_message')),
        c.author ? h('span', { class: 'small muted' }, ` · ${c.author}`) : null)))
        : h('p', { class: 'muted' }, ctx.t('rev_none')),
      busy ? h('p', { class: 'muted', role: 'status' }, ctx.t('rev_loading')) : null,
      selected ? compareView() : null);
  }
  draw();
  // A new language shows another translation of the same file.
  return { el, refresh: () => { if (selected) draw(); }, onLanguageChange: () => { selected = null; draw(); } };
}

