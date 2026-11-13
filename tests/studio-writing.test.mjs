import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory } from '../src/core/history.mjs';
import { countParagraphs, editorialChecks, goalProgress, outline, readability, repeatedWords, wordsOf, writingStats } from '../src/core/writing.mjs';
import { countWords } from '../src/core/blocks-meta.mjs';
import { sampleBlocks } from './block-samples.mjs';
import { workspace } from './helpers.mjs';

let n = 0;
const block = (type, props) => ({ id: `blk_t${String((n += 1)).padStart(7, '0')}`, type, ...props });
const para = (text, extra = {}) => block('paragraph', { text, ...extra });
const head = (level, text) => block('heading', { level, text });

test('statistics count what the site counts, and ignore hidden blocks and markup', () => {
  const blocks = [para('One **bold** word[^n1] here.'), para('Hidden words here', { hidden: true }), head(2, 'A title'), block('code', { text: 'let a = 1 + 2;' })];
  const s = writingStats(blocks, { wpm: 200 });
  assert.equal(s.words, 6);
  assert.equal(s.words, countWords(blocks), 'the same number as the published word count');
  assert.equal(s.paragraphs, 1);
  assert.equal(s.blocks, 3);
  assert.equal(s.readingMinutes, 1);
  assert.equal(s.charactersNoSpaces, [...'Oneboldwordhere.Atitle'].length);
  assert.ok(s.characters > s.charactersNoSpaces);
  assert.equal(writingStats([]).readingMinutes, 0);
  assert.equal(writingStats([para('word '.repeat(450))], { wpm: 150 }).readingMinutes, 3);
});

test('paragraph counting splits at blank lines', () => {
  assert.equal(countParagraphs([para('a\n\nb\n\nc'), head(2, 'x'), block('imagetext', { mediaId: 'med_00000001', text: 'p1\n\np2' })]), 5);
  assert.equal(countParagraphs([para('hidden', { hidden: true })]), 0);
});

test('the sample blocks of every type can be analysed without error', () => {
  const blocks = sampleBlocks();
  const s = writingStats(blocks);
  assert.ok(s.words > 20 && s.paragraphs >= 1);
  assert.equal(s.words, countWords(blocks));
  assert.ok(readability(blocks));
  assert.ok(repeatedWords(blocks));
  assert.ok(Array.isArray(editorialChecks({ blocks })));
});

test('outline lists visible headings in order with their level', () => {
  const blocks = [head(2, 'First'), para('x'), head(3, 'Under **first**'), head(2, 'Hidden'), head(2, 'Second')];
  blocks[3].hidden = true;
  assert.deepEqual(outline(blocks), [{ blockIndex: 0, level: 2, text: 'First' }, { blockIndex: 2, level: 3, text: 'Under first' }, { blockIndex: 4, level: 2, text: 'Second' }]);
});

test('word goals report progress and never exceed 100%', () => {
  assert.deepEqual(goalProgress(250, 1000), { goal: 1000, words: 250, percent: 25, reached: false });
  assert.deepEqual(goalProgress(1500, 1000), { goal: 1000, words: 1500, percent: 100, reached: true });
  assert.equal(goalProgress(10, 0), null);
  assert.equal(goalProgress(10, 1.5), null);
});

test('readability: too little text is not judged, short sentences are easy, very long ones are hard', () => {
  assert.equal(readability([para('Short text.')]).level, null);
  const easy = para(Array.from({ length: 8 }, () => 'The cat sat on the old mat today.').join(' '));
  assert.equal(readability([easy]).level, 'easy');
  const hardSentence = `${'Notwithstanding considerable organisational complexity, administrators repeatedly reconsidered institutional arrangements '.repeat(4)}.`;
  assert.equal(readability([para(hardSentence)]).level, 'hard');
  const medium = para(Array.from({ length: 3 }, () => 'We walked down to the river early in the morning and then sat there for a long time watching the water.').join(' '));
  assert.equal(readability([medium]).level, 'medium');
  // Arabic works too (the band is a heuristic, not a formula).
  const ar = para(Array.from({ length: 8 }, () => 'ذهب الولد إلى المدرسة صباحا.').join(' '));
  assert.ok(['easy', 'medium'].includes(readability([ar]).level));
});

test('repeated words: frequent content words are listed, small function words and short words are not', () => {
  const text = `${'Garden of joy. '.repeat(6)}the the plan ${'with this that '.repeat(8)}`;
  const { frequent, doubled } = repeatedWords([para(text)]);
  assert.deepEqual(frequent.map((f) => f.word), ['garden']);
  assert.equal(frequent[0].count, 6);
  assert.deepEqual(doubled.map((d) => d.word), ['the']);
  assert.deepEqual(repeatedWords([para('A short text with no repetition at all.')]), { frequent: [], doubled: [] });
});

test('repeated words in Arabic ignore the article, vowel marks and the stretching character', () => {
  const text = `${'الكِتَاب كتاب كتـاب '.repeat(3)} هذا نص آخر مختلف تمامًا`;
  const { frequent } = repeatedWords([para(text)]);
  assert.equal(frequent[0]?.word, 'كتاب');
  assert.equal(frequent[0]?.count, 9);
});

test('words are found in Arabic and English text alike', () => {
  assert.deepEqual(wordsOf('Hello, world — مرحبا بالعالم 2026!'), ['Hello', 'world', 'مرحبا', 'بالعالم', '2026']);
});

test('editorial checks flag structure problems and stay quiet about a clean article', () => {
  const clean = [head(2, 'Intro'), para('Some words here.'), head(3, 'Detail'), para('More words.')];
  assert.deepEqual(editorialChecks({ blocks: clean, title: 'A fine title', excerpt: 'An excerpt that is long enough to be a good description for search results pages.' }), []);

  const codes = (input) => editorialChecks(input).map((c) => c.code);
  assert.deepEqual(codes({ blocks: [] }), ['no_body']);
  assert.ok(codes({ blocks: [para('word '.repeat(450))] }).includes('no_headings'));
  assert.ok(!codes({ blocks: [para('word '.repeat(100))] }).includes('no_headings'), 'short texts need no headings');

  const skip = editorialChecks({ blocks: [head(2, 'A'), head(4, 'B')] }).find((c) => c.code === 'heading_skip');
  assert.deepEqual(skip, { code: 'heading_skip', level: 'warn', blockIndex: 1, params: { from: 2, to: 4 } });
  assert.ok(!codes({ blocks: [head(4, 'B'), head(2, 'A')] }).includes('heading_skip'), 'going up again is fine');

  assert.ok(codes({ blocks: [head(2, 'Same'), head(2, 'same')] }).includes('duplicate_heading'));
  assert.ok(codes({ blocks: [para('word '.repeat(200))] }).includes('long_paragraph'));
  assert.ok(codes({ blocks: [para('Write ⟦your opening here⟧')] }).includes('placeholder'));
  assert.ok(codes({ blocks: [head(2, 'x')], title: 'x'.repeat(80) }).includes('title_long'));
  assert.ok(codes({ blocks: [head(2, 'x')], excerpt: 'short' }).includes('description_short'));
  assert.ok(codes({ blocks: [head(2, 'x')], excerpt: 'x'.repeat(200) }).includes('description_long'));
  assert.ok(codes({ blocks: [head(2, 'x')], hasCover: false }).includes('no_cover'));
  // An SEO override replaces the title and excerpt in the length checks.
  assert.ok(!codes({ blocks: [head(2, 'x')], title: 'x'.repeat(80), seoTitle: 'Short' }).includes('title_long'));
  // Hidden blocks are not part of the article.
  assert.deepEqual(codes({ blocks: [{ ...head(2, 'A'), hidden: true }] }), ['no_body']);
});

// ---------------------------------------------------------------- validation: template placeholders

test('a template placeholder is a warning in a draft and an error once the translation is published', () => {
  const ws = workspace();
  try {
    const rel = 'articles/art_welcome1.json';
    const article = ws.read(rel);
    const lang = Object.keys(article.translations)[0];
    article.translations[lang].body.push({ id: 'blk_placeh01', type: 'paragraph', text: 'Intro ⟦write the opening⟧' });
    const run = (record) => { ws.write(rel, record); return ws.build({ validateOnly: true }); };

    article.status = 'draft'; article.translations[lang].status = 'draft';
    const draft = run(article);
    assert.ok(draft.ok && draft.warnings.some((w) => /placeholder/.test(w.message)), 'draft: warning');
    assert.ok(!draft.errors.some((e) => /placeholder/.test(e.message)), 'draft: not an error');

    article.status = 'published'; article.translations[lang].status = 'published'; article.publishedAt ??= '2026-01-01T00:00:00Z';
    const live = run(article);
    assert.ok(!live.ok && live.errors.some((e) => /placeholder/.test(e.message)), 'published: error');
  } finally { ws.cleanup(); }
});

// ---------------------------------------------------------------- undo / redo

test('undo and redo walk back and forth through the recorded states', () => {
  const history = createHistory();
  let value = { a: 1 };
  const change = (next, key) => { history.checkpoint(value, key); value = next; };
  change({ a: 2 }); change({ a: 3 }); change({ a: 4 });
  assert.ok(history.canUndo && !history.canRedo);
  value = history.undo(value); assert.deepEqual(value, { a: 3 });
  value = history.undo(value); assert.deepEqual(value, { a: 2 });
  assert.ok(history.canRedo);
  value = history.redo(value); assert.deepEqual(value, { a: 3 });
  value = history.undo(value);
  value = history.undo(value); assert.deepEqual(value, { a: 1 });
  assert.equal(history.undo(value), undefined, 'nothing left to undo');
  assert.equal(history.canUndo, false);
});

test('a new change after an undo discards the redo branch', () => {
  const history = createHistory();
  let value = 'a';
  const change = (next) => { history.checkpoint(value); value = next; };
  change('b'); change('c');
  value = history.undo(value);
  assert.ok(history.canRedo);
  change('d');
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(value), undefined);
});

test('typing in the same field within a short time is one step; another field or a pause starts a new one', () => {
  let clock = 0;
  const history = createHistory({ now: () => clock, mergeMs: 1000 });
  let value = 'x';
  const type = (next, key) => { history.checkpoint(value, key); value = next; };
  type('xa', 'f1'); clock += 100; type('xab', 'f1'); clock += 100; type('xabc', 'f1');
  assert.equal(history.size, 1);
  value = history.undo(value);
  assert.equal(value, 'x', 'one undo reverts the whole burst');

  history.clear(); value = 'x';
  type('xa', 'f1'); clock += 100; type('xab', 'f2'); // another field
  assert.equal(history.size, 2);
  clock += 5000; type('xabc', 'f2'); // after a pause
  assert.equal(history.size, 3);
  history.seal(); type('xabcd', 'f2');
  assert.equal(history.size, 4);
  // Changes without a key are never merged.
  clock += 10; type('1', null); type('2', null);
  assert.equal(history.size, 6);
});

test('history copies what it records, ignores no-op checkpoints and is bounded', () => {
  const history = createHistory({ limit: 3 });
  const value = { list: [1] };
  history.checkpoint(value);
  value.list.push(2); // later edits to the live object must not rewrite history
  const back = history.undo(value);
  assert.deepEqual(back, { list: [1] });

  history.clear();
  history.checkpoint('same'); history.checkpoint('same');
  assert.equal(history.size, 1);
  for (let i = 0; i < 10; i += 1) history.checkpoint(`v${i}`);
  assert.equal(history.size, 3);
});
