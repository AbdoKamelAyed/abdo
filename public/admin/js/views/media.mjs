// Media library: upload (checked by content, not by file name), alt text per language, archive, delete.

import { collectIds } from '../../shared/core/ids.mjs';
import { describeFocal, editFocal } from './focal.mjs';
import { addImageToLibrary } from './upload.mjs';
import { chip, confirmDialog, field, h, modal, textInput, toast } from '../dom.mjs';

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const MEDIA_REL = 'media/media.json';
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Where an asset is referenced: other content that mentions its ID. */
function usages(ctx, asset) {
  const content = ctx.content();
  const hits = [];
  for (const a of content.articles) if (collectIds(a).has(asset.id)) hits.push(ctx.titleOf(a.translations));
  for (const p of content.projects) if (collectIds(p).has(asset.id)) hits.push(ctx.titleOf(p.translations));
  for (const [label, value] of [['profile', content.profile], ['site', content.site], ['topics', content.topicsFile], ['tags', content.tagsFile], ['homepage', content.homepage]]) if (collectIds(value).has(asset.id)) hits.push(ctx.t(`used_in_${label}`));
  return hits;
}

export function renderMedia(ctx) {
  const grid = h('div', { class: 'media-grid' });
  const langs = ctx.languages();

  const items = () => ctx.workspace.read(MEDIA_REL);
  const saveItems = (data) => { ctx.workspace.write(MEDIA_REL, data); ctx.changed(); ctx.revalidate(); draw(); };

  /** Add one picked file to the library through the shared upload flow (also used by paste and drop in the Studio). */
  async function upload(file) { if (await addImageToLibrary(ctx, file)) draw(); }

  async function editAlt(asset) {
    const alt = { ...asset.alt };
    const result = await modal({
      title: ctx.t('edit_alt_title', { name: asset.file }),
      body: h('div', {}, ...langs.map((l) => field({ label: `${ctx.t('alt_text')} (${l.nativeName})`, wide: true, control: textInput({ value: alt[l.code] ?? '', dir: l.direction, lang: l.code, onInput: (v) => { alt[l.code] = v.trim(); } }) }))),
      actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')), h('button', { type: 'button', class: 'button button--primary', id: 'alt-save', onclick: () => close(true) }, ctx.t('save'))],
    });
    if (!result) return;
    const data = items();
    const target = data.items.find((m) => m.id === asset.id);
    for (const l of langs) { if (alt[l.code]) target.alt[l.code] = alt[l.code]; else delete target.alt[l.code]; }
    target.updatedAt = now();
    saveItems(data);
  }

  async function toggleArchive(asset) {
    const used = usages(ctx, asset);
    if (asset.status === 'active' && used.length) { toast(ctx.t('in_use_cannot', { list: used.join(', ') }), 'error'); return; }
    const data = items();
    const target = data.items.find((m) => m.id === asset.id);
    target.status = asset.status === 'active' ? 'archived' : 'active';
    target.updatedAt = now();
    saveItems(data);
  }

  async function remove(asset) {
    const used = usages(ctx, asset);
    if (used.length) { toast(ctx.t('in_use_cannot', { list: used.join(', ') }), 'error'); return; }
    const ok = await confirmDialog({ title: ctx.t('delete_item_title'), message: ctx.t('delete_media_message', { name: asset.file }), confirmLabel: ctx.t('delete'), cancelLabel: ctx.t('cancel'), danger: true });
    if (!ok) return;
    const data = items();
    data.items = data.items.filter((m) => m.id !== asset.id);
    ctx.workspace.remove(`media/files/${asset.file}`);
    saveItems(data);
  }

  function draw() {
    grid.replaceChildren();
    const files = ctx.workspace.mediaFiles();
    const media = ctx.content().media;
    if (!media.length) grid.append(h('p', { class: 'muted empty' }, ctx.t('no_media')));
    for (const asset of media) {
      const thumb = h('div', { class: 'thumb' });
      ctx.mediaUrl(asset.file).then((url) => { if (url) thumb.append(h('img', { src: url, alt: asset.alt[ctx.ui] ?? '' })); });
      const staged = files.get(asset.file)?.staged;
      grid.append(h('article', { class: 'card media-card', dataset: { mediaId: asset.id } },
        thumb,
        h('p', { class: 'media-card__name', dir: 'ltr' }, asset.file),
        h('p', { class: 'muted small', dir: 'ltr' }, `${asset.width ?? '?'}×${asset.height ?? '?'} · ${fmtSize(files.get(asset.file)?.size ?? 0)}`),
        h('p', { class: 'small' }, asset.alt[ctx.ui] ?? Object.values(asset.alt)[0] ?? ''),
        asset.focal ? h('p', { class: 'muted small' }, `${ctx.t('focal_label')}: ${describeFocal(ctx, asset.focal)}`) : null,
        h('p', {}, chip(ctx.t(asset.status === 'active' ? 'media_active' : 'media_archived'), asset.status === 'active' ? 'ok' : ''), ' ', staged ? chip(ctx.t('unpublished'), 'pending') : null, ' ', h('span', { class: 'muted small' }, ctx.t('used_count', { n: usages(ctx, asset).length }))),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'button button--small', dataset: { editAlt: asset.id }, onclick: () => editAlt(asset) }, ctx.t('edit_alt')),
          asset.type === 'image' ? h('button', { type: 'button', class: 'button button--small', dataset: { editFocal: asset.id }, onclick: async () => { if (await editFocal(ctx, asset)) draw(); } }, ctx.t('focal_button')) : null,
          h('button', { type: 'button', class: 'button button--small', onclick: () => toggleArchive(asset) }, ctx.t(asset.status === 'active' ? 'archive' : 'restore')),
          h('button', { type: 'button', class: 'button button--small button--danger', dataset: { removeMedia: asset.id }, onclick: () => remove(asset) }, ctx.t('delete')))));
    }
  }

  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true, hidden: true, id: 'upload-input' });
  input.addEventListener('change', async () => { for (const file of input.files) await upload(file); input.value = ''; });
  const el = h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('nav_media')), h('button', { type: 'button', class: 'button button--primary', id: 'upload-button', onclick: () => input.click() }, ctx.t('upload'))),
    h('p', { class: 'muted' }, ctx.t('upload_rules')), input, grid);
  draw();
  return { el };
}
