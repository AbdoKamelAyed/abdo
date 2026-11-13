// Glass Mode tab: independent of the colour theme; light and dark are set separately.

import { HERO_MIN_OPACITY } from '../../shared/lib/theme.mjs';
import { CARD_SHADOWS } from '../../shared/core/design-ops.mjs';
import { isHex } from '../../shared/core/contrast.mjs';
import { checkInput, field, h, selectInput, textInput } from '../dom.mjs';

const ELEMENTS = ['header', 'menu', 'cards', 'hero', 'footer'];
const DEFAULT_MODE = { blur: 18, opacity: 68 };

export function drawGlass(env) {
  const { ctx } = env;
  const design = env.design();
  const glass = design.glass;
  const save = () => env.writeDesign(design);
  const root = h('div');

  const modeCard = (mode) => {
    const g = glass[mode];
    const number = (key, min, max) => {
      const input = textInput({ type: 'number', value: String(g[key]), onInput: (v) => { const n = Math.round(Number(v)); if (v !== '' && Number.isFinite(n)) { g[key] = Math.max(min, Math.min(max, n)); save(); } } });
      // Typing is left alone; when the person leaves the field it shows the value that was kept.
      input.addEventListener('change', () => { input.value = String(g[key]); });
      return input;
    };
    const blur = number('blur', 0, 60); blur.dataset.glass = `${mode}.blur`; blur.min = '0'; blur.max = '60';
    const opacity = number('opacity', 0, 100); opacity.dataset.glass = `${mode}.opacity`; opacity.min = '0'; opacity.max = '100';
    const surface = h('input', { type: 'color', value: g.surface ?? '#ffffff', 'aria-label': ctx.t('ap_surface'), dataset: { glass: `${mode}.surface` } });
    surface.disabled = g.surface === undefined;
    surface.addEventListener('input', () => { if (isHex(surface.value)) { g.surface = surface.value; save(); } });
    const useDefault = checkInput({ label: ctx.t('ap_surface_default'), checked: g.surface === undefined, onChange: (v) => { if (v) { delete g.surface; surface.disabled = true; } else { g.surface = surface.value; surface.disabled = false; } save(); } });
    return h('section', { class: 'card', dataset: { glassMode: mode } },
      h('h3', {}, ctx.t(mode === 'light' ? 'ap_light' : 'ap_dark')),
      h('div', { class: 'grid2' },
        field({ label: ctx.t('ap_blur'), control: blur }),
        field({ label: ctx.t('ap_opacity'), control: opacity }),
        field({ label: ctx.t('ap_shadow'), control: selectInput({ value: g.shadow, options: CARD_SHADOWS.map((s) => ({ value: s, label: ctx.t(`ap_shadow_${s}`) })), onChange: (v) => { g.shadow = v; save(); } }) }),
        checkInput({ label: ctx.t('ap_border'), checked: g.border, onChange: (v) => { g.border = v; save(); } })),
      field({ label: ctx.t('ap_surface'), control: h('div', { class: 'colorrow__inputs' }, surface, useDefault) }));
  };

  const elements = h('fieldset', { class: 'card' }, h('legend', {}, ctx.t('ap_glass_elements')),
    h('div', { class: 'checkgroup' }, ELEMENTS.map((key) => checkInput({ label: ctx.t(`ap_el_${key}`), checked: glass.elements[key], onChange: (v) => { glass.elements[key] = v; save(); notes(); } }))));

  const cardsNote = h('p', { class: 'field__hint', role: 'note' });
  function notes() { cardsNote.textContent = glass.enabled && glass.elements.cards ? ctx.t('ap_glass_cards_note') : ''; cardsNote.hidden = !cardsNote.textContent; }

  const defaults = h('button', { type: 'button', class: 'button', id: 'glass-defaults', onclick: () => {
    for (const mode of ['light', 'dark']) Object.assign(glass[mode], DEFAULT_MODE);
    save(); env.redraw();
  } }, ctx.t('ap_glass_defaults'));

  root.append(
    h('div', { class: 'card' },
      h('h2', {}, ctx.t('ap_glass')),
      h('p', { class: 'muted' }, ctx.t('ap_glass_intro')),
      checkInput({ label: ctx.t('ap_glass_enabled'), checked: glass.enabled, onChange: (v) => { glass.enabled = v; save(); notes(); } }),
      cardsNote, h('p', { class: 'field__hint' }, ctx.t('ap_hero_note', { n: HERO_MIN_OPACITY })), defaults),
    elements,
    h('div', { class: 'grid2' }, modeCard('light'), modeCard('dark')));
  notes();
  return root;
}
