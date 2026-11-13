// Typography of this page only: four settings that sit on top of the language's typography (the other
// section of the Typography tab). They belong to the article or project record, so they apply to all of
// its translations. The preview follows because the preview draws the real page.

import { OVERRIDE_LIMITS, overrideIssues } from '../../shared/core/typography.mjs';
import { field, h, selectInput, textInput } from '../dom.mjs';

/** @param {{ ctx: object, record: object, getLang: () => string, save: () => void }} args */
export function overridePanel({ ctx, record, getLang, save }) {
  const host = h('div', { class: 'override' });
  const issuesHost = h('ul', { class: 'checks', role: 'status' });
  const el = h('section', { class: 'panel', dataset: { panel: 'override' } }, h('h3', {}, ctx.t('ov_title')), h('p', { class: 'small' }, ctx.t('ov_hint')), host, issuesHost);

  const set = (key, value) => {
    if (value === undefined) { if (record.typography) delete record.typography[key]; } else { (record.typography ??= {})[key] = value; }
    if (record.typography && !Object.keys(record.typography).length) delete record.typography;
    save();
    showIssues();
  };

  function showIssues() {
    const language = ctx.content().languages.find((l) => l.code === getLang());
    const issues = overrideIssues(record.typography, language);
    issuesHost.replaceChildren(...issues.map((i) => h('li', { class: `check-item check-item--${i.level}`, dataset: { issue: i.code } }, ctx.t(`ty_issue_${i.code}`, i.params))));
  }

  function number(key, label, { path }) {
    const { min, max, step } = OVERRIDE_LIMITS[key];
    const current = record.typography?.[key];
    const note = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const input = textInput({ type: 'number', value: current ?? '', placeholder: ctx.t('ov_default'), onInput: (raw) => {
      if (raw.trim() === '') { note.hidden = true; set(key, undefined); return; }
      const n = Number(raw);
      const whole = key === 'lineHeight' ? true : Number.isInteger(n);
      if (!Number.isFinite(n) || n < min || n > max || !whole) { note.textContent = ctx.t('ov_out_of_range', { min, max }); note.hidden = false; return; }
      note.hidden = true;
      set(key, n);
    } });
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.dir = 'ltr';
    return h('div', {}, field({ label, path, control: input, hint: ctx.t('ov_range', { min, max }), wide: true }), note);
  }

  function draw() {
    const weights = OVERRIDE_LIMITS.headingWeight.values;
    host.replaceChildren(
      number('fontScale', ctx.t('ov_size'), { path: 'typography.fontScale' }),
      number('lineHeight', ctx.t('ov_lh'), { path: 'typography.lineHeight' }),
      number('measure', ctx.t('ov_measure'), { path: 'typography.measure' }),
      field({ label: ctx.t('ov_weight'), path: 'typography.headingWeight', wide: true,
        control: selectInput({ value: String(record.typography?.headingWeight ?? ''), options: [{ value: '', label: ctx.t('ov_default') }, ...weights.map((w) => ({ value: String(w), label: String(w) }))], onChange: (v) => set('headingWeight', v === '' ? undefined : Number(v)) }) }),
      h('button', { type: 'button', class: 'button button--small', id: 'override-reset', disabled: record.typography ? null : true,
        onclick: () => { delete record.typography; save(); draw(); showIssues(); } }, ctx.t('ov_reset')));
    showIssues();
  }
  draw();

  // The reset button's state follows the record.
  const sync = () => { const b = host.querySelector('#override-reset'); if (b) b.disabled = !record.typography; };
  host.addEventListener('input', sync);
  host.addEventListener('change', sync);
  return { el, redraw: draw };
}
