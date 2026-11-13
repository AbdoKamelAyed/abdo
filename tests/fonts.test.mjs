import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFonts, CUSTOM, FONTS, FONT_BY_ID, fontsFor, letterSpacingAllowed, matchFont, usesGoogleFonts } from '../src/core/fonts.mjs';
import { googleFontsUrl } from '../src/lib/theme.mjs';
import { loadContent } from '../src/lib/validate.mjs';
import { ROOT } from './helpers.mjs';

const { languages } = loadContent(ROOT, `${ROOT}/content`);
const ar = languages.find((l) => l.code === 'ar');
const en = languages.find((l) => l.code === 'en');

test('the catalogue has unique ids, valid Google Fonts fragments and non-empty stacks', () => {
  assert.equal(new Set(FONTS.map((f) => f.id)).size, FONTS.length);
  for (const f of FONTS) {
    assert.ok(f.stack.length > 10 && /(sans-serif|serif)$/.test(f.stack), f.id);
    if (f.google) assert.match(f.google, /^family=[A-Za-z0-9+:;@.,_-]+$/, f.id); // same pattern as the schema
  }
  assert.ok(FONTS.some((f) => !f.google), 'system fonts exist');
});

test('the fonts the site ships with are recognised, so the picker never shows "custom" for them', () => {
  for (const l of [ar, en]) for (const part of ['heading', 'body']) assert.notEqual(matchFont(l.typography.fonts[part]), CUSTOM, `${l.code} ${part}`);
  assert.equal(matchFont('Comic Sans MS, cursive'), CUSTOM);
  assert.equal(matchFont(`  ${FONT_BY_ID.cairo.stack.replace(', ', ',   ')}  `), 'cairo', 'spacing differences are ignored');
});

test('right-to-left languages are offered Arabic and system fonts only; left-to-right ones Latin and system fonts', () => {
  assert.ok(fontsFor('rtl').every((f) => f.script !== 'latin') && fontsFor('rtl').some((f) => f.id === 'cairo'));
  assert.ok(fontsFor('ltr').every((f) => f.script !== 'arabic') && fontsFor('ltr').some((f) => f.id === 'inter'));
});

test('applying a font sets the stack and keeps exactly the Google requests it needs', () => {
  const next = applyFonts(en.typography, { heading: 'playfair-display' });
  assert.equal(next.fonts.heading, FONT_BY_ID['playfair-display'].stack);
  assert.equal(next.fonts.body, en.typography.fonts.body, 'untouched');
  assert.deepEqual([...next.googleFonts].sort(), [FONT_BY_ID['playfair-display'].google, FONT_BY_ID['ibm-plex-sans'].google].sort());
  assert.equal(en.typography.fonts.heading.startsWith('Newsreader'), true, 'the input is not modified');
});

test('choosing system fonts for both removes every Google request', () => {
  const next = applyFonts(ar.typography, { heading: 'system-serif', body: 'system-sans' });
  assert.deepEqual(next.googleFonts, []);
  assert.equal(googleFontsUrl({ typography: next }), null);
  assert.equal(usesGoogleFonts(next), false);
  assert.equal(usesGoogleFonts(ar.typography), true);
});

test('"custom" keeps the owner\'s own stack and its Google request', () => {
  const t = structuredClone(en.typography);
  t.fonts.heading = '"My Own Font", serif'; t.googleFonts.push('family=My+Own+Font:wght@400');
  const next = applyFonts(t, { body: 'inter', heading: CUSTOM });
  assert.equal(next.fonts.heading, '"My Own Font", serif');
  assert.ok(next.googleFonts.includes('family=My+Own+Font:wght@400'));
  assert.ok(next.googleFonts.includes(FONT_BY_ID.inter.google));
  assert.ok(!next.googleFonts.includes(FONT_BY_ID['ibm-plex-sans'].google), 'the replaced font is no longer requested');
});

test('letter spacing is only adjustable for left-to-right languages', () => {
  assert.equal(letterSpacingAllowed('rtl'), false);
  assert.equal(letterSpacingAllowed('ltr'), true);
});
