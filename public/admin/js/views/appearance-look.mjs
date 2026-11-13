// "Look" tab: presets (shipped and the owner's own), colours per theme and per language, a live readability
// check with one-click fixes, and shapes and spacing. All rules live in src/core/design-ops.mjs and
// src/core/contrast.mjs; this file only draws them.

import { isHex, repairedColor } from '../../shared/core/contrast.mjs';
import {
  applyPreset, CARD_SHADOWS, COLOR_GROUPS, contrastReport, deleteBlocker, deletePreset, effectiveTokens, MODES, overrideCount,
  presetFromCurrent, renamePreset, resetColors, setColor, setShared,
} from '../../shared/core/design-ops.mjs';
import { isLength } from '../../shared/core/layout.mjs';
import { confirmDialog, field, h, modal, selectInput, textInput, toast } from '../dom.mjs';

const SHAPES = [['radius', 'ap_radius'], ['radiusLarge', 'ap_radius_large'], ['sectionSpacing', 'ap_section_spacing'], ['gutter', 'ap_gutter']];

export function drawLook(env) {
  const { ctx } = env;
  let scope = null; // null = all languages, otherwise a language code
  const root = h('div');
  const presetsHost = h('section', { class: 'card', id: 'ap-presets' });
  const colorsHost = h('section', { class: 'card', id: 'ap-colors' });
  const contrastHost = h('section', { class: 'card', id: 'ap-contrast', 'aria-live': 'polite' });
  const shapesHost = h('section', { class: 'card', id: 'ap-shapes' });
  const nameOf = (p) => p.name[ctx.ui] ?? p.name.en;
  const apply = (design) => { env.writeDesign(design); };

  // ------------------------------------------------------------ presets

  function swatches(tokens) {
    const strip = h('span', { class: 'swatches', 'aria-hidden': 'true' });
    for (const key of ['bg', 'surface', 'text', 'accent']) { const s = h('span', { class: 'swatch' }); s.style.background = tokens[key]; strip.append(s); }
    return strip;
  }

  /** Ask for a preset's name in both languages. Resolves to { ar, en } or null. */
  async function nameDialog({ title, ar = '', en = '' }) {
    const arInput = textInput({ value: ar, dir: 'rtl', lang: 'ar', maxLength: 60 });
    const enInput = textInput({ value: en, dir: 'ltr', lang: 'en', maxLength: 60 });
    arInput.id = 'preset-name-ar'; enInput.id = 'preset-name-en';
    const error = h('p', { class: 'field__error', role: 'alert', hidden: true }, ctx.t('ap_name_required'));
    return modal({
      title, dir: ctx.dir(),
      body: h('div', {}, field({ label: ctx.t('ap_preset_name_ar'), control: arInput }), field({ label: ctx.t('ap_preset_name_en'), control: enInput }), error),
      actions: (close) => [
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
        h('button', { type: 'button', class: 'button button--primary', id: 'preset-name-save', onclick: () => {
          if (!arInput.value.trim() && !enInput.value.trim()) { error.hidden = false; return; }
          close({ ar: arInput.value, en: enInput.value });
        } }, ctx.t('save')),
      ],
    });
  }

  function drawPresets() {
    const design = env.design(); const presets = env.presets();
    const counts = overrideCount(design);
    const cards = presets.map((p) => {
      const active = design.preset === p.key;
      const card = h('article', { class: `preset${active ? ' is-active' : ''}`, dataset: { presetKey: p.key } },
        h('div', { class: 'preset__swatches' }, swatches(p.tokens.light), swatches(p.tokens.dark)),
        h('strong', {}, nameOf(p)),
        h('div', { class: 'preset__chips' }, active ? h('span', { class: 'chip chip--ok' }, ctx.t('ap_in_use')) : '', p.custom ? h('span', { class: 'chip' }, ctx.t('ap_yours')) : ''),
        h('div', { class: 'actions' },
          active ? '' : h('button', { type: 'button', class: 'button button--small', dataset: { presetUse: p.key }, onclick: () => { apply(applyPreset(env.design(), env.presets(), p.key)); env.redraw(); } }, ctx.t('ap_use')),
          p.custom ? h('button', { type: 'button', class: 'button button--small', dataset: { presetRename: p.key }, onclick: async () => {
            const name = await nameDialog({ title: ctx.t('ap_rename'), ar: p.name.ar, en: p.name.en });
            if (name) { env.writePresets(renamePreset(env.presets(), p.key, name)); env.redraw(); }
          } }, ctx.t('ap_rename')) : '',
          p.custom ? h('button', { type: 'button', class: 'button button--small button--danger', dataset: { presetDelete: p.key }, onclick: async () => {
            const why = deleteBlocker(env.presets(), p.key, env.design());
            if (why === 'active') { toast(ctx.t('ap_cannot_delete_active'), 'error'); return; }
            if (!(await confirmDialog({ title: ctx.t('ap_delete_preset_title'), message: ctx.t('ap_delete_preset_message', { name: nameOf(p) }), confirmLabel: ctx.t('ap_delete'), cancelLabel: ctx.t('cancel'), danger: true }))) return;
            env.writePresets(deletePreset(env.presets(), p.key, env.design())); env.redraw();
          } }, ctx.t('ap_delete')) : ''));
      return card;
    });
    const hasChanges = counts.site + Object.values(counts.languages).reduce((a, b) => a + b, 0) > 0;
    presetsHost.replaceChildren(
      h('h2', {}, ctx.t('ap_presets')), h('p', { class: 'muted' }, ctx.t('ap_presets_hint')),
      h('div', { class: 'presets' }, cards),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'button button--primary', id: 'ap-save-preset', onclick: async () => {
          const name = await nameDialog({ title: ctx.t('ap_save_preset') });
          if (!name) return;
          const list = env.presets();
          env.writePresets([...list, presetFromCurrent(env.design(), list, name, list.map((p) => p.id))]);
          env.redraw();
        } }, ctx.t('ap_save_preset')),
        h('button', { type: 'button', class: 'button', id: 'ap-clear-colours', disabled: hasChanges ? null : true, onclick: async () => {
          const language = scope ? ctx.langName(scope) : null;
          const ok = await confirmDialog({ title: ctx.t('ap_clear_title'), message: scope ? ctx.t('ap_clear_language_message', { lang: language }) : ctx.t('ap_clear_message'), confirmLabel: ctx.t('ap_clear_changes'), cancelLabel: ctx.t('cancel') });
          if (!ok) return;
          apply(resetColors(env.design(), { lang: scope })); env.redraw();
        } }, ctx.t('ap_clear_changes'))),
      h('p', { class: 'field__hint' }, ctx.t('ap_save_preset_hint')));
  }

  // ------------------------------------------------------------ colours

  function colorRow(mode, key) {
    const design = env.design(); const presets = env.presets();
    const value = effectiveTokens(design, presets, scope)[mode][key];
    const own = (scope ? design.languageOverrides?.[scope]?.[mode] : design.overrides?.[mode]) ?? {};
    const picker = h('input', { type: 'color', value, 'aria-label': `${ctx.t(`col_${key}`)} (${ctx.t(mode === 'light' ? 'ap_light' : 'ap_dark')})`, dataset: { color: `${mode}.${key}` } });
    const hex = h('input', { type: 'text', value, maxlength: '7', dir: 'ltr', spellcheck: 'false', autocomplete: 'off', 'aria-label': ctx.t('ap_hex'), dataset: { hex: `${mode}.${key}` } });
    const error = h('span', { class: 'inline-error', role: 'alert', hidden: true }, ctx.t('ap_bad_hex'));
    const reset = h('button', { type: 'button', class: 'button button--small', hidden: key in own ? null : true, dataset: { colorReset: `${mode}.${key}` }, onclick: () => { apply(setColor(env.design(), env.presets(), { lang: scope, mode, key, value: null })); drawColors(); drawContrast(); } }, ctx.t('ap_reset'));
    const commit = (next) => {
      apply(setColor(env.design(), env.presets(), { lang: scope, mode, key, value: next }));
      const d = env.design();
      const nowOwn = (scope ? d.languageOverrides?.[scope]?.[mode] : d.overrides?.[mode]) ?? {};
      reset.hidden = !(key in nowOwn);
      drawContrast(); drawPresetsLater();
    };
    picker.addEventListener('input', () => { hex.value = picker.value; error.hidden = true; commit(picker.value); });
    hex.addEventListener('change', () => {
      const text = hex.value.trim().replace(/^#?/, '#').toLowerCase();
      if (!isHex(text)) { error.hidden = false; hex.value = picker.value; return; }
      error.hidden = true; hex.value = text; picker.value = text; commit(text);
    });
    return h('div', { class: 'colorrow', dataset: { colorKey: key } }, h('label', {}, ctx.t(`col_${key}`)), h('div', { class: 'colorrow__inputs' }, picker, hex, reset), error);
  }

  let presetsTimer;
  const drawPresetsLater = () => { clearTimeout(presetsTimer); presetsTimer = setTimeout(drawPresets, 400); }; // the "clear changes" button follows the changes

  function drawColors() {
    const languages = env.languages;
    const scopeSelect = selectInput({ value: scope ?? '', options: [{ value: '', label: ctx.t('ap_scope_all') }, ...languages.map((l) => ({ value: l.code, label: l.nativeName }))], onChange: (v) => { scope = v || null; if (scope) env.previewLang(scope); drawColors(); drawContrast(); drawPresets(); } });
    scopeSelect.dataset.scope = 'colours';
    colorsHost.replaceChildren(
      h('h2', {}, ctx.t('ap_colors')),
      field({ label: ctx.t('ap_scope'), control: scopeSelect }),
      scope ? h('p', { class: 'field__hint' }, ctx.t('ap_scope_note', { lang: ctx.langName(scope) })) : '',
      h('div', { class: 'grid2' }, MODES.map((mode) => h('div', { class: 'colormode', dataset: { mode } },
        h('h3', {}, ctx.t(mode === 'light' ? 'ap_light' : 'ap_dark')),
        COLOR_GROUPS.map((g) => h('div', { class: 'colorgroup' }, h('h4', {}, ctx.t(`ap_group_${g.id}`)), g.keys.map((key) => colorRow(mode, key))))))));
  }

  // ------------------------------------------------------------ readability

  function fixOne(row) {
    const design = env.design(); const presets = env.presets();
    const tokens = effectiveTokens(design, presets, row.lang)[row.mode];
    const value = repairedColor(tokens, row.fg);
    return setColor(design, presets, { lang: row.lang, mode: row.mode, key: row.fg, value });
  }

  function drawContrast() {
    const rows = contrastReport(env.design(), env.presets(), env.languages);
    const list = rows.length ? h('ul', { class: 'contrast' }, rows.map((row) => h('li', { class: `contrast__row contrast__row--${row.level}`, dataset: { contrast: `${row.lang ?? 'all'}.${row.mode}.${row.fg}.${row.bg}` } },
      h('span', { class: `chip chip--${row.level === 'error' ? 'bad' : 'warn'}` }, ctx.t(`ap_level_${row.level}`)), ' ',
      h('span', {}, `${ctx.t(row.mode === 'light' ? 'ap_light' : 'ap_dark')}${row.lang ? ` ${ctx.t('ap_scope_in', { lang: ctx.langName(row.lang) })}` : ''} — ${ctx.t('ap_contrast_row', { where: ctx.t(`ap_where_${row.where}`), ratio: row.ratio.toFixed(2), min: row.min })}`),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'button button--small', dataset: { contrastFix: `${row.mode}.${row.fg}` }, onclick: () => { apply(fixOne(row)); drawColors(); drawContrast(); drawPresets(); } }, ctx.t('ap_fix'))))) : h('p', { class: 'chip chip--ok', id: 'ap-contrast-ok' }, ctx.t('ap_contrast_ok'));
    contrastHost.replaceChildren(
      h('h2', {}, ctx.t('ap_contrast')), h('p', { class: 'muted small' }, ctx.t('ap_contrast_hint')), list,
      rows.length > 1 ? h('button', { type: 'button', class: 'button', id: 'ap-fix-all', onclick: () => {
        for (let pass = 0; pass < 8; pass += 1) {
          const next = contrastReport(env.design(), env.presets(), env.languages);
          if (!next.length) break;
          apply(fixOne(next[0]));
        }
        drawColors(); drawContrast(); drawPresets();
      } }, ctx.t('ap_fix_all')) : '');
  }

  // ------------------------------------------------------------ shapes

  function drawShapes() {
    const design = env.design(); const presets = env.presets();
    const shared = effectiveTokens(design, presets).shared;
    const own = design.overrides?.shared ?? {};
    const rows = SHAPES.map(([key, label]) => {
      const error = h('span', { class: 'inline-error', role: 'alert', hidden: true }, ctx.t('ap_length_invalid'));
      const input = textInput({ value: shared[key], dir: 'ltr', onInput: () => {} });
      input.dataset.shape = key;
      input.addEventListener('change', () => {
        const text = input.value.trim();
        if (!isLength(text)) { error.hidden = false; return; }
        error.hidden = true; apply(setShared(env.design(), env.presets(), key, text));
      });
      return h('div', { class: 'field' }, h('label', { class: 'label' }, ctx.t(label), key in own ? ` (${ctx.t('ap_changed')})` : ''), input, h('span', { class: 'field__hint' }, ctx.t('ap_length_hint')), error);
    });
    shapesHost.replaceChildren(
      h('h2', {}, ctx.t('ap_shapes')),
      h('div', { class: 'grid2' }, rows,
        field({ label: ctx.t('ap_card_shadow'), control: selectInput({ value: shared.cardShadow ?? 'none', options: CARD_SHADOWS.map((s) => ({ value: s, label: ctx.t(`ap_shadow_${s}`) })), onChange: (v) => apply(setShared(env.design(), env.presets(), 'cardShadow', v)) }) }),
        field({ label: ctx.t('ap_animation'), control: selectInput({ value: design.animation, options: ['none', 'subtle', 'full'].map((m) => ({ value: m, label: ctx.t(`ap_motion_${m}`) })), onChange: (v) => { const d = env.design(); d.animation = v; apply(d); } }) })));
  }

  drawPresets(); drawColors(); drawContrast(); drawShapes();
  root.append(presetsHost, colorsHost, contrastHost, shapesHost);
  return root;
}
