import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SchemaRegistry, didYouMean, formatPath } from '../src/lib/jsonschema.mjs';

const registry = new SchemaRegistry()
  .add({
    $id: 'https://t.test/common.json',
    $defs: { id: { type: 'string', pattern: '^id_[0-9a-z]{4}$' } },
  })
  .add({
    $id: 'https://t.test/thing.json',
    type: 'object',
    required: ['id', 'kind'],
    additionalProperties: false,
    properties: {
      id: { $ref: 'common.json#/$defs/id' },
      kind: { enum: ['alpha', 'beta'] },
      count: { type: 'integer', minimum: 1, maximum: 5 },
      day: { type: 'string', format: 'date' },
      tags: { type: 'array', uniqueItems: true, maxItems: 2, items: { type: 'string', minLength: 1 } },
      shape: {
        oneOf: [
          { type: 'object', required: ['page'], additionalProperties: false, properties: { page: { type: 'string' } } },
          { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string' } } },
        ],
      },
    },
    allOf: [{ if: { required: ['kind'], properties: { kind: { const: 'beta' } } }, then: { required: ['count'] } }],
  });

const check = (data) => registry.validate('https://t.test/thing.json', data);
const messages = (data) => check(data).map((e) => `${formatPath(e.path)}: ${e.message}`);

test('accepts a valid document', () => {
  assert.deepEqual(check({ id: 'id_ab12', kind: 'alpha' }), []);
});

test('reports missing required properties', () => {
  assert.match(messages({})[0], /missing required property "id"/);
});

test('resolves $ref across schemas and checks patterns', () => {
  assert.match(messages({ id: 'bad', kind: 'alpha' }).join('\n'), /id: has an invalid format/);
});

test('enum errors suggest the closest value', () => {
  assert.match(messages({ id: 'id_ab12', kind: 'alhpa' }).join('\n'), /did you mean "alpha"/);
});

test('rejects unknown properties and suggests the likely typo', () => {
  assert.match(messages({ id: 'id_ab12', kind: 'alpha', cuont: 2 }).join('\n'), /unknown property "cuont" \(did you mean "count"\?\)/);
});

test('numbers: type, integer-ness and range', () => {
  assert.match(messages({ id: 'id_ab12', kind: 'alpha', count: 9 }).join('\n'), /count: must be <= 5/);
  assert.match(messages({ id: 'id_ab12', kind: 'alpha', count: 1.5 }).join('\n'), /count: must be integer/);
});

test('date format rejects impossible dates', () => {
  assert.deepEqual(check({ id: 'id_ab12', kind: 'alpha', day: '2026-02-28' }), []);
  assert.match(messages({ id: 'id_ab12', kind: 'alpha', day: '2026-02-31' }).join('\n'), /valid date/);
});

test('arrays: uniqueness, size and item rules carry the index in the path', () => {
  const out = messages({ id: 'id_ab12', kind: 'alpha', tags: ['a', 'a', ''] }).join('\n');
  assert.match(out, /tags\[1\]: is a duplicate/);
  assert.match(out, /tags\[2\]: must not be empty/);
  assert.match(out, /tags: must have at most 2 item/);
});

test('oneOf: exactly one branch must match', () => {
  assert.deepEqual(check({ id: 'id_ab12', kind: 'alpha', shape: { page: 'home' } }), []);
  assert.ok(check({ id: 'id_ab12', kind: 'alpha', shape: { page: 'home', url: 'x' } }).length > 0);
  assert.ok(check({ id: 'id_ab12', kind: 'alpha', shape: {} }).length > 0);
});

test('if/then conditions apply', () => {
  assert.match(messages({ id: 'id_ab12', kind: 'beta' }).join('\n'), /missing required property "count"/);
  assert.deepEqual(check({ id: 'id_ab12', kind: 'beta', count: 2 }), []);
});

test('an unsupported keyword is rejected when the schema is registered', () => {
  assert.throws(() => new SchemaRegistry().add({ $id: 'https://t.test/x.json', type: 'object', patternProperties: {} }), /unsupported keyword "patternProperties"/);
});

test('an unresolved $ref fails loudly instead of passing everything', () => {
  const r = new SchemaRegistry().add({ $id: 'https://t.test/y.json', $ref: 'missing.json#/$defs/z' });
  assert.throws(() => r.validate('https://t.test/y.json', {}), /Unresolved \$ref/);
});

test('didYouMean only suggests close matches', () => {
  assert.equal(didYouMean('publised', ['published', 'draft']), 'published');
  assert.equal(didYouMean('zzzzzz', ['published', 'draft']), null);
});
