// The search engine: reads the static index the build writes (src/lib/search-index.mjs) and answers queries.
// Pure and dependency-free: the same file runs in Node (tests, the admin's search test box) and in the visitor's
// browser (public/assets/search.js).
//
// INDEX FORMAT (one JSON file per language)
//   v        version (1)
//   lang     language code
//   o        { foldTaMarbuta, stripDefiniteArticle }: the normalisation the index was built with
//   docs[]   { i id, y type, t title, d description, u url, p date "YYYY-MM-DD" (optional), m reading minutes,
//              c category name, tp [topic facet indexes incl. ancestors], tg [tag facet indexes], th thumbnail url, x text }
//   facets   { topics: [{ id, n name, c count, u url }], tags: [...] }
//   terms[]  sorted normalised words (plain code-unit order)
//   post[]   for each term, a flat [docIndex, weight, docIndex, weight, ...]
//   syn      { key: [other keys] } synonym groups, already normalised
//
// QUERY SYNTAX (documented for visitors on the search page)
//   words             every word must be found (the last one also matches as a prefix while typing)
//   "exact phrase"    the words must appear next to each other, in order
//   -word             pages containing the word are left out
// If nothing matches all the words, results that match some of them are offered and marked as partial.

import { DEFAULT_OPTIONS, editDistance, keyOf, scan, tokens } from './search-text.mjs';

export const INDEX_VERSION = 1;
export const TYPES = ['article', 'project', 'topic', 'tag', 'profile', 'cv'];

const cache = new WeakMap();

function prepare(index) {
  let c = cache.get(index);
  if (!c) {
    c = { titleKeys: new Map(), docKeys: new Map(), options: { ...DEFAULT_OPTIONS, ...index.o } };
    cache.set(index, c);
  }
  return c;
}

/** The normalisation settings an index was built with. */
export const optionsOf = (index) => prepare(index).options;

// ------------------------------------------------------------------ queries

/**
 * @param {string} q
 * @param {object} options  normalisation options
 * @param {{ prefix?: boolean }} [mode]  prefix: the last word is still being typed
 * @returns {{ words: { raw: string, key: string, prefix: boolean, prefixKey: string }[], phrases: string[][], excluded: string[], empty: boolean }}
 */
export function parseQuery(q, options = DEFAULT_OPTIONS, { prefix = false } = {}) {
  const source = String(q ?? '');
  const words = [];
  const phrases = [];
  const excluded = [];
  for (const m of source.matchAll(/"([^"]*)"|(-?)([^\s"]+)/gu)) {
    if (m[1] !== undefined) {
      const keys = tokens(m[1], options);
      if (keys.length) phrases.push(keys);
    } else if (m[2] === '-' && m[3].length > 1) {
      excluded.push(...tokens(m[3], options));
    } else {
      for (const t of scan(m[3], options)) words.push({ raw: m[3].slice(t.start, t.end), key: t.key, prefix: false, prefixKey: t.key });
    }
  }
  // Only the last unquoted word can still be typing, and only when the text does not end in a space or a quote.
  const last = words.at(-1);
  if (prefix && last && !/[\s"]$/.test(source)) {
    last.prefix = true;
    last.prefixKey = keyOf(last.raw, options, 1);
  }
  return { words, phrases, excluded, empty: words.length === 0 && phrases.length === 0 };
}

// ------------------------------------------------------------------ term lookup

function lowerBound(terms, key) {
  let lo = 0;
  let hi = terms.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (terms[mid] < key) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** Index positions of the term equal to `key`, or (prefix mode) of every term starting with it. */
function termsFor(index, key, { prefix = false, limit = 60 } = {}) {
  const { terms } = index;
  const start = lowerBound(terms, key);
  if (!prefix) return start < terms.length && terms[start] === key ? [start] : [];
  const out = [];
  for (let i = start; i < terms.length && terms[i].startsWith(key) && out.length < limit; i += 1) out.push(i);
  return out;
}

const dfOf = (index, t) => index.post[t].length / 2;

/** All the ways one query word can be matched: [{ term, factor }]. */
function expansions(index, word) {
  const found = new Map();
  const add = (t, factor) => { if (!found.has(t) || found.get(t) < factor) found.set(t, factor); };
  for (const t of termsFor(index, word.key)) add(t, 1);
  if (word.prefix) {
    for (const key of new Set([word.key, word.prefixKey])) for (const t of termsFor(index, key, { prefix: true })) add(t, found.has(t) ? 1 : 0.6);
  }
  for (const other of index.syn?.[word.key] ?? []) for (const t of termsFor(index, other)) add(t, 0.7);
  return [...found].map(([term, factor]) => ({ term, factor }));
}

// ------------------------------------------------------------------ searching

function wordScores(index, word) {
  const N = index.docs.length;
  const scores = new Map();
  for (const { term, factor } of expansions(index, word)) {
    const idf = Math.log(1 + N / dfOf(index, term));
    const post = index.post[term];
    for (let k = 0; k < post.length; k += 2) scores.set(post[k], (scores.get(post[k]) ?? 0) + post[k + 1] * idf * factor);
  }
  return scores;
}

function docKeys(index, doc, di) {
  const c = prepare(index);
  if (!c.docKeys.has(di)) c.docKeys.set(di, tokens(`${doc.t} ${doc.d ?? ''} ${doc.x ?? ''}`, c.options));
  return c.docKeys.get(di);
}

function titleKeys(index, doc, di) {
  const c = prepare(index);
  if (!c.titleKeys.has(di)) c.titleKeys.set(di, tokens(doc.t, c.options));
  return c.titleKeys.get(di);
}

function containsPhrase(keys, phrase) {
  if (phrase.length === 0) return true;
  outer: for (let i = 0; i + phrase.length <= keys.length; i += 1) {
    for (let j = 0; j < phrase.length; j += 1) if (keys[i + j] !== phrase[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Run a search.
 * @param {object} index
 * @param {{ q?: string, prefix?: boolean, types?: string[], topic?: string, tag?: string, from?: string, to?: string, sort?: 'relevance'|'newest'|'oldest' }} request
 *   topic and tag are facet ids (the ids stored in `facets`). from / to are "YYYY-MM-DD".
 * @returns {{ hits: { i: number, score: number }[], total: number, query: object, partial: boolean, facets: { types: Record<string, number>, topics: Record<string, number>, tags: Record<string, number> } }}
 */
export function search(index, request = {}) {
  const c = prepare(index);
  const query = parseQuery(request.q, c.options, { prefix: request.prefix });
  const empty = { hits: [], total: 0, query, partial: false, facets: { types: {}, topics: {}, tags: {} } };
  const filtered = Boolean(request.types?.length || request.topic || request.tag || request.from || request.to);
  // No words but a filter: "browse mode" lists everything the filters allow (newest first when relevance is asked for).
  if (query.empty && !filtered) return empty;

  if (query.empty) return finish(index, query, new Map(index.docs.map((_, di) => [di, 0])), false, request);

  // Phrase words are required words too, so the postings narrow the candidates before the text is checked.
  const required = [...query.words];
  for (const phrase of query.phrases) for (const key of phrase) if (!required.some((w) => w.key === key && !w.prefix)) required.push({ raw: key, key, prefix: false, prefixKey: key });
  const perWord = required.map((w) => wordScores(index, w));

  let partial = false;
  let candidates = new Map();
  const [first, ...rest] = perWord;
  for (const [di, score] of first) {
    let total = score;
    let ok = true;
    for (const other of rest) {
      const s = other.get(di);
      if (s === undefined) { ok = false; break; }
      total += s;
    }
    if (ok) candidates.set(di, total);
  }
  if (candidates.size === 0 && required.length > 1 && query.phrases.length === 0) {
    // Nothing has every word: offer pages that have some of them, the ones with more words first.
    partial = true;
    const combined = new Map();
    for (const scores of perWord) {
      for (const [di, s] of scores) {
        const cur = combined.get(di) ?? { n: 0, s: 0 };
        cur.n += 1; cur.s += s;
        combined.set(di, cur);
      }
    }
    candidates = new Map([...combined].map(([di, { n, s }]) => [di, n * 1000 + s]));
  }

  // Words with a minus sign and phrases need a closer look at each remaining page.
  for (const key of query.excluded) {
    for (const t of termsFor(index, key)) {
      const post = index.post[t];
      for (let k = 0; k < post.length; k += 2) candidates.delete(post[k]);
    }
  }
  if (query.phrases.length) {
    for (const di of [...candidates.keys()]) {
      const keys = docKeys(index, index.docs[di], di);
      if (!query.phrases.every((p) => containsPhrase(keys, p))) candidates.delete(di);
    }
  }

  return finish(index, query, candidates, partial, request);
}

/** Title bonuses, facet counts, filters and sorting: everything after the candidate pages are known. */
function finish(index, query, candidates, partial, request) {
  // Exact words in the title, a phrase in the title, or a title that is the whole query count extra.
  const wanted = new Set(query.words.map((w) => w.key));
  const wholeQuery = query.words.map((w) => w.key).join(' ');
  for (const [di, score] of candidates) {
    const tk = titleKeys(index, index.docs[di], di);
    let bonus = 0;
    for (const w of query.words) if (tk.includes(w.key) || (w.prefix && tk.some((k) => k.startsWith(w.prefixKey)))) bonus += 6;
    if (wanted.size > 1 && tk.join(' ').includes(wholeQuery)) bonus += 20;
    if (tk.join(' ') === wholeQuery && wholeQuery) bonus += 40;
    for (const p of query.phrases) if (containsPhrase(tk, p)) bonus += 25;
    candidates.set(di, score + bonus);
  }

  // Facet counts describe what the words found, before the filters narrow it, so choosing one filter does not hide the others.
  const facets = { types: {}, topics: {}, tags: {} };
  for (const di of candidates.keys()) {
    const d = index.docs[di];
    facets.types[d.y] = (facets.types[d.y] ?? 0) + 1;
    for (const t of d.tp ?? []) facets.topics[t] = (facets.topics[t] ?? 0) + 1;
    for (const t of d.tg ?? []) facets.tags[t] = (facets.tags[t] ?? 0) + 1;
  }

  const types = request.types?.length ? new Set(request.types) : null;
  const topicIdx = request.topic ? index.facets.topics.findIndex((t) => t.id === request.topic) : -1;
  const tagIdx = request.tag ? index.facets.tags.findIndex((t) => t.id === request.tag) : -1;
  const hits = [];
  for (const [di, score] of candidates) {
    const d = index.docs[di];
    if (types && !types.has(d.y)) continue;
    if (request.topic && !(topicIdx >= 0 && d.tp?.includes(topicIdx))) continue;
    if (request.tag && !(tagIdx >= 0 && d.tg?.includes(tagIdx))) continue;
    if ((request.from || request.to) && (!d.p || (request.from && d.p < request.from) || (request.to && d.p > request.to))) continue;
    hits.push({ i: di, score });
  }

  const dateOf = (h) => index.docs[h.i].p ?? '';
  const sort = request.sort ?? 'relevance';
  hits.sort((a, b) => {
    if (sort === 'newest') return (dateOf(b) || '').localeCompare(dateOf(a)) || b.score - a.score || a.i - b.i;
    if (sort === 'oldest') return (!dateOf(a) - !dateOf(b)) || dateOf(a).localeCompare(dateOf(b)) || b.score - a.score || a.i - b.i;
    return b.score - a.score || dateOf(b).localeCompare(dateOf(a)) || a.i - b.i;
  });
  return { hits, total: hits.length, query, partial, facets };
}

// ------------------------------------------------------------------ suggestions

/**
 * Autocomplete: the words that complete what is being typed, and the pages whose titles match it.
 * @returns {{ kind: 'term', text: string }[] | { kind: 'doc', title: string, url: string, type: string }[]}
 */
export function suggest(index, input, { terms = 4, docs = 5 } = {}) {
  const c = prepare(index);
  const query = parseQuery(input, c.options, { prefix: true });
  const out = [];
  const last = query.words.at(-1);
  if (!last || !last.prefix || query.phrases.length) return out;
  const done = String(input).trim().split(/\s+/).slice(0, -1).join(' ');
  const seen = new Set();
  const pool = new Set([...termsFor(index, last.key, { prefix: true }), ...termsFor(index, last.prefixKey, { prefix: true })]);
  const ranked = [...pool].sort((a, b) => dfOf(index, b) - dfOf(index, a) || (index.terms[a] < index.terms[b] ? -1 : 1));
  for (const t of ranked) {
    const word = index.terms[t];
    if (word === last.key && ranked.length > 1) continue;
    const text = done ? `${done} ${word}` : word;
    if (!seen.has(text)) { seen.add(text); out.push({ kind: 'term', text }); }
    if (out.length >= terms) break;
  }
  const found = search(index, { q: input, prefix: true, sort: 'relevance' });
  for (const h of found.hits.slice(0, docs)) {
    const d = index.docs[h.i];
    out.push({ kind: 'doc', title: d.t, url: d.u, type: d.y });
  }
  return out;
}

/**
 * "Did you mean": for words that match no term, the nearest term (one edit for short words, two for longer ones).
 * @returns {{ text: string } | null}
 */
export function didYouMean(index, q) {
  const c = prepare(index);
  const query = parseQuery(q, c.options);
  if (query.words.length === 0) return null;
  let changed = false;
  const fixed = query.words.map((w) => {
    if (termsFor(index, w.key).length || index.syn?.[w.key]) return w.raw;
    const limit = w.key.length >= 7 ? 2 : w.key.length >= 4 ? 1 : 0;
    if (!limit) return w.raw;
    let best = null;
    for (let t = 0; t < index.terms.length; t += 1) {
      const term = index.terms[t];
      if (Math.abs(term.length - w.key.length) > limit) continue;
      const d = editDistance(w.key, term, limit);
      if (d <= limit && (!best || d < best.d || (d === best.d && dfOf(index, t) > dfOf(index, best.t)))) best = { d, t, term };
    }
    if (!best) return w.raw;
    changed = true;
    return best.term;
  });
  return changed ? { text: fixed.join(' ') } : null;
}

/**
 * Related searches: the topics and tags most common among the best results (not the one already chosen as a filter).
 * @returns {{ kind: 'topic'|'tag', id: string, name: string }[]}
 */
export function relatedSearches(index, result, { limit = 5, skip = {} } = {}) {
  const topics = new Map();
  const tags = new Map();
  for (const h of result.hits.slice(0, 30)) {
    const d = index.docs[h.i];
    for (const t of d.tp ?? []) topics.set(t, (topics.get(t) ?? 0) + 1);
    for (const t of d.tg ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const queryKeys = new Set(result.query.words.map((w) => w.key));
  const pick = (map, facetList, kind) => [...map].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([idx]) => ({ kind, id: facetList[idx].id, name: facetList[idx].n }))
    .filter((r) => r.id !== skip[kind] && !tokens(r.name).every((k) => queryKeys.has(k)));
  const out = [];
  const t = pick(topics, index.facets.topics, 'topic');
  const g = pick(tags, index.facets.tags, 'tag');
  for (let i = 0; out.length < limit && (i < t.length || i < g.length); i += 1) {
    if (g[i]) out.push(g[i]);
    if (t[i] && out.length < limit) out.push(t[i]);
  }
  return out.slice(0, limit);
}

/** When nothing is found: the newest articles and projects, and the topics with the most content. */
export function recommend(index, { docs = 4, topics = 6 } = {}) {
  const dated = index.docs.map((d, i) => ({ d, i })).filter(({ d }) => (d.y === 'article' || d.y === 'project') && d.p)
    .sort((a, b) => b.d.p.localeCompare(a.d.p) || a.i - b.i).slice(0, docs).map(({ i }) => i);
  const top = index.facets.topics.map((t, i) => ({ t, i })).sort((a, b) => b.t.c - a.t.c || a.i - b.i).slice(0, topics).map(({ t }) => t);
  return { docs: dated, topics: top };
}

// ------------------------------------------------------------------ highlighting

/** The keys a document's words are compared with, for highlighting: exact keys plus the prefix of the word being typed. */
function matcherFor(query) {
  const exact = new Set();
  const prefixes = [];
  for (const w of query.words) {
    exact.add(w.key);
    if (w.prefix) prefixes.push(w.key, w.prefixKey);
  }
  for (const phrase of query.phrases) for (const key of phrase) exact.add(key);
  return (key) => exact.has(key) || prefixes.some((p) => p && key.startsWith(p));
}

/**
 * Split `text` into pieces, marking the words that match the query. The text is returned unchanged:
 * joining the pieces gives back exactly the original string.
 * @returns {{ t: string, h: boolean }[]}
 */
export function highlight(text, query, options = DEFAULT_OPTIONS) {
  const source = String(text ?? '');
  const match = matcherFor(query);
  const out = [];
  let at = 0;
  for (const w of scan(source, options)) {
    if (!match(w.key)) continue;
    if (w.start > at) out.push({ t: source.slice(at, w.start), h: false });
    out.push({ t: source.slice(w.start, w.end), h: true });
    at = w.end;
  }
  if (at < source.length) out.push({ t: source.slice(at), h: false });
  return out.length ? out : [{ t: source, h: false }];
}

/**
 * A short excerpt around the first match. Never cuts a word; says whether text was left out at either end.
 * @returns {{ pieces: { t: string, h: boolean }[], before: boolean, after: boolean }}
 */
export function snippet(text, query, { width = 170, options = DEFAULT_OPTIONS } = {}) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim();
  const match = matcherFor(query);
  const first = scan(source, options).find((w) => match(w.key));
  if (!first || source.length <= width) {
    const cut = source.length > width ? source.slice(0, width).replace(/\s+\S*$/, '') : source;
    return { pieces: highlight(cut, query, options), before: false, after: cut.length < source.length };
  }
  let start = Math.max(0, first.start - Math.floor(width / 3));
  if (start > 0) { const space = source.indexOf(' ', start); start = space === -1 || space > first.start ? first.start : space + 1; }
  let end = Math.min(source.length, start + width);
  if (end < source.length) { const space = source.lastIndexOf(' ', end); end = space > first.end ? space : Math.max(end, first.end); }
  const cut = source.slice(start, end).trim();
  return { pieces: highlight(cut, query, options), before: start > 0, after: end < source.length };
}
