// End-to-end test of the Phase 5 admin screens in a real browser (Chromium via Playwright): Topic Manager, Tag
// Manager, Search settings with its test box, and the Navigation manager. Like tests/e2e/admin.e2e.mjs it talks to a
// local fake of the GitHub API and finishes by building the site from what was published, with the real build.
// Run with:  node tests/e2e/discovery-admin.e2e.mjs   (exits with a notice if Playwright is not installed)

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

const work = mkdtempSync(join(tmpdir(), 'abdo-disc-e2e-'));
const distDir = join(work, 'dist');
mkdirSync(distDir);
const fake = await startFakeGitHub({ seedDir: join(ROOT, 'content') });
const server = createStaticServer(distDir);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
assert.ok(build({ out: distDir, siteUrl: base, adminApiBase: fake.url }).ok, 'the site builds with the admin included');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
const page = await context.newPage();
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

let stepNo = 0;
async function cleanup() { await browser.close(); await fake.close(); server.close(); rmSync(work, { recursive: true, force: true }); }
async function step(name, fn) {
  stepNo += 1;
  try { await fn(); console.log(`  ok  ${String(stepNo).padStart(2)}  ${name}`); } catch (error) {
    console.log(`FAIL  ${String(stepNo).padStart(2)}  ${name}\n${error.stack ?? error}`);
    console.log('problems panel:', await page.locator('.problems').allInnerTexts().catch(() => '?'));
    console.log('preview message:', await page.locator('.preview__message').first().innerText().catch(() => '(none)'), '| frame h1:', await page.evaluate(() => document.querySelector('.preview__frame')?.contentDocument?.querySelector('h1')?.textContent).catch(() => '?'));
    if (problems.length) console.log(`browser problems:\n  ${problems.join('\n  ')}`);
    await page.screenshot({ path: join(SHOTS ?? work, 'failure-discovery.png'), fullPage: true }).catch(() => {});
    await cleanup(); process.exit(1);
  }
}
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }); };
const goto = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(120); };
const badge = () => page.locator('#staged-badge');
const rawKeys = () => page.evaluate(() => {
  const found = [];
  const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const t = n.textContent.trim(); if (/^[a-z][a-z0-9]*(_[a-z0-9-]+)+$/.test(t) || t === 'null' || t === 'undefined' || t === '[object Object]' || t === 'NaN') found.push(t); }
  return found;
});
const modal = () => page.locator('dialog.modal');
const rowIds = (selector) => page.locator(selector).evaluateAll((rows) => rows.map((r) => r.dataset.id));
const idOfRow = async (hash, name) => {
  const row = page.locator(`${hash} tbody tr`, { hasText: name });
  return row.first().getAttribute('data-id');
};
const repoJson = (path) => JSON.parse(fake.readText(`content/${path}`));
const topicsRows = '.table--topics tbody tr[data-id]';
const tagRows = '.table--tags tbody tr[data-id]';

// ------------------------------------------------------------------------------------------------

await step('sign in; the four new screens are in the main navigation', async () => {
  await page.goto(`${base}/admin/`);
  await page.getByLabel('GitHub user or organisation').fill(fake.owner);
  await page.getByLabel('Repository').fill(fake.repo);
  await page.getByLabel('Branch').fill(fake.branch);
  await page.getByLabel('Access token').fill(fake.token);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForSelector('.tiles');
  const links = await page.locator('.nav a').allInnerTexts();
  for (const name of ['Topics', 'Tags', 'Navigation', 'Search']) assert.ok(links.includes(name), `${name} in ${links.join(', ')}`);
});

await step('Topic Manager: the tree shows nesting, usage counts and insights', async () => {
  await goto('#/topics');
  await page.waitForSelector(topicsRows);
  assert.equal((await rowIds(topicsRows)).length, 5);
  assert.equal(await page.locator('tr[data-id=top_writ0001] .topic-cell').getAttribute('data-depth'), '1', 'Writing sits under Ideas');
  assert.equal(await page.locator('tr[data-id=top_ideas001] .topic-cell').getAttribute('data-depth'), '0');
  assert.match(await page.locator('tr[data-id=top_tech0001]').innerText(), /2 published of 2/);
  assert.match(await page.locator('.tile', { hasText: 'Without content' }).innerText(), /0/);
  assert.match(await page.locator('details.rules summary').innerText(), /no AI/);
  await shot('d01-topics');
});

await step('filtering shows a flat list; clearing it brings the tree back', async () => {
  await page.getByLabel('Search by name').fill('wri');
  assert.deepEqual(await rowIds(topicsRows), ['top_writ0001']);
  assert.equal(await page.locator('tr[data-id=top_writ0001] .topic-cell').getAttribute('data-depth'), '0', 'no indentation while filtering');
  await page.getByLabel('Search by name').fill('');
  assert.equal((await rowIds(topicsRows)).length, 5);
});

let philosophyId;
await step('create a topic under Ideas; the editor opens on it and it is staged', async () => {
  await page.click('#new-topic');
  await modal().getByLabel('Language').selectOption('en');
  await page.getByLabel('Name', { exact: true }).fill('Philosophy');
  await page.click('#create-confirm');
  assert.match(await page.locator('.inline-error:not([hidden])').innerText(), /name and a description/, 'a description is required');
  await page.getByLabel('Description', { exact: true }).fill('Thinking about thinking.');
  await page.getByLabel('Parent topic').selectOption('top_ideas001');
  await page.click('#create-confirm');
  await page.waitForSelector('.taxonomy.editor');
  philosophyId = decodeURIComponent(new URL(page.url()).hash.split('/')[2]);
  assert.match(philosophyId, /^top_[0-9a-z]{8}$/);
  assert.equal(await page.locator('h1').innerText(), 'Philosophy');
  assert.match(await badge().innerText(), /1 unpublished/);
  assert.equal(await page.locator('[data-slug-input=en]').inputValue(), 'philosophy');
  assert.equal(await page.locator('#topic-parent').inputValue(), 'top_ideas001');
});

await step('changing the slug remembers the old address; a bad slug is refused', async () => {
  const slug = page.locator('[data-slug-input=en]');
  await slug.fill('Bad Slug');
  await slug.press('Tab');
  assert.match(await page.locator('.translation .inline-error:not([hidden])').innerText(), /letters, numbers and single hyphens/i);
  assert.equal(await slug.inputValue(), 'philosophy', 'the field goes back to the last good slug');
  await slug.fill('thinking');
  await slug.press('Tab');
  await page.waitForSelector('[data-remove-redirect=philosophy]');
  assert.equal(await slug.inputValue(), 'thinking');
  await page.locator('[data-slug-from-name]').click();
  assert.equal(await slug.inputValue(), 'philosophy', 'built again from the name');
  assert.equal(await page.locator('[data-remove-redirect=thinking]').count(), 1, 'the slug it left is remembered too');
  await page.locator('[data-remove-redirect=thinking]').click();
  assert.equal(await page.locator('[data-remove-redirect]').count(), 0);
});

await step('icon, accent colour and related topics; an empty topic explains why it has no preview', async () => {
  await page.locator('[data-icon=bulb]').click();
  assert.equal(await page.locator('[data-icon=bulb]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-icon=bulb]').getAttribute('aria-label'), 'Idea', 'every icon button has a name');
  assert.equal(await page.locator('#topic-color').isDisabled(), true);
  await page.getByLabel('Use an accent colour').check();
  await page.locator('#topic-color').fill('#2255aa');
  await page.locator('.settings .field', { hasText: 'Related topics' }).getByLabel('Making').check();
  await page.waitForFunction(() => /built once|only once public content/.test(document.querySelector('.preview__message')?.textContent ?? ''), null, { timeout: 8000 });
  assert.equal(await page.locator('.problems').isVisible(), false, 'no validation problem');
  await shot('d02-topic-editor');
});

await step('a topic with content previews its real page, with the accent colour', async () => {
  await goto('#/topics/top_ideas001');
  await page.waitForSelector('.taxonomy.editor');
  await page.locator('[data-icon=compass]').click();
  await page.getByLabel('Use an accent colour').check();
  await page.locator('#topic-color').fill('#2255aa');
  await page.waitForFunction(() => document.querySelector('.preview__frame')?.contentDocument?.querySelector('h1')?.textContent?.includes('Ideas'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.preview__frame')?.contentDocument?.querySelector('.topic-c-2255aa'), null, { timeout: 8000 });
  assert.equal(await page.locator('.preview__message').isHidden(), true);
  await shot('d02b-topic-preview');
});

await step('add an Arabic translation; both languages are kept', async () => {
  await goto(`#/topics/${philosophyId}`);
  await page.waitForSelector('[data-add-translation=ar]');
  await page.locator('[data-add-translation=ar]').click();
  await modal().getByLabel('Name', { exact: true }).fill('فلسفة');
  await modal().getByLabel('Description', { exact: true }).fill('تفكير في التفكير.');
  await page.click('#add-translation-confirm');
  await page.waitForSelector('.translation h2:has-text("العربية")');
  assert.equal(await page.locator('[data-slug-input=ar]').inputValue(), 'فلسفة');
  assert.equal(await page.locator('.problems').isVisible(), false);
});

await step('reordering within a parent and bulk changes on the list', async () => {
  await goto('#/topics');
  await page.waitForSelector(topicsRows);
  let ids = await rowIds(topicsRows);
  assert.ok(ids.indexOf(philosophyId) > ids.indexOf('top_writ0001'), 'new topics go last among their siblings');
  await page.locator(`[data-move-up="${philosophyId}"]`).click();
  ids = await rowIds(topicsRows);
  assert.ok(ids.indexOf(philosophyId) < ids.indexOf('top_writ0001'), 'moved up');
  await page.locator(`[data-move-down="${philosophyId}"]`).click();
  // Bulk: make both sub-topics private, then public again.
  await page.locator(`[data-select="${philosophyId}"]`).check();
  await page.locator('[data-select=top_writ0001]').check();
  assert.match(await page.locator('.bulk').innerText(), /2 selected/);
  await page.locator('[data-bulk-change]').selectOption('visibility=private');
  await page.locator('[data-bulk-apply]').click();
  assert.equal(await page.locator('tr[data-id=top_writ0001] .chip', { hasText: 'Private' }).count(), 1);
  assert.equal(await page.locator(`tr[data-id="${philosophyId}"] .chip`, { hasText: 'Private' }).count(), 1);
  await page.locator('[data-bulk-change]').selectOption('visibility=public');
  await page.locator('[data-bulk-apply]').click();
  assert.equal(await page.locator('.chip', { hasText: 'Private' }).count(), 0);
  await page.locator('[data-bulk-clear]').click();
  assert.equal(await page.locator('.bulk').isHidden(), true);
});

await step('merging a topic moves its content and keeps the old address', async () => {
  await goto('#/topics/top_writ0001');
  await page.waitForSelector('#topic-merge');
  await page.click('#topic-merge');
  assert.match(await modal().innerText(), /articles: 2/);
  await page.locator('#choose-target').selectOption('top_ideas001');
  await page.click('#choose-confirm');
  await page.waitForFunction(() => location.hash === '#/topics/top_ideas001');
  await goto('#/topics');
  assert.equal(await page.locator('tr[data-id=top_writ0001]').count(), 0, 'Writing is gone');
  assert.match(await page.locator('tr[data-id=top_ideas001]').innerText(), /2 published of 2/, 'its articles are filed under Ideas once');
});

await step('deleting a used topic asks first and removes it from the content', async () => {
  await goto('#/topics/top_learn001');
  await page.waitForSelector('#topic-delete');
  await page.click('#topic-delete');
  assert.match(await modal().innerText(), /articles: 1, projects: 1/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.click('#topic-delete');
  await modal().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(() => location.hash === '#/topics');
  assert.equal(await page.locator('tr[data-id=top_learn001]').count(), 0);
});

await step('Tag Manager: insights, then a duplicate is found and merged', async () => {
  await goto('#/tags');
  await page.waitForSelector(tagRows);
  assert.equal((await rowIds(tagRows)).length, 5);
  assert.match(await page.locator('#tag-similar').innerText(), /No duplicates or look-alikes found/);
  assert.match(await page.locator('.tile', { hasText: 'Unused' }).innerText(), /0/);
  // Same name, different case: a duplicate.
  await page.click('#new-tag');
  await modal().getByLabel('Language').selectOption('en');
  await page.getByLabel('Name', { exact: true }).fill('notes');
  await page.click('#create-confirm');
  await page.waitForSelector('.taxonomy.editor');
  await goto('#/tags');
  await page.waitForSelector('#tag-similar [data-reason=same]');
  assert.match(await page.locator('#tag-similar [data-reason=same]').innerText(), /Same name/);
  await page.locator('#tag-similar [data-merge-ids]').first().click();
  assert.match(await modal().innerText(), /Content tagged with the others gets the kept tag/);
  await page.locator('#choose-target').selectOption('tag_notes001');
  await page.click('#choose-confirm');
  await page.waitForFunction(() => document.querySelectorAll('.table--tags tbody tr[data-id]').length === 5);
  assert.match(await page.locator('#tag-similar').innerText(), /No duplicates or look-alikes found/);
  assert.match(await page.locator('tr[data-id=tag_notes001]').innerText(), /3 published of 3/);
});

await step('a one-letter typo is suggested; merging keeps the name as an alias and the old address', async () => {
  await page.click('#new-tag');
  await modal().getByLabel('Language').selectOption('en');
  await page.getByLabel('Name', { exact: true }).fill('Desing');
  await page.click('#create-confirm');
  await page.waitForSelector('.taxonomy.editor');
  const typoId = decodeURIComponent(new URL(page.url()).hash.split('/')[2]);
  assert.match(await page.locator('#tag-suggestions').innerText(), /Looks like a typo/, 'suggested in the editor of the new tag');
  await page.locator('[data-merge-with=tag_desgn001]').click();
  await page.locator('#choose-target').selectOption('tag_desgn001');
  await page.click('#choose-confirm');
  await page.waitForFunction(() => location.hash === '#/tags/tag_desgn001');
  await page.waitForSelector('.taxonomy.editor');
  assert.match(await page.getByLabel('Aliases', { exact: true }).inputValue(), /Desing/, 'the merged name is now an alias');
  assert.equal(await page.locator('[data-remove-redirect=desing]').count(), 1, 'its address redirects');
  void typoId;
});

await step('bulk actions: select the unused tags and delete them; a private tag chip; the usage filter', async () => {
  await goto('#/tags');
  for (const name of ['Temp one', 'Temp two']) {
    await page.click('#new-tag');
    await modal().getByLabel('Language').selectOption('en');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.click('#create-confirm');
    await page.waitForSelector('.taxonomy.editor');
    await goto('#/tags');
  }
  await page.getByLabel('Usage', { exact: true }).selectOption('unused');
  assert.equal((await rowIds(tagRows)).length, 2);
  await page.getByLabel('Usage', { exact: true }).selectOption('');
  await page.click('#select-unused');
  assert.match(await page.locator('.bulk').innerText(), /2 selected/);
  await page.locator('[data-bulk-change]').selectOption('visibility=private');
  await page.locator('[data-bulk-apply]').click();
  assert.equal(await page.locator('.chip', { hasText: 'Private' }).count(), 2);
  assert.equal(await page.locator('#bulk-merge').isDisabled(), false);
  await page.click('#bulk-delete');
  assert.match(await modal().innerText(), /count: 2/);
  await modal().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.table--tags tbody tr[data-id]').length === 5);
  assert.equal(await page.locator('.chip', { hasText: 'Private' }).count(), 0);
  await shot('d03-tags');
});

await step('Search settings: a real query runs in the browser against the published content', async () => {
  await goto('#/search');
  await page.waitForSelector('#ss-stats');
  assert.match(await page.locator('#ss-stats').innerText(), /Index: \d+ pages/);
  await page.locator('#ss-query').fill('welcome');
  await page.waitForSelector('.hit');
  assert.ok((await page.locator('.hit', { hasText: 'Welcome to ABDO' }).count()) >= 1);
  assert.match(await page.locator('#ss-read').innerText(), /welcome/);
  await page.locator('#ss-query').fill('welcom');
  await page.waitForSelector('.hit');
  assert.ok((await page.locator('.hit').count()) >= 1, 'a word being typed matches by prefix');
  await page.locator('#ss-query').fill('welcomee');
  await page.waitForFunction(() => document.querySelector('#ss-results')?.textContent.includes('Did you mean: welcome'));
  await shot('d04-search-settings');
});

await step('Search settings: choices change what is found; synonyms work; bad input is refused', async () => {
  await page.locator('#ss-query').fill('welcome');
  await page.waitForSelector('.hit');
  await page.locator('[data-search-type=article]').uncheck();
  await page.waitForFunction(() => !document.querySelector('.hit[data-type=article]'));
  await page.locator('[data-search-type=article]').check();
  await page.waitForSelector('.hit[data-type=article]');
  // Synonyms: "assembled" is in no page, but is made equal to "built".
  await page.locator('#ss-query').fill('assembled');
  await page.waitForFunction(() => document.querySelector('#ss-results')?.textContent.includes('Nothing found'));
  await page.locator('#ss-synonyms').fill('built assembled\nsingle');
  assert.match(await page.locator('.inline-error:not([hidden])').innerText(), /2 to 12 words.*2$/s, 'the unusable line is named');
  await page.waitForFunction(() => document.querySelector('.hit')?.textContent.includes('How this site is built'), null, { timeout: 5000 });
  // Page size is validated.
  await page.locator('#ss-page-size').fill('2');
  assert.match(await page.locator('.inline-error:not([hidden])').first().innerText(), /whole number from 4 to 48/);
  await page.locator('#ss-page-size').fill('9');
  // Ranking shows its weights.
  await page.getByLabel('Ranking').selectOption('titles-first');
  assert.match(await page.locator('#ss-weights').innerText(), /Title \d+ · Tags \d+/);
  // Arabic comparison ignores vowel marks: "مرحبا" finds the title "مرحبًا بكم في عبده".
  await page.getByLabel('Language', { exact: true }).selectOption('ar');
  await page.locator('#ss-query').fill('مرحبا');
  await page.waitForFunction(() => document.querySelector('.hit')?.textContent.includes('مرحبًا'), null, { timeout: 5000 });
  assert.match(await badge().innerText(), /unpublished/);
});

await step('Search settings: restoring the defaults asks first', async () => {
  await page.click('#search-reset');
  await modal().getByRole('button', { name: 'Restore defaults' }).click();
  await page.waitForSelector('#ss-page-size');
  assert.equal(await page.locator('#ss-page-size').inputValue(), '12');
  assert.equal(await page.getByLabel('Ranking').inputValue(), 'balanced');
  // Keep a setting for the publish check below.
  await page.locator('#ss-page-size').fill('8');
  await page.locator('#ss-synonyms').fill('built assembled');
});

await step('Navigation: add a page, move it, add an external link; an unsafe address is flagged', async () => {
  await goto('#/navigation');
  await page.waitForSelector('[data-region=header] .navitem');
  assert.equal(await page.locator('[data-region=header] .navitem').count(), 6, 'the English header menu');
  const header = page.locator('[data-region=header]');
  await header.locator('.navadd select').selectOption('search');
  await header.locator('[data-nav-add=header]').click();
  assert.equal(await header.locator('.navitem').count(), 7);
  const added = await header.locator('.navitem').last().getAttribute('data-nav-item');
  assert.equal(await header.locator('.navitem').last().locator('input').first().inputValue(), 'Search', 'labelled like the site');
  await header.locator(`[data-nav-up="${added}"]`).click();
  assert.equal(await header.locator('.navitem').nth(5).getAttribute('data-nav-item'), added, 'moved up one place');
  await header.locator('.navadd select').selectOption('url');
  await header.locator('[data-nav-add=header]').click();
  const external = header.locator('.navitem').last();
  const url = external.getByLabel('Address');
  await url.fill('javascript:alert(1)');
  assert.match(await external.locator('.inline-error:not([hidden])').innerText(), /Only https/, 'flagged at once');
  await page.waitForSelector('.problems:not([hidden])');
  assert.match(await page.locator('.problems').innerText(), /valid uri/i, 'and by validation, which blocks publishing');
  await url.fill('https://example.org/reading');
  await page.waitForSelector('.problems', { state: 'hidden' });
  await shot('d05-navigation');
});

await step('Navigation: each language has its own list; the footer can fall back to the default', async () => {
  await page.getByRole('tab', { name: 'العربية' }).click();
  assert.equal(await page.locator('[data-region=header] .navitem').count(), 5);
  await page.locator('[data-region=footer] [data-nav-clear=footer]').click();
  await modal().getByRole('button', { name: 'Use the default' }).click();
  assert.match(await page.locator('[data-region=footer]').innerText(), /repeats the header menu/);
  await page.locator('[data-nav-create=footer]').click();
  assert.equal(await page.locator('[data-region=footer] .navitem').count(), 5);
  await page.getByRole('tab', { name: 'English' }).click();
});

let site;
await step('publishing makes one commit, and the real build accepts everything', async () => {
  await goto('#/publish');
  await page.waitForSelector('#publish-button');
  assert.equal(await page.locator('#publish-button').isDisabled(), false, 'no problem blocks publishing');
  await page.getByLabel('Description of this publish').fill('Discovery e2e');
  await page.click('#publish-button');
  await page.waitForSelector('#publish-success');
  // What reached the repository.
  const tags = repoJson('taxonomy/tags.json').items;
  assert.ok(tags.find((t) => t.id === 'tag_desgn001').translations.en.aliases.includes('Desing'));
  assert.ok(tags.find((t) => t.id === 'tag_desgn001').translations.en.redirectSlugs.includes('desing'));
  assert.equal(tags.length, 5);
  const topics = repoJson('taxonomy/topics.json').items;
  assert.equal(topics.find((t) => t.id === 'top_learn001'), undefined);
  assert.equal(topics.find((t) => t.id === 'top_writ0001'), undefined);
  const ideas = topics.find((t) => t.id === 'top_ideas001').translations.en;
  assert.ok(ideas.redirectSlugs.includes('writing'), 'the merged topic\'s address now redirects to the topic it was merged into');
  assert.ok(ideas.synonyms.includes('Writing'), 'and its name became a search synonym');
  assert.ok(!repoJson('articles/art_readar01.json').topicIds.includes('top_learn001'));
  const search = repoJson('config/search.json');
  assert.equal(search.pageSize, 8);
  assert.deepEqual(search.synonyms.en, [['built', 'assembled']]);
  assert.equal(repoJson('config/navigation.json').header.en.at(-1).target.url, 'https://example.org/reading');
  // The real build.
  const contentDir = join(work, 'published');
  for (const [path, bytes] of fake.files()) {
    if (!path.startsWith('content/')) continue;
    const target = join(contentDir, path.slice('content/'.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  const out = join(work, 'dist-published');
  const result = build({ content: contentDir, out, siteUrl: 'https://example.github.io/abdo', admin: false });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.deepEqual(result.warnings, []);
  site = { out, has: (...s) => existsSync(join(out, ...s)), read: (...s) => readFileSync(join(out, ...s), 'utf8') };
});

await step('the built site reflects the changes: nav link, search page, topic page, redirect stub, pagination', async () => {
  assert.ok(site.has('en', 'search', 'index.html'));
  const home = site.read('en', 'index.html');
  assert.match(home, /href="\/abdo\/en\/search\/"/, 'the new menu item points at the search page');
  assert.match(home, /href="https:\/\/example\.org\/reading"/);
  assert.ok(!site.has('en', 'topics', 'philosophy', 'index.html'), 'a topic with no content gets no page');
  assert.match(site.read('en', 'topics', 'ideas', 'index.html'), /topic-c-2255aa/, 'the accent colour reaches the built page');
  assert.ok(!site.has('en', 'topics', 'learning', 'index.html'), 'the deleted topic has no page');
  assert.ok(site.has('en', 'topics', 'writing', 'index.html'), 'the merged-away topic keeps a stub');
  const stub = site.read('en', 'topics', 'writing', 'index.html');
  assert.match(stub, /http-equiv="refresh"/);
  assert.match(stub, /noindex/);
  assert.match(stub, /\/en\/topics\/ideas\//);
  assert.ok(site.has('en', 'tags', 'desing', 'index.html'), 'the merged tag keeps a stub');
  const files = readdirSync(join(site.out, 'assets'), { recursive: true }).map(String);
  assert.ok(files.some((f) => /search/i.test(f) && f.endsWith('.json')), `a search index is published: ${files.filter((f) => /search/i.test(f)).join(', ')}`);
});

await step('Arabic: right to left, translated, and no raw keys on every new screen', async () => {
  await goto('#/overview');
  await page.click('#lang-toggle');
  await page.waitForSelector('html[dir=rtl]');
  const routes = ['topics', 'topics/top_ideas001', 'tags', 'tags/tag_desgn001', 'search', 'navigation'];
  for (const route of routes) {
    await goto(`#/${route}`);
    await page.waitForTimeout(200);
    assert.deepEqual(await rawKeys(), [], `raw keys on ${route}`);
    await shot(`d06-ar-${route.replace('/', '-')}`);
  }
  await goto('#/topics');
  assert.match(await page.locator('main h1').innerText(), /المواضيع/);
  await goto('#/search');
  await page.locator('#ss-query').fill('مرحبا');
  await page.waitForSelector('.hit');
});

await step('no horizontal scrolling at phone width on the new screens', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['topics', 'topics/top_ideas001', 'tags', 'tags/tag_desgn001', 'search', 'navigation']) {
    await goto(`#/${route}`);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) console.log('WIDE', route, await page.evaluate(() => [...document.querySelectorAll('#app *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 || e.getBoundingClientRect().left < -1).slice(0, 8).map((e) => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`)));
    assert.ok(overflow <= 1, `${route} overflows by ${overflow}px`);
  }
  await shot('d07-mobile-topics');
  await page.setViewportSize({ width: 1280, height: 900 });
});

await step('the browser reported no errors, warnings or CSP violations', async () => {
  const relevant = problems.filter((p) => !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(p));
  assert.deepEqual(relevant, []);
});

await cleanup();
console.log(`\nDiscovery admin end-to-end: ${stepNo} steps passed.`);
