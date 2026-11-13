import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ConflictError, GitHubError, GitHubStore, fromBase64, toBase64 } from '../src/core/github-store.mjs';
import { startFakeGitHub } from './fake-github.mjs';
import { ROOT } from './helpers.mjs';

let fake;
before(async () => { fake = await startFakeGitHub({ seedDir: `${ROOT}/content` }); });
after(() => fake.close());

const store = (overrides = {}) => new GitHubStore({ token: fake.token, owner: fake.owner, repo: fake.repo, branch: fake.branch, apiBase: fake.url, ...overrides });

test('verify reports the repository and accepts a token that can push', async () => {
  const info = await store().verify();
  assert.equal(info.canWrite, true);
  assert.equal(info.isPrivate, false);
});

test('a wrong token, unknown repository and unknown branch give distinct, plain errors', async () => {
  await assert.rejects(() => store({ token: 'definitely-the-wrong-token' }).verify(), (e) => e.kind === 'auth');
  await assert.rejects(() => store({ repo: 'nope' }).verify(), (e) => e.kind === 'not-found');
  await assert.rejects(() => store({ branch: 'missing' }).verify(), (e) => e.kind === 'not-found');
});

test('a read-only token is reported as read-only before any edit is attempted', async () => {
  fake.setCanPush(false);
  try { await assert.rejects(() => store().verify(), (e) => e.kind === 'read-only'); } finally { fake.setCanPush(true); }
});

test('the snapshot contains every JSON content file, parsed, and lists media without downloading it', async () => {
  const snap = await store().readSnapshot();
  assert.equal(snap.headSha, fake.headSha);
  for (const rel of ['config/site.json', 'config/languages.json', 'profile/author.json', 'articles/art_welcome1.json', 'projects/prj_archive1.json']) assert.ok(snap.json.has(rel), rel);
  assert.equal(snap.json.get('profile/author.json').data.id, 'aut_h4x9k2m1');
  assert.ok(snap.media.has('media/files/sample-cover-1.svg'));
  assert.ok([...snap.json.keys()].every((k) => k.endsWith('.json')));
  const mediaFetches = fake.requests.filter((r) => r.path.includes('/git/blobs/') && snap.media.get('media/files/sample-cover-1.svg').sha === r.path.split('/').pop());
  assert.equal(mediaFetches.length, 0, 'media blobs are not fetched during load');
});

test('the token travels only in the Authorization header', async () => {
  const from = fake.requests.length;
  await store().readSnapshot();
  const mine = fake.requests.slice(from);
  assert.ok(mine.length > 5);
  for (const r of mine) {
    if (r.method === 'OPTIONS') continue;
    assert.equal(r.auth, `Bearer ${fake.token}`);
    assert.ok(!r.path.includes(fake.token) && !r.search.includes(fake.token), 'not in the URL');
    assert.ok(!JSON.stringify(r.body ?? '').includes(fake.token), 'not in the body');
  }
});

test('a commit writes, adds and deletes files atomically in a single commit', async () => {
  const s = store();
  const snap = await s.readSnapshot();
  const before = fake.files().size;
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const result = await s.commit({
    message: 'Test publish',
    expectedHeadSha: snap.headSha,
    changes: [
      { path: 'articles/art_new00001.json', data: '{"hello":"مرحبا"}\n' },
      { path: 'media/files/blob.bin', data: bytes },
      { path: 'articles/art_worklog1.json', delete: true },
    ],
  });
  assert.equal(fake.headSha, result.commitSha);
  assert.equal(fake.readText('content/articles/art_new00001.json'), '{"hello":"مرحبا"}\n', 'UTF-8 survives');
  assert.deepEqual([...fake.files().get('content/media/files/blob.bin')], [...bytes], 'binary survives byte for byte');
  assert.equal(fake.files().has('content/articles/art_worklog1.json'), false);
  assert.equal(fake.files().size, before + 2 - 1);
  const created = fake.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/git/commits'));
  assert.equal(created.length, 1, 'exactly one commit for the whole publish');
  assert.equal(created[0].body.message, 'Test publish');
  assert.equal(created[0].body.parents.length, 1);
});

test('a publish is refused, and nothing is written, when the branch moved after loading', async () => {
  const s = store();
  const snap = await s.readSnapshot();
  fake.externalCommit({ 'content/config/site.json': '{"changed":"elsewhere"}' });
  const headAfterOther = fake.headSha;
  await assert.rejects(
    () => s.commit({ message: 'Mine', expectedHeadSha: snap.headSha, changes: [{ path: 'articles/art_mine0001.json', data: '{}' }] }),
    (e) => e instanceof ConflictError && e.currentHeadSha === headAfterOther,
  );
  assert.equal(fake.headSha, headAfterOther, 'the other change is intact');
  assert.equal(fake.files().has('content/articles/art_mine0001.json'), false, 'my change was not written');
});

test('if the branch moves between the check and the final update, the update is rejected, not forced', async () => {
  // Wrap fetch so an external commit sneaks in right before the ref update.
  let sneaked = false;
  const sneaky = async (url, init) => {
    if (!sneaked && init.method === 'PATCH') { sneaked = true; fake.externalCommit({ 'content/config/site.json': '{"x":1}' }, 'Sneaky'); }
    return fetch(url, init);
  };
  const s = store({ fetch: sneaky });
  const snap = await s.readSnapshot();
  const head = fake.headSha;
  assert.equal(snap.headSha, head);
  await assert.rejects(() => s.commit({ message: 'Late', expectedHeadSha: snap.headSha, changes: [{ path: 'articles/art_late0001.json', data: '{}' }] }), ConflictError);
  assert.notEqual(fake.headSha, head);
  assert.equal(fake.readText('content/config/site.json'), '{"x":1}', 'the other writer wins; nothing was force-pushed');
});

test('paths outside the content folder, or malformed, are refused before any request is made', async () => {
  const s = store();
  const snap = await s.readSnapshot();
  const requestsBefore = fake.requests.length;
  for (const path of ['../.github/workflows/deploy.yml', '/etc/passwd', 'a/../../b.json', '.hidden', 'a//b.json', 'a/./b.json', 'x y.json', '', '..']) {
    await assert.rejects(() => s.commit({ message: 'x', expectedHeadSha: snap.headSha, changes: [{ path, data: '{}' }] }), (e) => e instanceof GitHubError && e.kind === 'input', `path "${path}"`);
  }
  await assert.rejects(() => s.commit({ message: 'x', expectedHeadSha: snap.headSha, changes: [{ path: 'a.json', data: '1' }, { path: 'a.json', data: '2' }] }), /twice/);
  await assert.rejects(() => s.commit({ message: '  ', expectedHeadSha: snap.headSha, changes: [{ path: 'a.json', data: '1' }] }), /message/);
  await assert.rejects(() => s.commit({ message: 'x', expectedHeadSha: snap.headSha, changes: [] }), /nothing/i);
  assert.equal(fake.requests.length, requestsBefore, 'no network traffic for rejected input');
});

test('bad construction input is rejected, and the token is not exposed on the object', () => {
  const base = { token: 'abcdefghij12345', owner: 'o', repo: 'r', fetch: async () => ({}) };
  for (const bad of [{ token: '' }, { token: 'short' }, { token: 'has space in it' }, { owner: '../x' }, { repo: 'a/b' }, { branch: 'a..b' }, { branch: 'x y' }, { apiBase: 'javascript:alert(1)' }, { apiBase: 'https://api.github.com/evil' }]) {
    assert.throws(() => new GitHubStore({ ...base, ...bad }), GitHubError, JSON.stringify(bad));
  }
  const ok = new GitHubStore({ ...base });
  assert.ok(!JSON.stringify(ok).includes('abcdefghij12345'));
  assert.ok(!Object.values(ok).some((v) => v === 'abcdefghij12345'));
  assert.ok(!String(ok).includes('abcdefghij12345'));
});

test('network failures and rate limits map to readable errors that never contain the token', async () => {
  const failing = new GitHubStore({ token: 'abcdefghij12345', owner: 'o', repo: 'r', fetch: async () => { throw new TypeError('Failed to fetch https://x?t=abcdefghij12345'); } });
  await assert.rejects(() => failing.verify(), (e) => e.kind === 'network' && !e.message.includes('abcdefghij12345'));
  const limited = new GitHubStore({ token: 'abcdefghij12345', owner: 'o', repo: 'r', fetch: async () => new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }) });
  await assert.rejects(() => limited.verify(), (e) => e.kind === 'rate-limit');
  const forbidden = new GitHubStore({ token: 'abcdefghij12345', owner: 'o', repo: 'r', fetch: async () => new Response('{"message":"Resource not accessible"}', { status: 403 }) });
  await assert.rejects(() => forbidden.verify(), (e) => e.kind === 'forbidden');
});

test('invalid JSON in the repository is reported with the file name', async () => {
  fake.externalCommit({ 'content/articles/art_broken01.json': '{ not json' });
  await assert.rejects(() => store().readSnapshot(), /content\/articles\/art_broken01\.json is not valid JSON/);
  fake.externalCommit({ 'content/articles/art_broken01.json': null });
});

test('base64 helpers round-trip arbitrary bytes, including large ones', () => {
  const big = Uint8Array.from({ length: 300000 }, (_, i) => (i * 31) % 256);
  assert.deepEqual(fromBase64(toBase64(big)), big);
});
