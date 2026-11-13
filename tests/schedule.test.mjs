// Scheduled publishing: the build treats due content as published, later content stays hidden, and the
// workflow's timer decides from the content alone whether a run has anything to do.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { dueWithin, isDue, listScheduled, releaseDue } from '../src/core/schedule.mjs';
import { createRegistry, loadContent, validateContent } from '../src/lib/validate.mjs';
import { ROOT, allText, workspace } from './helpers.mjs';

const workspaces = [];
after(() => workspaces.forEach((w) => w.cleanup()));
const fresh = () => { const ws = workspace(); workspaces.push(ws); return ws; };
const registry = createRegistry(ROOT);
const problems = (ws) => validateContent(loadContent(ROOT, ws.contentDir), registry);

const AT = '2030-06-01T09:00:00Z';
const at = (minutes) => new Date(Date.parse(AT) + minutes * 60_000);

/** The sample article, scheduled for AT in English (and Arabic when `both`). */
function schedule(ws, { both = false, record = 'scheduled' } = {}) {
  ws.edit('articles/art_welcome1.json', (a) => {
    a.status = record; a.publishedAt = AT;
    a.translations.en.status = 'scheduled';
    if (both) a.translations.ar.status = 'scheduled';
  });
}
const slugEn = (ws) => ws.read('articles/art_welcome1.json').translations.en.slug;

test('isDue needs a valid date and compares with the clock given', () => {
  assert.equal(isDue({ publishedAt: AT }, at(-1)), false);
  assert.equal(isDue({ publishedAt: AT }, at(0)), true, 'due exactly at the moment');
  assert.equal(isDue({ publishedAt: AT }, at(1)), true);
  assert.equal(isDue({}, at(1)), false);
  assert.equal(isDue({ publishedAt: 'soon' }, at(1)), false);
});

test('releaseDue publishes due records and translations, leaves later ones, and says what it did', () => {
  const content = {
    articles: [
      { id: 'a1', status: 'scheduled', publishedAt: AT, translations: { en: { status: 'scheduled' }, ar: { status: 'draft' } } },
      { id: 'a2', status: 'scheduled', publishedAt: '2031-01-01T00:00:00Z', translations: { en: { status: 'scheduled' } } },
      { id: 'a3', status: 'published', publishedAt: AT, translations: { en: { status: 'published' } } },
    ],
    projects: [{ id: 'p1', status: 'scheduled', publishedAt: AT, translations: { en: { status: 'published' } } }],
  };
  const released = releaseDue(content, at(5));
  assert.deepEqual(released.map((r) => `${r.kind}:${r.id}:${r.lang ?? '-'}`), ['article:a1:-', 'article:a1:en', 'project:p1:-']);
  assert.equal(content.articles[0].status, 'published');
  assert.equal(content.articles[0].translations.en.status, 'published');
  assert.equal(content.articles[0].translations.ar.status, 'draft', 'a draft translation is not published by the schedule');
  assert.equal(content.articles[1].status, 'scheduled', 'a later date stays scheduled');
  assert.equal(content.projects[0].status, 'published');
  assert.deepEqual(releaseDue(content, at(5)), [], 'nothing is released twice');
});

test('listScheduled is ordered by date and says what is due; dueWithin looks only at a recent window', () => {
  const content = {
    articles: [
      { id: 'late', status: 'scheduled', publishedAt: '2031-01-01T00:00:00Z', translations: { en: { title: 'Late', status: 'scheduled' } } },
      { id: 'soon', status: 'scheduled', publishedAt: AT, translations: { en: { title: 'Soon', status: 'scheduled' } } },
      { id: 'draft', status: 'draft', translations: { en: { title: 'Draft', status: 'draft' } } },
    ],
    projects: [],
  };
  const list = listScheduled(content, at(10));
  assert.deepEqual(list.map((s) => s.id), ['soon', 'late']);
  assert.deepEqual(list.map((s) => s.due), [true, false]);
  assert.equal(dueWithin(content, at(10), 90), true, 'became due ten minutes ago');
  assert.equal(dueWithin(content, at(120), 90), false, 'became due two hours ago: outside the window');
  assert.equal(dueWithin(content, at(-10), 90), false, 'not due yet');
});

test('build: scheduled content is absent before its time and present after, in pages, sitemap and language links', () => {
  const ws = fresh();
  schedule(ws, { both: true });
  const before = ws.build({ siteUrl: 'https://example.github.io/abdo', admin: false, now: at(-30) });
  assert.ok(before.ok, JSON.stringify(before.errors));
  assert.deepEqual(before.released, []);
  assert.ok(!allText(ws.outDir).includes(slugEn(ws)), 'the slug appears nowhere before the date');

  const after_ = ws.build({ siteUrl: 'https://example.github.io/abdo', admin: false, now: at(20) });
  assert.ok(after_.ok, JSON.stringify(after_.errors));
  assert.equal(after_.released.length, 3, 'the record and both translations');
  assert.ok(existsSync(join(ws.outDir, 'en', 'articles', slugEn(ws), 'index.html')) || allText(ws.outDir).includes(`/${slugEn(ws)}/`), 'the page is built');
  assert.match(readFileSync(join(ws.outDir, 'sitemap.xml'), 'utf8'), new RegExp(slugEn(ws)));
  // the files are untouched: still scheduled, the build only treats them as published
  assert.equal(ws.read('articles/art_welcome1.json').status, 'scheduled');
});

test('validation: scheduled content needs a date and a body, is held to the published standard, and odd combinations are warned about', () => {
  let ws = fresh();
  ws.edit('articles/art_welcome1.json', (a) => { a.status = 'scheduled'; delete a.publishedAt; a.translations.en.status = 'scheduled'; });
  assert.match(problems(ws).errors.map((e) => `${e.path}: ${e.message}`).join('\n'), /publishedAt/, 'a scheduled record needs publishedAt');

  ws = fresh(); schedule(ws);
  ws.edit('articles/art_welcome1.json', (a) => { a.translations.en.body = []; });
  assert.ok(problems(ws).errors.some((e) => /body/.test(e.path)), 'an empty body cannot be scheduled');

  ws = fresh(); schedule(ws);
  ws.edit('articles/art_welcome1.json', (a) => { a.translations.en.body[0] = { id: a.translations.en.body[0].id, type: 'paragraph', text: 'Write the opening here ⟦your opening⟧' }; });
  assert.ok(problems(ws).errors.some((e) => /placeholder/.test(e.message)), 'a placeholder is an error, as it is for published content');

  ws = fresh(); schedule(ws);
  assert.deepEqual(problems(ws).errors, [], 'a clean scheduled article validates');

  ws = fresh();
  ws.edit('articles/art_welcome1.json', (a) => { a.status = 'draft'; a.publishedAt = AT; a.translations.en.status = 'scheduled'; });
  assert.match(problems(ws).warnings.map((w) => w.message).join('\n'), /translation "en" is scheduled but the record status is "draft"/);

  ws = fresh(); schedule(ws);
  ws.edit('articles/art_welcome1.json', (a) => { a.publishedAt = '2020-01-01T00:00:00Z'; });
  assert.match(problems(ws).warnings.map((w) => w.message).join('\n'), /already passed: it goes live with the next build/);
});

test('the timer tool: lists what is scheduled and decides, from the content alone, whether a timer run should build', () => {
  const ws = fresh(); schedule(ws);
  const dir = mkdtempSync(join(tmpdir(), 'abdo-out-'));
  const out = join(dir, 'output');
  const run = (now, event) => {
    writeFileSync(out, '');
    const stdout = execFileSync(process.execPath, [join(ROOT, 'tools/scheduled.mjs'), '--content', ws.contentDir, '--now', now.toISOString(), '--github-output'], { env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: out }, encoding: 'utf8' });
    return { stdout, run: /run=(true|false)/.exec(readFileSync(out, 'utf8'))[1] };
  };
  try {
    assert.equal(run(at(-30), 'schedule').run, 'false', 'nothing due: the timer run is skipped');
    assert.equal(run(at(10), 'schedule').run, 'true', 'became due: the timer run builds');
    assert.equal(run(at(200), 'schedule').run, 'false', 'it was released long ago: no more timer builds for it');
    assert.equal(run(at(-30), 'push').run, 'true', 'a push always builds');
    assert.equal(run(at(-30), 'workflow_dispatch').run, 'true', 'a manual run always builds');
    assert.match(run(at(10), 'push').stdout, /DUE\s+2030-06-01T09:00:00Z\s+article art_welcome1/);
    assert.match(run(at(-30), 'push').stdout, /scheduled\s+2030-06-01T09:00:00Z/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the deploy workflow has the timer, the check job, and builds only when the check says so', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(yml, /schedule:\n\s+- cron: '[^']+'/);
  assert.match(yml, /check:[\s\S]*node tools\/scheduled\.mjs --github-output/);
  assert.match(yml, /build:\n\s+needs: check\n\s+if: needs\.check\.outputs\.run == 'true'/);
  assert.match(yml, /deploy:\n\s+needs: build/);
});
