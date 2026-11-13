// Pieces shared by the Topic Manager and the Tag Manager: the icon drawn as DOM nodes, staging an operation's
// result, the fields every topic and tag translation has, the bulk-edit bar and the "choose the one to keep" dialog.

import { ICONS } from '../../shared/core/icons.mjs';
import { isValidSlug } from '../../shared/core/slugify.mjs';
import { freeSlug, setSlug } from '../../shared/core/taxonomy-ops.mjs';
import { stageResult } from '../../shared/core/taxonomy-stage.mjs';
import { chip, field, h, linesInput, modal, selectInput, textInput, toast } from '../dom.mjs';
import { setOpt } from './editor-common.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One of the built-in topic icons as an SVG element (built node by node: the admin never parses markup). */
export function iconNode(key, size = 18) {
  const data = ICONS[key];
  if (!data) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'icon' };
  for (const [name, value] of Object.entries(attrs)) svg.setAttribute(name, String(value));
  data.split(' M').forEach((part, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', i === 0 ? part : `M${part}`);
    svg.append(path);
  });
  return svg;
}

/** The content as it is right now (the usual copy can be up to a moment behind the last keystroke). */
export function fresh(ctx) {
  ctx.revalidate();
  return ctx.content();
}

/** Put an operation's result into the workspace and bring the screen's view of the content up to date. */
export function stage(ctx, result) {
  stageResult(ctx.workspace, result);
  ctx.changed();
  ctx.revalidate();
}

/** `status=published`, `visibility=private`, `featured=true` -> a bulk-edit patch. */
export function patchOf(value) {
  const [key, raw] = value.split('=');
  return { [key]: raw === 'true' ? true : raw === 'false' ? false : raw };
}

export const nameOf = (ctx, record) => ctx.titleOf(record.translations, 'name');

/** Items (articles and projects) that carry a topic or tag id in the given field. */
export function itemsUsing(content, field, id) {
  const pick = (items, kind) => items.filter((i) => (i[field] ?? []).includes(id)).map((record) => ({ kind, record }));
  return [...pick(content.articles, 'article'), ...pick(content.projects, 'project')];
}

/** A short "what happened" note after a merge: how many things could not be carried over. */
export function noteToast(ctx, notes) {
  if (notes?.length) toast(ctx.t('tx_notes', { n: notes.length }), 'info');
}

export function usageText(ctx, row) {
  return ctx.t('tx_usage', { published: row.published, total: row.total });
}

export function statusChips(ctx, record) {
  return [
    chip(ctx.t(`status_${record.status}`), record.status === 'published' ? 'ok' : ''),
    (record.visibility ?? 'public') === 'private' ? chip(ctx.t('visibility_private_short'), 'warn') : null,
    record.featured ? chip(ctx.t('featured')) : null,
  ];
}

/**
 * The fields every topic and tag translation has. Edits the record in `file.items` in place.
 * @param {{ ctx: object, kind: 'topic'|'tag', file: { items: object[] }, id: string, lang: string, pathBase: string, save: () => void, redraw: () => void }} o
 */
export function translationFields({ ctx, kind, file, id, lang, pathBase, save, redraw }) {
  const isTopic = kind === 'topic';
  const rec = () => file.items.find((r) => r.id === id);
  const tr = () => rec().translations[lang];
  const dir = ctx.langDir(lang);
  const base = `${pathBase}.translations.${lang}`;

  const slugError = h('p', { class: 'inline-error', role: 'alert', hidden: true });
  const commitSlug = (value) => {
    const slug = value.trim();
    if (slug === tr().slug) { slugError.hidden = true; return; }
    if (!isValidSlug(slug)) { slugError.textContent = ctx.t('tx_slug_invalid'); slugError.hidden = false; slugInput.value = tr().slug; return; }
    slugError.hidden = true;
    file.items[file.items.indexOf(rec())] = setSlug(rec(), lang, slug);
    save(); redraw();
  };
  const slugInput = textInput({ value: tr().slug, dir, lang });
  slugInput.dataset.slugInput = lang;
  slugInput.addEventListener('change', () => commitSlug(slugInput.value));

  const redirects = tr().redirectSlugs ?? [];
  const redirectList = h('div', { class: 'redirects' }, redirects.length
    ? redirects.map((slug) => h('span', { class: 'chip redirect', dir: 'ltr' }, slug, ' ', h('button', {
      type: 'button', class: 'linklike', dataset: { removeRedirect: slug }, 'aria-label': ctx.t('tx_redirect_remove', { slug }), title: ctx.t('tx_redirect_remove', { slug }),
      onclick: () => { setOpt(tr(), 'redirectSlugs', redirects.filter((s) => s !== slug)); save(); redraw(); },
    }, '×')))
    : h('span', { class: 'muted small' }, ctx.t('tx_redirects_none')));

  const seo = () => tr().seo ?? {};
  const setSeo = (key, v) => { tr().seo = { ...(tr().seo ?? {}) }; setOpt(tr().seo, key, v); if (!Object.keys(tr().seo).length) delete tr().seo; save(); };

  return [
    field({ label: ctx.t('field_name'), path: `${base}.name`, wide: true, control: textInput({ value: tr().name, dir, lang, maxLength: isTopic ? 80 : 60, onInput: (v) => { tr().name = v; save(); } }) }),
    h('div', { class: 'slugrow' },
      field({ label: ctx.t('slug'), path: `${base}.slug`, hint: ctx.t('tx_slug_hint'), control: slugInput, wide: true }),
      h('button', { type: 'button', class: 'button button--small', dataset: { slugFromName: '1' }, onclick: () => commitSlug(freeSlug(file.items, lang, tr().name, id)) }, ctx.t('tx_slug_from_name'))),
    slugError,
    h('div', { class: 'field field--wide' }, h('span', { class: 'label' }, ctx.t('tx_redirects')), redirectList, h('p', { class: 'field__hint' }, ctx.t('tx_redirects_hint'))),
    field({ label: ctx.t(isTopic ? 'field_description' : 'tg_field_description'), path: `${base}.description`, wide: true, control: textInput({ value: tr().description ?? '', dir, lang, multiline: true, rows: 3, maxLength: 400, onInput: (v) => { if (isTopic) tr().description = v; else setOpt(tr(), 'description', v); save(); } }) }),
    isTopic ? null : field({ label: ctx.t('tg_aliases'), path: `${base}.aliases`, hint: ctx.t('tg_aliases_hint'), wide: true, control: linesInput({ value: tr().aliases ?? [], dir, rows: 3, onInput: (list) => { setOpt(tr(), 'aliases', list); save(); } }) }),
    field({ label: ctx.t('tx_synonyms'), path: `${base}.synonyms`, hint: ctx.t(isTopic ? 'tp_synonyms_hint' : 'tg_synonyms_hint'), wide: true, control: linesInput({ value: tr().synonyms ?? [], dir, rows: 3, onInput: (list) => { setOpt(tr(), 'synonyms', list); save(); } }) }),
    h('details', { class: 'seo' }, h('summary', {}, ctx.t('seo_overrides')),
      field({ label: ctx.t('seo_title'), path: `${base}.seo.title`, wide: true, control: textInput({ value: seo().title ?? '', dir, maxLength: 120, onInput: (v) => setSeo('title', v) }) }),
      field({ label: ctx.t('seo_description'), path: `${base}.seo.description`, wide: true, control: textInput({ value: seo().description ?? '', dir, multiline: true, rows: 2, maxLength: 300, onInput: (v) => setSeo('description', v) }) }),
      field({ label: ctx.t('seo_robots'), path: `${base}.seo.robots`, control: selectInput({ value: seo().robots ?? '', options: [{ value: '', label: ctx.t('default') }, { value: 'index', label: 'index' }, { value: 'noindex', label: 'noindex' }], onChange: (v) => setSeo('robots', v) }) })),
  ].filter(Boolean);
}

/**
 * The bar that appears while rows are ticked: one change applied to all of them, and screen-specific extras.
 * @param {{ ctx: object, selected: Set<string>, options: { value: string, label: string }[], onApply: (value: string) => void, onClear: () => void, extras?: () => (Node|null)[] }} o
 */
export function bulkBar({ ctx, selected, options, onApply, onClear, extras = () => [] }) {
  const count = h('strong', { 'aria-live': 'polite' });
  const select = selectInput({ value: '', options: [{ value: '', label: ctx.t('tx_bulk_choose') }, ...options] });
  select.setAttribute('aria-label', ctx.t('tx_bulk_choose'));
  select.dataset.bulkChange = '1';
  const extraHost = h('span', { class: 'bulk__extra' });
  const el = h('div', { class: 'bulk', role: 'region', 'aria-label': ctx.t('tx_bulk') },
    count, select,
    h('button', { type: 'button', class: 'button button--small button--primary', dataset: { bulkApply: '1' }, onclick: () => { if (select.value) { onApply(select.value); select.value = ''; } } }, ctx.t('tx_bulk_apply')),
    extraHost,
    h('button', { type: 'button', class: 'button button--small', dataset: { bulkClear: '1' }, onclick: onClear }, ctx.t('tx_bulk_clear')));
  function update() {
    el.hidden = selected.size === 0;
    count.textContent = ctx.t('tx_selected', { n: selected.size });
    extraHost.replaceChildren(...extras().filter(Boolean));
  }
  update();
  return { el, update };
}

/**
 * Ask which of several records to keep (merging) or which to move things into. Resolves with the chosen id, or null.
 * @param {{ ctx: object, title: string, message: string, label: string, options: { value: string, label: string }[], value?: string, confirmLabel: string, detail?: Node|null }} o
 */
export function chooseTarget({ ctx, title, message, label, options, value, confirmLabel, detail = null }) {
  let chosen = value ?? options[0]?.value ?? '';
  return modal({
    title,
    body: h('div', {}, h('p', {}, message), field({ label, wide: true, control: (() => { const s = selectInput({ value: chosen, options, onChange: (v) => { chosen = v; } }); s.id = 'choose-target'; return s; })() }), detail),
    actions: (close) => [
      h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
      h('button', { type: 'button', class: 'button button--primary', id: 'choose-confirm', onclick: () => close(chosen || null) }, confirmLabel),
    ],
  });
}

/** A list of articles and projects with links to their editors. */
export function usedByList(ctx, entries) {
  if (!entries.length) return h('p', { class: 'muted small' }, ctx.t('tx_used_none'));
  return h('ul', { class: 'plain usedby' }, entries.map(({ kind, record }) => h('li', {},
    h('a', { href: `#/${kind === 'article' ? 'articles' : 'projects'}/${record.id}` }, ctx.titleOf(record.translations)),
    ' ', chip(ctx.t(kind === 'article' ? 'tx_kind_article' : 'tx_kind_project')),
    record.status === 'published' ? null : [' ', chip(ctx.t(`status_${record.status}`))])));
}
