import { publishArticleTranslation, slugsInUse } from '../../shared/core/content-ops.mjs';
import { slugify, uniqueSlug } from '../../shared/core/slugify.mjs';
import { TEMPLATES, templateName } from '../../shared/core/templates.mjs';
import { checkGroup, checkInput, chip, confirmDialog, field, h, modal, selectInput, tabs, textInput } from '../dom.mjs';
import { createBlocksEditor } from '../studio/blocks-editor.mjs';
import { createStudio } from '../studio/studio.mjs';
import { isoToLocalInput, localInputToIso, mediaOptions, problemsPanel, scheduleControls, setOpt, statusOptions, tagOptions, topicOptions } from './editor-common.mjs';

export function renderArticleEditor(ctx, id) {
  const rel = `articles/${id}.json`;
  if (!ctx.workspace.exists(rel)) return { el: h('div', {}, h('h1', {}, ctx.t('not_found')), h('a', { href: '#/articles' }, ctx.t('back_to_list'))) };

  const record = ctx.workspace.read(rel);
  let studio = null;
  const save = () => { ctx.workspace.write(rel, record); ctx.changed(); studio?.changed(); };
  let lang = record.translations[ctx.ui] ? ctx.ui : Object.keys(record.translations)[0];

  const root = h('div', { class: 'editor' });
  const panel = problemsPanel(ctx, root, rel);
  const translationHost = h('div', { class: 'card translation' });
  const tabHost = h('div');

  // ---------------------------------------------------------------- actions on the whole article
  const publishNow = () => {
    const next = publishArticleTranslation(record, lang);
    record.status = next.status; record.publishedAt = next.publishedAt; record.translations[lang].status = 'published';
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
    ctx.workspace.remove(rel); ctx.changed(); ctx.revalidate(); ctx.navigate('#/articles');
  };

  async function addTranslation(code) {
    const input = { title: '', excerpt: '' };
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t('add_translation_title', { language: ctx.langName(code) }),
      body: h('div', {}, field({ label: ctx.t('field_title'), control: textInput({ dir: ctx.langDir(code), onInput: (v) => { input.title = v; } }), wide: true }), field({ label: ctx.t('field_excerpt'), control: textInput({ dir: ctx.langDir(code), multiline: true, rows: 3, onInput: (v) => { input.excerpt = v; } }), wide: true }), err),
      actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')), h('button', { type: 'button', class: 'button button--primary', id: 'add-translation-confirm', onclick: () => { if (!input.title.trim() || !input.excerpt.trim()) { err.textContent = ctx.t('title_and_summary_required'); err.hidden = false; return; } close(input); } }, ctx.t('create'))],
    });
    if (!result) return;
    record.translations[code] = { status: 'draft', slug: uniqueSlug(slugify(result.title), slugsInUse(ctx.content(), 'article', code, id)), title: result.title.trim(), excerpt: result.excerpt.trim(), body: [] };
    lang = code; save(); drawTabs(); drawTranslation();
  }

  async function removeTranslation() {
    if (Object.keys(record.translations).length < 2) return;
    const ok = await confirmDialog({ title: ctx.t('remove_translation_title'), message: ctx.t('remove_translation_message', { language: ctx.langName(lang) }), confirmLabel: ctx.t('delete'), cancelLabel: ctx.t('cancel'), danger: true });
    if (!ok) return;
    delete record.translations[lang];
    lang = Object.keys(record.translations)[0];
    save(); drawTabs(); drawTranslation();
  }

  // ---------------------------------------------------------------- settings (the first tab of the Studio's sidebar)
  const templateOptions = () => {
    const current = record.template ?? '';
    const known = TEMPLATES.some((t) => t.id === current);
    return [...(current && !known ? [{ value: current, label: current }] : []), ...(current ? [] : [{ value: '', label: ctx.t('template_default') }]), ...TEMPLATES.map((t) => ({ value: t.id, label: templateName(t, ctx.ui) }))];
  };
  const templateSelect = selectInput({ value: record.template ?? '', options: templateOptions(), onChange: (v) => { setOpt(record, 'template', v); save(); } });
  const settings = h('div', { class: 'settings__fields' },
    field({ label: ctx.t('status'), path: 'status', control: selectInput({ value: record.status, options: statusOptions(ctx), onChange: (v) => { record.status = v; save(); } }) }),
    field({ label: ctx.t('published_at'), path: 'publishedAt', hint: ctx.t('published_at_hint'), control: (() => { const el = textInput({ type: 'datetime-local', value: isoToLocalInput(record.publishedAt), onInput: (v) => { setOpt(record, 'publishedAt', localInputToIso(v)); save(); } }); return el; })() }),
    checkInput({ label: ctx.t('featured'), checked: record.featured, onChange: (v) => { record.featured = v; save(); } }),
    field({ label: ctx.t('template'), path: 'template', hint: ctx.t('template_hint'), control: templateSelect }),
    field({ label: ctx.t('field_cover'), path: 'coverMediaId', control: selectInput({ value: record.coverMediaId ?? '', options: mediaOptions(ctx), onChange: (v) => { setOpt(record, 'coverMediaId', v); save(); } }) }),
    field({ label: ctx.t('topics'), path: 'topicIds', hint: ctx.t('topics_hint'), control: checkGroup({ options: topicOptions(ctx), selected: record.topicIds, emptyText: ctx.t('no_topics'), onChange: (v) => { record.topicIds = v; save(); } }) }),
    field({ label: ctx.t('tags'), path: 'tagIds', control: checkGroup({ options: tagOptions(ctx), selected: record.tagIds ?? [], emptyText: ctx.t('no_tags'), onChange: (v) => { setOpt(record, 'tagIds', v); save(); } }) }),
    field({ label: ctx.t('internal_notes'), path: 'internalNotes', hint: ctx.t('internal_notes_hint'), control: textInput({ value: record.internalNotes ?? '', multiline: true, rows: 5, maxLength: 4000, onInput: (v) => { setOpt(record, 'internalNotes', v.trim() === '' ? '' : v); save(); } }), wide: true }),
    checkInput({ label: ctx.t('sample_flag'), checked: record.sample === true, onChange: (v) => { if (v) record.sample = true; else delete record.sample; save(); } }),
    h('p', { class: 'muted small', dir: 'ltr' }, `${record.id} · ${ctx.t('created')} ${record.createdAt.slice(0, 10)}`));

  /** Starting from a template also gives the article that layout name (unless the new outline was only added at the end). */
  const templateApplied = (templateId, how) => {
    if (how === 'append') return;
    record.template = templateId;
    templateSelect.replaceChildren(...templateOptions().map((o) => h('option', { value: o.value }, o.label)));
    templateSelect.value = templateId;
    save();
  };

  studio = createStudio({ ctx, kind: 'article', id, rel, record, root, getLang: () => lang, documentPanel: settings, saveRecord: () => save(), onTemplateApplied: templateApplied, onRestored: () => { save(); drawTranslation(); } });

  // ---------------------------------------------------------------- translation panel
  function drawTabs() {
    tabHost.replaceChildren(
      tabs({ items: Object.keys(record.translations).map((code) => ({ value: code, label: `${ctx.langName(code)} ${record.translations[code].status === 'published' ? '●' : '○'}` })), active: lang, onSelect: (code) => { lang = code; drawTabs(); drawTranslation(); } }),
      ...ctx.languages().filter((l) => !record.translations[l.code]).map((l) => h('button', { type: 'button', class: 'button button--small', dataset: { addTranslation: l.code }, onclick: () => addTranslation(l.code) }, ctx.t('add_translation', { language: l.nativeName }))));
  }

  function drawTranslation() {
    const tr = record.translations[lang];
    const base = `translations.${lang}`;
    const dir = ctx.langDir(lang);
    const t = (key, label, { multiline = false, rows = 3, optional = false, maxLength, hint } = {}) => field({ label, hint, path: `${base}.${key}`, wide: true,
      control: textInput({ value: tr[key] ?? '', dir, lang, multiline, rows, maxLength, onInput: (v) => { if (optional) setOpt(tr, key, v); else tr[key] = v; save(); } }) });
    const seo = () => tr.seo ?? {};
    const setSeo = (key, v) => { tr.seo = { ...(tr.seo ?? {}) }; setOpt(tr.seo, key, v); if (!Object.keys(tr.seo).length) delete tr.seo; save(); };
    const slugControl = textInput({ value: tr.slug, dir, lang, onInput: (v) => { tr.slug = v.trim(); save(); } });

    translationHost.replaceChildren(
      h('div', { class: 'translation__head' },
        h('h2', {}, ctx.langName(lang)),
        chip(ctx.t(`status_${tr.status}`), tr.status === 'published' ? 'ok' : ''),
        h('span', { class: 'spacer' }),
        ...scheduleControls({ ctx, record, lang, save, rerender: () => ctx.render() }),
        tr.status === 'published' ? h('button', { type: 'button', class: 'button button--small', id: 'unpublish', onclick: unpublish }, ctx.t('unpublish')) : h('button', { type: 'button', class: 'button button--small button--primary', id: 'publish-translation', onclick: publishNow }, ctx.t('mark_published')),
        Object.keys(record.translations).length > 1 ? h('button', { type: 'button', class: 'button button--small button--danger', onclick: removeTranslation }, ctx.t('remove_translation')) : null),
      field({ label: ctx.t('translation_status'), path: `${base}.status`, control: selectInput({ value: tr.status, options: statusOptions(ctx), onChange: (v) => { tr.status = v; save(); ctx.render(); } }) }),
      t('title', ctx.t('field_title'), { maxLength: 200 }),
      h('div', { class: 'slugrow' },
        field({ label: ctx.t('slug'), path: `${base}.slug`, hint: ctx.t('slug_hint'), control: slugControl, wide: true }),
        h('button', { type: 'button', class: 'button button--small', onclick: () => { tr.slug = uniqueSlug(slugify(tr.title), slugsInUse(ctx.content(), 'article', lang, id)); slugControl.value = tr.slug; save(); } }, ctx.t('slug_from_title'))),
      t('subtitle', ctx.t('field_subtitle'), { optional: true, maxLength: 300 }),
      t('excerpt', ctx.t('field_excerpt'), { multiline: true, rows: 3, maxLength: 400 }),
      t('coverAlt', ctx.t('field_cover_alt'), { optional: true }),
      h('h3', {}, ctx.t('body')),
      studio.mount(createBlocksEditor({ ctx, blocks: (tr.body ??= []), lang, pathBase: `${base}.body`, onChange: save, recordId: id })),
      h('details', { class: 'seo' }, h('summary', {}, ctx.t('seo_overrides')),
        field({ label: ctx.t('seo_title'), path: `${base}.seo.title`, control: textInput({ value: seo().title ?? '', dir, maxLength: 120, onInput: (v) => setSeo('title', v) }), wide: true }),
        field({ label: ctx.t('seo_description'), path: `${base}.seo.description`, control: textInput({ value: seo().description ?? '', dir, multiline: true, rows: 2, maxLength: 300, onInput: (v) => setSeo('description', v) }), wide: true }),
        field({ label: ctx.t('seo_robots'), path: `${base}.seo.robots`, control: selectInput({ value: seo().robots ?? '', options: [{ value: '', label: ctx.t('default') }, { value: 'index', label: 'index' }, { value: 'noindex', label: 'noindex' }], onChange: (v) => setSeo('robots', v) }) })));
    panel.repaint();
  }

  const title = ctx.titleOf(record.translations);
  root.append(
    h('p', {}, h('a', { href: '#/articles' }, `← ${ctx.t('nav_articles')}`)),
    h('div', { class: 'page-head' }, h('h1', {}, title), h('button', { type: 'button', class: 'button button--danger', id: 'delete-item', onclick: remove }, ctx.t('delete'))),
    panel.el,
    h('div', { class: 'editor__grid' }, h('div', { class: 'editor__main' }, tabHost, translationHost), studio.sidebar));
  drawTabs(); drawTranslation();
  return { el: root, dispose: () => { panel.dispose(); studio.dispose(); } };
}
