// Pure validation of an assembled content tree. No file system, no Node APIs: the same code runs in
// the build and in the browser-based admin, so what the admin accepts is exactly what the build accepts.
//
// Two layers: (1) every file is checked against its JSON Schema; (2) cross-file rules that a
// schema cannot express (IDs match file names, references resolve, slugs are unique, ...).

import { formatPath } from '../lib/jsonschema.mjs';
import { checklistProblems, listProblems } from './lists.mjs';
import { footnoteReferences, mediaReferences, PLACEHOLDER, textFields } from './blocks-meta.mjs';
import { HERO_MIN_OPACITY } from '../lib/theme.mjs';
import { checkMode } from './contrast.mjs';
import { contrastReport, glassReport } from './design-ops.mjs';
import { layoutIssues } from './layout.mjs';
import { ICON_KEYS, isIcon } from './icons.mjs';
import { foldName } from './search-text.mjs';
import { descendantIds } from './taxonomy-ops.mjs';

export const CONFIG_REF = 'https://abdo.invalid/schemas/config.schema.json';
export const TAXONOMY_REF = 'https://abdo.invalid/schemas/taxonomy.schema.json';

/** Validate against a named definition inside a schema file, e.g. config.schema.json#/$defs/site. */
function validateDef(registry, schemaBase, defName, data) {
  const id = `${schemaBase}#wrapper/${defName}`;
  if (!registry.has(id)) registry.add({ $id: id, $ref: `${schemaBase}#/$defs/${defName}` });
  return registry.validate(id, data);
}

/** Characters that must never appear in free-form values that are written into generated CSS. */
const UNSAFE_CSS = /[{};<>\\]|url\s*\(|@import|expression\s*\(/i;

const SECRET_LOOKING = /(\bghp_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-[A-Za-z0-9]{20,}|\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,})/i;

export function validateContent(content, registry) {
  const errors = [];
  const warnings = [];
  const fileFor = (record) => content.fileOf.get(record) ?? '(unknown file)';
  const err = (record, path, message) => errors.push({ file: fileFor(record), path: formatPath(path), message });
  const warn = (record, path, message) => warnings.push({ file: fileFor(record), path: formatPath(path), message });

  const schemaCheck = (record, check) => {
    for (const e of check) err(record, e.path, e.message);
  };

  // ---------- 1. Schema validation ----------
  schemaCheck(content.site, validateDef(registry, CONFIG_REF, 'site', content.site));
  schemaCheck(content.languagesFile, validateDef(registry, CONFIG_REF, 'languagesFile', content.languagesFile));
  schemaCheck(content.navigation, validateDef(registry, CONFIG_REF, 'navigationFile', content.navigation));
  schemaCheck(content.homepage, validateDef(registry, CONFIG_REF, 'homepageFile', content.homepage));
  schemaCheck(content.design, validateDef(registry, CONFIG_REF, 'designFile', content.design));
  schemaCheck(content.presetsFile, validateDef(registry, CONFIG_REF, 'presetsFile', content.presetsFile));
  if (content.search) schemaCheck(content.search, validateDef(registry, CONFIG_REF, 'searchFile', content.search));
  for (const [lang, file] of Object.entries(content.i18n)) {
    schemaCheck(file, validateDef(registry, CONFIG_REF, 'uiStringsFile', file));
    void lang;
  }
  schemaCheck(content.topicsFile, validateDef(registry, TAXONOMY_REF, 'topicsFile', content.topicsFile));
  schemaCheck(content.tagsFile, validateDef(registry, TAXONOMY_REF, 'tagsFile', content.tagsFile));
  schemaCheck(content.mediaFile, registry.validate('https://abdo.invalid/schemas/media.schema.json', content.mediaFile));
  schemaCheck(content.profile, registry.validate('https://abdo.invalid/schemas/profile.schema.json', content.profile));
  for (const a of content.articles) schemaCheck(a, registry.validate('https://abdo.invalid/schemas/article.schema.json', a));
  for (const p of content.projects) schemaCheck(p, registry.validate('https://abdo.invalid/schemas/project.schema.json', p));

  // Cross-file checks assume a structurally sound tree; stop here if the shape is wrong.
  if (errors.length > 0) return { errors, warnings };

  // ---------- 2. Languages ----------
  const langCodes = new Set();
  for (const [i, language] of content.languages.entries()) {
    if (langCodes.has(language.code)) err(content.languagesFile, ['items', i, 'code'], `duplicate language code "${language.code}"`);
    langCodes.add(language.code);
    // The search page always has a URL segment ("search" unless the language sets its own), so it is reserved here too.
    const routes = Object.values({ search: 'search', ...language.routes });
    if (new Set(routes).size !== routes.length) err(content.languagesFile, ['items', i, 'routes'], 'section URL segments must all be different');
    for (const [key, value] of Object.entries({ ...language.typography.fonts })) {
      if (UNSAFE_CSS.test(value)) err(content.languagesFile, ['items', i, 'typography', 'fonts', key], 'contains characters that are not allowed in a CSS value');
    }
  }
  const enabled = content.languages.filter((l) => l.enabled);
  if (enabled.length === 0) err(content.languagesFile, ['items'], 'at least one language must be enabled');
  const defaults = enabled.filter((l) => l.default);
  if (defaults.length !== 1) err(content.languagesFile, ['items'], `exactly one enabled language must be the default (found ${defaults.length})`);

  for (const language of enabled) {
    if (!content.i18n[language.code]) err(content.languagesFile, ['items'], `language "${language.code}" has no interface strings file content/i18n/${language.code}.json`);
    // Every enabled language needs the owner's profile and the site identity text, because
    // the About page, footer, titles and descriptions are generated for each language.
    if (!content.profile.translations[language.code]) err(content.profile, ['translations'], `missing "${language.code}" translation (the About page exists in every enabled language)`);
    for (const field of ['name', 'tagline', 'description']) {
      if (!content.site[field][language.code]) err(content.site, [field], `missing "${language.code}" text`);
    }
  }
  // Interface string parity: every language must define the same keys. Plural families
  // (name_one / _two / _few / _many / _other) only need the "_other" form in every language,
  // because each language uses just the forms its grammar has.
  const PLURAL_FORM = /^(.*)_(zero|one|two|few|many|other)$/;
  const requiredKey = (key) => { const m = PLURAL_FORM.exec(key); return m ? `${m[1]}_other` : key; };
  const stringKeys = new Set(Object.values(content.i18n).flatMap((f) => Object.keys(f.strings).map(requiredKey)));
  for (const file of Object.values(content.i18n)) {
    for (const key of stringKeys) {
      if (!(key in file.strings)) err(file, ['strings', key], 'missing interface string (defined in another language)');
    }
  }

  const requireKnownLang = (record, path, lang) => {
    if (!langCodes.has(lang)) err(record, path, `unknown language "${lang}" (defined: ${[...langCodes].join(', ')})`);
  };

  // ---------- 3. IDs, file names and uniqueness ----------
  const allIds = new Map();
  const claimId = (record, id, path = ['id']) => {
    if (allIds.has(id)) err(record, path, `duplicate ID "${id}" (also used in ${fileFor(allIds.get(id))})`);
    else allIds.set(id, record);
  };
  for (const a of content.articles) {
    claimId(a, a.id);
    const expected = `${a.id}.json`;
    if (!fileFor(a).endsWith(`/${expected}`)) err(a, ['id'], `the file must be named ${expected}`);
  }
  for (const p of content.projects) {
    claimId(p, p.id);
    const expected = `${p.id}.json`;
    if (!fileFor(p).endsWith(`/${expected}`)) err(p, ['id'], `the file must be named ${expected}`);
  }
  content.topics.forEach((t, i) => claimId(content.topicsFile, t.id, ['items', i, 'id']));
  content.tags.forEach((t, i) => claimId(content.tagsFile, t.id, ['items', i, 'id']));
  content.media.forEach((m, i) => claimId(content.mediaFile, m.id, ['items', i, 'id']));
  claimId(content.profile, content.profile.id);
  content.presets.forEach((p, i) => claimId(content.presetsFile, p.id, ['items', i, 'id']));

  const topicById = new Map(content.topics.map((t) => [t.id, t]));
  const tagById = new Map(content.tags.map((t) => [t.id, t]));
  const mediaById = new Map(content.media.map((m) => [m.id, m]));
  const articleById = new Map(content.articles.map((a) => [a.id, a]));
  const projectById = new Map(content.projects.map((p) => [p.id, p]));

  // ---------- 4. Slug uniqueness per language ----------
  const checkSlugs = (label, items, record, pathPrefix = (i) => ['items', i]) => {
    const seen = new Map();
    items.forEach((item, i) => {
      for (const [lang, tr] of Object.entries(item.translations)) {
        requireKnownLang(record(item), [...pathPrefix(i), 'translations', lang], lang);
        const key = `${lang}/${tr.slug}`;
        if (seen.has(key)) err(record(item), [...pathPrefix(i), 'translations', lang, 'slug'], `${label} slug "${tr.slug}" is already used by ${seen.get(key)} in language "${lang}"`);
        else seen.set(key, item.id);
      }
    });
  };
  checkSlugs('article', content.articles, (a) => a, () => []);
  checkSlugs('project', content.projects, (p) => p, () => []);
  checkSlugs('topic', content.topics, () => content.topicsFile);
  checkSlugs('tag', content.tags, () => content.tagsFile);

  // ---------- 5. References ----------
  const needMedia = (record, path, id) => {
    if (!mediaById.has(id)) err(record, path, `unknown media asset "${id}"`);
  };
  const needTopics = (record, path, ids = []) => ids.forEach((id, i) => { if (!topicById.has(id)) err(record, [...path, i], `unknown topic "${id}"`); });
  const needTags = (record, path, ids = []) => ids.forEach((id, i) => { if (!tagById.has(id)) err(record, [...path, i], `unknown tag "${id}"`); });

  content.topics.forEach((t, i) => {
    if (t.parentId !== undefined) {
      if (!topicById.has(t.parentId)) err(content.topicsFile, ['items', i, 'parentId'], `unknown parent topic "${t.parentId}"`);
      else {
        let cursor = t; const trail = new Set();
        while (cursor?.parentId && !trail.has(cursor.id)) { trail.add(cursor.id); cursor = topicById.get(cursor.parentId); }
        if (cursor && trail.has(cursor.id)) err(content.topicsFile, ['items', i, 'parentId'], 'topic hierarchy contains a cycle');
      }
    }
    if (t.mediaId) needMedia(content.topicsFile, ['items', i, 'mediaId'], t.mediaId);
  });

  // ---------- 5b. Discovery: icons, related and pinned items, redirects, duplicate names, search settings ----------
  content.topics.forEach((t, i) => {
    const file = content.topicsFile;
    if (t.icon !== undefined && !isIcon(t.icon)) err(file, ['items', i, 'icon'], `unknown icon "${t.icon}" (choose one of: ${ICON_KEYS.join(', ')})`);
    (t.relatedTopicIds ?? []).forEach((id, k) => {
      if (id === t.id) err(file, ['items', i, 'relatedTopicIds', k], 'a topic cannot be related to itself');
      else if (!topicById.has(id)) err(file, ['items', i, 'relatedTopicIds', k], `unknown topic "${id}"`);
    });
    const below = descendantIds(content.topics, t.id);
    (t.pinnedItemIds ?? []).forEach((id, k) => {
      const item = articleById.get(id) ?? projectById.get(id);
      if (!item) err(file, ['items', i, 'pinnedItemIds', k], `unknown article or project "${id}"`);
      else if (!(item.topicIds ?? []).some((x) => below.has(x))) warn(file, ['items', i, 'pinnedItemIds', k], `"${id}" is pinned here but is not filed under this topic (or one below it), so it will not be shown on the topic page`);
    });
    for (const [lang, tr] of Object.entries(t.translations)) {
      if (tr.seo?.ogMediaId) needMedia(file, ['items', i, 'translations', lang, 'seo', 'ogMediaId'], tr.seo.ogMediaId);
    }
  });
  content.tags.forEach((t, i) => {
    const file = content.tagsFile;
    (t.relatedTagIds ?? []).forEach((id, k) => {
      if (id === t.id) err(file, ['items', i, 'relatedTagIds', k], 'a tag cannot be related to itself');
      else if (!tagById.has(id)) err(file, ['items', i, 'relatedTagIds', k], `unknown tag "${id}"`);
    });
    for (const [lang, tr] of Object.entries(t.translations)) {
      if (tr.seo?.ogMediaId) needMedia(file, ['items', i, 'translations', lang, 'seo', 'ogMediaId'], tr.seo.ogMediaId);
    }
  });

  // A remembered (old) slug must not point at a page that exists, and two pages must not claim the same old slug.
  const redirectChecks = (label, items, file) => {
    const current = new Map();
    for (const item of items) for (const [lang, tr] of Object.entries(item.translations)) current.set(`${lang}/${tr.slug}`, item.id);
    const claimed = new Map();
    items.forEach((item, i) => {
      for (const [lang, tr] of Object.entries(item.translations)) {
        (tr.redirectSlugs ?? []).forEach((slug, k) => {
          const path = ['items', i, 'translations', lang, 'redirectSlugs', k];
          const key = `${lang}/${slug}`;
          if (slug === tr.slug) err(file, path, `"${slug}" is this ${label}'s own slug, not an old one`);
          else if (current.has(key)) err(file, path, `"${slug}" is the current slug of ${current.get(key)} in "${lang}", so it cannot also redirect`);
          else if (claimed.has(key) && claimed.get(key) !== item.id) err(file, path, `"${slug}" is already an old slug of ${claimed.get(key)} in "${lang}"`);
          else claimed.set(key, item.id);
        });
      }
    });
  };
  redirectChecks('topic', content.topics, content.topicsFile);
  redirectChecks('tag', content.tags, content.tagsFile);

  // Two tags (or topics) with the same name once case, accents and punctuation are ignored are probably one thing.
  const duplicateNames = (label, items, file) => {
    const seen = new Map();
    items.forEach((item, i) => {
      for (const [lang, tr] of Object.entries(item.translations)) {
        for (const [kind, text] of [['name', tr.name], ...(tr.aliases ?? []).map((a) => ['alias', a])]) {
          const key = `${lang}/${foldName(text)}`;
          if (!foldName(text)) continue;
          const first = seen.get(key);
          if (first && first.id !== item.id) warn(file, ['items', i, 'translations', lang, kind === 'name' ? 'name' : 'aliases'], `this ${label} ${kind} "${text}" is the same as ${first.id}'s (ignoring case and punctuation): merge them in the ${label} manager`);
          else if (!first) seen.set(key, { id: item.id });
        }
      }
    });
  };
  duplicateNames('topic', content.topics, content.topicsFile);
  duplicateNames('tag', content.tags, content.tagsFile);

  if (content.search) {
    for (const key of ['languages', 'synonyms']) {
      for (const lang of Object.keys(content.search[key] ?? {})) requireKnownLang(content.search, [key, lang], lang);
    }
  }

  /** Internal notes live in the repository; a note that looks like a credential is worth a warning. */
  function noteChecks(record) {
    if (typeof record.internalNotes === 'string' && SECRET_LOOKING.test(record.internalNotes)) {
      warn(record, ['internalNotes'], 'the internal notes look like they contain a password or token; notes are stored in the repository and anyone who can read it can read them');
    }
  }

  /** Scheduled publishing: the date must be there, should lie ahead, and the record must be scheduled for it to matter. */
  function scheduleChecks(record) {
    const translations = Object.entries(record.translations ?? {});
    const scheduledLangs = translations.filter(([, t]) => t.status === 'scheduled').map(([l]) => l);
    if (record.status === 'scheduled' && !translations.some(([, t]) => t.status === 'scheduled' || t.status === 'published')) {
      warn(record, ['status'], 'scheduled, but no translation is scheduled or published, so nothing will appear when the date comes');
    }
    if (scheduledLangs.length && record.status !== 'scheduled' && record.status !== 'published') {
      warn(record, ['status'], `translation "${scheduledLangs[0]}" is scheduled but the record status is "${record.status}", so it will not go live; set the record to "scheduled" as well`);
    }
    if ((record.status === 'scheduled' || scheduledLangs.length) && record.publishedAt && new Date(record.publishedAt) <= new Date()) {
      warn(record, ['publishedAt'], 'the scheduled date has already passed: it goes live with the next build');
    }
  }

  for (const a of content.articles) {
    if (a.authorId !== content.profile.id) err(a, ['authorId'], `unknown author "${a.authorId}" (the only author is ${content.profile.id})`);
    needTopics(a, ['topicIds'], a.topicIds);
    needTags(a, ['tagIds'], a.tagIds);
    if (a.coverMediaId) needMedia(a, ['coverMediaId'], a.coverMediaId);
    for (const [lang, tr] of Object.entries(a.translations)) {
      validateBlocks(a, ['translations', lang, 'body'], tr.body, lang);
      if (a.coverMediaId && mediaById.has(a.coverMediaId) && !tr.coverAlt && !mediaById.get(a.coverMediaId).alt[lang]) {
        err(a, ['translations', lang, 'coverAlt'], `cover image needs alt text in "${lang}" (set coverAlt, or add an "${lang}" alt text to the media asset)`);
      }
    }
    if (a.status === 'published' && !Object.values(a.translations).some((t) => t.status === 'published')) {
      warn(a, ['status'], 'article is published but no translation is published, so it will not appear on the site');
    }
    scheduleChecks(a);
    noteChecks(a);
    if (a.status === 'published' && a.publishedAt && new Date(a.publishedAt) > new Date()) {
      warn(a, ['publishedAt'], 'publishedAt is in the future but the status is "published"; the article goes live immediately');
    }
  }

  for (const p of content.projects) {
    scheduleChecks(p);
    noteChecks(p);
    needTopics(p, ['topicIds'], p.topicIds);
    needTags(p, ['tagIds'], p.tagIds);
    if (p.coverMediaId) needMedia(p, ['coverMediaId'], p.coverMediaId);
    (p.galleryMediaIds ?? []).forEach((id, i) => needMedia(p, ['galleryMediaIds', i], id));
    (p.relatedArticleIds ?? []).forEach((id, i) => { if (!articleById.has(id)) err(p, ['relatedArticleIds', i], `unknown article "${id}"`); });
    if (p.startDate && p.endDate && p.endDate < p.startDate) err(p, ['endDate'], 'endDate is before startDate');
    for (const [lang, tr] of Object.entries(p.translations)) {
      validateBlocks(p, ['translations', lang, 'body'], tr.body ?? [], lang);
      if (p.coverMediaId && mediaById.has(p.coverMediaId) && !tr.coverAlt && !mediaById.get(p.coverMediaId).alt[lang]) {
        err(p, ['translations', lang, 'coverAlt'], `cover image needs alt text in "${lang}"`);
      }
    }
  }

  if (content.profile.photoMediaId) needMedia(content.profile, ['photoMediaId'], content.profile.photoMediaId);
  for (const lang of Object.keys(content.profile.translations)) {
    requireKnownLang(content.profile, ['translations', lang], lang);
    validateBlocks(content.profile, ['translations', lang, 'biography'], content.profile.translations[lang].biography ?? [], lang);
  }
  (content.profile.customSections ?? []).forEach((s, i) => {
    for (const [lang, tr] of Object.entries(s.translations)) validateBlocks(content.profile, ['customSections', i, 'translations', lang, 'body'], tr.body, lang);
  });

  // Media files must exist and every asset needs alt text for every language it is used in.
  content.media.forEach((m, i) => {
    if (!content.mediaFileExists(m.file)) err(content.mediaFile, ['items', i, 'file'], `file not found: content/media/files/${m.file}`);
    for (const lang of Object.keys(m.alt)) requireKnownLang(content.mediaFile, ['items', i, 'alt', lang], lang);
  });

  // ---------- 6. Config references ----------
  const presetKeys = content.presets.map((p) => p.key);
  if (new Set(presetKeys).size !== presetKeys.length) err(content.presetsFile, ['items'], 'preset keys must be unique');
  if (!presetKeys.includes(content.design.preset)) {
    err(content.design, ['preset'], `unknown preset "${content.design.preset}" (available: ${presetKeys.join(', ')})`);
  }
  for (const key of ['backdropLight', 'backdropDark']) {
    for (const [where, value] of [['design.overrides.shared', content.design.overrides?.shared?.[key]], ...content.presets.map((p) => [`preset ${p.key}`, p.tokens.shared[key]])]) {
      if (value && UNSAFE_CSS.test(value)) err(content.design, ['overrides'], `${where}.${key} contains characters that are not allowed in a CSS value`);
    }
  }

  // Glass Mode: very transparent surfaces make text depend on whatever scrolls behind them.
  if (content.design.glass?.enabled) {
    for (const mode of ['light', 'dark']) {
      const opacity = content.design.glass[mode]?.opacity;
      if (typeof opacity === 'number' && opacity < 50) {
        warn(content.design, ['glass', mode, 'opacity'], `${opacity}% is very transparent: header, menu, cards and footer text may become hard to read. 50% or more is recommended (hero panels are always kept at ${HERO_MIN_OPACITY}% or more).`);
      }
    }
  }

  // Colours: every pair the site relies on is checked, for the preset plus the owner's changes, and for each
  // language that has colours of its own. Below 3:1 text is unreadable (error); 3 to 4.5 is a warning.
  if (presetKeys.includes(content.design.preset)) {
    for (const row of contrastReport(content.design, content.presets, enabled)) {
      const scope = row.lang ? ` in ${row.lang}` : '';
      const message = `${row.mode} mode${scope}: ${row.fg} on ${row.bg} is ${row.ratio.toFixed(2)}:1, below the ${row.min}:1 needed to read it${row.level === 'error' ? ' (it is practically unreadable)' : ''}`;
      const path = row.lang ? ['languageOverrides', row.lang, row.mode] : ['overrides', row.mode];
      if (row.level === 'error') err(content.design, path, message); else warn(content.design, path, message);
    }
    for (const row of glassReport(content.design, content.presets)) {
      const where = row.area === 'hero' ? 'hero panels' : 'header, menu, cards and footer';
      warn(content.design, ['glass', row.mode], `${row.mode} mode: ${row.fg === 'text' ? 'body' : 'muted'} text on ${where} is ${row.ratio.toFixed(2)}:1 over ${{ '#000000': 'a black', '#ffffff': 'a white' }[row.under] ?? 'the page'} background; Glass Mode can make it hard to read there. Raise the opacity or change the surface colour.`);
    }
  }
  // The owner's own presets are checked too, so a bad one is found before it is chosen.
  content.presets.forEach((p, i) => {
    if (!p.custom || p.key === content.design.preset) return;
    for (const mode of ['light', 'dark']) {
      for (const row of checkMode(p.tokens[mode])) warn(content.presetsFile, ['items', i, 'tokens', mode], `preset "${p.key}", ${mode} mode: ${row.fg} on ${row.bg} is ${row.ratio.toFixed(2)}:1, below the ${row.min}:1 needed to read it`);
    }
  });
  for (const lang of Object.keys(content.design.languageOverrides ?? {})) requireKnownLang(content.design, ['languageOverrides', lang], lang);
  content.languages.forEach((language, i) => {
    for (const issue of layoutIssues(language.layout)) (issue.level === 'error' ? err : warn)(content.languagesFile, ['items', i, 'layout', ...issue.path], issue.message);
  });

  if (content.site.socialImageMediaId) needMedia(content.site, ['socialImageMediaId'], content.site.socialImageMediaId);

  for (const [lang, items] of Object.entries(content.navigation.header)) {
    requireKnownLang(content.navigation, ['header', lang], lang);
    void items;
  }
  for (const lang of Object.keys(content.navigation.footer)) requireKnownLang(content.navigation, ['footer', lang], lang);
  for (const language of enabled) {
    if (!content.navigation.header[language.code]) warn(content.navigation, ['header'], `no header navigation for language "${language.code}"`);
  }

  for (const [lang, def] of Object.entries(content.homepage.languages)) {
    requireKnownLang(content.homepage, ['languages', lang], lang);
    const ids = new Set();
    def.sections.forEach((s, i) => {
      if (ids.has(s.id)) err(content.homepage, ['languages', lang, 'sections', i, 'id'], `duplicate section ID "${s.id}"`);
      ids.add(s.id);
      needTopics(content.homepage, ['languages', lang, 'sections', i, 'source', 'topicIds'], s.source?.topicIds);
      const itemId = s.source?.itemId;
      if (itemId && !articleById.has(itemId) && !projectById.has(itemId)) err(content.homepage, ['languages', lang, 'sections', i, 'source', 'itemId'], `unknown article or project "${itemId}"`);
    });
  }
  for (const language of enabled) {
    if (!content.homepage.languages[language.code]) warn(content.homepage, ['languages'], `no homepage sections for language "${language.code}"; its homepage will be empty`);
  }

  // ---------- 7. Translation language codes ----------
  for (const a of content.articles) for (const lang of Object.keys(a.translations)) requireKnownLang(a, ['translations', lang], lang);
  for (const p of content.projects) for (const lang of Object.keys(p.translations)) requireKnownLang(p, ['translations', lang], lang);
  content.topics.forEach((t, i) => { for (const lang of Object.keys(t.translations)) requireKnownLang(content.topicsFile, ['items', i, 'translations', lang], lang); });
  content.tags.forEach((t, i) => { for (const lang of Object.keys(t.translations)) requireKnownLang(content.tagsFile, ['items', i, 'translations', lang], lang); });

  return { errors, warnings };

  function validateBlocks(record, path, blocks, lang) {
    const ids = new Set();
    const noteKeys = new Set();
    const noteBlocks = blocks.filter((b) => b.type === 'footnotes');
    if (noteBlocks.length > 1) {
      const second = blocks.indexOf(noteBlocks[1]);
      err(record, [...path, second], 'only one footnotes block is allowed per body (footnote numbers follow its order)');
    }
    noteBlocks.forEach((note) => {
      const at = blocks.indexOf(note);
      note.items.forEach((item, n) => {
        if (noteKeys.has(item.key)) err(record, [...path, at, 'items', n, 'key'], `duplicate footnote key "${item.key}"`);
        noteKeys.add(item.key);
      });
    });

    // A published translation must not carry template placeholders; in a draft they are only a reminder.
    // Scheduled content goes live by itself, so it must be as clean as published content: an error found
    // at schedule time is better than a failed timer run at the moment it was due.
    const goingLive = (s) => s === 'published' || s === 'scheduled';
    const live = goingLive(record.status) && goingLive(record.translations?.[lang]?.status);
    blocks.forEach((block, i) => {
      if (ids.has(block.id)) err(record, [...path, i, 'id'], `duplicate block ID "${block.id}"`);
      ids.add(block.id);

      for (const field of textFields(block)) {
        if (field.role === 'prose' && PLACEHOLDER.test(field.text)) (live ? err : warn)(record, [...path, i, ...field.path], 'the text still contains a template placeholder ⟦…⟧; replace it with your own text');
      }

      for (const ref of mediaReferences(block)) {
        const asset = mediaById.get(ref.mediaId);
        if (!asset) err(record, [...path, i, ...ref.path], `unknown media asset "${ref.mediaId}"`);
        else if (!ref.alt && !asset.alt[lang]) err(record, [...path, i, ...ref.path.slice(0, -1)], `image needs alt text in "${lang}" (set an alt text on the block or add an "${lang}" alt to the media asset)`);
      }

      if (block.type === 'list') for (const problem of listProblems(block.items)) err(record, [...path, i, 'items', problem.index], `list: ${problem.message}`);
      if (block.type === 'checklist') for (const problem of checklistProblems(block.items)) err(record, [...path, i, 'items', problem.index, 'level'], `checklist: ${problem.message}`);

      if (block.type === 'table') {
        const width = block.rows[0].length;
        block.rows.forEach((row, r) => {
          if (row.length !== width) err(record, [...path, i, 'rows', r], `row ${r + 1} has ${row.length} cell(s) but the first row has ${width}; every row needs the same number of cells`);
        });
        if (block.align && block.align.length > width) err(record, [...path, i, 'align'], `alignment lists ${block.align.length} columns but the table has ${width}`);
      }

      if (block.type === 'related') {
        block.items.forEach((item, n) => {
          const pool = item.kind === 'project' ? content.projects : content.articles;
          if (!pool.some((x) => x.id === item.id)) err(record, [...path, i, 'items', n, 'id'], `unknown ${item.kind} "${item.id}"`);
          if (item.id === record.id) warn(record, [...path, i, 'items', n, 'id'], 'a block points at the page it is on');
        });
      }
    });

    // Footnote references in text must point at a footnote that exists; unused footnotes are flagged.
    const used = new Set();
    for (const ref of footnoteReferences(blocks)) {
      used.add(ref.key);
      if (!noteKeys.has(ref.key)) err(record, [...path, ref.blockIndex, ...ref.path], `footnote reference [^${ref.key}] has no matching footnote (add it to a footnotes block)`);
    }
    for (const key of noteKeys) if (!used.has(key)) warn(record, path, `footnote "${key}" is never referenced from the text`);
  }
}

export function formatProblems(problems) {
  return problems.map((p) => `  • ${p.file} › ${p.path}\n      ${p.message}`).join('\n');
}
