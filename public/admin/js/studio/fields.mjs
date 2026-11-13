// Builds the form for one block (or one item of a block) from its declarative spec.
// See src/core/block-specs.mjs for what each field kind means. Everything is created with the DOM
// toolkit (text nodes only), so block text can never become markup in the admin.

import { RELATED_KINDS, fieldLabelKey, itemSkeleton, optionLabelKey, optionText, readField, writeField } from '../../shared/core/block-specs.mjs';
import { clampLevels, listLevel, withLevel } from '../../shared/core/lists.mjs';
import { checkInput, h, nextId, selectInput, textInput } from '../dom.mjs';
import { editFocal } from '../views/focal.mjs';
import { mediaOptions } from '../views/editor-common.mjs';
import { inlineToolbar } from './toolbar.mjs';

/**
 * What every field needs to know about the block being edited.
 * @typedef {{
 *   ctx: object, lang: string, dir: string, block: object, blocks: object[], recordId?: string,
 *   edit: (change: () => void, mergeKey?: string|null) => void,
 *   seal: () => void,
 *   structural: (change: () => void) => void,
 * }} FieldEnv
 */

const OPTIONAL_TAGGED = new Set(['text', 'long', 'plain', 'code']);
const ALT_FOR = { mediaId: 'alt', beforeId: 'beforeAlt', afterId: 'afterAlt' };

const fieldPath = (spec) => (spec.path ?? [spec.key]).join('.');

/** @param {FieldEnv} env */
export function renderFields(env, owner, specs, basePath) {
  return specs.map((spec) => renderField(env, owner, spec, `${basePath}.${fieldPath(spec)}`)).filter(Boolean);
}

function frame(env, { label, hint, path, input, before = null, after = null }) {
  const id = nextId('s');
  if (input) input.id = id;
  return h('div', { class: 'field field--wide', dataset: path ? { path } : {} },
    h('label', { for: input ? id : null }, label), before, input, after,
    hint ? h('p', { class: 'field__hint' }, env.ctx.t(hint)) : null,
    h('p', { class: 'field__error', role: 'alert', hidden: true }));
}

const labelOf = (env, spec) => {
  const text = env.ctx.t(fieldLabelKey(spec));
  return !spec.required && OPTIONAL_TAGGED.has(spec.kind) ? `${text} ${env.ctx.t('optional')}` : text;
};

/** @param {FieldEnv} env */
export function renderField(env, owner, spec, path) {
  const mergeKey = `${env.block.id}:${path}`;
  switch (spec.kind) {
    case 'text': case 'long': case 'plain': case 'code': return textField(env, owner, spec, path, mergeKey);
    case 'enum': return enumField(env, owner, spec, path);
    case 'bool': return boolField(env, owner, spec, path);
    case 'media': return mediaField(env, owner, spec, path);
    case 'lines': return linesField(env, owner, spec, path, mergeKey);
    case 'group': return groupField(env, owner, spec, path);
    case 'grid': return gridField(env, owner, spec, path);
    case 'refs': return refsField(env, owner, spec, path);
    case 'aligns': return null; // edited together with the table cells
    default: throw new Error(`Unknown field kind "${spec.kind}"`);
  }
}

function textField(env, owner, spec, path, mergeKey) {
  const multiline = spec.kind === 'long' || spec.kind === 'code';
  const literal = spec.kind === 'plain' || spec.kind === 'code';
  const input = textInput({
    value: readField(owner, spec) ?? '', dir: literal ? 'ltr' : env.dir, lang: literal ? undefined : env.lang,
    multiline, rows: spec.rows, maxLength: spec.maxLength,
    onInput: (value) => env.edit(() => writeField(owner, spec, value), mergeKey),
  });
  if (literal) input.spellcheck = false;
  if (spec.kind === 'code') input.classList.add('code-input');
  const toolbar = literal ? null : inlineToolbar({ ctx: env.ctx, input, blocks: env.blocks, seal: env.seal, structural: env.structural });
  return frame(env, { label: labelOf(env, spec), hint: spec.hint, path, input, before: toolbar });
}

function enumField(env, owner, spec, path) {
  const { ctx } = env;
  const current = readField(owner, spec);
  const options = spec.options.map((value) => { const key = optionLabelKey(spec, value); return { value: String(value), label: key ? ctx.t(key) : optionText(spec, value) }; });
  const all = spec.optional ? [{ value: '', label: ctx.t('default') }, ...options] : options;
  const select = selectInput({ value: current === '' || current == null ? '' : String(current), options: all, onChange: (value) => env.edit(() => writeField(owner, spec, value), null) });
  const wrap = frame(env, { label: ctx.t(fieldLabelKey(spec)), hint: spec.hint, path, input: select });
  wrap.classList.remove('field--wide');
  return wrap;
}

function boolField(env, owner, spec, path) {
  const box = checkInput({ label: env.ctx.t(fieldLabelKey(spec)), checked: readField(owner, spec) === true, onChange: (value) => env.edit(() => writeField(owner, spec, value), null) });
  return h('div', { class: 'field field--check', dataset: { path } }, box, h('p', { class: 'field__error', role: 'alert', hidden: true }));
}

function mediaField(env, owner, spec, path) {
  const { ctx } = env;
  const altKey = ALT_FOR[spec.key] ?? 'alt';
  const options = [{ value: '', label: ctx.t('choose_image') }, ...mediaOptions(ctx, { allowNone: false })];
  const current = owner[spec.key] ?? '';
  if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current });

  const thumb = h('div', { class: 'thumb' });
  const note = h('p', { class: 'field__hint field__hint--warn', hidden: true });
  let showing = 0;
  async function show() {
    const mine = (showing += 1);
    thumb.replaceChildren(); note.hidden = true;
    const asset = ctx.content().media.find((m) => m.id === owner[spec.key]);
    if (!asset) return;
    const own = owner[altKey];
    if (!own && !asset.alt?.[env.lang]) { note.textContent = ctx.t('media_no_alt', { language: ctx.langName(env.lang) }); note.hidden = false; }
    const url = await ctx.mediaUrl(asset.file);
    if (url && mine === showing) thumb.append(h('img', { src: url, alt: '' }));
  }
  const select = selectInput({ value: current, options, onChange: (value) => { env.edit(() => { owner[spec.key] = value; }, null); show(); } });
  show();
  const focal = h('button', { type: 'button', class: 'button button--small', dataset: { editFocal: spec.key }, onclick: async () => {
    const asset = ctx.content().media.find((m) => m.id === owner[spec.key]);
    if (asset && await editFocal(ctx, asset)) { env.refresh(); show(); }
  } }, ctx.t('focal_button'));
  return frame(env, { label: ctx.t(fieldLabelKey(spec)), hint: spec.hint ?? (options.length < 2 ? 'image_hint' : null), path, input: select, after: h('div', {}, thumb, note, focal) });
}

/** The lines of a text box as list items. A nested list keeps its indentation, made consistent. */
function readLines(value, nested) {
  const rows = value.split('\n').map((s) => (nested ? s.trimEnd() : s.trim())).filter((s) => s.trim());
  if (!nested) return rows;
  const levels = clampLevels(rows.map(listLevel));
  return rows.map((row, i) => withLevel(row, levels[i]));
}

function linesField(env, owner, spec, path, mergeKey) {
  const input = textInput({ value: (owner[spec.key] ?? []).join('\n'), dir: env.dir, lang: env.lang, multiline: true, rows: spec.rows,
    onInput: (value) => env.edit(() => { owner[spec.key] = readLines(value, spec.nested); }, mergeKey) });
  const toolbar = inlineToolbar({ ctx: env.ctx, input, blocks: env.blocks, seal: env.seal, structural: env.structural, nested: spec.nested });
  return frame(env, { label: env.ctx.t(fieldLabelKey(spec)), hint: spec.hint, path, input, before: toolbar });
}

// ---------------------------------------------------------------- repeated items

const smallButton = (label, onclick, extra = {}) => h('button', { type: 'button', class: `button button--small${extra.danger ? ' button--danger' : ''}`, 'aria-label': extra.aria ?? label, disabled: extra.disabled || null, dataset: extra.dataset ?? {}, onclick }, label);

function groupField(env, owner, spec, path) {
  const { ctx } = env;
  const items = (owner[spec.key] ??= []);
  const nameKey = `item_${env.block.type}`;
  const root = h('div', { class: 'group', dataset: { path } });

  const mutate = (change, focusIndex) => { env.edit(change, null); draw(focusIndex); };
  function draw(focusIndex) {
    root.replaceChildren(
      h('p', { class: 'label' }, ctx.t(fieldLabelKey(spec))),
      ...items.map((item, i) => h('div', { class: 'group__item', dataset: { path: `${path}[${i}]`, item: String(i) } },
        h('div', { class: 'group__head' },
          h('strong', {}, `${ctx.t(nameKey)} ${i + 1}`), h('span', { class: 'spacer' }),
          smallButton('↑', () => mutate(() => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; }, i - 1), { aria: ctx.t('move_up'), disabled: i === 0 }),
          smallButton('↓', () => mutate(() => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; }, i + 1), { aria: ctx.t('move_down'), disabled: i === items.length - 1 }),
          smallButton(ctx.t('delete'), () => mutate(() => { items.splice(i, 1); }, Math.max(0, i - 1)), { danger: true, disabled: items.length <= (spec.minItems ?? 0) })),
        ...renderFields(env, item, spec.itemFields, `${path}[${i}]`))),
      smallButton(`+ ${ctx.t(nameKey)}`, () => mutate(() => { items.push(itemSkeleton(spec)); }, items.length), { disabled: spec.maxItems != null && items.length >= spec.maxItems, dataset: { addItem: spec.key } }));
    if (focusIndex != null) root.querySelector(`.group__item[data-item="${focusIndex}"] input, .group__item[data-item="${focusIndex}"] textarea, .group__item[data-item="${focusIndex}"] select`)?.focus();
  }
  draw();
  return root;
}

function gridField(env, owner, spec, path) {
  const { ctx } = env;
  const rows = (owner.rows ??= [['', '']]);
  const alignSpec = env.block && { options: ['start', 'center', 'end'], key: 'align' };
  const root = h('div', { class: 'grid-editor', dataset: { path } });
  const width = () => rows[0]?.length ?? 1;
  const setAlign = (column, value) => {
    const next = Array.from({ length: width() }, (_, k) => owner.align?.[k] ?? 'start');
    next[column] = value;
    if (next.every((a) => a === 'start')) delete owner.align; else owner.align = next;
  };
  const trimAlign = () => { if (owner.align) { owner.align = owner.align.slice(0, width()); if (owner.align.every((a) => a === 'start')) delete owner.align; } };
  const mutate = (change) => { env.edit(change, null); draw(); };

  function draw() {
    const columns = Array.from({ length: width() }, (_, c) => c);
    const alignRow = h('tr', { class: 'grid-editor__align', dataset: { path: `${path.replace(/rows$/, 'align')}` } },
      ...columns.map((c) => h('td', {}, selectInput({ value: owner.align?.[c] ?? 'start', options: alignSpec.options.map((v) => ({ value: v, label: ctx.t(optionLabelKey(alignSpec, v)) })), onChange: (v) => env.edit(() => setAlign(c, v), null) }),
        smallButton('✕', () => mutate(() => { rows.forEach((row) => row.splice(c, 1)); trimAlign(); }), { danger: true, aria: ctx.t('remove_column', { n: c + 1 }), disabled: width() <= 1 }))),
      h('td'));
    alignRow.querySelectorAll('select').forEach((s, c) => s.setAttribute('aria-label', ctx.t('column_align', { n: c + 1 })));
    const body = rows.map((row, r) => h('tr', { dataset: { path: `${path}[${r}]` } },
      ...row.map((cell, c) => h('td', {}, (() => {
        const input = textInput({ value: cell, dir: env.dir, lang: env.lang, onInput: (v) => env.edit(() => { rows[r][c] = v; }, `${env.block.id}:cell:${r}:${c}`) });
        input.setAttribute('aria-label', ctx.t('cell_label', { row: r + 1, column: c + 1 }));
        if (r === 0 && owner.header !== false) input.classList.add('is-head');
        return input;
      })())),
      h('td', {}, smallButton('✕', () => mutate(() => { rows.splice(r, 1); }), { danger: true, aria: ctx.t('remove_row', { n: r + 1 }), disabled: rows.length <= 1 }))));
    root.replaceChildren(
      h('p', { class: 'label' }, ctx.t(fieldLabelKey(spec))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid-editor__table' }, h('tbody', {}, alignRow, ...body))),
      h('div', { class: 'actions' },
        smallButton(`+ ${ctx.t('add_row')}`, () => mutate(() => { rows.push(Array(width()).fill('')); }), { dataset: { addRow: '1' } }),
        smallButton(`+ ${ctx.t('add_column')}`, () => mutate(() => { rows.forEach((row) => row.push('')); }), { dataset: { addColumn: '1' } })),
      h('p', { class: 'field__error', role: 'alert', hidden: true }));
  }
  draw();
  return root;
}

function refsField(env, owner, spec, path) {
  const { ctx } = env;
  const items = (owner[spec.key] ??= []);
  const content = ctx.content();
  const pages = [
    ...content.articles.filter((a) => a.id !== env.recordId).map((a) => ({ value: `article:${a.id}`, label: `${ctx.t('o_rkind_article')} — ${ctx.titleOf(a.translations)}` })),
    ...content.projects.filter((p) => p.id !== env.recordId).map((p) => ({ value: `project:${p.id}`, label: `${ctx.t('o_rkind_project')} — ${ctx.titleOf(p.translations)}` })),
  ];
  const root = h('div', { class: 'group', dataset: { path } });
  const mutate = (change) => { env.edit(change, null); draw(); };
  function draw() {
    root.replaceChildren(
      h('p', { class: 'label' }, ctx.t(fieldLabelKey(spec))),
      ...items.map((item, i) => {
        const value = item.id ? `${item.kind}:${item.id}` : '';
        const options = [{ value: '', label: ctx.t('related_choose') }, ...pages];
        if (value && !pages.some((p) => p.value === value)) options.push({ value, label: value });
        return h('div', { class: 'group__item group__item--row', dataset: { path: `${path}[${i}]` } },
          selectInput({ value, options, onChange: (v) => env.edit(() => { const [kind, id] = v.split(':'); if (RELATED_KINDS.includes(kind)) { item.kind = kind; item.id = id; } else { item.kind = 'article'; item.id = ''; } }, null) }),
          smallButton(ctx.t('delete'), () => mutate(() => { items.splice(i, 1); }), { danger: true, disabled: items.length <= (spec.minItems ?? 0) }));
      }),
      smallButton(`+ ${ctx.t('item_related')}`, () => mutate(() => { items.push({ kind: 'article', id: '' }); }), { disabled: spec.maxItems != null && items.length >= spec.maxItems, dataset: { addItem: spec.key } }));
  }
  draw();
  return root;
}
