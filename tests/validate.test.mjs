import assert from 'node:assert/strict';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { ROOT, workspace } from './helpers.mjs';

const registry = createRegistry(ROOT);
const workspaces = [];
after(() => workspaces.forEach((w) => w.cleanup()));

function setup() {
  const ws = workspace();
  workspaces.push(ws);
  return ws;
}

const run = (ws) => validateContent(loadContent(ROOT, ws.contentDir), registry);
const errorText = (ws) => run(ws).errors.map((e) => `${e.file} › ${e.path}: ${e.message}`).join('\n');

test('the bundled content is valid with no warnings', () => {
  const ws = setup();
  const { errors, warnings } = run(ws);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('a mistyped status is reported with a suggestion and the exact location', () => {
  const ws = setup();
  ws.edit('articles/art_built001.json', (a) => { a.status = 'publised'; });
  assert.match(errorText(ws), /art_built001\.json › status: must be one of: .*did you mean "published"/);
});

test('a published article must have a publishedAt date', () => {
  const ws = setup();
  ws.edit('articles/art_built001.json', (a) => { delete a.publishedAt; });
  assert.match(errorText(ws), /missing required property "publishedAt"/);
});

test('unknown topic, tag, media, author and related-article references are rejected', () => {
  const ws = setup();
  ws.edit('articles/art_built001.json', (a) => { a.topicIds = ['top_nope0001']; a.tagIds = ['tag_nope0001']; a.coverMediaId = 'med_nope0001'; a.authorId = 'aut_nope0001'; });
  ws.edit('projects/prj_archive1.json', (p) => { p.relatedArticleIds = ['art_nope0001']; });
  const text = errorText(ws);
  for (const needle of ['unknown topic "top_nope0001"', 'unknown tag "tag_nope0001"', 'unknown media asset "med_nope0001"', 'unknown author "aut_nope0001"', 'unknown article "art_nope0001"']) {
    assert.ok(text.includes(needle), `expected: ${needle}\n${text}`);
  }
});

test('two articles cannot share a slug in one language', () => {
  const ws = setup();
  ws.edit('articles/art_built001.json', (a) => { a.translations.en.slug = 'welcome-to-abdo'; });
  // Files load in name order, so the later one (art_welcome1) is reported as the duplicate.
  assert.match(errorText(ws), /art_welcome1\.json › translations\.en\.slug: article slug "welcome-to-abdo" is already used by art_built001 in language "en"/);
});

test('a file must be named after the ID it contains', () => {
  const ws = setup();
  renameSync(join(ws.contentDir, 'articles', 'art_built001.json'), join(ws.contentDir, 'articles', 'renamed.json'));
  assert.match(errorText(ws), /the file must be named art_built001\.json/);
});

test('duplicate IDs across collections are rejected', () => {
  const ws = setup();
  ws.edit('taxonomy/topics.json', (t) => { t.items[1].id = t.items[0].id; });
  assert.match(errorText(ws), /duplicate ID "top_ideas001"/);
});

test('images need alt text in every language they appear in', () => {
  const ws = setup();
  ws.edit('media/media.json', (m) => { delete m.items.find((i) => i.id === 'med_9f3k2a02').alt.ar; });
  assert.match(errorText(ws), /image needs alt text in "ar"/);
});

test('a missing media file is reported', () => {
  const ws = setup();
  rmSync(join(ws.contentDir, 'media', 'files', 'sample-cover-1.svg'));
  assert.match(errorText(ws), /file not found: content\/media\/files\/sample-cover-1\.svg/);
});

test('interface strings must exist in every language', () => {
  const ws = setup();
  ws.edit('i18n/ar.json', (f) => { delete f.strings.read_more; });
  assert.match(errorText(ws), /ar\.json › strings\.read_more: missing interface string/);
});

test('plural families need an "_other" form in every language', () => {
  const ws = setup();
  ws.edit('i18n/en.json', (f) => { delete f.strings.articles_count_other; });
  assert.match(errorText(ws), /en\.json › strings\.articles_count_other/);
});

test('every enabled language needs the owner profile', () => {
  const ws = setup();
  ws.edit('profile/author.json', (p) => { delete p.translations.en; });
  assert.match(errorText(ws), /missing "en" translation/);
});

test('exactly one enabled language must be the default', () => {
  const ws = setup();
  ws.edit('config/languages.json', (l) => { l.items[1].default = true; });
  assert.match(errorText(ws), /exactly one enabled language must be the default \(found 2\)/);
});

test('an unknown design preset lists the available ones', () => {
  const ws = setup();
  ws.edit('config/design.json', (d) => { d.preset = 'editorial-magazin'; });
  assert.match(errorText(ws), /unknown preset "editorial-magazin" \(available: editorial-magazine/);
});

test('values written into generated CSS cannot contain CSS-breaking characters', () => {
  const ws = setup();
  ws.edit('config/languages.json', (l) => { l.items[0].typography.fonts.heading = 'x;} body{display:none'; });
  assert.match(errorText(ws), /not allowed in a CSS value/);
  const ws2 = setup();
  ws2.edit('config/presets.json', (p) => { p.items[2].tokens.shared.backdropLight = 'url(https://evil.test/x.png)'; });
  assert.match(errorText(ws2), /backdropLight contains characters that are not allowed/);
});

test('topic hierarchies cannot contain cycles', () => {
  const ws = setup();
  ws.edit('taxonomy/topics.json', (t) => { t.items.find((x) => x.id === 'top_ideas001').parentId = 'top_writ0001'; });
  assert.match(errorText(ws), /topic hierarchy contains a cycle/);
});

test('translations in an undefined language are rejected', () => {
  const ws = setup();
  ws.edit('taxonomy/topics.json', (t) => { t.items[0].translations.fr = { name: 'Idées', slug: 'idees', description: 'x' }; });
  assert.match(errorText(ws), /unknown language "fr"/);
});

test('block IDs must be unique within a body', () => {
  const ws = setup();
  ws.edit('articles/art_built001.json', (a) => { a.translations.en.body[1].id = a.translations.en.body[0].id; });
  assert.match(errorText(ws), /duplicate block ID/);
});

test('unknown block types and unknown block fields are rejected', () => {
  const ws = setup();
  ws.edit('articles/art_built001.json', (a) => { a.translations.en.body.push({ id: 'blk_zz000001', type: 'carousel' }); });
  assert.match(errorText(ws), /type: must be one of/);
  const ws2 = setup();
  ws2.edit('articles/art_built001.json', (a) => { a.translations.en.body[0].colour = 'red'; });
  assert.match(errorText(ws2), /unknown property "colour"/);
});

test('a published article with no published translation produces a warning, not an error', () => {
  const ws = setup();
  ws.edit('articles/art_worklog1.json', (a) => { a.translations.en.status = 'draft'; });
  const { errors, warnings } = run(ws);
  assert.deepEqual(errors, []);
  assert.match(warnings.map((w) => w.message).join('\n'), /no translation is published/);
});

test('a draft translation may have an empty body, a published one may not', () => {
  const ws = setup();
  ws.edit('articles/art_worklog1.json', (a) => { a.translations.en.status = 'draft'; a.translations.en.body = []; });
  assert.deepEqual(run(ws).errors, []);
  const ws2 = setup();
  ws2.edit('articles/art_worklog1.json', (a) => { a.translations.en.body = []; });
  assert.match(errorText(ws2), /art_worklog1\.json › translations\.en\.body/);
});

test('malformed JSON names the file', () => {
  const ws = setup();
  writeFileSync(join(ws.contentDir, 'articles', 'art_built001.json'), '{ nope');
  assert.throws(() => loadContent(ROOT, ws.contentDir), /Invalid JSON in .*art_built001\.json/);
});
