// Colour contrast (WCAG 2.x relative luminance). Pure; the build's validator, the Appearance Studio and the
// tests all use it, so a custom colour is judged by exactly the same rule everywhere.
//
// Thresholds: 4.5:1 is the WCAG AA level for normal text. Below 3:1 text is practically unreadable for many
// people, so the validator treats that as an error (publishing is blocked) and 3 to 4.5 as a warning.

export const AA_TEXT = 4.5;
export const UNREADABLE = 3;

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v) => typeof v === 'string' && HEX.test(v);

/** "#rrggbb" -> [r, g, b] (0 to 255). */
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** [r, g, b] (0 to 255, may be fractional) -> "#rrggbb". */
export const rgbToHex = (rgb) => `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** Contrast ratio of two colours given as [r, g, b]. Always 1 or more. */
export function ratioRgb(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Contrast ratio of two "#rrggbb" colours. */
export const contrastRatio = (a, b) => ratioRgb(hexToRgb(a), hexToRgb(b));

/** `fg` painted at `alpha` (0..1) over `bg`, as [r, g, b]. */
export const blend = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

/**
 * The pairs a colour set must get right. `where` says what the colours are used for, so the Studio can
 * explain a failure in words instead of showing two hex codes.
 */
export const PAIRS = [
  { fg: 'text', bg: 'bg', where: 'body_text' },
  { fg: 'text', bg: 'surface', where: 'card_text' },
  { fg: 'muted', bg: 'bg', where: 'muted_text' },
  { fg: 'muted', bg: 'surface', where: 'muted_card_text' },
  { fg: 'accent', bg: 'bg', where: 'accent_text' },
  { fg: 'accent', bg: 'surface', where: 'accent_card' },
  { fg: 'onPrimary', bg: 'primary', where: 'button_text' },
];

/**
 * Check one mode's colours (all nine keys present).
 * @returns {{ fg: string, bg: string, where: string, ratio: number, min: number, level: 'error'|'warning' }[]} only the failures
 */
export function checkMode(tokens) {
  const out = [];
  for (const { fg, bg, where } of PAIRS) {
    if (!isHex(tokens[fg]) || !isHex(tokens[bg])) continue;
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    if (ratio < AA_TEXT) out.push({ fg, bg, where, ratio, min: AA_TEXT, level: ratio < UNREADABLE ? 'error' : 'warning' });
  }
  return out;
}

/**
 * The nearest colour to `fg` that reaches `min` against `bg`: it is mixed towards black or white (whichever
 * can reach more contrast) in small steps, so the hue stays recognisable. Returns `fg` unchanged if it already passes.
 */
export function suggestColor(fg, bg, min = AA_TEXT) {
  if (contrastRatio(fg, bg) >= min) return fg;
  const base = hexToRgb(fg);
  const back = hexToRgb(bg);
  const targets = [[0, 0, 0], [255, 255, 255]].sort((a, b) => ratioRgb(b, back) - ratioRgb(a, back));
  for (const target of targets) {
    for (let step = 1; step <= 100; step += 1) {
      const mixed = base.map((c, i) => c + (target[i] - c) * (step / 100));
      if (ratioRgb(mixed.map(Math.round), back) >= min) return rgbToHex(mixed);
    }
  }
  return fg;
}

/**
 * Like `suggestColor`, but the colour must reach `min` against every colour in `backgrounds` at once (text is
 * used on the page and on cards, so repairing it for one and not the other would just move the problem).
 * Returns `fg` unchanged when it already passes or when no mix of it with black or white can.
 */
export function suggestColorForAll(fg, backgrounds, min = AA_TEXT) {
  const worst = (c) => Math.min(...backgrounds.map((bg) => contrastRatio(c, bg)));
  if (worst(fg) >= min) return fg;
  const base = hexToRgb(fg);
  const targets = [[0, 0, 0], [255, 255, 255]].sort((a, b) => worst(rgbToHex(b)) - worst(rgbToHex(a)));
  for (const target of targets) {
    for (let step = 1; step <= 100; step += 1) {
      const mixed = rgbToHex(base.map((c, i) => c + (target[i] - c) * (step / 100)));
      if (worst(mixed) >= min) return mixed;
    }
  }
  return fg;
}

/** The repaired value of one colour of a mode (all nine keys present): readable on every colour it is paired with. */
export function repairedColor(tokens, fgKey, min = AA_TEXT) {
  const backgrounds = PAIRS.filter((p) => p.fg === fgKey && isHex(tokens[p.bg])).map((p) => tokens[p.bg]);
  return backgrounds.length ? suggestColorForAll(tokens[fgKey], backgrounds, min) : tokens[fgKey];
}

/**
 * Glass Mode check. Header, menu, cards and footer sit over whatever is behind them, so primary text is tested
 * over the worst possible content (pure black and pure white). Secondary (muted) text is tested over the page
 * colour only: requiring it to survive pure black or white behind the bar would fail the default 68% glass.
 * Hero panels are held at 85% opacity or more by the theme; the caller passes that opacity.
 * @param {{ text: string, muted: string, bg: string }} tokens
 * @param {{ opacity: number, surface?: string }} glass
 * @param {number} [opacityOverride]
 * @returns {{ fg: string, under: string, ratio: number }[]} failures below the AA level
 */
export function glassFailures(tokens, glass, opacityOverride) {
  const opacity = (opacityOverride ?? glass.opacity) / 100;
  const surface = hexToRgb(glass.surface ?? tokens.bg);
  const out = [];
  const test = (fg, under) => {
    const ratio = ratioRgb(hexToRgb(tokens[fg]), blend(surface, under, opacity));
    if (ratio < AA_TEXT) out.push({ fg, under: rgbToHex(under), ratio });
  };
  for (const under of [[0, 0, 0], [255, 255, 255]]) test('text', under);
  test('muted', hexToRgb(tokens.bg));
  return out;
}
