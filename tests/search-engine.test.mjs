import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSearchIndex } from '../src/lib/search-index.mjs';
import { buildModel } from '../src/lib/model.mjs';
import { loadContent } from '../src/lib/validate.mjs';
import { didYouMean, highlight, parseQuery, recommend, relatedSearches, search, snippet, suggest } from '../src/core/search-engine.mjs';
import { searchSettings } from '../src/core/search-settings.mjs';
import { ROOT } from './helpers.mjs';

// ---------------------------------------------------------------- a small hand-made site (English)

const para = (text) => ({ type: 'paragraph', text });
const head = (text) => ({ type: 'heading', level: 2, text });
const topic = (id, name, extra = {}) => ({ id, name, url: `/en/topics/${id}/`, count: 1, description: '', parentId: null, ...extra });
const tag = (id, name, extra = {}) => ({ id, name, url: `/en/tags/${id}/`, count: 1, ...extra });
const ideas = topic('t_ideas', 'Ideas', { count: 3 });
const writing = topic('t_writing', 'Writing', { parentId: 't_ideas', count: 2 });
const making = topic('t_making', 'Making');
const notes = tag('g_notes', 'Notes', { aliases: ['memos'], synonyms: ['jottings'] });
const flow = tag('g_flow', 'Workflow');
const rows = [
  ['a1', 'Notes on keeping a work log', 'A daily log keeps decisions visible.', '2026-03-10', [writing], [notes, flow], [para('Writing a work log each evening makes review easy.'), head('Why a log helps')]],
  ['a2', 'How the site is built', 'Static pages from JSON files.', '2026-02-01', [making], [flow], [para('The build reads content and writes HTML. Nothing runs on a server.')]],
  ['a3', 'Welcome', 'Start here.', '2026-01-05', [ideas], [notes], [para('Welcome to the site. Ideas live here, and a log of work too.')]],
].map(([id, title, excerpt, publishedAt, topics, tags, body]) => ({
  kind: 'article', id, title, subtitle: '', excerpt, url: `/en/blog/${id}/`, publishedAt, readingMinutes: 2, topics, primaryTopic: topics[0], tags, cover: null, body,
}));
const project = {
  kind: 'project', id: 'p1', title: 'Planner', subtitle: '', summary: 'A tiny weekly planner.', url: '/en/portfolio/p1/', publishedAt: '2026-02-20', topics: [making], primaryTopic: making, tags: [flow], cover: null,
  role: 'Designer', responsibilities: ['Layout'], tools: ['HTML'], challenge: ['Too many tabs'], process: [], solution: ['One page'], outcome: [], body: [],
};
const L = {
  lang: 'en', topics: [ideas, writing, making], tags: [notes, flow], articles: rows, projects: [project], profile: null,
  pageUrl: { about: '/en/about/' }, i18n: { t: (k) => k },
};
const build = (settings = {}, lang = L) => buildSearchIndex({}, lang, searchSettings(settings)).index;
const index = build();
const find = (q, extra = {}) => search(index, { q, ...extra });
const titles = (r) => r.hits.map((h) => index.docs[h.i].t);

test('the index is deterministic, sorted and compact in shape', () => {
  const again = build();
  assert.equal(JSON.stringify(index), JSON.stringify(again));
  assert.deepEqual(index.terms, [...index.terms].sort());
  assert.equal(index.post.length, index.terms.length);
  assert.ok(index.post.every((p) => p.length % 2 === 0));
  assert.equal(index.v, 1);
  assert.equal(index.docs.filter((d) => d.y === 'article').length, 3);
});

test('words must all be found; titles outrank body text', () => {
  assert.deepEqual(titles(find('work log')).slice(0, 1), ['Notes on keeping a work log']);
  assert.equal(find('work log').partial, false);
  assert.deepEqual(titles(find('planner')), ['Planner']);
  assert.equal(find('xyzzy').total, 0);
  assert.equal(find('').total, 0);
  assert.equal(find('   ').total, 0);
});

test('prefix matching applies only while typing', () => {
  assert.equal(find('wor').total, 0);
  assert.ok(find('wor', { prefix: true }).total > 0);
  // A finished word (trailing space) is not a prefix.
  assert.equal(find('wor ', { prefix: true }).total, 0);
});

test('an exact phrase needs the words next to each other, in order', () => {
  assert.deepEqual(titles(find('"work log"')), ['Notes on keeping a work log']);
  // "log of work" has both words but not as the phrase "work log" (a3 says "a log of work too").
  assert.ok(find('work log').total >= 2);
  assert.equal(find('"log work"').total, 0);
  assert.ok(find('"work log" planner').total === 0);
});

test('a minus sign leaves out pages that have the word', () => {
  const all = titles(find('log'));
  const without = titles(find('log -welcome'));
  assert.ok(all.includes('Welcome'));
  assert.ok(!without.includes('Welcome'));
  assert.ok(without.length === all.length - 1);
  // A lone dash is just punctuation.
  assert.ok(find('log -').total > 0);
});

test('some-words matches are offered when nothing has every word, and marked partial', () => {
  const r = find('planner decisions');
  assert.equal(r.partial, true);
  assert.deepEqual(new Set(titles(r)), new Set(['Planner', 'Notes on keeping a work log']));
  // More words matched ranks first.
  const both = find('planner tabs');
  assert.equal(both.partial, false);
});

test('filters: type, topic (including sub-topics), tag, dates', () => {
  assert.deepEqual(titles(find('site', { types: ['project'] })), []);
  assert.deepEqual(new Set(titles(find('log', { types: ['article'] }))), new Set(['Notes on keeping a work log', 'Welcome']));
  // "Ideas" is the parent of "Writing": the writing article also belongs to Ideas.
  assert.ok(titles(find('log', { topic: 't_ideas' })).includes('Notes on keeping a work log'));
  assert.ok(!titles(find('log', { topic: 't_writing' })).includes('Welcome'));
  assert.deepEqual(titles(find('build', { tag: 'g_flow' })), ['How the site is built']);
  assert.equal(find('log', { topic: 'nope' }).total, 0);
  assert.deepEqual(titles(find('log', { from: '2026-03-01' })), ['Notes on keeping a work log']);
  assert.deepEqual(titles(find('log', { to: '2026-02-01' })), ['Welcome']);
});

test('facet counts describe the words found, before the filters narrow them', () => {
  const r = find('log', { types: ['article'], topic: 't_writing' });
  assert.equal(r.facets.types.article, 2);
  assert.ok(r.facets.topics[index.facets.topics.findIndex((t) => t.id === 't_ideas')] >= 2);
});

test('sorting: relevance, newest, oldest', () => {
  assert.deepEqual(titles(find('log', { sort: 'newest' })), ['Notes on keeping a work log', 'Welcome']);
  assert.deepEqual(titles(find('log', { sort: 'oldest' })), ['Welcome', 'Notes on keeping a work log']);
  // Items without a date (topics, tags) go last in both date orders.
  const mixed = titles(find('notes', { sort: 'newest' }));
  assert.equal(mixed.at(-1), 'Notes');
  const mixedOld = titles(find('notes', { sort: 'oldest' }));
  assert.equal(mixedOld.at(-1), 'Notes');
});

test('tag aliases and synonyms find the tagged pages; owner synonyms work in both directions', () => {
  assert.ok(titles(find('memos')).includes('Welcome'));
  assert.ok(titles(find('jottings')).includes('Notes on keeping a work log'));
  const withSyn = build({ synonyms: { en: [['review', 'retrospective']] } });
  const hit = (q) => search(withSyn, { q }).hits.map((h) => withSyn.docs[h.i].t);
  assert.ok(hit('retrospective').includes('Notes on keeping a work log'));
  assert.ok(hit('review').includes('Notes on keeping a work log'));
});

test('suggestions complete the word being typed and name pages', () => {
  const s = suggest(index, 'wor');
  assert.ok(s.some((x) => x.kind === 'term' && x.text === 'work'));
  assert.ok(s.some((x) => x.kind === 'doc' && x.title === 'Notes on keeping a work log'));
  const two = suggest(index, 'notes wor');
  assert.ok(two.some((x) => x.kind === 'term' && x.text === 'notes work'));
  assert.deepEqual(suggest(index, ''), []);
  assert.deepEqual(suggest(index, 'work '), []);
});

test('did-you-mean fixes small typos and leaves known words alone', () => {
  assert.deepEqual(didYouMean(index, 'plnaner'), { text: 'planner' });
  assert.deepEqual(didYouMean(index, 'worklow'), { text: 'workflow' });
  assert.equal(didYouMean(index, 'planner'), null);
  assert.equal(didYouMean(index, 'qq'), null);
  assert.equal(didYouMean(index, 'zzzzzzzzzz'), null);
});

test('related searches suggest topics and tags from the results, not the one already chosen', () => {
  const r = find('log');
  const rel = relatedSearches(index, r, { limit: 6 });
  assert.ok(rel.some((x) => x.kind === 'tag' && x.id === 'g_notes'));
  assert.ok(rel.every((x) => ['topic', 'tag'].includes(x.kind)));
  const skipped = relatedSearches(index, r, { skip: { tag: 'g_notes' } });
  assert.ok(!skipped.some((x) => x.id === 'g_notes'));
  assert.ok(relatedSearches(index, r, { limit: 2 }).length <= 2);
});

test('with no results there are recommendations: newest content and the biggest topics', () => {
  const r = recommend(index, { docs: 2, topics: 2 });
  assert.deepEqual(r.docs.map((i) => index.docs[i].t), ['Notes on keeping a work log', 'Planner']);
  assert.equal(r.topics[0].id, 't_ideas');
});

test('highlighting never changes the text, and snippets do not cut words', () => {
  const text = 'A daily log keeps decisions visible. The Work-Log is a habit.';
  const q = parseQuery('log', index.o, {});
  const pieces = highlight(text, q, index.o);
  assert.equal(pieces.map((p) => p.t).join(''), text);
  assert.deepEqual(pieces.filter((p) => p.h).map((p) => p.t), ['log', 'Log']);
  const long = `${'padding words here '.repeat(30)}the needle is here ${'and more padding '.repeat(30)}`;
  const s = snippet(long, parseQuery('needle', index.o), { width: 80, options: index.o });
  assert.ok(s.pieces.some((p) => p.h && p.t === 'needle'));
  assert.equal(s.before, true);
  assert.equal(s.after, true);
  const flat = s.pieces.map((p) => p.t).join('');
  assert.ok(flat.length <= 100);
  assert.ok(!/^\S*\s/.test(flat) || long.includes(flat));
  assert.ok(long.includes(flat), 'the snippet is a verbatim part of the text');
});

test('the typed word is highlighted as a prefix only while typing', () => {
  const text = 'Workflow and works';
  const typing = highlight(text, parseQuery('work', index.o, { prefix: true }), index.o);
  assert.deepEqual(typing.filter((p) => p.h).map((p) => p.t), ['Workflow', 'works']);
  const done = highlight(text, parseQuery('work', index.o, { prefix: false }), index.o);
  assert.deepEqual(done.filter((p) => p.h).map((p) => p.t), []);
});

// ---------------------------------------------------------------- Arabic end to end

test('Arabic: diacritics, alef forms, ta marbuta, the article and digits all match', () => {
  const arTopic = topic('t_a', 'الكتابة', { count: 2, url: '/ar/topics/a/' });
  const doc = (id, title, body, date) => ({
    kind: 'article', id, title, subtitle: '', excerpt: '', url: `/ar/blog/${id}/`, publishedAt: date, readingMinutes: 1, topics: [arTopic], primaryTopic: arTopic, tags: [], cover: null, body: [para(body)],
  });
  const AR = {
    lang: 'ar', topics: [arTopic], tags: [], profile: null, projects: [], pageUrl: { about: '/ar/about/' }, i18n: { t: (k) => k },
    articles: [
      doc('x1', 'أفكار حول الكتابة', 'الكِتَابَةُ البطيئة تُحسِّن التفكير في ٣ خطوات.', '2026-05-01'),
      doc('x2', 'إنشاء الموقع', 'يُبنى الموقع من ملفات.', '2026-04-01'),
    ],
  };
  const ar = buildSearchIndex({}, AR, searchSettings({})).index;
  const f = (q, extra) => search(ar, { q, ...extra }).hits.map((h) => ar.docs[h.i].t);
  assert.ok(f('افكار').includes('أفكار حول الكتابة'), 'hamza on alef is ignored');
  assert.ok(f('أفكار').includes('أفكار حول الكتابة'));
  assert.ok(f('كتابه').includes('أفكار حول الكتابة'), 'ta marbuta and ha are the same');
  assert.ok(f('الكتابة').includes('أفكار حول الكتابة'));
  assert.ok(f('كتابة').includes('أفكار حول الكتابة'), 'with or without the article');
  assert.ok(f('الكِتَابَةُ').includes('أفكار حول الكتابة'), 'short vowels are ignored');
  assert.ok(f('انشاء').includes('إنشاء الموقع'));
  assert.ok(f('3 خطوات').includes('أفكار حول الكتابة'), 'Arabic-Indic digits equal ASCII digits');
  assert.ok(f('٣').includes('أفكار حول الكتابة'));
  // The display text is untouched.
  assert.equal(ar.docs.find((d) => d.i === 'x1').t, 'أفكار حول الكتابة');
  // Arabic typed while the word is unfinished ("الك" must still look up "ك...").
  assert.ok(search(ar, { q: 'الكتا', prefix: true }).total > 0);
  // Highlighting runs on the original letters.
  const q = parseQuery('كتابه', ar.o);
  const hl = highlight('أفكار حول الكتابة', q, ar.o);
  assert.deepEqual(hl.filter((p) => p.h).map((p) => p.t), ['الكتابة']);
  // Turning the optional folding off keeps ة and ه apart.
  const strict = buildSearchIndex({}, AR, searchSettings({ languages: { ar: { foldTaMarbuta: false } } })).index;
  assert.equal(strict.o.foldTaMarbuta, false);
  assert.equal(search(strict, { q: 'كتابه' }).total, 0);
  assert.ok(search(strict, { q: 'كتابة' }).total > 0);
});

// ---------------------------------------------------------------- the real site

test('the shipped sample site: only public content is indexed, in each language', () => {
  const content = loadContent(ROOT);
  const model = buildModel(content, {});
  for (const lang of Object.keys(model.langs)) {
    const idx = buildSearchIndex(model, model.langs[lang], searchSettings({})).index;
    const types = new Set(idx.docs.map((d) => d.y));
    assert.ok(types.has('article') && types.has('topic') && types.has('tag') && types.has('profile'), lang);
    for (const d of idx.docs) assert.ok(d.u.startsWith('/') && d.t, `${lang}:${d.i}`);
    assert.equal(idx.docs.filter((d) => d.y === 'article').length, model.langs[lang].articles.length);
    // Every topic/tag index in a doc points at a real facet.
    for (const d of idx.docs) {
      for (const t of d.tp ?? []) assert.ok(idx.facets.topics[t], `${lang}:${d.i}`);
      for (const t of d.tg ?? []) assert.ok(idx.facets.tags[t], `${lang}:${d.i}`);
    }
  }
  const en = buildSearchIndex(model, model.langs.en, searchSettings({})).index;
  assert.ok(search(en, { q: 'welcome' }).hits.some((h) => en.docs[h.i].y === 'article'));
});

test('a draft or private page is never searchable', () => {
  const content = loadContent(ROOT);
  const draft = content.articles.find((a) => a.id === 'art_worklog1');
  draft.status = 'draft';
  const model = buildModel(content, {});
  const en = buildSearchIndex(model, model.langs.en, searchSettings({})).index;
  assert.ok(!en.docs.some((d) => d.i === 'art_worklog1'));
  assert.equal(search(en, { q: 'keeping a work log' }).hits.filter((h) => en.docs[h.i].i === 'art_worklog1').length, 0);
});

test('search settings: types can be switched off and ranking changes weights', () => {
  const off = build({ types: { tag: false, topic: false } });
  assert.ok(!off.docs.some((d) => d.y === 'tag' || d.y === 'topic'));
  // "planner" appears once, in a title: its weight is the title weight of the chosen ranking.
  const weightOf = (idx, word) => idx.post[idx.terms.indexOf(word)][1];
  assert.equal(weightOf(index, 'planner'), 10 + 4);
  assert.equal(weightOf(build({ ranking: 'titles-first' }), 'planner'), 16 + 4);
  assert.equal(weightOf(build({ ranking: 'content-first' }), 'planner'), 6 + 3);
  const s = searchSettings({ pageSize: 9999, defaultView: 'weird', ranking: 'nope' });
  assert.equal(s.pageSize, 48);
  assert.equal(s.defaultView, 'grid');
  assert.equal(s.ranking, 'balanced');
});
