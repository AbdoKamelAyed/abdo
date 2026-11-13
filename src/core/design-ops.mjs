// Editing rules for the site's look (content/config/design.json and presets.json). Pure functions that take
// data and return changed copies, so the Appearance Studio, the validator and the tests share one set of rules.
//
// Principles:
//  - Choosing a preset only changes `design.preset`; the owner's colour changes are kept unless they ask to clear them.
//  - A colour that equals what it would be anyway is not stored, so `design.json` only lists real changes.
//  - Shipped presets can be copied but never changed or deleted; the owner's own presets (`custom: true`) can.

import { resolvePreset } from '../lib/theme.mjs';
import { checkMode, glassFailures } from './contrast.mjs';
import { HERO_MIN_OPACITY } from '../lib/theme.mjs';
import { newId } from './ids.mjs';

export const COLOR_GROUPS = [
  { id: 'backgrounds', keys: ['bg', 'surface'] },
  { id: 'text', keys: ['text', 'muted', 'onPrimary'] },
  { id: 'borders', keys: ['border'] },
  { id: 'brand', keys: ['primary', 'secondary', 'accent'] },
];
export const COLOR_KEYS = COLOR_GROUPS.flatMap((g) => g.keys);
export const MODES = ['light', 'dark'];
export const SHARED_LENGTHS = ['radius', 'radiusLarge', 'sectionSpacing', 'gutter'];
export const CARD_SHADOWS = ['none', 'soft', 'medium', 'strong'];

const clone = (v) => structuredClone(v);
const isEmpty = (o) => !o || Object.keys(o).length === 0;

/** The colours and sizes in force: the preset, then the site-wide changes, then (if `lang` is given) that language's colours. */
export function effectiveTokens(design, presets, lang) {
  return resolvePreset(design, presets, lang);
}

/** Remove empty containers left behind by a reset. */
function tidy(design) {
  const o = design.overrides;
  if (o) {
    for (const k of ['light', 'dark', 'shared']) if (isEmpty(o[k])) delete o[k];
    if (isEmpty(o)) delete design.overrides;
  }
  const lo = design.languageOverrides;
  if (lo) {
    for (const [lang, v] of Object.entries(lo)) {
      for (const k of ['light', 'dark']) if (isEmpty(v[k])) delete v[k];
      if (isEmpty(v)) delete lo[lang];
    }
    if (isEmpty(lo)) delete design.languageOverrides;
  }
  return design;
}

/**
 * Set one colour, or reset it (value null or the value it would have anyway).
 * @param {{ lang?: string|null, mode: 'light'|'dark', key: string, value: string|null }} change
 */
export function setColor(design, presets, { lang = null, mode, key, value }) {
  if (!MODES.includes(mode) || !COLOR_KEYS.includes(key)) throw new Error(`Unknown colour "${mode}.${key}"`);
  const next = clone(design);
  const base = lang ? effectiveTokens(next, presets)[mode][key] : resolvePreset({ ...next, overrides: {}, languageOverrides: {} }, presets)[mode][key];
  const same = value == null || value.toLowerCase() === String(base).toLowerCase();
  if (lang) {
    next.languageOverrides ??= {};
    next.languageOverrides[lang] ??= {};
    next.languageOverrides[lang][mode] ??= {};
    if (same) delete next.languageOverrides[lang][mode][key]; else next.languageOverrides[lang][mode][key] = value.toLowerCase();
  } else {
    next.overrides ??= {};
    next.overrides[mode] ??= {};
    if (same) delete next.overrides[mode][key]; else next.overrides[mode][key] = value.toLowerCase();
  }
  return tidy(next);
}

/** Set one shared size or shadow, or reset it (null or equal to the preset's own value). */
export function setShared(design, presets, key, value) {
  const next = clone(design);
  const base = resolvePreset({ ...next, overrides: {}, languageOverrides: {} }, presets).shared[key];
  next.overrides ??= {};
  next.overrides.shared ??= {};
  const same = value == null || value === '' || value === base || (key === 'cardShadow' && value === 'none' && base === undefined);
  if (same) delete next.overrides.shared[key]; else next.overrides.shared[key] = value;
  return tidy(next);
}

/** Forget the owner's colour changes: everywhere, or only for one language. Sizes and glass are untouched. */
export function resetColors(design, { lang = null } = {}) {
  const next = clone(design);
  if (lang) { if (next.languageOverrides) delete next.languageOverrides[lang]; } else if (next.overrides) { delete next.overrides.light; delete next.overrides.dark; }
  return tidy(next);
}

/** How many colour changes the owner has made on top of the preset (site-wide, and per language). */
export function overrideCount(design) {
  const n = (o) => MODES.reduce((sum, m) => sum + Object.keys(o?.[m] ?? {}).length, 0);
  return { site: n(design.overrides), languages: Object.fromEntries(Object.entries(design.languageOverrides ?? {}).map(([l, v]) => [l, n(v)])) };
}

/** Choose a preset. The owner's own colour changes stay unless `keepOverrides` is false. Content is never involved. */
export function applyPreset(design, presets, key, { keepOverrides = true } = {}) {
  if (!presets.some((p) => p.key === key)) throw new Error(`There is no preset "${key}".`);
  let next = { ...clone(design), preset: key };
  if (!keepOverrides) { delete next.overrides; delete next.languageOverrides; }
  next = tidy(next);
  return next;
}

// ------------------------------------------------------------------ the owner's own presets

/** "My Look 2" -> "my-look-2"; made unique among `taken`. Falls back to "custom" for names without Latin letters. */
export function presetKey(name, taken) {
  const base = String(name).normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'custom';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * A new preset from the current look (preset plus the owner's site-wide changes).
 * @param {{ ar: string, en: string }} name
 * @returns the preset to append to presets.json
 */
export function presetFromCurrent(design, presets, name, takenIds = []) {
  const tokens = effectiveTokens(design, presets);
  const clean = {
    ar: String(name.ar ?? '').trim() || String(name.en ?? '').trim(),
    en: String(name.en ?? '').trim() || String(name.ar ?? '').trim(),
  };
  if (!clean.ar || !clean.en) throw new Error('A preset needs a name.');
  const shared = Object.fromEntries(Object.entries(tokens.shared).filter(([, v]) => v !== undefined));
  return {
    id: newId('preset', takenIds),
    key: presetKey(clean.en, presets.map((p) => p.key)),
    name: clean,
    custom: true,
    tokens: { light: { ...tokens.light }, dark: { ...tokens.dark }, shared },
  };
}

export class PresetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Why a preset cannot be deleted right now, or null. */
export function deleteBlocker(presets, key, design) {
  const preset = presets.find((p) => p.key === key);
  if (!preset) return 'missing';
  if (!preset.custom) return 'shipped';
  if (design.preset === key) return 'active';
  return null;
}

export function deletePreset(presets, key, design) {
  const why = deleteBlocker(presets, key, design);
  if (why) throw new PresetError(why, `The preset "${key}" cannot be deleted (${why}).`);
  return presets.filter((p) => p.key !== key);
}

export function renamePreset(presets, key, name) {
  const preset = presets.find((p) => p.key === key);
  if (!preset?.custom) throw new PresetError('shipped', 'Only your own presets can be renamed.');
  return presets.map((p) => (p.key === key ? { ...p, name: { ar: name.ar.trim() || name.en.trim(), en: name.en.trim() || name.ar.trim() } } : p));
}

// ------------------------------------------------------------------ checks

/**
 * Every colour pair that fails contrast, for the site-wide look and for each language that has colours of its own.
 * @returns {{ lang: string|null, mode: string, fg: string, bg: string, where: string, ratio: number, min: number, level: 'error'|'warning' }[]}
 */
export function contrastReport(design, presets, languages = []) {
  const scopes = [null, ...languages.filter((l) => design.languageOverrides?.[l.code]).map((l) => l.code)];
  const rows = [];
  for (const lang of scopes) {
    const tokens = effectiveTokens(design, presets, lang);
    for (const mode of MODES) for (const failure of checkMode(tokens[mode])) rows.push({ lang, mode, ...failure });
  }
  return rows;
}

/**
 * Glass Mode failures: bars and cards over the worst possible content, hero panels at their enforced minimum opacity.
 * @returns {{ mode: string, area: 'bars'|'hero', fg: string, under: string, ratio: number }[]}
 */
export function glassReport(design, presets) {
  if (!design.glass?.enabled) return [];
  const tokens = effectiveTokens(design, presets);
  const rows = [];
  const els = design.glass.elements ?? {};
  for (const mode of MODES) {
    const glass = design.glass[mode];
    if (!glass) continue;
    if (els.header || els.menu || els.cards || els.footer) for (const f of glassFailures(tokens[mode], glass)) rows.push({ mode, area: 'bars', ...f });
    if (els.hero) for (const f of glassFailures(tokens[mode], glass, Math.max(glass.opacity, HERO_MIN_OPACITY))) rows.push({ mode, area: 'hero', ...f });
  }
  return rows;
}
