// The Navigation manager: the header menu and the footer links, one list per language.

import { linkProblem } from '../../shared/core/editing.mjs';
import { newId } from '../../shared/core/ids.mjs';
import { confirmDialog, field, h, selectInput, tabs, textInput } from '../dom.mjs';
import { createPreview } from '../preview.mjs';
import { problemsPanel } from './editor-common.mjs';

const REL = 'config/navigation.json';
const PAGES = ['home', 'about', 'portfolio', 'blog', 'topics', 'tags', 'search', 'contact'];
const FALLBACK = ['home', 'blog', 'portfolio', 'about', 'contact'];
const REGIONS = ['header', 'footer'];

export function renderNavigation(ctx) {
  const file = ctx.workspace.read(REL);
  const languages = ctx.languages();
  let lang = languages.find((l) => l.code === ctx.ui)?.code ?? languages[0].code;
  const root = h('div', { class: 'navigation' });
  const panel = problemsPanel(ctx, root, REL);
  const preview = createPreview({ ctx, kind: 'home', lang: () => lang });
  const tabHost = h('div');
  const regionHost = h('div', { class: 'navigation__regions' });

  const save = () => { ctx.workspace.write(REL, file); ctx.changed(); preview.update(); };
  const usedIds = () => new Set(REGIONS.flatMap((r) => Object.values(file[r]).flat().map((i) => i.id)));

  /** The wording the public site itself uses for a page, so a new item reads like the rest of the site. */
  const siteLabel = (page) => ctx.content().i18n?.[lang]?.strings?.[page] ?? ctx.t(`nv_page_${page}`);
  const makeItem = (page) => ({ id: newId('nav', usedIds()), label: siteLabel(page), target: { page } });

  function itemRow(region, items, i) {
    const item = items[i];
    const base = `${region}.${lang}[${i}]`;
    const external = Object.hasOwn(item.target, 'url');
    const dir = ctx.langDir(lang);
    const urlError = h('p', { class: 'inline-error', role: 'alert', hidden: true });
    const showUrlProblem = () => {
      const problem = external ? linkProblem(item.target.url) : null;
      urlError.hidden = !problem;
      urlError.textContent = problem ? ctx.t(`link_problem_${problem}`) : '';
    };
    const kind = selectInput({
      value: external ? 'url' : item.target.page,
      options: [...PAGES.map((p) => ({ value: p, label: ctx.t(`nv_page_${p}`) })), { value: 'url', label: ctx.t('nv_external') }],
      onChange: (v) => {
        item.target = v === 'url' ? { url: 'https://' } : { page: v };
        save(); drawRegions();
      },
    });
    kind.setAttribute('aria-label', ctx.t('nv_target'));
    kind.dataset.navTarget = item.id;
    const move = (delta) => { const to = i + delta; if (to < 0 || to >= items.length) return; [items[i], items[to]] = [items[to], items[i]]; save(); drawRegions(); };
    return h('li', { class: 'navitem', dataset: { navItem: item.id } },
      field({ label: ctx.t('nv_label'), path: `${base}.label`, control: textInput({ value: item.label, dir, lang, maxLength: 40, onInput: (v) => { item.label = v; save(); } }) }),
      field({ label: ctx.t('nv_target'), control: kind }),
      external ? field({ label: ctx.t('nv_url'), path: `${base}.target.url`, hint: ctx.t('nv_url_hint'), control: textInput({ value: item.target.url, dir: 'ltr', onInput: (v) => { item.target.url = v.trim(); showUrlProblem(); save(); } }) }) : null,
      external ? urlError : null,
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'button button--small', disabled: i === 0 || null, 'aria-label': ctx.t('move_up'), title: ctx.t('move_up'), dataset: { navUp: item.id }, onclick: () => move(-1) }, '↑'),
        h('button', { type: 'button', class: 'button button--small', disabled: i === items.length - 1 || null, 'aria-label': ctx.t('move_down'), title: ctx.t('move_down'), dataset: { navDown: item.id }, onclick: () => move(1) }, '↓'),
        h('button', { type: 'button', class: 'button button--small button--danger', dataset: { navRemove: item.id }, onclick: () => { items.splice(i, 1); save(); drawRegions(); } }, ctx.t('delete'))));
  }

  function region(name) {
    const items = file[name][lang];
    const card = h('section', { class: 'card', dataset: { region: name } }, h('h2', {}, ctx.t(`nv_${name}`)), h('p', { class: 'muted' }, ctx.t(`nv_${name}_hint`)));
    if (!items) {
      card.append(
        h('p', { class: 'notice' }, ctx.t(`nv_${name}_fallback`)),
        h('button', { type: 'button', class: 'button', dataset: { navCreate: name }, onclick: () => { file[name][lang] = FALLBACK.map(makeItem); save(); drawRegions(); } }, ctx.t('nv_create')));
      return card;
    }
    const picker = selectInput({ value: 'blog', options: [...PAGES.map((p) => ({ value: p, label: ctx.t(`nv_page_${p}`) })), { value: 'url', label: ctx.t('nv_external') }] });
    picker.setAttribute('aria-label', ctx.t('nv_add_what'));
    card.append(
      items.length ? h('ol', { class: 'navitems' }, items.map((_, i) => itemRow(name, items, i))) : h('p', { class: 'muted' }, ctx.t('nv_empty')),
      h('div', { class: 'navadd' }, picker,
        h('button', { type: 'button', class: 'button', dataset: { navAdd: name }, onclick: () => {
          items.push(picker.value === 'url' ? { id: newId('nav', usedIds()), label: ctx.t('nv_external_label'), target: { url: 'https://' } } : makeItem(picker.value));
          save(); drawRegions();
        } }, ctx.t('nv_add'))),
      h('button', { type: 'button', class: 'button button--small button--danger', dataset: { navClear: name }, onclick: async () => {
        const ok = await confirmDialog({ title: ctx.t('nv_clear_title'), message: ctx.t('nv_clear_message'), confirmLabel: ctx.t('nv_clear'), cancelLabel: ctx.t('cancel'), danger: true });
        if (ok) { delete file[name][lang]; save(); drawRegions(); }
      } }, ctx.t('nv_clear')));
    return card;
  }

  function drawRegions() {
    regionHost.replaceChildren(...REGIONS.map(region));
    panel.repaint();
  }

  function drawTabs() {
    tabHost.replaceChildren(tabs({ items: languages.map((l) => ({ value: l.code, label: l.nativeName })), active: lang, onSelect: (code) => { lang = code; drawTabs(); drawRegions(); preview.update(); } }));
  }
  drawTabs();

  root.append(
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('nav_navigation'))),
    h('p', { class: 'muted' }, ctx.t('nv_intro')),
    panel.el, tabHost, regionHost,
    h('div', { class: 'card' }, h('h2', {}, ctx.t('preview_title')), preview.element));
  drawRegions();
  queueMicrotask(() => preview.refit());
  return { el: root, dispose: () => { panel.dispose(); preview.destroy(); } };
}
