import { slugsInUse } from '../../shared/core/content-ops.mjs';
import { slugify, uniqueSlug } from '../../shared/core/slugify.mjs';
import { checkGroup, checkInput, chip, confirmDialog, field, h, linesInput, modal, selectInput, tabs, textInput } from '../dom.mjs';
import { createBlocksEditor } from '../studio/blocks-editor.mjs';
import { createStudio } from '../studio/studio.mjs';
import { isoToLocalInput, linksEditor, localInputToIso, mediaOptions, problemsPanel, scheduleControls, setOpt, statusOptions, tagOptions, topicOptions } from './editor-common.mjs';

const PROJECT_STATUSES = ['planned', 'in-progress', 'completed', 'paused'];

/** What gets stored: empty optional lists and bodies are left out, as the schema expects. */
function normalize(record) {
  const out = structuredClone(record);
  for (const key of ['tools', 'galleryMediaIds', 'relatedArticleIds', 'tagIds']) if (Array.isArray(out[key]) && !out[key].length) delete out[key];
  for (const tr of Object.values(out.translations)) {
    for (const key of ['body', 'responsibilities', 'links']) if (Array.isArray(tr[key]) && !tr[key].length) delete tr[key];
  }
  return out;
}

export function renderProjectEditor(ctx, id) {
  const rel = `projects/${id}.json`;
  if (!ctx.workspace.exists(rel)) return { el: h('div', {}, h('h1', {}, ctx.t('not_found')), h('a', { href: '#/projects' }, ctx.t('back_to_list'))) };

  const record = ctx.workspace.read(rel);
  let studio = null;
  const save = () => { ctx.workspace.write(rel, normalize(record)); ctx.changed(); studio?.changed(); };
  let lang = record.translations[ctx.ui] ? ctx.ui : Object.keys(record.translations)[0];
  const root = h('div', { class: 'editor' });
  const panel = problemsPanel(ctx, root, rel);
  const translationHost = h('div', { class: 'card translation' });
  const tabHost = h('div');

  const publishNow = () => {
    record.status = 'published'; record.translations[lang].status = 'published';
    record.publishedAt ??= new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    save(); ctx.render();
  };
  const unpublish = () => {
    record.translations[lang].status = 'draft';
    if (!Object.values(record.translations).some((t) => t.status === 'published')) record.status = 'draft';
    save(); ctx.render();
  };
  const remove = async () => {
    const ok = await confirmDialog({ title: ctx.t('delete_item_title'), message: ctx.t('delete_item_message', { name: ctx.titleOf(record.translations) }), confirmLabel: ctx.t('delete'), cancelLabel: ctx.t('cancel'), danger: true });
    if (!ok) return;
    ctx.workspace.remove(rel); ctx.changed(); ctx.revalidate(); ctx.navigate('#/projects');
  };

  async function addTranslation(code) {
    const input = { title: '', summary: '' };
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t('add_translation_title', { language: ctx.langName(code) }),
      body: h('div', {}, field({ label: ctx.t('field_title'), control: textInput({ dir: ctx.langDir(code), onInput: (v) => { input.title = v; } }), wide: true }), field({ label: ctx.t('field_summary'), control: textInput({ dir: ctx.langDir(code), multiline: true, rows: 3, onInput: (v) => { input.summary = v; } }), wide: true }), err),
      actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')), h('button', { type: 'button', class: 'button button--primary', id: 'add-translation-confirm', onclick: () => { if (!input.title.trim() || !input.summary.trim()) { err.textContent = ctx.t('title_and_summary_required'); err.hidden = false; return; } close(input); } }, ctx.t('create'))],
    });
    if (!result) return;
    record.translations[code] = { status: 'draft', slug: uniqueSlug(slugify(result.title), slugsInUse(ctx.content(), 'project', code, id)), title: result.title.trim(), summary: result.summary.trim() };
    lang = code; save(); drawTabs(); drawTranslation();
  }

  const articleOptions = ctx.content().articles.map((a) => ({ value: a.id, label: ctx.titleOf(a.translations) }));
  const imageChoices = mediaOptions(ctx, { allowNone: false });

  const settings = h('div', { class: 'settings__fields' },
    field({ label: ctx.t('status'), path: 'status', control: selectInput({ value: record.status, options: statusOptions(ctx), onChange: (v) => { record.status = v; save(); } }) }),
    field({ label: ctx.t('project_status'), path: 'projectStatus', control: selectInput({ value: record.projectStatus ?? 'in-progress', options: PROJECT_STATUSES.map((s) => ({ value: s, label: ctx.t(`pstatus_${s}`) })), onChange: (v) => { record.projectStatus = v; save(); } }) }),
    field({ label: ctx.t('published_at'), path: 'publishedAt', hint: ctx.t('published_at_hint'), control: textInput({ type: 'datetime-local', value: isoToLocalInput(record.publishedAt), onInput: (v) => { setOpt(record, 'publishedAt', localInputToIso(v)); save(); } }) }),
    field({ label: ctx.t('start_date'), path: 'startDate', control: textInput({ type: 'date', value: record.startDate ?? '', onInput: (v) => { setOpt(record, 'startDate', v); save(); } }) }),
    field({ label: ctx.t('end_date'), path: 'endDate', control: textInput({ type: 'date', value: record.endDate ?? '', onInput: (v) => { setOpt(record, 'endDate', v); save(); } }) }),
    checkInput({ label: ctx.t('featured'), checked: record.featured, onChange: (v) => { record.featured = v; save(); } }),
    field({ label: ctx.t('field_cover'), path: 'coverMediaId', control: selectInput({ value: record.coverMediaId ?? '', options: mediaOptions(ctx), onChange: (v) => { setOpt(record, 'coverMediaId', v); save(); } }) }),
    field({ label: ctx.t('gallery'), path: 'galleryMediaIds', control: checkGroup({ options: imageChoices, selected: record.galleryMediaIds ?? [], emptyText: ctx.t('no_media'), onChange: (v) => { setOpt(record, 'galleryMediaIds', v); save(); } }) }),
    field({ label: ctx.t('tools'), path: 'tools', hint: ctx.t('one_per_line'), control: linesInput({ value: record.tools ?? [], dir: 'ltr', onInput: (v) => { setOpt(record, 'tools', v); save(); } }) }),
    field({ label: ctx.t('topics'), path: 'topicIds', control: checkGroup({ options: topicOptions(ctx), selected: record.topicIds, emptyText: ctx.t('no_topics'), onChange: (v) => { record.topicIds = v; save(); } }) }),
    field({ label: ctx.t('tags'), path: 'tagIds', control: checkGroup({ options: tagOptions(ctx), selected: record.tagIds ?? [], emptyText: ctx.t('no_tags'), onChange: (v) => { setOpt(record, 'tagIds', v); save(); } }) }),
    field({ label: ctx.t('related_articles'), path: 'relatedArticleIds', control: checkGroup({ options: articleOptions, selected: record.relatedArticleIds ?? [], emptyText: ctx.t('nothing_here'), onChange: (v) => { setOpt(record, 'relatedArticleIds', v); save(); } }) }),
    field({ label: ctx.t('internal_notes'), path: 'internalNotes', hint: ctx.t('internal_notes_hint'), control: textInput({ value: record.internalNotes ?? '', multiline: true, rows: 5, maxLength: 4000, onInput: (v) => { setOpt(record, 'internalNotes', v.trim() === '' ? '' : v); save(); } }), wide: true }),
    checkInput({ label: ctx.t('sample_flag'), checked: record.sample === true, onChange: (v) => { if (v) record.sample = true; else delete record.sample; save(); } }),
    h('p', { class: 'muted small', dir: 'ltr' }, `${record.id} · ${ctx.t('created')} ${record.createdAt.slice(0, 10)}`));

  studio = createStudio({ ctx, kind: 'project', id, rel, record, root, getLang: () => lang, documentPanel: settings, saveRecord: () => save(), onRestored: () => { save(); drawTranslation(); } });

  function drawTabs() {
    tabHost.replaceChildren(
      tabs({ items: Object.keys(record.translations).map((code) => ({ value: code, label: `${ctx.langName(code)} ${record.translations[code].status === 'published' ? '●' : '○'}` })), active: lang, onSelect: (code) => { lang = code; drawTabs(); drawTranslation(); } }),
      ...ctx.languages().filter((l) => !record.translations[l.code]).map((l) => h('button', { type: 'button', class: 'button button--small', dataset: { addTranslation: l.code }, onclick: () => addTranslation(l.code) }, ctx.t('add_translation', { language: l.nativeName }))));
  }

  function drawTranslation() {
    const tr = record.translations[lang];
    const base = `translations.${lang}`;
    const dir = ctx.langDir(lang);
    const t = (key, label, { multiline = false, rows = 3, optional = false, maxLength } = {}) => field({ label, path: `${base}.${key}`, wide: true,
      control: textInput({ value: tr[key] ?? '', dir, lang, multiline, rows, maxLength, onInput: (v) => { if (optional) setOpt(tr, key, v); else tr[key] = v; save(); } }) });
    const slugControl = textInput({ value: tr.slug, dir, lang, onInput: (v) => { tr.slug = v.trim(); save(); } });
    translationHost.replaceChildren(
      h('div', { class: 'translation__head' }, h('h2', {}, ctx.langName(lang)), chip(ctx.t(`status_${tr.status}`), tr.status === 'published' ? 'ok' : ''), h('span', { class: 'spacer' }),
        ...scheduleControls({ ctx, record, lang, save, rerender: () => ctx.render() }),
        tr.status === 'published' ? h('button', { type: 'button', class: 'button button--small', id: 'unpublish', onclick: unpublish }, ctx.t('unpublish')) : h('button', { type: 'button', class: 'button button--small button--primary', id: 'publish-translation', onclick: publishNow }, ctx.t('mark_published'))),
      field({ label: ctx.t('translation_status'), path: `${base}.status`, control: selectInput({ value: tr.status, options: statusOptions(ctx), onChange: (v) => { tr.status = v; save(); ctx.render(); } }) }),
      t('title', ctx.t('field_title'), { maxLength: 200 }),
      h('div', { class: 'slugrow' }, field({ label: ctx.t('slug'), path: `${base}.slug`, hint: ctx.t('slug_hint'), control: slugControl, wide: true }),
        h('button', { type: 'button', class: 'button button--small', onclick: () => { tr.slug = uniqueSlug(slugify(tr.title), slugsInUse(ctx.content(), 'project', lang, id)); slugControl.value = tr.slug; save(); } }, ctx.t('slug_from_title'))),
      t('subtitle', ctx.t('field_subtitle'), { optional: true, maxLength: 300 }),
      t('summary', ctx.t('field_summary'), { multiline: true, rows: 3, maxLength: 400 }),
      t('role', ctx.t('field_role'), { optional: true }),
      field({ label: ctx.t('field_responsibilities'), path: `${base}.responsibilities`, hint: ctx.t('one_per_line'), wide: true, control: linesInput({ value: tr.responsibilities ?? [], dir, onInput: (v) => { setOpt(tr, 'responsibilities', v); save(); } }) }),
      ...['challenge', 'process', 'solution', 'outcome'].map((k) => t(k, ctx.t(`field_${k}`), { multiline: true, rows: 4, optional: true })),
      h('h3', {}, ctx.t('links')),
      linksEditor({ ctx, links: (tr.links ??= []), pathBase: `${base}.links`, onChange: save, dir }),
      h('h3', {}, ctx.t('body')),
      studio.mount(createBlocksEditor({ ctx, blocks: (tr.body ??= []), lang, pathBase: `${base}.body`, onChange: save, recordId: id })));
    panel.repaint();
  }

  root.append(
    h('p', {}, h('a', { href: '#/projects' }, `← ${ctx.t('nav_projects')}`)),
    h('div', { class: 'page-head' }, h('h1', {}, ctx.titleOf(record.translations)), h('button', { type: 'button', class: 'button button--danger', id: 'delete-item', onclick: remove }, ctx.t('delete'))),
    panel.el,
    h('div', { class: 'editor__grid' }, h('div', { class: 'editor__main' }, tabHost, translationHost), studio.sidebar));
  drawTabs(); drawTranslation();
  return { el: root, dispose: () => { panel.dispose(); studio.dispose(); } };
}
