import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BLOCK_TYPES } from '../src/core/blocks-meta.mjs';
import { DISPLAY_FIELDS, SPECS, allLabelKeys, blockSkeleton, duplicateBlock, fieldLabelKey, optionLabelKey, readField, withFreshIds, writeField } from '../src/core/block-specs.mjs';
import { createRegistryFromSchemas } from '../src/core/registry.mjs';
import { STRINGS } from '../public/admin/js/strings.mjs';

const schemaOf = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), 'utf8'));
const block = schemaOf('block.schema.json');
const rules = Object.fromEntries(block.allOf.map((r) => [r.if.properties.type.const, r.then]));
const COMMON = new Set(['id', 'type', 'hidden', 'display']);
const registry = createRegistryFromSchemas(['common', 'block', 'article', 'project', 'media', 'taxonomy', 'profile', 'config'].map((n) => schemaOf(`${n}.schema.json`)));

test('there is a spec for every block type and for nothing else', () => {
  assert.deepEqual(Object.keys(SPECS).sort(), [...BLOCK_TYPES].sort());
  assert.deepEqual([...(block.properties.type.enum)].sort(), [...BLOCK_TYPES].sort());
});

test('every property the schema allows on a block has an editor, and every editor edits a real property', () => {
  for (const type of BLOCK_TYPES) {
    const props = Object.keys(rules[type].properties).filter((k) => !COMMON.has(k)).sort();
    const edited = SPECS[type].fields.map((f) => f.key).filter((k, i, all) => all.indexOf(k) === i).sort();
    assert.deepEqual(edited, props, `${type}: editor fields differ from the schema`);
  }
});

test('group fields cover every property of their items', () => {
  for (const type of BLOCK_TYPES) {
    for (const field of SPECS[type].fields.filter((f) => f.kind === 'group')) {
      const items = rules[type].properties[field.key].items;
      assert.deepEqual(field.itemFields.map((f) => f.key).sort(), Object.keys(items.properties).sort(), `${type}.${field.key}`);
      const required = field.itemFields.filter((f) => f.required).map((f) => f.key).sort();
      assert.deepEqual(required, [...(items.required ?? [])].sort(), `${type}.${field.key}: required item fields`);
      assert.equal(field.minItems ?? 0, rules[type].properties[field.key].minItems ?? 0, `${type}.${field.key}: minItems`);
      assert.equal(field.maxItems, rules[type].properties[field.key].maxItems, `${type}.${field.key}: maxItems`);
    }
  }
});

test('option lists equal the schema enums, so no option is missing from the editor', () => {
  for (const type of BLOCK_TYPES) {
    for (const field of SPECS[type].fields.filter((f) => f.kind === 'enum' || f.kind === 'aligns')) {
      const resolved = rules[type].properties[field.key];
      let schemaEnum = resolved.enum ?? resolved.items?.enum;
      if (resolved.$ref) schemaEnum = block.$defs[resolved.$ref.split('/').pop()].enum;
      if (!schemaEnum) {
        // Integer ranges (heading level, gallery columns).
        const values = []; for (let n = resolved.minimum; n <= resolved.maximum; n += 1) values.push(n);
        assert.deepEqual(field.options, values, `${type}.${field.key}`);
      } else assert.deepEqual([...field.options].sort(), [...schemaEnum].sort(), `${type}.${field.key}`);
    }
    for (const field of SPECS[type].fields.filter((f) => f.kind === 'group')) {
      for (const sub of field.itemFields.filter((f) => f.kind === 'enum')) assert.ok(sub.options.length > 1, `${type}.${field.key}.${sub.key}`);
    }
  }
  for (const field of DISPLAY_FIELDS) assert.deepEqual([...field.options].sort(), [...block.$defs.display.properties[field.key].enum].sort(), `display.${field.key}`);
});

test('text limits in the specs match the schema', () => {
  assert.equal(SPECS.stats.fields[0].itemFields[0].maxLength, rules.stats.properties.items.items.properties.value.maxLength);
  assert.equal(SPECS.code.fields[1].maxLength, 24);
  const keyField = SPECS.footnotes.fields[1].itemFields[0];
  assert.equal(keyField.maxLength, 20);
});

test('every label and option string the specs mention exists in English and Arabic', () => {
  const missing = [];
  for (const key of allLabelKeys()) for (const lang of ['en', 'ar']) if (!(key in STRINGS[lang])) missing.push(`${lang}:${key}`);
  assert.deepEqual(missing, []);
  for (const type of BLOCK_TYPES) for (const lang of ['en', 'ar']) assert.ok(`block_${type}` in STRINGS[lang], `${lang}: block_${type}`);
});

test('option labels are distinct inside one field, so a person can tell the options apart', () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    for (const type of BLOCK_TYPES) {
      const fields = [...SPECS[type].fields, ...DISPLAY_FIELDS];
      for (const field of fields.filter((f) => f.kind === 'enum')) {
        const labels = field.options.map((v) => { const k = optionLabelKey(field, v); return k ? table[k] : String(v); });
        assert.equal(new Set(labels).size, labels.length, `${lang} ${type}.${field.key}: duplicate option labels`);
      }
    }
  }
  assert.ok(fieldLabelKey({ key: 'x' }) === 'f_x');
});

test('a new block of every type has the right shape; empty required text is left for the validator to flag', () => {
  for (const type of BLOCK_TYPES) {
    const b = blockSkeleton(type, 'blk_aaaaaaa1');
    assert.equal(b.type, type);
    assert.match(b.id, /^blk_[0-9a-z]{8}$/);
    // Only properties the schema knows.
    for (const key of Object.keys(b)) assert.ok(COMMON.has(key) || key in rules[type].properties, `${type}.${key}`);
    // Required properties are present.
    for (const key of rules[type].required ?? []) assert.ok(key in b, `${type} lacks required ${key}`);
  }
  assert.throws(() => blockSkeleton('video', 'blk_aaaaaaa1'), /Unknown block type/);
});

test('a new block only ever fails the schema because something required is still empty', () => {
  const id = 'https://abdo.invalid/schemas/block.schema.json';
  for (const type of BLOCK_TYPES) {
    const problems = registry.validate(id, blockSkeleton(type, 'blk_aaaaaaa1'));
    for (const p of problems) assert.match(p.message, /must not be empty|invalid format/, `${type}: ${p.path.join('.')} ${p.message}`);
  }
});

test('readField and writeField keep stored blocks tidy', () => {
  const b = blockSkeleton('paragraph', 'blk_aaaaaaa1');
  const style = SPECS.paragraph.fields.find((f) => f.key === 'style');
  writeField(b, style, 'lead');
  assert.equal(b.style, 'lead');
  writeField(b, style, '');
  assert.ok(!('style' in b), 'an empty optional choice is removed, not stored as ""');

  const dropCap = SPECS.paragraph.fields.find((f) => f.key === 'dropCap');
  assert.equal(readField(b, dropCap), false);
  writeField(b, dropCap, true); assert.equal(b.dropCap, true);
  writeField(b, dropCap, false); assert.ok(!('dropCap' in b), 'the default is not stored');

  // A default-true flag is only stored when it is turned off.
  const t = blockSkeleton('table', 'blk_aaaaaaa2');
  const header = SPECS.table.fields.find((f) => f.key === 'header');
  assert.equal(readField(t, header), true);
  writeField(t, header, false); assert.equal(t.header, false);
  writeField(t, header, true); assert.ok(!('header' in t));

  // Required text stays as an empty string so the validator reports it.
  const text = SPECS.paragraph.fields[0];
  writeField(b, text, 'Hello'); writeField(b, text, '');
  assert.equal(b.text, '');

  // Numbers come back as numbers.
  const h2 = blockSkeleton('heading', 'blk_aaaaaaa3');
  writeField(h2, SPECS.heading.fields[0], '4');
  assert.strictEqual(h2.level, 4);

  // Display options live under `display`, and an empty `display` is never left behind.
  const spacing = DISPLAY_FIELDS.find((f) => f.key === 'spacing');
  writeField(b, spacing, 'relaxed');
  assert.deepEqual(b.display, { spacing: 'relaxed' });
  writeField(b, spacing, '');
  assert.ok(!('display' in b));
  const tone = DISPLAY_FIELDS.find((f) => f.key === 'tone');
  writeField(b, tone, 'accent');
  writeField(b, spacing, 'compact');
  writeField(b, tone, '');
  assert.deepEqual(b.display, { spacing: 'compact' });
});

test('duplicating a block gives a new id and shares nothing with the original', () => {
  const original = { id: 'blk_aaaaaaa1', type: 'list', items: ['a', 'b'] };
  const copy = duplicateBlock(original, ['blk_aaaaaaa1']);
  assert.notEqual(copy.id, original.id);
  copy.items.push('c');
  assert.equal(original.items.length, 2);
  const fresh = withFreshIds([original, original], ['blk_aaaaaaa1']);
  assert.equal(new Set(fresh.map((b) => b.id)).size, 2);
  assert.ok(fresh.every((b) => b.id !== original.id));
});
