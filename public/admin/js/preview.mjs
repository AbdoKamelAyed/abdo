// The live preview: the site's own page renderer, running here, drawn in a sandboxed frame.
//
// How it stays safe: the page is produced by the same escaping renderer the build uses, turned into a
// blob URL and shown in an iframe whose `sandbox` has no `allow-scripts` — nothing in the preview can run
// code, open windows or navigate away. The access token lives in this page's JavaScript memory only.

import { fillMedia, previewStyles, renderPreview, PreviewError } from '../shared/core/preview.mjs';
import { clear, h } from './dom.mjs';

const DEVICES = { phone: 390, tablet: 820, desktop: 1280 };
let baseCssPromise = null;
const loadBaseCss = () => (baseCssPromise ??= fetch('./preview/base.css', { cache: 'no-store' }).then((r) => {
  if (!r.ok) throw new Error('The preview stylesheet could not be loaded.');
  return r.text();
}).catch((error) => { baseCssPromise = null; throw error; }));

const blobOf = (text, type) => URL.createObjectURL(new Blob([text], { type }));

/**
 * @param {{ ctx: object, kind: string|(() => string), id?: string|(() => string), lang: () => string, device?: 'phone'|'tablet'|'desktop' }} options
 *   `kind` is 'article' or 'project' (with an `id`), or a whole page: 'home', 'blog', 'portfolio', 'topics', 'about'. Both may be functions, read at each redraw.
 * @returns {{ element: HTMLElement, update: () => void, refit: () => void, destroy: () => void }}
 */
export function createPreview({ ctx, kind, id, lang, device = 'desktop' }) {
  const state = { device: device in DEVICES ? device : 'desktop', theme: 'auto' };
  let timer = null;
  let version = 0;
  let live = []; // blob URLs behind the frame that is showing now
  let destroyed = false;

  const frame = h('iframe', { class: 'preview__frame', sandbox: 'allow-same-origin', title: ctx.t('preview_frame_title'), referrerpolicy: 'no-referrer' });
  const stage = h('div', { class: 'preview__stage' }, frame);
  const message = h('p', { class: 'preview__message muted', role: 'status', hidden: true });
  const viewport = h('div', { class: 'preview__viewport' }, stage);

  const group = (name, values, labelOf) => {
    const buttons = values.map((value) => h('button', {
      type: 'button', class: 'button button--small', dataset: { [name]: value }, 'aria-pressed': String(state[name] === value),
      onclick: () => { state[name] = value; for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset[name] === value)); if (name === 'device') fit(); else update(); },
    }, labelOf(value)));
    return h('div', { class: 'preview__group', role: 'group', 'aria-label': ctx.t(`preview_${name}`) }, buttons);
  };

  const bar = h('div', { class: 'preview__bar' },
    group('device', Object.keys(DEVICES), (v) => ctx.t(`device_${v}`)),
    group('theme', ['auto', 'light', 'dark'], (v) => ctx.t(`theme_${v}`)));
  const element = h('section', { class: 'preview', 'aria-label': ctx.t('preview_title') }, bar, message, viewport,
    h('p', { class: 'muted small' }, ctx.t('preview_note')));

  /** Scale the device-width page down to the space available (never up). */
  function fit() {
    const width = DEVICES[state.device];
    const room = viewport.clientWidth || width;
    const scale = Math.min(1, room / width);
    const height = Math.max(520, Math.round((window.innerHeight - 220) / scale));
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.style.transform = `scale(${scale})`;
    viewport.style.height = `${Math.round(height * scale)}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
  }

  function show(text) { message.textContent = text; message.hidden = !text; }

  async function render() {
    const mine = (version += 1);
    let baseCss;
    try { baseCss = await loadBaseCss(); } catch (error) { show(error.message); return; }
    if (destroyed || mine !== version) return;

    const content = ctx.content();
    const styles = previewStyles(content);
    const urls = [blobOf(styles.themeCss, 'text/css'), blobOf(styles.glassCss, 'text/css'), blobOf(baseCss, 'text/css')];
    let result;
    const kindNow = typeof kind === 'function' ? kind() : kind;
    try {
      result = renderPreview(content, { kind: kindNow, id: typeof id === 'function' ? id() : id, lang: lang(), theme: state.theme, assets: { themeCss: urls[0], glassCss: urls[1], baseCss: urls[2] } });
    } catch (error) {
      urls.forEach((u) => URL.revokeObjectURL(u));
      show(error instanceof PreviewError && error.code === 'empty-taxonomy' ? ctx.t(`preview_empty_${kindNow}`)
        : error instanceof PreviewError ? ctx.t('preview_error', { message: error.message }) : ctx.t('preview_error', { message: String(error?.message ?? error) }));
      return;
    }
    const media = new Map();
    await Promise.all(result.files.map(async (file) => { const url = await ctx.mediaUrl(file); if (url) media.set(file, url); }));
    if (destroyed || mine !== version) { urls.forEach((u) => URL.revokeObjectURL(u)); return; }

    const page = blobOf(fillMedia(result.html, media), 'text/html');
    const previous = live;
    live = [...urls, page];
    show('');
    frame.src = page;
    // Give the old frame time to be replaced before releasing what it used.
    setTimeout(() => previous.forEach((u) => URL.revokeObjectURL(u)), 4000);
  }

  function update() {
    clearTimeout(timer);
    timer = setTimeout(() => { render().catch((error) => show(ctx.t('preview_error', { message: String(error?.message ?? error) }))); }, 350);
  }

  const resize = () => fit();
  window.addEventListener('resize', resize);
  queueMicrotask(() => { fit(); update(); });

  return {
    element,
    update,
    /** Measure again: call when the preview has just become visible (a hidden element has no width to fit to). */
    refit: fit,
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      window.removeEventListener('resize', resize);
      live.forEach((u) => URL.revokeObjectURL(u));
      clear(stage);
    },
  };
}
