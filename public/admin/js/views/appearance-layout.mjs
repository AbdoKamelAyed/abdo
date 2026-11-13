// Layout tab (Layout Manager): per language, the page and text width, breakpoints, columns, spacing and padding
// for desktop, tablet and phone, card style, header, footer and menu style. The rules are in src/core/layout.mjs.

import { DEFAULT_BREAKPOINTS, DEVICES, isLength, layoutIssues, OPTIONS, setLayoutValue } from '../../shared/core/layout.mjs';
import { checkInput, field, h, selectInput, tabs, textInput } from '../dom.mjs';

const DEVICE_LABEL = { desktop: 'lay_dev_desktop', tablet: 'lay_dev_tablet', mobile: 'lay_dev_mobile' };
const DEVICE_FIELDS = [['columns', 'ap_columns'], ['gap', 'ap_gap'], ['sectionSpacing', 'ap_sec_space'], ['pagePadding', 'ap_page_pad']];

export function drawLayout(env) {
  const { ctx } = env;
  let lang = env.languages.some((l) => l.code === ctx.ui) ? ctx.ui : env.languages[0].code;
  const root = h('div');
  const tabHost = h('div');
  const body = h('div');

  function current() {
    const file = env.languageFile();
    const item = file.items.find((l) => l.code === lang);
    return { file, item };
  }
  /** Change one layout value in the stored file. */
  function put(path, value) {
    const { file, item } = current();
    item.layout = setLayoutValue(item.layout, path, value);
    env.writeLanguages(file);
    check();
  }

  const issues = h('p', { class: 'inline-error', role: 'alert', hidden: true });
  function check() {
    const problems = layoutIssues(current().item.layout).filter((p) => p.level === 'error');
    issues.hidden = problems.length === 0;
    issues.textContent = problems.length ? ctx.t('ap_bp_order') : '';
  }

  /** A text box for a CSS length. Empty = default (where allowed); anything else must be a plain length. */
  function lengthBox({ value, path, required = false }) {
    const error = h('span', { class: 'inline-error', role: 'alert', hidden: true }, ctx.t('ap_length_invalid'));
    const input = textInput({ value: value ?? '', dir: 'ltr', placeholder: required ? '' : ctx.t('ap_default') });
    input.dataset.layout = path.join('.');
    input.addEventListener('change', () => {
      const text = input.value.trim();
      if (text === '' && !required) { error.hidden = true; put(path, null); return; }
      if (!isLength(text)) { error.hidden = false; return; }
      error.hidden = true; put(path, text);
    });
    return h('div', {}, input, h('span', { class: 'field__hint' }, ctx.t('ap_length_hint')), error);
  }

  const optionName = {
    cards: (o) => ctx.t(`ap_cards_${o}`), header: (o) => ctx.t(`ap_header_${o}`),
    footer: (o) => ctx.t(`ap_footer_${o}`), nav: (o) => ctx.t(`ap_nav_${o}`),
  };
  const choice = (key, label) => {
    const { item } = current();
    const select = selectInput({ value: item.layout[key] ?? '', options: [{ value: '', label: ctx.t('ap_default') }, ...OPTIONS[key].map((o) => ({ value: o, label: optionName[key](o) }))], onChange: (v) => put([key], v || null) });
    select.dataset.layout = key;
    return field({ label: ctx.t(label), control: select });
  };

  function drawBody() {
    const { item } = current();
    const layout = item.layout;
    const bp = layout.breakpoints ?? {};
    const number = (path, value, placeholder) => {
      const input = textInput({ type: 'number', value: value ?? '', placeholder: String(placeholder) });
      input.dataset.layout = path.join('.');
      input.addEventListener('change', () => put(path, input.value === '' ? null : Math.round(Number(input.value))));
      return input;
    };
    const deviceCard = (device) => {
      const d = layout.devices?.[device] ?? {};
      const columns = selectInput({ value: d.columns === undefined ? '' : String(d.columns), options: [{ value: '', label: ctx.t('ap_default') }, ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))], onChange: (v) => put(['devices', device, 'columns'], v === '' ? null : Number(v)) });
      columns.dataset.layout = `devices.${device}.columns`;
      return h('section', { class: 'card', dataset: { device } }, h('h3', {}, ctx.t(DEVICE_LABEL[device])),
        h('div', { class: 'grid2' }, field({ label: ctx.t('ap_columns'), control: columns }),
          ...DEVICE_FIELDS.slice(1).map(([key, label]) => field({ label: ctx.t(label), control: lengthBox({ value: d[key], path: ['devices', device, key] }) }))));
    };

    body.replaceChildren(
      h('div', { class: 'card' }, h('div', { class: 'grid2' },
        field({ label: ctx.t('ap_content_width'), control: lengthBox({ value: layout.contentWidth, path: ['contentWidth'], required: true }) }),
        field({ label: ctx.t('ap_measure'), control: lengthBox({ value: layout.measure, path: ['measure'], required: true }) }),
        choice('cards', 'ap_cards'), choice('header', 'ap_header'), choice('footer', 'ap_footer'), choice('nav', 'ap_nav'),
        checkInput({ label: ctx.t('ap_sticky'), checked: layout.stickyHeader !== false, onChange: (v) => put(['stickyHeader'], v ? null : false) }))),
      h('h3', {}, ctx.t('ap_devices')),
      h('div', { class: 'grid2' },
        field({ label: ctx.t('ap_bp_tablet'), control: number(['breakpoints', 'tablet'], bp.tablet, DEFAULT_BREAKPOINTS.tablet) }),
        field({ label: ctx.t('ap_bp_mobile'), control: number(['breakpoints', 'mobile'], bp.mobile, DEFAULT_BREAKPOINTS.mobile) })),
      issues,
      ...DEVICES.map(deviceCard));
    check();
  }

  function drawTabs() {
    tabHost.replaceChildren(tabs({ items: env.languages.map((l) => ({ value: l.code, label: l.nativeName })), active: lang, onSelect: (code) => { lang = code; env.previewLang(code); drawTabs(); drawBody(); } }));
  }

  root.append(h('div', { class: 'card' }, h('h2', {}, ctx.t('ap_layout')), h('p', { class: 'muted' }, ctx.t('ap_layout_intro')), tabHost), body);
  env.previewLang(lang); drawTabs(); drawBody();
  return root;
}
