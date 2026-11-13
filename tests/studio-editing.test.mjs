import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inline } from '../src/lib/markup.mjs';
import { FORMATS, SPECIAL_CHARACTERS, addFootnoteDefinition, buildMatcher, findMatches, insertText, linkProblem, makeLink, nextFootnoteKey, removeLink, replaceAll, toggleFormat } from '../src/core/editing.mjs';
import { plantedMarkers, sampleBlocks } from './block-samples.mjs';

const TAGS = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', mark: 'mark', code: 'code', sup: 'sup', sub: 'sub' };

test('every format wraps a selection into markup the renderer turns into the matching tag', () => {
  for (const kind of Object.keys(FORMATS)) {
    const value = 'one two three';
    const r = toggleFormat(value, 4, 7, kind);
    assert.ok(r.changed, kind);
    assert.equal(r.value, `one ${FORMATS[kind]}two${FORMATS[kind]} three`, kind);
    assert.equal(r.value.slice(r.start, r.end), 'two', `${kind}: the selection stays on the word`);
    assert.match(inline(r.value), new RegExp(`<${TAGS[kind]}[^>]*>two</${TAGS[kind]}>`), `${kind} renders`);
  }
});

test('applying the same format again removes it, whether the markers are selected or just around the selection', () => {
  for (const kind of Object.keys(FORMATS)) {
    const wrapped = toggleFormat('one two three', 4, 7, kind);
    const outside = toggleFormat(wrapped.value, wrapped.start, wrapped.end, kind);
    assert.equal(outside.value, 'one two three', `${kind}: markers outside the selection`);
    assert.equal(outside.value.slice(outside.start, outside.end), 'two');
    const markers = FORMATS[kind].length;
    const inside = toggleFormat(wrapped.value, wrapped.start - markers, wrapped.end + markers, kind);
    assert.equal(inside.value, 'one two three', `${kind}: markers inside the selection`);
  }
});

test('bold and italic combine and come apart independently', () => {
  const bold = toggleFormat('word', 0, 4, 'bold');
  const both = toggleFormat(bold.value, bold.start, bold.end, 'italic');
  assert.equal(both.value, '***word***');
  assert.match(inline(both.value), /<em><strong>word<\/strong><\/em>|<strong><em>word<\/em><\/strong>/);
  const noItalic = toggleFormat(both.value, both.start, both.end, 'italic');
  assert.equal(noItalic.value, '**word**');
  const noBold = toggleFormat(both.value, both.start, both.end, 'bold');
  assert.equal(noBold.value, '*word*');
  // Italic on a bold word is added, not mistaken for already present.
  const italicOnBold = toggleFormat('**word**', 2, 6, 'italic');
  assert.equal(italicOnBold.value, '***word***');
  // Strikethrough and subscript share the tilde.
  const strike = toggleFormat('H2O', 1, 2, 'sub');
  assert.equal(strike.value, 'H~2~O');
  assert.match(inline(strike.value), /H<sub>2<\/sub>O/);
  const both2 = toggleFormat('~~a~~', 2, 3, 'sub');
  assert.equal(both2.value, '~~~a~~~');
});

test('markers hug the text: spaces at the edges of a selection stay outside', () => {
  const r = toggleFormat('one two three', 3, 8, 'bold'); // " two "
  assert.equal(r.value, 'one **two** three');
  assert.match(inline(r.value), /one <strong>two<\/strong> three/);
});

test('with nothing selected the word under the caret is formatted; between words a marker pair is left', () => {
  const r = toggleFormat('one two three', 5, 5, 'italic');
  assert.equal(r.value, 'one *two* three');
  const arabic = toggleFormat('مرحبا بالعالم', 2, 2, 'bold');
  assert.equal(arabic.value, '**مرحبا** بالعالم');
  const pair = toggleFormat('one  two', 4, 4, 'bold');
  assert.equal(pair.value, 'one **** two');
  assert.equal(pair.value.slice(pair.start - 2, pair.start), '**');
  assert.equal(pair.start, pair.end);
  // A format that cannot hold spaces refuses an empty range instead of leaving broken markers.
  assert.equal(toggleFormat('a  b', 2, 2, 'sup').changed, false);
});

test('superscript and subscript refuse selections with spaces', () => {
  const r = toggleFormat('two words', 0, 9, 'sup');
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'spaces');
  assert.equal(r.value, 'two words');
});

test('formatting never lets author text become markup: a selection holding < or & stays text', () => {
  const r = toggleFormat('a <b> & c', 2, 5, 'bold');
  const html = inline(r.value);
  assert.ok(html.includes('<strong>&lt;b&gt;</strong>'), html);
});

test('links: the label is kept, the address is checked, and the markup round-trips', () => {
  assert.equal(linkProblem(''), 'empty');
  assert.equal(linkProblem('a b'), 'spaces');
  assert.equal(linkProblem('javascript:alert(1)'), 'scheme');
  assert.equal(linkProblem('data:text/html,x'), 'scheme');
  for (const ok of ['https://example.com/a', 'http://x.org', 'mailto:a@b.co', 'tel:+20100', '/about', '#top']) assert.equal(linkProblem(ok), null, ok);

  const r = makeLink('read the docs now', 9, 13, 'https://example.com/a(b)');
  assert.equal(r.value, 'read the [docs](https://example.com/a(b%29) now');
  assert.match(inline(r.value), /<a href="https:\/\/example\.com\/a\(b%29" rel="noopener">docs<\/a>/);
  assert.equal(makeLink('x', 0, 0, 'https://e.co').value, '[https://e.co](https://e.co)x');
  // Brackets inside the label would break the link, so they are dropped from it.
  assert.equal(makeLink('a [b] c', 0, 7, '/x').value, '[a b c](/x)');

  const removed = removeLink('see [the docs](https://e.co) here', 8);
  assert.equal(removed.value, 'see the docs here');
  assert.equal(removeLink('no link', 2).changed, false);
  // A footnote reference is not a link.
  assert.equal(removeLink('a[^n1]b', 2).changed, false);
});

test('insertText replaces the selection and puts the caret after it', () => {
  const r = insertText('abcdef', 2, 4, '—');
  assert.equal(r.value, 'ab—ef');
  assert.equal(r.start, 3);
});

test('special characters: every entry is one visible character or a named invisible one', () => {
  const seen = new Set();
  for (const group of SPECIAL_CHARACTERS) {
    for (const entry of group.chars) {
      const char = typeof entry === 'string' ? entry : entry.char;
      assert.equal([...char].length, 1, `"${char}" is a single character`);
      assert.ok(!seen.has(char), `${char} is listed twice`);
      seen.add(char);
      if (group.group === 'invisible') assert.ok(entry.name, 'invisible characters need a name');
    }
  }
});

// ---------------------------------------------------------------- footnotes

test('nextFootnoteKey skips keys used by references or by footnote entries', () => {
  assert.equal(nextFootnoteKey([]), 'n1');
  const blocks = [
    { id: 'blk_00000001', type: 'paragraph', text: 'a[^n1] b[^n2]' },
    { id: 'blk_00000002', type: 'footnotes', items: [{ key: 'n3', text: 'x' }] },
  ];
  assert.equal(nextFootnoteKey(blocks), 'n4');
});

test('a footnote definition goes into the one footnotes block, which is created when missing', () => {
  const blocks = [{ id: 'blk_00000001', type: 'paragraph', text: 'a[^n1]' }];
  const created = addFootnoteDefinition(blocks, 'n1', 'Source', 'blk_00000009');
  assert.equal(blocks.length, 2);
  assert.equal(created.id, 'blk_00000009');
  assert.deepEqual(created.items, [{ key: 'n1', text: 'Source' }]);
  addFootnoteDefinition(blocks, 'n2', 'More', 'blk_0000000a');
  addFootnoteDefinition(blocks, 'n2', 'Again', 'blk_0000000a');
  assert.equal(blocks.length, 2, 'no second footnotes block');
  assert.deepEqual(blocks[1].items.map((i) => i.key), ['n1', 'n2']);
});

// ---------------------------------------------------------------- find and replace

test('the matcher treats the query literally and respects case and whole-word options', () => {
  assert.equal(buildMatcher(''), null);
  assert.deepEqual('a.c abc'.match(buildMatcher('a.c')), ['a.c']);
  assert.equal('Word word'.match(buildMatcher('word')).length, 2);
  assert.equal('Word word'.match(buildMatcher('word', { caseSensitive: true })).length, 1);
  assert.equal('cat concat cats'.match(buildMatcher('cat', { wholeWord: true })).length, 1);
  // Arabic words: whole-word matching must not split inside a word.
  assert.equal('كتاب الكتاب كتابان'.match(buildMatcher('كتاب', { wholeWord: true })).length, 1);
  assert.equal('(a+b)'.match(buildMatcher('(a+b)')).length, 1);
});

test('find reports where the text occurs and never looks inside literal code', () => {
  const blocks = sampleBlocks();
  assert.ok(plantedMarkers(blocks).has('T1'));
  const hits = findMatches(blocks, 'T1', { wholeWord: true });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].count, 1);
  assert.equal(hits[0].blockIndex, 0);
  assert.deepEqual(findMatches(blocks, '<b>literal</b>'), [], 'code text is not searched');
  assert.deepEqual(findMatches(blocks, ''), []);
});

test('replace changes every field, counts honestly, takes the replacement literally and leaves code alone', () => {
  const blocks = sampleBlocks();
  const before = JSON.stringify(blocks);
  const { blocks: next, count } = replaceAll(blocks, 'T', '$&-x', { caseSensitive: true });
  assert.ok(count > 20);
  assert.equal(JSON.stringify(blocks), before, 'the input is not modified');
  const text = JSON.stringify(next);
  assert.ok(text.includes('$&-x'), 'a "$&" replacement is literal');
  const code = next.find((b) => b.type === 'code');
  assert.equal(code.text, blocks.find((b) => b.type === 'code').text);
  // Replacing back restores everything.
  const back = replaceAll(next, '$&-x', 'T');
  assert.deepEqual(back.blocks, blocks);
  assert.equal(replaceAll(blocks, 'zzz-nothing', 'x').count, 0);
});
