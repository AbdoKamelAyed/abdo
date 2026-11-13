#!/usr/bin/env node
// Lists scheduled content and, for the deploy workflow, decides whether a timer run has anything to do.
//
//   node tools/scheduled.mjs                      what is scheduled, soonest first, and whether it is due
//   node tools/scheduled.mjs --github-output      also write run=true|false to $GITHUB_OUTPUT for the workflow
//   options: --content DIR   --now ISO_TIME (for testing)   --window MINUTES (default 90)
//
// A push or a manual run always builds. A timer run builds only when something became due inside the
// window. The window is longer than the timer's interval (30 minutes) so that one skipped timer run
// (GitHub sometimes drops them under load) does not lose a release.

import { appendFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { dueWithin, listScheduled } from '../src/core/schedule.mjs';
import { loadContent } from '../src/lib/validate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { content: { type: 'string' }, now: { type: 'string' }, window: { type: 'string' }, 'github-output': { type: 'boolean' } } });

const now = values.now ? new Date(values.now) : new Date();
if (Number.isNaN(now.getTime())) { console.error('--now must be a date and time, e.g. 2026-12-01T09:00:00Z'); process.exit(2); }
const windowMinutes = Number(values.window ?? 90);
const content = loadContent(ROOT, resolve(values.content ?? join(ROOT, 'content')));

const items = listScheduled(content, now);
if (!items.length) console.log('Nothing is scheduled.');
for (const s of items) console.log(`${s.due ? 'DUE      ' : 'scheduled'}  ${s.publishedAt ?? '(no date)'}  ${s.kind} ${s.id}  ${s.title}${s.langs.length ? `  [${s.langs.join(', ')}]` : ''}`);

const event = process.env.GITHUB_EVENT_NAME ?? '';
const run = event !== 'schedule' || dueWithin(content, now, windowMinutes);
console.log(`event=${event || '(local)'}  run=${run}`);
if (values['github-output']) {
  if (!process.env.GITHUB_OUTPUT || !existsSync(dirname(process.env.GITHUB_OUTPUT))) { console.error('GITHUB_OUTPUT is not set'); process.exit(2); }
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
}
