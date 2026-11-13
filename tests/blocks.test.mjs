// The block system: inline markup, every block type's rendering, text-field coverage, validation rules,
// and a full build of an article that uses every block type.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { BLOCK_GROUPS, BLOCK_TYPES, countWords, footnoteReferences, mapBlockTexts, mediaReferences, proseStrings, textFields } from '../src/core/blocks-meta.mjs';
import { OVERRIDE_LIMITS, overrideClassNames, overrideClasses, overrideIssues, overrideStep } from '../src/core/typography.mjs';
import { FOCAL_STEP, focalClass, focalClassNames, normalizeFocal } from '../src/core/focal.mjs';
import { buildTree, checklistProblems, clampLevels, listLevel, listProblems, listText, shiftLines, withLevel } from '../src/core/lists.mjs';
import { renderBlocks } from '../src/lib/blocks.mjs';
import { inline, plain } from '../src/lib/markup.mjs';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { plantedMarkers, sampleBlocks } from './block-samples.mjs';
import { ROOT, allText, workspace } from './helpers.mjs';

const registry = createRegistry(ROOT);
const workspaces = [];
after(() => workspaces.forEach((w) => w.cleanup()));

const media = (id, lang, alt) => ({ id, url: `/m/${id}.png`, alt: alt ?? `Alt of ${id}`, width: 800, height: 600, caption: '', credit: '', isRaster: true });
const ctx = {
  lang: 'en',
  media,
  t: (key) => `§${key}§`,
  item: (kind, id) => (id === 'art_welcome1' || id === 'prj_archive1' ? { title: `Title of ${id}`, excerpt: 'An excerpt', url: `/${kind}/${id}/` } : null),
  author: () => ({ name: 'Abdo', headline: 'Writer', summary: 'Sum', photo: { url: '/p.png' }, url: '/about/' }),
};
const render = (blocks, extra = {}) => renderBlocks(blocks, { ...ctx, ...extra });

// ---------------------------------------------------------------- inline markup

test('new inline markup: underline, strikethrough, highlight, superscript, subscript', () => {
  assert.equal(inline('++u++ ~~s~~ ==m== x^2^ H~2~O'), '<u>u</u> <s>s</s> <mark>m</mark> x<sup>2</sup> H<sub>2</sub>O');
  assert.equal(inline('**++both++**'), '<strong><u>both</u></strong>');
});

test('ordinary text that merely contains marker characters is left alone', () => {
  for (const text of ['C++ and C++', 'a == b', 'a ~5 to ~10 b', 'x ^ y', '2 + 2 = 4', 'C++/C++ is odd', 'price ~ $5']) {
    const html = inline(text);
    assert.ok(!/<(u|s|mark|sup|sub)>/.test(html), `${text} -> ${html}`);
  }
});

test('code spans protect the new markers too', () => {
  assert.equal(inline('`++x++ ==y==`'), '<code dir="ltr">++x++ ==y==</code>');
});

test('footnote references become numbered links only when the footnote exists', () => {
  const html = inline('text[^a] and[^b]', { footnotes: new Map([['a', 1]]) });
  assert.match(html, /<sup class="fnref"><a href="#fn-a" id="fnref-a" role="doc-noteref">1<\/a><\/sup>/);
  assert.ok(html.includes('[^b]'), 'an unknown key stays visible as text');
  assert.equal(inline('plain [^a]'), 'plain [^a]');
});

test('plain() removes the new markup and footnote markers', () => {
  assert.equal(plain('a ++b++ ~~c~~ ==d== x^2^ H~2~O[^n1] [e](https://x.test)'), 'a b c d x2 H2O e');
});

test('script-looking text in the new markup is still escaped', () => {
  const html = inline('++<img src=x onerror=alert(1)>++ ==<script>alert(1)</script>==');
  assert.ok(!html.includes('<img') && !html.includes('<script'), html);
});

// ---------------------------------------------------------------- the block list

test('every block type has a schema rule, a renderer, a text-field entry and a place in the picker', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'block.schema.json'), 'utf8'));
  assert.deepEqual([...schema.properties.type.enum].sort(), [...BLOCK_TYPES].sort());
  const ruled = schema.allOf.map((r) => r.if.properties.type.const).sort();
  assert.deepEqual(ruled, [...BLOCK_TYPES].sort());
  assert.deepEqual(Object.values(BLOCK_GROUPS).flat().sort(), [...BLOCK_TYPES].sort(), 'every type is offered exactly once');

  const samples = sampleBlocks();
  assert.deepEqual(samples.map((b) => b.type).filter((t, i, a) => a.indexOf(t) === i).sort(), [...BLOCK_TYPES].sort(), 'a sample exists for every type');
  for (const block of samples) assert.ok(render([block]).length > 0, `${block.type} rendered nothing`);
});

test('the samples are valid against the schema', () => {
  const ws = workspace();
  workspaces.push(ws);
  const sink = withSink(ws);
  const { errors } = validateContent(loadContent(ROOT, ws.contentDir), registry);
  assert.deepEqual(errors, [], sink.id);
});

test('textFields finds every planted text and nothing else counts as text', () => {
  const samples = sampleBlocks();
  const planted = plantedMarkers(samples);
  const found = new Set();
  for (const block of samples) for (const f of textFields(block)) plantedMarkers(f.text, found);
  assert.deepEqual([...planted].sort(), [...found].sort(), 'a text field of some block type is missing from blocks-meta');
  const code = samples.find((b) => b.type === 'code');
  assert.deepEqual(textFields(code).filter((f) => f.role === 'code').map((f) => f.path.join('.')), ['text']);
});

test('countWords counts reading text only: not code, not hidden blocks, not markup', () => {
  const blocks = [
    { id: 'blk_00000001', type: 'paragraph', text: 'one **two** [three](https://x.test) ++four++' },
    { id: 'blk_00000002', type: 'code', text: 'many many many words in code', caption: 'five' },
    { id: 'blk_00000003', type: 'paragraph', text: 'hidden words here', hidden: true },
    { id: 'blk_00000004', type: 'table', rows: [['six', 'seven'], ['eight', 'nine']] },
  ];
  assert.equal(countWords(blocks), 9);
  assert.equal(proseStrings(blocks).includes('many many many words in code'), false);
});

test('mapBlockTexts rewrites text fields, leaves literal code alone unless asked, and does not mutate', () => {
  const block = sampleBlocks().find((b) => b.type === 'code');
  const before = JSON.stringify(block);
  const next = mapBlockTexts(block, (t) => t.toUpperCase());
  assert.equal(JSON.stringify(block), before);
  assert.equal(next.text, block.text);
  assert.equal(next.caption, block.caption.toUpperCase());
  assert.equal(mapBlockTexts(block, (t) => t.toUpperCase(), { includeCode: true }).text, block.text.toUpperCase());
});

test('mediaReferences lists every image a block uses', () => {
  const samples = sampleBlocks();
  const by = (t) => samples.find((b) => b.type === t);
  assert.deepEqual(mediaReferences(by('image')).map((r) => r.mediaId), ['med_9f3k2a01']);
  assert.deepEqual(mediaReferences(by('gallery')).map((r) => r.mediaId), ['med_9f3k2a01', 'med_9f3k2a02', 'med_9f3k2a03']);
  assert.deepEqual(mediaReferences(by('compare')).map((r) => r.mediaId), ['med_9f3k2a01', 'med_9f3k2a02']);
  assert.deepEqual(mediaReferences(by('paragraph')), []);
});

// ---------------------------------------------------------------- rendering

test('paragraph styles and text options become classes and attributes from fixed sets', () => {
  const html = render([
    { id: 'blk_00000001', type: 'paragraph', text: 'a', style: 'intro', dropCap: true, smallCaps: true, align: 'center', dir: 'rtl' },
    { id: 'blk_00000002', type: 'paragraph', text: 'b', style: 'byline' },
    { id: 'blk_00000003', type: 'paragraph', text: 'c' },
  ]);
  assert.match(html, /<p class="intro dropcap smallcaps ta-center" dir="rtl">a<\/p>/);
  assert.match(html, /<p class="byline">b<\/p>/);
  assert.match(html, /<p>c<\/p>/);
});

test('headings run from level 2 to 6 and keep their anchor id', () => {
  const html = render([{ id: 'blk_00000001', type: 'heading', level: 5, text: 'Deep', align: 'end' }]);
  assert.equal(html, '<h5 class="ta-end" id="blk_00000001">Deep</h5>');
});

test('display options add only known classes', () => {
  const html = render([{ id: 'blk_00000001', type: 'callout', text: 'x', display: { spacing: 'relaxed', tone: 'subtle', width: 'wide' } }]);
  assert.match(html, /class="callout callout--note space-relaxed tone-subtle w-wide"/);
  assert.doesNotMatch(render([{ id: 'blk_00000001', type: 'divider', display: { spacing: 'normal', tone: 'none', width: 'normal' } }]), /space-|tone-|w-/);
});

test('checklist shows state to assistive technology, not only by colour', () => {
  const html = render([{ id: 'blk_00000001', type: 'checklist', items: [{ text: 'a', checked: true }, { text: 'b' }] }]);
  assert.match(html, /class="is-done"><div class="checklist__row"><span class="checklist__box" aria-hidden="true"><\/span><span class="visually-hidden">§block_done§: <\/span>/);
  assert.match(html, /class="is-todo">.*§block_todo§/);
});

test('table: header row, column alignment, caption, and no header when turned off', () => {
  const rows = [['H1', 'H2'], ['a', 'b']];
  const html = render([{ id: 'blk_00000001', type: 'table', caption: 'Cap', align: ['start', 'end'], rows }]);
  assert.match(html, /<thead><tr><th scope="col">H1<\/th><th scope="col" class="ta-end">H2<\/th><\/tr><\/thead>/);
  assert.match(html, /<tbody><tr><td>a<\/td><td class="ta-end">b<\/td><\/tr><\/tbody>/);
  assert.match(html, /<caption>Cap<\/caption>/);
  const headless = render([{ id: 'blk_00000001', type: 'table', header: false, rows }]);
  assert.doesNotMatch(headless, /<thead>|<th/);
  assert.match(headless, /<td>H1<\/td>/);
});

test('code is shown literally and cannot inject markup', () => {
  const html = render([{ id: 'blk_00000001', type: 'code', language: 'html', text: '<script>alert(1)</script> **x**' }]);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; **x**'));
  assert.ok(!html.includes('<script'));
  assert.match(html, /<pre dir="ltr" tabindex="0"><code class="language-html">/);
});

test('gallery, comparison and image-with-text use the media views and skip missing images', () => {
  const g = render([{ id: 'blk_00000001', type: 'gallery', columns: 2, items: [{ mediaId: 'med_a' }, { mediaId: 'med_b', caption: 'Cap' }] }]);
  assert.equal((g.match(/<img /g) ?? []).length, 2);
  assert.match(g, /cols-2/);
  const c = render([{ id: 'blk_00000001', type: 'compare', beforeId: 'med_a', afterId: 'med_b' }]);
  assert.match(c, /§block_before§.*§block_after§/s);
  const none = render([{ id: 'blk_00000001', type: 'compare', beforeId: 'med_a', afterId: 'med_b' }], { media: () => null });
  assert.equal(none, '');
  const it = render([{ id: 'blk_00000001', type: 'imagetext', mediaId: 'med_a', side: 'end', text: 'one\n\ntwo' }]);
  assert.match(it, /imagetext--end/);
  assert.equal((it.match(/<p>/g) ?? []).length, 2);
});

test('related items appear only when the site says they are public', () => {
  const html = render([{ id: 'blk_00000001', type: 'related', items: [{ kind: 'article', id: 'art_welcome1' }, { kind: 'article', id: 'art_draft001' }] }]);
  assert.match(html, /Title of art_welcome1/);
  assert.doesNotMatch(html, /art_draft001/);
  assert.equal(render([{ id: 'blk_00000001', type: 'related', items: [{ kind: 'article', id: 'art_draft001' }] }]), '', 'nothing public: nothing rendered');
});

test('author card needs a public profile', () => {
  assert.match(render([{ id: 'blk_00000001', type: 'author' }]), /author-card.*Abdo/s);
  assert.equal(render([{ id: 'blk_00000001', type: 'author' }], { author: () => null }), '');
});

test('footnotes: numbers follow the footnote list, references link both ways', () => {
  const blocks = [
    { id: 'blk_00000001', type: 'paragraph', text: 'Claim[^b] and claim[^a].' },
    { id: 'blk_00000002', type: 'footnotes', items: [{ key: 'a', text: 'Note A' }, { key: 'b', text: 'Note B' }] },
  ];
  const html = render(blocks);
  assert.match(html, /href="#fn-b"[^>]*>2<\/a>.*href="#fn-a"[^>]*>1<\/a>/s);
  assert.match(html, /<li id="fn-a">Note A <a href="#fnref-a"/);
  assert.match(html, /role="doc-endnotes"/);
});

test('references: only safe, absolute URLs become links', () => {
  const html = render([{ id: 'blk_00000001', type: 'references', items: [{ text: 'Good', url: 'https://example.com/a' }, { text: 'Bad', url: 'javascript:alert(1)' }] }]);
  assert.match(html, /<a href="https:\/\/example\.com\/a" rel="noopener" dir="ltr">/);
  assert.ok(!html.includes('javascript:'));
});

test('hidden blocks of every type render nothing', () => {
  const hidden = sampleBlocks().map((b) => ({ ...b, hidden: true }));
  assert.equal(render(hidden), '');
});

test('hostile text in every text field of every block type is escaped', () => {
  const evil = '<img src=x onerror=alert(1)> "quoted" <script>alert(2)</script>';
  const hostile = sampleBlocks().map((b) => mapBlockTexts(b, () => evil, { includeCode: true }));
  const html = render(hostile);
  assert.ok(!/<img src=x/.test(html), 'raw <img> survived');
  assert.ok(!html.includes('<script'), 'raw <script> survived');
  // Walk the real tags (attribute values are quoted, so escaped text inside them is not a tag) and
  // check that no element carries an event-handler attribute.
  const tag = /<([a-z][a-z0-9-]*)((?:\s+[a-z:-]+(?:="[^"]*")?)*)\s*\/?>/gi;
  const names = new Set();
  for (const m of html.matchAll(tag)) { names.add(m[1].toLowerCase()); for (const a of m[2].matchAll(/\s+([a-z:-]+)(?:="[^"]*")?/gi)) assert.ok(!/^on/i.test(a[1]), `event handler ${a[1]} on <${m[1]}>`); }
  assert.ok(!names.has('script') && !names.has('img') || html.includes('<img src="/m/'), 'only renderer-made images exist');
  assert.ok(!html.includes('aria-label="&amp;'), 'attribute text is escaped once, not twice');
});

// ---------------------------------------------------------------- validation

function withSink(ws, mutate) {
  const source = ws.read('articles/art_welcome1.json');
  const article = structuredClone(source);
  article.id = 'art_sink0001';
  article.translations.en.slug = 'block-sink';
  article.translations.en.title = 'Block sink';
  article.translations.ar.slug = 'مغسلة-الكتل';
  article.translations.ar.title = 'مغسلة الكتل';
  article.translations.en.body = sampleBlocks();
  article.translations.ar.body = sampleBlocks().map((b, i) => ({ ...b, id: `blk_a${String(i + 1).padStart(7, '0')}` }));
  mutate?.(article);
  ws.write('articles/art_sink0001.json', article);
  return article;
}
const problems = (ws) => validateContent(loadContent(ROOT, ws.contentDir), registry);
const messages = (list) => list.map((p) => `${p.path}: ${p.message}`).join('\n');
const fresh = () => { const ws = workspace(); workspaces.push(ws); return ws; };

test('validation: table rows must have the same number of cells', () => {
  const ws = fresh();
  withSink(ws, (a) => { a.translations.en.body.find((b) => b.type === 'table').rows[1] = ['only one']; });
  assert.match(messages(problems(ws).errors), /rows\[1\]: row 2 has 1 cell\(s\) but the first row has 2/);
});

test('validation: footnote references need a footnote, and unused footnotes are warned about', () => {
  const ws = fresh();
  withSink(ws, (a) => {
    a.translations.en.body[0].text = 'Points at [^missing] note';
  });
  const result = problems(ws);
  assert.match(messages(result.errors), /footnote reference \[\^missing\] has no matching footnote/);
  assert.match(messages(result.warnings), /footnote "n1" is never referenced/);
});

test('validation: duplicate footnote keys and a second footnotes block are errors', () => {
  const ws = fresh();
  withSink(ws, (a) => {
    const notes = a.translations.en.body.find((b) => b.type === 'footnotes');
    notes.items.push({ key: 'n1', text: 'again' });
    a.translations.en.body.push({ id: 'blk_zzzzzzz1', type: 'footnotes', items: [{ key: 'x', text: 'x' }] });
  });
  const text = messages(problems(ws).errors);
  assert.match(text, /duplicate footnote key "n1"/);
  assert.match(text, /only one footnotes block is allowed/);
});

test('validation: every image-bearing block checks its media and alt text', () => {
  const ws = fresh();
  withSink(ws, (a) => {
    const body = a.translations.en.body;
    body.find((b) => b.type === 'gallery').items[1].mediaId = 'med_nothere1';
    body.find((b) => b.type === 'compare').afterId = 'med_nothere2';
    body.find((b) => b.type === 'imagetext').mediaId = 'med_nothere3';
  });
  const text = messages(problems(ws).errors);
  assert.match(text, /items\[1\]\.mediaId: unknown media asset "med_nothere1"/);
  assert.match(text, /afterId: unknown media asset "med_nothere2"/);
  assert.match(text, /mediaId: unknown media asset "med_nothere3"/);
});

test('validation: related items must exist', () => {
  const ws = fresh();
  withSink(ws, (a) => { a.translations.en.body.find((b) => b.type === 'related').items[0].id = 'art_nothere1'; });
  assert.match(messages(problems(ws).errors), /unknown article "art_nothere1"/);
});

test('schema: unknown block properties and out-of-range values are rejected with a location', () => {
  const ws = fresh();
  withSink(ws, (a) => {
    const body = a.translations.en.body;
    body.find((b) => b.type === 'heading').level = 7;
    body.find((b) => b.type === 'stats').items[0].value = 'x'.repeat(30);
    body.find((b) => b.type === 'code').language = 'not a language';
    body.find((b) => b.type === 'gallery').items.pop(); body.find((b) => b.type === 'gallery').items.pop();
    body.find((b) => b.type === 'references').items[0].url = 'javascript:alert(1)';
  });
  const text = messages(problems(ws).errors);
  assert.match(text, /level/);
  assert.match(text, /value/);
  assert.match(text, /language/);
  assert.match(text, /items: .*at least 2/);
  assert.match(text, /url/);
});

// ---------------------------------------------------------------- full build

test('a build with an article using every block type succeeds, publishes its media and escapes everything', () => {
  const ws = fresh();
  withSink(ws);
  const result = ws.build({ siteUrl: 'https://example.github.io/abdo', admin: false });
  assert.ok(result.ok, JSON.stringify(result.errors));
  const html = ws.html('en', 'blog', 'block-sink');
  for (const marker of ['class="intro dropcap ta-center"', '<u>underline</u>', '<s>gone</s>', '<mark>marked</mark>', 'x<sup>2</sup>', 'H<sub>2</sub>O',
    'class="figure figure--wide', 'frame-thin', 'radius-lg', 'aspect-16-9', 'class="checklist"', 'class="definitions"', 'class="code-block"', 'class="table-block"',
    'gallery-block cols-3 aspect-4-3', 'class="compare', 'imagetext imagetext--end', 'class="factbox"', 'class="timeline"', 'class="stats"',
    'class="related-block"', 'class="author-card"', 'class="footnotes"', 'class="references"', 'href="#fn-n1"']) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
  assert.match(html, /related-card[^>]*href="\/abdo\/en\/blog\/welcome-to-abdo\/"/);
  assert.match(html, /related-card[^>]*href="\/abdo\/en\/portfolio\/personal-reading-archive\/"/);
  assert.ok(html.includes('&lt;b&gt;literal&lt;/b&gt;'), 'code is escaped');
  for (const file of ['sample-cover-1.svg', 'sample-cover-2.svg', 'sample-cover-3.svg', 'sample-cover-4.svg']) {
    assert.ok(allText(join(ws.outDir, 'media'), ['.svg']).length > 0 && html.includes(file), `${file} is used on the page`);
  }
  assert.ok(ws.html('ar', 'مدونة', 'مغسلة-الكتل').includes('dir="rtl"'));
});

test('related and author blocks never reveal a draft or an unpublished profile', () => {
  const ws = fresh();
  ws.edit('articles/art_built001.json', (a) => { a.status = 'draft'; a.translations.en.status = 'draft'; delete a.publishedAt; });
  withSink(ws, (a) => { a.translations.en.body.find((b) => b.type === 'related').items.push({ kind: 'article', id: 'art_built001' }); });
  const result = ws.build({ siteUrl: 'https://example.github.io/abdo', admin: false });
  assert.ok(result.ok, JSON.stringify(result.errors));
  const html = ws.html('en', 'blog', 'block-sink');
  assert.ok(!html.includes('how-this-site-is-built'));
  assert.ok(!allText(ws.outDir, ['.html']).includes('how-this-site-is-built'), 'the draft appears nowhere in the output');
});

// ---------------------------------------------------------------- nested lists

test('nested lists: depth is read from leading spaces, two per level, and clamped to four levels', () => {
  assert.deepEqual(['a', '  a', '    a', '      a', '        a', '\ta', '\t\ta'].map(listLevel), [0, 1, 2, 3, 3, 1, 2]);
  assert.equal(listText('    deep'), 'deep');
  assert.equal(withLevel('  x', 2), '    x');
  assert.equal(withLevel('x', 9), '      x');
  assert.deepEqual(clampLevels([2, 3, 0, 3, 1]), [0, 1, 0, 1, 1]);
  assert.deepEqual(clampLevels([]), []);
});

test('nested lists: the tree keeps order and groups children under the item above', () => {
  const tree = buildTree([{ level: 0, n: 'a' }, { level: 1, n: 'b' }, { level: 2, n: 'c' }, { level: 1, n: 'd' }, { level: 0, n: 'e' }]);
  assert.deepEqual(tree.map((x) => x.entry.n), ['a', 'e']);
  assert.deepEqual(tree[0].children.map((x) => x.entry.n), ['b', 'd']);
  assert.deepEqual(tree[0].children[0].children.map((x) => x.entry.n), ['c']);
  // an item that jumps too deep is drawn one level below the item above, never as an orphan
  const jump = buildTree([{ level: 0, n: 'a' }, { level: 3, n: 'b' }]);
  assert.equal(jump[0].children[0].entry.n, 'b');
});

test('nested lists: a list block renders real nested ul/ol elements, escaped', () => {
  const html = render([{ id: 'blk_00000001', type: 'list', items: ['one', '  <b>two</b>', '    three', 'four'] }]);
  assert.equal(html, '<ul><li>one<ul><li>&lt;b&gt;two&lt;/b&gt;<ul><li>three</li></ul></li></ul></li><li>four</li></ul>');
  const ordered = render([{ id: 'blk_00000001', type: 'list', ordered: true, dir: 'rtl', items: ['a', '  b'] }]);
  assert.equal(ordered, '<ol dir="rtl"><li>a<ol><li>b</li></ol></li></ol>');
});

test('nested lists: a checklist nests its items by level and keeps the state labels', () => {
  const html = render([{ id: 'blk_00000001', type: 'checklist', items: [{ text: 'parent' }, { text: 'child', checked: true, level: 1 }, { text: 'next' }] }]);
  assert.match(html, /<li class="is-todo"><div class="checklist__row">.*parent.*<\/div><ul><li class="is-done"><div class="checklist__row">.*child.*<\/div><\/li><\/ul><\/li><li class="is-todo">/);
});

test('nested lists: shiftLines indents and outdents the touched lines and keeps the text consistent', () => {
  const text = 'a\nb\nc';
  // indent the second line
  let r = shiftLines(text, 2, 2, 1);
  assert.equal(r.text, 'a\n  b\nc');
  // the first line cannot be indented, there is nothing above it
  assert.equal(shiftLines(text, 0, 0, 1).text, text);
  // indenting line 3 straight after line 2 is allowed only one level deeper than line 2
  r = shiftLines(r.text, 6, 6, 1);
  assert.equal(r.text, 'a\n  b\n  c');
  r = shiftLines(r.text, r.start, r.start, 1);
  assert.equal(r.text, 'a\n  b\n    c');
  // outdenting a parent pulls its children up so the structure stays valid
  r = shiftLines('a\n  b\n    c', 2, 2, -1);
  assert.equal(r.text, 'a\nb\n  c');
  // a selection across several lines moves all of them
  r = shiftLines('a\nb\nc\nd', 2, 5, 1);
  assert.equal(r.text, 'a\n  b\n  c\nd');
  // the selection stays on the same text, following it past the added indentation
  assert.equal(r.text.slice(r.start, r.end), 'b\n  c');
});

test('nested lists: problems are named for the item that causes them', () => {
  assert.deepEqual(listProblems(['a', '  b', 'c']), []);
  assert.match(listProblems(['  a'])[0].message, /first item/);
  assert.match(listProblems(['a', '    c'])[0].message, /one level deeper/);
  assert.match(listProblems(['a', '   '])[0].message, /empty/);
  assert.deepEqual(checklistProblems([{ text: 'a' }, { text: 'b', level: 1 }]), []);
  assert.match(checklistProblems([{ text: 'a', level: 1 }])[0].message, /first item/);
  assert.match(checklistProblems([{ text: 'a' }, { text: 'b', level: 2 }])[0].message, /one level deeper/);
});

test('nested lists: validation reports bad depth with the item path, and the schema limits checklist levels', () => {
  const ws = fresh();
  withSink(ws, (a) => {
    const body = a.translations.en.body;
    body.find((b) => b.type === 'list').items = ['one', '      jumped'];
    body.find((b) => b.type === 'checklist').items = [{ text: 'a' }, { text: 'b', level: 3 }];
  });
  const text = messages(problems(ws).errors);
  assert.match(text, /items\[1\]: list: an item can be at most one level deeper/);
  assert.match(text, /items\[1\]\.level: checklist: an item can be at most one level deeper/);
  const ws2 = fresh();
  withSink(ws2, (a) => { a.translations.en.body.find((b) => b.type === 'checklist').items[0].level = 4; });
  assert.match(messages(problems(ws2).errors), /level/);
});

// ---------------------------------------------------------------- focal point

test('focal point: classes are rounded to the step, the centre needs none, nonsense is ignored', () => {
  assert.equal(FOCAL_STEP, 5);
  assert.equal(focalClass({ x: 30, y: 70 }), 'fx-30 fy-70');
  assert.equal(focalClass({ x: 32, y: 68 }), 'fx-30 fy-70');
  assert.equal(focalClass({ x: 0, y: 100 }), 'fx-0 fy-100');
  assert.equal(focalClass({ x: 51, y: 49 }), '', 'rounds to the centre');
  assert.equal(focalClass(null), '');
  assert.equal(focalClass({ x: 'a', y: 3 }), '');
  assert.equal(focalClass({ x: 500, y: -4 }), 'fx-100 fy-0', 'out of range values are clamped');
  assert.deepEqual(normalizeFocal(30.4, '70'), { x: 30, y: 70 });
  assert.equal(normalizeFocal(50, 50), null);
  assert.equal(normalizeFocal('x', 1), null);
});

test('focal point: every image block draws it with classes (never an inline style), on the image itself', () => {
  const withFocal = { ...ctx, media: (id) => ({ ...media(id), focal: { x: 20, y: 80 } }) };
  const blocks = [
    { id: 'blk_00000001', type: 'image', mediaId: 'med_a' },
    { id: 'blk_00000002', type: 'gallery', columns: 2, items: [{ mediaId: 'med_a' }, { mediaId: 'med_b' }] },
    { id: 'blk_00000003', type: 'compare', before: 'med_a', after: 'med_b' },
    { id: 'blk_00000004', type: 'imagetext', mediaId: 'med_a', text: 'x' },
  ];
  const html = renderBlocks(blocks, withFocal);
  assert.ok(!/style=/.test(html), 'no inline style attributes');
  assert.ok((html.match(/<img class="fx-20 fy-80" /g) ?? []).length >= 5, 'every image carries the focal classes');
  assert.ok(!render(blocks).includes('fx-'), 'an image without a focal point carries no classes');
});

test('focal point: the stylesheet defines every class the renderer can produce', () => {
  const css = readFileSync(join(ROOT, 'public/assets/base.css'), 'utf8');
  for (const { axis, n } of focalClassNames()) assert.match(css, new RegExp(`\\.f${axis}-${n} \\{ --f${axis}: ${n}%; \\}`), `f${axis}-${n}`);
  assert.match(css, /object-position: var\(--fx, 50%\) var\(--fy, 50%\)/);
});

test('focal point: the media schema accepts whole percentages and rejects the rest; the build uses it on covers and in the page', () => {
  const ws = fresh();
  const file = 'media/media.json';
  const media = ws.read(file);
  const cover = media.items.find((m) => m.type === 'image');
  cover.focal = { x: 25, y: 75 };
  ws.write(file, media);
  const ok = ws.build({ siteUrl: 'https://example.github.io/abdo', admin: false });
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  assert.match(allText(ws.outDir), /<img class="fx-25 fy-75" /);
  for (const bad of [{ x: 101, y: 0 }, { x: -1, y: 5 }, { x: 1.5, y: 5 }, { x: 5 }, { x: 5, y: 5, z: 1 }, 'center']) {
    cover.focal = bad;
    ws.write(file, media);
    assert.ok(problems(ws).errors.some((p) => /focal/.test(p.path)), `rejected: ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------- per-page typography

test('typography override: values are rounded to the steps the stylesheet has, inside the allowed range', () => {
  assert.equal(overrideStep('fontScale', 112), 110);
  assert.equal(overrideStep('fontScale', 40), 85, 'below the range is raised to it');
  assert.equal(overrideStep('fontScale', 400), 130);
  assert.equal(overrideStep('lineHeight', 1.84), 18);
  assert.equal(overrideStep('lineHeight', 5), 22);
  assert.equal(overrideStep('measure', 41), 42);
  assert.equal(overrideStep('headingWeight', 600), 600);
  assert.equal(overrideStep('headingWeight', 650), null, 'only the listed weights');
  assert.equal(overrideStep('fontScale', 'big'), null);
  assert.equal(overrideStep('colour', 1), null);
  assert.equal(OVERRIDE_LIMITS.measure.unit, 'rem');
});

test('typography override: the class list leaves out what is unset or default and never invents values', () => {
  assert.equal(overrideClasses(null), '');
  assert.equal(overrideClasses({}), '');
  assert.equal(overrideClasses({ fontScale: 100 }), '', '100% is the default');
  assert.equal(overrideClasses({ fontScale: 110, lineHeight: 1.8, measure: 40, headingWeight: 700 }), ' ov-size-110 ov-lh-18 ov-measure-40 ov-weight-700');
  assert.equal(overrideClasses({ lineHeight: 'x', colour: 'red' }), '');
  assert.ok(!/style|javascript|[<>"]/.test(overrideClasses({ fontScale: '110"><script>' })), 'a hostile value cannot reach the markup');
});

test('typography override: the stylesheet defines every class that can be produced', () => {
  const css = readFileSync(join(ROOT, 'public/assets/base.css'), 'utf8');
  const names = overrideClassNames();
  assert.ok(names.length > 40);
  for (const { cls } of names) assert.ok(css.includes(`.${cls} {`), cls);
  assert.match(css, /\.article, \.project \{ font-size: calc\(var\(--fs-base\) \* var\(--ov-size, 1\)\)/);
});

test('typography override: advice for the language it is read in', () => {
  const ar = { direction: 'rtl', typography: { lineHeight: 1.9, baseSize: '1.125rem' } };
  assert.deepEqual(overrideIssues(null, ar), []);
  assert.deepEqual(overrideIssues({ lineHeight: 1.5 }, ar).map((i) => i.code), ['rtl_line_height']);
  assert.deepEqual(overrideIssues({ fontScale: 85 }, ar).map((i) => i.code), ['small_text'], '85% of 18px is 15.3px, under the 16px advice');
  assert.deepEqual(overrideIssues({ fontScale: 100 }, ar), []);
});

test('typography override: pages carry the classes (articles and projects), no inline style, and the schema limits the ranges', () => {
  const ws = fresh();
  const article = 'articles/art_welcome1.json';
  const project = `projects/${readdirSync(join(ROOT, 'content/projects'))[0]}`;
  const a = ws.read(article); a.typography = { fontScale: 115, lineHeight: 1.8, measure: 44, headingWeight: 600 }; ws.write(article, a);
  const p = ws.read(project); p.typography = { lineHeight: 2 }; ws.write(project, p);
  const ok = ws.build({ siteUrl: 'https://example.github.io/abdo', admin: false });
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  const text = allText(ws.outDir);
  assert.match(text, /<article class="article article--[a-z-]+ ov-size-115 ov-lh-18 ov-measure-44 ov-weight-600">/);
  assert.match(text, /<article class="project ov-lh-20">/);
  assert.ok(!/<article class="[^"]*ov-[^"]*" style=/.test(text));
  for (const bad of [{ fontScale: 200 }, { fontScale: 84 }, { fontScale: 100.5 }, { lineHeight: 3 }, { lineHeight: 1 }, { measure: 20 }, { measure: 80 }, { headingWeight: 650 }, { colour: 'red' }, {}, 'big']) {
    a.typography = bad; ws.write(article, a);
    assert.ok(problems(ws).errors.some((e) => /typography/.test(e.path)), `rejected: ${JSON.stringify(bad)}`);
  }
});
