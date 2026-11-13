import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createArticle, createProject, newBlock, overview, publishArticleTranslation, usedIds } from '../src/core/content-ops.mjs';
import { GitHubStore } from '../src/core/github-store.mjs';
import { Workspace, serialize } from '../src/core/workspace.mjs';
import { createRegistry } from '../src/lib/validate.mjs';
import { startFakeGitHub } from './fake-github.mjs';
import { ROOT } from './helpers.mjs';

const registry = createRegistry(ROOT);
let fake;
before(async () => { fake = await startFakeGitHub({ seedDir: `${ROOT}/content` }); });
after(() => fake.close());

const store = () => new GitHubStore({ token: fake.token, owner: fake.owner, repo: fake.repo, branch: fake.branch, apiBase: fake.url });
const open = async () => new Workspace(await store().readSnapshot());
const messages = (v) => v.errors.map((e) => `${e.file} › ${e.path}: ${e.message}`).join('\n');
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

test('content loaded from the repository validates exactly like the files on disk', async () => {
  const ws = await open();
  const v = ws.validate(registry);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings, []);
  assert.equal(v.content.articles.length, 4);
});

test('edits are staged, visible to readers, reversible, and identical edits do not count as changes', async () => {
  const ws = await open();
  const rel = 'articles/art_built001.json';
  const original = ws.read(rel);
  const edited = structuredClone(original);
  edited.translations.en.title = 'A different title';
  ws.write(rel, edited);
  assert.equal(ws.read(rel).translations.en.title, 'A different title');
  assert.equal(ws.summary().changed, 1);
  assert.equal(ws.content().articles.find((a) => a.id === 'art_built001').translations.en.title, 'A different title');
  ws.write(rel, original);
  assert.equal(ws.isDirty, false, 'writing the original back removes the change');
  ws.write(rel, edited);
  ws.discard(rel);
  assert.equal(ws.read(rel).translations.en.title, original.translations.en.title);
});

test('mutating what read() returns never changes the stored data', async () => {
  const ws = await open();
  const copy = ws.read('profile/author.json');
  copy.translations.en.name = 'Tampered';
  assert.notEqual(ws.read('profile/author.json').translations.en.name, 'Tampered');
  assert.equal(ws.isDirty, false);
});

test('a new article is valid immediately as a draft with an empty body, and public only when it has a body', async () => {
  const ws = await open();
  const article = createArticle(ws.content(), { lang: 'en', title: 'My First Post', excerpt: 'A short summary.', authorId: 'aut_h4x9k2m1', now: new Date('2026-11-04T05:00:00Z') });
  assert.match(article.id, /^art_[0-9a-z]{8}$/);
  assert.equal(article.translations.en.slug, 'my-first-post');
  ws.write(`articles/${article.id}.json`, article);
  assert.deepEqual(ws.validate(registry).errors, [], messages(ws.validate(registry)));

  const published = publishArticleTranslation(article, 'en', new Date('2026-11-04T06:00:00Z'));
  ws.write(`articles/${article.id}.json`, published);
  assert.match(messages(ws.validate(registry)), /translations\.en\.body/, 'a published translation needs content');

  published.translations.en.body = [{ ...newBlock(ws.content(), 'paragraph'), text: 'Hello.' }];
  ws.write(`articles/${article.id}.json`, published);
  assert.deepEqual(ws.validate(registry).errors, []);
  assert.equal(published.publishedAt, '2026-11-04T06:00:00Z');
});

test('titles that would collide get distinct slugs per language', async () => {
  const ws = await open();
  const a = createArticle(ws.content(), { lang: 'en', title: 'Welcome to ABDO', excerpt: 'x', authorId: 'aut_h4x9k2m1' });
  assert.equal(a.translations.en.slug, 'welcome-to-abdo-2');
  const p = createProject(ws.content(), { lang: 'ar', title: 'أرشيف القراءة الشخصي', summary: 'x' });
  assert.equal(p.translations.ar.slug, 'أرشيف-القراءة-الشخصي-2');
});

test('deleting something that is still referenced is reported by validation, not allowed silently', async () => {
  const ws = await open();
  const topics = ws.read('taxonomy/topics.json');
  topics.items = topics.items.filter((t) => t.id !== 'top_ideas001');
  ws.write('taxonomy/topics.json', topics);
  assert.match(messages(ws.validate(registry)), /unknown topic "top_ideas001"/);
  ws.remove('articles/art_welcome1.json');
  assert.equal(ws.exists('articles/art_welcome1.json'), false);
  assert.equal(ws.list('articles/').includes('articles/art_welcome1.json'), false);
});

test('removing a file that only exists locally just forgets it', async () => {
  const ws = await open();
  ws.write('articles/art_local001.json', createArticle(ws.content(), { lang: 'en', title: 'Local', excerpt: 'x', authorId: 'aut_h4x9k2m1' }));
  assert.equal(ws.summary().added, 1);
  ws.remove('articles/art_local001.json');
  assert.equal(ws.isDirty, false);
});

test('an uploaded image can be referenced by a media record and validates; a missing file does not', async () => {
  const ws = await open();
  ws.uploadMedia('new-photo.png', PNG);
  assert.ok(ws.mediaFiles().get('new-photo.png').staged);
  const media = ws.read('media/media.json');
  media.items.push({ id: 'med_newphoto', status: 'active', type: 'image', file: 'new-photo.png', mimeType: 'image/png', width: 1, height: 1, alt: { ar: 'صورة', en: 'A photo' }, createdAt: '2026-11-04T05:00:00Z', updatedAt: '2026-11-04T05:00:00Z' });
  ws.write('media/media.json', media);
  assert.deepEqual(ws.validate(registry).errors, [], messages(ws.validate(registry)));
  ws.discard('media/files/new-photo.png');
  assert.match(messages(ws.validate(registry)), /file not found: content\/media\/files\/new-photo\.png/);
  assert.throws(() => ws.uploadMedia('sample-cover-1.svg', PNG), /already exists/);
});

test('readiness blocks publishing on nothing staged, validation errors and unresolved conflicts', async () => {
  const ws = await open();
  assert.deepEqual(ws.readiness(registry).reasons, ['nothing']);
  const broken = ws.read('articles/art_built001.json');
  broken.status = 'publised';
  ws.write('articles/art_built001.json', broken);
  assert.deepEqual(ws.readiness(registry).reasons, ['invalid']);
  ws.discardAll();
  const edited = ws.read('articles/art_built001.json');
  edited.featured = true;
  ws.write('articles/art_built001.json', edited);
  assert.equal(ws.readiness(registry).ok, true);
});

test('publishing end to end: stage, check, commit, reload, and the repository holds exactly the staged state', async () => {
  const s = store();
  const ws = new Workspace(await s.readSnapshot());
  const article = createArticle(ws.content(), { lang: 'ar', title: 'مقال جديد', excerpt: 'ملخص قصير', authorId: 'aut_h4x9k2m1' });
  ws.write(`articles/${article.id}.json`, article);
  ws.remove('articles/art_worklog1.json');
  ws.uploadMedia('upload.png', PNG);
  assert.equal(ws.readiness(registry).ok, true);
  const summary = ws.summary();
  assert.deepEqual([summary.added, summary.changed, summary.deleted], [2, 0, 1]);

  const result = await s.commit({ message: 'Publish from test', expectedHeadSha: ws.headSha, changes: ws.changes() });
  assert.equal(fake.headSha, result.commitSha);
  assert.equal(fake.readText(`content/articles/${article.id}.json`), serialize(article));
  assert.deepEqual([...fake.files().get('content/media/files/upload.png')], [...PNG]);
  assert.equal(fake.files().has('content/articles/art_worklog1.json'), false);

  ws.discardAll();
  ws.rebase(await s.readSnapshot());
  assert.equal(ws.isDirty, false);
  assert.ok(ws.exists(`articles/${article.id}.json`));
  assert.ok(ws.mediaFiles().has('upload.png'));
  assert.deepEqual(ws.validate(registry).errors, []);
});

test('staged work survives a reload; files that changed upstream meanwhile are flagged as conflicts', async () => {
  const s = store();
  const ws = new Workspace(await s.readSnapshot());
  const a = ws.read('articles/art_built001.json'); a.featured = !a.featured;
  const b = ws.read('articles/art_readar01.json'); b.featured = !b.featured;
  ws.write('articles/art_built001.json', a);
  ws.write('articles/art_readar01.json', b);
  ws.uploadMedia('keep.png', PNG);
  const saved = JSON.parse(JSON.stringify(ws.exportState()));

  // Someone else edits one of the same files in the repository.
  const theirs = JSON.parse(fake.readText('content/articles/art_built001.json'));
  theirs.template = 'edited-elsewhere';
  fake.externalCommit({ 'content/articles/art_built001.json': JSON.stringify(theirs) });

  const reopened = new Workspace(await s.readSnapshot());
  const outcome = reopened.importState(saved);
  assert.equal(outcome.restored, 3);
  assert.deepEqual(outcome.conflicts, ['articles/art_built001.json']);
  assert.deepEqual([...reopened.mediaFiles().get('keep.png').bytes], [...PNG], 'binary data restored intact');
  assert.deepEqual(reopened.readiness(registry).reasons.includes('conflicts'), true);
  reopened.keepMine('articles/art_built001.json');
  assert.equal(reopened.conflicts.length, 0);
});

test('stampUpdates sets updatedAt only on records whose content really changed', async () => {
  const ws = await open();
  const before = ws.read('articles/art_built001.json').updatedAt;
  const edited = ws.read('articles/art_built001.json'); edited.featured = !edited.featured;
  ws.write('articles/art_built001.json', edited);
  const fresh = createArticle(ws.content(), { lang: 'en', title: 'Fresh', excerpt: 'x', authorId: 'aut_h4x9k2m1', now: new Date('2026-01-01T00:00:00Z') });
  ws.write(`articles/${fresh.id}.json`, fresh);
  ws.stampUpdates(new Date('2026-11-04T08:00:00.123Z'));
  assert.equal(ws.read('articles/art_built001.json').updatedAt, '2026-11-04T08:00:00Z');
  assert.notEqual(before, '2026-11-04T08:00:00Z');
  assert.equal(ws.read(`articles/${fresh.id}.json`).updatedAt, '2026-01-01T00:00:00Z', 'new records keep their creation stamp');
  assert.deepEqual(ws.validate(registry).errors, []);
});

test('importing garbage state is ignored safely', async () => {
  const ws = await open();
  assert.deepEqual(ws.importState(null), { restored: 0, conflicts: [] });
  assert.deepEqual(ws.importState({ version: 99 }), { restored: 0, conflicts: [] });
  ws.importState({ version: 1, staged: [{ rel: 5, op: 'write' }, { rel: 'x.json', op: 'explode' }] });
  assert.equal(ws.isDirty, false);
});

test('overview numbers come from real content', async () => {
  const ws = await open();
  const o = overview(ws.content());
  const content = ws.content();
  assert.equal(o.articles.total, content.articles.length);
  assert.equal(o.articles.published, content.articles.filter((a) => a.status === 'published').length);
  assert.equal(o.articles.published + o.articles.drafts + o.articles.archived, o.articles.total);
  assert.equal(o.byLanguage.ar.articles, content.articles.filter((a) => a.status === 'published' && a.translations.ar?.status === 'published').length);
  assert.ok(o.recent.length > 0 && o.recent.every((r, i, all) => i === 0 || all[i - 1].updatedAt >= r.updatedAt));
  assert.ok(usedIds(content).has('aut_h4x9k2m1'));
});
