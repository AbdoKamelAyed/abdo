// Profile and CV: identity, links, experience, education, skills and custom sections.

import { newBlock, usedIds } from '../../shared/core/content-ops.mjs';
import { newId } from '../../shared/core/ids.mjs';
import { checkInput, field, h, selectInput, tabs, textInput } from '../dom.mjs';
import { blocksEditor } from './blocks.mjs';
import { linksEditor, mediaOptions, problemsPanel, setOpt } from './editor-common.mjs';

const REL = 'profile/author.json';

/** Empty optional pieces are left out of the stored file. */
function normalize(record) {
  const out = structuredClone(record);
  for (const tr of Object.values(out.translations)) if (Array.isArray(tr.biography) && !tr.biography.length) delete tr.biography;
  return out;
}

export function renderProfile(ctx) {
  const record = ctx.workspace.read(REL);
  const save = () => { ctx.workspace.write(REL, normalize(record)); ctx.changed(); };
  const root = h('div', { class: 'editor' });
  const panel = problemsPanel(ctx, root, REL);
  const langs = ctx.languages();
  let lang = record.translations[ctx.ui] ? ctx.ui : Object.keys(record.translations)[0];
  const identityHost = h('div', { class: 'card' });
  const tabHost = h('div');

  function drawIdentity() {
    const tr = record.translations[lang];
    if (!tr) { identityHost.replaceChildren(h('p', { class: 'muted' }, ctx.t('no_translation'))); return; }
    const base = `translations.${lang}`;
    const dir = ctx.langDir(lang);
    const t = (key, label, opts = {}) => field({ label, path: `${base}.${key}`, wide: true, control: textInput({ value: tr[key] ?? '', dir, lang, multiline: opts.multiline, rows: opts.rows ?? 3, maxLength: opts.maxLength, onInput: (v) => { tr[key] = v; save(); } }) });
    identityHost.replaceChildren(
      t('name', ctx.t('field_name')), t('headline', ctx.t('field_headline'), { maxLength: 200 }), t('summary', ctx.t('field_summary'), { multiline: true, maxLength: 500 }),
      h('h3', {}, ctx.t('biography')),
      blocksEditor({ ctx, blocks: (tr.biography ??= []), lang, pathBase: `${base}.biography`, onChange: save }));
    panel.repaint();
  }
  function drawTabs() {
    tabHost.replaceChildren(tabs({ items: langs.map((l) => ({ value: l.code, label: l.nativeName })), active: lang, onSelect: (code) => { lang = code; drawTabs(); drawIdentity(); } }));
  }

  /** Edits one translated entry (experience, education, skill, custom section) in every language it has. */
  function entryEditor({ list, listKey, index, kindLabel, fieldDefs, blank }) {
    const entry = list[index];
    const base = `${listKey}[${index}]`;
    const card = h('article', { class: 'card entry', dataset: { path: base, entryId: entry.id } });
    const missing = langs.filter((l) => !entry.translations[l.code]);
    const move = (delta) => { const to = index + delta; if (to < 0 || to >= list.length) return; [list[index], list[to]] = [list[to], list[index]]; save(); drawLists(); };

    card.append(h('div', { class: 'entry__head' }, h('strong', {}, `${kindLabel} ${index + 1}`), h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'button button--small', 'aria-label': ctx.t('move_up'), disabled: index === 0 || null, onclick: () => move(-1) }, '↑'),
      h('button', { type: 'button', class: 'button button--small', 'aria-label': ctx.t('move_down'), disabled: index === list.length - 1 || null, onclick: () => move(1) }, '↓'),
      h('button', { type: 'button', class: 'button button--small button--danger', dataset: { removeEntry: entry.id }, onclick: () => { list.splice(index, 1); save(); drawLists(); } }, ctx.t('delete'))));

    card.append(h('div', { class: 'grid2' },
      field({ label: ctx.t('visibility'), path: `${base}.visibility`, control: selectInput({ value: entry.visibility, options: [{ value: 'public', label: ctx.t('visibility_public') }, { value: 'private', label: ctx.t('visibility_private') }], onChange: (v) => { entry.visibility = v; save(); } }) }),
      checkInput({ label: ctx.t('sample_flag'), checked: entry.sample === true, onChange: (v) => { if (v) entry.sample = true; else delete entry.sample; save(); } })));

    if (fieldDefs.dates) {
      card.append(h('div', { class: 'grid2' },
        field({ label: ctx.t('start_month'), path: `${base}.startDate`, control: textInput({ type: 'month', value: entry.startDate ?? '', onInput: (v) => { entry.startDate = v; save(); } }) }),
        field({ label: ctx.t('end_month'), path: `${base}.endDate`, hint: ctx.t('end_hint'), control: textInput({ type: 'month', value: entry.endDate ?? '', onInput: (v) => { setOpt(entry, 'endDate', v); save(); } }) })));
    }

    const versions = h('div', { class: 'versions' });
    for (const code of Object.keys(entry.translations)) {
      const tr = entry.translations[code];
      const trBase = `${base}.translations.${code}`;
      const dir = ctx.langDir(code);
      versions.append(h('section', { class: 'version', dir }, h('h4', {}, ctx.langName(code)),
        ...fieldDefs.fields.map((def) => {
          if (def.type === 'blocks') return h('div', {}, h('label', { class: 'label' }, ctx.t(def.label)), blocksEditor({ ctx, blocks: (tr[def.key] ??= []), lang: code, pathBase: `${trBase}.${def.key}`, onChange: save }));
          return field({ label: ctx.t(def.label), path: `${trBase}.${def.key}`, wide: true, control: textInput({ value: tr[def.key] ?? '', dir, lang: code, multiline: def.multiline, rows: 3, onInput: (v) => { if (def.optional) setOpt(tr, def.key, v); else tr[def.key] = v; save(); } }) });
        }),
        Object.keys(entry.translations).length > 1 ? h('button', { type: 'button', class: 'button button--small', onclick: () => { delete entry.translations[code]; save(); drawLists(); } }, ctx.t('remove_translation')) : null));
    }
    card.append(versions);
    for (const l of missing) card.append(h('button', { type: 'button', class: 'button button--small', dataset: { addVersion: `${entry.id}:${l.code}` }, onclick: () => { entry.translations[l.code] = blank(); save(); drawLists(); } }, ctx.t('add_translation', { language: l.nativeName })));
    return card;
  }

  const SECTIONS = [
    { key: 'experience', title: 'experience', kind: 'experience', idKind: 'experience', defs: { dates: true, fields: [{ key: 'title', label: 'field_title' }, { key: 'organization', label: 'field_organization' }, { key: 'summary', label: 'field_summary', multiline: true, optional: true }] }, blank: () => ({ title: '', organization: '' }), extra: () => ({ startDate: '' }) },
    { key: 'education', title: 'education', kind: 'education', idKind: 'education', defs: { dates: true, fields: [{ key: 'title', label: 'field_title' }, { key: 'organization', label: 'field_organization' }] }, blank: () => ({ title: '', organization: '' }), extra: () => ({ startDate: '' }) },
    { key: 'skills', title: 'skills', kind: 'skill', idKind: 'skills', defs: { dates: false, fields: [{ key: 'name', label: 'field_name' }] }, blank: () => ({ name: '' }), extra: () => ({}) },
    { key: 'customSections', title: 'custom_sections', kind: 'section', idKind: 'custom', defs: { dates: false, fields: [{ key: 'title', label: 'field_title' }, { key: 'body', label: 'body', type: 'blocks' }] }, blank: () => ({ title: '', body: [] }), extra: () => ({}) },
  ];
  const listHost = h('div');

  function drawLists() {
    listHost.replaceChildren();
    for (const section of SECTIONS) {
      const list = (record[section.key] ??= []);
      const wrap = h('section', { class: 'entries', dataset: { section: section.key } }, h('div', { class: 'page-head' }, h('h2', {}, ctx.t(section.title)),
        h('button', { type: 'button', class: 'button button--small button--primary', dataset: { addEntry: section.key }, onclick: () => {
          const code = langs.some((l) => l.code === lang) ? lang : langs[0].code;
          const blank = section.blank();
          if (section.key === 'customSections') blank.body = [newBlock(ctx.content(), 'paragraph', [])];
          list.push({ id: newId(section.idKind, usedIds({ ...ctx.content(), profile: record })), visibility: 'public', ...section.extra(), translations: { [code]: blank } });
          save(); drawLists();
        } }, ctx.t('add_entry'))));
      if (!list.length) wrap.append(h('p', { class: 'muted empty' }, ctx.t('nothing_here')));
      list.forEach((_, i) => wrap.append(entryEditor({ list, listKey: section.key, index: i, kindLabel: ctx.t(`kind_${section.kind}`), fieldDefs: section.defs, blank: section.blank })));
      listHost.append(wrap);
    }
    panel.repaint();
  }

  root.append(
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('nav_profile'))),
    panel.el,
    h('section', { class: 'card' }, h('h2', {}, ctx.t('identity')),
      h('div', { class: 'grid2' },
        field({ label: ctx.t('profile_photo'), path: 'photoMediaId', control: selectInput({ value: record.photoMediaId ?? '', options: mediaOptions(ctx), onChange: (v) => { setOpt(record, 'photoMediaId', v); save(); } }) }),
        checkInput({ label: ctx.t('sample_flag'), checked: record.sample === true, onChange: (v) => { if (v) record.sample = true; else delete record.sample; save(); } })),
      h('p', { class: 'field__hint' }, ctx.t('sample_profile_hint'))),
    tabHost, identityHost,
    h('section', { class: 'card' }, h('h2', {}, ctx.t('links')), linksEditor({ ctx, links: (record.links ??= []), pathBase: 'links', onChange: save, withKind: true, dir: 'ltr' })),
    listHost);
  drawTabs(); drawIdentity(); drawLists();
  return { el: root, dispose: panel.dispose };
}
