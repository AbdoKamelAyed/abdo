import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createI18n } from '../src/lib/i18n.mjs';
import { wordCount } from '../src/lib/model.mjs';
import { ROOT, allFiles, allText, workspace } from './helpers.mjs';

const workspaces = [];
const fresh = () => { const w = workspace(); workspaces.push(w); return w; };
after(() => workspaces.forEach((w) => w.cleanup()));

// One shared build of the bundled content for the read-only checks.
let seed;
before(() => {
  seed = fresh();
  const result = seed.build({ siteUrl: 'https://example.github.io/abdo' });
  assert.ok(result.ok, JSON.stringify(result.errors));
});

// The public site's pages. The admin app (admin/) is a separate application with its own tests.
const pagesOf = (ws) => allFiles(ws.outDir).filter((f) => (f.endsWith('/index.html') || f === 'index.html') && !f.startsWith('admin/'));
const read = (ws, rel) => readFileSync(join(ws.outDir, rel), 'utf8');

// ------------------------------------------------------------------ structure

test('builds every expected page in both languages', () => {
  const files = new Set(allFiles(seed.outDir));
  const expected = [
    'index.html', '404.html', 'sitemap.xml', 'robots.txt', '.nojekyll',
    'ar/index.html', 'en/index.html',
    'en/blog/index.html', 'en/blog/welcome-to-abdo/index.html', 'en/blog/how-this-site-is-built/index.html', 'en/blog/notes-on-keeping-a-work-log/index.html',
    'ar/مدونة/index.html', 'ar/مدونة/مرحبا-بكم-في-عبده/index.html', 'ar/مدونة/قراءة-بطيئة/index.html',
    'en/portfolio/personal-reading-archive/index.html', 'ar/أعمال/أرشيف-القراءة-الشخصي/index.html',
    'en/topics/ideas/index.html', 'en/topics/writing/index.html', 'ar/مواضيع/أفكار/index.html',
    'en/tags/notes/index.html', 'ar/وسوم/ملاحظات/index.html',
    'en/about/index.html', 'ar/عني/index.html', 'en/contact/index.html', 'ar/تواصل/index.html',
    'en/search/index.html', 'ar/بحث/index.html',
  ];
  for (const f of expected) assert.ok(files.has(f), `missing ${f}`);
  assert.equal(pagesOf(seed).length, 47); // 23 pages per language (including search) + the root redirect
});

test('languages are independent: an article that exists in one language only stays there', () => {
  assert.ok(!existsSync(join(seed.outDir, 'en', 'blog', 'قراءة-بطيئة')));
  assert.ok(!allFiles(seed.outDir).some((f) => f.startsWith('ar/') && f.includes('notes-on-keeping')));
  assert.ok(!read(seed, 'en/blog/index.html').includes('قراءة بطيئة'));
});

test('every page declares language and direction, has one h1, a title, a canonical URL and a viewport', () => {
  for (const file of pagesOf(seed)) {
    if (file === 'index.html') continue; // the root redirect has no content
    const html = read(seed, file);
    const lang = file.startsWith('ar/') ? 'ar' : file.startsWith('en/') ? 'en' : 'ar'; // 404 uses the default language
    assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`), file);
    if (file !== '404.html') {
      assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, `${file}: expected exactly one h1`);
      assert.match(html, /<link rel="canonical" href="https:\/\/example\.github\.io\/abdo\//, file);
    }
    assert.match(html, /<title>[^<]+<\/title>/, file);
    assert.match(html, /<meta name="viewport"/, file);
    assert.match(html, /<meta name="description" content="[^"]+"/, file);
  }
});

test('no template accident leaks into the output', () => {
  // The search page carries its interface strings as a JSON data block; their {n} / {q} placeholders are filled in the browser.
  const text = allText(seed.outDir, ['.html']).replace(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>/g, '');
  for (const bad of ['undefined', '[object Object]', 'NaN', 'null<', '{n}', '{date}', '{name}', '{year}']) {
    assert.ok(!text.includes(bad), `output contains "${bad}"`);
  }
});

test('hreflang alternates are reciprocal and point at real pages', () => {
  const urlToFile = (url) => {
    const path = decodeURIComponent(new URL(url).pathname).replace(/^\/abdo\//, '');
    return path.endsWith('/') ? `${path}index.html` : path;
  };
  let checked = 0;
  for (const file of pagesOf(seed)) {
    const html = read(seed, file);
    const self = (html.match(/<link rel="canonical" href="([^"]+)"/) ?? [])[1];
    if (!self) continue;
    for (const [, code, href] of html.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)"/g)) {
      if (code === 'x-default') continue;
      const target = urlToFile(href);
      assert.ok(existsSync(join(seed.outDir, target)), `${file}: hreflang ${code} -> missing ${target}`);
      const back = read(seed, target);
      assert.ok(back.includes(`hreflang="${file.startsWith('ar/') ? 'ar' : 'en'}" href="${self}"`), `${file}: ${target} does not link back`);
      checked += 1;
    }
  }
  assert.ok(checked > 40, `only ${checked} alternates checked`);
});

test('sitemap: absolute, percent-encoded, one entry per page, with language alternates', () => {
  const xml = read(seed, 'sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, 44); // every content page; the root redirect and 404 are not listed
  for (const loc of locs) {
    assert.match(loc, /^https:\/\/example\.github\.io\/abdo\//);
    assert.ok(/^[\x20-\x7e]+$/.test(loc), `non-ASCII character in ${loc}`);
  }
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="x-default"/);
  assert.match(read(seed, 'robots.txt'), /Sitemap: https:\/\/example\.github\.io\/abdo\/sitemap\.xml/);
});

test('structured data is valid JSON and matches page types', () => {
  const blocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const article = blocks(read(seed, 'en/blog/welcome-to-abdo/index.html'));
  const post = article.find((b) => b['@type'] === 'BlogPosting');
  assert.equal(post.headline, 'Welcome to ABDO');
  assert.equal(post.inLanguage, 'en');
  assert.ok(post.datePublished && post.dateModified && post.author.name === 'Abdo');
  assert.equal(post.keywords, 'Notes, Design');
  assert.ok(article.some((b) => b['@type'] === 'BreadcrumbList'));
  assert.ok(blocks(read(seed, 'en/index.html')).some((b) => b['@type'] === 'WebSite'));
  assert.ok(blocks(read(seed, 'en/about/index.html')).some((b) => b['@type'] === 'ProfilePage'));
  assert.ok(blocks(read(seed, 'en/portfolio/personal-reading-archive/index.html')).some((b) => b['@type'] === 'CreativeWork'));
  // No Organization schema: ABDO is a person.
  assert.ok(!allText(seed.outDir, ['.html']).includes('"Organization"'));
  // The raster-only rule: sample covers are SVG, so no og:image / image property is advertised.
  assert.ok(!read(seed, 'en/blog/welcome-to-abdo/index.html').includes('og:image'));
  assert.equal(post.image, undefined);
});

// ------------------------------------------------------------------ visibility rules

test('drafts, private content and unreferenced media never reach the output', () => {
  const ws = fresh();
  ws.edit('articles/art_worklog1.json', (a) => { a.status = 'draft'; delete a.publishedAt; });
  ws.edit('articles/art_built001.json', (a) => { a.translations.ar.status = 'draft'; });
  ws.edit('taxonomy/topics.json', (t) => { t.items.find((x) => x.id === 'top_make0001').visibility = 'private'; });
  ws.edit('taxonomy/tags.json', (t) => { t.items.find((x) => x.id === 'tag_syst0001').status = 'draft'; });
  ws.edit('projects/prj_planner1.json', (p) => { p.status = 'draft'; delete p.publishedAt; });
  ws.edit('articles/art_welcome1.json', (a) => { a.translations.en.body[1].hidden = true; });
  // sample-cover-4 is used only by this article's cover and this project's gallery: both drafts.
  ws.edit('articles/art_readar01.json', (a) => { a.status = 'draft'; delete a.publishedAt; });
  ws.edit('projects/prj_archive1.json', (p) => { p.status = 'draft'; delete p.publishedAt; });
  const result = ws.build();
  assert.ok(result.ok, JSON.stringify(result.errors));

  const everything = allText(ws.outDir);
  assert.ok(!everything.includes('Notes on keeping a work log'), 'draft article title leaked');
  assert.ok(!everything.includes('notes-on-keeping-a-work-log'), 'draft article slug leaked');
  assert.ok(!everything.includes('Home maintenance planner'), 'draft project leaked');
  assert.ok(!everything.includes('What a page is made of'), 'hidden block leaked');
  assert.ok(!existsSync(join(ws.outDir, 'ar', 'مواضيع', 'صناعة')), 'private topic page exists');
  assert.ok(!existsSync(join(ws.outDir, 'en', 'tags', 'systems')), 'draft tag page exists');
  // A draft translation does not hide the other language.
  assert.ok(existsSync(join(ws.outDir, 'en', 'blog', 'how-this-site-is-built', 'index.html')));
  assert.ok(!existsSync(join(ws.outDir, 'ar', 'مدونة', 'كيف-بني-هذا-الموقع')));
  // The English page no longer advertises an Arabic alternate that does not exist.
  assert.ok(!ws.html('en', 'blog', 'how-this-site-is-built').includes('<link rel="alternate" hreflang="ar"'));
  // The private section of the profile is never published.
  assert.ok(!everything.includes('Private note') && !everything.includes('ملاحظة خاصة'));
  // Media that only unpublished content used is not copied; media still in use is.
  assert.ok(!existsSync(join(ws.outDir, 'media', 'sample-cover-4.svg')), 'media used only by drafts was published');
  assert.ok(existsSync(join(ws.outDir, 'media', 'sample-cover-3.svg')), 'media used by published content is missing');
});

test('topic pages include content from sub-topics', () => {
  const ws = fresh();
  ws.edit('articles/art_worklog1.json', (a) => { a.topicIds = ['top_writ0001']; });
  ws.edit('articles/art_welcome1.json', (a) => { a.topicIds = ['top_tech0001']; });
  assert.ok(ws.build().ok);
  const ideas = ws.html('en', 'topics', 'ideas');
  assert.ok(ideas.includes('Notes on keeping a work log'), 'article from the child topic should roll up to the parent');
  assert.match(ideas, /Subtopics/);
});

test('related articles come from shared topics and tags', () => {
  const html = seed.html('en', 'blog', 'welcome-to-abdo');
  assert.match(html, /Related articles/);
  assert.ok(html.includes('/abdo/en/blog/notes-on-keeping-a-work-log/'));
});

// ------------------------------------------------------------------ security

test('hostile content is escaped everywhere it is rendered', () => {
  const ws = fresh();
  const evil = '</script><script>alert(1)</script><img src=x onerror=alert(1)>';
  ws.edit('articles/art_built001.json', (a) => {
    a.translations.en.title = evil;
    a.translations.en.excerpt = evil;
    a.translations.en.body[0].text = `${evil} [x](javascript:alert(1))`;
  });
  ws.edit('taxonomy/topics.json', (t) => { t.items[0].translations.en.name = evil; });
  assert.ok(ws.build().ok);
  const text = allText(ws.outDir, ['.html']);
  assert.ok(!text.includes('<script>alert(1)'), 'raw script tag in output');
  assert.ok(!text.includes('<img src=x onerror'), 'raw img tag in output');
  assert.ok(!/href="javascript:/i.test(text), 'javascript: link in output');
  // JSON-LD still parses even though the title contains </script>.
  const html = ws.html('en', 'blog', 'how-this-site-is-built');
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
});

test('the build refuses to wipe a folder it did not create', () => {
  const ws = fresh();
  mkdirSync(ws.outDir);
  writeFileSync(join(ws.outDir, 'precious.txt'), 'do not delete');
  assert.throws(() => ws.build(), /Refusing to overwrite .* not created by this build/);
  assert.ok(existsSync(join(ws.outDir, 'precious.txt')));
});

test('rebuilding into its own output folder works', () => {
  const ws = fresh();
  assert.ok(ws.build().ok);
  assert.ok(ws.build().ok);
  assert.ok(existsSync(join(ws.outDir, 'ar', 'index.html')));
});

// ------------------------------------------------------------------ URLs and base paths

test('every internal link honours the base path (GitHub project pages)', () => {
  for (const file of pagesOf(seed)) {
    for (const m of read(seed, file).matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) {
      assert.ok(m[1].startsWith('/abdo/'), `${file}: ${m[1]} ignores the base path`);
    }
  }
});

test('a site served from the domain root has no base path', () => {
  const ws = fresh();
  assert.ok(ws.build({ siteUrl: 'https://abdo.example' }).ok);
  const html = ws.html('en');
  assert.ok(html.includes('href="/en/blog/"'));
  assert.ok(html.includes('href="https://abdo.example/en/"'));
});

test('Arabic URLs are percent-encoded in links and raw on disk', () => {
  const html = seed.html('ar');
  assert.ok(html.includes('/abdo/ar/%D9%85%D8%AF%D9%88%D9%86%D8%A9/'));
  assert.ok(!/href="[^"]*[؀-ۿ]/.test(html), 'unencoded Arabic in an href');
});

test('root page redirects by browser language and falls back to the default language', () => {
  const html = read(seed, 'index.html');
  assert.match(html, /navigator\.language/);
  assert.match(html, /<noscript><meta http-equiv="refresh" content="0; url=\/abdo\/ar\/">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.github\.io\/abdo\/ar\/">/);
  assert.ok(!html.includes('<link rel="alternate"'), 'the root redirect is not part of the language set');
});

test('404 page works from any depth: assets use absolute paths and both languages are offered', () => {
  const html = read(seed, '404.html');
  assert.match(html, /href="\/abdo\/assets\/base\.[0-9a-f]{8}\.css"/);
  assert.match(html, /الصفحة غير موجودة/);
  assert.match(html, /Page not found/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!html.includes('rel="canonical"'));
});

// ------------------------------------------------------------------ sample content

test('the sample banner shows while sample content exists', () => {
  assert.match(seed.html('en'), /class="sample-banner"/);
});

test('--exclude-samples refuses to run while the profile is still a sample', () => {
  const ws = fresh();
  const result = ws.build({ excludeSamples: true });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /profile is still marked "sample": true/);
});

test('--exclude-samples builds a clean site once the profile is real', () => {
  const ws = fresh();
  ws.edit('profile/author.json', (p) => { delete p.sample; });
  const result = ws.build({ excludeSamples: true });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.equal(result.hasSample, false);
  const everything = allText(ws.outDir, ['.html']);
  assert.ok(!everything.includes('sample-banner'));
  assert.ok(!everything.includes('Welcome to ABDO'));
  assert.match(ws.html('en', 'blog'), /No articles yet/);
  assert.ok(!existsSync(join(ws.outDir, 'media')), 'sample media should not be copied');
});

test('--exclude-samples reports real content that still depends on removed samples', () => {
  const ws = fresh();
  ws.edit('profile/author.json', (p) => { delete p.sample; });
  ws.edit('articles/art_built001.json', (a) => { delete a.sample; });
  const result = ws.build({ excludeSamples: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.map((e) => e.message).join('\n'), /unknown topic "top_tech0001"/);
});

// ------------------------------------------------------------------ configuration

test('a site with one language has no language switch and no hreflang', () => {
  const ws = fresh();
  ws.edit('config/languages.json', (l) => { l.items[1].enabled = false; });
  const result = ws.build();
  assert.ok(result.ok, JSON.stringify(result.errors));
  const html = ws.html('ar');
  assert.ok(!html.includes('lang-switch') && !html.includes('hreflang'));
  assert.ok(!existsSync(join(ws.outDir, 'en')));
});

test('a site with no articles or projects still builds, with empty states', () => {
  const ws = fresh();
  for (const dir of ['articles', 'projects']) {
    for (const f of allFiles(join(ws.contentDir, dir))) rmSync(join(ws.contentDir, dir, f));
  }
  const result = ws.build();
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.match(ws.html('en', 'blog'), /No articles yet/);
  assert.match(ws.html('ar', 'أعمال'), /لا توجد أعمال بعد/);
  // Topics and tags with nothing in them get no page and are not listed.
  assert.ok(!existsSync(join(ws.outDir, 'en', 'topics', 'ideas')));
  assert.match(ws.html('en', 'topics'), /No topics yet/);
  // Content-free homepage sections are omitted rather than rendered empty.
  assert.ok(!ws.html('en').includes('Latest articles'));
});

test('changing the design preset changes only CSS, never page content', () => {
  const ws = fresh();
  assert.ok(ws.build().ok);
  const before = pagesOf(ws).map((f) => [f, read(ws, f).replace(/assets\/(theme|glass|base)\.[0-9a-f]{8}/g, 'assets/$1.X')]);
  ws.edit('config/design.json', (d) => { d.preset = 'classic-newspaper'; d.glass.enabled = false; });
  assert.ok(ws.build().ok);
  for (const [f, html] of before) {
    assert.equal(read(ws, f).replace(/assets\/(theme|glass|base)\.[0-9a-f]{8}/g, 'assets/$1.X'), html, `${f} changed with the preset`);
  }
  assert.match(allText(ws.outDir, ['.css']), /classic-newspaper/);
});

test('asset file names change when their content changes (cache busting)', () => {
  const ws = fresh();
  assert.ok(ws.build().ok);
  const first = allFiles(join(ws.outDir, 'assets')).sort();
  ws.edit('config/design.json', (d) => { d.preset = 'luxury-editorial'; });
  assert.ok(ws.build().ok);
  const second = allFiles(join(ws.outDir, 'assets')).sort();
  assert.notDeepEqual(first.filter((f) => f.startsWith('theme')), second.filter((f) => f.startsWith('theme')));
  assert.deepEqual(first.filter((f) => f.startsWith('base')), second.filter((f) => f.startsWith('base')));
});

// ------------------------------------------------------------------ language helpers

test('Arabic plural forms follow Arabic grammar', () => {
  const ar = JSON.parse(readFileSync(join(ROOT, 'content/i18n/ar.json'), 'utf8')).strings;
  const lang = JSON.parse(readFileSync(join(ROOT, 'content/config/languages.json'), 'utf8')).items[0];
  const i18n = createI18n(lang, ar, 'Africa/Cairo');
  assert.equal(i18n.plural('articles_count', 1), 'مقال واحد');
  assert.equal(i18n.plural('articles_count', 2), 'مقالان');
  assert.equal(i18n.plural('articles_count', 5), '5 مقالات');
  assert.equal(i18n.plural('articles_count', 11), '11 مقالًا');
  assert.equal(i18n.plural('articles_count', 100), '100 مقال');
});

test('English plurals and the numerals setting', () => {
  const en = JSON.parse(readFileSync(join(ROOT, 'content/i18n/en.json'), 'utf8')).strings;
  const langs = JSON.parse(readFileSync(join(ROOT, 'content/config/languages.json'), 'utf8')).items;
  const i18nEn = createI18n(langs[1], en, 'Africa/Cairo');
  assert.equal(i18nEn.plural('projects_count', 1), '1 project');
  assert.equal(i18nEn.plural('projects_count', 3), '3 projects');
  const ar = JSON.parse(readFileSync(join(ROOT, 'content/i18n/ar.json'), 'utf8')).strings;
  const arab = createI18n({ ...langs[0], numerals: 'arab' }, ar, 'Africa/Cairo');
  assert.match(arab.date('2026-11-01T09:00:00+02:00'), /[٠-٩]/);
  const latn = createI18n(langs[0], ar, 'Africa/Cairo');
  assert.match(latn.date('2026-11-01T09:00:00+02:00'), /2026/);
});

test('dates use the site time zone, not the build machine\'s', () => {
  const en = JSON.parse(readFileSync(join(ROOT, 'content/i18n/en.json'), 'utf8')).strings;
  const lang = JSON.parse(readFileSync(join(ROOT, 'content/config/languages.json'), 'utf8')).items[1];
  // 23:30 UTC on 31 October is already 1 November in Cairo (UTC+2).
  assert.match(createI18n(lang, en, 'Africa/Cairo').date('2026-10-31T23:30:00Z'), /1 November 2026/);
  assert.match(createI18n(lang, en, 'UTC').date('2026-10-31T23:30:00Z'), /31 October 2026/);
});

test('word counts ignore markup and include list items', () => {
  assert.equal(wordCount([
    { type: 'paragraph', text: 'one **two** [three](https://x.test)' },
    { type: 'list', items: ['four five', 'six'] },
    { type: 'paragraph', text: 'hidden words here', hidden: true },
    { type: 'divider' },
  ]), 6);
});

test('every interface string used in the source exists in every language', () => {
  const sources = ['src/render/layout.mjs', 'src/render/pages.mjs', 'src/render/components.mjs', 'src/build.mjs', 'src/lib/model.mjs']
    .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  const used = new Set();
  for (const m of sources.matchAll(/\b(?:i18n|def\.i18n|L\.i18n)\.t\('([a-z_-]+)'/g)) used.add(m[1]);
  for (const m of sources.matchAll(/\bt\('([a-z_-]+)'/g)) used.add(m[1]);
  for (const m of sources.matchAll(/plural\('([a-z_]+)'/g)) used.add(`${m[1]}_other`);
  for (const s of ['featured', 'articles', 'projects', 'topics', 'highlights', 'follow']) used.add(`sec_${s}`);
  for (const s of ['planned', 'in-progress', 'completed', 'paused']) used.add(`project_status_${s}`);
  assert.ok(used.size > 40);
  for (const lang of ['ar', 'en']) {
    const strings = JSON.parse(readFileSync(join(ROOT, `content/i18n/${lang}.json`), 'utf8')).strings;
    for (const key of used) assert.ok(key in strings, `"${key}" is used in the source but missing from ${lang}.json`);
  }
});
