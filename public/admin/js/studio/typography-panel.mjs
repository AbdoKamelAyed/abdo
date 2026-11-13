// Typography Studio: the reading typography of one language (fonts, sizes, spacing, column width),
// edited in config/languages.json with the live preview showing the effect on the article being written.
// These settings belong to the language, not to the article: they change every page in that language.

import { applyPreset, currentPreset, presetsFor, typographyIssues } from '../../shared/core/typography.mjs';
import { confirmDialog, field, h, selectInput, textInput } from '../dom.mjs';

const REL = 'config/languages.json';
const WEIGHTS = [400, 500, 600, 700, 800];

/** @param {{ ctx: object, getLang: () => string, onChange: () => void }} args */
export function typographyPanel({ ctx, getLang, onChange }) {
  const host = h('div', { class: 'typography' });
  const problems = h('ul', { class: 'checks', role: 'status' });
  const el = section(ctx, host, problems);

  const file = () => ctx.workspace.read(REL);
  const languageOf = (data) => data.items.find((l) => l.code === getLang());
  let revertButton = null;
  const syncRevert = () => { if (revertButton) revertButton.disabled = !ctx.workspace.staged.has(REL); };
  const commit = (data) => { ctx.workspace.write(REL, data); ctx.changed(); onChange(); showProblems(); syncRevert(); };

  /** Run `change(language)` on a fresh copy of the file and save it. Edits to text boxes do not redraw the form. */
  function edit(change, { redraw = false } = {}) {
    const data = file();
    const language = languageOf(data);
    if (!language) return;
    change(language);
    commit(data);
    if (redraw) draw(); else showIssues(language);
  }

  const issuesHost = h('div');
  function showIssues(language) {
    const issues = typographyIssues(language);
    issuesHost.replaceChildren(h('h4', {}, ctx.t('ty_advice')), issues.length
      ? h('ul', { class: 'checks' }, issues.map((i) => { const key = `ty_issue_${i.code}`; return h('li', { class: `check-item check-item--${i.level}`, dataset: { issue: i.code } }, ctx.t(key, i.params)); }))
      : h('p', { class: 'muted' }, ctx.t('ty_no_issues')));
  }

  function showProblems() {
    const errors = ctx.problemsFor(REL).errors;
    problems.replaceChildren(...errors.map((e) => h('li', { class: 'check-item check-item--warn', dir: 'ltr' }, h('code', {}, e.path), ' ', e.message)));
  }

  function draw() {
    const data = file();
    const language = languageOf(data);
    if (!language) { host.replaceChildren(h('p', { class: 'muted' }, ctx.t('ty_no_language'))); return; }
    const ty = language.typography;
    const rtl = language.direction === 'rtl';
    const preset = currentPreset(language);
    const text = (label, value, apply, { dir = 'ltr', hint, disabled = false, type = 'text', path } = {}) => {
      const input = textInput({ value, dir, type, onInput: (v) => edit((l) => apply(l, v.trim())) });
      if (disabled) input.disabled = true;
      if (type === 'number') { input.step = '0.05'; }
      return field({ label, hint, path, control: input, wide: true });
    };
    host.replaceChildren(
      h('p', { class: 'small' }, ctx.t('ty_scope', { language: ctx.langName(language.code) })),
      field({ label: ctx.t('ty_pairing'), wide: true, control: selectInput({
        value: preset ?? '', options: [...(preset ? [] : [{ value: '', label: ctx.t('ty_custom') }]), ...presetsFor(language).map((p) => ({ value: p.id, label: p.name[ctx.ui] ?? p.name.en }))],
        onChange: (id) => { if (id) edit((l) => { l.typography = applyPreset(l.typography, id); }, { redraw: true }); },
      }), hint: ctx.t('ty_pairing_hint') }),
      text(ctx.t('ty_heading_font'), ty.fonts.heading, (l, v) => { l.typography.fonts.heading = v; }),
      text(ctx.t('ty_body_font'), ty.fonts.body, (l, v) => { l.typography.fonts.body = v; }),
      text(ctx.t('ty_mono_font'), ty.fonts.mono ?? '', (l, v) => { if (v) l.typography.fonts.mono = v; else delete l.typography.fonts.mono; }),
      field({ label: ctx.t('ty_google'), hint: ctx.t('ty_google_hint'), wide: true, control: (() => { const area = textInput({ value: ty.googleFonts.join('\n'), dir: 'ltr', multiline: true, rows: 3, onInput: (v) => edit((l) => { l.typography.googleFonts = v.split('\n').map((s) => s.trim()).filter(Boolean); }) }); area.spellcheck = false; return area; })() }),
      h('div', { class: 'ty-grid' },
        text(ctx.t('ty_size'), ty.baseSize, (l, v) => { l.typography.baseSize = v; }),
        text(ctx.t('ty_line'), String(ty.lineHeight), (l, v) => { const n = Number(v); if (v !== '' && Number.isFinite(n)) l.typography.lineHeight = n; }, { type: 'number' }),
        text(ctx.t('ty_heading_line'), String(ty.headingLineHeight), (l, v) => { const n = Number(v); if (v !== '' && Number.isFinite(n)) l.typography.headingLineHeight = n; }, { type: 'number' }),
        text(ctx.t('ty_letter'), ty.letterSpacing, (l, v) => { l.typography.letterSpacing = v; }, { disabled: rtl, hint: rtl ? ctx.t('ty_letter_rtl') : undefined }),
        field({ label: ctx.t('ty_weight'), control: selectInput({ value: String(ty.headingWeight), options: WEIGHTS.map((w) => ({ value: String(w), label: String(w) })), onChange: (v) => edit((l) => { l.typography.headingWeight = Number(v); }) }) }),
        text(ctx.t('ty_measure'), language.layout.measure, (l, v) => { l.layout.measure = v; }, { hint: ctx.t('ty_measure_hint') }),
        text(ctx.t('ty_width'), language.layout.contentWidth, (l, v) => { l.layout.contentWidth = v; })),
      issuesHost,
      (revertButton = h('button', { type: 'button', class: 'button button--small', id: 'typography-revert', disabled: ctx.workspace.staged.has(REL) ? null : true, onclick: async () => {
        const ok = await confirmDialog({ title: ctx.t('ty_revert'), message: ctx.t('ty_revert_confirm'), confirmLabel: ctx.t('ty_revert'), cancelLabel: ctx.t('cancel'), danger: true });
        if (!ok) return;
        ctx.workspace.discard(REL); ctx.changed(); ctx.revalidate(); onChange(); draw();
      } }, ctx.t('ty_revert'))));
    showIssues(language);
  }

  draw(); showProblems();
  return { el, refresh: showProblems, onLanguageChange: () => { draw(); showProblems(); } };
}

function section(ctx, host, problems) {
  return h('section', { class: 'panel', dataset: { panel: 'typography' } }, h('h3', {}, ctx.t('panel_typography')), host, problems);
}

