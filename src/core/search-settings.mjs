// Search settings (content/config/search.json) and their defaults. Pure. Every field is optional in the file,
// so a site with no search.json behaves exactly like one with the defaults below.

export const SEARCH_TYPES = ['article', 'project', 'topic', 'tag', 'profile', 'cv'];
export const VIEWS = ['grid', 'list', 'compact'];
export const PAGINATION = ['pages', 'more'];
export const RANKINGS = {
  balanced: { title: 10, tags: 6, headings: 5, description: 4, body: 1 },
  'titles-first': { title: 16, tags: 8, headings: 6, description: 4, body: 1 },
  'content-first': { title: 6, tags: 4, headings: 4, description: 3, body: 2 },
};
export const PAGE_SIZE = Object.freeze({ min: 4, max: 48 });
export const MAX_TEXT = 60000;

export const DEFAULT_SEARCH = Object.freeze({
  enabled: true,
  types: Object.freeze({ article: true, project: true, topic: true, tag: true, profile: true, cv: true }),
  pageSize: 12,
  defaultView: 'grid',
  pagination: 'pages',
  autocomplete: true,
  instant: true,
  ranking: 'balanced',
});

/** The settings in force: the file's values over the defaults. @param {object|null|undefined} file */
export function searchSettings(file) {
  const f = file ?? {};
  return {
    enabled: f.enabled ?? DEFAULT_SEARCH.enabled,
    types: { ...DEFAULT_SEARCH.types, ...(f.types ?? {}) },
    pageSize: Math.min(PAGE_SIZE.max, Math.max(PAGE_SIZE.min, f.pageSize ?? DEFAULT_SEARCH.pageSize)),
    defaultView: VIEWS.includes(f.defaultView) ? f.defaultView : DEFAULT_SEARCH.defaultView,
    pagination: PAGINATION.includes(f.pagination) ? f.pagination : DEFAULT_SEARCH.pagination,
    autocomplete: f.autocomplete ?? DEFAULT_SEARCH.autocomplete,
    instant: f.instant ?? DEFAULT_SEARCH.instant,
    ranking: RANKINGS[f.ranking] ? f.ranking : DEFAULT_SEARCH.ranking,
    languages: f.languages ?? {},
    synonyms: f.synonyms ?? {},
  };
}

/** Normalisation options for one language (both on unless the file turns them off for that language). */
export function normalizationFor(settings, lang) {
  const o = settings.languages?.[lang] ?? {};
  return { foldTaMarbuta: o.foldTaMarbuta ?? true, stripDefiniteArticle: o.stripDefiniteArticle ?? true };
}

/** The most synonym groups one language can have. */
export const MAX_SYNONYM_GROUPS = 100;

/** "car vehicle automobile" (one group per line) -> the groups the file stores, and the lines that cannot be used. */
export function parseGroups(text) {
  const groups = [];
  const bad = [];
  String(text ?? '').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const words = [...new Set(line.split(/[\s,،;؛=]+/).filter(Boolean))];
    if (words.length < 2 || words.length > 12 || words.some((w) => w.length > 40)) bad.push(i + 1);
    else groups.push(words);
  });
  return { groups: groups.slice(0, MAX_SYNONYM_GROUPS), bad, tooMany: groups.length > MAX_SYNONYM_GROUPS };
}
