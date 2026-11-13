// Article and project lists, with filters and the "new" dialog.

import { createArticle, createProject } from '../../shared/core/content-ops.mjs';
import { chip, field, h, modal, selectInput, textInput } from '../dom.mjs';
import { STATUSES } from './editor-common.mjs';

export function renderLists(ctx, kind) {
  const isArticle = kind === 'article';
  const folder = isArticle ? 'articles' : 'projects';
  const filter = { text: '', status: '' };
  const tbody = h('tbody');
  const count = h('p', { class: 'muted' });

  function rows() {
    const content = ctx.content();
    const items = (isArticle ? content.articles : content.projects).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const q = filter.text.trim().toLowerCase();
    return items.filter((item) => (!filter.status || item.status === filter.status)
      && (!q || Object.values(item.translations).some((tr) => tr.title.toLowerCase().includes(q))));
  }

  function draw() {
    tbody.replaceChildren();
    const items = rows();
    count.textContent = ctx.t('showing_count', { n: items.length });
    if (!items.length) tbody.append(h('tr', {}, h('td', { colspan: 5, class: 'muted empty' }, ctx.t('nothing_here'))));
    for (const item of items) {
      const rel = `${folder}/${item.id}.json`;
      const pending = ctx.workspace.staged.has(rel);
      tbody.append(h('tr', { dataset: { id: item.id } },
        h('td', {}, h('a', { href: `#/${folder}/${item.id}`, class: 'row-title' }, ctx.titleOf(item.translations)), pending ? h('span', { class: 'dot', title: ctx.t('has_unpublished_changes') }, '●') : null, item.featured ? ' ★' : ''),
        h('td', {}, chip(ctx.t(`status_${item.status}`), item.status === 'published' ? 'ok' : '')),
        h('td', { class: 'langs' }, ctx.languages().map((l) => {
          const tr = item.translations[l.code];
          return h('span', { class: `lang-dot ${tr ? (tr.status === 'published' ? 'is-live' : 'is-draft') : 'is-missing'}`, title: tr ? ctx.t(`status_${tr.status}`) : ctx.t('no_translation'), dir: 'ltr' }, l.code.toUpperCase());
        })),
        h('td', { dir: 'ltr', class: 'muted' }, item.updatedAt.slice(0, 10)),
        h('td', {}, h('a', { class: 'button button--small', href: `#/${folder}/${item.id}` }, ctx.t('edit')))));
    }
  }

  async function createNew() {
    const langs = ctx.languages();
    const input = { lang: langs.find((l) => l.default)?.code ?? langs[0].code, title: '', summary: '' };
    const errorEl = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t(isArticle ? 'new_article' : 'new_project'),
      body: h('div', {},
        field({ label: ctx.t('language'), control: selectInput({ value: input.lang, options: langs.map((l) => ({ value: l.code, label: l.nativeName })), onChange: (v) => { input.lang = v; } }) }),
        field({ label: ctx.t('field_title'), control: textInput({ onInput: (v) => { input.title = v; } }), wide: true }),
        field({ label: ctx.t(isArticle ? 'field_excerpt' : 'field_summary'), hint: ctx.t('new_hint'), control: textInput({ multiline: true, rows: 3, onInput: (v) => { input.summary = v; } }), wide: true }),
        errorEl),
      actions: (close) => [
        h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
        h('button', { type: 'button', class: 'button button--primary', id: 'create-confirm', onclick: () => {
          if (!input.title.trim() || !input.summary.trim()) { errorEl.textContent = ctx.t('title_and_summary_required'); errorEl.hidden = false; return; }
          close(input);
        } }, ctx.t('create')),
      ],
    });
    if (!result) return;
    const content = ctx.content();
    const record = isArticle
      ? createArticle(content, { lang: result.lang, title: result.title, excerpt: result.summary, authorId: content.profile.id })
      : createProject(content, { lang: result.lang, title: result.title, summary: result.summary });
    ctx.workspace.write(`${folder}/${record.id}.json`, record);
    ctx.changed();
    ctx.revalidate();
    ctx.navigate(`#/${folder}/${record.id}`);
  }

  const el = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t(isArticle ? 'nav_articles' : 'nav_projects')), h('button', { type: 'button', class: 'button button--primary', id: 'new-item', onclick: createNew }, ctx.t(isArticle ? 'new_article' : 'new_project'))),
    h('div', { class: 'filters' },
      field({ label: ctx.t('search'), control: textInput({ onInput: (v) => { filter.text = v; draw(); } }) }),
      field({ label: ctx.t('status'), control: selectInput({ value: '', options: [{ value: '', label: ctx.t('all') }, ...STATUSES.map((s) => ({ value: s, label: ctx.t(`status_${s}`) }))], onChange: (v) => { filter.status = v; draw(); } }) })),
    count,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--list' },
      h('thead', {}, h('tr', {}, ['field_title', 'status', 'languages', 'updated', ''].map((k) => h('th', {}, k ? ctx.t(k) : '')))), tbody)));
  draw();
  return { el };
}
