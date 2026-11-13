// The Topic Manager: the tree of topics with bulk edits, and the editor for one topic.
// All the rules (merging, deleting, moving, slugs) live in src/core/taxonomy-ops.mjs and are tested there.

import { ICON_KEYS } from '../../shared/core/icons.mjs';
import { bulkEdit, createTopic, addTranslation, analytics, deleteTopic, descendantIds, mergeTopics, moveRecord, setParent, topicBlockers, topicTree, unusedTopics, usage } from '../../shared/core/taxonomy-ops.mjs';
import { checkGroup, checkInput, chip, confirmDialog, field, h, modal, selectInput, tabs, textInput, toast } from '../dom.mjs';
import { createPreview } from '../preview.mjs';
import { mediaOptions, problemsPanel, setOpt, statusOptions } from './editor-common.mjs';
import { bulkBar, chooseTarget, fresh, iconNode, itemsUsing, nameOf, noteToast, patchOf, stage, statusChips, translationFields, usageText, usedByList } from './taxonomy-common.mjs';

const REL = 'taxonomy/topics.json';

export function renderTopics(ctx, param) {
  return param ? renderEditor(ctx, param) : renderList(ctx);
}

// ---------------------------------------------------------------- the list

function renderList(ctx) {
  const root = h('div', { class: 'taxonomy' });
  const panel = problemsPanel(ctx, root, REL);
  const filter = { text: '', status: '', usage: '' };
  const selected = new Set();
  const tbody = h('tbody');
  const count = h('p', { class: 'muted', role: 'status' });
  const insights = h('div');
  const checkAll = h('input', { type: 'checkbox', 'aria-label': ctx.t('tx_select_all'), dataset: { selectAll: '1' } });

  const bulk = bulkBar({
    ctx, selected,
    options: [
      ...['published', 'draft', 'archived'].map((s) => ({ value: `status=${s}`, label: ctx.t('tx_bulk_set', { field: ctx.t('status'), value: ctx.t(`status_${s}`) }) })),
      ...['public', 'private'].map((v) => ({ value: `visibility=${v}`, label: ctx.t('tx_bulk_set', { field: ctx.t('visibility'), value: ctx.t(`visibility_${v}`) }) })),
      ...[true, false].map((v) => ({ value: `featured=${v}`, label: ctx.t('tx_bulk_set', { field: ctx.t('featured'), value: ctx.t(v ? 'tx_yes' : 'tx_no') }) })),
    ],
    onApply: (value) => {
      const content = fresh(ctx);
      try { stage(ctx, { topics: bulkEdit(content.topics, [...selected], patchOf(value)) }); } catch (error) { toast(error.message, 'error'); return; }
      toast(ctx.t('tx_bulk_done', { n: selected.size }), 'info');
      draw();
    },
    onClear: () => { selected.clear(); draw(); },
  });

  const names = (t) => Object.values(t.translations).flatMap((tr) => [tr.name, tr.slug, ...(tr.synonyms ?? [])]).join(' ').toLowerCase();

  function visibleRows() {
    const content = ctx.content();
    const unused = new Set(unusedTopics(content));
    const q = filter.text.trim().toLowerCase();
    const flat = Boolean(q || filter.status || filter.usage);
    return topicTree(content.topics)
      .filter(({ topic }) => (!q || names(topic).includes(q)) && (!filter.status || topic.status === filter.status)
        && (!filter.usage || (filter.usage === 'unused') === unused.has(topic.id)))
      .map((row) => ({ ...row, depth: flat ? 0 : row.depth }));
  }

  function move(topic, delta) {
    const content = fresh(ctx);
    const siblings = content.topics.filter((t) => (t.parentId ?? null) === (topic.parentId ?? null));
    const at = siblings.findIndex((t) => t.id === topic.id);
    const other = siblings[at + delta];
    if (!other) return;
    stage(ctx, { topics: moveRecord(content.topics, topic.id, content.topics.findIndex((t) => t.id === other.id)) });
    draw();
  }

  function row({ topic, depth }, u, topics) {
    const siblings = topics.filter((t) => (t.parentId ?? null) === (topic.parentId ?? null));
    const at = siblings.findIndex((t) => t.id === topic.id);
    const roll = u.rollup.get(topic.id);
    const children = topics.filter((t) => t.parentId === topic.id).length;
    const box = h('input', { type: 'checkbox', checked: selected.has(topic.id) || null, 'aria-label': ctx.t('tx_select_row', { name: nameOf(ctx, topic) }), dataset: { select: topic.id } });
    box.addEventListener('change', () => { if (box.checked) selected.add(topic.id); else selected.delete(topic.id); bulk.update(); });
    const swatch = topic.color ? h('span', { class: 'swatch-dot', title: topic.color, dataset: { color: topic.color } }) : null;
    if (swatch) swatch.style.background = topic.color;
    return h('tr', { dataset: { id: topic.id } },
      h('td', { class: 'sel' }, box),
      h('td', { class: 'topic-cell', dataset: { depth: String(Math.min(depth, 5)) } },
        h('span', { class: 'topic-cell__in' }, topic.icon ? iconNode(topic.icon, 18) : null, h('a', { href: `#/topics/${topic.id}`, class: 'row-title' }, nameOf(ctx, topic)), swatch, ' ', ...statusChips(ctx, topic))),
      h('td', { title: ctx.t('tx_usage_title') }, usageText(ctx, roll)),
      h('td', {}, String(children)),
      h('td', { class: 'row-actions' },
        h('button', { type: 'button', class: 'button button--small', disabled: at <= 0 || null, dataset: { moveUp: topic.id }, 'aria-label': ctx.t('move_up'), title: ctx.t('move_up'), onclick: () => move(topic, -1) }, '↑'),
        h('button', { type: 'button', class: 'button button--small', disabled: at >= siblings.length - 1 || null, dataset: { moveDown: topic.id }, 'aria-label': ctx.t('move_down'), title: ctx.t('move_down'), onclick: () => move(topic, 1) }, '↓'),
        h('a', { class: 'button button--small', href: `#/topics/${topic.id}` }, ctx.t('edit'))));
  }

  function drawInsights(content) {
    const a = analytics(content);
    const byId = new Map(content.topics.map((t) => [t.id, t]));
    insights.replaceChildren(...[
      h('div', { class: 'tiles' },
        [['tx_stat_topics', a.topics.total], ['tx_stat_topics_used', a.topics.used], ['tx_stat_topics_empty', a.topics.unused], ['tx_stat_items_no_topic', a.items.withoutTopics]].map(([key, n]) => h('div', { class: 'tile' }, h('strong', {}, String(n)), h('span', {}, ctx.t(key))))),
      a.topics.top.length ? h('div', { class: 'card' }, h('h2', {}, ctx.t('tp_top')), h('ol', { class: 'top' }, a.topics.top.slice(0, 6).map((r) => h('li', {}, h('a', { href: `#/topics/${r.id}` }, nameOf(ctx, byId.get(r.id))), ' ', h('span', { class: 'muted' }, ctx.t('tx_usage', { published: r.published, total: r.total })))))) : null].filter(Boolean));
  }

  function draw() {
    const content = ctx.content();
    const u = usage(content);
    const rows = visibleRows();
    tbody.replaceChildren();
    if (!rows.length) tbody.append(h('tr', {}, h('td', { colspan: 5, class: 'muted empty' }, ctx.t('nothing_here'))));
    for (const r of rows) tbody.append(row(r, u, content.topics));
    count.textContent = ctx.t('showing_count', { n: rows.length });
    checkAll.checked = rows.length > 0 && rows.every((r) => selected.has(r.topic.id));
    bulk.update();
    drawInsights(content);
    panel.repaint();
  }

  checkAll.addEventListener('change', () => { for (const r of visibleRows()) { if (checkAll.checked) selected.add(r.topic.id); else selected.delete(r.topic.id); } draw(); });

  async function createNew() {
    const langs = ctx.languages();
    const content = fresh(ctx);
    const input = { lang: langs.find((l) => l.default)?.code ?? langs[0].code, name: '', description: '', parentId: '' };
    const err = h('p', { class: 'inline-error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t('tp_new'),
      body: h('div', {},
        field({ label: ctx.t('language'), control: selectInput({ value: input.lang, options: langs.map((l) => ({ value: l.code, label: l.nativeName })), onChange: (v) => { input.lang = v; } }) }),
        field({ label: ctx.t('field_name'), wide: true, control: textInput({ onInput: (v) => { input.name = v; } }) }),
        field({ label: ctx.t('field_description'), hint: ctx.t('tp_new_hint'), wide: true, control: textInput({ multiline: true, rows: 3, onInput: (v) => { input.description = v; } }) }),
        field({ label: ctx.t('tp_parent'), wide: true, control: selectInput({ value: '', options: [{ value: '', label: ctx.t('tp_parent_none') }, ...content.topics.map((t) => ({ value: t.id, label: nameOf(ctx, t) }))], onChange: (v) => { input.parentId = v; } }) }),
        err),
      actions: (close) => [
        h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
        h('button', { type: 'button', class: 'button button--primary', id: 'create-confirm', onclick: () => {
          if (!input.name.trim() || !input.description.trim()) { err.textContent = ctx.t('tp_new_required'); err.hidden = false; return; }
          close(input);
        } }, ctx.t('create')),
      ],
    });
    if (!result) return;
    const record = createTopic(content, { lang: result.lang, name: result.name, description: result.description, parentId: result.parentId || undefined });
    stage(ctx, { topics: [...content.topics, record] });
    ctx.navigate(`#/topics/${record.id}`);
  }

  root.append(
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('nav_topics')), h('button', { type: 'button', class: 'button button--primary', id: 'new-topic', onclick: createNew }, ctx.t('tp_new'))),
    h('p', { class: 'muted' }, ctx.t('tp_intro')),
    panel.el,
    insights,
    h('div', { class: 'filters filters--three' },
      field({ label: ctx.t('tx_search'), control: textInput({ onInput: (v) => { filter.text = v; draw(); } }) }),
      field({ label: ctx.t('status'), control: selectInput({ value: '', options: [{ value: '', label: ctx.t('all') }, ...statusOptions(ctx)], onChange: (v) => { filter.status = v; draw(); } }) }),
      field({ label: ctx.t('tx_usage_filter'), control: selectInput({ value: '', options: [{ value: '', label: ctx.t('all') }, { value: 'used', label: ctx.t('tx_filter_used') }, { value: 'unused', label: ctx.t('tx_filter_unused') }], onChange: (v) => { filter.usage = v; draw(); } }) })),
    count,
    bulk.el,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--topics' },
      h('thead', {}, h('tr', {}, h('th', { class: 'sel' }, checkAll), h('th', {}, ctx.t('tp_col_topic')), h('th', {}, ctx.t('tp_col_content')), h('th', {}, ctx.t('tp_col_children')), h('th', {}, ''))), tbody)),
    h('details', { class: 'card rules' }, h('summary', {}, ctx.t('tp_rules_title')), h('ul', {}, ['tp_rules_1', 'tp_rules_2', 'tp_rules_3', 'tp_rules_4'].map((k) => h('li', {}, ctx.t(k))))));
  draw();
  return { el: root, dispose: () => panel.dispose() };
}

// ---------------------------------------------------------------- one topic

function renderEditor(ctx, id) {
  const file = ctx.workspace.read(REL);
  const rec = () => file.items.find((t) => t.id === id);
  if (!rec()) return { el: h('div', {}, h('h1', {}, ctx.t('not_found')), h('a', { href: '#/topics' }, ctx.t('back_to_list'))) };

  let lang = rec().translations[ctx.ui] ? ctx.ui : Object.keys(rec().translations)[0];
  const root = h('div', { class: 'editor taxonomy' });
  const panel = problemsPanel(ctx, root, REL);
  const preview = createPreview({ ctx, kind: 'topic', id, lang: () => lang });
  const title = h('h1', {}, nameOf(ctx, rec()));
  const tabHost = h('div');
  const translationHost = h('div', { class: 'card translation' });

  const save = () => { ctx.workspace.write(REL, file); title.textContent = nameOf(ctx, rec()); ctx.changed(); preview.update(); };

  // ---- actions on the whole topic
  async function merge() {
    const content = fresh(ctx);
    const others = content.topics.filter((t) => t.id !== id);
    if (!others.length) { toast(ctx.t('tp_merge_none'), 'error'); return; }
    const row = usage(content).topics.get(id);
    const name = nameOf(ctx, rec());
    const target = await chooseTarget({
      ctx, title: ctx.t('tp_merge_title', { name }), label: ctx.t('tp_merge_into'), confirmLabel: ctx.t('tp_merge_confirm'),
      message: ctx.t('tp_merge_message', { name, articles: row.articles, projects: row.projects, children: content.topics.filter((t) => t.parentId === id).length }),
      options: others.map((t) => ({ value: t.id, label: nameOf(ctx, t) })),
    });
    if (!target) return;
    const result = mergeTopics(content, id, target);
    stage(ctx, result);
    noteToast(ctx, result.notes);
    toast(ctx.t('tp_merged', { name }), 'info');
    ctx.navigate(`#/topics/${target}`);
  }

  async function remove() {
    const content = fresh(ctx);
    const b = topicBlockers(content, id);
    const used = Boolean(b && (b.articles || b.projects));
    const ok = await confirmDialog({
      title: ctx.t('tp_delete_title'), message: ctx.t(used ? 'tp_delete_used' : 'tp_delete_message', { name: nameOf(ctx, rec()), articles: b?.articles ?? 0, projects: b?.projects ?? 0, children: b?.children ?? 0 }),
      confirmLabel: ctx.t('delete'), cancelLabel: ctx.t('cancel'), danger: true,
    });
    if (!ok) return;
    stage(ctx, deleteTopic(content, id, { force: used }));
    ctx.navigate('#/topics');
  }

  async function addLanguage(code) {
    const input = { name: '', description: '' };
    const err = h('p', { class: 'inline-error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t('add_translation_title', { language: ctx.langName(code) }),
      body: h('div', {}, field({ label: ctx.t('field_name'), wide: true, control: textInput({ dir: ctx.langDir(code), onInput: (v) => { input.name = v; } }) }), field({ label: ctx.t('field_description'), wide: true, control: textInput({ dir: ctx.langDir(code), multiline: true, rows: 3, onInput: (v) => { input.description = v; } }) }), err),
      actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')), h('button', { type: 'button', class: 'button button--primary', id: 'add-translation-confirm', onclick: () => { if (!input.name.trim() || !input.description.trim()) { err.textContent = ctx.t('tp_new_required'); err.hidden = false; return; } close(input); } }, ctx.t('create'))],
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

  // ---- the settings that belong to the whole topic
  function settingsCard() {
    const content = ctx.content();
    const others = file.items.filter((t) => t.id !== id);
    const blocked = descendantIds(file.items, id);
    const parentOptions = [{ value: '', label: ctx.t('tp_parent_none') }, ...others.filter((t) => !blocked.has(t.id)).map((t) => ({ value: t.id, label: nameOf(ctx, t) }))];
    const parentError = h('p', { class: 'inline-error', role: 'alert', hidden: true });

    const iconHost = h('div', { class: 'iconpicker', role: 'group', 'aria-label': ctx.t('tp_icon') });
    const drawIcons = () => iconHost.replaceChildren(
      h('button', { type: 'button', class: 'iconpicker__item iconpicker__none', 'aria-pressed': String(!rec().icon), dataset: { icon: '' }, onclick: () => pick('') }, ctx.t('none')),
      ...ICON_KEYS.map((key) => h('button', { type: 'button', class: 'iconpicker__item', 'aria-pressed': String(rec().icon === key), 'aria-label': ctx.t(`tp_icon_${key}`), title: ctx.t(`tp_icon_${key}`), dataset: { icon: key }, onclick: () => pick(key) }, iconNode(key, 22))));
    const pick = (key) => { setOpt(rec(), 'icon', key); save(); drawIcons(); };
    drawIcons();

    const colorInput = h('input', { type: 'color', id: 'topic-color', value: rec().color ?? '#3366cc', 'aria-label': ctx.t('tp_color'), disabled: rec().color ? null : true });
    colorInput.addEventListener('input', () => { rec().color = colorInput.value.toLowerCase(); save(); });

    const pinnedPool = [...itemsUsing(content, 'topicIds', id)];
    for (const pid of rec().pinnedItemIds ?? []) {
      if (pinnedPool.some((e) => e.record.id === pid)) continue;
      const record = content.articles.find((a) => a.id === pid) ?? content.projects.find((p) => p.id === pid);
      if (record) pinnedPool.push({ kind: pid.startsWith('art_') ? 'article' : 'project', record });
    }

    return h('div', { class: 'settings card' },
      h('h2', {}, ctx.t('settings')),
      field({ label: ctx.t('status'), path: `items[${file.items.indexOf(rec())}].status`, control: selectInput({ value: rec().status, options: statusOptions(ctx), onChange: (v) => { rec().status = v; save(); } }) }),
      field({ label: ctx.t('visibility'), control: selectInput({ value: rec().visibility, options: ['public', 'private'].map((v) => ({ value: v, label: ctx.t(`visibility_${v}`) })), onChange: (v) => { rec().visibility = v; save(); } }) }),
      checkInput({ label: ctx.t('featured'), checked: Boolean(rec().featured), onChange: (v) => { if (v) rec().featured = true; else delete rec().featured; save(); } }),
      field({ label: ctx.t('tp_parent'), hint: ctx.t('tp_parent_hint'), control: (() => {
        const s = selectInput({ value: rec().parentId ?? '', options: parentOptions, onChange: (v) => {
          const r = setParent(file.items, id, v || null);
          if (!r.ok) { parentError.textContent = ctx.t(`tx_parent_${r.error}`); parentError.hidden = false; s.value = rec().parentId ?? ''; return; }
          parentError.hidden = true; file.items = r.topics; save();
        } });
        s.id = 'topic-parent';
        return s;
      })() }),
      parentError,
      h('div', { class: 'field' }, h('span', { class: 'label' }, ctx.t('tp_icon')), iconHost, h('p', { class: 'field__hint' }, ctx.t('tp_icon_hint'))),
      h('div', { class: 'field' }, h('span', { class: 'label' }, ctx.t('tp_color')),
        checkInput({ label: ctx.t('tp_color_use'), checked: Boolean(rec().color), onChange: (v) => { if (v) { rec().color = colorInput.value.toLowerCase(); colorInput.disabled = false; } else { delete rec().color; colorInput.disabled = true; } save(); } }),
        colorInput, h('p', { class: 'field__hint' }, ctx.t('tp_color_hint'))),
      field({ label: ctx.t('tp_image'), control: selectInput({ value: rec().mediaId ?? '', options: mediaOptions(ctx), onChange: (v) => { setOpt(rec(), 'mediaId', v); save(); } }) }),
      field({ label: ctx.t('tp_related'), hint: ctx.t('tp_related_hint'), control: checkGroup({ options: others.map((t) => ({ value: t.id, label: nameOf(ctx, t) })), selected: rec().relatedTopicIds ?? [], emptyText: ctx.t('no_topics'), onChange: (v) => { setOpt(rec(), 'relatedTopicIds', v); save(); } }) }),
      field({ label: ctx.t('tp_pinned'), hint: ctx.t('tp_pinned_hint'), control: checkGroup({ options: pinnedPool.map(({ record }) => ({ value: record.id, label: ctx.titleOf(record.translations) })), selected: rec().pinnedItemIds ?? [], emptyText: ctx.t('tp_pinned_none'), onChange: (v) => { setOpt(rec(), 'pinnedItemIds', v); save(); } }) }),
      checkInput({ label: ctx.t('sample_flag'), checked: rec().sample === true, onChange: (v) => { if (v) rec().sample = true; else delete rec().sample; save(); } }),
      h('h3', {}, ctx.t('tx_used_by')), usedByList(ctx, itemsUsing(content, 'topicIds', id)),
      h('p', { class: 'muted small', dir: 'ltr' }, `${rec().id} · ${ctx.t('created')} ${rec().createdAt.slice(0, 10)}`));
  }

  // ---- the translations
  function drawTabs() {
    tabHost.replaceChildren(
      tabs({ items: Object.keys(rec().translations).map((code) => ({ value: code, label: ctx.langName(code) })), active: lang, onSelect: (code) => { lang = code; drawTabs(); drawTranslation(); preview.update(); } }),
      ...ctx.languages().filter((l) => !rec().translations[l.code]).map((l) => h('button', { type: 'button', class: 'button button--small', dataset: { addTranslation: l.code }, onclick: () => addLanguage(l.code) }, ctx.t('add_translation', { language: l.nativeName }))));
  }

  function drawTranslation() {
    translationHost.replaceChildren(
      h('div', { class: 'translation__head' }, h('h2', {}, ctx.langName(lang)), h('span', { class: 'spacer' }),
        Object.keys(rec().translations).length > 1 ? h('button', { type: 'button', class: 'button button--small button--danger', onclick: removeLanguage }, ctx.t('remove_translation')) : null),
      ...translationFields({ ctx, kind: 'topic', file, id, lang, pathBase: `items[${file.items.indexOf(rec())}]`, save, redraw: () => { drawTranslation(); } }));
    panel.repaint();
  }

  root.append(
    h('p', {}, h('a', { href: '#/topics' }, `← ${ctx.t('nav_topics')}`)),
    h('div', { class: 'page-head' }, title, h('span', { class: 'actions' },
      h('button', { type: 'button', class: 'button', id: 'topic-merge', onclick: merge }, ctx.t('tp_merge')),
      h('button', { type: 'button', class: 'button button--danger', id: 'topic-delete', onclick: remove }, ctx.t('delete')))),
    panel.el,
    h('div', { class: 'editor__grid' },
      h('div', { class: 'editor__main' }, tabHost, translationHost, h('div', { class: 'card' }, h('h2', {}, ctx.t('preview_title')), preview.element)),
      settingsCard()));
  drawTabs(); drawTranslation();
  queueMicrotask(() => preview.refit());
  return { el: root, dispose: () => { panel.dispose(); preview.destroy(); } };
}
