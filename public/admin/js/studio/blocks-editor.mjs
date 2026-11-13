// The block list of the Editorial Studio: add, edit, duplicate, hide, delete, reorder (drag and drop,
// buttons or keyboard), collapse, and undo/redo for the whole list.
//
// The list edits `blocks` in place (the array lives inside the record the caller is editing). Every change
// goes through `edit` (typing: merged into one undo step per field) or `structural` (adding, removing or
// moving blocks: one step each), so undo, redo, saving and the live preview all see the same changes.

import { DISPLAY_FIELDS, SPECS, duplicateBlock, readField } from '../../shared/core/block-specs.mjs';
import { BLOCK_GROUPS, textFields } from '../../shared/core/blocks-meta.mjs';
import { newBlock } from '../../shared/core/content-ops.mjs';
import { addImageToLibrary, looksLikeImage } from '../views/upload.mjs';
import { createHistory } from '../../shared/core/history.mjs';
import { plain } from '../../shared/lib/markup.mjs';
import { h, modal, toast } from '../dom.mjs';
import { renderFields } from './fields.mjs';

const ARROWS = { ArrowUp: -1, ArrowDown: 1 };

/** A few words that identify a block when it is collapsed. */
export function summaryOf(ctx, block) {
  if (block.type === 'image' || block.type === 'imagetext') {
    const asset = ctx.content().media.find((m) => m.id === block.mediaId);
    const caption = block.caption ? plain(block.caption) : '';
    return [asset?.file, caption].filter(Boolean).join(' — ');
  }
  const fields = textFields(block).filter((f) => f.text.trim());
  const first = fields.find((f) => f.role !== 'code') ?? fields[0];
  const text = first ? plain(first.text).replace(/\s+/g, ' ').trim() : '';
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

/**
 * @param {{ ctx: object, blocks: object[], lang: string, pathBase: string, onChange: () => void, recordId?: string, empty?: HTMLElement|null }} options
 *   `pathBase` is the validation path of the array, e.g. "translations.en.body".
 */
export function createBlocksEditor({ ctx, blocks, lang, pathBase, onChange, recordId, empty = null }) {
  const history = createHistory();
  const historyListeners = new Set();
  const collapsed = new Set();
  const langDir = ctx.langDir(lang);

  const root = h('div', { class: 'blocks', dataset: { path: pathBase } });
  const list = h('div', { class: 'blocks__list' });
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const notify = () => historyListeners.forEach((fn) => fn());

  // ---- the two ways a change reaches the list

  /** A change inside one block (typing, a select, an item list). `mergeKey` joins a burst of typing into one undo step. */
  function edit(change, mergeKey = null) {
    history.checkpoint(blocks, mergeKey);
    change();
    onChange();
    notify();
  }
  /** A change to the list itself (or one that must redraw it). One undo step; the list is redrawn. */
  function structural(change) {
    history.seal();
    history.checkpoint(blocks, null);
    change();
    history.seal();
    onChange();
    draw();
    notify();
  }

  // ---- operations

  const say = (text) => { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); };
  const focusCard = (index, selector = 'textarea, input, select') => list.querySelectorAll('.block')[index]?.querySelector(selector)?.focus();

  function relocate(from, to) {
    if (from === to || to < 0 || to >= blocks.length) return;
    structural(() => { const [block] = blocks.splice(from, 1); blocks.splice(to, 0, block); });
    say(ctx.t('moved_to', { n: to + 1, total: blocks.length }));
  }

  async function pickType() {
    let choose;
    const groups = Object.entries(BLOCK_GROUPS);
    return modal({
      title: ctx.t('pick_block_title'),
      body: h('div', { class: 'picker' }, groups.map(([group, types]) => {
        const titleKey = `group_${group}`;
        return h('section', { class: 'picker__group' }, h('h3', {}, ctx.t(titleKey)),
          h('div', { class: 'picker__grid' }, types.map((type) => { const labelKey = `block_${type}`; return h('button', { type: 'button', class: 'button picker__item', dataset: { addBlock: type }, onclick: () => choose(type) }, ctx.t(labelKey)); })));
      })),
      actions: (close) => { choose = close; return [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel'))]; },
    });
  }

  async function addAt(index) {
    const type = await pickType();
    if (!type) return;
    structural(() => { blocks.splice(index, 0, newBlock(ctx.content(), type, blocks.map((b) => b.id))); });
    reveal(index);
  }

  /**
   * Pictures that arrive as files (pasted, dropped or picked): each goes through the library's upload
   * flow (content check, description in every language), then becomes an image block at `index`.
   * One picture at a time, so each dialog is answered before the next opens.
   */
  async function insertImages(files, index) {
    const images = [...files].filter(looksLikeImage);
    if (!images.length) { toast(ctx.t('drop_no_images'), 'error'); return; }
    let at = Math.max(0, Math.min(index, blocks.length));
    for (const file of images) {
      const asset = await addImageToLibrary(ctx, file);
      if (!asset) continue;
      const block = { ...newBlock(ctx.content(), 'image', blocks.map((b) => b.id)), mediaId: asset.id };
      structural(() => { blocks.splice(at, 0, block); });
      reveal(at);
      at += 1;
    }
  }

  /** Where a picture lands when it is pasted: after the block the cursor is in, else at the end. */
  function pasteIndex() {
    const card = document.activeElement?.closest?.('.block');
    const cards = [...list.querySelectorAll('.block')];
    const i = card ? cards.indexOf(card) : -1;
    return i >= 0 ? i + 1 : blocks.length;
  }

  /** Make a block visible and move the keyboard focus into it. */
  function reveal(index) {
    const block = blocks[index];
    if (!block) return;
    if (collapsed.delete(block.id)) draw();
    const card = list.querySelectorAll('.block')[index];
    card?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    focusCard(index);
  }

  const dirOf = (block) => (['ltr', 'rtl', 'auto'].includes(block.dir) ? block.dir : langDir);

  // ---- drawing

  let dragFrom = null;
  const clearDrop = () => { for (const el of list.querySelectorAll('.drop-before, .drop-after, .is-dragging')) el.classList.remove('drop-before', 'drop-after', 'is-dragging'); };

  function card(block, index) {
    const path = `${pathBase}[${index}]`;
    const spec = SPECS[block.type];
    const isCollapsed = collapsed.has(block.id);
    const env = { ctx, lang, dir: dirOf(block), block, blocks, recordId, edit, seal: () => history.seal(), structural, refresh: () => onChange() };
    const typeKey = `block_${block.type}`;

    const body = [...renderFields(env, block, spec.fields.filter((f) => !f.advanced), path)];
    if (!spec.fields.length) body.push(h('p', { class: 'muted' }, ctx.t('divider_note')));
    const advanced = spec.fields.filter((f) => f.advanced);
    const touched = [...advanced, ...DISPLAY_FIELDS].some((f) => readField(block, f) !== undefined && readField(block, f) !== '' && readField(block, f) !== f.default);
    body.push(h('details', { class: 'block__options', open: touched || null }, h('summary', {}, ctx.t('block_options')), ...renderFields(env, block, [...advanced, ...DISPLAY_FIELDS], path)));

    const el = h('article', { class: `block${block.hidden ? ' is-hidden' : ''}${isCollapsed ? ' is-collapsed' : ''}`, dataset: { path, blockType: block.type, blockId: block.id } });
    const handle = h('button', {
      type: 'button', class: 'block__handle', 'aria-label': ctx.t('drag_handle'), title: ctx.t('drag_handle'),
      onmousedown: () => { el.draggable = true; },
      onmouseup: () => { el.draggable = false; },
      onkeydown: (event) => {
        const delta = ARROWS[event.key];
        if (!delta) return;
        event.preventDefault();
        const to = index + delta;
        if (to < 0 || to >= blocks.length) return;
        relocate(index, to);
        list.querySelectorAll('.block')[to]?.querySelector('.block__handle')?.focus();
      },
    }, '⠿');

    el.addEventListener('dragstart', (event) => {
      dragFrom = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', block.id);
      el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => { el.draggable = false; dragFrom = null; clearDrop(); });
    el.addEventListener('dragover', (event) => {
      if (dragFrom === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      el.classList.toggle('drop-after', after); el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (event) => {
      if (dragFrom === null) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
      const from = dragFrom;
      dragFrom = null; clearDrop();
      relocate(from, at > from ? at - 1 : at);
    });

    const btn = (label, onclick, extra = {}) => h('button', { type: 'button', class: `button button--small${extra.danger ? ' button--danger' : ''}`, 'aria-label': extra.aria ?? label, disabled: extra.disabled || null, 'aria-pressed': extra.pressed, dataset: extra.dataset ?? {}, onclick }, label);
    el.append(
      h('header', { class: 'block__head' },
        handle,
        h('button', { type: 'button', class: 'block__toggle', 'aria-expanded': String(!isCollapsed), onclick: () => { if (collapsed.has(block.id)) collapsed.delete(block.id); else collapsed.add(block.id); draw(); } },
          h('strong', {}, `${index + 1}. ${ctx.t(typeKey)}`), h('span', { class: 'block__summary' }, isCollapsed || !spec.fields.length ? summaryOf(ctx, block) : '')),
        h('span', { class: 'spacer' }),
        btn('↑', () => relocate(index, index - 1), { aria: ctx.t('move_up'), disabled: index === 0 }),
        btn('↓', () => relocate(index, index + 1), { aria: ctx.t('move_down'), disabled: index === blocks.length - 1 }),
        btn(ctx.t('duplicate'), () => { structural(() => { blocks.splice(index + 1, 0, duplicateBlock(block, blocks.map((b) => b.id))); }); reveal(index + 1); }, { dataset: { action: 'duplicate' } }),
        btn(block.hidden ? ctx.t('show_block') : ctx.t('hide_block'), () => structural(() => { if (block.hidden) delete block.hidden; else block.hidden = true; }), { pressed: String(Boolean(block.hidden)), dataset: { action: 'hide' } }),
        btn(ctx.t('delete'), () => { structural(() => { blocks.splice(index, 1); }); say(ctx.t('block_deleted')); }, { danger: true, dataset: { action: 'delete' } })),
      h('div', { class: 'block__body', hidden: isCollapsed || null }, body));
    return el;
  }

  const insertPoint = (index) => h('div', { class: 'block__insert' }, h('button', { type: 'button', class: 'button button--small', 'aria-label': ctx.t('insert_here'), title: ctx.t('insert_here'), dataset: { insertAt: String(index) }, onclick: () => addAt(index) }, '+'));

  function draw() {
    const scroll = window.scrollY;
    list.replaceChildren();
    if (!blocks.length) list.append(h('div', { class: 'blocks__empty' }, h('p', { class: 'muted empty' }, ctx.t('no_blocks')), empty));
    blocks.forEach((block, i) => { list.append(insertPoint(i), card(block, i)); });
    window.scrollTo({ top: scroll });
  }

  /** Put an earlier (or later) list of blocks back and redraw, keeping the cursor in the same field when it still exists. */
  function restoreState(state, messageKey) {
    const active = document.activeElement;
    const path = active && root.contains(active) ? active.closest('[data-path]')?.dataset.path : null;
    blocks.splice(0, blocks.length, ...state);
    onChange(); draw(); notify(); say(ctx.t(messageKey));
    if (path) {
      const control = [...root.querySelectorAll('[data-path]')].find((el) => el.dataset.path === path)?.querySelector('textarea, input, select');
      if (control) {
        control.focus();
        try { const end = control.value.length; control.setSelectionRange(end, end); } catch { /* not a text control */ }
      }
    }
    return true;
  }

  const picker = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true, hidden: true, id: 'studio-image-input' });
  picker.addEventListener('change', async () => { const files = [...picker.files]; picker.value = ''; await insertImages(files, blocks.length); });

  const bar = h('div', { class: 'blocks__bar' },
    h('button', { type: 'button', class: 'button button--primary', id: 'add-block', onclick: () => addAt(blocks.length) }, `+ ${ctx.t('add_block_button')}`),
    h('button', { type: 'button', class: 'button button--small', id: 'add-image-file', onclick: () => picker.click() }, ctx.t('add_image_file')), picker,
    h('button', { type: 'button', class: 'button button--small', dataset: { action: 'collapse-all' }, onclick: () => { blocks.forEach((b) => collapsed.add(b.id)); draw(); } }, ctx.t('collapse_all')),
    h('button', { type: 'button', class: 'button button--small', dataset: { action: 'expand-all' }, onclick: () => { collapsed.clear(); draw(); } }, ctx.t('expand_all')));

  root.append(error, list, bar, h('p', { class: 'field__hint blocks__drophint' }, ctx.t('drop_hint')), live);
  draw();

  // Pictures from outside: pasted from the clipboard, or files dropped on the list. Text is never
  // taken over: a paste that carries text (copied from a document, say) is left to the text box.
  root.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    if (!data || [...data.types].includes('text/plain')) return;
    const files = [...data.files].filter(looksLikeImage);
    if (!files.length) return;
    event.preventDefault();
    insertImages(files, pasteIndex());
  });
  const hasFiles = (event) => dragFrom === null && [...(event.dataTransfer?.types ?? [])].includes('Files');
  root.addEventListener('dragover', (event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; root.classList.add('is-filedrop'); });
  root.addEventListener('dragleave', (event) => { if (!root.contains(event.relatedTarget)) root.classList.remove('is-filedrop'); });
  root.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    root.classList.remove('is-filedrop');
    const card = event.target.closest?.('.block');
    const cards = [...list.querySelectorAll('.block')];
    let index = blocks.length;
    if (card) { const rect = card.getBoundingClientRect(); index = cards.indexOf(card) + (event.clientY > rect.top + rect.height / 2 ? 1 : 0); }
    insertImages(event.dataTransfer.files, index);
  });

  return {
    el: root,
    blocks,
    redraw: draw,
    reveal,
    /** Insert blocks (a template, a snippet) at a position, as one undoable step. */
    insert(newBlocks, at = blocks.length) { structural(() => { blocks.splice(at, 0, ...newBlocks); }); },
    /** Replace the whole list (restoring a version), as one undoable step. */
    replaceAll(newBlocks) { structural(() => { blocks.splice(0, blocks.length, ...newBlocks); }); },
    /** Run any change that edits blocks directly (find and replace), as one undoable step. */
    apply(change) { structural(change); },
    undo() { const previous = history.undo(blocks); if (!previous) return false; return restoreState(previous, 'undone'); },
    redo() { const next = history.redo(blocks); if (!next) return false; return restoreState(next, 'redone'); },
    get canUndo() { return history.canUndo; },
    get canRedo() { return history.canRedo; },
    onHistory(fn) { historyListeners.add(fn); return () => historyListeners.delete(fn); },
  };
}
