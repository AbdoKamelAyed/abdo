// Publishes the admin app into dist/admin/.
//
// The admin is plain static files: its own pages and scripts (public/admin), the pure modules it
// shares with the build (src/core and two files from src/lib, so it validates exactly like the
// build does), the JSON Schemas, and a small config.json. Nothing in it is secret.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyFile, listFiles, writeText } from './lib/util.mjs';

export const DEFAULT_API_BASE = 'https://api.github.com';
const API_BASE = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;

export function validateApiBase(value) {
  if (!API_BASE.test(value)) throw new Error(`Invalid --admin-api-base "${value}". Use an origin such as ${DEFAULT_API_BASE} (no path, no spaces).`);
  return value;
}

/** For GitHub Pages addresses, the repository the site is built from (the admin pre-fills it). */
export function deriveRepo(siteUrl) {
  let url;
  try { url = new URL(siteUrl); } catch { return null; }
  const match = /^([a-z0-9-]+)\.github\.io$/i.exec(url.hostname);
  if (!match) return null;
  const first = url.pathname.split('/').filter(Boolean)[0];
  return { owner: match[1], repo: first ?? `${match[1]}.github.io`, branch: 'main' };
}

function walk(root, rel = '') {
  const dir = rel ? join(root, rel) : root;
  const files = listFiles(dir).map((name) => (rel ? `${rel}/${name}` : name));
  return files;
}

/** @returns {string[]} the files written, relative to dist/admin */
export function buildAdmin({ rootDir, outDir, apiBase = DEFAULT_API_BASE, siteUrl }) {
  validateApiBase(apiBase);
  const src = join(rootDir, 'public', 'admin');
  const dest = join(outDir, 'admin');
  const written = [];
  const put = (rel, text) => { writeText(join(dest, rel), text); written.push(rel); };
  const copy = (from, rel) => { copyFile(from, join(dest, rel)); written.push(rel); };

  put('index.html', readFileSync(join(src, 'index.html'), 'utf8').replace('{{API_ORIGIN}}', apiBase));
  copy(join(src, 'admin.css'), 'admin.css');
  for (const folder of ['js', 'js/views', 'js/studio']) for (const name of walk(src, folder)) copy(join(src, name), name);

  for (const name of listFiles(join(rootDir, 'src', 'core'), '.mjs')) copy(join(rootDir, 'src', 'core', name), `shared/core/${name}`);
  // The page renderer and the search index builder, so the admin can preview a page, and try a search, with the very code that builds the site.
  for (const name of ['jsonschema.mjs', 'theme.mjs', 'markup.mjs', 'blocks.mjs', 'model.mjs', 'seo.mjs', 'i18n.mjs', 'search-index.mjs', 'topic-colors.mjs']) copy(join(rootDir, 'src', 'lib', name), `shared/lib/${name}`);
  for (const name of listFiles(join(rootDir, 'src', 'render'), '.mjs')) copy(join(rootDir, 'src', 'render', name), `shared/render/${name}`);
  copy(join(rootDir, 'public', 'assets', 'base.css'), 'preview/base.css');

  const schemas = listFiles(join(rootDir, 'schemas'), '.schema.json');
  for (const name of schemas) copy(join(rootDir, 'schemas', name), `schemas/${name}`);

  put('config.json', `${JSON.stringify({ apiBase, defaultRepo: siteUrl ? deriveRepo(siteUrl) : null, schemas }, null, 2)}\n`);
  return written;
}
