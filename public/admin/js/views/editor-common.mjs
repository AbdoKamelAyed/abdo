// Pieces shared by the article, project and profile editors.

import { field as fieldHelper, h, modal, selectInput as selectHelper, textInput as textHelper } from '../dom.mjs';

/** Walk up a validation path until a field with that path exists: "a.b[2].c" -> "a.b[2]" -> "a.b" -> "a". */
function findField(root, path) {
  let current = path;
  while (current) {
    const hit = [...root.querySelectorAll('[data-path]')].find((el) => el.dataset.path === current);
    if (hit) return hit;
    const next = current.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
    if (next === current) break;
    current = next;
  }
  return null;
}

/**
 * Shows the validation problems of one content file: inline under the matching fields and as a
 * summary panel. Returns the panel plus a `repaint()` to call after the form is rebuilt.
 */
export function problemsPanel(ctx, root, rels) {
  const list = Array.isArray(rels) ? rels : [rels];
  const panel = h('section', { class: 'problems', hidden: true, 'aria-live': 'polite' });

  function repaint(validation = ctx.validation) {
    for (const el of root.querySelectorAll('.field--invalid')) el.classList.remove('field--invalid');
    for (const el of root.querySelectorAll('.field__error')) { el.hidden = true; el.textContent = ''; }
    const errors = list.flatMap((rel) => ctx.problemsFor(rel, validation).errors);
    const warnings = list.flatMap((rel) => ctx.problemsFor(rel, validation).warnings);
    panel.replaceChildren();
    panel.hidden = errors.length + warnings.length === 0;
    if (panel.hidden) return;
    if (errors.length) {
      panel.append(h('h2', {}, ctx.t('problems_title', { n: errors.length })), h('p', { class: 'muted' }, ctx.t('problems_hint')));
      panel.append(h('ul', {}, errors.map((e) => h('li', { dir: 'ltr' }, h('code', {}, e.path), ' ', e.message))));
    }
    if (warnings.length) panel.append(h('h2', {}, ctx.t('warnings_title', { n: warnings.length })), h('ul', {}, warnings.map((w) => h('li', { dir: 'ltr' }, h('code', {}, w.path), ' ', w.message))));
    for (const e of errors) {
      const el = findField(root, e.path);
      if (!el) continue;
      el.classList.add('field--invalid');
      const slot = el.querySelector(':scope > .field__error');
      if (slot) { slot.hidden = false; slot.textContent = slot.textContent ? `${slot.textContent} ${e.message}` : e.message; }
    }
  }
  const stop = ctx.onValidation(repaint);
  return { el: panel, repaint, dispose: stop };
}

/** ISO date-time <-> value for <input type="datetime-local"> (shown in the browser's time zone). */
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A date and time for people, in the interface language and the browser's time zone. */
export const whenText = (ctx, iso) => new Date(iso).toLocaleString(ctx.ui === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Scheduling for the head of a translation: a Schedule button (with its dialog) while the page is not
 * live, and the date with a Cancel button once it is scheduled. The date belongs to the whole record,
 * so it applies to every translation that is scheduled. Nothing runs at that moment: the next site
 * build after it publishes the page (see docs/publishing-workflow.md).
 * @returns {HTMLElement[]}
 */
export function scheduleControls({ ctx, record, lang, save, rerender }) {
  const tr = record.translations[lang];
  if (tr.status === 'scheduled') {
    const cancel = () => {
      tr.status = 'draft';
      if (!Object.values(record.translations).some((t) => t.status === 'scheduled')) record.status = 'draft';
      save(); rerender();
    };
    return [
      h('span', { class: 'muted small', id: 'schedule-info' }, record.publishedAt ? ctx.t('scheduled_for', { when: whenText(ctx, record.publishedAt) }) : ctx.t('scheduled_no_date')),
      h('button', { type: 'button', class: 'button button--small', id: 'schedule-cancel', onclick: cancel }, ctx.t('schedule_cancel')),
    ];
  }
  if (tr.status === 'published' || record.status === 'published') return [];
  const ask = async () => {
    const future = record.publishedAt && new Date(record.publishedAt) > new Date() ? record.publishedAt : null;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    let value = isoToLocalInput(future ?? tomorrow.toISOString());
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const input = textHelper({ type: 'datetime-local', value, onInput: (v) => { value = v; } });
    input.id = 'schedule-when';
    const iso = await modal({
      title: ctx.t('schedule_title'),
      body: h('div', {}, h('p', { class: 'muted' }, ctx.t('schedule_hint')), fieldHelper({ label: ctx.t('schedule_when'), control: input, wide: true }), err),
      actions: (close) => [
        h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
        h('button', { type: 'button', class: 'button button--primary', id: 'schedule-confirm', onclick: () => {
          const picked = localInputToIso(value);
          if (!picked || new Date(picked) <= new Date(Date.now() + 60_000)) { err.textContent = ctx.t('schedule_in_past'); err.hidden = false; return; }
          close(picked);
        } }, ctx.t('schedule_confirm')),
      ],
    });
    if (!iso) return;
    record.status = 'scheduled'; record.publishedAt = iso; tr.status = 'scheduled';
    save(); rerender();
  };
  return [h('button', { type: 'button', class: 'button button--small', id: 'schedule-translation', onclick: ask }, ctx.t('schedule_button'))];
}

export const setOpt = (obj, key, value) => { if (value === '' || value == null || (Array.isArray(value) && value.length === 0)) delete obj[key]; else obj[key] = value; };

export const STATUSES = ['idea', 'outline', 'draft', 'editing', 'fact-checking', 'ready', 'scheduled', 'published', 'archived'];

export function statusOptions(ctx) { return STATUSES.map((s) => ({ value: s, label: ctx.t(`status_${s}`) })); }

/** Options for choosing images: active image assets, labelled with their file and alt text. */
export function mediaOptions(ctx, { allowNone = true } = {}) {
  const items = ctx.content().media.filter((m) => m.type === 'image' && m.status === 'active');
  return [...(allowNone ? [{ value: '', label: ctx.t('none') }] : []), ...items.map((m) => ({ value: m.id, label: `${m.file} — ${m.alt[ctx.ui] ?? Object.values(m.alt)[0] ?? ''}`.slice(0, 90) }))];
}

export function topicOptions(ctx) {
  return ctx.content().topics.filter((t) => t.status === 'published' && t.visibility === 'public').map((t) => ({ value: t.id, label: ctx.titleOf(t.translations, 'name') }));
}
export function tagOptions(ctx) {
  return ctx.content().tags.filter((t) => t.status === 'published').map((t) => ({ value: t.id, label: ctx.titleOf(t.translations, 'name') }));
}

/** Editable list of links ({ label, url } and, for the profile, a `kind`). Edits `links` in place. */
export function linksEditor({ ctx, links, pathBase, onChange, withKind = false, dir }) {
  const root = h('div', { class: 'links', dataset: { path: pathBase } });
  const draw = () => {
    root.replaceChildren();
    links.forEach((link, i) => {
      const path = `${pathBase}[${i}]`;
      root.append(h('div', { class: 'linkrow', dataset: { path } },
        withKind ? fieldHelper({ label: ctx.t('link_kind'), path: `${path}.kind`, control: selectHelper({ value: link.kind, options: ['email', 'social', 'website'].map((k) => ({ value: k, label: ctx.t(`kind_${k}`) })), onChange: (v) => { link.kind = v; onChange(); } }) }) : null,
        fieldHelper({ label: ctx.t('link_label'), path: `${path}.label`, control: textHelper({ value: link.label, dir, onInput: (v) => { link.label = v; onChange(); } }) }),
        fieldHelper({ label: ctx.t('link_url'), path: `${path}.url`, control: textHelper({ value: link.url, dir: 'ltr', onInput: (v) => { link.url = v.trim(); onChange(); } }) }),
        h('button', { type: 'button', class: 'button button--small button--danger', onclick: () => { links.splice(i, 1); onChange(); draw(); } }, ctx.t('delete'))));
    });
    root.append(h('button', { type: 'button', class: 'button button--small', dataset: { addLink: '1' }, onclick: () => { links.push(withKind ? { kind: 'website', label: '', url: '' } : { label: '', url: '' }); onChange(); draw(); } }, ctx.t('add_link')));
  };
  draw();
  return root;
}
