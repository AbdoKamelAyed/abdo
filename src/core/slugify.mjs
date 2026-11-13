// URL slugs for any script, matching the schema's slug pattern:
// letters of any script, digits, single hyphens between words.

const ARABIC_MARKS = /[ـً-ٰٟۖ-ۭ]/g; // tatweel, harakat, Quranic marks
const SLUG = /^[\p{Ll}\p{Lo}\p{N}]+(-[\p{Ll}\p{Lo}\p{N}]+)*$/u;

export function slugify(text, { maxLength = 80, fallback = 'item' } = {}) {
  let s = String(text ?? '').normalize('NFKC').replace(ARABIC_MARKS, '').toLowerCase();
  s = s.replace(/[^\p{Ll}\p{Lo}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  if (s.length > maxLength) s = s.slice(0, maxLength).replace(/-[^-]*$/, '') || s.slice(0, maxLength);
  s = s.replace(/^-+|-+$/g, '');
  return SLUG.test(s) ? s : fallback;
}

export const isValidSlug = (s) => SLUG.test(s) && s.length <= 120;

/** `base`, then `base-2`, `base-3`, ... until it is not in `taken`. */
export function uniqueSlug(base, taken) {
  const used = taken instanceof Set ? taken : new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}
