// What the Studio edits in every block type: one declarative description per type.
//
// Pure data and helpers (no DOM), shared by the admin screens and the tests. The tests compare these
// specs with schemas/block.schema.json, so a field or option added to the schema without an editor
// (or without an Arabic and English label) fails the build instead of silently being uneditable.
//
// Label strings: field label `f_<key>` (or `label`), option label `o_<key>_<value>` (or `prefix`),
// group item name `item_<type>`. See optionLabelKey().

import { newId } from './ids.mjs';

const ALIGN = ['start', 'center', 'end', 'justify'];
const DIR = ['auto', 'ltr', 'rtl'];
const RATIO = ['auto', '1:1', '4:3', '3:2', '16:9', '2:3'];

// ---- field builders --------------------------------------------------------------------------------

/** Inline-markup text on one line. */
const text = (key, o = {}) => ({ key, kind: 'text', ...o });
/** Inline-markup text over several lines. */
const long = (key, o = {}) => ({ key, kind: 'long', rows: 3, ...o });
/** Literal text (never interpreted as markup). */
const plain = (key, o = {}) => ({ key, kind: 'plain', ...o });
const code = (key, o = {}) => ({ key, kind: 'code', rows: 8, ...o });
const choice = (key, options, o = {}) => ({ key, kind: 'enum', options, optional: true, ...o });
const bool = (key, o = {}) => ({ key, kind: 'bool', default: false, ...o });
const media = (key, o = {}) => ({ key, kind: 'media', ...o });
const lines = (key, o = {}) => ({ key, kind: 'lines', rows: 5, ...o });
const group = (key, itemFields, o = {}) => ({ key, kind: 'group', itemFields, ...o });

const ADVANCED_TEXT = [choice('align', ALIGN, { advanced: true }), choice('dir', DIR, { advanced: true })];

/** Presentation options every block supports. Stored under `display`; a fixed set, never free CSS. */
export const DISPLAY_FIELDS = [
  choice('spacing', ['compact', 'normal', 'relaxed'], { path: ['display', 'spacing'] }),
  choice('width', ['narrow', 'normal', 'wide', 'full'], { path: ['display', 'width'] }),
  choice('tone', ['none', 'subtle', 'accent', 'inverse'], { path: ['display', 'tone'], prefix: 'o_dtone', label: 'f_dtone' }),
];

export const SPECS = {
  paragraph: { fields: [
    long('text', { required: true, rows: 5 }),
    choice('style', ['body', 'intro', 'lead', 'standfirst', 'caption', 'byline', 'small', 'highlight']),
    bool('dropCap', { advanced: true }), bool('smallCaps', { advanced: true }), ...ADVANCED_TEXT,
  ] },
  heading: { fields: [
    choice('level', [2, 3, 4, 5, 6], { optional: false, numeric: true, required: true, labels: 'heading' }),
    text('text', { required: true }), ...ADVANCED_TEXT,
  ] },
  quote: { fields: [
    long('text', { required: true, label: 'f_quote' }), text('cite'), choice('variant', ['block', 'pull']), choice('dir', DIR, { advanced: true }),
  ] },
  list: { fields: [
    bool('ordered'), lines('items', { required: true, hint: 'h_list_items', nested: true }), choice('dir', DIR, { advanced: true }),
  ] },
  image: { fields: [
    media('mediaId', { required: true, label: 'f_image' }), text('caption'), plain('alt', { hint: 'h_alt_override' }),
    choice('size', ['inline', 'wide', 'full']), choice('aspect', RATIO, { labels: 'ratio' }),
    choice('border', ['none', 'thin', 'thick'], { advanced: true }), choice('radius', ['none', 'sm', 'lg', 'round'], { advanced: true }),
  ] },
  callout: { fields: [
    choice('tone', ['note', 'tip', 'warning'], { optional: false, default: 'note' }), text('title'), long('text', { required: true }),
  ] },
  divider: { fields: [] },
  checklist: { fields: [
    text('title'),
    group('items', [text('text', { required: true }), bool('checked'), choice('level', [0, 1, 2, 3], { optional: false, numeric: true, default: 0, dropDefault: true, labels: 'level', label: 'f_indent' })], { required: true, minItems: 1 }),
  ] },
  definitions: { fields: [
    group('items', [text('term', { required: true }), long('definition', { required: true, rows: 2 })], { required: true, minItems: 1 }),
  ] },
  code: { fields: [
    code('text', { required: true, label: 'f_code' }), plain('language', { maxLength: 24, hint: 'h_language' }), text('caption'),
  ] },
  table: { fields: [
    { key: 'rows', kind: 'grid', required: true },
    bool('header', { default: true }),
    { key: 'align', kind: 'aligns', options: ['start', 'center', 'end'], advanced: true },
    text('caption'),
  ] },
  gallery: { fields: [
    group('items', [media('mediaId', { required: true, label: 'f_image' }), text('caption'), plain('alt', { hint: 'h_alt_override' })], { required: true, minItems: 2, maxItems: 24 }),
    choice('columns', [2, 3, 4], { numeric: true, labels: 'number' }), choice('ratio', RATIO, { labels: 'ratio' }), text('caption'),
  ] },
  compare: { fields: [
    media('beforeId', { required: true, label: 'f_before' }), text('beforeLabel'), plain('beforeAlt', { hint: 'h_alt_override' }),
    media('afterId', { required: true, label: 'f_after' }), text('afterLabel'), plain('afterAlt', { hint: 'h_alt_override' }),
    text('caption'),
  ] },
  imagetext: { fields: [
    media('mediaId', { required: true, label: 'f_image' }), choice('side', ['start', 'end']),
    long('text', { required: true, rows: 5 }), text('caption'), plain('alt', { hint: 'h_alt_override' }),
  ] },
  factbox: { fields: [
    text('title'), group('items', [text('label', { required: true }), text('value', { required: true })], { required: true, minItems: 1 }), long('note', { rows: 2 }),
  ] },
  timeline: { fields: [
    text('title'), group('events', [text('date'), text('title', { required: true }), long('text', { rows: 2 })], { required: true, minItems: 1 }),
  ] },
  stats: { fields: [
    group('items', [plain('value', { required: true, maxLength: 24 }), text('label', { required: true }), text('note')], { required: true, minItems: 1, maxItems: 6 }),
  ] },
  related: { fields: [
    text('title'), { key: 'items', kind: 'refs', required: true, minItems: 1, maxItems: 6 },
  ] },
  author: { fields: [long('note', { rows: 2 })] },
  footnotes: { fields: [
    text('title'), group('items', [plain('key', { required: true, maxLength: 20, hint: 'h_footnote_key' }), long('text', { required: true, rows: 2 })], { required: true, minItems: 1 }),
  ] },
  references: { fields: [
    text('title'), group('items', [long('text', { required: true, rows: 2 }), plain('url', { hint: 'h_reference_url' })], { required: true, minItems: 1 }),
  ] },
};

/** Options for the "kind" of a related item, which has its own labels. */
export const RELATED_KINDS = ['article', 'project'];

// ---- labels --------------------------------------------------------------------------------------

export const fieldLabelKey = (field) => field.label ?? `f_${field.key}`;

/**
 * The string key that labels one option of an enum field, or null when the option is shown as it is
 * (heading levels "H2", ratios "16:9", column counts).
 */
export function optionLabelKey(field, value) {
  if (field.labels === 'heading') return null;
  if (field.labels === 'number' || field.labels === 'level') return null;
  if (field.labels === 'ratio') return value === 'auto' ? 'o_ratio_auto' : null;
  return `${field.prefix ?? `o_${field.key}`}_${value}`;
}

export const optionText = (field, value) => (field.labels === 'heading' ? `H${value}` : field.labels === 'level' ? String(Number(value) + 1) : String(value));

/** Every string key the specs may ask for, for the completeness test. */
export function allLabelKeys() {
  const keys = new Set(['f_alt_text']);
  const visit = (field) => {
    keys.add(fieldLabelKey(field));
    if (field.hint) keys.add(field.hint);
    for (const value of field.options ?? []) { const k = optionLabelKey(field, value); if (k) keys.add(k); }
    for (const sub of field.itemFields ?? []) visit(sub);
  };
  for (const [type, spec] of Object.entries(SPECS)) {
    if (spec.fields.some((f) => f.kind === 'group' || f.kind === 'refs')) keys.add(`item_${type}`);
    spec.fields.forEach(visit);
  }
  DISPLAY_FIELDS.forEach(visit);
  for (const kind of RELATED_KINDS) keys.add(`o_rkind_${kind}`);
  return keys;
}

// ---- reading and writing a field of a block ---------------------------------------------------------

export function readField(block, field) {
  const path = field.path ?? [field.key];
  let node = block;
  for (const key of path) { node = node?.[key]; if (node === undefined) break; }
  if (node !== undefined) return node;
  if (field.kind === 'bool') return field.default;
  if (field.kind === 'enum' && !field.optional) return field.default ?? field.options[0];
  return field.kind === 'enum' ? '' : undefined;
}

/**
 * Store a field value the way the schema wants it: empty optional values and defaults are removed
 * rather than saved as empty strings, so the files stay small and valid.
 */
export function writeField(block, field, value) {
  const path = field.path ?? [field.key];
  let parent = block;
  for (const key of path.slice(0, -1)) parent = parent[key] ??= {};
  const last = path.at(-1);
  let next = value;
  if (field.kind === 'enum' && field.numeric && value !== '') next = Number(value);
  const isDefaultBool = field.kind === 'bool' && value === field.default;
  const isDefaultChoice = field.dropDefault && next === field.default;
  const empty = next === '' || next == null || isDefaultBool || isDefaultChoice || (Array.isArray(next) && !next.length && !field.required);
  if (empty && !field.required) delete parent[last];
  else parent[last] = next;
  // Do not leave an empty `display: {}` behind.
  if (path.length > 1) for (let depth = path.length - 1; depth > 0; depth -= 1) {
    const holder = path.slice(0, depth).reduce((n, k) => n?.[k], block);
    if (holder && typeof holder === 'object' && !Object.keys(holder).length) {
      const up = path.slice(0, depth - 1).reduce((n, k) => n?.[k], block);
      delete up[path[depth - 1]];
    }
  }
  return block;
}

// ---- creating blocks -------------------------------------------------------------------------------

/** A new, empty block of `type`. Required text starts empty, so the validator asks for it until it is written. */
export function blockSkeleton(type, id) {
  const base = { id, type };
  switch (type) {
    case 'paragraph': case 'quote': return { ...base, text: '' };
    case 'heading': return { ...base, level: 2, text: '' };
    case 'list': return { ...base, items: [''] };
    case 'image': return { ...base, mediaId: '' };
    case 'callout': return { ...base, tone: 'note', text: '' };
    case 'divider': case 'author': return base;
    case 'checklist': return { ...base, items: [{ text: '' }] };
    case 'definitions': return { ...base, items: [{ term: '', definition: '' }] };
    case 'code': return { ...base, text: '' };
    case 'table': return { ...base, rows: [['', ''], ['', '']] };
    case 'gallery': return { ...base, items: [{ mediaId: '' }, { mediaId: '' }] };
    case 'compare': return { ...base, beforeId: '', afterId: '' };
    case 'imagetext': return { ...base, mediaId: '', text: '' };
    case 'factbox': return { ...base, items: [{ label: '', value: '' }] };
    case 'timeline': return { ...base, events: [{ title: '' }] };
    case 'stats': return { ...base, items: [{ value: '', label: '' }] };
    case 'related': return { ...base, items: [{ kind: 'article', id: '' }] };
    case 'footnotes': return { ...base, items: [{ key: 'n1', text: '' }] };
    case 'references': return { ...base, items: [{ text: '' }] };
    default: throw new Error(`Unknown block type "${type}"`);
  }
}

/** A new item for a group field (a checklist task, a table row...). */
export function itemSkeleton(field) {
  const item = {};
  for (const sub of field.itemFields) if (sub.required) item[sub.key] = '';
  return item;
}

/** A copy of a block under a fresh id. `taken` are the ids already in use. */
export function duplicateBlock(block, taken) {
  const copy = structuredClone(block);
  copy.id = newId('block', new Set(taken));
  return copy;
}

/** Give every block of a list a new id (used when a template or a revision is applied to an article). */
export function withFreshIds(blocks, taken = []) {
  const used = new Set(taken);
  return blocks.map((block) => {
    const copy = structuredClone(block);
    copy.id = newId('block', used);
    used.add(copy.id);
    return copy;
  });
}
