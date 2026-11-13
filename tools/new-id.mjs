#!/usr/bin/env node
// Prints a fresh, unused ID.  Usage: node tools/new-id.mjs <article|project|topic|tag|media|author|block> [count]

import { randomInt } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = { article: 'art', project: 'prj', topic: 'top', tag: 'tag', media: 'med', author: 'aut', block: 'blk', section: 'hsc', nav: 'nvi', preset: 'dsp' };
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const kind = process.argv[2];
const count = Math.max(1, Math.min(50, Number(process.argv[3] ?? 1)));
if (!PREFIX[kind]) {
  console.error(`Usage: node tools/new-id.mjs <${Object.keys(PREFIX).join('|')}> [count]`);
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.json')) yield full;
  }
}

const existing = new Set();
for (const file of walk(join(ROOT, 'content'))) {
  for (const match of readFileSync(file, 'utf8').matchAll(/"([a-z]{3}_[0-9a-z]{8})"/g)) existing.add(match[1]);
}

const made = new Set();
while (made.size < count) {
  const id = `${PREFIX[kind]}_${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;
  if (!existing.has(id)) made.add(id);
}
console.log([...made].join('\n'));
