import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderBlocks } from '../src/lib/blocks.mjs';
import { inline, isSafeUrl, paragraphs, plain } from '../src/lib/markup.mjs';
import { safeJsonForScript } from '../src/lib/util.mjs';

test('inline markup: bold, italic, code and links', () => {
  assert.equal(inline('a **b** *c* `d`'), 'a <strong>b</strong> <em>c</em> <code dir="ltr">d</code>');
  assert.equal(inline('[site](https://example.com)'), '<a href="https://example.com" rel="noopener">site</a>');
  assert.equal(inline('[home](/en/)'), '<a href="/en/">home</a>');
});

test('HTML in text is escaped, never interpreted', () => {
  assert.equal(inline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(inline('"quoted" & <b>'), '&quot;quoted&quot; &amp; &lt;b&gt;');
});

test('code spans protect their content from emphasis parsing', () => {
  assert.equal(inline('`**not bold**`'), '<code dir="ltr">**not bold**</code>');
});

test('dangerous link schemes are removed, the label stays', () => {
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.test']) {
    const html = inline(`[label](${url})`);
    assert.ok(!html.includes('<a'), `link kept for ${url}: ${html}`);
    assert.ok(html.includes('label'));
  }
  assert.ok(isSafeUrl('mailto:a@b.co') && isSafeUrl('tel:+20100') && isSafeUrl('#x') && isSafeUrl('/p/'));
});

test('quotes in a URL cannot break out of the href attribute', () => {
  const html = inline('[x](https://e.test/"onmouseover="alert(1))');
  assert.ok(!/onmouseover="alert/.test(html), html);
});

test('plain() strips markup for descriptions and word counts', () => {
  assert.equal(plain('a **b** [c](https://x.test) `d`'), 'a b c d');
});

test('paragraphs() splits on blank lines', () => {
  assert.deepEqual(paragraphs('one\n\ntwo\n  \nthree'), ['one', 'two', 'three']);
});

test('safeJsonForScript cannot close a script element', () => {
  const out = safeJsonForScript({ t: '</script><script>alert(1)</script>', amp: 'a&b' });
  assert.ok(!out.includes('</script'));
  assert.ok(!out.includes('<'));
  assert.deepEqual(JSON.parse(out), { t: '</script><script>alert(1)</script>', amp: 'a&b' });
});

test('blocks: hidden blocks are skipped and every type renders', () => {
  const media = () => ({ url: '/m/x.png', alt: 'alt text', width: 10, height: 10, caption: '', credit: '' });
  const ctx = { lang: 'en', media };
  const html = renderBlocks([
    { id: 'blk_00000001', type: 'paragraph', text: 'visible' },
    { id: 'blk_00000002', type: 'paragraph', text: 'secret', hidden: true },
    { id: 'blk_00000003', type: 'heading', level: 2, text: 'H' },
    { id: 'blk_00000004', type: 'quote', text: 'q', cite: 'who' },
    { id: 'blk_00000005', type: 'list', ordered: true, items: ['a', 'b'] },
    { id: 'blk_00000006', type: 'image', mediaId: 'med_00000001', caption: 'cap' },
    { id: 'blk_00000007', type: 'callout', title: 't', text: 'x' },
    { id: 'blk_00000008', type: 'divider' },
  ], ctx);
  assert.ok(html.includes('visible') && !html.includes('secret'));
  for (const fragment of ['<h2 id="blk_00000003">', '<blockquote class="quote">', '<ol><li>a</li>', '<img src="/m/x.png" alt="alt text"', '<figcaption>cap', 'role="note"', '<hr class="divider">']) {
    assert.ok(html.includes(fragment), `missing ${fragment}`);
  }
});

test('blocks: an unknown block type is an error, not silent output', () => {
  assert.throws(() => renderBlocks([{ id: 'blk_00000001', type: 'carousel' }], { lang: 'en', media: () => null }), /No renderer/);
});
