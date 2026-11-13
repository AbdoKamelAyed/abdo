import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPreset, CARD_SHADOWS, deleteBlocker, deletePreset, effectiveTokens, overrideCount, presetFromCurrent, presetKey,
  renamePreset, resetColors, setColor, setShared,
} from '../src/core/design-ops.mjs';
import { generateThemeCss } from '../src/lib/theme.mjs';
import { loadContent } from '../src/lib/validate.mjs';
import { ROOT } from './helpers.mjs';

const content = loadContent(ROOT, `${ROOT}/content`);
const { design, presets, languages } = content;
const base = effectiveTokens(design, presets);

test('setColor stores only real changes and resets when the value equals the preset', () => {
  const a = setColor(design, presets, { mode: 'light', key: 'accent', value: '#112233' });
  assert.equal(a.overrides.light.accent, '#112233');
  assert.equal(effectiveTokens(a, presets).light.accent, '#112233');
  const same = setColor(a, presets, { mode: 'light', key: 'accent', value: base.light.accent.toUpperCase() });
  assert.equal(same.overrides, undefined, 'back to the preset value: nothing stored, empty containers removed');
  assert.equal(setColor(a, presets, { mode: 'light', key: 'accent', value: null }).overrides, undefined);
  assert.equal(design.overrides && Object.keys(design.overrides).length, 0, 'the input is never modified');
});

test('setColor rejects unknown modes and keys', () => {
  assert.throws(() => setColor(design, presets, { mode: 'sepia', key: 'accent', value: '#112233' }));
  assert.throws(() => setColor(design, presets, { mode: 'light', key: 'sparkle', value: '#112233' }));
});

test('language colours sit on top of site-wide changes and are independent per language', () => {
  let d = setColor(design, presets, { mode: 'light', key: 'accent', value: '#112233' });
  d = setColor(d, presets, { lang: 'ar', mode: 'light', key: 'accent', value: '#445566' });
  assert.equal(effectiveTokens(d, presets, 'ar').light.accent, '#445566');
  assert.equal(effectiveTokens(d, presets, 'en').light.accent, '#112233');
  assert.equal(effectiveTokens(d, presets).light.accent, '#112233');
  assert.deepEqual(overrideCount(d), { site: 1, languages: { ar: 1 } });
  // equal to the site-wide value => not stored for the language
  const back = setColor(d, presets, { lang: 'ar', mode: 'light', key: 'accent', value: '#112233' });
  assert.equal(back.languageOverrides, undefined);
  assert.equal(resetColors(d, { lang: 'ar' }).languageOverrides, undefined);
  assert.equal(resetColors(d).overrides, undefined);
  assert.ok(resetColors(d).languageOverrides.ar, 'site-wide reset leaves language colours alone');
});

test('setShared stores sizes and shadows, and resets them', () => {
  const d = setShared(design, presets, 'radius', '12px');
  assert.equal(d.overrides.shared.radius, '12px');
  assert.equal(setShared(d, presets, 'radius', base.shared.radius).overrides, undefined);
  assert.equal(setShared(design, presets, 'cardShadow', 'medium').overrides.shared.cardShadow, 'medium');
  assert.ok(CARD_SHADOWS.includes('medium'));
});

test('choosing a preset keeps the owner\'s colours by default and never touches content', () => {
  const other = presets.find((p) => p.key !== design.preset).key;
  const withColor = setColor(design, presets, { mode: 'dark', key: 'accent', value: '#abcdef' });
  const kept = applyPreset(withColor, presets, other);
  assert.equal(kept.preset, other);
  assert.equal(kept.overrides.dark.accent, '#abcdef');
  const cleared = applyPreset(withColor, presets, other, { keepOverrides: false });
  assert.equal(cleared.overrides, undefined);
  assert.deepEqual(cleared.glass, design.glass, 'glass is a separate system and is kept');
  assert.throws(() => applyPreset(design, presets, 'no-such-preset'));
});

test('presetKey makes safe, unique keys', () => {
  assert.equal(presetKey('My Look', []), 'my-look');
  assert.equal(presetKey('My Look', ['my-look']), 'my-look-2');
  assert.equal(presetKey('My Look', ['my-look', 'my-look-2']), 'my-look-3');
  assert.equal(presetKey('تصميمي', []), 'custom');
  assert.match(presetKey('  --Weird!!  Name -- ', []), /^[a-z0-9-]+$/);
});

test('presetFromCurrent copies the resolved look into a new, valid, custom preset', () => {
  const d = setShared(setColor(design, presets, { mode: 'light', key: 'bg', value: '#fafaf0' }), presets, 'radius', '10px');
  const p = presetFromCurrent(d, presets, { ar: 'مظهري', en: 'My Look' }, ['dsp_aaaaaaaa']);
  assert.match(p.id, /^dsp_[0-9a-z]{8}$/);
  assert.equal(p.key, 'my-look');
  assert.equal(p.custom, true);
  assert.equal(p.tokens.light.bg, '#fafaf0');
  assert.equal(p.tokens.shared.radius, '10px');
  assert.deepEqual(Object.keys(p.tokens.light).sort(), Object.keys(presets[0].tokens.light).sort());
  assert.throws(() => presetFromCurrent(design, presets, { ar: '', en: '  ' }));
  // using it reproduces the same CSS as the look it was made from
  const again = { ...design, preset: p.key, overrides: {} };
  const css = (dd, pp) => generateThemeCss(dd, pp, languages.filter((l) => l.enabled)).replace(/preset: [^)]+\)/, '');
  assert.equal(css(again, [...presets, p]), css(d, presets));
});

test('shipped presets cannot be deleted or renamed; custom ones can unless in use', () => {
  const p = presetFromCurrent(design, presets, { ar: 'أ', en: 'Mine' });
  const all = [...presets, p];
  assert.equal(deleteBlocker(all, presets[0].key, design), 'shipped');
  assert.equal(deleteBlocker(all, 'nope', design), 'missing');
  assert.equal(deleteBlocker(all, 'mine', { ...design, preset: 'mine' }), 'active');
  assert.equal(deleteBlocker(all, 'mine', design), null);
  assert.equal(deletePreset(all, 'mine', design).length, presets.length);
  assert.throws(() => deletePreset(all, presets[0].key, design), (e) => e.code === 'shipped');
  assert.throws(() => renamePreset(all, presets[0].key, { ar: 'x', en: 'x' }));
  assert.equal(renamePreset(all, 'mine', { ar: '', en: 'Renamed' }).find((x) => x.key === 'mine').name.ar, 'Renamed');
});
