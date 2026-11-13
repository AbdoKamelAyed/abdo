import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../src/build.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A throw-away copy of content/ that a test can edit, plus an output folder next to it. */
export function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'abdo-test-'));
  const contentDir = join(dir, 'content');
  cpSync(join(ROOT, 'content'), contentDir, { recursive: true });
  const outDir = join(dir, 'dist');
  const api = {
    dir, contentDir, outDir,
    read: (rel) => JSON.parse(readFileSync(join(contentDir, rel), 'utf8')),
    write: (rel, data) => writeFileSync(join(contentDir, rel), `${JSON.stringify(data, null, 2)}\n`),
    edit(rel, fn) { const data = api.read(rel); fn(data); api.write(rel, data); return data; },
    build: (options = {}) => build({ content: contentDir, out: outDir, ...options }),
    html: (...segs) => readFileSync(join(outDir, ...segs, 'index.html'), 'utf8'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
  return api;
}

/** Every file below `dir`, as paths relative to it. */
export function allFiles(dir, prefix = '') {
  return readdirSync(join(dir, prefix)).flatMap((name) => {
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(join(dir, rel)).isDirectory() ? allFiles(dir, rel) : [rel];
  });
}

export function allText(dir, extensions = ['.html', '.xml', '.txt', '.css', '.js']) {
  return allFiles(dir)
    .filter((f) => extensions.some((e) => f.endsWith(e)))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}
