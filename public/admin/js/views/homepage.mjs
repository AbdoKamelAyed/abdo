// Homepage Builder: the sections of the home page, per language. Add, duplicate, hide, remove and reorder
// (drag and drop, or the arrow buttons / Alt+arrows on the handle); each section's settings are the ones its
// kind really has (src/core/homepage-ops.mjs). The preview is the site's own renderer.

import { usedIds } from '../../shared/core/content-ops.mjs';
import {
  copyStructure, duplicateSection, insertSection, moveBy, moveSection, newSection, RATIOS, removeSection, SECTION_PRESETS,
  LIMIT_RANGE, SECTION_SPECS, SPACINGS, setEnabled, updateSection,
} from '../../shared/core/homepage-ops.mjs';
import { TEMPLATES, templateName } from '../../shared/core/templates.mjs';
import { checkGroup, checkInput, confirmDialog, field, h, selectInput, tabs, textInput } from '../dom.mjs';
import { createPreview } from '../preview.mjs';
import { problemsPanel, topicOptions } from './editor-common.mjs';

const REL = 'config/homepage.json';
const ARROWS = { ArrowUp: -1, ArrowDown: 1 };

export function renderHomepage(ctx) {
  const data = ctx.workspace.read(REL);
  const langs = ctx.languages();
  let lang = langs.some((l) => l.code === ctx.ui) ? ctx.ui : langs[0].code;
  const open = new Set(); // section IDs whose settings are showing
  let dragFrom = null;

  const root = h('div', { class: 'editor homepage' });
  const panel = problemsPanel(ctx, root, REL);
  const listHost = h('div', { class: 'sections' });
  const tabHost = h('div');
  const addSelect = selectInput({ value: SECTION_PRESETS[1].id, options: SECTION_PRESETS.map((p) => ({ value: p.id, label: ctx.t(`hp_p_${p.id}`) })) });
  const copyButton = h('button', { type: 'button', class: 'button', id: 'hp-copy' });

  const sectionsOf = () => (data.languages[lang] ??= { sections: [] }).sections;
  const setSections = (next) => { (data.languages[lang] ??= { sections: [] }).sections = next; };
  const save = () => { ctx.workspace.write(REL, data); ctx.changed(); preview.update(); };
  const everyId = () => usedIds({ ...ctx.content(), homepage: data });

  const preview = createPreview({ ctx, kind: 'home', lang: () => lang });

  // ---- one section's settings, only the fields its kind has

  function settings(section) {
    const spec = SECTION_SPECS[section.type];
    const has = (f) => spec.fields.includes(f);
    const set = (change) => { setSections(updateSection(sectionsOf(), section.id, change)); save(); };
    const dir = ctx.langDir(lang);
    const defaultTitle = ctx.content().i18n?.[lang]?.strings?.[`sec_${section.type}`] ?? '';
    const rows = [];
    const row = (label, control, hint, wide = false) => rows.push(field({ label, hint, control, wide }));

    if (has('title')) row(ctx.t('hp_f_title'), textInput({ value: section.title ?? '', dir, lang, maxLength: 80, placeholder: defaultTitle ? ctx.t('hp_default_title', { title: defaultTitle }) : '', onInput: (v) => set((s) => { s.title = v; }) }), null, true);
    if (has('intro')) row(ctx.t('hp_f_intro'), textInput({ value: section.intro ?? '', dir, lang, multiline: true, rows: 2, maxLength: 240, onInput: (v) => set((s) => { s.intro = v; }) }), null, true);
    if (has('layout') && spec.layouts.length) {
      row(ctx.t('hp_f_layout'), selectInput({ value: section.layout ?? spec.layouts[0], options: spec.layouts.map((l) => ({ value: l, label: ctx.t(`hp_layout_${l}`) })), onChange: (v) => set((s) => { s.layout = v; }) }));
    }
    if (has('limit')) {
      const limit = textInput({ type: 'number', value: String(section.limit ?? spec.defaults.limit ?? ''), onInput: (v) => set((s) => { s.limit = v === '' ? undefined : Number(v); }) });
      limit.min = String(LIMIT_RANGE.min); limit.max = String(LIMIT_RANGE.max); limit.step = '1'; limit.dataset.sectionLimit = section.id;
      // While typing, the field is left alone; when the person leaves it, it shows the value that was actually kept.
      limit.addEventListener('change', () => { const kept = sectionsOf().find((s) => s.id === section.id)?.limit ?? spec.defaults.limit ?? ''; limit.value = String(kept); });
      row(ctx.t('hp_f_limit'), limit);
    }
    if (has('imageRatio')) row(ctx.t('hp_f_ratio'), selectInput({ value: section.imageRatio ?? spec.defaults.imageRatio ?? '3:2', options: RATIOS.map((r) => ({ value: r, label: r })), onChange: (v) => set((s) => { s.imageRatio = v; }) }));
    if (has('spacing')) row(ctx.t('hp_f_spacing'), selectInput({ value: section.spacing ?? 'normal', options: SPACINGS.map((v) => ({ value: v, label: ctx.t(`hp_spacing_${v}`) })), onChange: (v) => set((s) => { s.spacing = v; }) }));
    if (has('kind')) {
      const pool = (kind) => [...(kind !== 'project' ? ctx.content().articles : []), ...(kind !== 'article' ? ctx.content().projects : [])];
      const kind = section.source?.kind ?? 'any';
      row(ctx.t('hp_f_kind'), selectInput({ value: kind, options: ['any', 'article', 'project'].map((k) => ({ value: k, label: ctx.t(`hp_kind_${k}`) })), onChange: (v) => set((s) => { s.source = { ...(s.source ?? {}), kind: v }; delete s.source.itemId; rerenderList(); }) }));
      row(ctx.t('hp_f_item'), selectInput({ value: section.source?.itemId ?? '', options: [{ value: '', label: ctx.t('hp_item_auto') }, ...pool(kind).filter((r) => r.status === 'published').map((r) => ({ value: r.id, label: ctx.titleOf(r.translations) }))], onChange: (v) => set((s) => { s.source = { ...(s.source ?? {}), itemId: v }; }) }));
    }
    if (has('featuredOnly')) rows.push(checkInput({ label: ctx.t('hp_f_featured_only'), checked: section.source?.featuredOnly === true, onChange: (v) => set((s) => { s.source = { ...(s.source ?? {}), featuredOnly: v }; }) }));
    if (has('topicIds')) rows.push(field({ label: ctx.t('hp_f_topics'), hint: ctx.t('hp_f_topics_hint'), wide: true, control: checkGroup({ options: topicOptions(ctx), selected: section.source?.topicIds ?? [], emptyText: ctx.t('no_topics'), onChange: (v) => set((s) => { s.source = { ...(s.source ?? {}), topicIds: v }; }) }) }));
    if (has('templates')) rows.push(field({ label: ctx.t('hp_f_templates'), hint: ctx.t('hp_f_templates_hint'), wide: true, control: checkGroup({ options: TEMPLATES.map((t) => ({ value: t.id, label: templateName(t, ctx.ui) })), selected: section.source?.templates ?? [], onChange: (v) => set((s) => { s.source = { ...(s.source ?? {}), templates: v }; }) }) }));
    return h('div', { class: 'sect__settings grid2' }, rows);
  }

  // ---- the list

  function relocate(from, to) {
    const list = sectionsOf();
    if (from === to || from < 0 || to < 0 || to >= list.length) return;
    setSections(moveSection(list, list[from].id, to));
    save(); drawList();
  }

  function card(section, index) {
    const list = sectionsOf();
    const isOpen = open.has(section.id);
    const el = h('article', { class: `sect${section.enabled ? '' : ' is-hidden'}`, dataset: { sectionId: section.id, sectionType: section.type, index: String(index) } });
    const handle = h('button', {
      type: 'button', class: 'sect__handle', 'aria-label': ctx.t('drag_handle'), title: ctx.t('drag_handle'),
      onmousedown: () => { el.draggable = true; }, onmouseup: () => { el.draggable = false; },
      onkeydown: (event) => {
        const delta = ARROWS[event.key];
        if (!delta) return;
        event.preventDefault();
        relocate(index, index + delta);
        listHost.querySelectorAll('.sect')[index + delta]?.querySelector('.sect__handle')?.focus();
      },
    }, '⠿');

    el.addEventListener('dragstart', (event) => { dragFrom = index; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', section.id); el.classList.add('is-dragging'); });
    el.addEventListener('dragend', () => { el.draggable = false; dragFrom = null; clearDrop(); });
    el.addEventListener('dragover', (event) => {
      if (dragFrom === null) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      el.classList.toggle('drop-after', after); el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (event) => {
      if (dragFrom === null) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
      const from = dragFrom;
      dragFrom = null; clearDrop();
      relocate(from, at > from ? at - 1 : at);
    });

    const small = (label, onclick, extra = {}) => h('button', { type: 'button', class: `button button--small${extra.danger ? ' button--danger' : ''}`, 'aria-label': extra.aria ?? label, title: extra.aria ?? label, disabled: extra.disabled || null, dataset: extra.dataset ?? {}, onclick }, label);
    const title = section.title || ctx.t(`hp_t_${section.type}`);
    el.append(
      h('div', { class: 'sect__head' },
        handle,
        h('span', { class: 'sect__index' }, String(index + 1)),
        h('div', { class: 'sect__name' }, h('strong', {}, title), ' ', h('span', { class: 'chip' }, ctx.t(`hp_t_${section.type}`)), section.enabled ? '' : h('span', { class: 'chip chip--warn' }, ctx.t('hp_hidden_chip'))),
        h('span', { class: 'spacer' }),
        small('↑', () => relocate(index, index - 1), { aria: ctx.t('move_up'), disabled: index === 0 }),
        small('↓', () => relocate(index, index + 1), { aria: ctx.t('move_down'), disabled: index === list.length - 1 }),
        small(ctx.t('hp_settings'), () => { if (open.has(section.id)) open.delete(section.id); else open.add(section.id); drawList(); }, { dataset: { sectionToggle: section.id } }),
        small(ctx.t('hp_duplicate'), () => { const { sections, id } = duplicateSection(list, section.id, everyId()); setSections(sections); open.add(id); save(); drawList(); }, { dataset: { sectionDuplicate: section.id } }),
        small(ctx.t('delete'), () => { setSections(removeSection(list, section.id)); open.delete(section.id); save(); drawList(); }, { danger: true, dataset: { sectionDelete: section.id } })),
      h('div', { class: 'sect__body' },
        checkInput({ label: ctx.t('hp_visible'), checked: section.enabled, onChange: (v) => { setSections(setEnabled(sectionsOf(), section.id, v)); save(); drawList(); } }),
        ...(isOpen ? [settings(section)] : [])));
    el.querySelector('.sect__body .check input').dataset.sectionEnabled = section.id;
    return el;
  }

  function clearDrop() { for (const el of listHost.querySelectorAll('.drop-before, .drop-after, .is-dragging')) el.classList.remove('drop-before', 'drop-after', 'is-dragging'); }

  function rerenderList() { drawList(); }
  function drawList() {
    const list = sectionsOf();
    listHost.replaceChildren(...(list.length ? list.map(card) : [h('p', { class: 'muted empty' }, ctx.t('hp_empty'))]));
    const other = langs.find((l) => l.code !== lang);
    copyButton.hidden = !other;
    if (other) { copyButton.textContent = ctx.t('hp_copy', { name: other.nativeName }); copyButton.dataset.from = other.code; }
    panel.repaint();
  }

  function drawTabs() {
    tabHost.replaceChildren(tabs({ items: langs.map((l) => ({ value: l.code, label: l.nativeName })), active: lang, onSelect: (code) => { lang = code; open.clear(); drawTabs(); drawList(); preview.update(); } }));
  }

  copyButton.addEventListener('click', async () => {
    const from = copyButton.dataset.from;
    const ok = await confirmDialog({ title: ctx.t('hp_copy_title'), message: ctx.t('hp_copy_message', { from: ctx.langName(from), to: ctx.langName(lang) }), confirmLabel: ctx.t('hp_copy', { name: ctx.langName(from) }), cancelLabel: ctx.t('cancel') });
    if (!ok) return;
    setSections(copyStructure(data.languages[from]?.sections ?? [], everyId()));
    open.clear(); save(); drawList();
  });

  root.append(
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('hp_title'))),
    h('p', { class: 'muted' }, ctx.t('hp_intro')),
    panel.el,
    h('div', { class: 'homepage__grid' },
      h('div', { class: 'homepage__edit' },
        tabHost,
        h('div', { class: 'card sect__add' },
          field({ label: ctx.t('hp_add_label'), control: addSelect }),
          h('button', { type: 'button', class: 'button button--primary', id: 'hp-add', onclick: () => {
            const section = newSection(addSelect.value, lang, everyId());
            setSections(insertSection(sectionsOf(), section));
            open.add(section.id); save(); drawList();
            listHost.querySelector(`[data-section-id="${section.id}"]`)?.scrollIntoView({ block: 'nearest' });
          } }, ctx.t('hp_add')),
          copyButton),
        listHost,
        h('p', { class: 'muted small' }, ctx.t('hp_note_preview'), ' ', ctx.t('unpublished_changes_note'))),
      h('div', { class: 'homepage__preview' }, preview.element)));

  drawTabs(); drawList();
  queueMicrotask(() => preview.refit());
  return { el: root, dispose: () => { panel.dispose(); preview.destroy(); } };
}
