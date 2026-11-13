// Tiny inline markup used inside text fields:
//
//   **bold**  *italic*  ++underline++  ~~strikethrough~~  ==highlight==  ^superscript^  ~subscript~
//   `code`  [label](url)  [^key] (a footnote reference)
//
// Everything is HTML-escaped first, so authors can never inject markup. Only a fixed set of
// tags is ever produced, and link targets are restricted to safe schemes. Pure: runs in the
// build and in the browser admin.

import { esc } from '../core/text.mjs';

export const FOOTNOTE_KEY = /^[a-z0-9][a-z0-9-]{0,19}$/;

// Code spans, footnote references, links. Order matters: `[^key]` must win over a link label.
const TOKEN = /`([^`]+)`|\[\^([a-z0-9][a-z0-9-]{0,19})\]|\[([^\]]+)\]\(([^)\s]+)\)/g;
/** Matches footnote references in raw text (used by validation and the editor). */
export const FOOTNOTE_REF = /\[\^([a-z0-9][a-z0-9-]{0,19})\]/g;

// A marker pair only counts when the text inside starts and ends with a non-space character, so
// "C++ and C++", "a == b", "~5 to ~10" and "x ^ y" stay ordinary text.
function emphasis(escaped) {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([^~]*?\S)~~/g, '<s>$1</s>')
    .replace(/(^|[^\p{L}\p{N}+])\+\+(?=\S)([^+]*?\S)\+\+/gu, '$1<u>$2</u>')
    .replace(/(^|[^\p{L}\p{N}=])==(?=\S)([^=]*?\S)==/gu, '$1<mark>$2</mark>')
    .replace(/\^([^^\s]+)\^/g, '<sup>$1</sup>')
    .replace(/~([^~\s]+)~/g, '<sub>$1</sub>');
}

/** Allowed link targets: http(s), mailto, tel, site-relative paths and #fragments. */
export function isSafeUrl(url) {
  return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(url);
}

/**
 * @param {string} text
 * @param {{ footnotes?: Map<string, number> }} [ctx] footnote numbers by key; without it `[^key]` stays literal text
 */
export function inline(text, ctx = {}) {
  const raw = String(text);
  let out = '';
  let last = 0;
  for (const match of raw.matchAll(TOKEN)) {
    out += emphasis(esc(raw.slice(last, match.index)));
    if (match[1] !== undefined) {
      out += `<code dir="ltr">${esc(match[1])}</code>`;
    } else if (match[2] !== undefined) {
      const number = ctx.footnotes?.get(match[2]);
      out += number
        ? `<sup class="fnref"><a href="#fn-${esc(match[2])}" id="fnref-${esc(match[2])}" role="doc-noteref">${number}</a></sup>`
        : esc(match[0]);
    } else if (isSafeUrl(match[4])) {
      const external = /^https?:\/\//i.test(match[4]);
      out += `<a href="${esc(match[4])}"${external ? ' rel="noopener"' : ''}>${emphasis(esc(match[3]))}</a>`;
    } else {
      out += emphasis(esc(match[3]));
    }
    last = match.index + match[0].length;
  }
  out += emphasis(esc(raw.slice(last)));
  return out;
}

/** The text without markup - used for descriptions, word counts and structured data. */
export function plain(text) {
  return String(text)
    .replace(/`([^`]+)`/g, '$1')
    .replace(FOOTNOTE_REF, '')
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2')
    .replace(/~~(?=\S)([^~]*?\S)~~/g, '$1')
    .replace(/(^|[^\p{L}\p{N}+])\+\+(?=\S)([^+]*?\S)\+\+/gu, '$1$2')
    .replace(/(^|[^\p{L}\p{N}=])==(?=\S)([^=]*?\S)==/gu, '$1$2')
    .replace(/\^([^^\s]+)\^/g, '$1')
    .replace(/~([^~\s]+)~/g, '$1');
}

/** Split a plain paragraph string on blank lines into paragraphs (used by project case studies). */
export function paragraphs(text) {
  return String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
