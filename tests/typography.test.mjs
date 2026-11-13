import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FONT_PRESETS, applyPreset, currentPreset, googleFamilyName, parseFontStack, presetsFor, typographyIssues, unloadedFamilies, unusedGoogleFamilies } from '../src/core/typography.mjs';
import { createRegistryFromSchemas } from '../src/core/registry.mjs';
import { ROOT } from './helpers.mjs';

const schemas = ['common', 'block', 'article', 'project', 'media', 'taxonomy', 'profile', 'config'].map((n) => JSON.parse(readFileSync(new URL(`../schemas/${n}.schema.json`, import.meta.url), 'utf8')));
const registry = createRegistryFromSchemas(schemas);
const languages = JSON.parse(readFileSync(`${ROOT}/content/config/languages.json`, 'utf8')).items;
const [ar, en] = [languages.find((l) => l.code === 'ar'), languages.find((l) => l.code === 'en')];
const LANGUAGE = 'https://abdo.invalid/schemas/config.schema.json#wrapper/language';
registry.add({ $id: LANGUAGE, $ref: 'https://abdo.invalid/schemas/config.schema.json#/$defs/language' });

test('font stacks are split at top-level commas and families are unquoted', () => {
  assert.deepEqual(parseFontStack('"Noto Naskh Arabic", "IBM Plex Sans Arabic", Tahoma, serif'), ['Noto Naskh Arabic', 'IBM Plex Sans Arabic', 'Tahoma', 'serif']);
  assert.deepEqual(parseFontStack("'A, B', C"), ['A, B', 'C']);
  assert.deepEqual(parseFontStack(''), []);
  assert.equal(googleFamilyName('family=IBM+Plex+Sans:wght@400;600'), 'IBM Plex Sans');
  assert.equal(googleFamilyName('family=Cairo'), 'Cairo');
});

test('every font pairing is valid: Google Fonts fragments match the schema pattern and every named web font is loaded', () => {
  const pattern = /^family=[A-Za-z0-9+:;@.,_-]+$/;
  assert.equal(new Set(FONT_PRESETS.map((p) => p.id)).size, FONT_PRESETS.length);
  for (const preset of FONT_PRESETS) {
    for (const fragment of preset.googleFonts) assert.match(fragment, pattern, preset.id);
    assert.ok(preset.name.en && preset.name.ar, preset.id);
    const typography = { googleFonts: preset.googleFonts, fonts: preset.fonts };
    assert.deepEqual(unloadedFamilies(typography), [], `${preset.id}: first-choice fonts are loaded or system fonts`);
    assert.deepEqual(unusedGoogleFamilies(typography), [], `${preset.id}: no wasted downloads`);
  }
  assert.ok(presetsFor(ar).every((p) => p.script === 'ar') && presetsFor(ar).length >= 4);
  assert.ok(presetsFor(en).every((p) => p.script === 'latn') && presetsFor(en).length >= 4);
});

test('the site\'s own typography is one of the pairings, and applying any pairing keeps the settings valid', () => {
  assert.equal(currentPreset(ar), 'plex-naskh');
  assert.equal(currentPreset(en), 'plex-newsreader');
  for (const language of [ar, en]) {
    for (const preset of presetsFor(language)) {
      const next = structuredClone(language);
      next.typography = applyPreset(language.typography, preset.id);
      assert.deepEqual(registry.validate(LANGUAGE, next), [], preset.id);
      assert.equal(currentPreset(next), preset.id);
      assert.equal(next.typography.baseSize, language.typography.baseSize, 'size is kept');
      assert.equal(next.typography.fonts.mono, language.typography.fonts.mono, 'monospace font is kept');
    }
  }
  assert.throws(() => applyPreset(ar.typography, 'nope'), /Unknown font pairing/);
});

test('fonts named but not loaded are reported; system and generic fonts are not', () => {
  assert.deepEqual(unloadedFamilies({ googleFonts: [], fonts: { heading: 'Georgia, serif', body: 'system-ui, sans-serif' } }), []);
  assert.deepEqual(unloadedFamilies({ googleFonts: [], fonts: { heading: '"Fancy Display", serif', body: 'Tahoma' } }), ['Fancy Display']);
  assert.deepEqual(unloadedFamilies({ googleFonts: ['family=Fancy+Display:wght@400'], fonts: { heading: '"Fancy Display", serif', body: 'Tahoma' } }), []);
  assert.deepEqual(unusedGoogleFamilies({ googleFonts: ['family=Inter:wght@400', 'family=Lora'], fonts: { heading: 'Lora, serif', body: 'serif' } }), ['Inter']);
});

test('the shipped typography has no warnings, and bad settings are caught', () => {
  assert.deepEqual(typographyIssues(ar), []);
  assert.deepEqual(typographyIssues(en), []);
  const codes = (language) => typographyIssues(language).map((i) => i.code);
  const edit = (base, change) => { const l = structuredClone(base); change(l); return l; };
  assert.ok(codes(edit(ar, (l) => { l.typography.letterSpacing = '0.05em'; })).includes('rtl_letter_spacing'));
  assert.ok(!codes(edit(en, (l) => { l.typography.letterSpacing = '0.05em'; })).includes('rtl_letter_spacing'), 'letter spacing is fine for Latin text');
  assert.ok(codes(edit(ar, (l) => { l.typography.lineHeight = 1.4; })).includes('rtl_line_height'));
  assert.ok(codes(edit(en, (l) => { l.typography.baseSize = '14px'; })).includes('small_text'));
  assert.ok(codes(edit(en, (l) => { l.typography.baseSize = '1.6rem'; })).includes('large_text'));
  assert.ok(codes(edit(en, (l) => { l.layout.measure = '60rem'; })).includes('wide_measure'));
  assert.ok(codes(edit(en, (l) => { l.layout.measure = '16rem'; })).includes('narrow_measure'));
  assert.ok(codes(edit(en, (l) => { l.typography.fonts.body = '"Not Loaded", serif'; })).includes('font_not_loaded'));
  assert.ok(codes(edit(en, (l) => { l.typography.googleFonts.push('family=Spare:wght@400'); })).includes('font_unused'));
});
