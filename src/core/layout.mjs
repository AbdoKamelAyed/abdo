// Layout Manager logic: turns one language's `layout` settings (content/config/languages.json) into CSS and
// page attributes, and checks them. Pure. The build, the live preview and the tests all use it.
//
// Everything is optional. A language that says nothing keeps the site's default look, so older content and
// older presets render exactly as before.
//
// Responsive model: three sizes. Desktop settings apply everywhere; tablet settings apply at the tablet
// breakpoint and narrower; mobile settings apply at the mobile breakpoint and narrower (later rules win).

export const DEVICES = ['desktop', 'tablet', 'mobile'];
export const OPTIONS = {
  cards: ['flat', 'outlined', 'elevated'],
  header: ['classic', 'centered', 'compact'],
  footer: ['columns', 'centered', 'minimal'],
  nav: ['underline', 'pill', 'plain'],
};
export const DEFAULTS = { cards: 'outlined', header: 'classic', footer: 'columns', nav: 'underline', stickyHeader: true };
export const DEFAULT_BREAKPOINTS = Object.freeze({ tablet: 1024, mobile: 640 });
export const COLUMN_RANGE = Object.freeze({ min: 1, max: 4 });

const LENGTH = /^[0-9]+(\.[0-9]+)?(px|rem|em|ch|vw|%)$/;

/** The page-shape choices for a language, with defaults filled in. */
export function shapeOf(layout = {}) {
  const pick = (key) => (OPTIONS[key].includes(layout[key]) ? layout[key] : DEFAULTS[key]);
  return { cards: pick('cards'), header: pick('header'), footer: pick('footer'), nav: pick('nav'), sticky: layout.stickyHeader === false ? 'off' : 'on' };
}

export function breakpointsOf(layout = {}) {
  return { tablet: layout.breakpoints?.tablet ?? DEFAULT_BREAKPOINTS.tablet, mobile: layout.breakpoints?.mobile ?? DEFAULT_BREAKPOINTS.mobile };
}

/** Attributes written on <html> so the stylesheet can switch header, footer, menu and header behaviour. */
export function htmlAttributes(layout = {}) {
  const s = shapeOf(layout);
  return `data-header="${s.header}" data-footer="${s.footer}" data-nav="${s.nav}" data-sticky="${s.sticky}"`;
}

function deviceRules(sel, d = {}) {
  const out = [];
  const vars = [];
  if (d.sectionSpacing && LENGTH.test(d.sectionSpacing)) vars.push(`--section-space:${d.sectionSpacing};`);
  if (d.pagePadding && LENGTH.test(d.pagePadding)) vars.push(`--gutter:${d.pagePadding};`);
  if (vars.length) out.push(`${sel}{${vars.join('')}}`);
  if (Number.isInteger(d.columns) && d.columns >= COLUMN_RANGE.min && d.columns <= COLUMN_RANGE.max) {
    out.push(`${sel} .grid{grid-template-columns:repeat(${d.columns},minmax(0,1fr));}`);
  }
  if (d.gap && LENGTH.test(d.gap)) out.push(`${sel} .grid,${sel} .stack{gap:${d.gap};}`);
  return out;
}

/** The stylesheet text for one language's layout (empty when it only uses defaults). */
export function layoutCss(language) {
  const layout = language.layout ?? {};
  const sel = `html[lang="${language.code}"]`;
  const out = [];

  const cards = layout.cards ?? DEFAULTS.cards;
  if (cards === 'flat') out.push(`${sel} .card{background:transparent;border-color:transparent;}`);
  if (cards === 'elevated') out.push(`${sel} .card{border-color:transparent;box-shadow:var(--card-shadow,0 10px 30px rgb(0 0 0 / 0.12));}`);

  const bp = breakpointsOf(layout);
  const devices = layout.devices ?? {};
  out.push(...deviceRules(sel, devices.desktop));
  for (const [name, max] of [['tablet', bp.tablet], ['mobile', bp.mobile]]) {
    const rules = deviceRules(sel, devices[name]);
    if (rules.length) out.push(`@media (max-width:${max}px){${rules.join('')}}`);
  }
  return out.join('\n');
}

/**
 * Problems with one language's layout that the JSON Schema cannot express.
 * @returns {{ path: (string|number)[], message: string, level: 'error'|'warning' }[]}
 */
export function layoutIssues(layout = {}) {
  const out = [];
  const bp = breakpointsOf(layout);
  if (bp.tablet <= bp.mobile) out.push({ path: ['breakpoints'], level: 'error', message: `the tablet breakpoint (${bp.tablet}px) must be wider than the mobile breakpoint (${bp.mobile}px)` });
  const rem = (v) => (typeof v === 'string' && v.endsWith('rem') ? parseFloat(v) : null);
  const width = rem(layout.contentWidth);
  const measure = rem(layout.measure);
  if (width !== null && measure !== null && measure > width) out.push({ path: ['measure'], level: 'warning', message: 'the text column is wider than the page, so it will never reach this width' });
  for (const [name, d] of Object.entries(layout.devices ?? {})) {
    const space = rem(d?.sectionSpacing);
    if (space !== null && space > 12) out.push({ path: ['devices', name, 'sectionSpacing'], level: 'warning', message: `${d.sectionSpacing} of space around every section leaves very little room for content` });
    const pad = rem(d?.pagePadding);
    if (name === 'mobile' && pad !== null && pad > 3) out.push({ path: ['devices', name, 'pagePadding'], level: 'warning', message: `${d.pagePadding} of padding on each side of a phone screen leaves very little room for text` });
  }
  return out;
}

const REQUIRED_KEYS = new Set(['contentWidth', 'measure']);

/**
 * Set (or, for null / '' / undefined, remove) one value of a language's layout at `path`, for example
 * `['devices', 'tablet', 'columns']`. Groups left empty are removed, so the file lists real choices only.
 * `contentWidth` and `measure` are required by the schema and are never removed.
 * @returns {object} a new layout
 */
export function setLayoutValue(layout, path, value) {
  const next = structuredClone(layout ?? {});
  const empty = value === null || value === undefined || value === '';
  if (empty && path.length === 1 && REQUIRED_KEYS.has(path[0])) return next;
  const chain = [next];
  for (const key of path.slice(0, -1)) {
    if (chain.at(-1)[key] === undefined) { if (empty) return next; chain.at(-1)[key] = {}; }
    chain.push(chain.at(-1)[key]);
  }
  const last = path.at(-1);
  if (empty) delete chain.at(-1)[last]; else chain.at(-1)[last] = value;
  for (let i = chain.length - 1; i > 0; i -= 1) {
    if (Object.keys(chain[i]).length === 0) delete chain[i - 1][path[i - 1]];
  }
  return next;
}

/** Is `value` a length the schema and the stylesheet accept (for example 1.5rem)? */
export const isLength = (value) => LENGTH.test(String(value));
