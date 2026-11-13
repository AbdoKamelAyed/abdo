import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { renderPreview, previewStyles, PreviewError } from '../src/core/preview.mjs';
import { loadContent } from '../src/lib/validate.mjs';
import { ROOT, workspace } from './helpers.mjs';

// Built stylesheets carry a content hash in their name (theme.<hash>.css).
const css = (ws, file) => {
  const [name, ext] = file.split('.');
  const found = readdirSync(join(ws.outDir, 'assets')).find((f) => f.startsWith(`${name}.`) && f.endsWith(`.${ext}`));
  return readFileSync(join(ws.outDir, 'assets', found), 'utf8');
};
const withSite = (edit, fn) => {
  const ws = workspace();
  try { edit(ws); const r = ws.build(); assert.ok(r.ok, JSON.stringify(r.errors)); return fn(ws); } finally { ws.cleanup(); }
};
const setLayout = (ws, patch) => ws.edit('config/languages.json', (d) => { for (const l of d.items) Object.assign(l.layout, structuredClone(patch)); });

test('the default site is unchanged: no layout rules, default page shape, no card shadow variable', () =>
  withSite(() => {}, (ws) => {
    const theme = css(ws, 'theme.css');
    assert.ok(!/\.grid\{grid-template-columns/.test(theme));
    assert.ok(!/--card-shadow/.test(theme));
    assert.match(ws.html('en'), /<html lang="en" dir="ltr" data-motion="[a-z]+" data-header="classic" data-footer="columns" data-nav="underline" data-sticky="on">/);
  }));

test('layout settings of one language reach only that language', () =>
  withSite((ws) => ws.edit('config/languages.json', (d) => {
    const ar = d.items.find((l) => l.code === 'ar');
    Object.assign(ar.layout, { header: 'centered', footer: 'minimal', nav: 'pill', stickyHeader: false, cards: 'flat', devices: { desktop: { columns: 2 }, mobile: { columns: 1 } } });
  }), (ws) => {
    assert.match(ws.html('ar'), /data-header="centered" data-footer="minimal" data-nav="pill" data-sticky="off"/);
    assert.match(ws.html('en'), /data-header="classic" data-footer="columns" data-nav="underline" data-sticky="on"/);
    const theme = css(ws, 'theme.css');
    assert.ok(theme.includes('html[lang="ar"] .grid{grid-template-columns:repeat(2,minmax(0,1fr));}'));
    assert.ok(theme.includes('@media (max-width:640px){html[lang="ar"] .grid{grid-template-columns:repeat(1,minmax(0,1fr));}}'));
    assert.ok(theme.includes('html[lang="ar"] .card{background:transparent;border-color:transparent;}'));
    assert.ok(!theme.includes('html[lang="en"] .grid'));
  }));

test('colours for one language are written as partial rules for that language, for both colour themes', () =>
  withSite((ws) => ws.edit('config/design.json', (d) => { d.languageOverrides = { ar: { light: { accent: '#0b5fa5' }, dark: { accent: '#7fb8ff' } } }; }), (ws) => {
    const theme = css(ws, 'theme.css');
    assert.ok(theme.includes('html[lang="ar"]{--accent:#0b5fa5;'));
    assert.ok(theme.includes('html[lang="ar"]:not([data-theme="light"])'));
    assert.ok(theme.includes('html[lang="ar"][data-theme="dark"]'));
    assert.ok(theme.includes('--accent:#7fb8ff;'));
    assert.ok(!/html\[lang="en"\][^{]*\{[^}]*--accent/.test(theme));
  }));

test('card shadow is written only when chosen', () =>
  withSite((ws) => ws.edit('config/design.json', (d) => { d.overrides = { ...(d.overrides ?? {}), shared: { cardShadow: 'medium' } }; }), (ws) => {
    assert.match(css(ws, 'theme.css'), /--card-shadow:0 [^;]+;/);
    assert.match(css(ws, 'base.css'), /box-shadow: var\(--card-shadow, none\)/);
  }));

test('an invalid layout (bad breakpoints) stops the build with a clear message', () => {
  const ws = workspace();
  try {
    setLayout(ws, { breakpoints: { tablet: 600, mobile: 700 } });
    const r = ws.build();
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /tablet breakpoint \(600px\) must be wider/.test(e.message)), JSON.stringify(r.errors));
  } finally { ws.cleanup(); }
});

// ---------------------------------------------------------------- previews of whole pages

const content = loadContent(ROOT, `${ROOT}/content`);
const assets = { ...previewStyles(content), baseCss: readFileSync(join(ROOT, 'public/assets/base.css'), 'utf8') };

test('the home page can be previewed in both languages with the current design, without scripts', () => {
  for (const lang of ['ar', 'en']) {
    const { html, files } = renderPreview(content, { kind: 'home', lang, assets });
    assert.match(html, new RegExp(`<html lang="${lang}"`));
    assert.ok(!/<script/.test(html));
    assert.ok(html.includes('class="section'), 'has homepage sections');
    assert.ok(files.length > 0);
  }
  for (const kind of ['blog', 'portfolio', 'topics', 'about']) assert.ok(renderPreview(content, { kind, lang: 'en', assets }).html.length > 1000, kind);
});

test('a hidden section does not appear in the preview, and a changed one does', () => {
  const hp = structuredClone(content.homepage);
  const list = hp.languages.en.sections;
  const articles = list.find((s) => s.type === 'articles');
  const before = renderPreview(content, { kind: 'home', lang: 'en', assets }).html;
  articles.enabled = false;
  const hidden = renderPreview({ ...content, homepage: hp }, { kind: 'home', lang: 'en', assets }).html;
  assert.ok(before.includes('Latest articles') && !hidden.includes('Latest articles'));
  articles.enabled = true; articles.title = 'Fresh writing';
  assert.ok(renderPreview({ ...content, homepage: hp }, { kind: 'home', lang: 'en', assets }).html.includes('Fresh writing'));
});

test('a preview of an unknown language says so instead of failing silently', () => {
  assert.throws(() => renderPreview(content, { kind: 'home', lang: 'xx', assets }), PreviewError);
});
