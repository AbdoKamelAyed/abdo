// Internal notes: stored with the record, edited in the admin, and never part of the built site.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { ROOT, workspace } from './helpers.mjs';

const workspaces = [];
after(() => workspaces.forEach((w) => w.cleanup()));
const fresh = () => { const ws = workspace(); workspaces.push(ws); return ws; };
const registry = createRegistry(ROOT);
const problems = (ws) => validateContent(loadContent(ROOT, ws.contentDir), registry);
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

const NOTE = 'INTERNAL-NOTE-9f3a1c: ask Sara for the source and check the 2019 figures';

test('internal notes never reach the built site, in any file, with or without the admin app', () => {
  for (const admin of [false, true]) {
    const ws = fresh();
    ws.edit('articles/art_welcome1.json', (a) => { a.internalNotes = NOTE; });
    ws.edit('projects/prj_archive1.json', (p) => { p.internalNotes = `${NOTE} (project)`; });
    const result = ws.build({ siteUrl: 'https://example.github.io/abdo', admin, now: new Date('2026-11-01T00:00:00Z') });
    assert.ok(result.ok, JSON.stringify(result.errors));
    const hits = walk(ws.outDir).filter((f) => readFileSync(f).includes('INTERNAL-NOTE-9f3a1c'));
    assert.deepEqual(hits, [], `a note was written into ${hits.join(', ')} (admin build: ${admin})`);
  }
});

test('internal notes: the schema takes a non-empty string up to 4000 characters, and nothing else', () => {
  const ws = fresh();
  assert.deepEqual(problems(ws).errors, []);
  ws.edit('articles/art_welcome1.json', (a) => { a.internalNotes = 'a'.repeat(4000); });
  assert.deepEqual(problems(ws).errors, [], '4000 is allowed');
  for (const bad of ['', 'a'.repeat(4001), 5, ['x'], { text: 'x' }]) {
    ws.edit('articles/art_welcome1.json', (a) => { a.internalNotes = bad; });
    assert.ok(problems(ws).errors.some((e) => /internalNotes/.test(e.path)), `rejected: ${JSON.stringify(bad).slice(0, 30)}`);
  }
  ws.edit('articles/art_welcome1.json', (a) => { delete a.internalNotes; });
  ws.edit('projects/prj_archive1.json', (p) => { p.internalNotes = 7; });
  assert.ok(problems(ws).errors.some((e) => /internalNotes/.test(e.path) && /prj_archive1/.test(e.file)), 'projects have the same rule');
});

test('internal notes: text that looks like a credential gets a warning, ordinary notes do not', () => {
  const ws = fresh();
  for (const risky of ['token: abcdef123456', 'password = hunter2hunter2', 'use ghp_abcdefghijklmnopqrstuvwxyz0123456789 for the bot', 'api_key=ZZZZZZZZ1234']) {
    ws.edit('articles/art_welcome1.json', (a) => { a.internalNotes = risky; });
    assert.ok(problems(ws).warnings.some((w) => /internalNotes/.test(w.path) && /password or token/.test(w.message)), risky);
  }
  for (const fine of ['Check the token economics paragraph', 'Ask about the password manager review', NOTE]) {
    ws.edit('articles/art_welcome1.json', (a) => { a.internalNotes = fine; });
    assert.ok(!problems(ws).warnings.some((w) => /internalNotes/.test(w.path)), fine);
  }
});
