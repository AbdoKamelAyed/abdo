// Tests for the admin app that need no browser: what its source code may contain, the integrity of
// its interface strings, and what the build publishes under /admin/. The browser behaviour is
// covered by tests/e2e/admin.e2e.mjs.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_API_BASE, deriveRepo, validateApiBase } from '../src/admin-build.mjs';
import { SPECS } from '../src/core/block-specs.mjs';
import { BLOCK_GROUPS } from '../src/core/blocks-meta.mjs';
import { COLOR_GROUPS, COLOR_KEYS, CARD_SHADOWS } from '../src/core/design-ops.mjs';
import { linkProblem } from '../src/core/editing.mjs';
import { ICON_KEYS } from '../src/core/icons.mjs';
import { SECTION_PRESETS, SECTION_SPECS, SECTION_TYPES, SPACINGS } from '../src/core/homepage-ops.mjs';
import { PAIRS } from '../src/core/contrast.mjs';
import { OPTIONS as LAYOUT_OPTIONS } from '../src/core/layout.mjs';
import { PAGINATION, RANKINGS, SEARCH_TYPES, VIEWS } from '../src/core/search-settings.mjs';
import { STRINGS, translate } from '../public/admin/js/strings.mjs';
import { ROOT, allFiles, allText, workspace } from './helpers.mjs';

const ADMIN_DIR = join(ROOT, 'public', 'admin');
const read = (...segs) => readFileSync(join(...segs), 'utf8');
const adminSources = () => allFiles(ADMIN_DIR).filter((f) => f.endsWith('.mjs')).map((f) => ({ file: f, text: read(ADMIN_DIR, f) }));

// ---------------------------------------------------------------- source rules

/** Source text without comments, so a sentence explaining why `innerHTML` is avoided does not trip the check. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

test('admin code never builds markup from strings or evaluates text', () => {
  const forbidden = [
    [/\.innerHTML\b/, 'innerHTML'], [/\.outerHTML\b/, 'outerHTML'], [/insertAdjacentHTML/, 'insertAdjacentHTML'],
    [/document\.write/, 'document.write'], [/\beval\s*\(/, 'eval'], [/new\s+Function\b/, 'new Function'],
    [/setTimeout\s*\(\s*['"`]/, 'setTimeout with a string'], [/createContextualFragment/, 'createContextualFragment'],
    [/DOMParser/, 'DOMParser'], [/srcdoc/, 'srcdoc'],
  ];
  for (const { file, text } of adminSources()) {
    const body = code(text);
    for (const [pattern, name] of forbidden) assert.doesNotMatch(body, pattern, `${file} uses ${name}`);
  }
});

test('admin code never writes the access token to persistent storage or the page', () => {
  for (const { file, text } of adminSources()) {
    const body = code(text);
    assert.doesNotMatch(body, /localStorage\.setItem\([^)]*token/i, `${file} stores the token in localStorage`);
    assert.doesNotMatch(body, /document\.cookie/, `${file} touches cookies`);
    assert.doesNotMatch(body, /console\.(log|info|debug|warn)\(/, `${file} logs to the console`);
  }
  // The only place the token may be persisted at all is sessionStorage, by explicit choice of the user.
  const session = adminSources().find((s) => s.file === 'js/session.mjs').text;
  assert.match(session, /sessionStorage/);
  assert.doesNotMatch(code(session), /localStorage\.setItem\(\s*['"`][^'"`]*token/i);
});

test('admin pages load only their own scripts and styles and ship a strict CSP', () => {
  const html = read(ADMIN_DIR, 'index.html');
  assert.match(html, /<meta name="robots" content="noindex/);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(directive), `missing ${directive}`);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[^<]/, 'no inline script');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'no inline event handlers');
  assert.doesNotMatch(html, /(src|href)="https?:/i, 'no external resources');
});

// ---------------------------------------------------------------- strings

const PLURAL = /^(.+)__(zero|one|two|few|many|other)$/;
function families(table) {
  const plain = new Set();
  const plural = new Map();
  for (const key of Object.keys(table)) {
    const match = PLURAL.exec(key);
    if (match) plural.set(match[1], [...(plural.get(match[1]) ?? []), match[2]]);
    else plain.add(key);
  }
  return { plain, plural };
}

test('English and Arabic define exactly the same strings', () => {
  const en = families(STRINGS.en);
  const ar = families(STRINGS.ar);
  assert.deepEqual([...ar.plain].sort(), [...en.plain].sort());
  assert.deepEqual([...ar.plural.keys()].sort(), [...en.plural.keys()].sort());
});

test('count strings define every plural form their language needs, and are never both plain and plural', () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    const { plain, plural } = families(table);
    const needed = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    for (const [base, forms] of plural) {
      assert.ok(!plain.has(base), `${lang}: "${base}" exists both as a plain and as a plural string`);
      for (const category of needed) assert.ok(forms.includes(category) || forms.includes('other'), `${lang}: "${base}" has no form for "${category}"`);
      assert.ok(forms.includes('other'), `${lang}: "${base}" needs an "other" form`);
      for (const form of forms) assert.match(table[`${base}__${form}`], /\{n\}|^[^{]*$/, `${lang}: "${base}__${form}" uses a placeholder other than {n}`);
    }
  }
});

test('strings never use "(s)" style plurals and never leave a placeholder name unknown', () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    for (const [key, value] of Object.entries(table)) {
      assert.equal(typeof value, 'string', `${lang}.${key} is not text`);
      assert.ok(value.trim().length > 0, `${lang}.${key} is empty`);
      assert.doesNotMatch(value, /\w\(s\)/, `${lang}.${key} uses "(s)"`);
    }
  }
  // The same placeholders in both languages for every plain key.
  const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const key of families(STRINGS.en).plain) assert.equal(names(STRINGS.ar[key]), names(STRINGS.en[key]), `placeholders of "${key}" differ between languages`);
});

test('plural selection follows the rules of each language', () => {
  assert.equal(translate('en', 'problems_title', { n: 1 }), '1 problem to fix');
  assert.equal(translate('en', 'problems_title', { n: 2 }), '2 problems to fix');
  assert.equal(translate('en', 'problems_title', { n: 0 }), '0 problems to fix');
  assert.equal(translate('ar', 'problems_title', { n: 1 }), 'مشكلة واحدة تحتاج إصلاحًا');
  assert.equal(translate('ar', 'problems_title', { n: 2 }), 'مشكلتان تحتاجان إصلاحًا');
  assert.equal(translate('ar', 'problems_title', { n: 3 }), '3 مشكلات تحتاج إصلاحًا');
  assert.equal(translate('ar', 'problems_title', { n: 11 }), '11 مشكلة تحتاج إصلاحًا');
  assert.equal(translate('ar', 'problems_title', { n: 100 }), '100 مشكلة تحتاج إصلاحًا');
  assert.equal(translate('ar', 'default_commit', { n: 2 }), 'تحديث المحتوى (ملفان)');
  assert.equal(translate('ar', 'default_commit', { n: 5 }), 'تحديث المحتوى (5 ملفات)');
});

test('translate falls back to English, then to the key, and never prints "undefined"', () => {
  assert.equal(translate('en', 'sign_in'), 'Sign in');
  assert.equal(translate('en', 'no_such_key_anywhere'), 'no_such_key_anywhere');
  assert.equal(translate('ar', 'edit_alt_title', {}), STRINGS.ar.edit_alt_title.replace('{name}', ''));
  assert.doesNotMatch(translate('en', 'edit_alt_title'), /undefined|null/);
});

/** Every string key the admin code can ask for through `ctx.t(...)`, found in its source. */
function requestedKeys() {
  const keys = new Set();
  const dynamic = new Set();
  for (const { file, text } of adminSources()) {
    const body = code(text);
    for (const call of body.matchAll(/\b(?:ctx|app)\.t\(((?:[^()]|\([^()]*\))*)\)/g)) {
      const first = call[1].split(/,(?![^(]*\))/)[0].trim();
      const single = /^'([a-z][a-z0-9_]*)'$/.exec(first);
      const choice = /\?\s*'([a-z][a-z0-9_]*)'\s*:\s*'([a-z][a-z0-9_]*)'\s*$/.exec(first);
      if (single) keys.add(single[1]);
      else if (choice) { keys.add(choice[1]); keys.add(choice[2]); }
      else if (first.startsWith('`') && first.includes('${')) dynamic.add(`${file}: ${first}`);
    }
    // A key built into a variable first (`const key = \`chk_${code}\`; ctx.t(key)`) is just as dynamic.
    for (const assignment of body.matchAll(/\b(?:const|let)\s+(?:key|\w+Key)\s*=\s*(`[a-z][a-z0-9]*_[^`]*\$\{[^`]*`)/g)) dynamic.add(`${file}: ${assignment[1]}`);
  }
  return { keys, dynamic };
}

test('every string key the admin code asks for exists', () => {
  const have = (key) => key in STRINGS.en || `${key}__other` in STRINGS.en;
  const { keys } = requestedKeys();
  assert.ok(keys.size > 100, 'the scan should find well over a hundred keys');
  assert.deepEqual([...keys].filter((k) => !have(k)), []);
});

test('every dynamically built string key resolves for every value it can take', () => {
  const sourceOf = (file) => code(read(ADMIN_DIR, file));
  const list = (file, name) => [...new RegExp(`const ${name} = \\[([^\\]]+)\\]`).exec(sourceOf(file))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const codesIn = (file) => [...read(ROOT, file).matchAll(/code: '([a-z_]+)'/g)].map((m) => m[1]);
  const families_ = {
    status_: list('js/views/editor-common.mjs', 'STATUSES'),
    pstatus_: list('js/views/project.mjs', 'PROJECT_STATUSES'),
    // Every block type has a name, and the types with repeated items name those items.
    block_: Object.keys(SPECS),
    item_: Object.entries(SPECS).filter(([, spec]) => spec.fields.some((f) => f.kind === 'group' || f.kind === 'refs')).map(([type]) => type),
    group_: Object.keys(BLOCK_GROUPS),
    change_: ['added', 'changed', 'deleted'],
    kind_: ['experience', 'education', 'skill', 'section', 'email', 'social', 'website'],
    nav_: list('js/app.mjs', 'ROUTES'),
    field_: ['challenge', 'process', 'solution', 'outcome'],
    used_in_: ['profile', 'site', 'topics', 'tags', 'homepage'],
    // The Studio: every advice code the pure modules can produce needs a sentence.
    chk_: codesIn('src/core/writing.mjs'),
    ty_issue_: codesIn('src/core/typography.mjs'),
    link_problem_: [...new Set(['', 'a b', 'javascript:alert(1)', 'ftp://x'].map(linkProblem).filter(Boolean))],
    diff_: ['easy', 'medium', 'hard', 'unknown'],
    rev_: ['added', 'removed', 'changed', 'moved'],
    focal_sample_: ['wide', 'square', 'tall'],
    mode_: list('js/studio/studio.mjs', 'MODES'),
    device_: ['phone', 'tablet', 'desktop'], theme_: ['auto', 'light', 'dark'], preview_: ['device', 'theme', 'empty_topic', 'empty_tag'],
    // Homepage Builder: section kinds, ready-made sections, layouts, spacing and source kinds.
    hp_t_: SECTION_TYPES,
    hp_p_: SECTION_PRESETS.map((p) => p.id),
    hp_layout_: [...new Set(Object.values(SECTION_SPECS).flatMap((s) => s.layouts))],
    hp_spacing_: SPACINGS,
    hp_kind_: ['any', 'article', 'project'],
    // Appearance Studio: colour names and groups, every contrast "where", glass elements, shadows, motion, page choices.
    col_: COLOR_KEYS,
    ap_group_: COLOR_GROUPS.map((g) => g.id),
    ap_where_: PAIRS.map((p) => p.where),
    ap_level_: ['error', 'warning'],
    ap_el_: ['header', 'menu', 'cards', 'hero', 'footer'],
    ap_shadow_: CARD_SHADOWS,
    ap_motion_: ['none', 'subtle', 'full'],
    ap_page_: ['home', 'blog', 'portfolio', 'topics', 'about'],
    ap_weight_: [400, 500, 600, 700, 800],
    ap_cards_: LAYOUT_OPTIONS.cards, ap_header_: LAYOUT_OPTIONS.header, ap_footer_: LAYOUT_OPTIONS.footer, ap_nav_: LAYOUT_OPTIONS.nav,
    lay_dev_: ['desktop', 'tablet', 'mobile'],
    // Content discovery: topic icons, similarity reasons, parent errors, search choices, navigation targets.
    visibility_: ['public', 'private'],
    tp_icon_: ICON_KEYS,
    tx_parent_: ['self', 'unknown', 'cycle'],
    tg_reason_: ['same', 'alias', 'typo'],
    ss_w_: list('js/views/search.mjs', 'WEIGHTS'),
    ss_type_: SEARCH_TYPES, ss_view_: VIEWS, ss_pagination_: PAGINATION, ss_ranking_: Object.keys(RANKINGS),
    nv_page_: list('js/views/navigation.mjs', 'PAGES'),
    nv_: ['header', 'header_hint', 'header_fallback', 'footer', 'footer_hint', 'footer_fallback'],
  };
  for (const [prefix, values] of Object.entries(families_)) {
    assert.ok(values.length > 0, `no values found for ${prefix}`);
    for (const lang of Object.keys(STRINGS)) for (const v of values) assert.ok(`${prefix}${v}` in STRINGS[lang], `${lang} is missing ${prefix}${v}`);
  }
  // Each dynamic call found in the source must use one of the families checked above.
  const { dynamic } = requestedKeys();
  for (const call of dynamic) assert.ok(Object.keys(families_).some((p) => call.includes(`\`${p}`)), `unchecked dynamic key: ${call}`);
});

test('every string key named in a Studio source file exists in both languages', () => {
  // Keys the Studio passes around as plain strings (toolbar button labels, option names, hints) never go
  // through a literal `ctx.t('...')`, so the scan above cannot see them. Anything in the Studio sources that
  // looks like a key of ours (a known prefix, snake_case, no BEM double underscore) must exist.
  const prefixes = new Set(Object.keys(STRINGS.en).map((k) => k.split('_')[0]));
  const missing = [];
  let seen = 0;
  for (const { file, text } of adminSources().filter((s) => s.file.startsWith('js/studio/'))) {
    for (const match of code(text).matchAll(/'([a-z][a-z0-9]*(?:_[a-z0-9]+)+)'/g)) {
      const key = match[1];
      if (!prefixes.has(key.split('_')[0])) continue;
      seen += 1;
      for (const lang of Object.keys(STRINGS)) if (!(key in STRINGS[lang] || `${key}__other` in STRINGS[lang])) missing.push(`${lang}: ${key} (${file})`);
    }
  }
  assert.ok(seen > 40, 'the scan should find the toolbar and panel keys');
  assert.deepEqual([...new Set(missing)], []);
});

test('profile editor labels and section titles exist as strings', () => {
  const text = code(read(ADMIN_DIR, 'js/views/profile.mjs'));
  const keys = new Set([...text.matchAll(/\b(?:label|title): '([a-z][a-z0-9_]*)'/g)].map((m) => m[1]));
  assert.ok(keys.size >= 8);
  for (const key of keys) assert.ok(key in STRINGS.en && key in STRINGS.ar, `missing ${key}`);
});

// ---------------------------------------------------------------- build output

test('deriveRepo reads owner and repository from a GitHub Pages address only', () => {
  assert.deepEqual(deriveRepo('https://abdo.github.io/site/'), { owner: 'abdo', repo: 'site', branch: 'main' });
  assert.deepEqual(deriveRepo('https://abdo.github.io'), { owner: 'abdo', repo: 'abdo.github.io', branch: 'main' });
  assert.equal(deriveRepo('https://abdo.example.com/site/'), null);
  assert.equal(deriveRepo('not a url'), null);
  assert.equal(deriveRepo('https://evilgithub.io/x'), null);
});

test('validateApiBase accepts an origin and rejects everything else', () => {
  assert.equal(validateApiBase(DEFAULT_API_BASE), DEFAULT_API_BASE);
  assert.equal(validateApiBase('http://localhost:4010'), 'http://localhost:4010');
  for (const bad of ['', 'api.github.com', 'https://api.github.com/', 'https://api.github.com/v3', "https://x.com'; script-src *", 'https://a b.com', 'ftp://x.com', 'https://x.com?y=1']) assert.throws(() => validateApiBase(bad), /Invalid --admin-api-base/, bad);
});

test('the build publishes the admin app, and keeps it out of the sitemap and out of search', () => {
  const ws = workspace();
  try {
    const result = ws.build({ siteUrl: 'https://abdo.github.io/site' });
    assert.ok(result.ok, JSON.stringify(result.errors));
    const files = allFiles(ws.outDir);
    for (const f of ['admin/index.html', 'admin/admin.css', 'admin/config.json', 'admin/js/app.mjs', 'admin/shared/core/validate-core.mjs', 'admin/shared/lib/jsonschema.mjs', 'admin/schemas/article.schema.json']) assert.ok(files.includes(f), `missing ${f}`);
    const config = JSON.parse(read(ws.outDir, 'admin', 'config.json'));
    assert.equal(config.apiBase, DEFAULT_API_BASE);
    assert.deepEqual(config.defaultRepo, { owner: 'abdo', repo: 'site', branch: 'main' });
    assert.ok(config.schemas.every((s) => files.includes(`admin/schemas/${s}`)));

    const html = read(ws.outDir, 'admin', 'index.html');
    assert.ok(!html.includes('{{API_ORIGIN}}'));
    assert.match(html, /connect-src 'self' https:\/\/api\.github\.com/);

    assert.match(read(ws.outDir, 'robots.txt'), /Disallow: \/site\/admin\//);
    assert.doesNotMatch(read(ws.outDir, 'sitemap.xml'), /admin/);
    // The public pages never link to the admin.
    const pages = allFiles(ws.outDir).filter((f) => f.endsWith('.html') && !f.startsWith('admin/'));
    for (const f of pages) assert.doesNotMatch(read(ws.outDir, f), /\/admin\//, `${f} links to the admin`);
  } finally { ws.cleanup(); }
});

test('--no-admin leaves the admin out entirely, and a custom API origin is used in the CSP', () => {
  const without = workspace();
  const custom = workspace();
  try {
    assert.ok(without.build({ admin: false }).ok);
    assert.ok(!allFiles(without.outDir).some((f) => f.startsWith('admin/')));
    assert.doesNotMatch(read(without.outDir, 'robots.txt'), /admin/);

    assert.ok(custom.build({ adminApiBase: 'https://ghe.example.com' }).ok);
    const html = read(custom.outDir, 'admin', 'index.html');
    assert.match(html, /connect-src 'self' https:\/\/ghe\.example\.com/);
    assert.doesNotMatch(html, /api\.github\.com/);
    assert.throws(() => custom.build({ adminApiBase: 'https://x.com/path' }), /Invalid --admin-api-base/);
  } finally { without.cleanup(); custom.cleanup(); }
});

test('no credential-looking text appears anywhere in the built site or in the admin sources', () => {
  const ws = workspace();
  try {
    assert.ok(ws.build().ok);
    const everything = `${allText(ws.outDir, ['.html', '.xml', '.txt', '.css', '.js', '.mjs', '.json'])}\n${adminSources().map((s) => s.text).join('\n')}`;
    assert.doesNotMatch(everything, /github_pat_[A-Za-z0-9_]{20,}/);
    assert.doesNotMatch(everything, /\bghp_[A-Za-z0-9]{20,}/);
    assert.doesNotMatch(everything, /\bgho_[A-Za-z0-9]{20,}/);
    assert.doesNotMatch(everything, /-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  } finally { ws.cleanup(); }
});

test('every file the admin imports is published', () => {
  const ws = workspace();
  try {
    assert.ok(ws.build().ok);
    const published = new Set(allFiles(ws.outDir).filter((f) => f.startsWith('admin/')));
    const importPattern = /(?:import|export)[^'"`]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    for (const file of [...published].filter((f) => f.endsWith('.mjs'))) {
      const text = read(ws.outDir, file);
      for (const m of text.matchAll(importPattern)) {
        const target = new URL(m[1] ?? m[2], `https://x.invalid/${file}`).pathname.slice(1);
        assert.ok(published.has(target), `${file} imports ${m[1] ?? m[2]}, which is not published (${target})`);
      }
    }
    assert.ok(statSync(join(ws.outDir, 'admin', 'index.html')).size > 500);
    assert.ok(readdirSync(join(ws.outDir, 'admin')).includes('shared'));
  } finally { ws.cleanup(); }
});
