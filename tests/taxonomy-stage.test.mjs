// Staging taxonomy results into a workspace, creating records that satisfy the schema, and the link-scheme rule.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { PreviewError, renderPreview } from '../src/core/preview.mjs';
import {
  addTranslation, applyResult, createTag, createTopic, deleteTags, freeSlug, mergeTags, usage,
} from '../src/core/taxonomy-ops.mjs';
import { MAX_SYNONYM_GROUPS, parseGroups } from '../src/core/search-settings.mjs';
import { stageResult } from '../src/core/taxonomy-stage.mjs';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { ROOT, workspace } from './helpers.mjs';

const NOW = new Date('2026-11-13T10:00:00Z');
const registry = createRegistry(ROOT);
const workspaces = [];
after(() => workspaces.forEach((w) => w.cleanup()));
const setup = () => { const ws = workspace(); workspaces.push(ws); return ws; };
const load = (ws) => loadContent(ROOT, ws.contentDir);
const errorsOf = (ws) => validateContent(load(ws), registry).errors;
const text = (list) => list.map((e) => `${e.file} › ${e.path}: ${e.message}`).join('\n');
const assets = { themeCss: 'blob:theme', glassCss: 'blob:glass', baseCss: 'blob:base' };

// ---------------------------------------------------------------- creating records

test('a new topic and a new tag satisfy the schema as soon as they are staged', () => {
  const ws = setup();
  const content = load(ws);
  const topic = createTopic(content, { lang: 'en', name: ' Craft ', description: ' Making things well ', parentId: 'top_make0001', now: NOW });
  const afterTopic = applyResult(content, { topics: [...content.topics, topic] });
  const tag = createTag(afterTopic, { lang: 'en', name: 'Joinery', now: NOW });
  assert.equal(topic.translations.en.name, 'Craft', 'names are trimmed');
  assert.equal(topic.translations.en.description, 'Making things well');
  assert.equal(topic.parentId, 'top_make0001');
  assert.equal(topic.status, 'published');
  assert.equal(topic.createdAt, '2026-11-13T10:00:00Z');
  assert.match(topic.id, /^top_[a-z0-9]{8}$/);
  assert.match(tag.id, /^tag_[a-z0-9]{8}$/);
  const written = stageResult(ws, { topics: [...content.topics, topic], tags: [...content.tags, tag] });
  assert.deepEqual(written.sort(), ['taxonomy/tags.json', 'taxonomy/topics.json']);
  assert.deepEqual(errorsOf(ws), [], text(errorsOf(ws)));
});

test('new ids and slugs never collide with the ones already in use', () => {
  const ws = setup();
  const content = load(ws);
  const a = createTag(content, { lang: 'en', name: 'Notes' });
  assert.notEqual(a.translations.en.slug, 'notes', '"notes" is taken by an existing tag');
  assert.match(a.translations.en.slug, /^notes-\d+$/);
  assert.ok(!content.tags.some((t) => t.id === a.id));
  const second = createTag(applyResult(content, { tags: [...content.tags, a] }), { lang: 'en', name: 'Notes' });
  assert.notEqual(second.translations.en.slug, a.translations.en.slug);
  assert.notEqual(second.id, a.id);
});

test('a slug that is an old address of another record counts as taken', () => {
  const ws = setup();
  const content = load(ws);
  const tags = content.tags.map((t) => (t.id === 'tag_notes001' ? { ...t, translations: { ...t.translations, en: { ...t.translations.en, redirectSlugs: ['jottings'] } } } : t));
  assert.notEqual(freeSlug(tags, 'en', 'Jottings'), 'jottings');
  assert.equal(freeSlug(tags, 'en', 'Jottings', 'tag_notes001'), 'jottings', 'the record itself may keep its own old address out of the way');
});

test('adding a translation keeps the record valid and does not touch the other languages', () => {
  const ws = setup();
  const content = load(ws);
  const only = createTopic(content, { lang: 'en', name: 'Craft', description: 'Making things well', now: NOW });
  const both = addTranslation([...content.topics, only], only, 'ar', { name: 'حرفة', description: 'صناعة الأشياء جيدًا' });
  assert.deepEqual(Object.keys(both.translations).sort(), ['ar', 'en']);
  assert.equal(both.translations.en.name, 'Craft');
  assert.equal(only.translations.ar, undefined, 'the original record is not changed');
  stageResult(ws, { topics: [...content.topics, both] });
  assert.deepEqual(errorsOf(ws), [], text(errorsOf(ws)));
  const withoutDescription = addTranslation(content.tags, content.tags[0], 'fr', { name: 'Carnets' });
  assert.equal(withoutDescription.translations.fr.description, undefined);
});

// ---------------------------------------------------------------- applying and staging

test('applyResult replaces only what the result holds', () => {
  const content = load(setup());
  const article = { ...content.articles[0], updatedAt: 'x' };
  const next = applyResult(content, { articles: new Map([[article.id, article]]) });
  assert.equal(next.articles.find((a) => a.id === article.id).updatedAt, 'x');
  assert.equal(next.articles.length, content.articles.length);
  assert.equal(next.topics, content.topics, 'untouched lists are the same objects');
  assert.equal(next.tags, content.tags);
  assert.equal(next.projects, content.projects);
});

test('stageResult writes one file per changed record and keeps the rest of each file', () => {
  const ws = setup();
  const before = ws.read('taxonomy/tags.json');
  const content = load(ws);
  const result = mergeTags(content, ['tag_read0001'], 'tag_notes001', { now: NOW });
  const written = stageResult(ws, result);
  assert.ok(written.includes('taxonomy/tags.json'));
  const after = ws.read('taxonomy/tags.json');
  assert.equal(after.schemaVersion, before.schemaVersion, 'the file keeps its other keys');
  assert.ok(!after.items.some((t) => t.id === 'tag_read0001'));
  for (const id of result.articles.keys()) assert.ok(written.includes(`articles/${id}.json`));
  for (const id of result.projects.keys()) assert.ok(written.includes(`projects/${id}.json`));
  assert.equal(written.length, new Set(written).size, 'no file is written twice');
  assert.deepEqual(errorsOf(ws), [], text(errorsOf(ws)));
  assert.deepEqual(stageResult(ws, {}), [], 'an empty result writes nothing');
});

test('deleting several tags at once removes them from the content, and needs force when they are used', () => {
  const ws = setup();
  const content = load(ws);
  const used = [...usage(content).tags].filter(([, row]) => row.total > 0).map(([id]) => id).slice(0, 2);
  assert.equal(used.length, 2, 'the sample site has used tags');
  assert.throws(() => deleteTags(content, used), /used by content/);
  const result = deleteTags(content, used, { force: true, now: NOW });
  assert.ok(used.every((id) => !result.tags.some((t) => t.id === id)));
  for (const record of [...result.articles.values(), ...result.projects.values()]) {
    assert.ok(used.every((id) => !record.tagIds.includes(id)), 'no content still points at a deleted tag');
  }
  stageResult(ws, result);
  assert.deepEqual(errorsOf(ws), [], text(errorsOf(ws)));
  const none = deleteTags(content, [], { force: true });
  assert.equal(none.tags.length, content.tags.length);
});

// ---------------------------------------------------------------- the preview of a topic or tag

test('a topic with no public content explains itself; one with content previews with its real page', () => {
  const ws = setup();
  const content = load(ws);
  const empty = createTopic(content, { lang: 'en', name: 'Craft', description: 'Making things well', now: NOW });
  const withEmpty = { ...content, topics: [...content.topics, empty] };
  assert.throws(() => renderPreview(withEmpty, { kind: 'topic', id: empty.id, lang: 'en', assets }),
    (error) => error instanceof PreviewError && error.code === 'empty-taxonomy');
  const emptyTag = createTag(content, { lang: 'en', name: 'Joinery', now: NOW });
  assert.throws(() => renderPreview({ ...content, tags: [...content.tags, emptyTag] }, { kind: 'tag', id: emptyTag.id, lang: 'en', assets }),
    (error) => error instanceof PreviewError && error.code === 'empty-taxonomy');
  const { html } = renderPreview(content, { kind: 'topic', id: 'top_ideas001', lang: 'en', assets });
  assert.match(html, /<h1[^>]*>Ideas<\/h1>/);
  assert.doesNotMatch(html, /<script/i, 'the preview never carries scripts');
  assert.throws(() => renderPreview(content, { kind: 'topic', id: 'top_nothere1', lang: 'en', assets }), (e) => e instanceof PreviewError && e.code !== 'empty-taxonomy');
});

test('a draft topic still previews, as if it were published', () => {
  const ws = setup();
  const content = load(ws);
  const draft = content.topics.map((t) => (t.id === 'top_ideas001' ? { ...t, status: 'draft' } : t));
  const { html } = renderPreview({ ...content, topics: draft }, { kind: 'topic', id: 'top_ideas001', lang: 'en', assets });
  assert.match(html, /<h1[^>]*>Ideas<\/h1>/);
});

// ---------------------------------------------------------------- links must be web, mail or phone links

const BAD = ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', ' https://example.com', 'https://exa mple.com'];
const GOOD = ['https://example.com/a?b=c#d', 'http://example.com', 'mailto:me@example.com', 'tel:+201000000000'];
const places = {
  'profile link': (ws, url) => ws.edit('profile/author.json', (p) => { p.links = [{ kind: 'website', label: 'Site', url }]; }),
  'project link': (ws, url) => ws.edit('projects/prj_archive1.json', (p) => { p.translations.en.links = [{ label: 'Code', url }]; }),
  'article canonical URL': (ws, url) => ws.edit('articles/art_welcome1.json', (a) => { a.translations.en.seo = { ...(a.translations.en.seo ?? {}), canonicalUrl: url }; }),
  'navigation external link': (ws, url) => ws.edit('config/navigation.json', (n) => { n.header.en.push({ id: 'nvi_ext00001', label: 'Elsewhere', target: { url } }); }),
};

for (const [place, put] of Object.entries(places)) {
  test(`${place}: scripts and malformed addresses are refused, web, mail and phone links are accepted`, () => {
    for (const url of BAD) {
      const ws = setup();
      put(ws, url);
      assert.ok(errorsOf(ws).length > 0, `${url} should be refused in the ${place}`);
    }
    for (const url of GOOD) {
      const ws = setup();
      put(ws, url);
      assert.deepEqual(errorsOf(ws), [], `${url} should be accepted in the ${place}\n${text(errorsOf(ws))}`);
    }
  });
}

// ---------------------------------------------------------------- synonym groups typed in the Search screen

test('synonym groups: one per line, separators of either script, duplicates folded, bad lines reported by number', () => {
  const r = parseGroups('car vehicle automobile\n\nسيارة، مركبة؛ عربة\nlonely\nsame same\na b c d e f g h i j k l m\n' + `${'x'.repeat(41)} y`);
  assert.deepEqual(r.groups, [['car', 'vehicle', 'automobile'], ['سيارة', 'مركبة', 'عربة']]);
  assert.deepEqual(r.bad, [4, 5, 6, 7], 'one word, a group that folds to one word, thirteen words, a word of 41 letters');
  assert.equal(r.tooMany, false);
  assert.deepEqual(parseGroups('').groups, []);
  assert.deepEqual(parseGroups(null).bad, [], 'a missing value is an empty list');
  const many = parseGroups(Array.from({ length: MAX_SYNONYM_GROUPS + 3 }, (_, i) => `a${i} b${i}`).join('\n'));
  assert.equal(many.groups.length, MAX_SYNONYM_GROUPS);
  assert.equal(many.tooMany, true);
});
