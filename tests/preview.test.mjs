// The preview renders unpublished work with the site's own renderer.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { PreviewError, fillMedia, previewStyles, renderPreview as render } from '../src/core/preview.mjs';
import { loadContent } from '../src/lib/validate.mjs';
import { sampleBlocks } from './block-samples.mjs';
import { ROOT, workspace } from './helpers.mjs';

const workspaces = [];
after(() => workspaces.forEach((w) => w.cleanup()));
const fresh = () => { const ws = workspace(); workspaces.push(ws); return ws; };
const assets = { themeCss: 'blob:theme', glassCss: 'blob:glass', baseCss: 'blob:base' };
const load = (ws) => loadContent(ROOT, ws.contentDir);
/** The HTML only, for tests that do not care about the media list. */
const renderPreview = (content, options) => render(content, options).html;
const mainOf = (html) => /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';

test('a draft article previews as a full page, in its own language and direction', () => {
  const ws = fresh();
  ws.edit('articles/art_built001.json', (a) => { a.status = 'draft'; a.translations.en.status = 'draft'; delete a.publishedAt; });
  const html = renderPreview(load(ws), { kind: 'article', id: 'art_built001', lang: 'en', assets });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en" dir="ltr"/);
  assert.match(html, /<h1[^>]*>How this site is built<\/h1>/);
  const ar = renderPreview(load(ws), { kind: 'article', id: 'art_welcome1', lang: 'ar', assets });
  assert.match(ar, /<html lang="ar" dir="rtl"/);
});

test('the preview is static: no scripts, links open elsewhere, stylesheets come from the caller', () => {
  const html = renderPreview(load(fresh()), { kind: 'article', id: 'art_welcome1', lang: 'en', assets });
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<base target="_blank">/);
  for (const href of ['blob:theme', 'blob:base', 'blob:glass']) assert.ok(html.includes(`href="${href}"`), href);
  assert.doesNotMatch(html, /assets\/(theme|base|glass)\./);
});

test('light and dark can be forced; automatic leaves the choice to the browser', () => {
  const content = load(fresh());
  const base = { kind: 'article', id: 'art_welcome1', lang: 'en', assets };
  assert.match(renderPreview(content, { ...base, theme: 'dark' }), /<html[^>]*data-theme="dark"/);
  assert.match(renderPreview(content, { ...base, theme: 'light' }), /<html[^>]*data-theme="light"/);
  assert.doesNotMatch(renderPreview(content, base), /<html[^>]*data-theme=/);
});

test('media: the page reports exactly the files it uses, and the caller fills in the URLs', () => {
  const content = load(fresh());
  const { html, files } = render(content, { kind: 'article', id: 'art_welcome1', lang: 'en', assets });
  assert.ok(files.length > 0 && files.length < content.media.length + 1);
  for (const file of files) assert.ok(html.includes(`media:${file}`), file);
  assert.doesNotMatch(html, /\/media\/sample-cover/, 'no real site path is used');
  const filled = fillMedia(html, new Map(files.map((f) => [f, `blob:http://x/${f}`])));
  assert.doesNotMatch(filled, /media:sample/);
  for (const file of files) assert.ok(filled.includes(`blob:http://x/${file}`));
  const missing = fillMedia(html, new Map());
  assert.ok(missing.includes('data:,') && !missing.includes('media:'));
  const hostile = fillMedia(html, new Map(files.map((f) => [f, 'x" onerror="alert(1)'])));
  assert.ok(!hostile.includes('onerror'), 'an unsafe URL is never inserted');
});

test('only media the previewed page shows is requested (other pages\' covers are not)', () => {
  const content = load(fresh());
  const welcome = content.articles.find((a) => a.id === 'art_welcome1');
  Object.assign(welcome, { topicIds: [], tagIds: [], coverMediaId: undefined });
  welcome.translations.en.body = [{ id: 'blk_00000001', type: 'image', mediaId: 'med_9f3k2a04' }];
  for (const p of content.projects) p.relatedArticleIds = [];
  const { files } = render(content, { kind: 'article', id: 'art_welcome1', lang: 'en', assets });
  assert.deepEqual(files, ['sample-cover-4.svg']);
});

test('other drafts stay hidden: only the previewed record is forced public', () => {
  const ws = fresh();
  ws.edit('articles/art_built001.json', (a) => { a.status = 'draft'; a.translations.en.status = 'draft'; delete a.publishedAt; });
  ws.edit('articles/art_worklog1.json', (a) => { a.status = 'draft'; a.translations.en.status = 'draft'; delete a.publishedAt; });
  const content = load(ws);
  const blocks = sampleBlocks({ related: [{ kind: 'article', id: 'art_worklog1' }] });
  const welcome = content.articles.find((a) => a.id === 'art_welcome1');
  welcome.translations.en.body = blocks;
  const html = renderPreview(content, { kind: 'article', id: 'art_welcome1', lang: 'en', assets });
  assert.ok(!html.includes('keeping-a-work-log'), 'a draft article is not linked');
  assert.ok(!html.includes('how-this-site-is-built'));
});

test('a project previews too', () => {
  const html = renderPreview(load(fresh()), { kind: 'project', id: 'prj_archive1', lang: 'en', assets });
  assert.match(html, /Personal reading archive/);
});

test('fidelity: the preview of a published page has the same <main> as the real build', () => {
  const ws = fresh();
  const built = ws.build({ siteUrl: 'https://example.github.io', admin: false });
  assert.ok(built.ok);
  const real = mainOf(ws.html('en', 'blog', 'welcome-to-abdo'));
  const asReal = (html) => html.replace(/media:([A-Za-z0-9._%-]+)/g, '/media/$1');
  const preview = asReal(mainOf(renderPreview(load(ws), { kind: 'article', id: 'art_welcome1', lang: 'en', assets })));
  assert.ok(real.length > 500);
  assert.equal(preview, real);
  const realAr = mainOf(ws.html('ar', 'مدونة', 'مرحبا-بكم-في-عبده'));
  assert.equal(asReal(mainOf(renderPreview(load(ws), { kind: 'article', id: 'art_welcome1', lang: 'ar', assets }))), realAr);
});

test('unusable drafts give a clear error instead of a crash', () => {
  const content = load(fresh());
  const article = content.articles.find((a) => a.id === 'art_welcome1');
  article.translations.en.body = [{ id: 'blk_00000001', type: 'table', rows: [] }];
  assert.throws(() => renderPreview(content, { kind: 'article', id: 'art_welcome1', lang: 'en', assets }), PreviewError);
  assert.throws(() => renderPreview(content, { kind: 'article', id: 'art_nothere1', lang: 'en', assets }), /no article/);
  assert.throws(() => renderPreview(content, { kind: 'article', id: 'art_readar01', lang: 'en', assets }), /no "en" translation/);
});

test('previewStyles yields the same stylesheets the build writes', () => {
  const ws = fresh();
  const content = load(ws);
  const { themeCss, glassCss } = previewStyles(content);
  assert.ok(themeCss.includes('--font-heading'));
  assert.ok(glassCss.length > 0);
  const built = ws.build({ siteUrl: 'https://example.github.io', admin: false });
  assert.ok(built.ok);
  const file = (prefix) => readFileSync(join(ws.outDir, 'assets', readdirNames(ws.outDir).find((n) => n.startsWith(prefix))), 'utf8');
  assert.equal(themeCss, file('theme.'));
  assert.equal(glassCss, file('glass.'));
});

import { readdirSync } from 'node:fs';
function readdirNames(outDir) { return readdirSync(join(outDir, 'assets')); }
