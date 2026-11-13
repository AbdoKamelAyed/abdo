import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_OPTIONS, editDistance, foldName, keyOf, normalizeWord, scan, tokens } from '../src/core/search-text.mjs';

const same = (...words) => {
  const keys = words.map((w) => normalizeWord(w));
  assert.equal(new Set(keys).size, 1, `${words.join(' ')} -> ${keys.join(' ')}`);
};

test('alef variants, alef maqsura and the Persian letters fold to one Arabic form', () => {
  same('احمد', 'أحمد', 'إحمد', 'آحمد', 'ٱحمد');
  same('علي', 'على');
  assert.equal(normalizeWord('مستشفى'), 'مستشفي');
  same('كتاب', 'کتاب');
  same('فارسي', 'فارسی');
});

test('ta marbuta folds to ha by default and can be left alone', () => {
  assert.equal(normalizeWord('مدرسة'), 'مدرسه');
  assert.equal(normalizeWord('مدرسة', { ...DEFAULT_OPTIONS, foldTaMarbuta: false }), 'مدرسة');
  same('مدرسة', 'مدرسه');
});

test('short vowels, shadda, tanween, dagger alef, tatweel and invisible marks are removed', () => {
  same('محمد', 'مُحَمَّد', 'مـحـمـد', 'م‌حمد');
  same('كتب', 'كَتَبَ');
  same('كتاب', 'كِتَابٌ');
  assert.equal(normalizeWord('هٰذا'), 'هذا');
});

test('hamza on waw or ya is folded together with the marks, so the common ya spelling still matches', () => {
  assert.equal(normalizeWord('مؤسسة'), 'موسسه');
  assert.equal(normalizeWord('مسئول'), 'مسيول');
  same('مسئول', 'مسيول');
});

test('Arabic-Indic and Persian digits become ASCII digits', () => {
  assert.equal(normalizeWord('٢٠٢٦'), '2026');
  assert.equal(normalizeWord('۱۲۳'), '123');
  assert.equal(normalizeWord('v٢'), 'v2');
});

test('Latin text is lower-cased and loses accents', () => {
  assert.equal(normalizeWord('Café'), 'cafe');
  assert.equal(normalizeWord('Déjà'), 'deja');
  assert.equal(normalizeWord('Straße'), 'straße'.normalize('NFKD').replace(/[̀-ͯ]/g, ''));
});

test('presentation forms copied from PDFs are folded to the plain letters', () => {
  same('كتاب', 'ﻛﺘﺎﺑ');
});

test('the definite article (and its common prefixed forms) is removed from Arabic words only', () => {
  assert.equal(keyOf('الكتاب'), 'كتاب');
  assert.equal(keyOf('والكتاب'), 'كتاب');
  assert.equal(keyOf('بالمدرسة'), 'مدرسه');
  assert.equal(keyOf('للمعلم'), 'معلم');
  assert.equal(keyOf('الأول'), 'اول');
  assert.equal(keyOf('اللغة'), 'لغه');
  assert.equal(keyOf('كتاب'), 'كتاب');
  assert.equal(keyOf('The'), 'the', 'Latin words are never touched');
  assert.equal(keyOf('الكتاب', { ...DEFAULT_OPTIONS, stripDefiniteArticle: false }), 'الكتاب');
});

test('short words that merely start with ال are kept, and a word being typed can be looked up by what follows the article', () => {
  assert.equal(keyOf('الله'), 'الله');
  assert.equal(keyOf('ال'), 'ال');
  assert.equal(keyOf('الم'), 'الم');
  assert.equal(keyOf('الم', DEFAULT_OPTIONS, 1), 'م');
});

test('scan keeps positions in the original text, marks and all, so matches can be highlighted without changing the text', () => {
  const text = 'مَرحبًا بالكَتاب ـ Café، 2026';
  const found = scan(text);
  assert.deepEqual(found.map((t) => t.key), ['مرحبا', 'كتاب', 'cafe', '2026']);
  assert.deepEqual(found.map((t) => text.slice(t.start, t.end)), ['مَرحبًا', 'بالكَتاب', 'Café', '2026']);
  assert.deepEqual(tokens('Hello, world! 3 times'), ['hello', 'world', '3', 'times']);
});

test('words that normalise to nothing are dropped', () => {
  assert.deepEqual(tokens('ًٌ ـ'), []);
});

test('foldName makes names comparable: case, accents, punctuation, spaces and Arabic spelling variants', () => {
  assert.equal(foldName('Machine-Learning'), foldName('machine learning'));
  assert.equal(foldName('  Café  '), foldName('cafe'));
  assert.equal(foldName('إدارة'), foldName('ادارة'));
  assert.notEqual(foldName('الكتاب'), foldName('كتاب'), 'names keep their article; only search keys drop it');
});

test('editDistance counts insertions, deletions, substitutions and swaps, and gives up past the limit', () => {
  assert.equal(editDistance('book', 'book'), 0);
  assert.equal(editDistance('book', 'boook'), 1);
  assert.equal(editDistance('book', 'bok'), 1);
  assert.equal(editDistance('book', 'back'), 2);
  assert.equal(editDistance('form', 'from'), 1, 'a swap of neighbours costs one');
  assert.equal(editDistance('abcdef', 'uvwxyz'), 3);
  assert.equal(editDistance('a', 'abcdef'), 3);
});
