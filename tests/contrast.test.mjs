import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AA_TEXT, blend, checkMode, contrastRatio, glassFailures, hexToRgb, isHex, rgbToHex, suggestColor } from '../src/core/contrast.mjs';
import { contrastReport, glassReport } from '../src/core/design-ops.mjs';
import { loadContent, createRegistry, validateContent } from '../src/lib/validate.mjs';
import { ROOT } from './helpers.mjs';

const content = loadContent(ROOT, `${ROOT}/content`);
const { design, presets, languages } = content;
const clone = (v) => structuredClone(v);

test('contrast ratio matches the known WCAG values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#ffffff', '#ffffff').toFixed(2), '1.00');
  assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48'); // the classic just-failing grey
  assert.ok(contrastRatio('#767676', '#ffffff') >= AA_TEXT);
});

test('hex helpers round-trip and validate', () => {
  assert.deepEqual(hexToRgb('#0a141e'), [10, 20, 30]);
  assert.equal(rgbToHex([10, 20, 30]), '#0a141e');
  assert.equal(rgbToHex([-5, 300, 20.4]), '#00ff14');
  assert.ok(isHex('#a1B2c3'));
  for (const bad of ['a1b2c3', '#abc', '#12345g', '', null]) assert.equal(isHex(bad), false);
});

test('every shipped preset passes all contrast pairs in both modes', () => {
  for (const p of presets) for (const mode of ['light', 'dark']) assert.deepEqual(checkMode(p.tokens[mode]), [], `${p.key} ${mode}`);
});

test('checkMode separates unreadable (error) from merely weak (warning)', () => {
  const tokens = clone(presets[0].tokens.light);
  tokens.muted = '#cccccc'; // ~1.6:1 on white
  tokens.accent = '#e06666'; // between 3 and 4.5 on white
  const rows = checkMode(tokens);
  const muted = rows.find((r) => r.fg === 'muted' && r.bg === 'bg');
  const accent = rows.find((r) => r.fg === 'accent' && r.bg === 'bg');
  assert.equal(muted.level, 'error');
  assert.equal(accent.level, 'warning');
  assert.ok(accent.ratio >= 3 && accent.ratio < AA_TEXT);
});

test('suggestColor reaches the target, keeps passing colours, and stays close to the original hue', () => {
  assert.equal(suggestColor('#000000', '#ffffff'), '#000000');
  const fixed = suggestColor('#e06666', '#ffffff');
  assert.ok(contrastRatio(fixed, '#ffffff') >= AA_TEXT);
  const [r, g, b] = hexToRgb(fixed);
  assert.ok(r > g && r > b, 'still reddish');
  const onDark = suggestColor('#333333', '#111111');
  assert.ok(contrastRatio(onDark, '#111111') >= AA_TEXT);
  assert.ok(luma(onDark) > luma('#333333'), 'moved towards white on a dark page');
});
const luma = (hex) => hexToRgb(hex).reduce((a, b) => a + b, 0);

test('blend mixes a colour over another by opacity', () => {
  assert.deepEqual(blend([255, 255, 255], [0, 0, 0], 0.5), [127.5, 127.5, 127.5]);
});

test('glass check: primary text over black and white, muted over the page; low opacity fails', () => {
  const t = presets[0].tokens.light;
  assert.deepEqual(glassFailures(t, { opacity: 68 }), [], 'the default 68% passes');
  const weak = glassFailures(t, { opacity: 30 });
  assert.ok(weak.some((f) => f.fg === 'text'));
});

test('the sample site has no contrast or glass problems', () => {
  assert.deepEqual(contrastReport(design, presets, languages), []);
  assert.deepEqual(glassReport(design, presets), []);
});

// ---------------------------------------------------------------- inside the validator

const registry = createRegistry(ROOT);
const validate = (c) => validateContent(c, registry);
// A changed copy of a config object is a new object, so tell the content which file it stands for.
const swap = (c, key, copy) => { c.fileOf = new Map(c.fileOf); c.fileOf.set(copy, content.fileOf.get(content[key])); c[key] = copy; return copy; };
const withDesign = (change) => { const c = { ...content }; change(swap(c, 'design', clone(design))); return c; };

test('validator: an unreadable custom colour is an error, a weak one a warning, and each names the mode', () => {
  const r = validate(withDesign((d) => { d.overrides = { light: { text: '#dddddd' } }; }));
  assert.ok(r.errors.some((e) => e.file.endsWith('design.json') && /light mode: text on bg/.test(e.message) && /practically unreadable/.test(e.message)));
  const w = validate(withDesign((d) => { d.overrides = { dark: { accent: '#a05050' } }; }));
  assert.ok(w.warnings.some((x) => /dark mode: accent on bg/.test(x.message)), JSON.stringify(w.warnings.map((x) => x.message)));
  assert.equal(w.errors.filter((e) => e.file.endsWith('design.json')).length, 0);
});

test('validator: language colours are checked on their own, and unknown languages are rejected', () => {
  const r = validate(withDesign((d) => { d.languageOverrides = { ar: { light: { text: '#e8e8e8' } } }; }));
  assert.ok(r.errors.some((e) => /light mode in ar: text on bg/.test(e.message)));
  const bad = validate(withDesign((d) => { d.languageOverrides = { xx: { light: { accent: '#112233' } } }; }));
  assert.ok(bad.errors.some((e) => e.path.includes('xx') || /xx/.test(e.message)));
});

test('validator: a custom preset that is not in use is checked as a warning', () => {
  const c = { ...content }; swap(c, 'presetsFile', clone(content.presetsFile));
  const bad = clone(c.presetsFile.items[0]);
  bad.id = 'dsp_zzzzzzzz'; bad.key = 'my-weak'; bad.custom = true; bad.tokens.light.muted = '#dddddd';
  c.presetsFile.items.push(bad);
  c.presets = c.presetsFile.items;
  const r = validate(c);
  assert.ok(r.warnings.some((w) => /preset "my-weak"/.test(w.message)));
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
});

test('repairedColor makes a colour readable on every colour it is paired with, keeping its hue', async () => {
  const { repairedColor, checkMode, contrastRatio, suggestColorForAll } = await import('../src/core/contrast.mjs');
  const tokens = { bg: '#f4efe4', surface: '#ebe4d2', text: '#dddddd', muted: '#51493a', onPrimary: '#f4efe4', primary: '#1a1a1a', accent: '#8a1c1c', border: '#c2b8a0', secondary: '#333333' };
  const fixed = repairedColor(tokens, 'text');
  assert.ok(contrastRatio(fixed, tokens.bg) >= 4.5 && contrastRatio(fixed, tokens.surface) >= 4.5, 'readable on the page and on cards');
  assert.deepEqual(checkMode({ ...tokens, text: fixed }).filter((f) => f.fg === 'text'), []);
  assert.equal(repairedColor(tokens, 'accent'), tokens.accent, 'a colour that already passes is left alone');
  assert.equal(repairedColor(tokens, 'border'), tokens.border, 'colours that are not text have no pairs and are never changed');
  // a button label is only judged against the button colour
  const label = repairedColor({ ...tokens, onPrimary: '#555555' }, 'onPrimary');
  assert.ok(contrastRatio(label, tokens.primary) >= 4.5);
  // an impossible request returns the colour unchanged instead of looping
  assert.equal(suggestColorForAll('#777777', ['#000000', '#ffffff'], 7), '#777777');
});
