// The Tag Manager: every tag with its usage, duplicates and look-alikes, bulk edits, merging, and the editor for one tag.
// The rules (merge, delete, similarity, usage counts) live in src/core/taxonomy-ops.mjs and are tested there.

import { addTranslation, analytics, bulkEdit, createTag, deleteTag, deleteTags, duplicateGroups, mergeTags, similarPairs, similarTo, tagBlockers, unusedTags, usage } from '../../shared/core/taxonomy-ops.mjs';
import { checkGroup, checkInput, chip, confirmDialog, field, h, modal, selectInput, tabs, textInput, toast } from '../dom.mjs';
import { createPreview } from '../preview.mjs';
import { problemsPanel, setOpt, statusOptions } from './editor-common.mjs';
import { bulkBar, chooseTarget, fresh, itemsUsing, nameOf, noteToast, patchOf, stage, statusChips, translationFields, usageText, usedByList } from './taxonomy-common.mjs';

const REL = 'taxonomy/tags.json';

export function renderTags(ctx, param) {
  return param ? renderEditor(ctx, param) : renderList(ctx);
}

/**
 * Merge two or more tags into the one the owner chooses to keep. Returns `{ target, result }` once it is staged, or null.
 * @param {object} ctx
 * @param {string[]} ids the tags that take part
 */
async function mergeFlow(ctx, ids) {
  const content = fresh(ctx);
  const byId = new Map(content.tags.map((t) => [t.id, t]));
  const u = usage(content).tags;
  const parts = ids.filter((id) => byId.has(id));
  if (parts.length < 2) return null;
  const best = [...parts].sort((a, b) => u.get(b).total - u.get(a).total || a.localeCompare(b))[0];
  const target = await chooseTarget({
    ctx, title: ctx.t('tg_merge_title'), message: ctx.t('tg_merge_message', { n: parts.length }), label: ctx.t('tg_merge_keep'), confirmLabel: ctx.t('tg_merge_confirm'),
    options: parts.map((id) => ({ value: id, label: `${nameOf(ctx, byId.get(id))} (${usageText(ctx, u.get(id))})` })), value: best,
    detail: h('p', { class: 'muted small' }, ctx.t('tg_merge_effects')),
  });
  if (!target) return null;
  const result = mergeTags(content, parts, target);
  stage(ctx, result);
  noteToast(ctx, result.notes);
  toast(ctx.t('tg_merged', { n: parts.length - 1 }), 'info');
  return { target, result };
}

// ---------------------------------------------------------------- the list

function renderList(ctx) {
  const root = h('div', { class: 'taxonomy' });
  const panel = problemsPanel(ctx, root, REL);
  const filter = { text: '', status: '', visibility: '', usage: '', sort: 'name' };
  const selected = new Set();
  const tbody = h('tbody');
  const count = h('p', { class: 'muted', role: 'status' });
  const insights = h('div');
  const similar = h('div');
  const checkAll = h('input', { type: 'checkbox', 'aria-label': ctx.t('tx_select_all'), dataset: { selectAll: '1' } });

  const bulk = bulkBar({
    ctx, selected,
    options: [
      ...['published', 'draft', 'archived'].map((s) => ({ value: `status=${s}`, label: ctx.t('tx_bulk_set', { field: ctx.t('status'), value: ctx.t(`status_${s}`) }) })),
      ...['public', 'private'].map((v) => ({ value: `visibility=${v}`, label: ctx.t('tx_bulk_set', { field: ctx.t('visibility'), value: ctx.t(`visibility_${v}`) }) })),
    ],
    onApply: (value) => {
      const content = fresh(ctx);
      try { stage(ctx, { tags: bulkEdit(content.tags, [...selected], patchOf(value)) }); } catch (error) { toast(error.message, 'error'); return; }
      toast(ctx.t('tx_bulk_done', { n: selected.size }), 'info');
      draw();
    },
    onClear: () => { selected.clear(); draw(); },
    extras: () => [
      h('button', { type: 'button', class: 'button button--small', id: 'bulk-merge', disabled: selected.size < 2 || null, onclick: async () => { const done = await mergeFlow(ctx, [...selected]); if (done) { selected.clear(); draw(); } } }, ctx.t('tg_merge_selected')),
      h('button', { type: 'button', class: 'button button--small button--danger', id: 'bulk-delete', onclick: removeSelected }, ctx.t('tg_delete_selected')),
    ],
  });

  async function removeSelected() {
    const content = fresh(ctx);
    const ids = [...selected];
    const u = usage(content).tags;
    const used = ids.filter((id) => u.get(id)?.total > 0);
    const preview = deleteTags(content, ids, { force: true });
    const ok = await confirmDialog({
      title: ctx.t('tg_delete_many_title', { n: ids.length }),
      message: used.length ? ctx.t('tg_delete_many_used', { n: ids.length, used: used.length, items: preview.articles.size + preview.projects.size }) : ctx.t('tg_delete_many', { n: ids.length }),
      confirmLabel: ctx.t('delete'), cancelLabel: ctx.t('cancel'), danger: true,
    });
    if (!ok) return;
    stage(ctx, deleteTags(content, ids, { force: true }));
    selected.clear();
    toast(ctx.t('tg_deleted', { n: ids.length }), 'info');
    draw();
  }

  const haystack = (t) => Object.values(t.translations).flatMap((tr) => [tr.name, tr.slug, ...(tr.aliases ?? []), ...(tr.synonyms ?? [])]).join(' ').toLowerCase();

  function visibleRows() {
    const content = ctx.content();
    const u = usage(content).tags;
    const q = filter.text.trim().toLowerCase();
    const rows = content.tags.filter((t) => (!q || haystack(t).includes(q))
      && (!filter.status || t.status === filter.status)
      && (!filter.visibility || (t.visibility ?? 'public') === filter.visibility)
      && (!filter.usage || (filter.usage === 'unused' ? u.get(t.id).total === 0 : filter.usage === 'single' ? u.get(t.id).total === 1 : u.get(t.id).total > 0)));
    const label = (t) => nameOf(ctx, t);
    const sorters = {
      name: (a, b) => label(a).localeCompare(label(b), ctx.ui),
      usage: (a, b) => u.get(b.id).total - u.get(a.id).total || label(a).localeCompare(label(b), ctx.ui),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    };
    return rows.sort(sorters[filter.sort]);
  }

  function row(tag, u) {
    const tr = tag.translations[ctx.ui] ?? Object.values(tag.translations)[0];
    const others = Object.entries(tag.translations).filter(([, x]) => x !== tr).map(([, x]) => x.name);
    const aliases = Object.values(tag.translations).reduce((n, x) => n + (x.aliases?.length ?? 0), 0);
    const box = h('input', { type: 'checkbox', checked: selected.has(tag.id) || null, 'aria-label': ctx.t('tx_select_row', { name: tr.name }), dataset: { select: tag.id } });
    box.addEventListener('change', () => { if (box.checked) selected.add(tag.id); else selected.delete(tag.id); bulk.update(); });
    const row = u.get(tag.id);
    return h('tr', { dataset: { id: tag.id } },
      h('td', { class: 'sel' }, box),
      h('td', {}, h('a', { href: `#/tags/${tag.id}`, class: 'row-title' }, tr.name), others.length ? h('span', { class: 'muted small' }, ` · ${others.join(' · ')}`) : null),
      h('td', { class: row.total === 0 ? 'is-unused' : '', title: ctx.t('tx_usage_title') }, usageText(ctx, row)),
      h('td', {}, aliases ? chip(ctx.t('tg_alias_count', { n: aliases })) : null),
      h('td', {}, ...statusChips(ctx, tag)),
      h('td', { class: 'row-actions' }, h('a', { class: 'button button--small', href: `#/tags/${tag.id}` }, ctx.t('edit'))));
  }

  function drawInsights(content) {
    const a = analytics(content);
    const byId = new Map(content.tags.map((t) => [t.id, t]));
    insights.replaceChildren(...[
      h('div', { class: 'tiles' }, [
        ['tx_stat_tags', a.tags.total], ['tx_stat_tags_used', a.tags.used], ['tx_stat_tags_unused', a.tags.unused], ['tx_stat_tags_single', a.tags.single],
        ['tx_stat_tags_avg', a.tags.averagePerItem], ['tx_stat_items_no_tag', a.items.withoutTags],
      ].map(([key, n]) => h('div', { class: 'tile' }, h('strong', {}, String(n)), h('span', {}, ctx.t(key))))),
      a.tags.top.length ? h('div', { class: 'card' }, h('h2', {}, ctx.t('tg_top')), h('ol', { class: 'top' }, a.tags.top.slice(0, 8).map((r) => h('li', {}, h('a', { href: `#/tags/${r.id}` }, nameOf(ctx, byId.get(r.id))), ' ', h('span', { class: 'muted' }, ctx.t('tx_usage', { published: r.published, total: r.total })))))) : null].filter(Boolean));
  }

  function drawSimilar(content) {
    const byId = new Map(content.tags.map((t) => [t.id, t]));
    const groups = duplicateGroups(content.tags);
    const typos = similarPairs(content.tags).filter((p) => p.reason === 'typo');
    const link = (id) => h('a', { href: `#/tags/${id}` }, nameOf(ctx, byId.get(id)));
    const items = [
      ...groups.map((ids) => ({ ids, reason: 'same' })),
      ...typos.map((p) => ({ ids: [p.a, p.b], reason: 'typo' })),
    ].slice(0, 12);
    similar.replaceChildren(h('div', { class: 'card', id: 'tag-similar' },
      h('h2', {}, ctx.t('tg_similar_title')),
      h('p', { class: 'muted' }, ctx.t('tg_similar_hint')),
      items.length ? h('ul', { class: 'plain' }, items.map((item) => h('li', { class: 'similar__row', dataset: { reason: item.reason } },
        chip(ctx.t(`tg_reason_${item.reason}`), item.reason === 'same' ? 'pending' : ''), ' ',
        ...item.ids.flatMap((id, i) => [i ? ' · ' : null, link(id)]), ' ',
        h('button', { type: 'button', class: 'button button--small', dataset: { mergeIds: item.ids.join(',') }, onclick: async () => { const done = await mergeFlow(ctx, item.ids); if (done) draw(); } }, ctx.t('tg_merge_these')))))
        : h('p', { class: 'muted' }, ctx.t('tg_similar_none'))));
  }

  function draw() {
    const content = ctx.content();
    const u = usage(content).tags;
    const rows = visibleRows();
    for (const id of [...selected]) if (!u.has(id)) selected.delete(id);
    tbody.replaceChildren();
    if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: 6, class: 'muted empty' }, ctx.t('nothing_here'))));
    for (const tag of rows) tbody.append(row(tag, u));
    count.textContent = ctx.t('showing_count', { n: rows.length });
    checkAll.checked = rows.length > 0 && rows.every((t) => selected.has(t.id));
    bulk.update();
    drawInsights(content);
    drawSimilar(content);
    panel.repaint();
  }

  checkAll.addEventListener('change', () => { for (const t of visibleRows()) { if (checkAll.checked) selected.add(t.id); else selected.delete(t.id); } draw(); });

  async function createNew() {
    const langs = ctx.languages();
    const content = fresh(ctx);
    const input = { lang: langs.find((l) => l.default)?.code ?? langs[0].code, name: '' };
    const err = h('p', { class: 'inline-error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t('tg_new'),
      body: h('div', {},
        field({ label: ctx.t('language'), control: selectInput({ value: input.lang, options: langs.map((l) => ({ value: l.code, label: l.nativeName })), onChange: (v) => { input.lang = v; } }) }),
        field({ label: ctx.t('field_name'), hint: ctx.t('tg_new_hint'), wide: true, control: textInput({ maxLength: 60, onInput: (v) => { input.name = v; } }) }),
        err),
      actions: (close) => [
        h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
        h('button', { type: 'button', class: 'button button--primary', id: 'create-confirm', onclick: () => { if (!input.name.trim()) { err.textContent = ctx.t('tg_new_required'); err.hidden = false; return; } close(input); } }, ctx.t('create')),
      ],
    });
    if (!result) return;
    const record = createTag(content, { lang: result.lang, name: result.name });
    stage(ctx, { tags: [...content.tags, record] });
    ctx.navigate(`#/tags/${record.id}`);
  }

  const select = (key, label, options, value = '') => field({ label, control: selectInput({ value, options, onChange: (v) => { filter[key] = v; draw(); } }) });
  root.append(
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('nav_tags')), h('button', { type: 'button', class: 'button button--primary', id: 'new-tag', onclick: createNew }, ctx.t('tg_new'))),
    h('p', { class: 'muted' }, ctx.t('tg_intro')),
    panel.el,
    insights,
    similar,
    h('div', { class: 'filters filters--five' },
      field({ label: ctx.t('tx_search'), control: textInput({ onInput: (v) => { filter.text = v; draw(); } }) }),
      select('status', ctx.t('status'), [{ value: '', label: ctx.t('all') }, ...statusOptions(ctx)]),
      select('visibility', ctx.t('visibility'), [{ value: '', label: ctx.t('all') }, { value: 'public', label: ctx.t('visibility_public') }, { value: 'private', label: ctx.t('visibility_private') }]),
      select('usage', ctx.t('tx_usage_filter'), [{ value: '', label: ctx.t('all') }, { value: 'used', label: ctx.t('tx_filter_used') }, { value: 'single', label: ctx.t('tx_filter_single') }, { value: 'unused', label: ctx.t('tx_filter_unused') }]),
      select('sort', ctx.t('tx_sort'), [{ value: 'name', label: ctx.t('tx_sort_name') }, { value: 'usage', label: ctx.t('tx_sort_usage') }, { value: 'newest', label: ctx.t('tx_sort_newest') }], 'name')),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button button--small', id: 'select-unused', onclick: () => { selected.clear(); for (const id of unusedTags(ctx.content())) selected.add(id); draw(); } }, ctx.t('tg_select_unused'))),
    count,
    bulk.el,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--tags' },
      h('thead', {}, h('tr', {}, h('th', { class: 'sel' }, checkAll), h('th', {}, ctx.t('tg_col_tag')), h('th', {}, ctx.t('tg_col_usage')), h('th', {}, ctx.t('tg_col_aliases')), h('th', {}, ctx.t('status')), h('th', {}, ''))), tbody)));
  draw();
  return { el: root, dispose: () => panel.dispose() };
}

// ---------------------------------------------------------------- one tag

function renderEditor(ctx, id) {
  const file = ctx.workspace.read(REL);
  const rec = () => file.items.find((t) => t.id === id);
  if (!rec()) return { el: h('div', {}, h('h1', {}, ctx.t('not_found')), h('a', { href: '#/tags' }, ctx.t('back_to_list'))) };

  let lang = rec().translations[ctx.ui] ? ctx.ui : Object.keys(rec().translations)[0];
  const root = h('div', { class: 'editor taxonomy' });
  const panel = problemsPanel(ctx, root, REL);
  const preview = createPreview({ ctx, kind: 'tag', id, lang: () => lang });
  const title = h('h1', {}, nameOf(ctx, rec()));
  const tabHost = h('div');
  const translationHost = h('div', { class: 'card translation' });

  const save = () => { ctx.workspace.write(REL, file); title.textContent = nameOf(ctx, rec()); ctx.changed(); preview.update(); };

  async function mergeInto() {
    const content = fresh(ctx);
    const others = content.tags.filter((t) => t.id !== id);
    if (!others.length) { toast(ctx.t('tg_merge_none'), 'error'); return; }
    const row = usage(content).tags.get(id);
    const name = nameOf(ctx, rec());
    const target = await chooseTarget({
      ctx, title: ctx.t('tg_merge_into_title', { name }), message: ctx.t('tg_merge_into_message', { name, articles: row.articles, projects: row.projects }), label: ctx.t('tg_merge_into'), confirmLabel: ctx.t('tg_merge_confirm'),
      options: others.map((t) => ({ value: t.id, label: nameOf(ctx, t) })), detail: h('p', { class: 'muted small' }, ctx.t('tg_merge_effects')),
    });
    if (!target) return;
    const result = mergeTags(content, [id], target);
    stage(ctx, result);
    noteToast(ctx, result.notes);
    toast(ctx.t('tg_merged', { n: 1 }), 'info');
    ctx.navigate(`#/tags/${target}`);
  }

  async function remove() {
    const content = fresh(ctx);
    const b = tagBlockers(content, id);
    const ok = await confirmDialog({
      title: ctx.t('tg_delete_title'), message: ctx.t(b ? 'tg_delete_used' : 'tg_delete_message', { name: nameOf(ctx, rec()), articles: b?.articles ?? 0, projects: b?.projects ?? 0 }),
      confirmLabel: ctx.t('delete'), cancelLabel: ctx.t('cancel'), danger: true,
    });
    if (!ok) return;
    stage(ctx, deleteTag(content, id, { force: Boolean(b) }));
    ctx.navigate('#/tags');
  }

  async function addLanguage(code) {
    const input = { name: '' };
    const err = h('p', { class: 'inline-error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t('add_translation_title', { language: ctx.langName(code) }),
      body: h('div', {}, field({ label: ctx.t('field_name'), wide: true, control: textInput({ dir: ctx.langDir(code), maxLength: 60, onInput: (v) => { input.name = v; } }) }), err),
      actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')), h('button', { type: 'button', class: 'button button--primary', id: 'add-translation-confirm', onclick: () => { if (!input.name.trim()) { err.textContent = ctx.t('tg_new_required'); err.hidden = false; return; } close(input); } }, ctx.t('create'))],
    });
    if (!result) return;
    file.items[file.items.indexOf(rec())] = addTranslation(file.items, rec(), code, result);
    lang = code; save(); drawTabs(); drawTranslation();
  }

  async function removeLanguage() {
    if (Object.keys(rec().translations).length < 2) return;
    const ok = await confirmDialog({ title: ctx.t('remove_translation_title'), message: ctx.t('remove_translation_message', { language: ctx.langName(lang) }), confirmLabel: ctx.t('delete'), cancelLabel: ctx.t('cancel'), danger: true });
    if (!ok) return;
    delete rec().translations[lang];
    lang = Object.keys(rec().translations)[0];
    save(); drawTabs(); drawTranslation();
  }

  function settingsCard() {
    const content = ctx.content();
    const byId = new Map(content.tags.map((t) => [t.id, t]));
    const others = file.items.filter((t) => t.id !== id);
    const suggestions = similarTo(file.items, id);
    const similarList = suggestions.length
      ? h('ul', { class: 'plain', id: 'tag-suggestions' }, suggestions.map((s) => h('li', { class: 'similar__row' },
        chip(ctx.t(`tg_reason_${s.reason}`), s.reason === 'same' ? 'pending' : ''), ' ', h('a', { href: `#/tags/${s.id}` }, nameOf(ctx, byId.get(s.id) ?? file.items.find((t) => t.id === s.id))), ' ',
        h('button', { type: 'button', class: 'button button--small', dataset: { mergeWith: s.id }, onclick: async () => { const done = await mergeFlow(ctx, [id, s.id]); if (done) ctx.navigate(`#/tags/${done.target}`); } }, ctx.t('tg_merge_these')))))
      : h('p', { class: 'muted small' }, ctx.t('tg_similar_none'));

    return h('div', { class: 'settings card' },
      h('h2', {}, ctx.t('settings')),
      field({ label: ctx.t('status'), path: `items[${file.items.indexOf(rec())}].status`, control: selectInput({ value: rec().status, options: statusOptions(ctx), onChange: (v) => { rec().status = v; save(); } }) }),
      field({ label: ctx.t('visibility'), hint: ctx.t('tg_visibility_hint'), control: selectInput({ value: rec().visibility ?? 'public', options: ['public', 'private'].map((v) => ({ value: v, label: ctx.t(`visibility_${v}`) })), onChange: (v) => { if (v === 'public') delete rec().visibility; else rec().visibility = v; save(); } }) }),
      field({ label: ctx.t('tg_related'), hint: ctx.t('tg_related_hint'), control: checkGroup({ options: others.map((t) => ({ value: t.id, label: nameOf(ctx, t) })), selected: rec().relatedTagIds ?? [], emptyText: ctx.t('no_tags'), onChange: (v) => { setOpt(rec(), 'relatedTagIds', v); save(); } }) }),
      checkInput({ label: ctx.t('sample_flag'), checked: rec().sample === true, onChange: (v) => { if (v) rec().sample = true; else delete rec().sample; save(); } }),
      h('h3', {}, ctx.t('tg_similar_here')), similarList,
      h('h3', {}, ctx.t('tx_used_by')), usedByList(ctx, itemsUsing(content, 'tagIds', id)),
      h('p', { class: 'muted small', dir: 'ltr' }, `${rec().id} · ${ctx.t('created')} ${rec().createdAt.slice(0, 10)}`));
  }

  function drawTabs() {
    tabHost.replaceChildren(
      tabs({ items: Object.keys(rec().translations).map((code) => ({ value: code, label: ctx.langName(code) })), active: lang, onSelect: (code) => { lang = code; drawTabs(); drawTranslation(); preview.update(); } }),
      ...ctx.languages().filter((l) => !rec().translations[l.code]).map((l) => h('button', { type: 'button', class: 'button button--small', dataset: { addTranslation: l.code }, onclick: () => addLanguage(l.code) }, ctx.t('add_translation', { language: l.nativeName }))));
  }

  function drawTranslation() {
    translationHost.replaceChildren(
      h('div', { class: 'translation__head' }, h('h2', {}, ctx.langName(lang)), h('span', { class: 'spacer' }),
        Object.keys(rec().translations).length > 1 ? h('button', { type: 'button', class: 'button button--small button--danger', onclick: removeLanguage }, ctx.t('remove_translation')) : null),
      ...translationFields({ ctx, kind: 'tag', file, id, lang, pathBase: `items[${file.items.indexOf(rec())}]`, save, redraw: () => { drawTranslation(); } }));
    panel.repaint();
  }

  root.append(
    h('p', {}, h('a', { href: '#/tags' }, `← ${ctx.t('nav_tags')}`)),
    h('div', { class: 'page-head' }, title, h('span', { class: 'actions' },
      h('button', { type: 'button', class: 'button', id: 'tag-merge', onclick: mergeInto }, ctx.t('tg_merge')),
      h('button', { type: 'button', class: 'button button--danger', id: 'tag-delete', onclick: remove }, ctx.t('delete')))),
    panel.el,
    h('div', { class: 'editor__grid' },
      h('div', { class: 'editor__main' }, tabHost, translationHost, h('div', { class: 'card' }, h('h2', {}, ctx.t('preview_title')), preview.element)),
      settingsCard()));
  drawTabs(); drawTranslation();
  queueMicrotask(() => preview.refit());
  return { el: root, dispose: () => { panel.dispose(); preview.destroy(); } };
}
