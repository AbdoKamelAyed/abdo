// The focal point dialog: choose the part of an image that must stay visible when a frame crops it.
//
// Click or drag on the picture, or use the two sliders (the sliders are the keyboard and screen reader
// route). Three sample frames show what a wide, a square and a tall crop keep. Positions are applied
// with the style API, never with markup, so the admin's Content Security Policy is respected.

import { normalizeFocal } from '../../shared/core/focal.mjs';
import { field, h, modal } from '../dom.mjs';

const MEDIA_REL = 'media/media.json';
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Describe a focal point in words for the current interface language. */
export function describeFocal(ctx, focal) {
  return focal ? ctx.t('focal_value', { x: focal.x, y: focal.y }) : ctx.t('focal_centre');
}

/**
 * Open the dialog for one media asset and, when the owner saves, store the result in the staged
 * media file. Resolves to true when something was saved.
 */
export async function editFocal(ctx, asset) {
  const url = await ctx.mediaUrl(asset.file);
  let point = asset.focal ? { x: asset.focal.x, y: asset.focal.y } : { x: 50, y: 50 };

  const stage = h('div', { class: 'focal__stage' });
  const image = h('img', { class: 'focal__image', src: url ?? '', alt: asset.alt?.[ctx.ui] ?? Object.values(asset.alt ?? {})[0] ?? '' });
  const dot = h('span', { class: 'focal__dot', 'aria-hidden': 'true' });
  stage.append(image, dot);

  const samples = ['wide', 'square', 'tall'].map((kind) => {
    const img = h('img', { class: 'focal__sample-image', src: url ?? '', alt: '' });
    return { kind, img, el: h('figure', { class: `focal__sample focal__sample--${kind}` }, img, h('figcaption', {}, ctx.t(`focal_sample_${kind}`))) };
  });

  const status = h('p', { class: 'muted small', role: 'status' });
  const sliderX = h('input', { type: 'range', min: '0', max: '100', step: '1', id: 'focal-x', dataset: { focalAxis: 'x' } });
  const sliderY = h('input', { type: 'range', min: '0', max: '100', step: '1', id: 'focal-y', dataset: { focalAxis: 'y' } });

  function paint() {
    dot.style.left = `${point.x}%`;
    dot.style.top = `${point.y}%`;
    for (const { img } of samples) img.style.objectPosition = `${point.x}% ${point.y}%`;
    sliderX.value = String(point.x);
    sliderY.value = String(point.y);
    status.textContent = describeFocal(ctx, normalizeFocal(point.x, point.y));
  }
  const set = (x, y) => { point = { x: Math.max(0, Math.min(100, Math.round(x))), y: Math.max(0, Math.min(100, Math.round(y))) }; paint(); };

  // Pointer: the position is measured from the picture's top-left corner, whatever the page direction.
  const fromPointer = (event) => {
    const box = image.getBoundingClientRect();
    if (!box.width || !box.height) return;
    set(((event.clientX - box.left) / box.width) * 100, ((event.clientY - box.top) / box.height) * 100);
  };
  let dragging = false;
  stage.addEventListener('pointerdown', (event) => { dragging = true; stage.setPointerCapture?.(event.pointerId); fromPointer(event); });
  stage.addEventListener('pointermove', (event) => { if (dragging) fromPointer(event); });
  const stop = () => { dragging = false; };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
  sliderX.addEventListener('input', () => set(Number(sliderX.value), point.y));
  sliderY.addEventListener('input', () => set(point.x, Number(sliderY.value)));
  paint();

  const result = await modal({
    title: ctx.t('focal_title', { name: asset.file }),
    body: h('div', { class: 'focal' },
      h('p', { class: 'muted' }, ctx.t('focal_hint')),
      stage,
      h('div', { class: 'focal__sliders' },
        field({ label: ctx.t('focal_x'), control: sliderX }),
        field({ label: ctx.t('focal_y'), control: sliderY })),
      status,
      h('div', { class: 'focal__samples' }, ...samples.map((s) => s.el))),
    actions: (close) => [
      h('button', { type: 'button', class: 'button', id: 'focal-reset', onclick: () => set(50, 50) }, ctx.t('focal_reset')),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
      h('button', { type: 'button', class: 'button button--primary', id: 'focal-save', onclick: () => close(true) }, ctx.t('save')),
    ],
  });
  if (!result) return false;

  const next = normalizeFocal(point.x, point.y);
  const data = ctx.workspace.read(MEDIA_REL);
  const target = data.items.find((m) => m.id === asset.id);
  if (!target) return false;
  const before = JSON.stringify(target.focal ?? null);
  if (next) target.focal = next; else delete target.focal;
  if (JSON.stringify(target.focal ?? null) === before) return false;
  target.updatedAt = now();
  ctx.workspace.write(MEDIA_REL, data);
  ctx.changed();
  ctx.revalidate();
  return true;
}
