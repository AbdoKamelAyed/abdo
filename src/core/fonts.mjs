// A short, curated list of fonts the Appearance Studio offers, and the rules for applying a choice to a
// language's typography. Pure.
//
// Why a list and not a free text box: a font that is not loaded, or a family name with a typo, silently falls
// back to something else; and a wrong Google Fonts fragment loads nothing. Every entry here has a CSS stack
// (with safe fallbacks) and, for web fonts, the exact Google Fonts request for it.
//
// Privacy: entries with a `google` fragment make each visitor's browser contact Google Fonts. Entries without
// one ("system") never do. A language whose chosen fonts are all system fonts loads nothing from Google.

/** @type {{ id: string, label: string, script: 'arabic'|'latin'|'any', kind: 'sans'|'serif', stack: string, google?: string }[]} */
export const FONTS = [
  // Arabic
  { id: 'ibm-plex-sans-arabic', label: 'IBM Plex Sans Arabic', script: 'arabic', kind: 'sans', stack: '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, system-ui, sans-serif', google: 'family=IBM+Plex+Sans+Arabic:wght@400;500;600;700' },
  { id: 'noto-naskh-arabic', label: 'Noto Naskh Arabic', script: 'arabic', kind: 'serif', stack: '"Noto Naskh Arabic", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, serif', google: 'family=Noto+Naskh+Arabic:wght@500;600;700' },
  { id: 'cairo', label: 'Cairo', script: 'arabic', kind: 'sans', stack: 'Cairo, "Segoe UI", Tahoma, system-ui, sans-serif', google: 'family=Cairo:wght@400;600;700' },
  { id: 'tajawal', label: 'Tajawal', script: 'arabic', kind: 'sans', stack: 'Tajawal, "Segoe UI", Tahoma, system-ui, sans-serif', google: 'family=Tajawal:wght@400;500;700' },
  { id: 'noto-kufi-arabic', label: 'Noto Kufi Arabic', script: 'arabic', kind: 'sans', stack: '"Noto Kufi Arabic", "Segoe UI", Tahoma, system-ui, sans-serif', google: 'family=Noto+Kufi+Arabic:wght@400;600;700' },
  { id: 'amiri', label: 'Amiri', script: 'arabic', kind: 'serif', stack: 'Amiri, "Noto Naskh Arabic", "Times New Roman", serif', google: 'family=Amiri:wght@400;700' },
  // Latin
  { id: 'inter', label: 'Inter', script: 'latin', kind: 'sans', stack: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', google: 'family=Inter:wght@400;500;600;700' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', script: 'latin', kind: 'sans', stack: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', google: 'family=IBM+Plex+Sans:wght@400;500;600' },
  { id: 'newsreader', label: 'Newsreader', script: 'latin', kind: 'serif', stack: 'Newsreader, Georgia, "Times New Roman", serif', google: 'family=Newsreader:wght@500;600;700' },
  { id: 'source-serif-4', label: 'Source Serif 4', script: 'latin', kind: 'serif', stack: '"Source Serif 4", Georgia, "Times New Roman", serif', google: 'family=Source+Serif+4:wght@400;600;700' },
  { id: 'lora', label: 'Lora', script: 'latin', kind: 'serif', stack: 'Lora, Georgia, "Times New Roman", serif', google: 'family=Lora:wght@400;600;700' },
  { id: 'playfair-display', label: 'Playfair Display', script: 'latin', kind: 'serif', stack: '"Playfair Display", Georgia, "Times New Roman", serif', google: 'family=Playfair+Display:wght@500;600;700' },
  { id: 'ibm-plex-serif', label: 'IBM Plex Serif', script: 'latin', kind: 'serif', stack: '"IBM Plex Serif", Georgia, "Times New Roman", serif', google: 'family=IBM+Plex+Serif:wght@400;600;700' },
  // System fonts: nothing is downloaded
  { id: 'system-sans', label: 'System sans-serif', script: 'any', kind: 'sans', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, Tahoma, "Noto Sans Arabic", sans-serif' },
  { id: 'system-serif', label: 'System serif', script: 'any', kind: 'serif', stack: 'Georgia, "Times New Roman", "Noto Naskh Arabic", serif' },
];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));
export const CUSTOM = 'custom';

const norm = (stack) => String(stack).replace(/\s+/g, ' ').trim();

/** The id of the catalogue entry whose stack is exactly `stack`, or 'custom'. */
export function matchFont(stack) {
  return FONTS.find((f) => norm(f.stack) === norm(stack))?.id ?? CUSTOM;
}

/** Fonts that suit a language: those for its script, and the system fonts. Latin-only fonts are not offered for right-to-left languages. */
export function fontsFor(direction) {
  return FONTS.filter((f) => f.script === 'any' || f.script === (direction === 'rtl' ? 'arabic' : 'latin'));
}

/**
 * Apply a font choice to a language's typography. Only the Google Fonts requests the chosen fonts need are kept,
 * and requests for fonts that are no longer used are dropped. A heading or body left as 'custom' is kept as it is.
 * @param {object} typography  language.typography
 * @param {{ heading?: string, body?: string }} choice  catalogue ids (or 'custom' / undefined to keep the current stack)
 * @returns {object} a new typography object
 */
export function applyFonts(typography, choice) {
  const next = structuredClone(typography);
  for (const part of ['heading', 'body']) {
    const id = choice[part];
    if (id && id !== CUSTOM) next.fonts[part] = FONT_BY_ID[id].stack;
  }
  const wanted = new Set();
  const stillUsed = (part) => FONTS.find((f) => norm(f.stack) === norm(next.fonts[part]));
  for (const part of ['heading', 'body']) { const f = stillUsed(part); if (f?.google) wanted.add(f.google); }
  // Fragments for custom stacks that the owner added by hand stay as they were.
  const customKept = (typography.googleFonts ?? []).filter((frag) => !FONTS.some((f) => f.google === frag) && (matchFont(next.fonts.heading) === CUSTOM || matchFont(next.fonts.body) === CUSTOM));
  next.googleFonts = [...wanted, ...customKept];
  return next;
}

/** Does this language's typography make visitors' browsers contact Google Fonts? */
export const usesGoogleFonts = (typography) => (typography.googleFonts ?? []).length > 0;

/** Letter spacing other than 0 breaks the joining of Arabic letters; the Studio locks the field for right-to-left languages. */
export const letterSpacingAllowed = (direction) => direction !== 'rtl';
