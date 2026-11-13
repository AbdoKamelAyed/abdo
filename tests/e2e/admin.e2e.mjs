// End-to-end test of the admin in a real browser (Chromium via Playwright), talking to a local
// fake of the GitHub API. Run with:  node tests/e2e/admin.e2e.mjs
// Playwright is not a project dependency; the script exits with a notice if it cannot find it.
//
// What this proves: the admin screens work, the staged changes persist, and what the admin publishes
// is accepted by the real site build. What it does not prove: behaviour against the real GitHub.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build } from '../../src/build.mjs';
import { createStaticServer } from '../../tools/serve.mjs';
import { startFakeGitHub } from '../fake-github.mjs';
import { ROOT } from '../helpers.mjs';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.log('Playwright is not installed here; skipping the browser test.'); process.exit(0); }

const SHOTS = process.env.E2E_SHOTS ? join(process.env.E2E_SHOTS) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const work = mkdtempSync(join(tmpdir(), 'abdo-e2e-'));
const distDir = join(work, 'dist');
mkdirSync(distDir);
const fake = await startFakeGitHub({ seedDir: join(ROOT, 'content') });
const server = createStaticServer(distDir);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const built = build({ out: distDir, siteUrl: base, adminApiBase: fake.url });
assert.ok(built.ok, 'the site builds with the admin included');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
// The preview page links Google Fonts like the real site does. The test must not depend on the internet, so
// those requests are answered locally (and counted: it proves the admin's CSP lets the preview ask for them).
let fontRequests = 0;
await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => { fontRequests += 1; route.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed font stylesheet */' }); });
const page = await context.newPage();
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

let stepNo = 0;
async function step(name, fn) {
  stepNo += 1;
  try { await fn(); console.log(`  ok  ${String(stepNo).padStart(2)}  ${name}`); } catch (error) {
    console.log(`FAIL  ${String(stepNo).padStart(2)}  ${name}\n${error.stack ?? error}`);
    if (problems.length) console.log('browser problems:\n  ' + problems.join('\n  '));
    await page.screenshot({ path: join(SHOTS ?? work, 'failure.png'), fullPage: true }).catch(() => {});
    await cleanup(); process.exit(1);
  }
}
async function cleanup() { await browser.close(); await fake.close(); server.close(); rmSync(work, { recursive: true, force: true }); }
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }); };

const badge = () => page.locator('#staged-badge');
async function signIn({ remember = false, token = fake.token } = {}) {
  await page.getByLabel('GitHub user or organisation').fill(fake.owner);
  await page.getByLabel('Repository').fill(fake.repo);
  await page.getByLabel('Branch').fill(fake.branch);
  await page.getByLabel('Access token').fill(token);
  if (remember) await page.getByLabel('Keep me signed in while this tab is open').check();
  await page.getByRole('button', { name: 'Sign in' }).click();
}
const goto = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(80); };
const modalOf = () => page.locator('dialog.modal');
/** Open the block picker at the end of the body and choose a type. */
const addBlock = async (type) => { await page.click('#add-block'); await page.click(`[data-add-block=${type}]`); };

// ------------------------------------------------------------------------------------------------

await step('the admin loads, is not indexable, and shows the sign-in form', async () => {
  await page.goto(`${base}/admin/`);
  await page.waitForSelector('form.login');
  assert.match(await page.locator('meta[name=robots]').getAttribute('content'), /noindex/);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert.match(csp, /script-src 'self'/);
  assert.ok(csp.includes(`connect-src 'self' ${fake.url}`));
  assert.match(await page.locator('main h1').innerText(), /Sign in/);
  await shot('01-login');
});

await step('a wrong token is rejected with a clear message and nothing is stored', async () => {
  await signIn({ token: 'definitely-the-wrong-token' });
  await page.waitForSelector('.login .field__error:not([hidden])');
  assert.match(await page.locator('.login .field__error:not([hidden])').innerText(), /rejected the access token/);
  const stored = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage].map((s) => Object.entries(s))));
  assert.ok(!stored.includes('wrong-token'), 'token not persisted');
});

await step('signing in loads the repository and shows real numbers', async () => {
  await page.getByLabel('Access token').fill(fake.token);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForSelector('.tiles');
  const tiles = await page.locator('.tile').allInnerTexts();
  assert.ok(tiles.some((t) => /Published articles/.test(t)), tiles.join('|'));
  assert.equal((await page.locator('.tile', { hasText: 'Published articles' }).locator('strong').innerText()), '4'.replace('4', String(4)));
  assert.match(await badge().innerText(), /Nothing unpublished/);
  assert.match(await page.locator('.notice--warn').first().innerText(), /repository is public/);
  await shot('02-overview');
});

await step('the token is held in memory only: not in any browser storage', async () => {
  const stored = await page.evaluate(async () => {
    const dump = { local: { ...localStorage }, session: { ...sessionStorage } };
    const idb = await new Promise((resolve) => { const r = indexedDB.open('abdo-admin'); r.onsuccess = () => resolve([...r.result.objectStoreNames]); r.onerror = () => resolve([]); });
    return JSON.stringify({ dump, idb });
  });
  assert.ok(!stored.includes(fake.token));
});

await step('the article list shows every article with per-language status', async () => {
  await goto('#/articles');
  await page.waitForSelector('.table--list');
  assert.equal(await page.locator('.table--list tbody tr').count(), 4);
  const row = page.locator('tr[data-id=art_welcome1]');
  assert.match(await row.innerText(), /AR\s*EN/);
  await page.getByLabel('Search titles').fill('slow');
  assert.equal(await page.locator('.table--list tbody tr').count(), 1);
  await page.getByLabel('Search titles').fill('');
});

let newArticleId;
await step('create an article, write a block, publish the language; validation guides each stage', async () => {
  await page.click('#new-item');
  const dlg = modalOf();
  await dlg.getByLabel('Language').selectOption('en');
  await dlg.getByLabel('Title').fill('My E2E article');
  await dlg.getByLabel('Excerpt').fill('A summary written by the browser test.');
  await dlg.locator('#create-confirm').click();
  await page.waitForSelector('.editor');
  newArticleId = (await page.evaluate(() => location.hash)).split('/').pop();
  assert.match(newArticleId, /^art_[0-9a-z]{8}$/);
  assert.equal(await page.getByLabel('URL slug').inputValue(), 'my-e2e-article');
  assert.match(await badge().innerText(), /1 unpublished/);
  // A draft with no body is allowed; marking it published without content is not.
  await page.click('#publish-translation');
  await page.waitForSelector('.problems:not([hidden])');
  assert.match(await page.locator('.problems').innerText(), /body/);
  await addBlock('paragraph');
  await page.locator('.block textarea').first().fill('Hello from the **browser test**.');
  await page.waitForFunction(() => document.querySelector('.problems')?.hidden === true, null, { timeout: 3000 });
  await shot('03-article-editor');
});

await step('upload an image: content is checked, alt text is required in every language', async () => {
  await goto('#/media');
  await page.waitForSelector('#upload-input', { state: 'attached' });
  await page.setInputFiles('#upload-input', { name: 'Evil Name.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') });
  await page.waitForSelector('.toast--error');
  assert.match(await page.locator('.toast--error').first().innerText(), /Unsupported file type/);
  await page.setInputFiles('#upload-input', { name: 'My Photo.PNG', mimeType: 'image/png', buffer: PNG });
  const dlg = modalOf();
  await dlg.waitFor();
  await dlg.locator('#upload-confirm').click();
  assert.match(await dlg.locator('.field__error:not([hidden])').innerText(), /required in every language/);
  await dlg.getByLabel('Image description (English)').fill('A tiny test image');
  await dlg.getByLabel('Image description (العربية)').fill('صورة اختبار صغيرة');
  await dlg.locator('#upload-confirm').click();
  await page.waitForSelector('.media-card[data-media-id] >> text=my-photo.png');
  assert.equal(await page.locator('.media-card').count(), 5);
  await shot('04-media');
});

await step('use the uploaded image in the article through an image block', async () => {
  await goto(`#/articles/${newArticleId}`);
  await page.waitForSelector('.editor');
  await addBlock('image');
  const select = page.locator('.block[data-block-type=image] select').first();
  const value = await select.evaluate((el) => [...el.options].find((o) => o.textContent.includes('my-photo.png')).value);
  await select.selectOption(value);
  await page.waitForTimeout(400);
  assert.equal((await page.locator('.problems:not([hidden])').count()), 0, 'no validation problems');
});

await step('edit a project and the profile; add a skill', async () => {
  await goto('#/projects/prj_archive1');
  await page.waitForSelector('.editor');
  await page.getByLabel('Project progress').selectOption('paused');
  await goto('#/profile');
  await page.waitForSelector('.editor');
  await page.getByLabel('Name', { exact: true }).first().fill('Abdo (e2e)');
  await page.click('[data-add-entry=skills]');
  await page.locator('[data-section=skills] .entry').last().locator('input[type=text], input:not([type])').first().fill('Browser testing');
  await page.waitForTimeout(400);
});

await step('unpublished work survives a reload when the tab session is kept', async () => {
  const before = await badge().innerText();
  const n = Number(before.match(/\d+/)[0]);
  assert.ok(n >= 4, before);
  await page.evaluate((t) => sessionStorage.setItem('abdo.admin.token', t), fake.token); // as "keep me signed in" would
  await page.reload();
  await page.waitForSelector('.layout nav');
  await page.waitForFunction(() => document.querySelector('#staged-badge')?.textContent.match(/\d/));
  assert.equal(await badge().innerText(), before);
  await page.waitForSelector('.toast');
  assert.match(await page.locator('.toast').first().innerText(), /Restored \d+ unpublished/);
});

await step('review shows every change and the check passes', async () => {
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  const files = await page.locator('[data-rel]').evaluateAll((els) => els.map((e) => e.dataset.rel));
  for (const expected of [`articles/${newArticleId}.json`, 'projects/prj_archive1.json', 'profile/author.json', 'media/media.json', 'media/files/my-photo.png']) assert.ok(files.includes(expected), `${expected} in ${files}`);
  assert.match(await page.locator('#validation-card h2').innerText(), /Everything is valid/);
  assert.equal(await page.locator('#publish-button').isDisabled(), false);
  await shot('05-publish-review');
});

await step('publishing makes exactly one commit containing every change', async () => {
  const commitsBefore = fake.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/git/commits')).length;
  await page.getByLabel('Description of this publish').fill('E2E publish');
  await page.click('#publish-button');
  await page.waitForSelector('#publish-success');
  const commits = fake.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/git/commits'));
  assert.equal(commits.length - commitsBefore, 1);
  assert.equal(commits.at(-1).body.message, 'E2E publish');
  assert.ok(fake.readText(`content/articles/${newArticleId}.json`).includes('My E2E article'));
  assert.deepEqual([...fake.files().get('content/media/files/my-photo.png')], [...PNG]);
  assert.match(fake.readText('content/profile/author.json'), /Abdo \(e2e\)/);
  assert.match(await badge().innerText(), /Nothing unpublished/);
  const article = JSON.parse(fake.readText(`content/articles/${newArticleId}.json`));
  assert.equal(article.translations.en.status, 'published');
  assert.ok(article.publishedAt);
  await shot('06-published');
});

await step('what the admin published is accepted by the real site build and appears as a page', async () => {
  const contentDir = join(work, 'published-content');
  for (const [path, bytes] of fake.files()) {
    if (!path.startsWith('content/')) continue;
    const target = join(contentDir, path.slice('content/'.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const out = join(work, 'dist-from-published');
  const result = build({ content: contentDir, out, siteUrl: 'https://example.github.io/abdo', admin: false });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.deepEqual(result.warnings, []);
  const { readFileSync, existsSync } = await import('node:fs');
  const html = join(out, 'en', 'blog', 'my-e2e-article', 'index.html');
  assert.ok(existsSync(html), 'article page generated');
  const text = readFileSync(html, 'utf8');
  assert.match(text, /Hello from the <strong>browser test<\/strong>/);
  assert.match(text, /my-photo\.png/);
});

await step('a conflicting change in the repository is detected; publishing waits for a decision', async () => {
  await goto('#/articles/art_built001');
  await page.waitForSelector('.editor');
  await page.getByLabel('Featured').check();
  await page.waitForTimeout(400);
  const theirs = JSON.parse(fake.readText('content/articles/art_built001.json'));
  theirs.template = 'edited-elsewhere';
  fake.externalCommit({ 'content/articles/art_built001.json': JSON.stringify(theirs, null, 2) });
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  // Publishing now fails safely because the branch moved.
  await page.click('#publish-button');
  await page.waitForSelector('.toast--error');
  assert.match(await page.locator('.toast--error').first().innerText(), /repository changed/);
  assert.equal(fake.readText('content/articles/art_built001.json').includes('edited-elsewhere'), true, 'their change is intact');
  await page.click('#reload-repo');
  await page.waitForSelector('[data-keep-mine]');
  assert.equal(await page.locator('#publish-button').isDisabled(), true, 'blocked until resolved');
  await shot('07-conflict');
  await page.click('[data-keep-mine]');
  assert.equal(await page.locator('#publish-button').isDisabled(), false);
  await page.click('#publish-button');
  await page.waitForSelector('#publish-success');
  assert.equal(JSON.parse(fake.readText('content/articles/art_built001.json')).featured, true);
});

// Builds the site from whatever the fake repository holds right now (the real build, admin left out).
async function buildFromRepository(name) {
  const { existsSync } = await import('node:fs');
  const contentDir = join(work, `${name}-content`);
  for (const [path, bytes] of fake.files()) {
    if (!path.startsWith('content/')) continue;
    const target = join(contentDir, path.slice('content/'.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const out = join(work, `${name}-dist`);
  const result = build({ content: contentDir, out, siteUrl: 'https://example.github.io/abdo', admin: false });
  assert.ok(result.ok, JSON.stringify(result.errors));
  return { out, has: (...segs) => existsSync(join(out, ...segs)) };
}
const publishNow = async (message) => {
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  await page.getByLabel('Description of this publish').fill(message);
  await page.click('#publish-button');
  await page.waitForSelector('#publish-success');
};

await step('a project and an article go live, are taken down (move to draft), and are deleted', async () => {
  // Create a project, mark it published, publish.
  await goto('#/projects');
  await page.click('#new-item');
  const dlg = modalOf();
  await dlg.getByLabel('Language').selectOption('en');
  await dlg.getByLabel('Title').fill('My E2E project');
  await dlg.getByLabel('Summary').fill('A project created by the browser test.');
  await dlg.locator('#create-confirm').click();
  await page.waitForSelector('.editor');
  const projectId = (await page.evaluate(() => location.hash)).split('/').pop();
  assert.match(projectId, /^prj_[0-9a-z]{8}$/);
  await page.click('#publish-translation');
  await page.waitForSelector('#unpublish');
  await publishNow('E2E project live');
  let site = await buildFromRepository('lifecycle-1');
  assert.ok(site.has('en', 'portfolio', 'my-e2e-project', 'index.html'), 'the project page exists once published');
  assert.ok(site.has('en', 'blog', 'my-e2e-article', 'index.html'), 'the article page exists');

  // Take both down: they stay in the repository as drafts, the pages disappear.
  await goto(`#/projects/${projectId}`);
  await page.waitForSelector('#unpublish');
  await page.click('#unpublish');
  await page.waitForSelector('#publish-translation');
  await goto(`#/articles/${newArticleId}`);
  await page.waitForSelector('#unpublish');
  await page.click('#unpublish');
  await page.waitForSelector('#publish-translation');
  await publishNow('E2E taken down');
  assert.equal(JSON.parse(fake.readText(`content/projects/${projectId}.json`)).status, 'draft');
  assert.equal(JSON.parse(fake.readText(`content/articles/${newArticleId}.json`)).translations.en.status, 'draft');
  site = await buildFromRepository('lifecycle-2');
  assert.ok(!site.has('en', 'portfolio', 'my-e2e-project', 'index.html'), 'the project page is gone');
  assert.ok(!site.has('en', 'blog', 'my-e2e-article', 'index.html'), 'the article page is gone');
  assert.ok(site.has('en', 'blog', 'welcome-to-abdo', 'index.html'), 'other pages are untouched');

  // Delete both: the files leave the repository; the build still passes.
  await goto(`#/projects/${projectId}`);
  await page.waitForSelector('#delete-item');
  await page.click('#delete-item');
  await modalOf().locator('button', { hasText: 'Delete' }).last().click();
  await page.waitForSelector('main table, main .empty, main h1');
  await goto(`#/articles/${newArticleId}`);
  await page.waitForSelector('#delete-item');
  await page.click('#delete-item');
  await modalOf().locator('button', { hasText: 'Delete' }).last().click();
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.equal(await page.locator('#publish-button').isDisabled(), false, 'deleting is a valid change');
  await publishNow('E2E deleted');
  assert.ok(!fake.files().has(`content/projects/${projectId}.json`), 'project file deleted in the repository');
  assert.ok(!fake.files().has(`content/articles/${newArticleId}.json`), 'article file deleted in the repository');
  await buildFromRepository('lifecycle-3');
});

await step('an invalid edit blocks publishing and points at the field', async () => {
  await goto('#/articles/art_built001');
  await page.waitForSelector('.editor');
  await page.getByLabel('URL slug').first().fill('Bad Slug!');
  await page.waitForSelector('.problems:not([hidden])');
  assert.match(await page.locator('.field--invalid .field__error').first().innerText(), /format/);
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.equal(await page.locator('#publish-button').isDisabled(), true);
  assert.match(await page.locator('#validation-card').innerText(), /translations\.(ar|en)\.slug/);
  await shot('08-invalid');
  page.once('dialog', () => {});
  await page.click('#discard-all');
  await modalOf().locator('button', { hasText: 'Discard' }).last().click();
  await page.waitForFunction(() => /Nothing unpublished/.test(document.querySelector('#staged-badge').textContent));
});

// ------------------------------------------------------------------------------------------------
// The Editorial Studio (Phase 3). These steps work on a published article (art_welcome1, English text).

const studioArticle = '#/articles/art_welcome1';
/** Throw away whatever a step left unpublished (nothing to do when undo already restored everything). */
async function discardAll() {
  await goto('#/publish');
  await page.waitForSelector('#discard-all');
  if (await page.locator('#discard-all').isDisabled()) return;
  await page.click('#discard-all');
  await modalOf().locator('button', { hasText: 'Discard' }).last().click();
  await page.waitForFunction(() => /Nothing unpublished/.test(document.querySelector('#staged-badge').textContent));
}
const blockIds = () => page.locator('.block').evaluateAll((els) => els.map((e) => e.dataset.blockId));
const blockTypes = () => page.locator('.block').evaluateAll((els) => els.map((e) => e.dataset.blockType));
const rawKeys = () => page.evaluate(() => {
  const found = [];
  const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent.trim(); if (/^[a-z][a-z0-9]*(_[a-z0-9-]+)+$/.test(t)) found.push(t); }
  for (const el of document.querySelectorAll('#app [aria-label], #app [title], #app [placeholder]')) for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v && /^[a-z][a-z0-9]*(_[a-z0-9-]+)+$/.test(v)) found.push(`${a}=${v}`); }
  return found;
});
const openStudio = async () => { await goto(studioArticle); await page.waitForSelector('.studio'); await page.locator('.studio__tabs').getByRole('tab').first().waitFor(); };
const firstParagraph = () => page.locator('.block[data-block-type=paragraph] textarea').first();
/** Drag a block's handle onto another block with real mouse movement (the quick `dragTo` is too fast for HTML drag and drop). */
async function dragBlock(from, onto) {
  await page.locator('.block').nth(from).evaluate((el) => { el.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -160, behavior: 'instant' }); });
  await page.waitForTimeout(300);
  const handle = await page.locator('.block').nth(from).locator('.block__handle').boundingBox();
  const target = await page.locator('.block').nth(onto).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 20, handle.y + 40, { steps: 5 });
  await page.mouse.move(target.x + 100, target.y + 12, { steps: 15 });
  await page.mouse.move(target.x + 100, target.y + 8, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

await step('studio: the toolbar formats the selection, and undo and redo work from the keyboard', async () => {
  await openStudio();
  assert.equal(await page.locator('.studio__tabs [role=tab]').count(), 6, 'six side panels');
  const ta = firstParagraph();
  const original = await ta.inputValue();
  await ta.click();
  await ta.press('Control+Home');
  for (let i = 0; i < 3; i += 1) await ta.press('Shift+ArrowRight');
  await page.locator('.block[data-block-type=paragraph]').first().locator('[data-format=bold]').click();
  assert.ok((await ta.inputValue()).startsWith('**'), 'bold markers were added around the selection');
  await page.keyboard.press('Control+z');
  assert.equal(await firstParagraph().inputValue(), original, 'undo restored the text');
  assert.equal(await page.locator('#studio-redo').isEnabled(), true);
  await page.keyboard.press('Control+Shift+z');
  assert.ok((await firstParagraph().inputValue()).startsWith('**'), 'redo brought the bold back');
  // Typing is undone as a whole phrase, not letter by letter, and the cursor stays in the field.
  await firstParagraph().press('End');
  await page.keyboard.type(' typed words');
  await page.keyboard.press('Control+z');
  assert.ok(!(await firstParagraph().inputValue()).includes('typed words'));
  assert.equal(await page.evaluate(() => document.activeElement.tagName), 'TEXTAREA', 'focus stays in the field');
  // Keyboard shortcuts for formatting (Ctrl+U underlines; physical keys, so they work on any keyboard layout).
  await firstParagraph().click();
  await firstParagraph().press('Control+Home');
  for (let i = 0; i < 3; i += 1) await firstParagraph().press('Shift+ArrowRight');
  await firstParagraph().press('Control+u');
  assert.ok((await firstParagraph().inputValue()).includes('++'), 'Ctrl+U underlined the selection');
  await discardAll();
});

await step('studio: all 21 block types can be added, each shows its own fields, and undo removes them', async () => {
  await openStudio();
  const start = (await blockIds()).length;
  const all = ['paragraph', 'heading', 'quote', 'list', 'checklist', 'definitions', 'code', 'table', 'image', 'gallery', 'compare', 'imagetext', 'callout', 'factbox', 'timeline', 'stats', 'related', 'author', 'footnotes', 'references', 'divider'];
  for (const type of all) await addBlock(type);
  assert.deepEqual((await blockTypes()).slice(start), all);
  for (const type of all.filter((t) => t !== 'divider')) {
    const controls = await page.locator(`.block[data-block-type=${type}]`).last().locator('textarea, input, select').count();
    assert.ok(controls > 0, `${type} shows fields`);
  }
  assert.deepEqual(await rawKeys(), [], 'no untranslated text in any block editor');
  await shot('12-studio-all-blocks');
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < all.length; i += 1) await page.keyboard.press('Control+z');
  assert.equal((await blockIds()).length, start, 'undo removed all of them');
  await discardAll();
});

await step('studio: blocks move by drag and drop and by keyboard, duplicate, hide and delete, each undoable', async () => {
  await openStudio();
  const before = await blockIds();
  // Collapsed cards are short, so the drag stays on screen; that is also what collapse is for.
  await page.locator('[data-action=collapse-all]').click();
  assert.equal(await page.locator('.block.is-collapsed').count(), before.length);
  assert.equal(await page.locator('.block__body:visible').count(), 0);
  await dragBlock(0, 2);
  const dragged = await blockIds();
  assert.deepEqual(dragged.slice(0, 3), [before[1], before[0], before[2]], 'the first block was dropped before the third, so it now follows the second');
  await page.locator('#studio-undo').click();
  assert.deepEqual(await blockIds(), before, 'undo restored the order');
  await page.locator('.block').nth(0).locator('.block__handle').focus();
  await page.keyboard.press('ArrowDown');
  assert.deepEqual((await blockIds()).slice(0, 2), [before[1], before[0]], 'the arrow key moved the block');
  await page.locator('#studio-undo').click();
  await page.locator('.block [data-action=duplicate]').first().click();
  assert.equal((await blockIds()).length, before.length + 1);
  assert.equal(new Set(await blockIds()).size, before.length + 1, 'the copy has its own id');
  await page.locator('.block [data-action=hide]').nth(1).click();
  assert.equal(await page.locator('.block.is-hidden').count(), 1);
  await page.locator('.block [data-action=delete]').first().click();
  assert.equal((await blockIds()).length, before.length);
  await page.locator('#studio-undo').click(); await page.locator('#studio-undo').click(); await page.locator('#studio-undo').click();
  assert.deepEqual(await blockIds(), before, 'three undos bring back the original blocks');
  assert.equal(await page.locator('.block.is-hidden').count(), 0);
  await page.locator('[data-action=expand-all]').click();
  assert.equal(await page.locator('.block.is-collapsed').count(), 0);
  await discardAll();
});

await step('studio: outline, writing checks and find and replace work on the real text', async () => {
  await openStudio();
  await page.getByRole('tab', { name: 'Outline' }).click();
  assert.ok(await page.locator('.outline__item').count() >= 1, 'outline lists the headings');
  await addBlock('paragraph');
  await page.locator('.block[data-block-type=paragraph] textarea').last().fill('alpha beta alpha gamma');
  await page.getByRole('tab', { name: 'Checks' }).click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('[data-panel=checks] .stats').innerText(), /Words/);
  await page.getByRole('tab', { name: 'Find' }).click();
  await page.locator('#find-query').fill('alpha');
  assert.match(await page.locator('[data-panel=find] [role=status]').innerText(), /2 matches/);
  await page.locator('#find-replacement').fill('omega');
  await page.click('#replace-all');
  await modalOf().locator('button', { hasText: 'Replace all' }).last().click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.block[data-block-type=paragraph] textarea').last().inputValue(), 'omega beta omega gamma');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('.block[data-block-type=paragraph] textarea').last().inputValue(), 'alpha beta alpha gamma', 'replace all is one undo step');
  await discardAll();
});

await step('studio: lists nest with the Indent button and Ctrl+], undo works, and the preview draws them nested', async () => {
  await openStudio();
  await addBlock('list');
  const list = page.locator('.block[data-block-type=list]').last();
  const box = list.locator('textarea').first();
  await box.fill('Fruit\nApples\nPears\nVegetables');
  // put the caret on "Apples" and indent it with the button
  await box.evaluate((el) => { const at = el.value.indexOf('Apples'); el.focus(); el.setSelectionRange(at, at); });
  await list.locator('[data-indent=in]').click();
  assert.equal(await box.inputValue(), 'Fruit\n  Apples\nPears\nVegetables');
  // Ctrl+] indents the next line; an item may be at most one level deeper than the line above it
  await box.evaluate((el) => { const at = el.value.indexOf('Pears'); el.focus(); el.setSelectionRange(at, at); });
  await page.keyboard.press('Control+BracketRight');
  assert.equal(await box.inputValue(), 'Fruit\n  Apples\n  Pears\nVegetables');
  await page.keyboard.press('Control+BracketRight');
  assert.equal(await box.inputValue(), 'Fruit\n  Apples\n    Pears\nVegetables', 'one level deeper than the line above is allowed');
  await page.keyboard.press('Control+BracketRight');
  assert.equal(await box.inputValue(), 'Fruit\n  Apples\n    Pears\nVegetables', 'two levels deeper is refused');
  await page.keyboard.press('Control+BracketLeft');
  assert.equal(await box.inputValue(), 'Fruit\n  Apples\n  Pears\nVegetables', 'Ctrl+[ outdents');
  // each indent step is its own undo step
  await page.keyboard.press('Control+z');
  assert.equal(await box.inputValue(), 'Fruit\n  Apples\n    Pears\nVegetables', 'undo brings the deeper level back');
  await box.evaluate((el) => { const at = el.value.indexOf('Pears'); el.focus(); el.setSelectionRange(at, at); });
  await page.keyboard.press('Control+BracketLeft');
  // the structure reaches the preview as real nested lists
  await page.locator('[data-mode=split]').click();
  const frame = page.frameLocator('.preview__frame');
  await frame.locator('li:has-text("Fruit") > ul > li:has-text("Apples")').first().waitFor({ timeout: 5000 });
  assert.equal(await frame.locator('li:has-text("Fruit") > ul > li').count(), 2, 'Apples and Pears are children of Fruit');
  await page.locator('[data-mode=write]').click();
  // a checklist item has a level control, and it is stored
  await addBlock('checklist');
  const check = page.locator('.block[data-block-type=checklist]').last();
  await check.locator('[data-add-item]').click();
  const levelSelects = check.locator('.group__item select');
  assert.equal(await levelSelects.count(), 2, 'each task has a level selector');
  await levelSelects.last().selectOption({ value: '1' }); // the labels are 1-based, the values 0-based
  assert.equal(await levelSelects.last().inputValue(), '1');
  await shot('14-studio-nested-list');
  await discardAll();
});
await step('focal point: set in the media library and from an image block, shown in samples, saved on the asset and drawn by the preview', async () => {
  // from the media library: drag on the picture, then fine-tune with the sliders
  await goto('#/media');
  await page.waitForSelector('[data-edit-focal]');
  await page.locator('[data-edit-focal]').first().click();
  await page.waitForSelector('.focal__stage');
  const box = await page.locator('.focal__image').boundingBox();
  assert.ok(box && box.width > 20, 'the picture is shown');
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
  assert.equal(await page.locator('#focal-x').inputValue(), '25');
  assert.equal(await page.locator('#focal-y').inputValue(), '75');
  assert.match(await page.locator('.focal [role=status]').innerText(), /25% from the left, 75% from the top/);
  assert.equal(await page.locator('.focal__sample-image').first().evaluate((el) => el.style.objectPosition), '25% 75%', 'the samples follow the point');
  await page.locator('#focal-x').fill('20');
  await shot('14b-focal-dialog');
  assert.match(await page.locator('.focal [role=status]').innerText(), /20% from the left/);
  await page.locator('#focal-save').click();
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  assert.match(await page.locator('.media-card').first().innerText(), /Focal point: 20% from the left, 75% from the top/);
  // cancel changes nothing
  await page.locator('[data-edit-focal]').first().click();
  await page.locator('#focal-reset').click();
  await page.locator('.modal__actions button', { hasText: 'Cancel' }).click();
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  assert.match(await page.locator('.media-card').first().innerText(), /Focal point: 20%/);
  // from an image block: the same asset, and the preview draws it with classes
  await openStudio();
  await addBlock('image');
  const imageBlock = page.locator('.block[data-block-type=image]').last();
  const firstChoice = await imageBlock.locator('select').first().evaluate((el) => [...el.options].find((o) => o.value)?.value);
  await imageBlock.locator('select').first().selectOption({ value: firstChoice });
  await imageBlock.locator('[data-edit-focal=mediaId]').click();
  await page.waitForSelector('.focal__stage');
  await page.locator('#focal-y').fill('10');
  await page.locator('#focal-save').click();
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  await page.locator('[data-mode=split]').click();
  const frame = page.frameLocator('.preview__frame');
  await frame.locator('img[class*="fx-"]').first().waitFor({ timeout: 5000 });
  const cls = await frame.locator('img[class*="fx-"]').first().getAttribute('class');
  assert.match(cls, /fx-\d+ fy-10/, cls);
  assert.equal(await frame.locator('img[style]').count(), 0, 'no inline styles in the preview');
  await shot('15-focal-point');
  await discardAll();
});
await step('pictures: paste, drop and the file button add a checked picture and an image block; text paste and bad files are left alone', async () => {
  await openStudio();
  const before = await page.locator('.block[data-block-type=image]').count();
  const png64 = PNG.toString('base64');
  const send = (kind, { name = 'screenshot.png', type = 'image/png', b64 = png64, text = null, target = null } = {}) => page.evaluate(({ kind, name, type, b64, text, target }) => {
    const dt = new DataTransfer();
    if (text !== null) dt.setData('text/plain', text);
    if (b64) dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type }));
    const where = target ? document.querySelector(target) : document.activeElement;
    const event = kind === 'paste' ? new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }) : new DragEvent(kind, { dataTransfer: dt, bubbles: true, cancelable: true });
    where.dispatchEvent(event);
    return event.defaultPrevented;
  }, { kind, name, type, b64, text, target });

  // a paste that carries text is left to the text box (nothing is taken over)
  await firstParagraph().click();
  assert.equal(await send('paste', { text: 'copied words' }), false, 'text and picture together: not intercepted');
  assert.equal(await page.locator('dialog.modal').count(), 0);
  // a picture alone is intercepted and opens the upload dialog, which wants a description in every language
  assert.equal(await send('paste'), true, 'a picture on the clipboard is taken');
  let dlg = modalOf();
  await dlg.waitFor();
  await dlg.locator('#upload-confirm').click();
  assert.match(await dlg.locator('.field__error:not([hidden])').innerText(), /required in every language/);
  await dlg.getByLabel('Image description (English)').fill('A pasted screenshot');
  await dlg.getByLabel('Image description (العربية)').fill('لقطة شاشة ملصقة');
  await dlg.locator('#upload-confirm').click();
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  assert.equal(await page.locator('.block[data-block-type=image]').count(), before + 1, 'an image block appeared');
  // it lands right after the block the cursor was in (the first one)
  assert.equal(await page.locator('.block').nth(1).getAttribute('data-block-type'), 'image');
  const chosen = await page.locator('.block').nth(1).locator('select').first().evaluate((el) => el.options[el.selectedIndex].textContent);
  assert.match(chosen, /screenshot\.png/, 'the block points at the new picture');
  // an undo removes the block (the library entry stays until the changes are discarded)
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('.block[data-block-type=image]').count(), before, 'undo removes the block');
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await page.locator('.block[data-block-type=image]').count(), before + 1, 'redo brings it back');

  // dropping something that is not a picture is refused with a message, and nothing opens
  await send('dragover', { name: 'notes.txt', type: 'text/plain', b64: Buffer.from('hello').toString('base64'), target: '.blocks__list' });
  await send('drop', { name: 'notes.txt', type: 'text/plain', b64: Buffer.from('hello').toString('base64'), target: '.blocks__list' });
  await page.waitForSelector('.toast--error');
  assert.match(await page.locator('.toast--error').last().innerText(), /Only PNG, JPEG, GIF and WebP/);
  // a file that claims to be a picture is inspected by content and refused
  await send('drop', { name: 'fake.png', type: 'image/png', b64: Buffer.from('<script>alert(1)</script>').toString('base64'), target: '.blocks__list' });
  await page.waitForFunction(() => [...document.querySelectorAll('.toast--error')].some((t) => /fake\.png/.test(t.textContent)));
  assert.equal(await page.locator('dialog.modal').count(), 0);

  // dropping a real picture on the first block puts the new image block before or after it, and cancel adds nothing
  const count = await page.locator('.block').count();
  await send('drop', { name: 'dropped.png', target: '.block' });
  dlg = modalOf();
  await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  assert.equal(await page.locator('.block').count(), count, 'cancel adds no block');

  // the button works for phones and keyboards
  await page.setInputFiles('#studio-image-input', { name: 'From Button.png', mimeType: 'image/png', buffer: PNG });
  dlg = modalOf();
  await dlg.waitFor();
  await dlg.getByLabel('Image description (English)').fill('From the button');
  await dlg.getByLabel('Image description (العربية)').fill('من الزر');
  await dlg.locator('#upload-confirm').click();
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  assert.equal(await page.locator('.block[data-block-type=image]').count(), before + 2);
  assert.equal(await page.locator('.block').last().getAttribute('data-block-type'), 'image', 'added at the end');
  await shot('16-pictures');
  // both pictures are in the library and staged for publishing
  await goto('#/media');
  assert.ok(await page.locator('.media-card', { hasText: 'screenshot.png' }).count() === 1);
  assert.ok(await page.locator('.media-card', { hasText: 'from-button.png' }).count() === 1);
  await discardAll();
});
await step('studio: a template adds an outline with placeholders, and publishing is blocked until they are replaced', async () => {
  await openStudio();
  const before = await blockIds();
  await page.click('#studio-templates');
  assert.equal(await modalOf().locator('.template').count(), 12);
  await modalOf().locator('[data-template=interview]').click();
  await page.click('#tpl-replace');
  await page.waitForTimeout(300);
  assert.notDeepEqual(await blockIds(), before);
  assert.equal(await page.locator('[data-path=template] select').inputValue(), 'interview', 'the article takes the template name');
  await page.waitForSelector('.problems:not([hidden])');
  assert.match(await page.locator('.problems').innerText(), /placeholder/);
  await page.locator('#studio-undo').click();
  assert.deepEqual(await blockIds(), before, 'one undo brings back the previous content');
  await page.waitForFunction(() => document.querySelector('.problems')?.hidden === true, null, { timeout: 3000 });
  await page.locator('#studio-redo').click();
  await page.waitForSelector('.problems:not([hidden])');
  await goto('#/publish'); await page.waitForSelector('#publish-button');
  assert.equal(await page.locator('#publish-button').isDisabled(), true, 'a placeholder blocks publishing');
  await discardAll();
});

await step('studio: the preview shows unpublished text in a sandboxed frame, per device and theme', async () => {
  await openStudio();
  await firstParagraph().fill('Preview marker sentence for the browser test.');
  await page.locator('[data-mode=split]').click();
  await page.waitForSelector('.preview__frame');
  assert.equal(await page.locator('.preview__frame').getAttribute('sandbox'), 'allow-same-origin', 'no scripts can run in the frame');
  const frame = page.frameLocator('.preview__frame');
  await frame.locator('text=Preview marker sentence for the browser test.').first().waitFor({ timeout: 5000 });
  await firstParagraph().fill('Second marker after a further edit.');
  await frame.locator('text=Second marker after a further edit.').first().waitFor({ timeout: 5000 });
  const widths = {};
  for (const device of ['phone', 'tablet', 'desktop']) {
    await page.locator(`[data-device=${device}]`).click();
    await page.waitForTimeout(150);
    widths[device] = await page.evaluate(() => document.querySelector('.preview__stage').getBoundingClientRect().width);
  }
  assert.ok(widths.phone < widths.tablet || widths.tablet <= widths.desktop, JSON.stringify(widths));
  await page.locator('[data-theme=dark]').click();
  let theme = null;
  for (let i = 0; i < 30 && theme !== 'dark'; i += 1) { await page.waitForTimeout(100); theme = await frame.locator('html').getAttribute('data-theme', { timeout: 1000 }).catch(() => null); }
  assert.equal(theme, 'dark', 'the frame was redrawn in the dark theme');
  await page.locator('[data-mode=preview]').click();
  assert.equal(await firstParagraph().isVisible(), false, 'preview-only hides the writing area');
  assert.ok(fontRequests > 0, 'the preview asks Google Fonts for the language fonts (allowed by the admin CSP)');
  await shot('13-studio-preview');
  await page.locator('[data-mode=write]').click();
  assert.equal(await firstParagraph().isVisible(), true);
  await discardAll();
});

await step('studio: focus mode hides everything but the text and Esc leaves it', async () => {
  await openStudio();
  await page.click('#studio-focus');
  assert.equal(await page.locator('.topbar').isVisible(), false);
  assert.equal(await page.locator('.studio__side').isVisible(), false);
  assert.equal(await page.locator('.studio__bar').isVisible(), true);
  await shot('14-studio-focus');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.topbar').isVisible(), true);
  assert.equal(await page.locator('body.studio-focus').count(), 0);
});

await step('studio: the typography panel edits the language settings and the preview follows', async () => {
  await openStudio();
  await page.getByRole('tab', { name: 'Typography' }).click();
  await page.locator('[data-mode=split]').click();
  await page.waitForSelector('.preview__frame');
  const size = page.locator('[data-panel=typography] .field', { hasText: 'Body text size' }).locator('input');
  await size.fill('14px');
  await page.waitForTimeout(300);
  assert.match(await badge().innerText(), /1 unpublished/, 'config/languages.json is a staged change');
  assert.ok(await page.locator('[data-panel=typography] [data-issue=small_text]').count() === 1, 'advice warns about small text');
  await size.fill('20px');
  await page.waitForTimeout(900);
  const fs = await page.frameLocator('.preview__frame').locator('html').evaluate((el) => getComputedStyle(el).getPropertyValue('--fs-base').trim());
  assert.equal(fs, '20px', 'the preview uses the new size');
  await shot('15-studio-typography');
  await page.click('#typography-revert');
  await modalOf().locator('button', { hasText: 'Discard typography changes' }).last().click();
  await page.waitForFunction(() => /Nothing unpublished/.test(document.querySelector('#staged-badge').textContent));
});

await step('typography for this page only: four settings on the record, range-checked, drawn by the preview with classes, resettable', async () => {
  await openStudio();
  await page.getByRole('tab', { name: 'Typography' }).click();
  await page.locator('button[data-mode=split]').click();
  const frame = page.frameLocator('.preview__frame');
  await frame.locator('article.article').waitFor({ timeout: 5000 });
  const sizeOf = () => frame.locator('article.article').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.waitForTimeout(1000); // the preview redraws after the previous step's revert
  const base = await sizeOf();
  const section = page.locator('[data-panel=override]');
  const box = (label) => section.locator('.field', { hasText: label }).locator('input, select').first();
  // out of range is refused with a message and nothing is stored
  await box('Text size').fill('300');
  assert.match(await section.locator('.field__error:not([hidden])').innerText(), /between 85 and 130/);
  assert.match(await badge().innerText(), /Nothing unpublished|all published/i);
  // a valid value is stored on the article and drawn
  await box('Text size').fill('120');
  await box('Line height').fill('1.9');
  await box('Heading weight').selectOption({ value: '800' });
  await page.waitForTimeout(900);
  assert.match(await badge().innerText(), /1 unpublished/, 'the article file is a staged change');
  const cls = await frame.locator('article.article').getAttribute('class');
  assert.match(cls, /ov-size-120/); assert.match(cls, /ov-lh-19/); assert.match(cls, /ov-weight-800/);
  const bigger = await sizeOf();
  assert.ok(Math.abs(bigger / base - 1.2) < 0.02, `text is 120% (${base} → ${bigger})`);
  assert.equal(await frame.locator('article.article [style]').count(), 0, 'no inline styles');
  await shot('15b-typography-override');
  // reset returns to the language settings
  await section.locator('#override-reset').click();
  await page.waitForTimeout(900);
  assert.doesNotMatch(await frame.locator('article.article').getAttribute('class'), /ov-/);
  assert.ok(Math.abs((await sizeOf()) - base) < 0.01);
  await discardAll();
});
await step('scheduling: a draft translation can be scheduled for a future time, is checked like published content, and the schedule can be cancelled', async () => {
  await goto('#/articles');
  await page.click('#new-item');
  const dlg = modalOf();
  await dlg.getByLabel('Language').selectOption('en');
  await dlg.getByLabel('Title').fill('Scheduled E2E article');
  await dlg.getByLabel('Excerpt').fill('Written by the browser test to be scheduled.');
  await dlg.locator('#create-confirm').click();
  await page.waitForSelector('.editor');
  // a past time is refused
  await page.click('#schedule-translation');
  await page.locator('#schedule-when').fill('2020-01-01T09:00');
  await page.click('#schedule-confirm');
  assert.match(await modalOf().locator('.field__error:not([hidden])').innerText(), /future/);
  await page.locator('#schedule-when').fill('2031-03-05T09:00');
  await page.click('#schedule-confirm');
  await page.waitForSelector('#schedule-info');
  assert.match(await page.locator('#schedule-info').innerText(), /Scheduled for .*2031/);
  assert.match(await page.locator('.translation__head .chip').first().innerText(), /Scheduled/);
  // it is held to the published standard: an empty body is an error until there is a block
  await page.waitForFunction(() => document.querySelector('.problems:not([hidden])'), null, { timeout: 5000 });
  assert.match(await page.locator('.problems').innerText(), /body/i);
  await addBlock('paragraph');
  await page.locator('.block[data-block-type=paragraph] textarea').first().fill('The body that makes it ready to go.');
  await page.waitForFunction(() => !document.querySelector('.problems:not([hidden])'), null, { timeout: 5000 });
  assert.match(await badge().innerText(), /unpublished/);
  await shot('17-scheduled');
  // the record carries the schedule: leave the editor and come back (the token lives in memory, so no page reload)
  const hash = await page.evaluate(() => location.hash);
  await goto('#/articles');
  await goto(hash);
  await page.waitForSelector('#schedule-info');
  assert.match(await page.locator('#schedule-info').innerText(), /2031/);
  // cancelling returns it to a draft
  await page.click('#schedule-cancel');
  await page.waitForSelector('#schedule-translation');
  assert.match(await page.locator('.translation__head .chip').first().innerText(), /Draft/);
  assert.equal(await page.locator('#schedule-info').count(), 0);
  await discardAll();
});
await step('internal notes: written in Settings, kept on the record, never drawn by the preview', async () => {
  await openStudio();
  await page.getByRole('tab', { name: 'Settings' }).click();
  const notes = page.locator('[data-path=internalNotes] textarea');
  await notes.waitFor();
  assert.match(await page.locator('[data-path=internalNotes] .field__hint').innerText(), /never shown on the site.*anyone who can read the repository/);
  await notes.fill('E2E-NOTE-77: check the figures with the source before publishing');
  await page.waitForTimeout(400);
  assert.match(await badge().innerText(), /1 unpublished/);
  await page.locator('button[data-mode=split]').click();
  const frame = page.frameLocator('.preview__frame');
  await frame.locator('article.article').waitFor({ timeout: 5000 });
  await page.waitForTimeout(700);
  assert.ok(!(await frame.locator('html').innerHTML()).includes('E2E-NOTE-77'), 'the preview does not show the notes');
  // a credential-looking note is warned about, not blocked
  await notes.fill('token: abcdef123456');
  await page.waitForFunction(() => /password or token/.test(document.querySelector('.problems')?.textContent ?? ''), null, { timeout: 5000 });
  // emptying the box removes the field from the record
  await notes.fill('');
  await page.waitForFunction(() => !/password or token/.test(document.querySelector('.problems')?.textContent ?? ''), null, { timeout: 5000 });
  await discardAll();
});
await step('studio: history lists the commits of the file, compares word by word and restores', async () => {
  await openStudio();
  const original = await firstParagraph().inputValue();
  await firstParagraph().fill('Version one of the opening paragraph.');
  await publishNow('E2E studio history one');
  await openStudio();
  await firstParagraph().fill('Version two of the opening paragraph.');
  await publishNow('E2E studio history two');
  await openStudio();
  await firstParagraph().fill('Version three, not published yet.');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.click('#load-history');
  await page.waitForSelector('.history__list li');
  assert.ok(await page.locator('.history__list li').count() >= 3, 'the published commits are listed');
  await page.locator('.history__list [data-commit]', { hasText: 'E2E studio history one' }).click();
  await page.waitForSelector('.history__compare');
  const compare = page.locator('.history__compare');
  assert.match(await compare.innerText(), /Changed 1/);
  assert.ok(await compare.locator('ins').count() > 0 && await compare.locator('del').count() > 0, 'added and removed words are marked');
  await shot('16-studio-history');
  await page.locator('[data-restore=body]').click();
  await modalOf().locator('button', { hasText: 'Restore' }).last().click();
  await page.waitForTimeout(200);
  assert.equal(await firstParagraph().inputValue(), 'Version one of the opening paragraph.', 'the old text is back');
  await page.locator('#studio-undo').click();
  assert.equal(await firstParagraph().inputValue(), 'Version three, not published yet.', 'a restore is one undo step');
  assert.ok(original.length > 0);
  await discardAll();
});

await step('studio: every panel, mode and tab in both languages shows translated text, and stays within phone width', async () => {
  const tabs = ['Settings', 'Outline', 'Checks', 'Find', 'History', 'Typography'];
  await openStudio();
  for (const name of tabs) { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(80); assert.deepEqual(await rawKeys(), [], `English panel ${name}`); }
  await page.click('#lang-toggle');
  await page.waitForSelector('html[dir=rtl] .studio');
  const tabButtons = page.locator('.studio__tabs [role=tab]');
  for (let i = 0; i < await tabButtons.count(); i += 1) { await tabButtons.nth(i).click(); await page.waitForTimeout(80); assert.deepEqual(await rawKeys(), [], `Arabic panel ${i}`); }
  for (const mode of ['split', 'preview', 'write']) { await page.locator(`[data-mode=${mode}]`).click(); await page.waitForTimeout(500); assert.deepEqual(await rawKeys(), [], `Arabic mode ${mode}`); }
  await page.locator('.studio__tabs [role=tab]').first().click();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.studio__tabs [role=tab][aria-selected=true]').getAttribute('data-tab'), 'outline', 'in right-to-left the left arrow goes forward');
  await page.click('#studio-templates');
  assert.deepEqual(await rawKeys(), [], 'Arabic template dialog');
  await modalOf().locator('button').last().click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const mode of ['split', 'preview', 'write']) {
    await page.locator(`[data-mode=${mode}]`).click(); await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${mode} mode overflows by ${overflow}px at phone width`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#lang-toggle');
  await page.waitForSelector('html[dir=ltr] .studio');
});

// ------------------------------------------------------------------------------------------------
// Customization (Phase 4): the Homepage Builder and the Appearance Studio.

const sectionTypes = () => page.locator('.sect').evaluateAll((els) => els.map((e) => e.dataset.sectionType));
const sectionIds = () => page.locator('.sect').evaluateAll((els) => els.map((e) => e.dataset.sectionId));
/** Drag a section's handle onto another section with real mouse movement. */
async function dragSection(from, onto) {
  await page.locator('.sect').nth(from).evaluate((el) => { el.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy({ top: -160, behavior: 'instant' }); });
  await page.waitForTimeout(250);
  const handle = await page.locator('.sect').nth(from).locator('.sect__handle').boundingBox();
  const target = await page.locator('.sect').nth(onto).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 20, handle.y + 40, { steps: 5 });
  await page.mouse.move(target.x + 100, target.y + target.height - 6, { steps: 15 });
  await page.mouse.move(target.x + 100, target.y + target.height - 4, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const homeFrame = () => page.frameLocator('.homepage__preview .preview__frame');

await step('homepage builder: add, hide, duplicate, reorder by keyboard and by drag, delete; the preview follows', async () => {
  await goto('#/homepage');
  await page.waitForSelector('.sect');
  assert.deepEqual(await sectionTypes(), ['featured', 'articles', 'topics', 'projects', 'highlights', 'follow']);
  await page.locator('.sect__add select').selectOption('latest_articles');
  await page.click('#hp-add');
  assert.deepEqual(await sectionTypes(), ['featured', 'articles', 'topics', 'projects', 'highlights', 'follow', 'articles']);
  assert.match(await badge().innerText(), /1 unpublished/);
  await page.waitForFunction(() => document.querySelector('.homepage__preview .preview__frame')?.contentDocument?.querySelectorAll('.section--articles').length === 2, null, { timeout: 8000 });
  // hide the highlights section: the stored section stays, the page stops drawing it
  const followId = (await sectionIds())[4];
  await page.locator(`[data-section-enabled="${followId}"]`).uncheck();
  assert.equal(await page.locator('.sect.is-hidden').count(), 1);
  await page.waitForFunction(() => document.querySelector('.homepage__preview .preview__frame')?.contentDocument?.querySelector('.section--highlights') === null, null, { timeout: 8000 });
  // duplicate the highlights section, then delete the copy
  const highlightsId = (await sectionIds())[4];
  await page.locator(`[data-section-duplicate="${highlightsId}"]`).click();
  assert.equal((await sectionTypes()).filter((t) => t === 'highlights').length, 2);
  const copyId = (await sectionIds())[5];
  assert.notEqual(copyId, highlightsId);
  await page.locator(`[data-section-delete="${copyId}"]`).click();
  assert.deepEqual(await sectionTypes(), ['featured', 'articles', 'topics', 'projects', 'highlights', 'follow', 'articles']);
  // keyboard: the handle moves a section with the arrow keys
  await page.locator('.sect').nth(1).locator('.sect__handle').focus();
  await page.keyboard.press('ArrowDown');
  assert.deepEqual((await sectionTypes()).slice(0, 3), ['featured', 'topics', 'articles']);
  await page.keyboard.press('ArrowUp');
  assert.deepEqual((await sectionTypes()).slice(0, 3), ['featured', 'articles', 'topics']);
  // the arrow buttons work too, and the first cannot go up
  assert.equal(await page.locator('.sect').first().getByRole('button', { name: 'Move up' }).isDisabled(), true);
  // drag and drop: the second section is dropped below the fourth
  const before = await sectionIds();
  await dragSection(1, 3);
  const after = await sectionIds();
  assert.equal(after[3], before[1], 'dropping below the fourth section puts the dragged one fourth');
  assert.deepEqual(after.filter((id) => id !== before[1]), before.filter((id) => id !== before[1]), 'the others keep their order');
  await shot('20-homepage-builder');
});

await step('homepage builder: a section\'s settings are the ones its kind really has, and invalid values are not accepted', async () => {
  const id = (await sectionIds())[2];
  const articleId = (await page.locator('.sect[data-section-type=articles]').first().getAttribute('data-section-id'));
  assert.ok(id && articleId);
  await page.locator(`[data-section-toggle="${articleId}"]`).click();
  const settings = page.locator(`.sect[data-section-id="${articleId}"] .sect__settings`);
  await settings.waitFor();
  const limit = settings.locator('[data-section-limit]');
  await limit.fill('99');
  await limit.blur();
  assert.equal(await limit.inputValue(), '12', 'the limit is held to the allowed range and the field shows what was kept');
  await limit.fill('0');
  await limit.blur();
  assert.equal(await limit.inputValue(), '1');
  assert.equal(await settings.getByText('Layout').count() > 0, true);
});

await step('homepage builder: copying the structure from the other language replaces this one and gives new ids', async () => {
  const before = await sectionIds();
  await page.locator('[data-from]').click();
  await modalOf().locator('button').last().click();
  await page.waitForTimeout(150);
  assert.deepEqual(await sectionTypes(), ['featured', 'articles', 'projects', 'topics', 'highlights', 'follow']);
  const after = await sectionIds();
  assert.equal(after.filter((id) => before.includes(id)).length, 0, 'every copied section has a fresh id');
  await discardAll();
});

await step('homepage changes publish as one commit and the real build draws them', async () => {
  await goto('#/homepage');
  await page.waitForSelector('.sect');
  await page.locator('.sect__add select').selectOption('latest_articles');
  await page.click('#hp-add');
  const hiddenId = (await sectionIds())[4];
  await page.locator(`[data-section-enabled="${hiddenId}"]`).uncheck();
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.deepEqual(await page.locator('[data-rel]').evaluateAll((els) => els.map((e) => e.dataset.rel)), ['config/homepage.json']);
  assert.match(await page.locator('#validation-card h2').innerText(), /Everything is valid/);
  await publishNow('E2E homepage');
  const site = await buildFromRepository('homepage');
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(join(site.out, 'en', 'index.html'), 'utf8');
  assert.equal(html.match(/section--articles/g).length, 2, 'the added section is drawn');
  assert.doesNotMatch(html, /section--highlights/);
  assert.match(readFileSync(join(site.out, 'ar', 'index.html'), 'utf8'), /section--highlights/, 'the Arabic homepage is untouched');
});

const designOf = () => JSON.parse(fake.readText('content/config/design.json'));
const presetKeys = () => page.locator('.preset').evaluateAll((els) => els.map((e) => e.dataset.presetKey));
const frameVar = (name) => page.frameLocator('.appearance__preview .preview__frame').locator('html').evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

await step('appearance: choosing a preset changes only the preset, and the preview shows its colours', async () => {
  await goto('#/appearance');
  await page.waitForSelector('.preset');
  assert.equal((await presetKeys()).length, 8);
  assert.equal(await page.locator('.preset.is-active').getAttribute('data-preset-key'), 'editorial-magazine');
  await page.locator('[data-preset-use=classic-newspaper]').click();
  assert.equal(await page.locator('.preset.is-active').getAttribute('data-preset-key'), 'classic-newspaper');
  await page.waitForSelector('.appearance__preview .preview__frame');
  await page.waitForTimeout(900);
  const presets = JSON.parse(fake.readText('content/config/presets.json')).items;
  const expected = presets.find((p) => p.key === 'classic-newspaper').tokens.light.bg;
  assert.equal((await frameVar('--bg')).toLowerCase(), expected.toLowerCase());
  assert.match(await badge().innerText(), /1 unpublished/);
  await shot('21-appearance-look');
});

await step('appearance: an unreadable colour is flagged, blocks publishing, and Fix repairs it keeping the hue', async () => {
  const hex = page.locator('[data-hex="light.text"]');
  await hex.fill('#dddddd');
  await hex.blur();
  await page.waitForSelector('.contrast__row--error');
  assert.ok(await page.locator('.contrast__row--error').count() >= 1);
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.equal(await page.locator('#publish-button').isDisabled(), true, 'an unreadable colour cannot be published');
  await goto('#/appearance');
  await page.waitForSelector('.contrast__row--error');
  await page.locator('[data-contrast-fix]').first().click();
  await page.waitForSelector('#ap-contrast-ok');
  const text = await page.locator('[data-hex="light.text"]').inputValue();
  assert.notEqual(text, '#dddddd');
  assert.match(text, /^#[0-9a-f]{6}$/);
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.equal(await page.locator('#publish-button').isDisabled(), false);
  await goto('#/appearance');
});

await step('appearance: save the look as your own preset, rename it, use it, and delete it (never the one in use)', async () => {
  await page.waitForSelector('#ap-save-preset');
  await page.click('#ap-save-preset');
  await page.locator('#preset-name-en').fill('My E2E Look');
  await page.locator('#preset-name-ar').fill('مظهري');
  await page.click('#preset-name-save');
  await page.waitForSelector('[data-preset-key=my-e2e-look]');
  assert.equal((await presetKeys()).length, 9);
  assert.equal(await page.locator('[data-preset-key=my-e2e-look] .chip').count() >= 1, true);
  assert.equal(await page.locator('[data-preset-key=classic-newspaper] [data-preset-delete]').count(), 0, 'shipped presets cannot be deleted');
  await page.locator('[data-preset-rename=my-e2e-look]').click();
  await page.locator('#preset-name-en').fill('My E2E Look 2');
  await page.click('#preset-name-save');
  await page.waitForFunction(() => /My E2E Look 2/.test(document.querySelector('[data-preset-key=my-e2e-look]')?.textContent ?? ''));
  await page.locator('[data-preset-use=my-e2e-look]').click();
  assert.equal(await page.locator('.preset.is-active').getAttribute('data-preset-key'), 'my-e2e-look');
  assert.equal(await page.locator('[data-preset-delete=my-e2e-look]').count() >= 0, true);
  await page.locator('[data-preset-delete=my-e2e-look]').click();
  await page.waitForTimeout(150);
  assert.equal((await presetKeys()).length, 9, 'the preset in use was not deleted');
  await page.locator('[data-preset-use=minimal-portfolio]').click();
  await page.locator('[data-preset-delete=my-e2e-look]').click();
  await modalOf().locator('button').last().click();
  await page.waitForFunction(() => document.querySelectorAll('.preset').length === 8);
  assert.deepEqual(await page.locator('#ap-colors').count(), 1);
  await discardAll();
});

await step('appearance: Glass Mode settings are range-checked and a glass level that may be hard to read is warned about', async () => {
  await goto('#/appearance');
  await page.getByRole('tab', { name: 'Glass' }).click();
  const blur = page.locator('[data-glass="light.blur"]');
  await blur.fill('999');
  await blur.blur();
  assert.equal(await blur.inputValue(), '60', 'the blur is held to the allowed range and the field shows what was kept');
  const opacity = page.locator('[data-glass="light.opacity"]');
  await opacity.fill('0');
  await opacity.blur();
  await page.waitForTimeout(150);
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.match(await page.locator('#validation-card').innerText(), /Glass Mode can make it hard to read/, 'fully clear glass is warned about');
  assert.equal(await page.locator('#publish-button').isDisabled(), false, 'a warning does not block publishing: what is behind the glass is not known');
  await goto('#/appearance');
  await page.getByRole('tab', { name: 'Glass' }).click();
  await page.click('#glass-defaults');
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  await page.waitForFunction(() => !/Glass Mode can make it hard to read/.test(document.querySelector('#validation-card')?.innerText ?? 'x'), null, { timeout: 5000 });
  await discardAll();
});

await step('appearance: layout settings are checked, stored per language, and the real build draws them', async () => {
  await goto('#/appearance');
  await page.getByRole('tab', { name: 'Layout' }).click();
  await page.waitForSelector('[data-layout="contentWidth"]');
  const width = page.locator('[data-layout="contentWidth"]');
  await width.fill('wide');
  await width.blur();
  await page.waitForSelector('[data-layout="contentWidth"] ~ .inline-error:not([hidden])');
  await width.fill('70rem');
  await width.blur();
  await page.locator('[data-layout="header"]').selectOption('centered');
  await page.locator('[data-layout="footer"]').selectOption('minimal');
  await page.locator('[data-layout="devices.mobile.columns"]').selectOption('1');
  await page.locator('[data-layout="breakpoints.tablet"]').fill('500');
  await page.locator('[data-layout="breakpoints.tablet"]').blur();
  await page.waitForSelector('p.inline-error:not([hidden])');
  await page.locator('[data-layout="breakpoints.tablet"]').fill('900');
  await page.locator('[data-layout="breakpoints.tablet"]').blur();
  await shot('24-appearance-layout');
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.deepEqual(await page.locator('[data-rel]').evaluateAll((els) => els.map((e) => e.dataset.rel)), ['config/languages.json']);
  assert.equal(await page.locator('#publish-button').isDisabled(), false);
  await publishNow('E2E layout');
  const site = await buildFromRepository('layout');
  const { readFileSync } = await import('node:fs');
  const english = readFileSync(join(site.out, 'en', 'index.html'), 'utf8');
  const arabic = readFileSync(join(site.out, 'ar', 'index.html'), 'utf8');
  assert.match(english, /data-header="centered"/);
  assert.match(english, /data-footer="minimal"/);
  assert.match(arabic, /data-header="classic"/, 'the other language keeps its own layout');
});

await step('appearance: fonts come from a list, Arabic gets Arabic fonts, and system fonts load nothing from Google', async () => {
  await goto('#/appearance');
  await page.getByRole('tab', { name: 'Typography' }).click();
  await page.waitForSelector('[data-font=heading]');
  const arabicTab = page.getByRole('tab', { name: 'العربية' });
  await arabicTab.click();
  const options = await page.locator('[data-font=heading] option').evaluateAll((els) => els.map((e) => e.value));
  assert.ok(options.includes('cairo') && !options.includes('inter'), `Arabic offers Arabic and system fonts only (${options})`);
  assert.equal(await page.locator('[data-type=letterSpacing]').isDisabled(), true, 'letter spacing is locked for right-to-left text');
  await page.locator('[data-font=heading]').selectOption('system-sans');
  await page.locator('[data-font=body]').selectOption('system-sans');
  assert.match(await page.locator('#ap-font-status').innerText(), /no|without|nothing/i);
  await page.getByRole('tab', { name: 'English' }).click();
  await page.locator('[data-font=heading]').selectOption('lora');
  assert.match(await page.locator('#ap-font-status').innerText(), /Google/);
  await page.locator('[data-type=baseSize]').fill('big');
  await page.locator('[data-type=baseSize]').blur();
  await page.waitForSelector('[data-type=baseSize] ~ .inline-error:not([hidden])');
  await page.locator('[data-type=baseSize]').fill('17px');
  await page.locator('[data-type=baseSize]').blur();
  await shot('22-appearance-type');
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  await publishNow('E2E fonts');
  const site = await buildFromRepository('fonts');
  const { readFileSync } = await import('node:fs');
  const arabic = readFileSync(join(site.out, 'ar', 'index.html'), 'utf8');
  const english = readFileSync(join(site.out, 'en', 'index.html'), 'utf8');
  assert.doesNotMatch(arabic, /fonts\.googleapis\.com/, 'Arabic now uses system fonts only');
  assert.match(english, /fonts\.googleapis\.com/);
});

await step('the new screens show no untranslated keys in either language and stay within phone width', async () => {
  for (const route of ['homepage', 'appearance']) {
    await goto(`#/${route}`);
    await page.waitForTimeout(200);
    if (route === 'appearance') for (const name of ['Look', 'Glass', 'Layout', 'Typography']) { await page.getByRole('tab', { name }).click(); await page.waitForTimeout(60); assert.deepEqual(await rawKeys(), [], `English ${route} ${name}`); }
    assert.deepEqual(await rawKeys(), [], `English ${route}`);
  }
  await page.click('#lang-toggle');
  await page.waitForSelector('html[dir=rtl]');
  for (const route of ['homepage', 'appearance']) {
    await goto(`#/${route}`);
    await page.waitForTimeout(250);
    if (route === 'appearance') { const tabButtons = page.locator('.appearance__controls [role=tab]'); for (let i = 0; i < await tabButtons.count(); i += 1) { await tabButtons.nth(i).click(); await page.waitForTimeout(60); assert.deepEqual(await rawKeys(), [], `Arabic ${route} tab ${i}`); } }
    assert.deepEqual(await rawKeys(), [], `Arabic ${route}`);
    await shot(`23-arabic-${route}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['homepage', 'appearance']) {
    await goto(`#/${route}`);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) console.log('WIDE', route, await page.evaluate(() => [...document.querySelectorAll('#app *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 || e.getBoundingClientRect().left < -1).slice(0, 8).map((e) => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`)));
    assert.ok(overflow <= 1, `${route} overflows by ${overflow}px at phone width`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#lang-toggle');
  await page.waitForSelector('html[dir=ltr]');
});

await step('Arabic interface: right-to-left, translated, no untranslated keys on any screen', async () => {
  await page.click('#lang-toggle');
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ar');
  for (const route of ['overview', 'articles', 'articles/art_welcome1', 'projects', 'projects/prj_archive1', 'profile', 'media', 'publish']) {
    await goto(`#/${route}`);
    await page.waitForTimeout(150);
    const raw = await page.evaluate(() => {
      const found = [];
      const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent.trim(); if (/^[a-z][a-z0-9]*(_[a-z0-9-]+)+$/.test(t)) found.push(t); }
      return found;
    });
    assert.deepEqual(raw, [], `raw keys on ${route}`);
  }
  await goto('#/overview');
  assert.match(await page.locator('main h1').innerText(), /نظرة عامة/);
  await shot('09-arabic-overview');
  await goto('#/articles/art_welcome1');
  await page.waitForSelector('.editor');
  await shot('10-arabic-editor');
  await page.click('#lang-toggle');
  await goto('#/overview');
});

await step('screens in English also show no untranslated keys', async () => {
  for (const route of ['overview', 'articles', 'articles/art_welcome1', 'projects/prj_archive1', 'profile', 'media', 'homepage', 'appearance', 'publish']) {
    await goto(`#/${route}`);
    await page.waitForTimeout(120);
    const raw = await page.evaluate(() => {
      const found = [];
      const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent.trim(); if (/^[a-z][a-z0-9]*(_[a-z0-9-]+)+$/.test(t)) found.push(t); }
      return found;
    });
    assert.deepEqual(raw, [], `raw keys on ${route}`);
  }
});

await step('no horizontal scrolling at phone width on any screen', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['overview', 'articles', 'articles/art_welcome1', 'projects/prj_archive1', 'profile', 'media', 'homepage', 'appearance', 'publish']) {
    await goto(`#/${route}`);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${route} overflows by ${overflow}px`);
  }
  await goto('#/articles/art_welcome1');
  await shot('11-mobile-editor');
  await page.setViewportSize({ width: 1280, height: 900 });
});

await step('signing out clears the session token and returns to sign-in', async () => {
  await page.click('#logout');
  await page.waitForSelector('form.login');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('abdo.admin.token')), null);
});

await step('the browser reported no errors, warnings or CSP violations', async () => {
  const relevant = problems.filter((p) => !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(p));
  assert.deepEqual(relevant, []);
});

await cleanup();
console.log(`\nAdmin end-to-end: ${stepNo} steps passed.`);
