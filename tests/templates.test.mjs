import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BLOCK_TYPES, PLACEHOLDER, textFields } from '../src/core/blocks-meta.mjs';
import { createRegistryFromSchemas } from '../src/core/registry.mjs';
import { TEMPLATES, TEMPLATE_IDS, templateBlocks, templateDescription, templateName } from '../src/core/templates.mjs';
import { editorialChecks, outline } from '../src/core/writing.mjs';
import { workspace } from './helpers.mjs';

const schemas = ['common', 'block', 'article', 'project', 'media', 'taxonomy', 'profile', 'config'].map((n) => JSON.parse(readFileSync(new URL(`../schemas/${n}.schema.json`, import.meta.url), 'utf8')));
const registry = createRegistryFromSchemas(schemas);
const BLOCK = 'https://abdo.invalid/schemas/block.schema.json';

test('there are exactly the twelve templates the specification lists', () => {
  assert.deepEqual(TEMPLATE_IDS, ['editorial', 'long-read', 'news', 'interview', 'photo-essay', 'personal-journal', 'research', 'review', 'opinion', 'feature-story', 'report', 'tutorial']);
  assert.equal(new Set(TEMPLATE_IDS).size, 12);
  for (const id of TEMPLATE_IDS) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'usable as the article `template` slug');
});

test('every template has an English and an Arabic name, description and outline', () => {
  for (const t of TEMPLATES) {
    for (const lang of ['en', 'ar']) {
      assert.ok(t.name[lang]?.trim(), `${t.id} name ${lang}`);
      assert.ok(t.description[lang]?.trim(), `${t.id} description ${lang}`);
      assert.ok(t.outline[lang].length >= 5, `${t.id} outline ${lang}`);
    }
    assert.equal(templateName(t, 'ar'), t.name.ar);
    assert.equal(templateDescription(t, 'fr'), t.description.en, 'unknown admin language falls back to English');
    assert.match(t.name.ar, /[؀-ۿ]/, `${t.id}: the Arabic name is Arabic`);
    assert.match(t.outline.ar.flat().find((x) => typeof x === 'string' && x.startsWith('⟦')), /[؀-ۿ]/, `${t.id}: Arabic outline text is Arabic`);
  }
});

test('every template block is valid against the block schema, in both languages', () => {
  for (const t of TEMPLATES) {
    for (const lang of ['en', 'ar', 'fr']) {
      const blocks = templateBlocks(t.id, lang);
      assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length, `${t.id}/${lang}: unique ids`);
      for (const b of blocks) {
        assert.ok(BLOCK_TYPES.includes(b.type));
        assert.deepEqual(registry.validate(BLOCK, b), [], `${t.id}/${lang}: ${b.type}`);
      }
    }
  }
});

test('templates never contain images (an image needs a library asset) and guide the author with placeholders only', () => {
  for (const t of TEMPLATES) {
    for (const lang of ['en', 'ar']) {
      const blocks = templateBlocks(t.id, lang);
      assert.ok(!blocks.some((b) => ['image', 'gallery', 'compare', 'imagetext'].includes(b.type)), t.id);
      assert.ok(blocks.some((b) => b.type === 'heading') || t.id === 'personal-journal', `${t.id}: has structure`);
      const texts = blocks.flatMap((b) => textFields(b)).filter((f) => f.role !== 'code').map((f) => f.text);
      assert.ok(texts.filter((text) => PLACEHOLDER.test(text)).length >= 4, `${t.id}/${lang}: guidance placeholders`);
      // No placeholder is nested in another one or left open.
      for (const text of texts) {
        assert.equal((text.match(/⟦/g) ?? []).length, (text.match(/⟧/g) ?? []).length, `${t.id}/${lang}: unbalanced placeholder in "${text}"`);
        assert.doesNotMatch(text, /⟦[^⟧]*⟦/, `${t.id}/${lang}: nested placeholder in "${text}"`);
      }
    }
  }
});

test('templateBlocks gives fresh ids each time and never reuses taken ones', () => {
  const a = templateBlocks('editorial', 'en');
  const b = templateBlocks('editorial', 'en', a.map((x) => x.id));
  assert.ok(a.every((x) => !b.some((y) => y.id === x.id)));
  assert.throws(() => templateBlocks('no-such-template', 'en'), /Unknown template/);
});

test('the research template keeps its footnote reference outside the placeholder, so it survives being rewritten', () => {
  for (const lang of ['en', 'ar']) {
    const blocks = templateBlocks('research', lang);
    const text = blocks.find((b) => b.type === 'paragraph' && b.text.includes('[^n1]')).text;
    assert.match(text.replace(/⟦[^⟧]*⟧/g, ''), /\[\^n1\]/);
  }
});

test('an article started from any template builds, and only placeholder warnings remain (draft) until they are replaced', () => {
  for (const t of TEMPLATES) {
    const ws = workspace();
    try {
      const rel = 'articles/art_welcome1.json';
      const article = ws.read(rel);
      const lang = Object.keys(article.translations)[0];
      article.status = 'draft'; article.translations[lang].status = 'draft';
      article.template = t.id;
      article.translations[lang].body = templateBlocks(t.id, lang);
      ws.write(rel, article);
      const result = ws.build({ validateOnly: true });
      assert.ok(result.ok, `${t.id}: ${JSON.stringify(result.errors)}`);
      assert.ok(result.warnings.some((w) => /placeholder/.test(w.message)), `${t.id}: warns about placeholders`);
      const others = result.warnings.filter((w) => w.file.includes('art_welcome1') && !/placeholder/.test(w.message));
      assert.deepEqual(others, [], `${t.id}: no other warnings`);

      // Publishing it as it is must be refused.
      article.status = 'published'; article.translations[lang].status = 'published'; article.publishedAt ??= '2026-01-01T00:00:00Z';
      ws.write(rel, article);
      assert.ok(!ws.build({ validateOnly: true }).ok, `${t.id}: cannot be published with placeholders`);
    } finally { ws.cleanup(); }
  }
});

test('the editorial checks recognise a fresh template (placeholders), and outlines have sane heading order', () => {
  for (const t of TEMPLATES) {
    for (const lang of ['en', 'ar']) {
      const blocks = templateBlocks(t.id, lang);
      const checks = editorialChecks({ blocks, title: 'A title', excerpt: 'An excerpt that is long enough to be a good description for results.' });
      assert.ok(checks.some((c) => c.code === 'placeholder'), `${t.id}/${lang}`);
      assert.ok(!checks.some((c) => c.code === 'heading_skip'), `${t.id}/${lang}: heading levels do not skip`);
      assert.ok(outline(blocks).every((h) => h.level >= 2));
    }
  }
});
