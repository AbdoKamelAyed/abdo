// Writing assistance: counts, reading time, an honest readability estimate, repeated words, outline
// and editorial checks. Pure functions over the block list, shared by the Studio and the tests.
//
// What this is not: a spelling or grammar checker. Spelling help comes from the browser's own
// spell-checker (the Studio turns it on per language); grammar checking is not offered.

import { plain, paragraphs } from '../lib/markup.mjs';
import { PLACEHOLDER, proseStrings, textFields } from './blocks-meta.mjs';

const chars = (s) => [...s].length;
const SENTENCE_END = /[.!?؟…。]+(?:\s|$)|\n+/u;
const WORD = /[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M}'’-]*/gu;
// Arabic marks that do not change a word's identity, and the tatweel stretching character.
const ARABIC_MARKS = /[ً-ٰٟـ]/g;

export const wordsOf = (text) => text.match(WORD) ?? [];

/** The reading text of the visible blocks, one string per field. */
export function readingStrings(blocks) { return proseStrings(blocks); }

/** Visible headings: `{ blockIndex, level, text }`. */
export function outline(blocks) {
  const out = [];
  blocks.forEach((block, blockIndex) => {
    if (block.hidden || block.type !== 'heading') return;
    out.push({ blockIndex, level: block.level, text: plain(block.text) });
  });
  return out;
}

/** Number of paragraphs of running text (paragraph, image-with-text and callout blocks, split at blank lines). */
export function countParagraphs(blocks) {
  let n = 0;
  for (const block of blocks) {
    if (block.hidden) continue;
    if (block.type === 'paragraph' || block.type === 'imagetext' || block.type === 'callout') n += paragraphs(block.text ?? '').length;
  }
  return n;
}

/**
 * Counts for the status line. Words use the same rule as the site's own word count
 * (whitespace separated, markup removed), so the number shown here is the number published.
 */
export function writingStats(blocks, { wpm = 200 } = {}) {
  const strings = readingStrings(blocks);
  const text = strings.join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    words,
    characters: chars(strings.join('\n')),
    charactersNoSpaces: chars(text.replace(/\s+/g, '')),
    paragraphs: countParagraphs(blocks),
    blocks: blocks.filter((b) => !b.hidden).length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / wpm)),
  };
}

export function goalProgress(words, goal) {
  if (!Number.isInteger(goal) || goal <= 0) return null;
  return { goal, words, percent: Math.min(100, Math.round((words / goal) * 100)), reached: words >= goal };
}

// ---------------------------------------------------------------- readability

/**
 * A rough readability band from sentence length and the share of long words. It is a heuristic for
 * both languages, not a validated formula (no widely accepted Arabic formula exists), so the Studio
 * labels it an estimate. Returns `level: null` when there is too little text to judge.
 * @returns {{ level: 'easy'|'medium'|'hard'|null, sentences: number, wordsPerSentence: number, longWordShare: number }}
 */
export function readability(blocks) {
  const strings = readingStrings(blocks);
  let words = 0; let sentences = 0; let long = 0;
  for (const text of strings) {
    const tokens = wordsOf(text);
    if (!tokens.length) continue;
    words += tokens.length;
    sentences += Math.max(1, text.split(SENTENCE_END).filter((part) => wordsOf(part).length > 0).length);
    for (const token of tokens) if (chars(token.replace(ARABIC_MARKS, '')) >= 7) long += 1;
  }
  if (words < 30) return { level: null, sentences, wordsPerSentence: 0, longWordShare: 0 };
  const wordsPerSentence = words / sentences;
  const longWordShare = long / words;
  const level = wordsPerSentence > 25 || longWordShare > 0.3 ? 'hard' : wordsPerSentence <= 14 && longWordShare <= 0.18 ? 'easy' : 'medium';
  return { level, sentences, wordsPerSentence: Math.round(wordsPerSentence * 10) / 10, longWordShare: Math.round(longWordShare * 100) / 100 };
}

// ---------------------------------------------------------------- repeated words

const STOP = {
  en: 'about after again also because been before being between both could does doing down during each from further have having here into itself just more most much must only other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your'.split(' '),
  ar: 'الذي التي الذين هذا هذه ذلك تلك هناك هنا على عند عن في من إلى إلي أن إن كان كانت يكون تكون كل بعض بين بعد قبل حتى لكن ثم أو أم لا لم لن قد ما هو هي هم نحن أنا أنت مع منذ حيث كما أيضا أيضًا فقط جدا جدًا غير'.split(' '),
};
const STOPWORDS = new Set([...STOP.en, ...STOP.ar].map((w) => w.replace(ARABIC_MARKS, '')));

function normalise(token) {
  let word = token.toLowerCase().replace(ARABIC_MARKS, '').replace(/^['’-]+|['’-]+$/g, '');
  if (/^ال/.test(word) && chars(word) > 4) word = word.slice(2); // الكتاب and كتاب are the same word for counting
  return word;
}

/**
 * Words used often (not counting small function words) and words typed twice in a row.
 * @returns {{ frequent: { word: string, count: number }[], doubled: { word: string, blockIndex: number }[] }}
 */
export function repeatedWords(blocks, { top = 8 } = {}) {
  const counts = new Map();
  let total = 0;
  const doubled = [];
  blocks.forEach((block, blockIndex) => {
    if (block.hidden) return;
    for (const field of textFields(block)) {
      if (field.role !== 'prose') continue;
      const tokens = wordsOf(plain(field.text)).map(normalise);
      let previous = null;
      for (const word of tokens) {
        total += 1;
        if (word && word === previous && !/^\p{N}+$/u.test(word) && !doubled.some((d) => d.word === word && d.blockIndex === blockIndex)) doubled.push({ word, blockIndex });
        previous = word;
        if (chars(word) < 4 || STOPWORDS.has(word)) continue;
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
  });
  const threshold = Math.max(5, Math.ceil(total * 0.01));
  const frequent = [...counts].filter(([, count]) => count >= threshold).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, top);
  return { frequent, doubled };
}

// ---------------------------------------------------------------- editorial checks

/**
 * Things worth a second look before publishing. Each result is `{ code, level, blockIndex?, params }`;
 * the Studio turns `code` into a sentence (`chk_<code>`). These are advice, never blockers: blockers
 * are the validator's errors.
 * @param {{ blocks: object[], title?: string, excerpt?: string, seoTitle?: string, seoDescription?: string, hasCover?: boolean }} input
 */
export function editorialChecks({ blocks, title = '', excerpt = '', seoTitle, seoDescription, hasCover = true }) {
  const out = [];
  const visible = blocks.filter((b) => !b.hidden);
  const stats = writingStats(blocks);
  if (!visible.length) out.push({ code: 'no_body', level: 'warn', params: {} });

  const heads = outline(blocks);
  if (stats.words >= 400 && !heads.length) out.push({ code: 'no_headings', level: 'info', params: { n: stats.words } });
  let previous = null;
  for (const head of heads) {
    if (previous && head.level > previous.level + 1) out.push({ code: 'heading_skip', level: 'warn', blockIndex: head.blockIndex, params: { from: previous.level, to: head.level } });
    previous = head;
  }
  const seen = new Map();
  for (const head of heads) {
    const key = head.text.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) out.push({ code: 'duplicate_heading', level: 'info', blockIndex: head.blockIndex, params: { text: head.text } });
    else seen.set(key, head.blockIndex);
  }

  blocks.forEach((block, blockIndex) => {
    if (block.hidden || block.type !== 'paragraph') return;
    const n = wordsOf(plain(block.text)).length;
    if (n > 180) out.push({ code: 'long_paragraph', level: 'info', blockIndex, params: { n } });
  });

  blocks.forEach((block, blockIndex) => {
    if (block.hidden) return;
    if (textFields(block).some((f) => PLACEHOLDER.test(f.text))) out.push({ code: 'placeholder', level: 'warn', blockIndex, params: {} });
  });

  const titleLength = chars((seoTitle ?? title).trim());
  if (titleLength > 70) out.push({ code: 'title_long', level: 'info', params: { n: titleLength } });
  const description = chars((seoDescription ?? excerpt).trim());
  if (description > 0 && description < 50) out.push({ code: 'description_short', level: 'info', params: { n: description } });
  if (description > 170) out.push({ code: 'description_long', level: 'info', params: { n: description } });
  if (!hasCover) out.push({ code: 'no_cover', level: 'info', params: {} });
  return out;
}
