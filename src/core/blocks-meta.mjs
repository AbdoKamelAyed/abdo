// What every block type contains, in one place: which fields hold text, which hold references.
//
// Pure (no Node APIs). Used by validation (footnote references), the model (word counts) and the
// browser admin (writing statistics, find and replace, SEO checks), so they can never disagree about
// what a block's text is.

import { FOOTNOTE_REF, plain } from '../lib/markup.mjs';

export const BLOCK_TYPES = [
  'paragraph', 'heading', 'quote', 'list', 'image', 'callout', 'divider',
  'checklist', 'definitions', 'code', 'table',
  'gallery', 'compare', 'imagetext',
  'factbox', 'timeline', 'stats', 'related', 'author',
  'footnotes', 'references',
];

/** Interface grouping for the block picker. */
export const BLOCK_GROUPS = {
  text: ['paragraph', 'heading', 'quote', 'list', 'checklist', 'definitions', 'code', 'table'],
  media: ['image', 'gallery', 'compare', 'imagetext'],
  editorial: ['callout', 'factbox', 'timeline', 'stats', 'related', 'author', 'footnotes', 'references', 'divider'],
};

/** Text a template leaves for the author to replace: ⟦like this⟧. Published text must not contain it. */
export const PLACEHOLDER = /⟦[^⟧]*⟧/;

// Text-bearing fields per block type. A path segment "*" means "every element".
// role: "prose" counts as reading text; "code" is literal and never counted or marked up.
const P = (...path) => ({ path, role: 'prose' });
const TEXT_FIELDS = {
  paragraph: [P('text')],
  heading: [P('text')],
  quote: [P('text'), P('cite')],
  list: [P('items', '*')],
  image: [P('caption')],
  callout: [P('title'), P('text')],
  divider: [],
  checklist: [P('title'), P('items', '*', 'text')],
  definitions: [P('items', '*', 'term'), P('items', '*', 'definition')],
  code: [P('caption'), { path: ['text'], role: 'code' }],
  table: [P('caption'), P('rows', '*', '*')],
  gallery: [P('caption'), P('items', '*', 'caption')],
  compare: [P('beforeLabel'), P('afterLabel'), P('caption')],
  imagetext: [P('text'), P('caption')],
  factbox: [P('title'), P('items', '*', 'label'), P('items', '*', 'value'), P('note')],
  timeline: [P('title'), P('events', '*', 'date'), P('events', '*', 'title'), P('events', '*', 'text')],
  stats: [P('items', '*', 'value'), P('items', '*', 'label'), P('items', '*', 'note')],
  related: [P('title')],
  author: [P('note')],
  footnotes: [P('title'), P('items', '*', 'text')],
  references: [P('title'), P('items', '*', 'text')],
};

function expand(value, path, prefix, out, role) {
  if (path.length === 0) {
    if (typeof value === 'string') out.push({ path: prefix, text: value, role });
    return;
  }
  const [head, ...rest] = path;
  if (head === '*') {
    if (Array.isArray(value)) value.forEach((item, i) => expand(item, rest, [...prefix, i], out, role));
    return;
  }
  if (value && typeof value === 'object' && head in value) expand(value[head], rest, [...prefix, head], out, role);
}

/** Every text field of a block: `{ path, text, role }`, paths relative to the block. */
export function textFields(block) {
  const out = [];
  for (const field of TEXT_FIELDS[block.type] ?? []) expand(block, field.path, [], out, field.role);
  return out;
}

export function getAt(root, path) {
  return path.reduce((node, key) => (node == null ? undefined : node[key]), root);
}

/**
 * A copy of the block with every text field passed through `fn(text, field)`. Literal code is only
 * touched when `includeCode` is true.
 */
export function mapBlockTexts(block, fn, { includeCode = false } = {}) {
  const next = structuredClone(block);
  for (const field of textFields(next)) {
    if (field.role === 'code' && !includeCode) continue;
    const parent = getAt(next, field.path.slice(0, -1));
    parent[field.path.at(-1)] = fn(field.text, field);
  }
  return next;
}

/** The reading text of the visible blocks, markup removed, one string per field. */
export function proseStrings(blocks) {
  const out = [];
  for (const block of blocks) {
    if (block.hidden) continue;
    for (const field of textFields(block)) if (field.role === 'prose') out.push(plain(field.text));
  }
  return out;
}

export function countWords(blocks) {
  return proseStrings(blocks).join(' ').split(/\s+/).filter(Boolean).length;
}

/** Footnote keys referenced from text, in order of appearance, across the blocks. */
export function footnoteReferences(blocks) {
  const refs = [];
  blocks.forEach((block, index) => {
    for (const field of textFields(block)) {
      if (field.role !== 'prose' || block.type === 'footnotes') continue;
      for (const m of field.text.matchAll(FOOTNOTE_REF)) refs.push({ key: m[1], blockIndex: index, path: field.path });
    }
  });
  return refs;
}

/** Every media asset a block uses, as `{ mediaId, path, alt }` (alt is the block's own override, if any). */
export function mediaReferences(block) {
  switch (block.type) {
    case 'image': return [{ mediaId: block.mediaId, path: ['mediaId'], alt: block.alt }];
    case 'imagetext': return [{ mediaId: block.mediaId, path: ['mediaId'], alt: block.alt }];
    case 'compare': return [
      { mediaId: block.beforeId, path: ['beforeId'], alt: block.beforeAlt },
      { mediaId: block.afterId, path: ['afterId'], alt: block.afterAlt },
    ];
    case 'gallery': return (block.items ?? []).map((item, i) => ({ mediaId: item.mediaId, path: ['items', i, 'mediaId'], alt: item.alt }));
    default: return [];
  }
}
