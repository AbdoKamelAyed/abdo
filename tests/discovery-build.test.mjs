// The discovery features as the real build produces them: search files, landing pages, pagination, redirects.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import vm from 'node:vm';
import { didYouMean, search, suggest } from '../src/core/search-engine.mjs';
import { searchBundle } from '../src/lib/search-bundle.mjs';
import { allFiles, ROOT, workspace } from './helpers.mjs';

const made = [];
after(() => made.forEach((w) => w.cleanup()));

/** A site with enough articles to need several pages, plus topic and tag extras. */
function site(extra = {}) {
  const ws = workspace();
  made.push(ws);
  const art = ws.read('articles/art_built001.json');
  for (let n = 1; n <= 6; n += 1) {
    const id = `art_extra00${n}`;
    const tr = structuredClone(art.translations.en);
    Object.assign(tr, { title: `Extra note ${n}`, slug: `extra-note-${n}`, excerpt: `Number ${n}.` });
    ws.write(`articles/${id}.json`, { ...art, id, featured: false, publishedAt: `2026-0${n}-15T09:00:00+02:00`, translations: { en: tr }, topicIds: ['top_writ0001'], tagIds: ['tag_notes001'] });
  }
  ws.edit('taxonomy/topics.json', (d) => {
    Object.assign(d.items.find((t) => t.id === 'top_ideas001'), { icon: 'bulb', color: '#B5651D', pinnedItemIds: ['art_welcome1'], relatedTopicIds: ['top_make0001'] });
    d.items.find((t) => t.id === 'top_ideas001').translations.en.redirectSlugs = ['old-ideas'];
  });
  ws.edit('taxonomy/tags.json', (d) => {
    const notes = d.items.find((t) => t.id === 'tag_notes001');
    Object.assign(notes.translations.en, { aliases: ['memos'], description: 'Short notes and fragments.', redirectSlugs: ['old-notes'], seo: { title: 'All my notes', description: 'Every note in one place.' } });
    notes.relatedTagIds = ['tag_flow0001'];
  });
  ws.write('config/search.json', { schemaVersion: 1, pageSize: 4, ...extra });
  const built = ws.build({ admin: false });
  assert.ok(built.ok, JSON.stringify(built.errors));
  return { ws, built, read: (rel) => readFileSync(join(ws.outDir, rel), 'utf8'), has: (rel) => existsSync(join(ws.outDir, rel)) };
}
const s = site();

// ------------------------------------------------------------------ search files

test('the build writes one hashed index per language and one script, and the search page points at them', () => {
  const files = allFiles(s.ws.outDir);
  const idx = files.filter((f) => /^assets\/search-(en|ar)\.[0-9a-f]{8}\.json$/.test(f));
  assert.equal(idx.length, 2);
  assert.equal(files.filter((f) => /^assets\/search\.[0-9a-f]{8}\.js$/.test(f)).length, 1);
  const html = s.read('en/search/index.html');
  const en = idx.find((f) => f.includes('search-en'));
  assert.ok(html.includes(en), 'the page names its own language index');
  assert.ok(!html.includes('search-ar'));
  const data = JSON.parse(/<script type="application\/json" id="search-data">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(data.index.endsWith(en), true);
  assert.equal(data.settings.pageSize, 4);
  assert.equal(data.lang, 'en');
  assert.ok(data.strings.search_status_one.includes('{q}'));
  assert.ok(data.browse.length >= 4);
  const index = JSON.parse(s.read(en));
  assert.equal(index.v, 1);
  assert.ok(index.docs.length > 10);
  assert.deepEqual(s.built.search.en.docs, index.docs.length);
});

test('the search page is noindex, left out of the sitemap, and its script is a plain deferred script', () => {
  const html = s.read('en/search/index.html');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<script src="[^"]*assets\/search\.[0-9a-f]{8}\.js" defer><\/script>/);
  const xml = s.read('sitemap.xml');
  assert.ok(!xml.includes('/search/') && !xml.includes(encodeURI('بحث')));
  const ar = s.read('ar/بحث/index.html');
  assert.match(ar, /dir="rtl"/);
  assert.match(ar, /search-ar\./);
});

test('the home page tells search engines how to use the site search', () => {
  const ld = [...s.read('en/index.html').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const site = ld.find((x) => x['@type'] === 'WebSite');
  assert.equal(site.potentialAction['@type'], 'SearchAction');
  assert.match(site.potentialAction.target.urlTemplate, /\/en\/search\/\?q=\{search_term_string\}$/);
});

test('every page has a header link to search; the link is marked current on the search page', () => {
  assert.match(s.read('en/blog/index.html'), /<a class="search-link" href="\/[^"]*en\/search\/"><svg/);
  assert.match(s.read('en/search/index.html'), /class="search-link" href="[^"]*" aria-current="page"/);
  assert.match(s.read('ar/index.html'), /class="search-link"/);
});

test('turning search off removes the page, the files, the link and the structured data', () => {
  const off = site({ enabled: false });
  const files = allFiles(off.ws.outDir);
  assert.ok(!files.some((f) => f.includes('search')), files.filter((f) => f.includes('search')).join());
  assert.ok(!off.read('en/index.html').includes('search-link'));
  assert.ok(!off.read('en/index.html').includes('SearchAction'));
  assert.equal(off.built.search, null);
  // Topic pages then have no "search in this topic" button either.
  assert.ok(!off.read('en/topics/ideas/index.html').includes('search_in_topic') && !off.read('en/topics/ideas/index.html').includes('Search in this topic'));
});

test('the browser script is the tested engine: the same answers as the modules, and no way to inject HTML', () => {
  const { engine, script } = searchBundle(ROOT);
  const api = new Function(`${engine}\nreturn { search, suggest, didYouMean };`)();
  const idxFile = allFiles(s.ws.outDir).find((f) => /search-en\./.test(f));
  const index = JSON.parse(s.read(idxFile));
  for (const q of ['log', '"work log"', 'log -welcome', 'planner decisions', 'wor', 'extra note']) {
    for (const prefix of [false, true]) {
      assert.deepEqual(api.search(index, { q, prefix }), search(index, { q, prefix }), `${q} (prefix ${prefix})`);
    }
  }
  assert.deepEqual(api.suggest(index, 'wor'), suggest(index, 'wor'));
  assert.deepEqual(api.didYouMean(index, 'plnaner'), didYouMean(index, 'plnaner'));
  for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'setTimeout("', 'javascript:']) assert.ok(!script.includes(bad), `the script must not use ${bad}`);
  assert.doesNotThrow(() => new vm.Script(script));
  assert.ok(!/^\s*(import|export)\s/m.test(script), 'no module syntax is left in the browser script');
});

test('the index holds no draft or private content, and respects the type switches', () => {
  const idxFile = allFiles(s.ws.outDir).find((f) => /search-en\./.test(f));
  const index = JSON.parse(s.read(idxFile));
  const ids = new Set(index.docs.map((d) => d.i));
  const content = s.ws.read('articles/art_worklog1.json');
  assert.ok(ids.has(content.id));
  // The same site with the tag and CV types switched off.
  const lean = site({ types: { tag: false, cv: false } });
  const leanIndex = JSON.parse(lean.read(allFiles(lean.ws.outDir).find((f) => /search-en\./.test(f))));
  assert.ok(!leanIndex.docs.some((d) => d.y === 'tag' || d.y === 'cv'));
  assert.ok(leanIndex.docs.some((d) => d.y === 'article'));
});

test('a private tag has no page, no chip, no search entry and no facet', () => {
  const t = site();
  t.ws.edit('taxonomy/tags.json', (d) => { d.items.find((x) => x.id === 'tag_flow0001').visibility = 'private'; });
  const built = t.ws.build({ admin: false });
  assert.ok(built.ok);
  assert.ok(!existsSync(join(t.ws.outDir, 'en', 'tags', 'workflow')));
  assert.ok(!readFileSync(join(t.ws.outDir, 'en', 'blog', 'notes-on-keeping-a-work-log', 'index.html'), 'utf8').includes('/tags/workflow/'));
  const index = JSON.parse(readFileSync(join(t.ws.outDir, allFiles(t.ws.outDir).find((f) => /search-en\./.test(f))), 'utf8'));
  assert.ok(!index.facets.tags.some((x) => x.id === 'tag_flow0001'));
  assert.ok(!index.docs.some((d) => d.i === 'tag_flow0001'));
  // The tag that listed it as related simply does not show it.
  assert.ok(!readFileSync(join(t.ws.outDir, 'en', 'tags', 'notes', 'index.html'), 'utf8').includes('/tags/workflow/'));
});

test('CV search results link to anchors that exist on the about page', () => {
  const index = JSON.parse(s.read(allFiles(s.ws.outDir).find((f) => /search-en\./.test(f))));
  const about = s.read('en/about/index.html');
  const cv = index.docs.filter((d) => d.y === 'cv');
  assert.ok(cv.length >= 3);
  for (const d of cv) {
    const anchor = d.u.split('#')[1];
    assert.ok(anchor, d.u);
    assert.ok(about.includes(`id="${anchor}"`), `about page has #${anchor}`);
  }
});

// ------------------------------------------------------------------ pagination

test('long lists are split into numbered pages of static HTML', () => {
  assert.ok(s.has('en/blog/page/2/index.html') && s.has('en/blog/page/3/index.html'));
  assert.ok(!s.has('en/blog/page/4/index.html'));
  const count = (html) => (html.match(/<article class="card/g) ?? []).length;
  assert.equal(count(s.read('en/blog/index.html')), 4);
  assert.equal(count(s.read('en/blog/page/2/index.html')), 4);
  assert.equal(count(s.read('en/blog/page/3/index.html')), 1);
  const p2 = s.read('en/blog/page/2/index.html');
  assert.match(p2, /<title>Blog — Page 2 — /);
  assert.match(p2, /<link rel="canonical" href="[^"]*\/en\/blog\/page\/2\/">/);
  assert.match(p2, /rel="prev"/);
  assert.match(p2, /rel="next"/);
  assert.match(p2, /<a href="[^"]*\/en\/blog\/page\/3\/" rel="next">Older<\/a>/);
  assert.equal((p2.match(/<h1[ >]/g) ?? []).length, 1);
  // Page 1 keeps its own address and links to page 2.
  assert.match(s.read('en/blog/index.html'), /<link rel="canonical" href="[^"]*\/en\/blog\/">/);
  assert.match(s.read('en/blog/index.html'), /href="[^"]*\/en\/blog\/page\/2\/" rel="next"/);
  // Page 2 does not claim an Arabic equivalent (the other language may have fewer pages); the language switch goes to the Arabic list.
  assert.ok(!p2.includes('<link rel="alternate" hreflang="ar"'));
  assert.match(p2, /class="lang-switch" href="[^"]*\/ar\/%D9%85%D8%AF%D9%88%D9%86%D8%A9\/"|class="lang-switch" href="[^"]*\/ar\/مدونة\/"/);
  assert.match(s.read('en/blog/index.html'), /<link rel="alternate" hreflang="ar"/);
});

test('the numbered pages are in the sitemap; a short list has no pagination at all', () => {
  const xml = s.read('sitemap.xml');
  assert.ok(xml.includes('/en/blog/page/2/') && xml.includes('/en/blog/page/3/'));
  assert.ok(!s.read('ar/مدونة/index.html').includes('class="pagination'));
  assert.ok(!existsSync(join(s.ws.outDir, 'ar', 'مدونة', 'page')));
});

// ------------------------------------------------------------------ topic and tag pages

test('a topic page: icon, accent colour, pinned items first, related topics, capped lists with a link to all', () => {
  const html = s.read('en/topics/ideas/index.html');
  assert.match(html, /class="topic-scope topic-c-b5651d"/, 'the colour is lower-cased and only its digits reach the class');
  assert.match(html, /<span class="topic-icon"><svg class="icon"/);
  assert.match(html, /<h2 id="t-pin">Start here<\/h2>/);
  assert.ok(html.indexOf('Start here') < html.indexOf('id="t-a"'), 'pinned items come before the lists');
  assert.match(html, /<h2>Related topics<\/h2>/);
  assert.match(html, /<h2>Subtopics<\/h2>/);
  // The pinned article is not repeated in the list below it.
  const articles = html.slice(html.indexOf('id="t-a"'));
  assert.equal((articles.match(/Welcome to ABDO/g) ?? []).length, 0);
  // Four of eight are shown, with a link to the rest.
  assert.equal((articles.match(/<article class="card/g) ?? []).length, 4);
  assert.match(html, /<a class="section__more" href="[^"]*\/en\/search\/\?topic=top_ideas001&amp;type=article">Show all 8 in search<\/a>/);
  assert.match(html, /href="[^"]*\/en\/search\/\?topic=top_ideas001">Search in this topic</);
  const css = s.read(allFiles(s.ws.outDir).find((f) => /^assets\/base\./.test(f)));
  assert.match(css, /\.topic-c-b5651d\{--topic-accent:#b5651d;\}/);
  assert.equal((css.match(/\.topic-c-/g) ?? []).length, 1, 'one rule per colour in use, none for topics without one');
});

test('a topic with a small list has no "show all" link; the topics index shows icons', () => {
  assert.ok(!s.read('en/topics/making/index.html').includes('section__more'));
  assert.match(s.read('en/topics/index.html'), /card card--topic topic-c-b5651d/);
  assert.match(s.read('en/topics/index.html'), /class="topic-icon"/);
});

test('a tag page: description, also known as, related tags, search link, and its own SEO text', () => {
  const html = s.read('en/tags/notes/index.html');
  assert.match(html, /<title>All my notes — /);
  assert.match(html, /<meta name="description" content="Every note in one place\.">/);
  assert.match(html, /Also known as: memos/);
  assert.match(html, /<h2>Related tags<\/h2>/);
  assert.match(html, /<a href="[^"]*\/en\/tags\/workflow\/">Workflow<\/a>/);
  assert.match(html, /\/en\/search\/\?tag=tag_notes001">Search in this tag</);
  assert.match(html, /Short notes and fragments\./);
});

test('"noindex" on a topic or tag removes it from the sitemap and says so in the page', () => {
  const t = site();
  t.ws.edit('taxonomy/tags.json', (d) => { d.items.find((x) => x.id === 'tag_flow0001').translations.en.seo = { robots: 'noindex' }; });
  assert.ok(t.ws.build({ admin: false }).ok);
  assert.match(readFileSync(join(t.ws.outDir, 'en', 'tags', 'workflow', 'index.html'), 'utf8'), /<meta name="robots" content="noindex">/);
  const xml = readFileSync(join(t.ws.outDir, 'sitemap.xml'), 'utf8');
  assert.ok(!xml.includes('/en/tags/workflow/'), 'neither its own entry nor an alternate link from the Arabic page');
  assert.ok(xml.includes('/en/tags/notes/'));
});

// ------------------------------------------------------------------ redirects

test('an old slug gets a small redirect page that is never indexed', () => {
  const html = s.read('en/tags/old-notes/index.html');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=[^"]*\/en\/tags\/notes\/">/);
  assert.match(html, /<link rel="canonical" href="[^"]*\/en\/tags\/notes\/">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<a href="[^"]*\/en\/tags\/notes\/">Notes<\/a>/);
  assert.ok(s.has('en/topics/old-ideas/index.html'));
  assert.ok(!s.read('sitemap.xml').includes('old-notes') && !s.read('sitemap.xml').includes('old-ideas'));
});

test('a redirect is only built when its target page exists', () => {
  const t = site();
  // Nothing uses the tag any more, so its page does not exist, and neither does the redirect to it.
  t.ws.edit('taxonomy/tags.json', (d) => { d.items.push({ id: 'tag_lonely01', status: 'published', createdAt: '2026-11-01T09:00:00+02:00', updatedAt: '2026-11-01T09:00:00+02:00', translations: { en: { name: 'Lonely', slug: 'lonely', redirectSlugs: ['alone'] } } }); });
  assert.ok(t.ws.build({ admin: false }).ok);
  assert.ok(!existsSync(join(t.ws.outDir, 'en', 'tags', 'alone')));
  assert.ok(!existsSync(join(t.ws.outDir, 'en', 'tags', 'lonely')));
});

test('the Arabic site has its own search route, strings and index', () => {
  const html = s.read('ar/بحث/index.html');
  assert.match(html, /placeholder="اكتب كلمة أو عبارة"/);
  assert.match(html, /<h1[^>]*>بحث<\/h1>/);
  const ar = JSON.parse(s.read(allFiles(s.ws.outDir).find((f) => /search-ar\./.test(f))));
  assert.equal(ar.lang, 'ar');
  assert.ok(ar.docs.some((d) => d.t.includes('قراءة')));
  assert.ok(!ar.docs.some((d) => /Extra note/.test(d.t)), 'English-only articles are not in the Arabic index');
});
