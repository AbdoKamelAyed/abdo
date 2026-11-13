// Review and publish: what changed, whether it is valid, and the single atomic commit.

import { ConflictError } from '../../shared/core/github-store.mjs';
import { chip, confirmDialog, field, h, textInput, toast } from '../dom.mjs';
import { drafts } from '../session.mjs';

function editorLink(rel) {
  let m;
  if ((m = rel.match(/^articles\/(art_[0-9a-z]{8})\.json$/))) return `#/articles/${m[1]}`;
  if ((m = rel.match(/^projects\/(prj_[0-9a-z]{8})\.json$/))) return `#/projects/${m[1]}`;
  if (rel === 'profile/author.json') return '#/profile';
  if (rel.startsWith('media/')) return '#/media';
  return null;
}

export function renderPublish(ctx) {
  const host = h('div');
  let busy = false;
  let message = '';
  let outcome = null; // { url } after a successful publish

  const stop = ctx.onValidation(() => { if (!busy) draw(); });

  async function publish() {
    busy = true; draw();
    try {
      ctx.workspace.stampUpdates();
      ctx.revalidate();
      const ready = ctx.workspace.readiness(ctx.registry);
      if (!ready.ok) { toast(ctx.t('cannot_publish'), 'error'); return; }
      const summary = ctx.workspace.summary();
      const text = message.trim() || ctx.t('default_commit', { n: summary.files.length });
      const result = await ctx.store.commit({ message: text, expectedHeadSha: ctx.workspace.headSha, changes: ctx.workspace.changes() });
      ctx.workspace.discardAll();
      await drafts.clear(drafts.key(ctx.repoInfo));
      await ctx.reload();
      outcome = { url: result.url, files: summary.files.length };
      message = '';
    } catch (error) {
      if (error instanceof ConflictError) { toast(ctx.t('conflict_message'), 'error'); } else ctx.fail(error);
    } finally { busy = false; draw(); }
  }

  async function discardAll() {
    const ok = await confirmDialog({ title: ctx.t('discard_all_title'), message: ctx.t('discard_all_message'), confirmLabel: ctx.t('discard'), cancelLabel: ctx.t('cancel'), danger: true });
    if (!ok) return;
    ctx.workspace.discardAll(); await drafts.clear(drafts.key(ctx.repoInfo)); ctx.revalidate(); ctx.changed(); draw();
  }

  async function reloadNow() {
    busy = true; draw();
    try { await ctx.reload(); toast(ctx.t('reloaded'), 'info'); } catch (error) { ctx.fail(error); } finally { busy = false; draw(); }
  }

  function draw() {
    host.replaceChildren();
    const ws = ctx.workspace;
    const summary = ws.summary();
    const ready = ws.readiness(ctx.registry);
    const { errors, warnings } = ctx.validation;

    if (outcome) {
      host.append(h('section', { class: 'card notice notice--ok', id: 'publish-success' }, h('h2', {}, ctx.t('published_title')), h('p', {}, ctx.t('published_text', { n: outcome.files })),
        outcome.url && outcome.url.startsWith('https://github.com/') ? h('p', {}, h('a', { href: outcome.url, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr' }, ctx.t('view_commit'))) : null,
        h('p', { class: 'muted' }, ctx.t('deploy_note')),
        ctx.config.apiBase === 'https://api.github.com' ? h('p', {}, h('a', { href: `https://github.com/${ctx.repoInfo.owner}/${ctx.repoInfo.repo}/actions`, target: '_blank', rel: 'noopener noreferrer' }, ctx.t('view_actions'))) : null));
    }

    host.append(h('div', { class: 'page-head' }, h('h1', {}, ctx.t('nav_publish')), h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'button', id: 'reload-repo', disabled: busy || null, onclick: reloadNow }, ctx.t('reload')),
      h('button', { type: 'button', class: 'button button--danger', id: 'discard-all', disabled: busy || !ws.isDirty || null, onclick: discardAll }, ctx.t('discard_all')))));

    host.append(h('section', { class: 'card' }, h('h2', {}, ctx.t('changes_title', { n: summary.files.length })),
      summary.files.length ? h('table', { class: 'table' }, h('tbody', {}, summary.files.map((f) => h('tr', { dataset: { rel: f.rel } },
        h('td', {}, chip(ctx.t(`change_${f.kind}`), f.kind === 'deleted' ? 'bad' : f.kind === 'added' ? 'ok' : '')),
        h('td', { dir: 'ltr' }, editorLink(f.rel) && f.kind !== 'deleted' ? h('a', { href: editorLink(f.rel) }, f.rel) : f.rel),
        h('td', {}, f.conflict ? h('span', {}, chip(ctx.t('conflict'), 'bad'), ' ', h('button', { type: 'button', class: 'button button--small', dataset: { keepMine: f.rel }, onclick: () => { ws.keepMine(f.rel); ctx.changed(); draw(); } }, ctx.t('keep_mine')), ' ', h('button', { type: 'button', class: 'button button--small', onclick: () => { ws.discard(f.rel); ctx.revalidate(); ctx.changed(); draw(); } }, ctx.t('discard_mine'))) : null))))) : h('p', { class: 'muted' }, ctx.t('no_changes'))));

    if (ws.conflicts.length) host.append(h('div', { class: 'notice notice--warn' }, ctx.t('conflicts_notice')));

    host.append(h('section', { class: `card${errors.length ? ' notice notice--bad' : ''}`, id: 'validation-card' },
      h('h2', {}, errors.length ? ctx.t('problems_title', { n: errors.length }) : ctx.t('valid_title')),
      errors.length ? h('p', { class: 'muted' }, ctx.t('problems_block_publish')) : h('p', { class: 'muted' }, ctx.t('valid_text')),
      errors.length ? h('ul', {}, errors.map((e) => h('li', { dir: 'ltr' }, h('code', {}, e.file.replace(/^content\//, '')), ' › ', h('code', {}, e.path), ' ', e.message, ' ', (() => { const link = editorLink(e.file.replace(/^content\//, '')); return link ? h('a', { href: link }, ctx.t('open')) : null; })()))) : null,
      warnings.length ? h('div', {}, h('h3', {}, ctx.t('warnings_title', { n: warnings.length })), h('ul', {}, warnings.map((w) => h('li', { dir: 'ltr' }, h('code', {}, w.file.replace(/^content\//, '')), ' ', w.message)))) : null));

    host.append(h('section', { class: 'card' },
      field({ label: ctx.t('commit_message'), hint: ctx.t('commit_hint'), wide: true, control: textInput({ value: message, maxLength: 200, onInput: (v) => { message = v; } }) }),
      h('button', { type: 'button', class: 'button button--primary', id: 'publish-button', disabled: busy || !ready.ok || null, onclick: publish }, busy ? ctx.t('publishing') : ctx.t('publish_now')),
      !ready.ok && ws.isDirty ? h('p', { class: 'muted small' }, ctx.t(ready.reasons.includes('conflicts') ? 'blocked_conflicts' : 'blocked_invalid')) : null));
  }

  draw();
  return { el: host, dispose: stop };
}
