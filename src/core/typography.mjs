// Typography Studio logic: font pairings, font-stack parsing and readability advice for one language's
// typography settings (config/languages.json). Pure; the admin panel and the tests both use it.
//
// Fonts are loaded from Google Fonts by the visitor's browser (the site's CSP allows exactly that), or
// not at all when `googleFonts` is empty, in which case only fonts already on the device are used.

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont']);
// Fonts present on most devices; naming them without loading them is normal.
const COMMON_SYSTEM = new Set(['segoe ui', 'tahoma', 'arial', 'helvetica', 'helvetica neue', 'georgia', 'times new roman', 'times', 'menlo', 'consolas', 'courier new', 'roboto', 'verdana', 'trebuchet ms', 'monaco', 'noto sans', 'noto sans arabic', 'geeza pro', 'sf pro text']);

const MONO = 'ui-monospace, Menlo, Consolas, monospace';

/** @type {{ id: string, script: 'ar'|'latn', name: { en: string, ar: string }, googleFonts: string[], fonts: { heading: string, body: string } }[]} */
export const FONT_PRESETS = [
  { id: 'plex-naskh', script: 'ar', name: { en: 'IBM Plex Sans Arabic with Naskh headings', ar: 'بلكس عربي مع عناوين نسخ' }, googleFonts: ['family=IBM+Plex+Sans+Arabic:wght@400;500;600;700', 'family=Noto+Naskh+Arabic:wght@500;600;700'], fonts: { heading: '"Noto Naskh Arabic", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, serif', body: '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, system-ui, sans-serif' } },
  { id: 'cairo', script: 'ar', name: { en: 'Cairo (one family)', ar: 'القاهرة (خط واحد)' }, googleFonts: ['family=Cairo:wght@400;600;700'], fonts: { heading: '"Cairo", "Segoe UI", Tahoma, system-ui, sans-serif', body: '"Cairo", "Segoe UI", Tahoma, system-ui, sans-serif' } },
  { id: 'amiri-naskh', script: 'ar', name: { en: 'Amiri headings, Naskh text (classical)', ar: 'عناوين أميري ونص نسخ (كلاسيكي)' }, googleFonts: ['family=Amiri:wght@400;700', 'family=Noto+Naskh+Arabic:wght@400;500;600'], fonts: { heading: '"Amiri", "Noto Naskh Arabic", "Segoe UI", Tahoma, serif', body: '"Noto Naskh Arabic", "Segoe UI", Tahoma, serif' } },
  { id: 'tajawal-kufi', script: 'ar', name: { en: 'Tajawal text, Kufi headings (modern)', ar: 'نص تجوال وعناوين كوفي (عصري)' }, googleFonts: ['family=Tajawal:wght@400;500;700', 'family=Noto+Kufi+Arabic:wght@500;600;700'], fonts: { heading: '"Noto Kufi Arabic", "Tajawal", "Segoe UI", Tahoma, sans-serif', body: '"Tajawal", "Segoe UI", Tahoma, system-ui, sans-serif' } },
  { id: 'system-ar', script: 'ar', name: { en: 'System fonts only (fastest)', ar: 'خطوط الجهاز فقط (الأسرع)' }, googleFonts: [], fonts: { heading: '"Segoe UI", Tahoma, system-ui, sans-serif', body: '"Segoe UI", Tahoma, system-ui, sans-serif' } },

  { id: 'plex-newsreader', script: 'latn', name: { en: 'IBM Plex Sans with Newsreader headings', ar: 'آي بي إم بلكس مع عناوين نيوزريدر' }, googleFonts: ['family=IBM+Plex+Sans:wght@400;500;600', 'family=Newsreader:wght@500;600;700'], fonts: { heading: 'Newsreader, Georgia, "Times New Roman", serif', body: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' } },
  { id: 'inter', script: 'latn', name: { en: 'Inter (one family)', ar: 'إنتر (خط واحد)' }, googleFonts: ['family=Inter:wght@400;500;600;700'], fonts: { heading: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', body: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' } },
  { id: 'lora-source', script: 'latn', name: { en: 'Lora headings, Source Sans text', ar: 'عناوين لورا ونص سورس سانس' }, googleFonts: ['family=Lora:wght@500;600;700', 'family=Source+Sans+3:wght@400;600'], fonts: { heading: 'Lora, Georgia, "Times New Roman", serif', body: '"Source Sans 3", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' } },
  { id: 'playfair-inter', script: 'latn', name: { en: 'Playfair Display headings, Inter text', ar: 'عناوين بلايفير ونص إنتر' }, googleFonts: ['family=Playfair+Display:wght@600;700', 'family=Inter:wght@400;500;600'], fonts: { heading: '"Playfair Display", Georgia, "Times New Roman", serif', body: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' } },
  { id: 'system-latn', script: 'latn', name: { en: 'System fonts only (fastest)', ar: 'خطوط الجهاز فقط (الأسرع)' }, googleFonts: [], fonts: { heading: 'Georgia, "Times New Roman", serif', body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' } },
];

export const scriptOf = (language) => (language.direction === 'rtl' ? 'ar' : 'latn');
export const presetsFor = (language) => FONT_PRESETS.filter((p) => p.script === scriptOf(language));

/** Which preset (if any) the current typography exactly matches. */
export function currentPreset(language) {
  const ty = language.typography;
  return presetsFor(language).find((p) => p.fonts.heading === ty.fonts.heading && p.fonts.body === ty.fonts.body && JSON.stringify(p.googleFonts) === JSON.stringify(ty.googleFonts))?.id ?? null;
}

/** The language's typography with a font pairing applied. Sizes, spacing and the monospace font are kept. */
export function applyPreset(typography, presetId) {
  const preset = FONT_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`Unknown font pairing "${presetId}"`);
  return { ...typography, googleFonts: [...preset.googleFonts], fonts: { mono: MONO, ...typography.fonts, heading: preset.fonts.heading, body: preset.fonts.body } };
}

/** Split a CSS font-family list at top-level commas (commas inside quotes stay). */
export function parseFontStack(stack) {
  const out = []; let current = ''; let quote = null;
  for (const ch of stack) {
    if (quote) { current += ch; if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") { quote = ch; current += ch; } else if (ch === ',') { out.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.map((name) => name.replace(/^["']|["']$/g, '')).filter(Boolean);
}

/** A Google Fonts fragment "family=IBM+Plex+Sans:wght@400;600" -> "IBM Plex Sans". */
export const googleFamilyName = (fragment) => decodeURIComponent(fragment.replace(/^family=/, '').split(':')[0].replace(/\+/g, ' '));

/** Families named in a font stack that are neither loaded from Google Fonts nor common system fonts. */
export function unloadedFamilies(typography) {
  const loaded = new Set(typography.googleFonts.map((f) => googleFamilyName(f).toLowerCase()));
  const out = new Set();
  for (const stack of Object.values(typography.fonts)) {
    // Only the first choice matters for the look; later names are fallbacks and may well be system fonts.
    const first = parseFontStack(stack)[0];
    if (!first) continue;
    const key = first.toLowerCase();
    if (!GENERIC.has(key) && !COMMON_SYSTEM.has(key) && !loaded.has(key)) out.add(first);
  }
  return [...out];
}

/** Families loaded from Google Fonts but never named in any font stack (wasted download). */
export function unusedGoogleFamilies(typography) {
  const named = new Set(Object.values(typography.fonts).flatMap(parseFontStack).map((n) => n.toLowerCase()));
  return typography.googleFonts.map(googleFamilyName).filter((family) => !named.has(family.toLowerCase()));
}

const px = (length, rootPx = 16) => {
  const m = /^([0-9.]+)(px|rem|em)$/.exec(length ?? '');
  if (!m) return null;
  return m[2] === 'px' ? Number(m[1]) : Number(m[1]) * rootPx;
};

/**
 * Advice about one language's typography. `code` becomes the string `ty_issue_<code>`.
 * @returns {{ code: string, level: 'warn'|'info', params: object }[]}
 */
export function typographyIssues(language) {
  const ty = language.typography;
  const issues = [];
  const rtl = language.direction === 'rtl';
  if (rtl && !/^(0|normal|0(\.0+)?(em|px|rem))$/.test(ty.letterSpacing)) issues.push({ code: 'rtl_letter_spacing', level: 'warn', params: {} });
  if (rtl && ty.lineHeight < 1.7) issues.push({ code: 'rtl_line_height', level: 'info', params: { value: ty.lineHeight } });
  const size = px(ty.baseSize);
  if (size !== null && size < 16) issues.push({ code: 'small_text', level: 'warn', params: { value: ty.baseSize } });
  if (size !== null && size > 24) issues.push({ code: 'large_text', level: 'info', params: { value: ty.baseSize } });
  const measure = language.layout?.measure ?? '';
  const m = /^([0-9.]+)(rem|em|px|ch)$/.exec(measure);
  if (m) {
    const chars = m[2] === 'ch' ? Number(m[1]) : (px(measure) / (size ?? 16)) * 2; // roughly two characters per em
    if (chars > 80) issues.push({ code: 'wide_measure', level: 'info', params: { value: measure } });
    if (chars < 40) issues.push({ code: 'narrow_measure', level: 'info', params: { value: measure } });
  }
  for (const family of unloadedFamilies(ty)) issues.push({ code: 'font_not_loaded', level: 'warn', params: { family } });
  for (const family of unusedGoogleFamilies(ty)) issues.push({ code: 'font_unused', level: 'info', params: { family } });
  return issues;
}

// ---------------------------------------------------------------- per-article overrides
//
// An article or project may adjust the reading typography of its own page only. The four settings
// are deliberately few, and each has a range inside which the page stays readable. They are drawn
// with classes (`ov-size-110`, `ov-lh-16`, `ov-measure-40`, `ov-weight-700`), never inline styles, so
// they work under the admin's strict Content Security Policy as well as on the public site. The stored
// value is exact; the drawn one is rounded to the nearest step the stylesheet defines.

export const OVERRIDE_LIMITS = Object.freeze({
  fontScale: { min: 85, max: 130, step: 5, unit: '%' },
  lineHeight: { min: 1.2, max: 2.2, step: 0.1, unit: '' },
  measure: { min: 28, max: 60, step: 2, unit: 'rem' },
  headingWeight: { values: [400, 500, 600, 700, 800, 900] },
});

const round = (value, step) => Math.round(Number(value) / step) * step;
const clampTo = (value, { min, max }) => Math.max(min, Math.min(max, value));

/** The step a stored value is drawn at: nearest step inside the range, as a whole-number key. */
export function overrideStep(key, value) {
  const limit = OVERRIDE_LIMITS[key];
  if (key === 'headingWeight') return OVERRIDE_LIMITS.headingWeight.values.includes(Number(value)) ? Number(value) : null;
  if (!limit || !Number.isFinite(Number(value))) return null;
  const stepped = clampTo(round(value, limit.step), limit);
  return key === 'lineHeight' ? Math.round(stepped * 10) : Math.round(stepped);
}

/** Every class name the stylesheet must define, by setting. */
export function overrideClassNames() {
  const out = [];
  const { fontScale, lineHeight, measure, headingWeight } = OVERRIDE_LIMITS;
  for (let n = fontScale.min; n <= fontScale.max; n += fontScale.step) out.push({ key: 'fontScale', cls: `ov-size-${n}`, n });
  for (let n = Math.round(lineHeight.min * 10); n <= Math.round(lineHeight.max * 10); n += 1) out.push({ key: 'lineHeight', cls: `ov-lh-${n}`, n });
  for (let n = measure.min; n <= measure.max; n += measure.step) out.push({ key: 'measure', cls: `ov-measure-${n}`, n });
  for (const n of headingWeight.values) out.push({ key: 'headingWeight', cls: `ov-weight-${n}`, n });
  return out;
}

/** The class list (with a leading space) for a record's `typography`, or '' when it has none. */
export function overrideClasses(override) {
  if (!override || typeof override !== 'object') return '';
  const parts = [];
  const size = overrideStep('fontScale', override.fontScale);
  const lh = overrideStep('lineHeight', override.lineHeight);
  const measure = overrideStep('measure', override.measure);
  const weight = overrideStep('headingWeight', override.headingWeight);
  if (override.fontScale !== undefined && size !== null && size !== 100) parts.push(`ov-size-${size}`);
  if (override.lineHeight !== undefined && lh !== null) parts.push(`ov-lh-${lh}`);
  if (override.measure !== undefined && measure !== null) parts.push(`ov-measure-${measure}`);
  if (override.headingWeight !== undefined && weight !== null) parts.push(`ov-weight-${weight}`);
  return parts.length ? ` ${parts.join(' ')}` : '';
}

/**
 * Advice about an override, given the language it will be read in. Same codes and sentences as the
 * language-level advice where they mean the same thing.
 * @returns {{ code: string, level: 'warn'|'info', params: object }[]}
 */
export function overrideIssues(override, language) {
  const issues = [];
  if (!override) return issues;
  const rtl = language?.direction === 'rtl';
  const lh = override.lineHeight ?? language?.typography?.lineHeight;
  if (rtl && lh !== undefined && lh < 1.7) issues.push({ code: 'rtl_line_height', level: 'info', params: { value: lh } });
  const base = px(language?.typography?.baseSize) ?? 16;
  const size = base * ((override.fontScale ?? 100) / 100);
  if (size < 16) issues.push({ code: 'small_text', level: 'warn', params: { value: `${Math.round(size * 10) / 10}px` } });
  return issues;
}
