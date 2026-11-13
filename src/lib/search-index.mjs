// Builds the static search index for one language from the PUBLIC model (so a draft can never be searched).
// The file format is described at the top of src/core/search-engine.mjs.

import { proseStrings, textFields } from '../core/blocks-meta.mjs';
import { INDEX_VERSION } from '../core/search-engine.mjs';
import { MAX_TEXT, normalizationFor, RANKINGS } from '../core/search-settings.mjs';
import { keyOf, scan, tokens } from '../core/search-text.mjs';
import { plain } from './markup.mjs';

const clip = (text) => String(text ?? '').slice(0, MAX_TEXT);
const day = (iso) => (iso ? String(iso).slice(0, 10) : undefined);

function headingsOf(blocks) {
  const out = [];
  for (const block of blocks ?? []) {
    if (block.hidden || block.type !== 'heading') continue;
    for (const f of textFields(block)) out.push(plain(f.text));
  }
  return out;
}

/** The names a visitor might use for a tag: its name, aliases and synonyms. */
const tagWords = (tag) => [tag.name, ...(tag.aliases ?? []), ...(tag.synonyms ?? [])];

/**
 * @param {object} model  the site model (src/lib/model.mjs)
 * @param {object} L      model.langs[lang]
 * @param {object} settings  resolved search settings (src/core/search-settings.mjs)
 * @returns {{ index: object, docCount: number, termCount: number }}
 */
export function buildSearchIndex(model, L, settings) {
  const lang = L.lang;
  const options = normalizationFor(settings, lang);
  const weights = RANKINGS[settings.ranking];
  const enabled = (type) => settings.types[type] !== false;

  // ---- facets: topics (with the content below them) and tags that have public content ----
  const topicFacets = L.topics.map((t) => ({ id: t.id, n: t.name, c: t.count, u: t.url }));
  const tagFacets = L.tags.map((t) => ({ id: t.id, n: t.name, c: t.count, u: t.url }));
  const topicIndex = new Map(topicFacets.map((t, i) => [t.id, i]));
  const tagIndex = new Map(tagFacets.map((t, i) => [t.id, i]));
  // A page filed under a topic also belongs to every topic above it (the topic pages roll up the same way).
  const topicById = new Map(L.topics.map((t) => [t.id, t]));
  const withAncestors = (id) => {
    const ids = [];
    for (let cur = topicById.get(id), guard = 0; cur && guard < 20; cur = topicById.get(cur.parentId), guard += 1) ids.push(cur.id);
    return ids;
  };
  const topicRefs = (item) => {
    const ids = new Set();
    for (const t of item.topics ?? []) for (const id of withAncestors(t.id)) ids.add(id);
    return [...ids].map((id) => topicIndex.get(id)).filter((i) => i !== undefined).sort((a, b) => a - b);
  };
  const tagRefs = (item) => (item.tags ?? []).map((t) => tagIndex.get(t.id)).filter((i) => i !== undefined).sort((a, b) => a - b);

  // ---- documents ----
  const docs = [];
  const fields = [];
  const add = (doc, f) => {
    const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));
    docs.push(clean);
    fields.push(f);
  };

  if (enabled('article')) {
    for (const a of L.articles) {
      add({
        i: a.id, y: 'article', t: a.title, d: a.excerpt || a.subtitle, u: a.url, p: day(a.publishedAt), m: a.readingMinutes,
        c: a.primaryTopic?.name, tp: topicRefs(a), tg: tagRefs(a), th: a.cover?.isRaster ? a.cover.url : undefined,
        x: clip(proseStrings(a.body).join('\n')),
      }, {
        title: [a.title], description: [a.excerpt, a.subtitle], headings: headingsOf(a.body),
        tags: [...(a.tags ?? []).flatMap(tagWords), ...(a.topics ?? []).map((t) => t.name)], body: [clip(proseStrings(a.body).join('\n'))],
      });
    }
  }
  if (enabled('project')) {
    for (const p of L.projects) {
      const story = [p.challenge, p.process, p.solution, p.outcome].flat().join('\n');
      const text = clip([story, ...proseStrings(p.body), p.role, ...(p.tools ?? []), ...(p.responsibilities ?? [])].filter(Boolean).join('\n'));
      add({
        i: p.id, y: 'project', t: p.title, d: p.summary || p.subtitle, u: p.url, p: day(p.publishedAt),
        c: p.primaryTopic?.name, tp: topicRefs(p), tg: tagRefs(p), th: p.cover?.isRaster ? p.cover.url : undefined, x: text,
      }, {
        title: [p.title], description: [p.summary, p.subtitle], headings: headingsOf(p.body),
        tags: [...(p.tags ?? []).flatMap(tagWords), ...(p.topics ?? []).map((t) => t.name)], body: [text],
      });
    }
  }
  if (enabled('topic')) {
    for (const t of L.topics) {
      add({ i: t.id, y: 'topic', t: t.name, d: t.description, u: t.url, c: t.parent?.name, tp: [topicIndex.get(t.id)], th: t.media?.isRaster ? t.media.url : undefined },
        { title: [t.name], description: [t.description], headings: [], tags: [...(t.synonyms ?? [])], body: [] });
    }
  }
  if (enabled('tag')) {
    for (const t of L.tags) {
      add({ i: t.id, y: 'tag', t: t.name, d: t.description || (t.aliases?.length ? t.aliases.join(' · ') : ''), u: t.url, tg: [tagIndex.get(t.id)] },
        { title: [t.name], description: [t.description], headings: [], tags: [...(t.aliases ?? []), ...(t.synonyms ?? [])], body: [] });
    }
  }
  const profile = L.profile;
  if (profile && enabled('profile')) {
    const text = clip([profile.summary, ...proseStrings(profile.biography)].filter(Boolean).join('\n'));
    add({ i: 'profile', y: 'profile', t: profile.name, d: profile.headline, u: L.pageUrl.about, th: profile.photo?.isRaster ? profile.photo.url : undefined, x: text },
      { title: [profile.name], description: [profile.headline], headings: [], tags: [], body: [text] });
  }
  if (profile && enabled('cv')) {
    const section = (id) => `${L.pageUrl.about}#${id}`;
    profile.experience.forEach((e, n) => add({ i: `cv-exp-${n}`, y: 'cv', t: `${e.title} — ${e.organization}`, d: e.summary, u: section('experience'), c: L.i18n.t('experience'), x: clip(e.summary ?? '') },
      { title: [e.title, e.organization], description: [e.summary], headings: [], tags: [], body: [e.summary ?? ''] }));
    profile.education.forEach((e, n) => add({ i: `cv-edu-${n}`, y: 'cv', t: `${e.title} — ${e.organization}`, d: e.summary, u: section('education'), c: L.i18n.t('education'), x: clip(e.summary ?? '') },
      { title: [e.title, e.organization], description: [e.summary], headings: [], tags: [], body: [e.summary ?? ''] }));
    if (profile.skills.length) {
      add({ i: 'cv-skills', y: 'cv', t: L.i18n.t('skills'), d: profile.skills.map((s) => s.name).join(' · '), u: section('skills'), c: L.i18n.t('about') },
        { title: [L.i18n.t('skills')], description: [], headings: [], tags: profile.skills.map((s) => s.name), body: [] });
    }
    profile.customSections.forEach((c, n) => {
      const text = clip(proseStrings(c.body).join('\n'));
      add({ i: `cv-custom-${n}`, y: 'cv', t: c.title, u: section(c.id ? `section-${c.id}` : 'about'), c: L.i18n.t('about'), x: text },
        { title: [c.title], description: [], headings: headingsOf(c.body), tags: [], body: [text] });
    });
  }

  // ---- postings ----
  const postings = new Map();
  fields.forEach((f, di) => {
    const score = new Map();
    for (const [name, weight] of Object.entries(weights)) {
      const counts = new Map();
      for (const text of f[name] ?? []) for (const key of tokens(text, options)) counts.set(key, (counts.get(key) ?? 0) + 1);
      for (const [key, tf] of counts) score.set(key, (score.get(key) ?? 0) + weight * Math.min(tf, 4));
    }
    for (const [key, w] of score) {
      if (!postings.has(key)) postings.set(key, []);
      postings.get(key).push(di, w);
    }
  });
  const terms = [...postings.keys()].sort();

  // ---- synonyms the owner defined (single words; both directions) ----
  const syn = {};
  for (const group of settings.synonyms?.[lang] ?? []) {
    const keys = [...new Set(group.flatMap((w) => scan(w, options).map((t) => t.key)))];
    if (keys.length < 2) continue;
    for (const key of keys) syn[key] = [...new Set([...(syn[key] ?? []), ...keys.filter((k) => k !== key)])];
  }

  const index = {
    v: INDEX_VERSION, lang, o: options, docs, facets: { topics: topicFacets, tags: tagFacets },
    terms, post: terms.map((t) => postings.get(t)),
  };
  if (Object.keys(syn).length) index.syn = syn;
  return { index, docCount: docs.length, termCount: terms.length };
}

/** Exposed for tests and the admin's search test box. */
export const normalizeKey = keyOf;
