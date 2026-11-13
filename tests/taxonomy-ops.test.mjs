import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { ICON_KEYS, ICONS, iconSvg, isIcon } from '../src/core/icons.mjs';
import { relatedItems, relatedScore, relatedTags, relatedTopics, topicRelations } from '../src/core/related.mjs';
import {
  analytics, bulkEdit, deleteTag, deleteTopic, descendantIds, duplicateGroups, mergeTags, mergeTopics, moveRecord, setParent, setSlug,
  similarPairs, similarTo, tagBlockers, topicBlockers, topicTree, unusedTags, unusedTopics, usage,
} from '../src/core/taxonomy-ops.mjs';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { ROOT, workspace } from './helpers.mjs';

const NOW = new Date('2026-11-11T10:00:00Z');
const STAMP = '2026-11-11T10:00:00Z';
const registry = createRegistry(ROOT);
const workspaces = [];
after(() => workspaces.forEach((w) => w.cleanup()));
const setup = () => { const ws = workspace(); workspaces.push(ws); return ws; };
const check = (ws) => validateContent(loadContent(ROOT, ws.contentDir), registry);
const text = (list) => list.map((e) => `${e.file} › ${e.path}: ${e.message}`).join('\n');

// ---------------------------------------------------------------- a small tree to work on

const tr = (name, slug, extra = {}) => ({ name, slug, ...extra });
const tag = (id, en, ar, extra = {}) => ({ id, status: 'published', createdAt: STAMP, updatedAt: STAMP, translations: { en: tr(en, en.toLowerCase().replace(/\W+/g, '-'), extra.en), ar: tr(ar, ar.replace(/\s+/g, '-'), extra.ar) }, ...(extra.top ?? {}) });
const topic = (id, en, ar, extra = {}) => ({ id, status: 'published', visibility: 'public', createdAt: STAMP, updatedAt: STAMP, translations: { en: tr(en, en.toLowerCase(), { description: `${en} topic` }), ar: tr(ar, ar, { description: `موضوع ${ar}` }) }, ...extra });
const item = (id, topicIds, tagIds, status = 'published') => ({ id, status, topicIds, tagIds, translations: {} });
const fixture = () => ({
  topics: [topic('top_aaaaaaa1', 'Ideas', 'أفكار'), topic('top_aaaaaaa2', 'Writing', 'كتابة', { parentId: 'top_aaaaaaa1' }), topic('top_aaaaaaa3', 'Making', 'صناعة'), topic('top_aaaaaaa4', 'Unused', 'مهمل')],
  tags: [
    tag('tag_aaaaaaa1', 'Notes', 'ملاحظات', { en: { description: 'Short notes' } }),
    tag('tag_aaaaaaa2', 'Note taking', 'تدوين الملاحظات', { en: { aliases: ['notes'] }, top: { relatedTagIds: ['tag_aaaaaaa3'] } }),
    tag('tag_aaaaaaa3', 'Workflow', 'سير العمل'),
    tag('tag_aaaaaaa4', 'Workflows', 'مسارات'),
    tag('tag_aaaaaaa5', 'Unused tag', 'وسم مهمل'),
  ],
  articles: [
    item('art_aaaaaaa1', ['top_aaaaaaa2'], ['tag_aaaaaaa1', 'tag_aaaaaaa3']),
    item('art_aaaaaaa2', ['top_aaaaaaa3'], ['tag_aaaaaaa2', 'tag_aaaaaaa3'], 'draft'),
    item('art_aaaaaaa3', ['top_aaaaaaa1'], ['tag_aaaaaaa1']),
  ],
  projects: [item('prj_aaaaaaa1', ['top_aaaaaaa3'], ['tag_aaaaaaa4', 'tag_aaaaaaa2'])],
  homepage: { schemaVersion: 1, languages: { en: { sections: [{ id: 'hsc_aaaaaaa1', type: 'topics', enabled: true, source: { topicIds: ['top_aaaaaaa2', 'top_aaaaaaa1'] } }] } } },
});

// ---------------------------------------------------------------- usage

test('usage counts drafts as used, published separately, and rolls topics up through sub-topics', () => {
  const c = fixture();
  const u = usage(c);
  assert.deepEqual(u.tags.get('tag_aaaaaaa3'), { articles: 2, projects: 0, total: 2, published: 1 });
  assert.deepEqual(u.tags.get('tag_aaaaaaa2'), { articles: 1, projects: 1, total: 2, published: 1 });
  assert.equal(u.topics.get('top_aaaaaaa1').total, 1);
  assert.equal(u.rollup.get('top_aaaaaaa1').total, 2, 'Ideas includes the content of Writing');
  assert.equal(u.rollup.get('top_aaaaaaa2').total, 1);
  assert.deepEqual(unusedTags(c), ['tag_aaaaaaa5']);
  assert.deepEqual(unusedTopics(c), ['top_aaaaaaa4']);
  const a = analytics(c);
  assert.equal(a.tags.unused, 1);
  assert.equal(a.tags.top[0].total, 2);
  assert.equal(a.items.total, 4);
  assert.equal(a.items.withoutTags, 0);
});

// ---------------------------------------------------------------- duplicates

test('similar names: same, alias and typo are told apart; unrelated names are left alone', () => {
  const c = fixture();
  const pairs = similarPairs(c.tags);
  const find = (a, b) => pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
  assert.equal(find('tag_aaaaaaa1', 'tag_aaaaaaa2')?.reason, 'alias', '"notes" is an alias of Note taking');
  assert.equal(find('tag_aaaaaaa3', 'tag_aaaaaaa4')?.reason, 'typo', 'Workflow / Workflows');
  assert.equal(find('tag_aaaaaaa1', 'tag_aaaaaaa5'), undefined);
  assert.equal(pairs[0].reason, 'alias', 'closer matches come first');
  const exact = [tag('tag_bbbbbbb1', 'Machine-Learning', 'تعلم'), tag('tag_bbbbbbb2', 'machine learning', 'تعلم الآلة')];
  assert.equal(similarPairs(exact)[0].reason, 'same');
  assert.deepEqual(duplicateGroups(exact), [['tag_bbbbbbb1', 'tag_bbbbbbb2']]);
  assert.deepEqual(similarTo(c.tags, 'tag_aaaaaaa4').map((s) => s.id), ['tag_aaaaaaa3']);
  // Arabic: diacritics and the definite article do not matter for "same".
  const ar = [tag('tag_ccccccc1', 'One', 'الكِتَابَة'), tag('tag_ccccccc2', 'Two', 'الكتابه')];
  assert.equal(similarPairs(ar)[0].reason, 'same');
});

// ---------------------------------------------------------------- merging tags

test('merging tags: content moves once, names become aliases, slugs become redirects, relations follow', () => {
  const c = fixture();
  const r = mergeTags(c, ['tag_aaaaaaa1', 'tag_aaaaaaa4'], 'tag_aaaaaaa2', { now: NOW });
  assert.deepEqual(r.tags.map((t) => t.id), ['tag_aaaaaaa2', 'tag_aaaaaaa3', 'tag_aaaaaaa5']);
  const target = r.tags.find((t) => t.id === 'tag_aaaaaaa2');
  assert.deepEqual(target.translations.en.aliases, ['notes', 'Workflows'], 'the alias "notes" was already there; Notes folds to the same, so it is not added twice');
  assert.deepEqual(target.translations.en.redirectSlugs, ['notes', 'workflows']);
  assert.deepEqual(target.translations.ar.aliases, ['ملاحظات', 'مسارات']);
  assert.equal(target.translations.en.description, 'Short notes', 'a missing description is taken from a merged tag');
  assert.equal(target.updatedAt, STAMP);
  // art 1 used Notes + Workflow -> now Note taking + Workflow; art 3 used Notes only -> Note taking; project had Workflows + Note taking -> once.
  assert.deepEqual(r.articles.get('art_aaaaaaa1').tagIds, ['tag_aaaaaaa2', 'tag_aaaaaaa3']);
  assert.deepEqual(r.articles.get('art_aaaaaaa3').tagIds, ['tag_aaaaaaa2']);
  assert.deepEqual(r.projects.get('prj_aaaaaaa1').tagIds, ['tag_aaaaaaa2']);
  assert.ok(!r.articles.has('art_aaaaaaa2'), 'an article that did not use a merged tag is not touched');
  // The input was not changed.
  assert.equal(c.tags.length, 5);
  assert.deepEqual(c.articles[0].tagIds, ['tag_aaaaaaa1', 'tag_aaaaaaa3']);
  // A tag that listed a merged tag as related now lists the target (and never itself).
  const withRel = fixture();
  withRel.tags[2].relatedTagIds = ['tag_aaaaaaa1'];
  const r2 = mergeTags(withRel, ['tag_aaaaaaa1'], 'tag_aaaaaaa2', { now: NOW });
  assert.deepEqual(r2.tags.find((t) => t.id === 'tag_aaaaaaa3').relatedTagIds, ['tag_aaaaaaa2']);
  assert.throws(() => mergeTags(c, ['tag_aaaaaaa2'], 'tag_aaaaaaa2'), /at least one other/);
  assert.throws(() => mergeTags(c, ['tag_zzzzzzz9'], 'tag_aaaaaaa2'), /Unknown tag/);
  assert.throws(() => mergeTags(c, ['tag_aaaaaaa1'], 'tag_zzzzzzz9'), /Unknown tag/);
});

test('merging tags: a language the target lacks is reported, not guessed', () => {
  const c = fixture();
  delete c.tags[2].translations.ar;
  const r = mergeTags(c, ['tag_aaaaaaa4'], 'tag_aaaaaaa3', { now: NOW });
  assert.deepEqual(r.notes, [{ id: 'tag_aaaaaaa4', lang: 'ar', kind: 'language-missing' }]);
});

// ---------------------------------------------------------------- merging topics

test('merging topics: content, sub-topics, pinned items, homepage and redirects all follow', () => {
  const c = fixture();
  c.topics.push(topic('top_aaaaaaa5', 'Essays', 'مقالات', { parentId: 'top_aaaaaaa2', pinnedItemIds: ['art_aaaaaaa1'] }));
  c.topics[0].relatedTopicIds = ['top_aaaaaaa2'];
  const r = mergeTopics(c, 'top_aaaaaaa2', 'top_aaaaaaa3', { now: NOW });
  assert.ok(!r.topics.some((t) => t.id === 'top_aaaaaaa2'));
  assert.equal(r.topics.find((t) => t.id === 'top_aaaaaaa5').parentId, 'top_aaaaaaa3', 'sub-topics move to the target');
  assert.deepEqual(r.topics.find((t) => t.id === 'top_aaaaaaa1').relatedTopicIds, ['top_aaaaaaa3']);
  const target = r.topics.find((t) => t.id === 'top_aaaaaaa3');
  assert.deepEqual(target.translations.en.redirectSlugs, ['writing']);
  assert.deepEqual(target.translations.en.synonyms, ['Writing']);
  assert.deepEqual(r.articles.get('art_aaaaaaa1').topicIds, ['top_aaaaaaa3']);
  assert.ok(!r.articles.has('art_aaaaaaa3'));
  assert.deepEqual(r.homepage.languages.en.sections[0].source.topicIds, ['top_aaaaaaa3', 'top_aaaaaaa1']);
  const same = mergeTopics({ ...c, homepage: { schemaVersion: 1, languages: { en: { sections: [{ id: 'hsc_aaaaaaa1', type: 'topics', enabled: true, source: { topicIds: ['top_aaaaaaa2', 'top_aaaaaaa3'] } }] } } } }, 'top_aaaaaaa2', 'top_aaaaaaa3', { now: NOW });
  assert.deepEqual(same.homepage.languages.en.sections[0].source.topicIds, ['top_aaaaaaa3'], 'no duplicate ids after rewriting');
  assert.equal(mergeTopics({ ...c, homepage: null }, 'top_aaaaaaa2', 'top_aaaaaaa3', { now: NOW }).homepage, null);
  assert.throws(() => mergeTopics(c, 'top_aaaaaaa2', 'top_aaaaaaa2'), /itself/);
});

test('merging a topic into its own sub-topic never creates a loop', () => {
  const c = fixture();
  // Ideas > Writing. Merge Ideas into Writing: Writing takes Ideas' place at the top.
  const r = mergeTopics(c, 'top_aaaaaaa1', 'top_aaaaaaa2', { now: NOW });
  const writing = r.topics.find((t) => t.id === 'top_aaaaaaa2');
  assert.equal(writing.parentId, undefined);
  assert.equal(r.topics.length, 3);
  // Deeper: Ideas > Writing > Essays. Merge Ideas into Essays.
  const d = fixture();
  d.topics.push(topic('top_aaaaaaa5', 'Essays', 'مقالات', { parentId: 'top_aaaaaaa2' }));
  const r2 = mergeTopics(d, 'top_aaaaaaa1', 'top_aaaaaaa5', { now: NOW });
  for (const t of r2.topics) assert.equal(topicTree(r2.topics).some((n) => n.topic.id === t.id), true, `${t.id} is reachable from the top, so there is no loop`);
});

// ---------------------------------------------------------------- deleting

test('deleting: a used tag or topic needs confirmation; sub-topics move up; references are cleaned', () => {
  const c = fixture();
  assert.deepEqual(tagBlockers(c, 'tag_aaaaaaa1'), { articles: 2, projects: 0 });
  assert.equal(tagBlockers(c, 'tag_aaaaaaa5'), null);
  assert.throws(() => deleteTag(c, 'tag_aaaaaaa1'), /used by content/);
  const gone = deleteTag(c, 'tag_aaaaaaa5', { now: NOW });
  assert.equal(gone.tags.length, 4);
  assert.equal(gone.articles.size, 0);
  const forced = deleteTag(c, 'tag_aaaaaaa3', { force: true, now: NOW });
  assert.deepEqual(forced.articles.get('art_aaaaaaa1').tagIds, ['tag_aaaaaaa1']);
  assert.equal(forced.tags.find((t) => t.id === 'tag_aaaaaaa2').relatedTagIds, undefined, 'the now-empty related list is removed');

  assert.deepEqual(topicBlockers(c, 'top_aaaaaaa1'), { articles: 1, projects: 0, children: 1 });
  assert.throws(() => deleteTopic(c, 'top_aaaaaaa1'), /used by content/);
  const t = deleteTopic(c, 'top_aaaaaaa4', { now: NOW });
  assert.equal(t.topics.length, 3);
  const f = deleteTopic(c, 'top_aaaaaaa1', { force: true, now: NOW });
  assert.equal(f.topics.find((x) => x.id === 'top_aaaaaaa2').parentId, undefined, 'the sub-topic moved up to the top');
  assert.deepEqual(f.articles.get('art_aaaaaaa3').topicIds, []);
  assert.deepEqual(f.homepage.languages.en.sections[0].source.topicIds, ['top_aaaaaaa2']);
  assert.throws(() => deleteTag(c, 'tag_zzzzzzz9'), /Unknown/);
});

// ---------------------------------------------------------------- bulk, slugs, hierarchy

test('bulk edit changes only the allowed fields to allowed values', () => {
  const c = fixture();
  const out = bulkEdit(c.tags, ['tag_aaaaaaa1', 'tag_aaaaaaa2'], { status: 'archived', visibility: 'private' }, { now: NOW });
  assert.equal(out[0].status, 'archived');
  assert.equal(out[0].visibility, 'private');
  assert.equal(out[0].updatedAt, STAMP);
  assert.equal(out[2].status, 'published');
  assert.equal(out[2].updatedAt, STAMP.replace('10:00:00', '10:00:00'), 'untouched records keep their own timestamp');
  assert.equal(bulkEdit(out, ['tag_aaaaaaa1'], { visibility: 'public' }, { now: NOW })[0].visibility, undefined, 'public is the default and is not stored for tags');
  assert.throws(() => bulkEdit(c.tags, ['tag_aaaaaaa1'], { id: 'x' }), /cannot be changed in bulk/);
  assert.throws(() => bulkEdit(c.tags, ['tag_aaaaaaa1'], { status: 'publised' }), /not a valid value/);
  const topics = bulkEdit(c.topics, ['top_aaaaaaa3'], { featured: true, visibility: 'private' }, { now: NOW });
  assert.equal(topics.find((t) => t.id === 'top_aaaaaaa3').featured, true);
  assert.equal(topics.find((t) => t.id === 'top_aaaaaaa3').visibility, 'private');
});

test('changing a slug remembers the old one, once, and drops it if it comes back', () => {
  const c = fixture();
  const a = setSlug(c.tags[0], 'en', 'quick-notes', { now: NOW });
  assert.equal(a.translations.en.slug, 'quick-notes');
  assert.deepEqual(a.translations.en.redirectSlugs, ['notes']);
  const b = setSlug(a, 'en', 'notes-2', { now: NOW });
  assert.deepEqual(b.translations.en.redirectSlugs, ['notes', 'quick-notes']);
  const back = setSlug(b, 'en', 'notes', { now: NOW });
  assert.deepEqual(back.translations.en.redirectSlugs, ['quick-notes', 'notes-2']);
  assert.deepEqual(setSlug(c.tags[0], 'en', 'notes', { now: NOW }), c.tags[0], 'the same slug changes nothing');
  assert.deepEqual(c.tags[0].translations.en.redirectSlugs, undefined, 'the original was not changed');
});

test('hierarchy: moving is cycle-safe, the tree is ordered, descendants are found', () => {
  const { topics } = fixture();
  assert.deepEqual([...descendantIds(topics, 'top_aaaaaaa1')].sort(), ['top_aaaaaaa1', 'top_aaaaaaa2']);
  assert.deepEqual(setParent(topics, 'top_aaaaaaa1', 'top_aaaaaaa1'), { ok: false, error: 'self' });
  assert.deepEqual(setParent(topics, 'top_aaaaaaa1', 'top_aaaaaaa2'), { ok: false, error: 'cycle' });
  assert.deepEqual(setParent(topics, 'top_aaaaaaa1', 'top_zzzzzzz9'), { ok: false, error: 'unknown' });
  const moved = setParent(topics, 'top_aaaaaaa3', 'top_aaaaaaa2', { now: NOW });
  assert.equal(moved.ok, true);
  assert.deepEqual(topicTree(moved.topics).map((n) => [n.topic.id, n.depth]), [['top_aaaaaaa1', 0], ['top_aaaaaaa2', 1], ['top_aaaaaaa3', 2], ['top_aaaaaaa4', 0]]);
  const top = setParent(moved.topics, 'top_aaaaaaa3', null, { now: NOW });
  assert.equal(top.topics.find((t) => t.id === 'top_aaaaaaa3').parentId, undefined);
  assert.deepEqual(moveRecord(topics, 'top_aaaaaaa4', 0).map((t) => t.id)[0], 'top_aaaaaaa4');
  assert.equal(moveRecord(topics, 'nope', 0), topics);
});

// ---------------------------------------------------------------- related

test('related content: shared topics outweigh tags; a parent or sub-topic counts a little; ties are ordered by the caller', () => {
  const rel = topicRelations(fixture().topics);
  const a = { id: 'a', topicIds: ['top_aaaaaaa2'], tagIds: ['t1'] };
  assert.equal(relatedScore(a, { topicIds: ['top_aaaaaaa2'], tagIds: [] }, rel), 3);
  assert.equal(relatedScore(a, { topicIds: [], tagIds: ['t1'] }, rel), 1);
  assert.equal(relatedScore(a, { topicIds: ['top_aaaaaaa1'], tagIds: [] }, rel), 1, 'Ideas is the parent of Writing');
  assert.equal(relatedScore(a, { topicIds: ['top_aaaaaaa3'], tagIds: [] }, rel), 0);
  const pool = [a, { id: 'b', topicIds: ['top_aaaaaaa2'], tagIds: [] }, { id: 'c', topicIds: [], tagIds: ['t1'] }, { id: 'd', topicIds: [], tagIds: ['t1'] }, { id: 'e', topicIds: ['top_aaaaaaa3'], tagIds: [] }];
  assert.deepEqual(relatedItems(a, pool, { relations: rel, limit: 5 }).map((x) => x.id), ['b', 'c', 'd']);
  assert.deepEqual(relatedItems(a, pool, { relations: rel, limit: 2, tieBreak: (x, y) => y.id.localeCompare(x.id) }).map((x) => x.id), ['b', 'd']);
});

test('related topics and tags: the owner\'s choices first, then siblings and co-occurrence', () => {
  const c = fixture();
  c.topics.push(topic('top_aaaaaaa5', 'Essays', 'مقالات', { parentId: 'top_aaaaaaa1' }));
  const writing = { ...c.topics[1], relatedTopicIds: ['top_aaaaaaa3'] };
  const items = [item('x', ['top_aaaaaaa2', 'top_aaaaaaa4'], []), item('y', ['top_aaaaaaa2', 'top_aaaaaaa4'], [])];
  const rt = relatedTopics(writing, c.topics.map((t) => (t.id === writing.id ? writing : t)), items);
  assert.deepEqual(rt.map((t) => t.id), ['top_aaaaaaa3', 'top_aaaaaaa5', 'top_aaaaaaa4'], 'chosen, sibling, then seen together');
  const tags = c.tags;
  const withItems = [item('p', [], ['tag_aaaaaaa1', 'tag_aaaaaaa3']), item('q', [], ['tag_aaaaaaa1', 'tag_aaaaaaa3', 'tag_aaaaaaa4'])];
  assert.deepEqual(relatedTags(tags[0], tags, withItems).map((t) => t.id), ['tag_aaaaaaa3', 'tag_aaaaaaa4']);
  assert.deepEqual(relatedTags(tags[1], tags, []).map((t) => t.id), ['tag_aaaaaaa3'], 'the chosen related tag appears even with no shared content');
});

// ---------------------------------------------------------------- icons

test('icons: every icon is drawable, safe and listed once', () => {
  assert.ok(ICON_KEYS.length >= 20);
  for (const key of ICON_KEYS) {
    assert.match(ICONS[key], /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/, `${key} has only path commands`);
    const svg = iconSvg(key, { size: 18 });
    assert.match(svg, /^<svg class="icon" viewBox="0 0 24 24" width="18" height="18"/);
    assert.ok(svg.includes('aria-hidden="true"') && !svg.includes('<script'));
    assert.ok((svg.match(/<path /g) ?? []).length >= 1);
  }
  assert.equal(iconSvg('nope'), '');
  assert.equal(isIcon('constructor'), false);
});

// ---------------------------------------------------------------- the validator

test('the validator accepts the new topic and tag fields and the shipped site is still clean', () => {
  const ws = setup();
  ws.edit('taxonomy/topics.json', (d) => {
    Object.assign(d.items[0], { icon: 'bulb', color: '#b5651d', relatedTopicIds: ['top_make0001'], pinnedItemIds: ['art_welcome1'] });
    d.items[0].translations.en.synonyms = ['concepts'];
    d.items[0].translations.en.seo = { title: 'Ideas and concepts', description: 'Notes on ideas.' };
  });
  ws.edit('taxonomy/tags.json', (d) => {
    d.items[0].relatedTagIds = ['tag_flow0001'];
    d.items[0].translations.en.description = 'Short notes and fragments.';
    d.items[0].translations.en.aliases = ['jottings'];
    d.items[0].translations.en.redirectSlugs = ['old-notes'];
  });
  const r = check(ws);
  assert.deepEqual(r.errors, [], text(r.errors));
  assert.deepEqual(r.warnings, [], text(r.warnings));
});

test('the validator rejects bad icons, self or unknown relations, and unknown pinned items', () => {
  const ws = setup();
  ws.edit('taxonomy/topics.json', (d) => {
    Object.assign(d.items[0], { icon: 'rocket', relatedTopicIds: [d.items[0].id, 'top_nothere1'], pinnedItemIds: ['art_nothere1'] });
  });
  ws.edit('taxonomy/tags.json', (d) => { d.items[0].relatedTagIds = [d.items[0].id, 'tag_nothere1']; });
  const t = text(check(ws).errors);
  assert.match(t, /unknown icon "rocket"/);
  assert.match(t, /a topic cannot be related to itself/);
  assert.match(t, /unknown topic "top_nothere1"/);
  assert.match(t, /unknown article or project "art_nothere1"/);
  assert.match(t, /a tag cannot be related to itself/);
  assert.match(t, /unknown tag "tag_nothere1"/);
});

test('a pinned item that is not filed under the topic is a warning, not an error', () => {
  const ws = setup();
  ws.edit('taxonomy/topics.json', (d) => { d.items.find((t) => t.id === 'top_make0001').pinnedItemIds = ['art_welcome1']; });
  const r = check(ws);
  assert.deepEqual(r.errors, []);
  assert.match(text(r.warnings), /pinned here but is not filed under this topic/);
});

test('old slugs: cannot equal a live slug, the page\'s own slug, or another page\'s old slug', () => {
  const ws = setup();
  ws.edit('taxonomy/tags.json', (d) => {
    d.items[0].translations.en.redirectSlugs = ['workflow', 'notes', 'shared-old'];
    d.items[1].translations.en.redirectSlugs = ['shared-old'];
  });
  const t = text(check(ws).errors);
  assert.match(t, /"workflow" is the current slug of tag_flow0001/);
  assert.match(t, /"notes" is this tag's own slug/);
  assert.match(t, /"shared-old" is already an old slug of tag_notes001/);
});

test('two tags with the same name are a warning that points to the merge tool', () => {
  const ws = setup();
  ws.edit('taxonomy/tags.json', (d) => { d.items[1].translations.en.name = 'notes'; d.items[1].translations.en.slug = 'notes-too'; });
  const r = check(ws);
  assert.deepEqual(r.errors, []);
  assert.match(text(r.warnings), /is the same as tag_notes001's \(ignoring case and punctuation\): merge them in the tag manager/);
});

test('search settings: optional, validated, and languages must exist', () => {
  const ws = setup();
  ws.write('config/search.json', { schemaVersion: 1, pageSize: 20, defaultView: 'list', ranking: 'titles-first', synonyms: { en: [['review', 'retrospective']] }, languages: { ar: { foldTaMarbuta: false } } });
  const ok = check(ws);
  assert.deepEqual(ok.errors, [], text(ok.errors));
  ws.write('config/search.json', { schemaVersion: 1, pageSize: 2, defaultView: 'cards', synonyms: { fr: [['a', 'b']], en: [['single']] }, extra: true });
  const bad = text(check(ws).errors);
  assert.match(bad, /pageSize/);
  assert.match(bad, /defaultView/);
  assert.match(bad, /extra/);
  assert.match(bad, /synonyms/);
  ws.write('config/search.json', { schemaVersion: 1, synonyms: { fr: [['a', 'b']] } });
  assert.match(text(check(ws).errors), /unknown language "fr"/);
});

test('the search page URL segment is reserved: a section cannot take it', () => {
  const ws = setup();
  ws.edit('config/languages.json', (d) => { d.items.find((l) => l.code === 'en').routes.blog = 'search'; });
  assert.match(text(check(ws).errors), /section URL segments must all be different/);
});
