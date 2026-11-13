import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { GitHubStore } from '../src/core/github-store.mjs';
import { diffBlocks, diffText, diffTranslation, restoreTranslation, summarize } from '../src/core/revisions.mjs';
import { sampleBlocks } from './block-samples.mjs';
import { startFakeGitHub } from './fake-github.mjs';
import { ROOT } from './helpers.mjs';

const apply = (runs) => ({ before: runs.filter((r) => r.op !== 'add').map((r) => r.text).join(''), after: runs.filter((r) => r.op !== 'del').map((r) => r.text).join('') });

// ---------------------------------------------------------------- text diff

test('a text diff reproduces both versions exactly, in English and Arabic', () => {
  const pairs = [
    ['The quick brown fox', 'The slow brown dog'],
    ['', 'new text'], ['old text', ''], ['same', 'same'],
    ['مرحبا بالعالم الجميل', 'مرحبا بالعالم الواسع جدا'],
    ['a  b\nc', 'a b\n\nc d'],
    ['x'.repeat(10), 'y'.repeat(10)],
  ];
  for (const [a, b] of pairs) assert.deepEqual(apply(diffText(a, b)), { before: a, after: b }, JSON.stringify([a, b]));
});

test('a text diff marks only the words that changed', () => {
  const runs = diffText('The quick brown fox', 'The slow brown fox');
  assert.deepEqual(runs.filter((r) => r.op !== 'same'), [{ op: 'del', text: 'quick' }, { op: 'add', text: 'slow' }]);
  assert.deepEqual(diffText('a', 'a'), [{ op: 'same', text: 'a' }]);
  assert.deepEqual(diffText('', ''), []);
  assert.deepEqual(diffText('one two', 'one two three').filter((r) => r.op === 'add').map((r) => r.text.trim()), ['three']);
});

test('very long texts fall back to a plain before and after instead of freezing the page', () => {
  const big = 'word '.repeat(4000);
  const runs = diffText(big, `${big} extra`);
  assert.deepEqual(runs.map((r) => r.op), ['del', 'add']);
  assert.deepEqual(apply(runs), { before: big, after: `${big} extra` });
});

// ---------------------------------------------------------------- block diff

const p = (id, text, extra = {}) => ({ id, type: 'paragraph', text, ...extra });

test('blocks are matched by id: same, changed, added, removed and moved are told apart', () => {
  const a = p('blk_00000001', 'one'); const b = p('blk_00000002', 'two'); const c = p('blk_00000003', 'three'); const d = p('blk_00000004', 'four');
  const before = [a, b, c, d];
  const after = [a, p('blk_00000002', 'two changed'), d, c, p('blk_00000005', 'five')];
  const diff = diffBlocks(before, after);
  const status = Object.fromEntries(diff.map((e) => [e.id, e.status]));
  assert.equal(status.blk_00000001, 'same');
  assert.equal(status.blk_00000002, 'changed');
  assert.ok(['moved'].includes(status.blk_00000003) || ['moved'].includes(status.blk_00000004), 'one of the swapped blocks is reported as moved');
  assert.equal(status.blk_00000005, 'added');
  assert.deepEqual(summarize(diff), { added: 1, removed: 0, changed: 1, moved: 1, same: 2 });

  const removed = diffBlocks([a, b, c], [a, c]);
  assert.deepEqual(removed.map((e) => `${e.id.slice(-1)}:${e.status}`), ['1:same', '2:removed', '3:same'], 'a removed block shows where it used to be');
  const twoRemoved = diffBlocks([a, b, c, d], [a, d]);
  assert.deepEqual(twoRemoved.map((e) => `${e.id.slice(-1)}:${e.status}`), ['1:same', '2:removed', '3:removed', '4:same']);
  const leading = diffBlocks([a, b], [b]);
  assert.deepEqual(leading.map((e) => `${e.id.slice(-1)}:${e.status}`), ['1:removed', '2:same']);
});

test('a changed block reports the changed words and the changed settings separately', () => {
  const before = [p('blk_00000001', 'The old text', { style: 'lead' })];
  const after = [p('blk_00000001', 'The new text', { style: 'intro' })];
  const [entry] = diffBlocks(before, after);
  assert.equal(entry.status, 'changed');
  assert.deepEqual(entry.props, ['style']);
  assert.deepEqual(entry.fields.map((f) => f.path), [['text']]);
  assert.deepEqual(entry.fields[0].runs.filter((r) => r.op !== 'same'), [{ op: 'del', text: 'old' }, { op: 'add', text: 'new' }]);

  const textOnly = diffBlocks([p('blk_00000001', 'a')], [p('blk_00000001', 'b')])[0];
  assert.deepEqual(textOnly.props, [], 'a text edit is not also reported as a settings change');
});

test('items added to a list or a table are reported as a change with the new text', () => {
  const list = (items) => [{ id: 'blk_00000001', type: 'list', items }];
  const [entry] = diffBlocks(list(['a', 'b']), list(['a', 'b', 'c']));
  assert.equal(entry.status, 'changed');
  assert.deepEqual(entry.props, ['items']);
  assert.ok(entry.fields.some((f) => f.runs.some((r) => r.op === 'add' && r.text === 'c')));
  const [dropped] = diffBlocks(list(['a', 'b']), list(['a']));
  assert.ok(dropped.fields.some((f) => f.runs.some((r) => r.op === 'del' && r.text === 'b')));
  const typeChange = diffBlocks([{ id: 'blk_00000001', type: 'paragraph', text: 'x' }], [{ id: 'blk_00000001', type: 'quote', text: 'x' }])[0];
  assert.deepEqual(typeChange.props, ['type']);
});

test('identical block lists produce no differences, for every block type', () => {
  const blocks = sampleBlocks();
  const diff = diffBlocks(blocks, structuredClone(blocks));
  assert.ok(diff.every((e) => e.status === 'same'));
  // Key order in stored JSON does not matter.
  const shuffled = blocks.map((b) => Object.fromEntries(Object.entries(b).reverse()));
  assert.ok(diffBlocks(blocks, shuffled).every((e) => e.status === 'same'));
});

test('a translation diff covers title, excerpt, search overrides and the body', () => {
  const before = { status: 'published', slug: 'a', title: 'Old title', excerpt: 'Same', body: [p('blk_00000001', 'x')], seo: { title: 'S' } };
  const after = { ...before, title: 'New title', subtitle: 'Added', body: [p('blk_00000001', 'x'), p('blk_00000002', 'y')], seo: { title: 'S', description: 'D' } };
  const d = diffTranslation(before, after);
  assert.deepEqual(d.meta.map((m) => m.key), ['title', 'subtitle']);
  assert.deepEqual(d.seo.map((m) => m.key), ['description']);
  assert.equal(d.summary.added, 1);
  assert.equal(d.identical, false);
  assert.equal(diffTranslation(before, structuredClone(before)).identical, true);
});

test('restoring brings back the old text but never the old address or publication status', () => {
  const old = { status: 'draft', slug: 'old-address', title: 'Old', subtitle: 'Old sub', excerpt: 'Old excerpt', coverAlt: 'Old alt', body: [p('blk_00000001', 'old body')], seo: { title: 'Old seo' } };
  const current = { status: 'published', slug: 'new-address', title: 'New', excerpt: 'New excerpt', body: [p('blk_00000009', 'new body')] };

  const body = restoreTranslation(current, old, 'body');
  assert.deepEqual(body.body, old.body);
  assert.equal(body.title, 'New', 'only the body is restored');
  assert.notEqual(body.body, old.body, 'the restored blocks are copies');

  const all = restoreTranslation(current, old, 'all');
  assert.equal(all.title, 'Old'); assert.equal(all.subtitle, 'Old sub'); assert.equal(all.coverAlt, 'Old alt'); assert.deepEqual(all.seo, { title: 'Old seo' });
  assert.equal(all.slug, 'new-address'); assert.equal(all.status, 'published');
  // Fields the old version did not have are removed rather than kept.
  const bare = restoreTranslation({ ...current, subtitle: 'x', seo: { title: 'y' } }, { ...old, subtitle: undefined, seo: undefined }, 'all');
  assert.ok(!('subtitle' in bare) && !('seo' in bare));
  assert.deepEqual(current.body, [p('blk_00000009', 'new body')], 'the current translation is not modified');
});

// ---------------------------------------------------------------- Git history through the store

let fake;
before(async () => { fake = await startFakeGitHub({ seedDir: `${ROOT}/content` }); });
after(() => fake.close());
const store = () => new GitHubStore({ token: fake.token, owner: fake.owner, repo: fake.repo, branch: fake.branch, apiBase: fake.url });

test('the history of one file lists only the commits that changed it, newest first, and loads any version', async () => {
  const rel = 'articles/art_welcome1.json';
  const original = JSON.parse(fake.readText(`content/${rel}`));
  const v2 = structuredClone(original); const lang = Object.keys(v2.translations)[0]; v2.translations[lang].title = 'Second title';
  const v3 = structuredClone(original); v3.translations[lang].title = 'Third title';
  fake.externalCommit({ [`content/${rel}`]: JSON.stringify(v2) }, 'Edit the welcome article');
  fake.externalCommit({ 'content/config/site.json': fake.readText('content/config/site.json') }, 'Unrelated: same content');
  fake.externalCommit({ [`content/${rel}`]: JSON.stringify(v3) }, 'Edit the welcome article again\n\nwith a long description');

  const history = await store().listFileCommits(rel);
  assert.deepEqual(history.map((c) => c.message), ['Edit the welcome article again', 'Edit the welcome article', 'Initial content']);
  assert.ok(history.every((c) => /^[0-9a-f]{40}$/.test(c.sha) && c.author === 'Abdo' && /^2026-01-01T/.test(c.date) && c.url.startsWith('https://github.com/')));
  assert.ok(history[0].date > history[1].date, 'newest first');

  const s = store();
  assert.equal((await s.readJsonAt(rel, history[0].sha)).translations[lang].title, 'Third title');
  assert.equal((await s.readJsonAt(rel, history[1].sha)).translations[lang].title, 'Second title');
  assert.deepEqual(await s.readJsonAt(rel, history[2].sha), original);
  assert.equal(await s.readJsonAt('articles/art_nothere1.json', history[0].sha), null, 'a file that did not exist then');
  assert.equal((await s.listFileCommits(rel, { limit: 1 })).length, 1);
});

test('history requests refuse paths and identifiers that could reach outside the content folder', async () => {
  const s = store();
  for (const bad of ['../secrets.json', 'a/../../b.json', '/etc/passwd', 'a//b.json', '', 'a b.json', 'a?x=1.json']) await assert.rejects(() => s.listFileCommits(bad), (e) => e.kind === 'input', JSON.stringify(bad));
  await assert.rejects(() => s.readJsonAt('articles/x.json', 'main'), (e) => e.kind === 'input');
  await assert.rejects(() => s.readJsonAt('../x.json', 'a'.repeat(40)), (e) => e.kind === 'input');
});
