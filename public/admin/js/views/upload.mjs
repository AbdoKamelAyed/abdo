// Adding one picture to the media library. Shared by the Media screen (the Upload button) and the
// Editorial Studio (pasting a picture, dropping a file, "Add a picture from your computer").
//
// Nothing is trusted from the file's name or the browser's reported type: the bytes are inspected
// (src/core/image-info.mjs) and only PNG, JPEG, GIF and WebP within the size limits get through. The
// owner must describe the picture in every enabled language before it is added, the same rule the
// validator enforces for published pages.

import { usedIds } from '../../shared/core/content-ops.mjs';
import { newId } from '../../shared/core/ids.mjs';
import { UploadError, inspectImage, safeMediaName } from '../../shared/core/image-info.mjs';
import { field, fileToBytes, h, modal, textInput, toast } from '../dom.mjs';

const MEDIA_REL = 'media/media.json';
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Is this file worth offering to the upload flow? (A cheap pre-check; the real check is the byte inspection.) */
export const looksLikeImage = (file) => /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp)$/i.test(file.name ?? '');

/**
 * Ask for the picture's description, then stage the file and its library entry.
 * @returns {Promise<{ id: string, file: string }|null>} the new asset, or null when it was refused or cancelled
 */
export async function addImageToLibrary(ctx, file) {
  const langs = ctx.languages();
  let bytes; let info;
  try { bytes = await fileToBytes(file); info = inspectImage(bytes); } catch (error) { toast(`${file.name}: ${error instanceof UploadError ? error.message : String(error)}`, 'error'); return null; }
  const existing = new Set([...ctx.workspace.mediaFiles().keys()]);
  const name = safeMediaName(file.name, info.ext, existing);
  const previewUrl = URL.createObjectURL(new Blob([bytes], { type: info.mimeType }));
  const alt = {}; let caption = '';
  const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const result = await modal({
    title: ctx.t('upload_title'),
    body: h('div', {}, h('div', { class: 'thumb thumb--large' }, h('img', { src: previewUrl, alt: '' })), h('p', { class: 'muted', dir: 'ltr' }, `${name} · ${info.width}×${info.height} · ${fmtSize(info.size)}`),
      ...langs.map((l) => field({ label: `${ctx.t('alt_text')} (${l.nativeName})`, hint: ctx.t('alt_hint'), wide: true, control: textInput({ dir: l.direction, lang: l.code, onInput: (v) => { alt[l.code] = v.trim(); } }) })),
      field({ label: ctx.t('field_caption'), wide: true, control: textInput({ onInput: (v) => { caption = v.trim(); } }) }), err),
    actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
      h('button', { type: 'button', class: 'button button--primary', id: 'upload-confirm', onclick: () => { if (langs.some((l) => !alt[l.code])) { err.textContent = ctx.t('alt_required'); err.hidden = false; return; } close(true); } }, ctx.t('add_to_library'))],
  });
  URL.revokeObjectURL(previewUrl);
  if (!result) return null;
  const data = ctx.workspace.read(MEDIA_REL);
  const stamp = now();
  const id = newId('media', usedIds(ctx.content()));
  ctx.workspace.uploadMedia(name, bytes);
  data.items.push({ id, status: 'active', type: 'image', file: name, mimeType: info.mimeType, width: info.width, height: info.height, alt, ...(caption ? { caption: Object.fromEntries(langs.map((l) => [l.code, caption])) } : {}), createdAt: stamp, updatedAt: stamp });
  ctx.workspace.write(MEDIA_REL, data);
  ctx.changed();
  ctx.revalidate();
  toast(ctx.t('upload_done', { name }), 'info');
  return { id, file: name };
}
