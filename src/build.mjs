#!/usr/bin/env node
// ABDO build: content/*.json  ->  dist/ (plain static HTML, CSS, one small JS file).
//
//   node src/build.mjs [--site-url URL] [--out DIR] [--content DIR] [--exclude-samples] [--validate-only]
//                      [--no-admin] [--admin-api-base ORIGIN]
//
// Exit code is non-zero when validation fails or a generated link is broken.

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { releaseDue } from './core/schedule.mjs';
import { checkLinks } from './lib/linkcheck.mjs';
import { buildModel } from './lib/model.mjs';
import { buildSearchIndex } from './lib/search-index.mjs';
import { searchBundle } from './lib/search-bundle.mjs';
import { topicColorCss } from './lib/topic-colors.mjs';
import { profileIsSample, stripSamples } from './lib/samples.mjs';
import { generateGlassCss, generateThemeCss } from './lib/theme.mjs';
import { createRegistry, formatProblems, loadContent, validateContent } from './lib/validate.mjs';
import { copyFile, esc, shortHash, writeText } from './lib/util.mjs';
import { generatePages } from './render/pages.mjs';
import { renderPage } from './render/layout.mjs';
import { robotsTxt, sitemapXml } from './lib/seo.mjs';
import { buildAdmin, DEFAULT_API_BASE } from './admin-build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '.abdo-build';

export function build(options = {}) {
  const log = options.log ?? (() => {});
  const contentDir = resolve(options.content ?? join(ROOT, 'content'));
  const outDir = resolve(options.out ?? join(ROOT, 'dist'));

  const registry = createRegistry(ROOT);
  let content = loadContent(ROOT, contentDir);

  if (options.excludeSamples) {
    if (profileIsSample(content)) {
      return { ok: false, errors: [{ file: content.fileOf.get(content.profile), path: 'sample', message: 'the profile is still marked "sample": true. Replace it with your real profile and remove the flag, then build with --exclude-samples.' }], warnings: [] };
    }
    content = stripSamples(content);
  }

  const { errors, warnings } = validateContent(content, registry);
  if (errors.length > 0) return { ok: false, errors, warnings };
  if (options.validateOnly) return { ok: true, errors, warnings, validateOnly: true };

  // Scheduled content whose date has come is public in this build (the files are not changed).
  const released = releaseDue(content, options.now ?? new Date());
  for (const r of released) log(`scheduled ${r.kind} ${r.id}${r.lang ? ` (${r.lang})` : ''} is due (${r.publishedAt}): published in this build`);
  const model = buildModel(content, { siteUrl: options.siteUrl, now: options.now });
  prepareOutputDir(outDir);

  // ---- Assets (content-hashed names, so browsers never serve a stale stylesheet) ----
  const themeCss = generateThemeCss(content.design, content.presets, model.languages);
  const glassCss = generateGlassCss(content.design, content.presets);
  const baseCss = `${readFileSync(join(ROOT, 'public', 'assets', 'base.css'), 'utf8')}${topicColorCss(content.topics.filter((t) => t.status === 'published')) ? `\n/* topic accent colours (generated) */\n${topicColorCss(content.topics.filter((t) => t.status === 'published'))}\n` : ''}`;
  const siteJs = readFileSync(join(ROOT, 'public', 'assets', 'site.js'), 'utf8');
  const assetFile = (name, ext, text) => `assets/${name}.${shortHash(text)}.${ext}`;
  const files = {
    themeCss: assetFile('theme', 'css', themeCss),
    glassCss: assetFile('glass', 'css', glassCss),
    baseCss: assetFile('base', 'css', baseCss),
    siteJs: assetFile('site', 'js', siteJs),
  };
  writeText(join(outDir, files.themeCss), themeCss);
  writeText(join(outDir, files.glassCss), glassCss);
  writeText(join(outDir, files.baseCss), baseCss);
  writeText(join(outDir, files.siteJs), siteJs);
  const assets = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, `${model.basePath}/${f}`]));

  // ---- Search: one index per language plus the script that reads it (only when search is on) ----
  let searchStats = null;
  if (model.search.enabled) {
    const script = searchBundle(ROOT).script;
    const scriptFile = assetFile('search', 'js', script);
    writeText(join(outDir, scriptFile), script);
    assets.searchJs = `${model.basePath}/${scriptFile}`;
    assets.searchIndex = {};
    searchStats = {};
    for (const [lang, L] of Object.entries(model.langs)) {
      const { index, docCount, termCount } = buildSearchIndex(model, L, model.search);
      const json = JSON.stringify(index);
      const file = assetFile(`search-${lang}`, 'json', json);
      writeText(join(outDir, file), json);
      assets.searchIndex[lang] = `${model.basePath}/${file}`;
      searchStats[lang] = { docs: docCount, terms: termCount, bytes: Buffer.byteLength(json) };
    }
  }

  // ---- Pages ----
  const pages = generatePages(model, assets);
  const written = [];
  for (const page of pages) {
    const file = join(...page.segs, 'index.html');
    writeText(join(outDir, file), page.html);
    written.push({ file });
  }

  // ---- Media: only files referenced by public content are published ----
  let mediaCount = 0;
  for (const id of model.usedMedia) {
    const asset = model.mediaById.get(id);
    copyFile(join(contentDir, 'media', 'files', asset.file), join(outDir, 'media', asset.file));
    mediaCount += 1;
  }

  // ---- Root, 404, sitemap, robots ----
  writeText(join(outDir, 'index.html'), rootRedirect(model));
  written.push({ file: 'index.html' });
  writeText(join(outDir, '404.html'), notFoundPage(model, assets));
  writeText(join(outDir, 'sitemap.xml'), sitemapXml(model, pages.map((p) => p.entry).filter(Boolean)));
  writeText(join(outDir, 'robots.txt'), robotsTxt(model, { admin: options.admin !== false }));
  let adminFiles = [];
  if (options.admin !== false) adminFiles = buildAdmin({ rootDir: ROOT, outDir, apiBase: options.adminApiBase ?? DEFAULT_API_BASE, siteUrl: model.siteUrl });
  writeText(join(outDir, '.nojekyll'), '');
  writeText(join(outDir, MARKER), 'Generated by the ABDO build. Safe to delete and rebuild.\n');

  // ---- Self-check: a broken internal link fails the build ----
  const broken = checkLinks(outDir, model.basePath, written);
  if (broken.length > 0) {
    return {
      ok: false,
      errors: broken.map((b) => ({ file: b.page, path: b.target, message: `broken link: ${b.reason}` })),
      warnings,
    };
  }

  log(`Built ${pages.length} pages in ${model.languages.length} languages, ${mediaCount} media files -> ${relative(process.cwd(), outDir) || '.'}`);
  return { ok: true, errors, warnings, released, pages: pages.length, media: mediaCount, outDir, model, hasSample: model.hasSample, adminFiles, search: searchStats };
}

function prepareOutputDir(outDir) {
  if (existsSync(outDir)) {
    const entries = readdirSync(outDir);
    if (entries.length > 0 && !entries.includes(MARKER)) {
      throw new Error(`Refusing to overwrite ${outDir}: it is not empty and was not created by this build (no ${MARKER} marker). Choose another --out folder or empty it yourself.`);
    }
    const rel = relative(ROOT, outDir);
    const outsideProject = rel.startsWith('..') || isAbsolute(rel);
    if (outsideProject && entries.length === 0) return;
    rmSync(outDir, { recursive: true, force: true });
  }
}

function rootRedirect(model) {
  const def = model.langs[model.defaultLang];
  const map = Object.fromEntries(model.languages.map((l) => [l.code, model.langs[l.code].homeUrl]));
  const links = model.languages.map((l) => `<li><a href="${esc(map[l.code])}" hreflang="${esc(l.code)}" lang="${esc(l.code)}">${esc(l.nativeName)}</a></li>`).join('');
  const script = `(function(){var m=${JSON.stringify(map).replace(/</g, '\\u003c')};var l=((navigator.language||'')+'').slice(0,2).toLowerCase();var t=m[l];if(t){location.replace(t)}else{location.replace(${JSON.stringify(map[model.defaultLang])})}})();`;
  return `<!doctype html>
<html lang="${esc(def.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(def.siteName)}</title>
<link rel="canonical" href="${esc(model.absolute(map[model.defaultLang]))}">
<noscript><meta http-equiv="refresh" content="0; url=${esc(map[model.defaultLang])}"></noscript>
<script>${script}</script>
</head>
<body>
<ul>${links}</ul>
</body>
</html>
`;
}

function notFoundPage(model, assets) {
  const def = model.langs[model.defaultLang];
  const blocks = model.languages.map((l) => {
    const L = model.langs[l.code];
    return `<section class="container container--narrow not-found" lang="${esc(l.code)}" dir="${esc(l.direction)}">
  <h1>${esc(L.i18n.t('not_found_title'))}</h1>
  <p>${esc(L.i18n.t('not_found_text'))}</p>
  <p><a class="button" href="${esc(L.homeUrl)}">${esc(L.i18n.t('back_home'))}</a></p>
</section>`;
  }).join('\n');
  return renderPage(model, def, {
    kind: '404', title: def.i18n.t('not_found_title'), url: '/404.html', noCanonical: true, robots: 'noindex',
    description: def.i18n.t('not_found_text'), currentPage: null, main: blocks,
  }, assets);
}

// ------------------------------------------------------------------ CLI

function main() {
  const { values } = parseArgs({
    options: {
      'site-url': { type: 'string' },
      out: { type: 'string' },
      content: { type: 'string' },
      'exclude-samples': { type: 'boolean', default: false },
      'validate-only': { type: 'boolean', default: false },
      'no-admin': { type: 'boolean', default: false },
      'admin-api-base': { type: 'string' },
    },
    allowPositionals: false,
  });

  let result;
  try {
    result = build({
      siteUrl: values['site-url'],
      out: values.out,
      content: values.content,
      excludeSamples: values['exclude-samples'],
      validateOnly: values['validate-only'],
      admin: !values['no-admin'],
      adminApiBase: values['admin-api-base'],
      log: (line) => console.log(line),
    });
  } catch (error) {
    console.error(`\nBuild failed: ${error.message}`);
    process.exit(1);
  }

  if (result.warnings.length) console.warn(`\nWarnings (${result.warnings.length}):\n${formatProblems(result.warnings)}`);
  if (!result.ok) {
    console.error(`\nBuild failed with ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}:\n${formatProblems(result.errors)}`);
    process.exit(1);
  }
  if (result.validateOnly) console.log('Content is valid.');
  else if (result.hasSample) console.log('Note: the site still contains sample content. Build with --exclude-samples once you have replaced it.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
