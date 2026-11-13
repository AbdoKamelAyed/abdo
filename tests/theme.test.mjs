import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateGlassCss, generateThemeCss, googleFontsUrl, HERO_MIN_OPACITY, resolvePreset } from '../src/lib/theme.mjs';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { ROOT } from './helpers.mjs';

const content = loadContent(ROOT, `${ROOT}/content`);
const { design, presets, languages } = content;
const clone = (v) => structuredClone(v);

// ---------------------------------------------------------------- WCAG helpers

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` painted at `alpha` (0..1) over `bg`, as sRGB channel values. */
const blend = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

const MIN_TEXT = 4.5; // WCAG AA, normal-size text
const MIN_UI = 3; // WCAG AA, UI components and large text

test('the sample presets are a known set and the contrast checks below cover all of them', () => {
  assert.equal(presets.length, 8);
  assert.ok(presets.some((p) => p.key === design.preset));
});

for (const preset of presets) {
  for (const mode of ['light', 'dark']) {
    const t = preset.tokens[mode];

    test(`contrast: ${preset.key} / ${mode}: body, muted and accent text are readable on page and surface`, () => {
      const pairs = [
        ['text', 'bg', MIN_TEXT], ['text', 'surface', MIN_TEXT],
        ['muted', 'bg', MIN_TEXT], ['muted', 'surface', MIN_TEXT],
        ['accent', 'bg', MIN_TEXT], ['accent', 'surface', MIN_TEXT],
        ['onPrimary', 'primary', MIN_TEXT],
      ];
      for (const [fg, bg, min] of pairs) {
        const ratio = contrast(hexToRgb(t[fg]), hexToRgb(t[bg]));
        assert.ok(ratio >= min, `${preset.key} ${mode}: ${fg} ${t[fg]} on ${bg} ${t[bg]} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
      }
    });

    test(`contrast: ${preset.key} / ${mode}: borders are not required to be visible but the focus ring (accent) is`, () => {
      for (const bg of ['bg', 'surface']) {
        const ratio = contrast(hexToRgb(t.accent), hexToRgb(t[bg]));
        assert.ok(ratio >= MIN_UI, `${preset.key} ${mode}: focus ring ${t.accent} on ${bg} ${t[bg]} is ${ratio.toFixed(2)}:1, needs ${MIN_UI}:1`);
      }
    });

    test(`contrast: ${preset.key} / ${mode}: hero glass stays readable over the worst possible photo`, () => {
      // The hero panel sits on a photograph we know nothing about, so test it over pure black and pure white.
      const opacity = Math.max(design.glass[mode].opacity, HERO_MIN_OPACITY) / 100;
      const surface = hexToRgb(design.glass[mode].surface ?? t.bg);
      for (const under of [[0, 0, 0], [255, 255, 255]]) {
        const panel = blend(surface, under, opacity);
        const ratio = contrast(hexToRgb(t.text), panel);
        assert.ok(ratio >= MIN_TEXT, `${preset.key} ${mode}: hero text over ${under.join(',')} is ${ratio.toFixed(2)}:1, needs ${MIN_TEXT}:1`);
      }
    });

    test(`contrast: ${preset.key} / ${mode}: header and card glass stay readable over the page background and its backdrop colours`, () => {
      const backdrop = mode === 'light' ? preset.tokens.shared.backdropLight : preset.tokens.shared.backdropDark;
      const unders = [t.bg, ...((backdrop ?? '').match(/#[0-9a-fA-F]{6}\b/g) ?? [])].map(hexToRgb);
      const opacity = design.glass[mode].opacity / 100;
      const surface = hexToRgb(design.glass[mode].surface ?? t.bg);
      for (const under of unders) {
        const panel = blend(surface, under, opacity);
        for (const fg of ['text', 'muted']) {
          const ratio = contrast(hexToRgb(t[fg]), panel);
          assert.ok(ratio >= MIN_TEXT, `${preset.key} ${mode}: ${fg} on glass over ${under.map(Math.round).join(',')} is ${ratio.toFixed(2)}:1, needs ${MIN_TEXT}:1`);
        }
      }
    });
  }
}

// ---------------------------------------------------------------- generated CSS

const balanced = (css) => {
  let depth = 0;
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

test('theme.css has balanced braces for every preset', () => {
  for (const preset of presets) {
    const d = { ...clone(design), preset: preset.key };
    assert.ok(balanced(generateThemeCss(d, presets, languages)), `theme.css for ${preset.key}`);
    assert.ok(balanced(generateGlassCss(d, presets)), `glass.css for ${preset.key}`);
  }
});

test('theme.css defines light, automatic dark and explicit light/dark choices', () => {
  const css = generateThemeCss(design, presets, languages);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\{:root:not\(\[data-theme="light"\]\)\{/);
  assert.match(css, /:root\[data-theme="dark"\]\{/);
  assert.match(css, /:root\[data-theme="light"\]\{/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('theme.css carries independent typography for every language', () => {
  const css = generateThemeCss(design, presets, languages);
  for (const language of languages) {
    assert.match(css, new RegExp(`html\\[lang="${language.code}"\\]\\{`));
  }
  const ar = css.match(/html\[lang="ar"\]\{[^}]*\}/)[0];
  const en = css.match(/html\[lang="en"\]\{[^}]*\}/)[0];
  assert.notEqual(ar, en);
  assert.match(ar, /Arabic/);
  assert.doesNotMatch(en, /Arabic/);
});

test('every colour token is emitted for both modes', () => {
  const css = generateThemeCss(design, presets, languages);
  const tokens = resolvePreset(design, presets);
  for (const mode of ['light', 'dark']) {
    for (const key of ['bg', 'surface', 'text', 'muted', 'border', 'primary', 'onPrimary', 'accent']) {
      assert.ok(css.includes(tokens[mode][key]), `${mode} ${key} ${tokens[mode][key]} missing from theme.css`);
    }
  }
});

test('design.json overrides win over the preset, and only for the keys they name', () => {
  const d = clone(design);
  d.overrides = { light: { accent: '#123456' } };
  const tokens = resolvePreset(d, presets);
  const base = resolvePreset(design, presets);
  assert.equal(tokens.light.accent, '#123456');
  assert.equal(tokens.light.bg, base.light.bg);
  assert.deepEqual(tokens.dark, base.dark);
});

test('an unknown preset throws a clear error', () => {
  assert.throws(() => resolvePreset({ ...design, preset: 'nope' }, presets), /Unknown design preset "nope"/);
});

// ---------------------------------------------------------------- Glass Mode

test('every glass rule sits inside one @supports block with a solid fallback outside it', () => {
  const css = generateGlassCss(design, presets);
  const start = css.indexOf('@supports');
  assert.ok(start > -1, 'glass rules are guarded by @supports');
  const before = css.slice(0, start);
  assert.doesNotMatch(before.replace(/\/\*[\s\S]*?\*\//g, ''), /backdrop-filter/, 'no blur outside @supports');
  // Everything after the @supports opener is inside it: the block closes on the very last brace.
  const after = css.slice(start);
  assert.equal(after.trimEnd().at(-1), '}');
  assert.equal((css.match(/@supports/g) ?? []).length, 1);
  assert.match(css, /--glass-blur:18px;/);
  assert.match(css, /--glass-opacity:68%;/);
});

test('hero glass never drops below the readable minimum, whatever the configured opacity', () => {
  const d = clone(design);
  d.glass.light.opacity = 20;
  d.glass.dark.opacity = 90;
  const css = generateGlassCss(d, presets);
  assert.match(css, new RegExp(`--glass-opacity-hero:${HERO_MIN_OPACITY}%;`), 'raised to the floor');
  assert.match(css, /--glass-opacity-hero:90%;/, 'higher values are respected');
  assert.match(css, /--glass-opacity:20%;/, 'other elements follow the configured opacity');
});

test('turning Glass Mode off emits no blur at all and leaves colour tokens untouched', () => {
  const off = clone(design);
  off.glass.enabled = false;
  const css = generateGlassCss(off, presets);
  assert.doesNotMatch(css, /backdrop-filter|@supports/);
  assert.equal(generateThemeCss(off, presets, languages), generateThemeCss(design, presets, languages), 'theme.css is independent of glass settings');
});

test('only the glass elements that are switched on get rules', () => {
  const d = clone(design);
  d.glass.elements = { header: true, menu: false, cards: false, hero: false, footer: false };
  const css = generateGlassCss(d, presets);
  assert.match(css, /\.site-header\{/);
  assert.doesNotMatch(css, /\.card|\.hero__panel|\.site-footer/);
});

test('glass settings never change colour tokens', () => {
  const d = clone(design);
  d.glass.light.blur = 40;
  d.glass.dark.shadow = 'strong';
  assert.equal(generateThemeCss(d, presets, languages), generateThemeCss(design, presets, languages));
});

// ---------------------------------------------------------------- validation and fonts

test('design.json rejects glass values outside the supported ranges', () => {
  const registry = createRegistry(ROOT);
  const bad = loadContent(ROOT, `${ROOT}/content`);
  bad.design.glass.light.blur = 500;
  bad.design.glass.dark.opacity = 101;
  const text = validateContent(bad, registry).errors.map((e) => `${e.path}: ${e.message}`).join('\n');
  assert.match(text, /glass\.light\.blur/);
  assert.match(text, /glass\.dark\.opacity/);
});

test('very transparent glass is allowed but produces a readability warning', () => {
  const registry = createRegistry(ROOT);
  const content2 = loadContent(ROOT, `${ROOT}/content`);
  content2.design.glass.light.opacity = 20;
  const { errors, warnings } = validateContent(content2, registry);
  assert.deepEqual(errors, []);
  assert.match(warnings.map((w) => `${w.path}: ${w.message}`).join('\n'), /glass\.light\.opacity: 20% is very transparent/);
});

test('Google Fonts URLs are built from the languages that are configured, and omitted for system fonts', () => {
  const ar = languages.find((l) => l.code === 'ar');
  const url = googleFontsUrl(ar);
  assert.match(url, /^https:\/\/fonts\.googleapis\.com\/css2\?/);
  assert.match(url, /display=swap$/);
  const system = clone(ar);
  system.typography.googleFonts = [];
  assert.equal(googleFontsUrl(system), null);
});
