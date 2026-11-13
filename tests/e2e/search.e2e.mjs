// End-to-end test of the PUBLIC site's discovery features in a real browser (Chromium via Playwright):
// the search page, autocomplete, filters, Arabic matching, pagination, topic and tag landing pages, redirects.
// Run with:  node tests/e2e/search.e2e.mjs
// Playwright is not a project dependency; the script exits with a notice if it cannot find it.
//
// What this proves: the built search script runs the tested engine in a browser and renders the results safely.
// What it does not prove: Firefox or Safari behaviour, or screen-reader output (no assistive technology was run).

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { build } from '../../src/build.mjs';
import { createStaticServer } from '../../tools/serve.mjs';
import { workspace } from '../helpers.mjs';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.log('Playwright is not installed here; skipping the browser test.'); process.exit(0); }

const SHOTS = process.env.E2E_SHOTS ? join(process.env.E2E_SHOTS) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------- two sites: numbered pages and "load more"

function site({ pagination }) {
  const ws = workspace();
  const art = ws.read('articles/art_built001.json');
  for (let n = 1; n <= 6; n += 1) {
    const id = `art_extra00${n}`;
    const tr = structuredClone(art.translations.en);
    tr.title = `Extra note ${n} about logs`;
    tr.slug = `extra-note-${n}`;
    tr.excerpt = `Extra note number ${n}, written to fill a second page of results.`;
    ws.write(`articles/${id}.json`, { ...art, id, featured: false, publishedAt: `2026-0${n}-15T09:00:00+02:00`, translations: { en: tr }, topicIds: ['top_writ0001'], tagIds: ['tag_notes001'] });
  }
  ws.edit('taxonomy/topics.json', (d) => {
    Object.assign(d.items.find((t) => t.id === 'top_ideas001'), { icon: 'bulb', color: '#b5651d', pinnedItemIds: ['art_welcome1'], relatedTopicIds: ['top_make0001'] });
  });
  ws.edit('taxonomy/tags.json', (d) => {
    const notes = d.items.find((t) => t.id === 'tag_notes001');
    Object.assign(notes.translations.en, { aliases: ['memos'], synonyms: ['jottings'], description: 'Short notes and fragments.', redirectSlugs: ['old-notes'] });
    notes.relatedTagIds = ['tag_flow0001'];
  });
  ws.write('config/search.json', { schemaVersion: 1, pageSize: 4, pagination, synonyms: { en: [['review', 'retrospective']] } });
  return ws;
}

const pagesSite = site({ pagination: 'pages' });
const moreSite = site({ pagination: 'more' });
const servers = [];
async function serve(ws) {
  const server = createStaticServer(ws.outDir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const built = ws.build({ siteUrl: base, admin: false });
  assert.ok(built.ok, JSON.stringify(built.errors));
  return base;
}
const base = await serve(pagesSite);
const baseMore = await serve(moreSite);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
const stubFonts = (ctx) => ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
await stubFonts(context);
const page = await context.newPage();
const problems = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

let stepNo = 0;
async function cleanup() { await browser.close(); servers.forEach((s) => s.close()); pagesSite.cleanup(); moreSite.cleanup(); }
async function step(name, fn) {
  stepNo += 1;
  try { await fn(); console.log(`  ok  ${String(stepNo).padStart(2)}  ${name}`); } catch (error) {
    console.log(`FAIL  ${String(stepNo).padStart(2)}  ${name}\n${error.stack ?? error}`);
    if (problems.length) console.log(`browser problems:\n  ${problems.join('\n  ')}`);
    await page.screenshot({ path: join(SHOTS ?? pagesSite.dir, 'failure.png'), fullPage: true }).catch(() => {});
    await cleanup(); process.exit(1);
  }
}
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }); };

const q = () => page.locator('#search-q');
const status = () => page.locator('[data-status]');
const titles = async () => (await page.locator('.result__title').allInnerTexts()).map((t) => t.trim());
const settle = () => page.waitForTimeout(450); // instant search waits 140 ms before it runs
async function openSearch(lang = 'en', params = '', origin = base) {
  await page.goto(`${origin}/${lang === 'en' ? 'en/search' : 'ar/بحث'}/${params}`);
  await page.waitForFunction(() => !document.querySelector('[data-status]')?.textContent.includes('Loading') && !document.querySelector('[data-status]')?.textContent.includes('جارٍ'));
}
// Typing leaves the suggestion list open under the box, like any autocomplete; moving on (blur) closes it.
async function type(text) {
  await q().fill('');
  await q().pressSequentially(text, { delay: 15 });
  await settle();
  await q().blur();
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------- the page and its index

await step('the header has a search link that opens the search page; the page loads its index with no console problems', async () => {
  await page.goto(`${base}/en/`);
  await page.getByRole('link', { name: 'Search the site' }).click();
  await page.waitForURL(/\/en\/search\/$/);
  await openSearch();
  assert.equal(await status().innerText(), 'Start typing to see results.');
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
  assert.equal(await page.locator('.search__app').isVisible(), true);
  assert.equal(await page.locator('.search__nojs').isVisible(), false);
  // The idle state offers things to browse.
  assert.ok(await page.locator('[data-idle] a').count() > 0);
  assert.deepEqual(problems, []);
  await shot('s1-search-idle');
});

await step('typing searches as you go; the address follows; matches are highlighted; the text is never treated as HTML', async () => {
  await type('log');
  const found = await titles();
  assert.ok(found.some((t) => t.includes('Notes on keeping a work log')), found.join(' | '));
  assert.match(await status().innerText(), /^\d+ results? for “log”$/);
  assert.match(page.url(), /\?q=log$/);
  assert.ok(await page.locator('mark').count() > 0);
  assert.ok((await page.locator('mark').allInnerTexts()).every((t) => /log/i.test(t)));
  // A hostile query is shown as text.
  await type('<img src=x onerror=window.__pwn=1>');
  assert.equal(await page.evaluate(() => window.__pwn), undefined);
  assert.equal(await page.locator('.search img[src="x"]').count(), 0);
  await shot('s2-results-grid');
});

await step('autocomplete: suggestions appear, the keyboard moves through them, Enter chooses', async () => {
  await q().fill('');
  await q().pressSequentially('wor', { delay: 15 });
  await page.locator('#search-suggest [role="option"]').first().waitFor();
  assert.equal(await q().getAttribute('aria-expanded'), 'true');
  const options = await page.locator('#search-suggest [role="option"]').allInnerTexts();
  assert.ok(options.some((o) => o.trim() === 'work'), options.join(' | '));
  await q().press('ArrowDown');
  assert.equal(await page.locator('#search-suggest [aria-selected="true"]').count(), 1);
  assert.equal(await q().getAttribute('aria-activedescendant'), 'search-opt-0');
  await shot('s3-autocomplete');
  await q().press('Enter');
  assert.equal(await q().inputValue(), `${options[0].trim().split('\n')[0]} `);
  assert.equal(await q().getAttribute('aria-expanded'), 'false');
  await q().fill('wor');
  await page.locator('#search-suggest [role="option"]').first().waitFor();
  await q().press('Escape');
  assert.equal(await page.locator('#search-suggest').isVisible(), false);
});

await step('query syntax: "exact phrase" and -exclusion', async () => {
  await type('"work log"');
  assert.deepEqual((await titles()).filter((t) => /work log/i.test(t)).length, 1);
  await type('log -welcome');
  const found = await titles();
  assert.ok(!found.some((t) => t.includes('Welcome')));
  assert.ok(found.length > 0);
  await type('planner decisions');
  assert.ok(await page.locator('.notice').isVisible(), 'a partial match says so');
});

await step('filters: type, topic, tag, sort, clear; counts follow the words; the address records them', async () => {
  await type('notes');
  const all = (await titles()).length;
  await page.locator('[data-type][value="tag"]').check();
  await settle();
  assert.ok((await titles()).every((t) => t.length > 0));
  assert.equal(await page.locator('.result--tag').count(), (await titles()).length);
  assert.match(page.url(), /type=tag/);
  await page.locator('[data-clear]').click();
  assert.equal((await titles()).length, all);
  const topicOptions = await page.locator('[data-topic] option').allInnerTexts();
  assert.ok(topicOptions.some((o) => /^Writing \(\d+\)$/.test(o)), topicOptions.join(' | '));
  await page.locator('[data-topic]').selectOption({ value: 'top_writ0001' });
  assert.match(page.url(), /topic=top_writ0001/);
  assert.ok((await titles()).length <= all);
  await page.locator('[data-sort]').selectOption('newest');
  assert.match(page.url(), /sort=newest/);
  await page.locator('[data-clear]').click();
  // A shared link restores everything, including the view.
  await openSearch('en', '?q=log&type=article&sort=oldest&view=list');
  assert.equal(await q().inputValue(), 'log');
  assert.equal(await page.locator('[data-sort]').inputValue(), 'oldest');
  assert.ok(await page.locator('.search__results--list').count() === 1);
  assert.equal(await page.locator('[data-view="list"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-type][value="article"]').isChecked(), true);
  await shot('s5-list-view');
});

await step('dates: the from and to filters narrow by publication date', async () => {
  const count = async () => Number((/^(\d+)/.exec(await status().innerText()) ?? [])[1] ?? 0);
  await openSearch('en', '?q=extra&type=article');
  assert.equal(await count(), 6, 'six extra notes, January to June');
  await page.locator('[data-from]').fill('2026-04-01');
  await settle();
  assert.equal(await count(), 3);
  assert.match(page.url(), /from=2026-04-01/);
  await page.locator('[data-to]').fill('2026-04-30');
  await settle();
  assert.equal(await count(), 1);
  await page.locator('[data-from]').fill('2026-07-01');
  await page.locator('[data-to]').fill('2026-07-02');
  await settle();
  assert.match(await status().innerText(), /Nothing found/);
});

await step('views: grid, list and compact change the layout; compact hides excerpts', async () => {
  await openSearch('en', '?q=log');
  await page.locator('[data-view="compact"]').click();
  assert.equal(await page.locator('.search__results--compact').count(), 1);
  assert.equal(await page.locator('.result__text').first().isVisible(), false);
  assert.match(page.url(), /view=compact/);
  await page.locator('[data-view="grid"]').click();
  assert.equal(await page.locator('.result__text').first().isVisible(), true);
});

await step('no results: did-you-mean, recommendations, no console errors; synonyms and aliases find pages', async () => {
  await type('plnaner');
  assert.match(await status().innerText(), /Nothing found/);
  assert.ok(await page.locator('[data-aside] a[data-q]').count() === 1, 'a "did you mean" link');
  assert.equal(await page.locator('[data-aside] a[data-q]').innerText(), 'planner');
  await page.locator('[data-aside] a[data-q]').click();
  await settle();
  assert.ok((await titles()).some((t) => /Planner|planner/.test(t)));
  await shot('s7-did-you-mean');
  await type('zzzzqqq');
  assert.ok(await page.locator('[data-aside] a').count() >= 2, 'recommendations are offered');
  await type('memos');
  assert.ok((await titles()).length > 0, 'a tag alias finds the tagged pages');
  await type('jottings');
  assert.ok((await titles()).length > 0, 'a tag synonym finds the tagged pages');
  await type('retrospective');
  assert.ok(await page.locator('[data-status]').innerText() !== '', 'owner synonyms are accepted');
  assert.deepEqual(problems, []);
});

await step('related searches: choosing one applies it as a filter', async () => {
  await type('log');
  const related = page.locator('.search__related a[data-kind]');
  assert.ok(await related.count() > 0);
  const name = await related.first().innerText();
  await related.first().click();
  await settle();
  assert.match(page.url(), /(topic|tag)=/);
  assert.ok(name.length > 0);
});

await step('numbered pages: 4 per page, page links keep the query, the active page is marked', async () => {
  await openSearch('en', '?q=extra');
  assert.equal((await titles()).length, 4);
  const nav = page.locator('.search__more .pagination');
  assert.equal(await nav.count(), 1);
  assert.equal(await nav.locator('[aria-current="page"]').innerText(), '1');
  await nav.getByRole('link', { name: '2' }).click();
  await settle();
  assert.equal((await titles()).length, 2);
  assert.match(page.url(), /page=2/);
  await page.goBack();
  await settle();
  assert.equal((await titles()).length, 4, 'the back button returns to page 1');
});

await step('"load more" mode: the button adds the next results and goes away at the end', async () => {
  await openSearch('en', '?q=extra', baseMore);
  assert.equal((await titles()).length, 4);
  await page.getByRole('button', { name: 'Load more results' }).click();
  assert.equal((await titles()).length, 6);
  assert.equal(await page.getByRole('button', { name: 'Load more results' }).count(), 0);
});

await step('Arabic: right-to-left page, strings in Arabic, diacritics, hamza, ta marbuta and the article all match', async () => {
  await openSearch('ar');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await status().innerText(), 'ابدأ بالكتابة لتظهر النتائج.');
  await type('مَرْحَبًا');
  assert.ok((await titles()).some((t) => t.includes('مرحبًا بكم في عبده')), (await titles()).join(' | '));
  await type('القراءه');
  assert.ok((await titles()).some((t) => t.includes('قراءة بطيئة')), 'ة and ه are the same, and so is the article ال');
  await type('قرائه البطيئه');
  assert.ok((await titles()).some((t) => t.includes('قراءة بطيئة')), 'a hamza on a seat and the folded forms');
  assert.match(await status().innerText(), /نتيجة|نتائج|نتيجتان/);
  assert.ok(await page.locator('mark').count() > 0);
  await shot('s9-arabic-results');
  await type('xyzxyz');
  assert.match(await status().innerText(), /لا نتائج/);
  assert.deepEqual(problems, []);
});

await step('topic page: icon, accent colour, "start here", related topics, sub-topics, search link', async () => {
  await page.goto(`${base}/en/topics/ideas/`);
  assert.equal(await page.locator('.topic-scope .topic-icon svg').count(), 1);
  const accent = await page.locator('.topic-scope').evaluate((el) => getComputedStyle(el).getPropertyValue('--topic-accent').trim());
  assert.equal(accent, '#b5651d');
  assert.equal(await page.getByRole('heading', { name: 'Start here' }).count(), 1);
  assert.ok(await page.getByRole('heading', { name: 'Related topics' }).count() === 1);
  assert.ok(await page.getByRole('heading', { name: 'Subtopics' }).count() === 1);
  await shot('s10-topic-page');
  await page.getByRole('link', { name: 'Search in this topic' }).click();
  await page.waitForURL(/topic=top_ideas001/);
  await page.waitForFunction(() => /item/.test(document.querySelector('[data-status]')?.textContent ?? ''));
  assert.ok((await titles()).length > 0, 'browsing a topic needs no words');
  assert.equal(await page.locator('[data-topic]').inputValue(), 'top_ideas001');
  await shot('s10-topic-browse');
  await page.goto(`${base}/en/topics/`);
  await shot('s10-topics-index');
});

await step('topic and tag lists are capped, with a link to the full list in search', async () => {
  await page.goto(`${base}/en/topics/writing/`);
  assert.equal(await page.locator('#t-a ~ .grid .card, #t-a + .grid .card').count(), 4);
  await page.getByRole('link', { name: /Show all \d+ in search/ }).click();
  await page.waitForURL(/type=article/);
  await page.waitForFunction(() => /item/.test(document.querySelector('[data-status]')?.textContent ?? ''));
  assert.ok((await titles()).length >= 4);
});

await step('tag page: description, also known as, related tags; an old slug redirects to it', async () => {
  await page.goto(`${base}/en/tags/notes/`);
  assert.match(await page.locator('.page-header__intro').innerText(), /Short notes and fragments/);
  assert.match(await page.locator('.page-header + .container, .container:has(.page-header__summary)').first().innerText(), /Also known as: memos/);
  assert.equal(await page.getByRole('heading', { name: 'Related tags' }).count(), 1);
  await page.goto(`${base}/en/tags/old-notes/`);
  await page.waitForURL(/\/en\/tags\/notes\/$/);
  assert.equal(await page.locator('h1').innerText(), 'Notes');
});

await step('the blog is split into numbered pages with working links, titles and canonical addresses', async () => {
  await page.goto(`${base}/en/blog/`);
  assert.equal(await page.locator('.grid .card').count(), 4);
  await page.locator('.pagination').getByRole('link', { name: '2' }).click();
  await page.waitForURL(/\/en\/blog\/page\/2\/$/);
  assert.match(await page.title(), /Blog — Page 2/);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${base}/en/blog/page/2/`);
  assert.equal(await page.locator('.pagination [aria-current="page"]').innerText(), '2');
  assert.equal(await page.locator('.pagination a[rel="prev"]').count(), 1);
  assert.equal(await page.locator('.pagination a[rel="next"]').count(), 1);
  await page.goto(`${base}/ar/مدونة/`);
  assert.equal(await page.locator('.pagination').count(), 0, 'few items: no pagination');
  await shot('s12-blog-page2');
});

await step('phone width: the search page and a landing page never scroll sideways, in both languages', async () => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, locale: 'en-US', deviceScaleFactor: 2 });
  await stubFonts(phone);
  const p = await phone.newPage();
  for (const url of [`${base}/en/search/?q=log`, `${base}/ar/بحث/?q=قراءة`, `${base}/en/topics/ideas/`, `${base}/ar/مواضيع/`]) {
    await p.goto(url);
    await p.waitForTimeout(500);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(wide <= 0, `${url} is ${wide}px wider than the screen`);
  }
  await p.goto(`${base}/en/search/?q=log`);
  await p.waitForTimeout(500);
  if (SHOTS) await p.screenshot({ path: join(SHOTS, 's13-phone-search.png'), fullPage: true });
  await phone.close();
});

await step('without JavaScript the search page says so and links to the browsable pages', async () => {
  const plain = await browser.newContext({ javaScriptEnabled: false, locale: 'en-US' });
  await stubFonts(plain);
  const p = await plain.newPage();
  await p.goto(`${base}/en/search/`);
  assert.equal(await p.locator('.search__nojs').isVisible(), true);
  assert.equal(await p.locator('.search__app').isVisible(), false);
  assert.ok(await p.locator('.search__nojs a').count() >= 4);
  await p.goto(`${base}/en/blog/page/2/`);
  assert.ok(await p.locator('.card').count() > 0, 'numbered pages are plain HTML');
  await plain.close();
});

await step('a failed index request is reported with links to browse instead', async () => {
  const broken = await browser.newContext({ locale: 'en-US' });
  await stubFonts(broken);
  await broken.route(/search-en\..*\.json/, (route) => route.abort());
  const p = await broken.newPage();
  await p.goto(`${base}/en/search/`);
  await p.waitForFunction(() => /could not be loaded/.test(document.querySelector('[data-status]')?.textContent ?? ''));
  assert.ok(await p.locator('[data-aside] a').count() >= 4);
  await broken.close();
});

await step('the sitemap lists the numbered pages and leaves out the search page and the redirects', async () => {
  const xml = await (await page.request.get(`${base}/sitemap.xml`)).text();
  assert.ok(xml.includes('/en/blog/page/2/'));
  assert.ok(!xml.includes('/search/') && !xml.includes('/بحث') && !xml.includes('old-notes'));
});

assert.deepEqual(problems, [], 'no console errors or warnings');
console.log(`\nAll ${stepNo} steps passed.`);
await cleanup();
