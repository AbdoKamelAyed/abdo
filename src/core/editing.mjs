// Text editing helpers for the Studio: apply inline formatting to a selection, insert footnotes,
// find and replace across the blocks of an article. Pure functions on strings and block lists, so
// they are tested without a browser and cannot drift from what the renderer accepts.

import { FOOTNOTE_REF, isSafeUrl } from '../lib/markup.mjs';
import { footnoteReferences, mapBlockTexts, textFields } from './blocks-meta.mjs';

// ---------------------------------------------------------------- inline formatting

/** Marker pairs of the inline markup (see lib/markup.mjs). */
export const FORMATS = {
  bold: '**', italic: '*', underline: '++', strike: '~~', mark: '==', code: '`', sup: '^', sub: '~',
};

// Marker characters whose single and double forms are different formats (* and ~).
const DOUBLED = { bold: ['*', 2], italic: ['*', 1], strike: ['~', 2], sub: ['~', 1] };
// Formats whose content may not contain spaces (the renderer only matches unbroken text).
const NO_SPACE = new Set(['sup', 'sub']);

const WORD = /[\p{L}\p{N}\p{M}_]/u;

function runBefore(value, index, char) { let n = 0; while (index - n - 1 >= 0 && value[index - n - 1] === char) n += 1; return n; }
function runAfter(value, index, char) { let n = 0; while (value[index + n] === char) n += 1; return n; }

/** Shrink a selection so it does not start or end on whitespace (markers must hug the text). */
function trim(value, start, end) {
  let s = start; let e = end;
  while (s < e && /\s/.test(value[s])) s += 1;
  while (e > s && /\s/.test(value[e - 1])) e -= 1;
  return [s, e];
}

/** With nothing selected, the word under the caret (or an empty range when the caret is between words). */
function wordAround(value, caret) {
  let s = caret; let e = caret;
  while (s > 0 && WORD.test(value[s - 1])) s -= 1;
  while (e < value.length && WORD.test(value[e])) e += 1;
  return [s, e];
}

/** Is the range already formatted with `kind`, either by markers inside it or just around it? */
function isFormatted(value, start, end, kind) {
  const marker = FORMATS[kind];
  const length = marker.length;
  const inner = value.slice(start, end);
  if (DOUBLED[kind]) {
    const [char, weight] = DOUBLED[kind];
    const before = runBefore(value, start, char);
    const after = runAfter(value, end, char);
    const around = Math.min(before, after);
    // One marker character is italic/subscript, two are bold/strikethrough, three are both.
    if (weight === 1 ? around % 2 === 1 : around >= 2) return 'outside';
    if (inner.length > length * 2 && inner.startsWith(marker) && inner.endsWith(marker) && !inner.startsWith(char.repeat(length + 1))) return 'inside';
    return false;
  }
  if (start >= length && value.slice(start - length, start) === marker && value.slice(end, end + length) === marker) return 'outside';
  if (inner.length > length * 2 && inner.startsWith(marker) && inner.endsWith(marker)) return 'inside';
  return false;
}

/**
 * Toggle an inline format on the selection `[start, end)` of `value`.
 * @returns {{ value: string, start: number, end: number, changed: boolean, reason?: 'spaces' }}
 */
export function toggleFormat(value, start, end, kind) {
  const marker = FORMATS[kind];
  if (!marker) throw new Error(`Unknown format "${kind}"`);
  let [s, e] = start === end ? wordAround(value, start) : trim(value, start, end);
  const unchanged = (reason) => ({ value, start, end, changed: false, reason });

  if (s === e) {
    // Nothing to wrap: leave a pair of markers with the caret between them.
    if (kind === 'code' || !NO_SPACE.has(kind)) {
      return { value: `${value.slice(0, start)}${marker}${marker}${value.slice(start)}`, start: start + marker.length, end: start + marker.length, changed: true };
    }
    return unchanged('empty');
  }
  if (NO_SPACE.has(kind) && /\s/.test(value.slice(s, e))) return unchanged('spaces');

  const state = isFormatted(value, s, e, kind);
  if (state === 'outside') {
    return { value: `${value.slice(0, s - marker.length)}${value.slice(s, e)}${value.slice(e + marker.length)}`, start: s - marker.length, end: e - marker.length, changed: true };
  }
  if (state === 'inside') {
    const inner = value.slice(s + marker.length, e - marker.length);
    return { value: value.slice(0, s) + inner + value.slice(e), start: s, end: e - marker.length * 2, changed: true };
  }
  return { value: `${value.slice(0, s)}${marker}${value.slice(s, e)}${marker}${value.slice(e)}`, start: s + marker.length, end: e + marker.length, changed: true };
}

export function linkProblem(url) {
  if (!url) return 'empty';
  if (/\s/.test(url)) return 'spaces';
  if (!isSafeUrl(url)) return 'scheme';
  return null;
}

/** Turn the selection into a link (or the link's address when nothing is selected). `url` must pass linkProblem(). */
export function makeLink(value, start, end, url) {
  const safe = url.replace(/\)/g, '%29');
  const [s, e] = start === end ? [start, end] : trim(value, start, end);
  const label = s === e ? url : value.slice(s, e).replace(/[[\]]/g, '');
  const link = `[${label}](${safe})`;
  return { value: value.slice(0, s) + link + value.slice(e), start: s, end: s + link.length, changed: true };
}

/** Remove the link around the selection or caret, keeping its label. */
export function removeLink(value, caret) {
  for (const m of value.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    if (value[m.index + 1] === '^') continue;
    if (caret >= m.index && caret <= m.index + m[0].length) {
      return { value: value.slice(0, m.index) + m[1] + value.slice(m.index + m[0].length), start: m.index, end: m.index + m[1].length, changed: true };
    }
  }
  return { value, start: caret, end: caret, changed: false };
}

export function insertText(value, start, end, text) {
  return { value: value.slice(0, start) + text + value.slice(end), start: start + text.length, end: start + text.length, changed: true };
}

// ---------------------------------------------------------------- special characters

/** Characters that are awkward to type, grouped for the picker. `name` is a string key for invisible characters. */
export const SPECIAL_CHARACTERS = [
  { group: 'punctuation', chars: ['–', '—', '…', '«', '»', '“', '”', '‘', '’', '•', '·', '§', '©', '®', '™', '°', '×', '÷', '±', '≈'] },
  { group: 'arabic', chars: ['؟', '،', '؛', '٪', 'ـ', 'ﷺ', '﴾', '﴿'] },
  { group: 'invisible', chars: [{ char: '‎', name: 'sc_lrm' }, { char: '‏', name: 'sc_rlm' }, { char: ' ', name: 'sc_nbsp' }, { char: '‌', name: 'sc_zwnj' }] },
];

// ---------------------------------------------------------------- footnotes

/** The first footnote key `n1`, `n2`... that no footnote or reference uses yet. */
export function nextFootnoteKey(blocks) {
  const used = new Set(footnoteReferences(blocks).map((r) => r.key));
  for (const block of blocks) if (block.type === 'footnotes') for (const item of block.items) used.add(item.key);
  for (let n = 1; ; n += 1) if (!used.has(`n${n}`)) return `n${n}`;
}

/**
 * Make sure a footnotes block holds `key`. Adds the block at the end when the body has none.
 * Edits `blocks` in place; `newId` supplies the id of a footnotes block that has to be created.
 * @returns {object} the footnotes block
 */
export function addFootnoteDefinition(blocks, key, text, newBlockId) {
  let block = blocks.find((b) => b.type === 'footnotes');
  if (!block) { block = { id: newBlockId, type: 'footnotes', items: [] }; blocks.push(block); }
  if (!block.items.some((item) => item.key === key)) block.items.push({ key, text });
  return block;
}

// ---------------------------------------------------------------- find and replace

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @returns {RegExp|null} null for an empty query */
export function buildMatcher(query, { caseSensitive = false, wholeWord = false } = {}) {
  if (!query) return null;
  const body = escapeRegExp(query);
  const source = wholeWord ? `(?<![\\p{L}\\p{N}\\p{M}_])${body}(?![\\p{L}\\p{N}\\p{M}_])` : body;
  return new RegExp(source, `gu${caseSensitive ? '' : 'i'}`);
}

/**
 * Every place the text occurs in the reading text of the blocks (literal code is never searched).
 * @returns {{ blockIndex: number, path: (string|number)[], count: number, excerpt: string }[]}
 */
export function findMatches(blocks, query, options = {}) {
  const matcher = buildMatcher(query, options);
  if (!matcher) return [];
  const out = [];
  blocks.forEach((block, blockIndex) => {
    for (const field of textFields(block)) {
      if (field.role !== 'prose') continue;
      const hits = [...field.text.matchAll(matcher)];
      if (!hits.length) continue;
      const at = hits[0].index;
      out.push({ blockIndex, path: field.path, count: hits.length, excerpt: field.text.slice(Math.max(0, at - 24), at + query.length + 24) });
    }
  });
  return out;
}

/** A copy of the blocks with every match replaced (literally: `$&` and friends have no special meaning). */
export function replaceAll(blocks, query, replacement, options = {}) {
  const matcher = buildMatcher(query, options);
  if (!matcher) return { blocks, count: 0 };
  let count = 0;
  const next = blocks.map((block) => mapBlockTexts(block, (text) => text.replace(matcher, () => { count += 1; return replacement; })));
  return { blocks: next, count };
}

export { FOOTNOTE_REF };
