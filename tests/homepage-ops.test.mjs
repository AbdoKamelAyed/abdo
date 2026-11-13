import assert from 'node:assert/strict';
import { test } from 'node:test';
import { usedIds } from '../src/core/content-ops.mjs';
import {
  copyStructure, duplicateSection, insertSection, LIMIT_RANGE, moveBy, moveSection, newSection, normalizeSection, removeSection,
  SECTION_PRESETS, SECTION_SPECS, SECTION_TYPES, setEnabled, updateSection,
} from '../src/core/homepage-ops.mjs';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { ROOT } from './helpers.mjs';

const content = loadContent(ROOT, `${ROOT}/content`);
const registry = createRegistry(ROOT);
const ar = content.homepage.languages.ar.sections;
const taken = () => usedIds(content);
const ids = (list) => list.map((s) => s.id);

test('every section type and ready-made section produces something the schema and validator accept', () => {
  for (const kind of [...SECTION_TYPES, ...SECTION_PRESETS.map((p) => p.id)]) {
    const section = newSection(kind, 'en', taken());
    const hp = structuredClone(content.homepage);
    hp.languages.en.sections.push(section);
    const c = { ...content, homepage: hp, fileOf: new Map(content.fileOf).set(hp, content.fileOf.get(content.homepage)) };
    const r = validateContent(c, registry);
    assert.deepEqual(r.errors, [], `${kind}: ${JSON.stringify(r.errors)}`);
  }
});

test('new sections have unique IDs and sensible defaults; presets set what they promise', () => {
  const used = new Set(taken());
  const made = SECTION_TYPES.map((t) => { const s = newSection(t, 'en', used); used.add(s.id); return s; });
  assert.equal(new Set(ids(made)).size, SECTION_TYPES.length);
  assert.ok(made.every((s) => /^hsc_[0-9a-z]{8}$/.test(s.id) && s.enabled === true));
  const insights = newSection('insights', 'ar');
  assert.equal(insights.type, 'articles');
  assert.equal(insights.title, 'رؤى شخصية');
  assert.deepEqual(insights.source.templates, ['personal-journal', 'opinion']);
  assert.equal(newSection('insights', 'fr').title, undefined, 'other languages follow their interface text');
  assert.equal(newSection('featured_portfolio', 'en').source.featuredOnly, true);
  assert.throws(() => newSection('banner', 'en'));
});

test('duplicate keeps settings, gets a new ID and sits right after the original', () => {
  const { sections, id } = duplicateSection(ar, ar[1].id, taken());
  assert.equal(sections.length, ar.length + 1);
  assert.equal(sections[2].id, id);
  assert.notEqual(id, ar[1].id);
  assert.deepEqual({ ...sections[2], id: 'x' }, { ...ar[1], id: 'x' });
  assert.throws(() => duplicateSection(ar, 'hsc_nothere1'));
});

test('move, remove, hide and insert change only what they say', () => {
  const [a, b, c] = ar;
  assert.deepEqual(ids(moveSection(ar, c.id, 0)).slice(0, 3), [c.id, a.id, b.id]);
  assert.deepEqual(ids(moveBy(ar, a.id, 1)).slice(0, 2), [b.id, a.id]);
  assert.deepEqual(ids(moveBy(ar, a.id, -5)), ids(ar), 'clamped at the top');
  assert.equal(ids(moveSection(ar, a.id, 99)).at(-1), a.id, 'clamped at the end');
  assert.deepEqual(ids(removeSection(ar, b.id)), ids(ar).filter((x) => x !== b.id));
  const hidden = setEnabled(ar, a.id, false);
  assert.equal(hidden[0].enabled, false);
  assert.deepEqual(hidden.slice(1), ar.slice(1));
  const added = newSection('topics', 'ar', taken());
  assert.equal(insertSection(ar, added, a.id)[1].id, added.id);
  assert.equal(insertSection(ar, added).at(-1).id, added.id);
  assert.equal(ar.length, content.homepage.languages.ar.sections.length, 'inputs are not modified');
});

test('normalizeSection drops settings the renderer ignores and clamps the limit', () => {
  const s = normalizeSection({ id: 'hsc_aaaaaaaa', type: 'highlights', enabled: true, limit: 5, layout: 'grid', imageRatio: '4:3', title: '   ', spacing: 'normal' });
  assert.deepEqual(s, { id: 'hsc_aaaaaaaa', type: 'highlights', enabled: true });
  const a = normalizeSection({ id: 'hsc_aaaaaaaa', type: 'articles', enabled: true, limit: 99, layout: 'carousel', source: { topicIds: [], templates: [], featuredOnly: false, itemId: '' } });
  assert.equal(a.limit, LIMIT_RANGE.max);
  assert.equal(a.layout, undefined);
  assert.equal(a.source, undefined);
  assert.equal(normalizeSection({ id: 'hsc_aaaaaaaa', type: 'topics', enabled: true, limit: 0 }).limit, LIMIT_RANGE.min);
  for (const t of SECTION_TYPES) assert.ok(SECTION_SPECS[t].fields.includes('title'));
});

test('updateSection edits one section by ID and normalises it', () => {
  const next = updateSection(ar, ar[1].id, (s) => { s.limit = 4; s.title = '  عنوان  '; });
  assert.equal(next[1].limit, 4);
  assert.equal(next[1].title, 'عنوان');
  assert.deepEqual(next.filter((_, i) => i !== 1), ar.filter((_, i) => i !== 1));
});

test('copyStructure gives the other language the same layout with new IDs and no titles', () => {
  const copy = copyStructure(ar, taken());
  assert.equal(copy.length, ar.length);
  assert.equal(new Set([...ids(copy), ...taken()]).size, copy.length + taken().size);
  assert.ok(copy.every((s) => s.title === undefined && s.intro === undefined));
  assert.deepEqual(copy.map((s) => s.type), ar.map((s) => s.type));
  assert.deepEqual(copy.map((s) => s.layout), ar.map((s) => s.layout));
});
