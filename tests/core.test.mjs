import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ID_PREFIX, collectIds, newId } from '../src/core/ids.mjs';
import { MAX_UPLOAD_BYTES, UploadError, inspectImage, safeMediaName } from '../src/core/image-info.mjs';
import { isValidSlug, slugify, uniqueSlug } from '../src/core/slugify.mjs';
import { createRegistry } from '../src/lib/validate.mjs';
import { ROOT } from './helpers.mjs';

// ---------------------------------------------------------------- IDs

test('generated IDs match the schema patterns for every entity kind', () => {
  const registry = createRegistry(ROOT);
  const common = JSON.parse(JSON.stringify(registry.byId.get('https://abdo.invalid/schemas/common.schema.json')));
  for (const [kind, prefix] of Object.entries(ID_PREFIX)) {
    const id = newId(kind);
    assert.match(id, new RegExp(`^${prefix}_[0-9a-z]{8}$`), kind);
    const def = common.$defs[`id_${kind}`];
    if (def) assert.match(id, new RegExp(def.pattern), `${kind} id matches schema`);
  }
});

test('a generated ID that is already taken is skipped', () => {
  // The source yields 0-bytes (-> "art_00000000") first, then 1-bytes (-> "art_11111111").
  const sequence = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1];
  let at = 0;
  const source = (count) => Uint8Array.from({ length: count }, () => { const v = sequence[at % sequence.length]; at += 1; return v; });
  assert.equal(newId('article', new Set(['art_00000000']), source), 'art_11111111');
});

test('random IDs are well spread and never repeat across a large batch', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i += 1) seen.add(newId('block', seen));
  assert.equal(seen.size, 5000);
});

test('collectIds finds IDs anywhere in nested content', () => {
  const found = collectIds({ a: 'art_abcdefgh', b: [{ c: 'med_12345678' }], d: 'not_an_id', e: 'tag_short' });
  assert.deepEqual([...found].sort(), ['art_abcdefgh', 'med_12345678']);
});

// ---------------------------------------------------------------- slugs

test('slugify keeps Arabic letters, removes diacritics and punctuation', () => {
  assert.equal(slugify('مرحبا بكم في عَبْدُه!'), 'مرحبا-بكم-في-عبده');
  assert.equal(slugify('الـــكتابة'), 'الكتابة');
  assert.equal(slugify('Hello, World — 2026'), 'hello-world-2026');
});

test('slugify always returns something the schema accepts', () => {
  for (const input of ['!!!', '', '   ', '---', 'a'.repeat(500), '٣٢١ أرقام', 'Ünïcödé Tèxt', '<script>alert(1)</script>', '../../etc/passwd']) {
    const slug = slugify(input);
    assert.ok(isValidSlug(slug), `"${input.slice(0, 20)}" -> "${slug.slice(0, 20)}"`);
    assert.ok(slug.length <= 80);
  }
});

test('uniqueSlug appends a counter until free', () => {
  assert.equal(uniqueSlug('post', ['other']), 'post');
  assert.equal(uniqueSlug('post', ['post', 'post-2']), 'post-3');
});

// ---------------------------------------------------------------- uploads

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
const PNG_1X1 = b64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
const GIF_1X1 = b64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
const JPEG_1X1 = b64('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');
const WEBP_1X1 = b64('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==');

test('real PNG, GIF, JPEG and WebP files are recognised from their bytes, with their size', () => {
  assert.deepEqual(inspectImage(PNG_1X1), { mimeType: 'image/png', ext: 'png', width: 1, height: 1, size: PNG_1X1.length });
  assert.deepEqual(inspectImage(GIF_1X1), { mimeType: 'image/gif', ext: 'gif', width: 1, height: 1, size: GIF_1X1.length });
  assert.deepEqual(inspectImage(JPEG_1X1), { mimeType: 'image/jpeg', ext: 'jpg', width: 1, height: 1, size: JPEG_1X1.length });
  assert.deepEqual(inspectImage(WEBP_1X1), { mimeType: 'image/webp', ext: 'webp', width: 1, height: 1, size: WEBP_1X1.length });
});

test('dimensions are read correctly for non-trivial sizes', () => {
  const png = Uint8Array.from(PNG_1X1);
  new DataView(png.buffer).setUint32(16, 1600); new DataView(png.buffer).setUint32(20, 900);
  assert.equal(inspectImage(png).width, 1600);
  assert.equal(inspectImage(png).height, 900);
});

function rejects(bytes, code) {
  assert.throws(() => inspectImage(bytes), (e) => e instanceof UploadError && e.code === code, `expected ${code}`);
}

test('SVG, scripts, HTML and executables are refused whatever they are named', () => {
  rejects(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'svg');
  rejects(new TextEncoder().encode('<?xml version="1.0"?><svg onload="x()"/>'), 'svg');
  rejects(new TextEncoder().encode('<html><script>alert(1)</script></html>'), 'unsupported');
  rejects(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]), 'unsupported');
  rejects(new TextEncoder().encode('GIF89a'), 'corrupt'); // GIF magic only
});

test('empty, oversized, truncated and absurdly large images are refused', () => {
  rejects(new Uint8Array(0), 'empty');
  rejects(new Uint8Array(MAX_UPLOAD_BYTES + 1), 'too-large');
  rejects(PNG_1X1.slice(0, 20), 'corrupt');
  const huge = Uint8Array.from(PNG_1X1);
  new DataView(huge.buffer).setUint32(16, 20000);
  rejects(huge, 'dimensions');
});

test('the stored extension comes from the detected type, never from the uploaded file name', () => {
  const info = inspectImage(PNG_1X1);
  assert.equal(safeMediaName('evil.html', info.ext), 'evil.png');
  assert.equal(safeMediaName('photo.svg', info.ext), 'photo.png');
});

test('media file names are reduced to lowercase ASCII and cannot escape the folder', () => {
  assert.equal(safeMediaName('../../My Photo (1).JPG', 'jpg'), 'my-photo-1.jpg');
  assert.equal(safeMediaName('صورة.png', 'png'), 'image.png');
  assert.equal(safeMediaName('a.png', 'png', new Set(['a.png']), () => 'zzz'), 'a-zzz.png');
  assert.match(safeMediaName('x'.repeat(200), 'png'), /^x{40}\.png$/);
});
