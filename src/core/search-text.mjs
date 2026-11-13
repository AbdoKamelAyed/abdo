// Text normalisation for search, shared by the build (which writes the index) and the browser (which reads
// it), so a word is turned into the same key on both sides. Pure: no Node or browser APIs.
//
// What it does to a word:
//   - lower-cases it and removes Latin accents ("café" -> "cafe");
//   - Arabic: أ إ آ ٱ -> ا, ى -> ي, optionally ة -> ه, removes the short vowels and other marks
//     (fatha, damma, kasra, shadda, sukun, tanween, dagger alef, Quranic marks) and tatweel (ـ);
//     hamza written on waw or ya (ؤ ئ) loses its hamza as part of removing marks, so ؤ -> و and ئ -> ي;
//   - Persian ک and ی become Arabic ك and ي; Arabic-Indic and Persian digits become 0-9;
//   - optionally removes a leading definite article from Arabic words (ال، وال، بال، كال، فال، لل).
//
// What it deliberately does not do: it is not a morphological analyser. It does not find the root of an
// Arabic word, undo plurals, or stem English ("articles" will not match "article" unless the person typed
// a prefix or a synonym is defined). The original text is never changed: the display text is kept and
// only the comparison key is normalised.

export const DEFAULT_OPTIONS = Object.freeze({ foldTaMarbuta: true, stripDefiniteArticle: true });

// Arabic marks: U+0610-061A, U+064B-065F (includes the hamza marks), U+0670 (dagger alef), U+06D6-06DC, U+06DF-06E8, U+06EA-06ED.
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;
const LATIN_MARKS = /[̀-ͯ]/g;
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;
const TATWEEL = /ـ/g;
const ALEF_FORMS = /[آأإٱ]/g;
const WORD = /[\p{L}\p{M}\p{N}‌‍]+/gu;
const ARABIC_LETTER = /[ء-ي]/;
const ARTICLE = /^(?:وال|فال|بال|كال|لل|ال)/;

const DIGITS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** Normalise one word (no spaces) into its comparison form, without removing the definite article. */
export function normalizeWord(word, options = DEFAULT_OPTIONS) {
  let s = String(word).normalize('NFKD').replace(INVISIBLE, '').replace(TATWEEL, '');
  s = s.replace(ARABIC_MARKS, '').replace(LATIN_MARKS, '');
  s = s.replace(ALEF_FORMS, 'ا').replace(/ى/g, 'ي').replace(/ک/g, 'ك').replace(/ی/g, 'ي');
  if (options.foldTaMarbuta !== false) s = s.replace(/ة/g, 'ه');
  s = s.replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d]);
  return s.toLowerCase();
}

/**
 * The search key of a word: normalised, and (when the option is on) without a leading Arabic definite article.
 * `minRest` is how many letters must remain after removing the article; while a word is still being typed the
 * caller passes 1 so "الم" is looked up as "م" instead of nothing.
 */
export function keyOf(word, options = DEFAULT_OPTIONS, minRest = 3) {
  const s = normalizeWord(word, options);
  if (options.stripDefiniteArticle !== false && ARABIC_LETTER.test(s)) {
    const m = ARTICLE.exec(s);
    if (m && s.length - m[0].length >= minRest) return s.slice(m[0].length);
  }
  return s;
}

/**
 * The words of `text` with their position in the ORIGINAL text, so matches can be highlighted without
 * changing what is shown. @returns {{ start: number, end: number, key: string }[]}
 */
export function scan(text, options = DEFAULT_OPTIONS) {
  const out = [];
  const source = String(text ?? '');
  for (const m of source.matchAll(WORD)) {
    const key = keyOf(m[0], options);
    if (key) out.push({ start: m.index, end: m.index + m[0].length, key });
  }
  return out;
}

/** Just the keys of `scan`. */
export const tokens = (text, options = DEFAULT_OPTIONS) => scan(text, options).map((t) => t.key);

/**
 * A whole phrase as one comparison string: normalised, article NOT removed, only letters and digits.
 * Used to compare names ("Machine-Learning" and "machine learning" are the same) for duplicate detection.
 */
export function foldName(text, options = DEFAULT_OPTIONS) {
  return [...String(text ?? '').matchAll(WORD)].map((m) => normalizeWord(m[0], options)).filter(Boolean).join(' ');
}

/** Damerau-Levenshtein distance, stopping early once it exceeds `limit` (then returns limit + 1). */
export function editDistance(a, b, limit = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const A = [...a];
  const B = [...b];
  let prev2 = null;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= B.length; j += 1) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > limit) return limit + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[B.length];
}
