// Appearance Studio: colours and presets, Glass Mode, layout, and typography, with the site's own page drawn
// beside the controls. Each tab lives in its own file and works through the small `env` object below, which is
// the only way they touch the workspace; every change is staged like any other edit and published from
// "Review & publish".

import { h, tabs, field, selectInput } from '../dom.mjs';
import { createPreview } from '../preview.mjs';
import { problemsPanel } from './editor-common.mjs';
import { drawGlass } from './appearance-glass.mjs';
import { drawLayout } from './appearance-layout.mjs';
import { drawLook } from './appearance-look.mjs';
import { drawType } from './appearance-type.mjs';

const FILES = { design: 'config/design.json', presets: 'config/presets.json', languages: 'config/languages.json' };
const TABS = ['look', 'glass', 'layout', 'type'];
const PAGES = ['home', 'blog', 'portfolio', 'topics', 'about'];

export function renderAppearance(ctx) {
  const langs = ctx.languages();
  const state = { tab: 'look', page: 'home', lang: langs.some((l) => l.code === ctx.ui) ? ctx.ui : langs[0].code };

  const root = h('div', { class: 'editor appearance' });
  const panel = problemsPanel(ctx, root, Object.values(FILES));
  const tabHost = h('div');
  const body = h('div', { class: 'appearance__body' });
  const preview = createPreview({ ctx, kind: () => state.page, lang: () => state.lang });

  /** What a tab needs: the data, ways to change it, and the preview. Reads are fresh copies; writes stage the change. */
  const env = {
    ctx,
    languages: langs,
    design: () => ctx.workspace.read(FILES.design),
    presets: () => ctx.workspace.read(FILES.presets).items,
    languageFile: () => ctx.workspace.read(FILES.languages),
    writeDesign(design) { ctx.workspace.write(FILES.design, design); env.changed(); },
    writePresets(items) { const file = ctx.workspace.read(FILES.presets); file.items = items; ctx.workspace.write(FILES.presets, file); env.changed(); },
    writeLanguages(file) { ctx.workspace.write(FILES.languages, file); env.changed(); },
    changed() { ctx.changed(); preview.update(); panel.repaint(); },
    /** Draw this tab again from the stored data (after structural changes such as choosing a preset). */
    redraw: () => draw(),
    /** Show a language in the preview (used when a tab edits one language). */
    previewLang(code) { if (state.lang !== code) { state.lang = code; drawPreviewBar(); preview.update(); } },
  };

  const previewBar = h('div', { class: 'appearance__previewbar' });
  function drawPreviewBar() {
    previewBar.replaceChildren(
      field({ label: ctx.t('ap_preview_page'), control: selectInput({ value: state.page, options: PAGES.map((p) => ({ value: p, label: ctx.t(`ap_page_${p}`) })), onChange: (v) => { state.page = v; preview.update(); } }) }),
      field({ label: ctx.t('ap_lang'), control: selectInput({ value: state.lang, options: langs.map((l) => ({ value: l.code, label: l.nativeName })), onChange: (v) => { state.lang = v; preview.update(); } }) }));
  }

  const label = { look: 'ap_tab_look', glass: 'ap_tab_glass', layout: 'ap_tab_layout', type: 'ap_tab_type' };
  function drawTabs() {
    tabHost.replaceChildren(tabs({ items: TABS.map((t) => ({ value: t, label: ctx.t(label[t]) })), active: state.tab, onSelect: (t) => { state.tab = t; drawTabs(); draw(); } }));
  }
  const DRAW = { look: drawLook, glass: drawGlass, layout: drawLayout, type: drawType };
  function draw() { body.replaceChildren(DRAW[state.tab](env)); panel.repaint(); }

  root.append(
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('ap_title'))),
    h('p', { class: 'muted' }, ctx.t('ap_intro'), ' ', ctx.t('unpublished_changes_note')),
    panel.el,
    h('div', { class: 'appearance__grid' },
      h('div', { class: 'appearance__controls' }, tabHost, body),
      h('div', { class: 'appearance__preview' }, previewBar, preview.element)));
  drawPreviewBar(); drawTabs(); draw();
  queueMicrotask(() => preview.refit());
  return { el: root, dispose: () => { panel.dispose(); preview.destroy(); } };
}
