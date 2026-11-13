// Typography tab: fonts and text sizes for one language at a time (articles can still override these in their
// own editor). Fonts come from a short curated list (src/core/fonts.mjs) so a typo can never silently load nothing.

import { applyFonts, CUSTOM, FONT_BY_ID, fontsFor, letterSpacingAllowed, matchFont, usesGoogleFonts } from '../../shared/core/fonts.mjs';
import { isLength } from '../../shared/core/layout.mjs';
import { field, h, selectInput, tabs, textInput } from '../dom.mjs';

const WEIGHTS = [400, 500, 600, 700, 800];
const LETTER_SPACING = /^(0|normal|-?[0-9]+(\.[0-9]+)?(em|px|rem))$/;

export function drawType(env) {
  const { ctx } = env;
  let lang = env.languages.some((l) => l.code === ctx.ui) ? ctx.ui : env.languages[0].code;
  const root = h('div');
  const tabHost = h('div');
  const body = h('div', { class: 'card' });

  const current = () => { const file = env.languageFile(); return { file, item: file.items.find((l) => l.code === lang) }; };
  const update = (change) => { const { file, item } = current(); item.typography = change(item.typography, item); env.writeLanguages(file); };

  function drawBody() {
    const { item } = current();
    const t = item.typography;
    const rtl = item.direction === 'rtl';
    const fontSelect = (part, label) => {
      const id = matchFont(t.fonts[part]);
      const options = fontsFor(item.direction).map((f) => ({ value: f.id, label: `${f.label} · ${f.google ? ctx.t('ap_font_google') : ctx.t('ap_font_system')}` }));
      if (id === CUSTOM) options.unshift({ value: CUSTOM, label: ctx.t('ap_font_custom') });
      else if (!options.some((o) => o.value === id)) options.unshift({ value: id, label: FONT_BY_ID[id].label });
      const select = selectInput({ value: id, options, onChange: (v) => { update((ty) => applyFonts(ty, { [part]: v })); drawBody(); } });
      select.dataset.font = part;
      return field({ label: ctx.t(label), control: select });
    };
    const lengthRow = (label, value, apply, key) => {
      const error = h('span', { class: 'inline-error', role: 'alert', hidden: true }, ctx.t('ap_length_invalid'));
      const input = textInput({ value, dir: 'ltr' }); input.dataset.type = key;
      input.addEventListener('change', () => { if (!isLength(input.value.trim())) { error.hidden = false; return; } error.hidden = true; apply(input.value.trim()); });
      return h('div', { class: 'field' }, h('label', { class: 'label' }, ctx.t(label)), input, h('span', { class: 'field__hint' }, ctx.t('ap_length_hint')), error);
    };
    const numberRow = (label, key, min, max) => {
      const input = textInput({ type: 'number', value: String(t[key]) }); input.dataset.type = key; input.step = '0.05'; input.min = String(min); input.max = String(max);
      input.addEventListener('change', () => { const n = Number(input.value); if (Number.isFinite(n) && n >= min && n <= max) update((ty) => ({ ...ty, [key]: Math.round(n * 100) / 100 })); else input.value = String(t[key]); });
      return field({ label: ctx.t(label), control: input });
    };
    const weights = [...new Set([...WEIGHTS, t.headingWeight])].sort((a, b) => a - b);
    const weight = selectInput({ value: String(t.headingWeight), options: weights.map((w) => ({ value: String(w), label: WEIGHTS.includes(w) ? `${w} · ${ctx.t(`ap_weight_${w}`)}` : String(w) })), onChange: (v) => update((ty) => ({ ...ty, headingWeight: Number(v) })) });
    weight.dataset.type = 'headingWeight';
    const spacing = textInput({ value: rtl ? '0' : t.letterSpacing, dir: 'ltr' }); spacing.dataset.type = 'letterSpacing';
    if (rtl) spacing.disabled = true;
    spacing.addEventListener('change', () => { if (LETTER_SPACING.test(spacing.value.trim()) && letterSpacingAllowed(item.direction)) update((ty) => ({ ...ty, letterSpacing: spacing.value.trim() })); else spacing.value = t.letterSpacing; });

    body.replaceChildren(
      h('h2', {}, ctx.t('ap_type')), h('p', { class: 'muted' }, ctx.t('ap_type_intro')),
      h('div', { class: 'grid2' }, fontSelect('heading', 'ap_font_heading'), fontSelect('body', 'ap_font_body')),
      h('p', { class: `chip ${usesGoogleFonts(t) ? 'chip--warn' : 'chip--ok'}`, id: 'ap-font-status' }, ctx.t(usesGoogleFonts(t) ? 'ap_fonts_google_used' : 'ap_fonts_none_google')),
      h('p', { class: 'field__hint' }, ctx.t('ap_fonts_note')),
      h('div', { class: 'grid2' },
        lengthRow('ap_base_size', t.baseSize, (v) => update((ty) => ({ ...ty, baseSize: v })), 'baseSize'),
        numberRow('ap_line_height', 'lineHeight', 1, 2.6), numberRow('ap_heading_lh', 'headingLineHeight', 1, 2),
        field({ label: ctx.t('ap_heading_weight'), control: weight }),
        field({ label: ctx.t('ap_letter_spacing'), hint: rtl ? ctx.t('ap_letter_rtl') : null, control: spacing })));
  }

  function drawTabs() {
    tabHost.replaceChildren(tabs({ items: env.languages.map((l) => ({ value: l.code, label: l.nativeName })), active: lang, onSelect: (code) => { lang = code; env.previewLang(code); drawTabs(); drawBody(); } }));
  }
  root.append(tabHost, body);
  env.previewLang(lang); drawTabs(); drawBody();
  return root;
}
