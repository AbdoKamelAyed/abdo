// The Editorial Studio shell: ties the block editor, the side panels, the live preview, undo/redo, the
// template picker and the focus mode into one writing environment for an article or a project.
//
// The views (articles, projects) own the record and the form fields; they create the blocks editor for the
// language being edited and hand it to `studio.mount(editor)`, which returns the part of the page that holds
// the toolbar, the writing area and the preview. The shell never edits the record itself: every change goes
// through the editor (so undo, saving and the preview agree) or through the view's `save()`.

import { usedIds } from '../../shared/core/content-ops.mjs';
import { TEMPLATES, templateBlocks, templateName } from '../../shared/core/templates.mjs';
import { writingStats } from '../../shared/core/writing.mjs';
import { h, modal, toast } from '../dom.mjs';
import { createPreview } from '../preview.mjs';
import { historyPanel } from './history-panel.mjs';
import { checksPanel, findPanel, outlinePanel } from './panels.mjs';
import { pickTemplate } from './templates-dialog.mjs';
import { overridePanel } from './override-panel.mjs';
import { typographyPanel } from './typography-panel.mjs';

const MODES = ['write', 'split', 'preview'];
const number = (n) => Number(n).toLocaleString('en');

/**
 * @param {{
 *   ctx: object, kind: 'article'|'project', id: string, rel: string, record: object, root: HTMLElement,
 *   getLang: () => string, documentPanel: HTMLElement,
 *   onTemplateApplied?: (templateId: string, how: 'insert'|'append'|'replace') => void,
 *   onRestored: () => void,
 * }} options
 *   `rel` is the content file ("articles/<id>.json"); `root` is the editor page element (it carries the
 *   current mode as `data-studio-mode` so the stylesheet can lay the page out); `documentPanel` holds the
 *   record's settings (status, date, topics…).
 */
export function createStudio({ ctx, kind, id, rel, record, root, getLang, documentPanel, onTemplateApplied, onRestored, saveRecord }) {
  let editor = null;
  let preview = null;
  let unsubscribeHistory = () => {};
  let refreshTimer = null;
  const state = { mode: 'write', tab: 'document', focus: false };

  const getTranslation = () => record.translations[getLang()];
  const getBlocks = () => editor?.blocks ?? [];
  const getEditor = () => editor;
  const getRecord = () => record;

  /** Bring a block into view and focus it, leaving the preview-only mode first if needed. */
  const reveal = (index) => { if (state.mode === 'preview') setMode('write'); editor?.reveal(index); };

  // ---------------------------------------------------------------- side panels

  const panels = {
    outline: outlinePanel({ ctx, getBlocks, reveal }),
    checks: checksPanel({ ctx, recordId: id, getLang, getBlocks, getTranslation, getRecord, reveal }),
    find: findPanel({ ctx, getBlocks, getEditor, reveal }),
    history: historyPanel({ ctx, rel, getRecord, getLang, getEditor, onRestored: () => { onRestored(); changed(); } }),
    typography: typographyPanel({ ctx, getLang, onChange: () => { preview?.update(); } }),
    override: overridePanel({ ctx, record, getLang, save: saveRecord }),
  };
  const documentSection = h('section', { class: 'panel', dataset: { panel: 'document' } }, h('h3', {}, ctx.t('settings')), documentPanel);

  const tabList = [
    ['document', ctx.t('settings'), documentSection],
    ['outline', ctx.t('panel_outline'), panels.outline.el],
    ['checks', ctx.t('panel_checks'), panels.checks.el],
    ['find', ctx.t('panel_find'), panels.find.el],
    ['history', ctx.t('panel_history'), panels.history.el],
    ['typography', ctx.t('panel_typography'), h('div', {}, panels.override.el, panels.typography.el)],
  ];

  const tabButtons = new Map();
  const tabPanels = new Map();
  const tablist = h('div', { class: 'studio__tabs', role: 'tablist', 'aria-label': ctx.t('studio_sidebar') });
  for (const [name, label, el] of tabList) {
    const panelId = `studio-panel-${name}`;
    el.id = panelId; el.setAttribute('role', 'tabpanel'); el.setAttribute('aria-labelledby', `studio-tab-${name}`);
    const button = h('button', { type: 'button', role: 'tab', class: 'tab', id: `studio-tab-${name}`, 'aria-controls': panelId, dataset: { tab: name }, onclick: () => selectTab(name, { focus: false }) }, label);
    tabButtons.set(name, button); tabPanels.set(name, el);
    tablist.append(button);
  }
  tablist.addEventListener('keydown', (event) => {
    const names = tabList.map(([name]) => name);
    const forward = ctx.dir() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = ctx.dir() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const at = names.indexOf(state.tab);
    let to = null;
    if (event.key === forward) to = names[(at + 1) % names.length];
    else if (event.key === backward) to = names[(at - 1 + names.length) % names.length];
    else if (event.key === 'Home') to = names[0];
    else if (event.key === 'End') to = names[names.length - 1];
    if (to === null) return;
    event.preventDefault();
    selectTab(to, { focus: true });
  });

  const sidebar = h('aside', { class: 'card settings studio__side', 'aria-label': ctx.t('studio_sidebar') }, tablist, ...tabList.map(([, , el]) => el));

  function selectTab(name, { focus = false } = {}) {
    state.tab = name;
    for (const [key, button] of tabButtons) {
      const active = key === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      tabPanels.get(key).hidden = !active;
    }
    if (focus) tabButtons.get(name).focus();
    refreshPanel(name);
  }
  function refreshPanel(name) { panels[name]?.refresh?.(); }

  // ---------------------------------------------------------------- toolbar

  const stats = h('span', { class: 'studio__stats', role: 'status' });
  const saved = h('span', { class: 'chip studio__saved', role: 'status', dataset: { state: 'idle' } });
  const timeText = () => new Date().toLocaleTimeString(ctx.ui === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

  function setSaved(status) {
    saved.dataset.state = status;
    saved.textContent = status === 'saving' ? ctx.t('saved_saving')
      : status === 'saved' ? ctx.t('saved_at', { time: timeText() })
        : status === 'failed' ? ctx.t('saved_failed')
          : ctx.t(ctx.workspace.staged.has(rel) ? 'saved_pending' : 'saved_idle');
    saved.classList.toggle('chip--warn', status === 'failed');
  }
  setSaved('idle');
  const stopSaved = ctx.onDraftSaved(({ ok }) => setSaved(ok ? 'saved' : 'failed'));

  function updateStats() {
    const wpm = ctx.languages().find((l) => l.code === getLang())?.readingWpm ?? 200;
    const s = writingStats(getBlocks(), { wpm });
    stats.textContent = `${ctx.t('bar_words', { n: s.words })}${s.readingMinutes ? ` · ${ctx.t('stat_minutes', { n: s.readingMinutes })}` : ''}`;
  }

  const modeButtons = MODES.map((mode) => h('button', { type: 'button', class: 'button button--small', dataset: { mode }, 'aria-pressed': String(mode === state.mode), onclick: () => setMode(mode) }, ctx.t(`mode_${mode}`)));
  const undoButton = h('button', { type: 'button', class: 'button button--small', id: 'studio-undo', disabled: true, onclick: () => editor?.undo() }, ctx.t('undo'));
  const redoButton = h('button', { type: 'button', class: 'button button--small', id: 'studio-redo', disabled: true, onclick: () => editor?.redo() }, ctx.t('redo'));
  const templatesButton = kind === 'article' ? h('button', { type: 'button', class: 'button button--small', id: 'studio-templates', onclick: applyTemplate }, ctx.t('templates')) : null;
  const focusButton = h('button', { type: 'button', class: 'button button--small', id: 'studio-focus', 'aria-pressed': 'false', onclick: () => setFocus(!state.focus) }, ctx.t('focus_mode'));

  const bar = h('div', { class: 'studio__bar', role: 'toolbar', 'aria-label': ctx.t('studio_bar') },
    h('div', { class: 'preview__group', role: 'group', 'aria-label': ctx.t('mode_label') }, modeButtons),
    h('div', { class: 'preview__group', role: 'group', 'aria-label': ctx.t('history_label') }, undoButton, redoButton),
    templatesButton, focusButton,
    h('span', { class: 'spacer' }), stats, saved);

  function updateUndo() {
    undoButton.disabled = !editor?.canUndo;
    redoButton.disabled = !editor?.canRedo;
  }

  // ---------------------------------------------------------------- writing area and preview

  const write = h('div', { class: 'studio__write' });
  const previewPane = h('div', { class: 'studio__preview', hidden: true });
  const body = h('div', { class: 'studio__body', dataset: { mode: 'write' } }, write, previewPane);
  const surface = h('div', { class: 'studio' }, bar, body);

  function setMode(mode) {
    state.mode = mode;
    root.dataset.studioMode = mode;
    body.dataset.mode = mode;
    write.hidden = mode === 'preview';
    previewPane.hidden = mode === 'write';
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    if (mode !== 'write') {
      if (!preview) { preview = createPreview({ ctx, kind, id, lang: getLang, device: mode === 'split' ? 'phone' : 'desktop' }); previewPane.append(preview.element); }
      preview.refit();
      preview.update();
    }
  }

  function setFocus(on) {
    state.focus = on;
    document.body.classList.toggle('studio-focus', on);
    focusButton.setAttribute('aria-pressed', String(on));
    focusButton.textContent = ctx.t(on ? 'focus_exit' : 'focus_mode');
    if (on) toast(ctx.t('focus_hint'), 'info');
  }

  // ---------------------------------------------------------------- templates

  /** Insert or replace the body with a template. Asks first when there is already content. */
  async function applyTemplate() {
    if (!editor) return;
    const hasContent = editor.blocks.length > 0;
    const chosen = await pickTemplate(ctx, { replacing: hasContent });
    if (!chosen) return;
    let how = 'insert';
    if (hasContent) {
      how = await modal({
        title: ctx.t('tpl_how_title'),
        body: h('p', {}, ctx.t('tpl_how_message')),
        actions: (close) => [
          h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')),
          h('button', { type: 'button', class: 'button', id: 'tpl-append', onclick: () => close('append') }, ctx.t('tpl_append')),
          h('button', { type: 'button', class: 'button button--danger', id: 'tpl-replace', onclick: () => close('replace') }, ctx.t('tpl_replace')),
        ],
      });
      if (!how) return;
    }
    const blocks = templateBlocks(chosen, getLang(), [...usedIds(ctx.content()), ...editor.blocks.map((b) => b.id)]);
    if (how === 'replace') editor.replaceAll(blocks); else editor.insert(blocks);
    onTemplateApplied?.(chosen, how);
    const name = templateName(TEMPLATES.find((t) => t.id === chosen), ctx.ui);
    toast(ctx.t(how === 'replace' ? 'tpl_replaced' : 'tpl_added', { name }), 'info');
    editor.reveal(how === 'append' ? editor.blocks.length - blocks.length : 0);
  }

  // ---------------------------------------------------------------- keyboard

  /**
   * Ctrl/Cmd+Z, Shift+Z and Y act on the whole block list while the cursor is in the blocks (or nowhere in
   * particular). In another text box (the title, the find box…) the browser's own undo stays in charge.
   * Physical key codes are used so that it also works on an Arabic keyboard layout.
   */
  function onKeydown(event) {
    if (event.key === 'Escape' && state.focus && !document.querySelector('dialog[open]')) { setFocus(false); return; }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || !editor || event.isComposing) return;
    const undo = event.code === 'KeyZ' && !event.shiftKey;
    const redo = (event.code === 'KeyZ' && event.shiftKey) || event.code === 'KeyY';
    if (!undo && !redo) return;
    const target = event.target instanceof Element ? event.target : null;
    const inBlocks = Boolean(target?.closest('.blocks'));
    if (!inBlocks && target?.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    if (undo) editor.undo(); else editor.redo();
  }
  document.addEventListener('keydown', onKeydown);

  // ---------------------------------------------------------------- change flow

  function refreshAll() {
    updateStats();
    refreshPanel(state.tab);
    if (state.mode !== 'write') preview?.update();
  }

  /** Call after every change to the record (the views call it from their `save`). */
  function changed() {
    setSaved('saving');
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAll, 250);
  }

  // ---------------------------------------------------------------- public

  selectTab('document');
  setMode('write');

  return {
    sidebar,
    changed,
    /** Show `blocksEditor` (made for the language now being edited) inside the Studio; returns the element to place in the page. */
    mount(blocksEditor) {
      unsubscribeHistory();
      editor = blocksEditor;
      unsubscribeHistory = editor.onHistory(() => { updateUndo(); });
      write.replaceChildren(editor.el);
      updateUndo(); updateStats();
      for (const panel of Object.values(panels)) { if (panel.onLanguageChange) panel.onLanguageChange(); else panel.refresh?.(); }
      preview?.update();
      return surface;
    },
    /** Switch the sidebar to a panel (used by the tests and by links elsewhere on the page). */
    show: selectTab,
    dispose() {
      document.removeEventListener('keydown', onKeydown);
      document.body.classList.remove('studio-focus');
      clearTimeout(refreshTimer);
      stopSaved();
      unsubscribeHistory();
      preview?.destroy();
      delete root.dataset.studioMode;
    },
  };
}
