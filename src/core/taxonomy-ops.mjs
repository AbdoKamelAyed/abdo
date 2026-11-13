// Everything the Topic Manager and Tag Manager do, as pure functions on plain data, so the admin screens, the
// validator and the tests share one set of rules. Nothing here touches files: each operation returns the new
// records, and the caller (the admin workspace) stages them.
//
// `content` is the assembled content object (topics, tags, articles, projects, homepage).
// Operations that touch articles and projects return `{ articles: Map<id, record>, projects: Map<id, record> }`
// holding only the records that changed.

import { usedIds } from './content-ops.mjs';
import { newId } from './ids.mjs';
import { editDistance, foldName } from './search-text.mjs';
import { slugify, uniqueSlug } from './slugify.mjs';

const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const clone = (v) => structuredClone(v);
const unique = (list) => [...new Set(list)];
const compact = (record) => {
  for (const key of ['relatedTopicIds', 'relatedTagIds', 'pinnedItemIds']) if (Array.isArray(record[key]) && record[key].length === 0) delete record[key];
  return record;
};

export const LIMITS = Object.freeze({ aliases: 10, synonyms: 20, redirectSlugs: 20, related: 12, pinned: 6 });
export const BULK_FIELDS = Object.freeze({
  status: ['published', 'draft', 'archived'],
  visibility: ['public', 'private'],
  featured: [true, false],
});

// ------------------------------------------------------------------ usage

const blank = () => ({ articles: 0, projects: 0, total: 0, published: 0 });

/**
 * How many articles and projects use each topic and tag. `published` counts only those that are published
 * (what visitors can see); `total` counts drafts too, so nothing in use is ever called unused.
 * For topics, `rollup` also counts the content of every sub-topic (the way the topic pages do).
 */
export function usage(content) {
  const topics = new Map(content.topics.map((t) => [t.id, blank()]));
  const tags = new Map(content.tags.map((t) => [t.id, blank()]));
  const tally = (map, id, kind, published) => {
    const row = map.get(id);
    if (!row) return;
    row[kind] += 1; row.total += 1; if (published) row.published += 1;
  };
  for (const [items, kind] of [[content.articles, 'articles'], [content.projects, 'projects']]) {
    for (const item of items) {
      const published = item.status === 'published';
      for (const id of unique(item.topicIds ?? [])) tally(topics, id, kind, published);
      for (const id of unique(item.tagIds ?? [])) tally(tags, id, kind, published);
    }
  }
  const children = new Map();
  for (const t of content.topics) if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t.id]);
  const rollup = new Map();
  for (const t of content.topics) {
    const seen = new Set([t.id]);
    const queue = [t.id];
    const row = { total: 0, published: 0 };
    const owners = new Set();
    while (queue.length) {
      const id = queue.pop();
      for (const [items] of [[content.articles], [content.projects]]) {
        for (const item of items) {
          if (!(item.topicIds ?? []).includes(id) || owners.has(item)) continue;
          owners.add(item); row.total += 1; if (item.status === 'published') row.published += 1;
        }
      }
      for (const c of children.get(id) ?? []) if (!seen.has(c)) { seen.add(c); queue.push(c); }
    }
    rollup.set(t.id, row);
  }
  return { topics, tags, rollup };
}

/** Tags no article or project uses. */
export const unusedTags = (content) => {
  const { tags } = usage(content);
  return content.tags.filter((t) => tags.get(t.id).total === 0).map((t) => t.id);
};

/** Topics with no content of their own or below them, and no sub-topics. */
export const unusedTopics = (content) => {
  const { rollup } = usage(content);
  return content.topics.filter((t) => rollup.get(t.id).total === 0 && !content.topics.some((c) => c.parentId === t.id)).map((t) => t.id);
};

/** Overview numbers for the Tag Manager's insights panel. */
export function analytics(content) {
  const u = usage(content);
  const rank = (items, rows) => items.map((i) => ({ id: i.id, ...rows.get(i.id) })).sort((a, b) => b.total - a.total || b.published - a.published || a.id.localeCompare(b.id));
  const tagRows = rank(content.tags, u.tags);
  const topicRows = content.topics.map((t) => ({ id: t.id, ...u.rollup.get(t.id), direct: u.topics.get(t.id).total })).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  const items = [...content.articles, ...content.projects];
  const withTags = items.reduce((n, i) => n + (i.tagIds?.length ?? 0), 0);
  return {
    items: { total: items.length, withoutTags: items.filter((i) => !(i.tagIds?.length)).length, withoutTopics: items.filter((i) => !(i.topicIds?.length)).length },
    tags: {
      total: content.tags.length,
      used: tagRows.filter((r) => r.total > 0).length,
      unused: tagRows.filter((r) => r.total === 0).length,
      single: tagRows.filter((r) => r.total === 1).length,
      averagePerItem: items.length ? Math.round((withTags / items.length) * 10) / 10 : 0,
      top: tagRows.filter((r) => r.total > 0).slice(0, 10),
    },
    topics: {
      total: content.topics.length,
      used: topicRows.filter((r) => r.total > 0).length,
      unused: topicRows.filter((r) => r.total === 0).length,
      top: topicRows.filter((r) => r.total > 0).slice(0, 10),
    },
  };
}

// ------------------------------------------------------------------ duplicates and similar names

const namesOf = (record, { withAliases = true } = {}) => {
  const out = [];
  for (const [lang, tr] of Object.entries(record.translations)) {
    out.push({ lang, text: tr.name, kind: 'name' });
    if (withAliases) for (const a of tr.aliases ?? []) out.push({ lang, text: a, kind: 'alias' });
  }
  return out;
};

/**
 * Pairs of records whose names look like the same thing.
 *   same   the names are equal once case, accents, marks and punctuation are ignored ("Machine-Learning" / "machine learning")
 *   alias  one's name is another's alias
 *   typo   the names differ by one or two letters ("analytics" / "analyitcs")
 * @param {object[]} records topics or tags
 * @returns {{ a: string, b: string, reason: 'same'|'alias'|'typo', distance: number }[]}
 */
export function similarPairs(records, options) {
  const folded = records.map((r) => namesOf(r).map((n) => ({ ...n, key: foldName(n.text, options) })).filter((n) => n.key));
  const pairs = [];
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      let best = null;
      for (const x of folded[i]) {
        for (const y of folded[j]) {
          let reason = null;
          let distance = 0;
          if (x.key === y.key) reason = x.kind === 'name' && y.kind === 'name' ? 'same' : 'alias';
          else if (x.kind === 'name' && y.kind === 'name' && x.lang === y.lang && Math.min(x.key.length, y.key.length) >= 4) {
            const limit = Math.min(x.key.length, y.key.length) >= 8 ? 2 : 1;
            distance = editDistance(x.key, y.key, limit);
            if (distance <= limit) reason = 'typo';
          }
          if (reason) {
            const rank = { same: 0, alias: 1, typo: 2 };
            if (!best || rank[reason] < rank[best.reason] || (reason === best.reason && distance < best.distance)) best = { a: records[i].id, b: records[j].id, reason, distance };
          }
        }
      }
      if (best) pairs.push(best);
    }
  }
  const rank = { same: 0, alias: 1, typo: 2 };
  return pairs.sort((p, q) => rank[p.reason] - rank[q.reason] || p.distance - q.distance || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}

/** Groups of records that are the same thing (`same` or `alias` pairs, joined transitively). */
export function duplicateGroups(records, options) {
  const parent = new Map(records.map((r) => [r.id, r.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const p of similarPairs(records, options)) if (p.reason !== 'typo') parent.set(find(p.a), find(p.b));
  const groups = new Map();
  for (const r of records) { const root = find(r.id); groups.set(root, [...(groups.get(root) ?? []), r.id]); }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Suggestions for one record: the other records it resembles, nearest first. */
export function similarTo(records, id, options) {
  return similarPairs(records, options).filter((p) => p.a === id || p.b === id).map((p) => ({ id: p.a === id ? p.b : p.a, reason: p.reason, distance: p.distance }));
}

// ------------------------------------------------------------------ slugs

/**
 * Change the slug of one language and remember the old one, so the old address still leads somewhere
 * (the build writes a small redirect page for every remembered slug).
 */
export function setSlug(record, lang, slug, { now = new Date() } = {}) {
  const next = clone(record);
  const tr = next.translations[lang];
  if (!tr || tr.slug === slug) return next;
  const old = tr.slug;
  tr.redirectSlugs = unique([...(tr.redirectSlugs ?? []).filter((s) => s !== slug), old]).slice(-LIMITS.redirectSlugs);
  tr.slug = slug;
  next.updatedAt = iso(now);
  return next;
}

// ------------------------------------------------------------------ merging

const rewriteIds = (ids, gone, into) => {
  if (!ids) return { ids, changed: false };
  const out = unique(ids.map((id) => (gone.has(id) ? into : id)));
  return { ids: out, changed: out.length !== ids.length || out.some((id, i) => id !== ids[i]) };
};

function rewriteItems(items, field, gone, into, now) {
  const changed = new Map();
  for (const item of items) {
    const r = rewriteIds(item[field], gone, into);
    if (r.changed) changed.set(item.id, { ...clone(item), [field]: r.ids, updatedAt: iso(now) });
  }
  return changed;
}

const addTo = (list, value, max, notes, note) => {
  if (list.includes(value)) return;
  if (list.length >= max) { notes.push(note); return; }
  list.push(value);
};

/**
 * Merge tags into one. Articles and projects that used any of them use the target instead (once), the merged
 * tags' names become aliases of the target (so people searching the old name still find it), their slugs become
 * redirects, and their synonyms and related tags are carried over.
 * @returns {{ tags: object[], articles: Map, projects: Map, notes: { id: string, lang?: string, kind: string }[] }}
 */
export function mergeTags(content, fromIds, intoId, { now = new Date() } = {}) {
  const gone = new Set(unique(fromIds).filter((id) => id !== intoId));
  const byId = new Map(content.tags.map((t) => [t.id, t]));
  if (!byId.has(intoId)) throw new Error(`Unknown tag ${intoId}`);
  if (gone.size === 0) throw new Error('Choose at least one other tag to merge into the target.');
  for (const id of gone) if (!byId.has(id)) throw new Error(`Unknown tag ${id}`);

  const target = clone(byId.get(intoId));
  const notes = [];
  for (const id of gone) {
    const src = byId.get(id);
    for (const [lang, tr] of Object.entries(src.translations)) {
      const into = target.translations[lang];
      if (!into) { notes.push({ id, lang, kind: 'language-missing' }); continue; }
      const known = new Set([foldName(into.name), ...(into.aliases ?? []).map((a) => foldName(a))]);
      into.aliases = [...(into.aliases ?? [])];
      for (const a of [tr.name, ...(tr.aliases ?? [])]) {
        if (known.has(foldName(a))) continue;
        known.add(foldName(a));
        addTo(into.aliases, a, LIMITS.aliases, notes, { id, lang, kind: 'alias-dropped' });
      }
      into.synonyms = [...(into.synonyms ?? [])];
      for (const s of tr.synonyms ?? []) if (foldName(s) !== foldName(into.name)) addTo(into.synonyms, s, LIMITS.synonyms, notes, { id, lang, kind: 'synonym-dropped' });
      into.redirectSlugs = [...(into.redirectSlugs ?? [])];
      for (const s of [tr.slug, ...(tr.redirectSlugs ?? [])]) if (s !== into.slug) addTo(into.redirectSlugs, s, LIMITS.redirectSlugs, notes, { id, lang, kind: 'redirect-dropped' });
      if (!into.description && tr.description) into.description = tr.description;
      for (const key of ['aliases', 'synonyms', 'redirectSlugs']) if (into[key].length === 0) delete into[key];
    }
    target.relatedTagIds = [...(target.relatedTagIds ?? []), ...(src.relatedTagIds ?? [])];
  }
  target.relatedTagIds = unique(target.relatedTagIds.map((id) => (gone.has(id) ? intoId : id))).filter((id) => id !== intoId).slice(0, LIMITS.related);
  target.updatedAt = iso(now);
  compact(target);

  const tags = content.tags.filter((t) => !gone.has(t.id)).map((t) => {
    if (t.id === intoId) return target;
    const r = rewriteIds(t.relatedTagIds, gone, intoId);
    if (!r.changed) return t;
    const copy = clone(t);
    copy.relatedTagIds = r.ids.filter((id) => id !== t.id);
    return compact(copy);
  });
  return { tags, articles: rewriteItems(content.articles, 'tagIds', gone, intoId, now), projects: rewriteItems(content.projects, 'tagIds', gone, intoId, now), notes };
}

function hasCycle(topics, id) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const seen = new Set();
  for (let cur = byId.get(id); cur?.parentId; cur = byId.get(cur.parentId)) {
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    if (cur.parentId === id) return true;
  }
  return false;
}

function rewriteHomepageTopics(homepage, gone, into) {
  if (!homepage?.languages) return null;
  const next = clone(homepage);
  let changed = false;
  for (const lang of Object.values(next.languages)) {
    for (const section of lang.sections ?? []) {
      const ids = section.source?.topicIds;
      if (!ids) continue;
      const out = into ? unique(ids.map((id) => (gone.has(id) ? into : id))) : ids.filter((id) => !gone.has(id));
      if (out.length !== ids.length || out.some((id, i) => id !== ids[i])) {
        changed = true;
        if (out.length) section.source.topicIds = out; else delete section.source.topicIds;
        if (Object.keys(section.source).length === 0) delete section.source;
      }
    }
  }
  return changed ? next : null;
}

/**
 * Merge one topic into another. Content filed under it moves to the target; its sub-topics move up to the
 * target (a sub-topic that is the target, or that would make a loop, moves to where the merged topic was);
 * its slug and names are kept as redirects and synonyms, its pinned items and related topics are carried over,
 * and homepage sections that listed it list the target instead.
 */
export function mergeTopics(content, fromId, intoId, { now = new Date() } = {}) {
  if (fromId === intoId) throw new Error('A topic cannot be merged into itself.');
  const byId = new Map(content.topics.map((t) => [t.id, t]));
  if (!byId.has(fromId) || !byId.has(intoId)) throw new Error('Unknown topic.');
  const gone = new Set([fromId]);
  const src = byId.get(fromId);
  const target = clone(byId.get(intoId));
  const notes = [];

  for (const [lang, tr] of Object.entries(src.translations)) {
    const into = target.translations[lang];
    if (!into) { notes.push({ id: fromId, lang, kind: 'language-missing' }); continue; }
    into.synonyms = [...(into.synonyms ?? [])];
    for (const s of [tr.name, ...(tr.synonyms ?? [])]) if (foldName(s) !== foldName(into.name)) addTo(into.synonyms, s, LIMITS.synonyms, notes, { id: fromId, lang, kind: 'synonym-dropped' });
    into.redirectSlugs = [...(into.redirectSlugs ?? [])];
    for (const s of [tr.slug, ...(tr.redirectSlugs ?? [])]) if (s !== into.slug) addTo(into.redirectSlugs, s, LIMITS.redirectSlugs, notes, { id: fromId, lang, kind: 'redirect-dropped' });
    for (const key of ['synonyms', 'redirectSlugs']) if (into[key].length === 0) delete into[key];
  }
  target.relatedTopicIds = unique([...(target.relatedTopicIds ?? []), ...(src.relatedTopicIds ?? [])].map((id) => (gone.has(id) ? intoId : id))).filter((id) => id !== intoId).slice(0, LIMITS.related);
  target.pinnedItemIds = unique([...(target.pinnedItemIds ?? []), ...(src.pinnedItemIds ?? [])]).slice(0, LIMITS.pinned);
  target.updatedAt = iso(now);

  let topics = content.topics.filter((t) => !gone.has(t.id)).map((t) => (t.id === intoId ? target : t));
  topics = topics.map((t) => {
    const parentGone = gone.has(t.parentId);
    const related = rewriteIds(t.relatedTopicIds, gone, intoId);
    if (!parentGone && !related.changed) return t;
    const copy = clone(t);
    if (parentGone) { if (t.id === intoId) { if (src.parentId) copy.parentId = src.parentId; else delete copy.parentId; } else copy.parentId = intoId; }
    if (related.changed) copy.relatedTopicIds = related.ids.filter((id) => id !== t.id);
    return compact(copy);
  });
  // A sub-topic of the merged topic that is itself above the target would now be its own ancestor: lift the target out.
  for (const t of topics) {
    if (t.id !== intoId && hasCycle(topics, t.id)) {
      const fix = topics.find((x) => x.id === intoId);
      if (src.parentId && src.parentId !== intoId) fix.parentId = src.parentId; else delete fix.parentId;
    }
  }
  compact(topics.find((t) => t.id === intoId));
  return {
    topics, notes,
    articles: rewriteItems(content.articles, 'topicIds', gone, intoId, now),
    projects: rewriteItems(content.projects, 'topicIds', gone, intoId, now),
    homepage: rewriteHomepageTopics(content.homepage, gone, intoId),
  };
}

// ------------------------------------------------------------------ deleting

function stripFrom(items, field, id, now) {
  const changed = new Map();
  for (const item of items) {
    if (item[field]?.includes(id)) changed.set(item.id, { ...clone(item), [field]: item[field].filter((x) => x !== id), updatedAt: iso(now) });
  }
  return changed;
}

/** Why a tag cannot simply be deleted (it is used), or null. Deleting a used tag needs `force`. */
export const tagBlockers = (content, id) => {
  const row = usage(content).tags.get(id);
  return row && row.total > 0 ? { articles: row.articles, projects: row.projects } : null;
};

export function deleteTag(content, id, { force = false, now = new Date() } = {}) {
  if (!content.tags.some((t) => t.id === id)) throw new Error(`Unknown tag ${id}`);
  const blockers = tagBlockers(content, id);
  if (blockers && !force) throw new Error('This tag is used by content. Merge it into another tag, or confirm that it should be removed from that content.');
  const tags = content.tags.filter((t) => t.id !== id).map((t) => {
    if (!t.relatedTagIds?.includes(id)) return t;
    const copy = clone(t);
    copy.relatedTagIds = copy.relatedTagIds.filter((x) => x !== id);
    return compact(copy);
  });
  return { tags, articles: stripFrom(content.articles, 'tagIds', id, now), projects: stripFrom(content.projects, 'tagIds', id, now) };
}

export const topicBlockers = (content, id) => {
  const direct = usage(content).topics.get(id);
  const children = content.topics.filter((t) => t.parentId === id).length;
  return direct && (direct.total > 0 || children > 0) ? { articles: direct.articles, projects: direct.projects, children } : null;
};

/** Delete a topic. Sub-topics move up to its parent. Used topics need `force`; the content then loses that topic. */
export function deleteTopic(content, id, { force = false, now = new Date() } = {}) {
  const topic = content.topics.find((t) => t.id === id);
  if (!topic) throw new Error(`Unknown topic ${id}`);
  const blockers = topicBlockers(content, id);
  if (blockers && (blockers.articles || blockers.projects) && !force) throw new Error('This topic is used by content. Merge it into another topic, or confirm that it should be removed from that content.');
  const topics = content.topics.filter((t) => t.id !== id).map((t) => {
    const parentGone = t.parentId === id;
    const hasRelated = t.relatedTopicIds?.includes(id);
    if (!parentGone && !hasRelated) return t;
    const copy = clone(t);
    if (parentGone) { if (topic.parentId) copy.parentId = topic.parentId; else delete copy.parentId; }
    if (hasRelated) copy.relatedTopicIds = copy.relatedTopicIds.filter((x) => x !== id);
    return compact(copy);
  });
  return {
    topics,
    articles: stripFrom(content.articles, 'topicIds', id, now),
    projects: stripFrom(content.projects, 'topicIds', id, now),
    homepage: rewriteHomepageTopics(content.homepage, new Set([id]), null),
  };
}

// ------------------------------------------------------------------ editing many at once

/**
 * Apply the same change to several records. Only status, visibility and featured can be set this way, each to a
 * value the schema allows; anything else is refused, so a bulk edit can never write something the build rejects.
 * @returns {object[]} the new array (records not named are returned unchanged)
 */
export function bulkEdit(records, ids, patch, { now = new Date() } = {}) {
  const wanted = new Set(ids);
  for (const [key, value] of Object.entries(patch)) {
    if (!BULK_FIELDS[key]) throw new Error(`"${key}" cannot be changed in bulk.`);
    if (!BULK_FIELDS[key].includes(value)) throw new Error(`"${value}" is not a valid value for ${key}.`);
  }
  return records.map((r) => {
    if (!wanted.has(r.id)) return r;
    const copy = clone(r);
    for (const [key, value] of Object.entries(patch)) {
      // Tags have no "featured"; a bulk change that does not apply to a record is left out rather than invented.
      if (key === 'featured' && !('featured' in r) && r.id.startsWith('tag_')) continue;
      if (key === 'visibility' && value === 'public' && r.id.startsWith('tag_')) delete copy.visibility; else copy[key] = value;
    }
    copy.updatedAt = iso(now);
    return copy;
  });
}

// ------------------------------------------------------------------ hierarchy

/** The topic and everything below it. */
export function descendantIds(topics, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of topics) if (t.parentId && out.has(t.parentId) && !out.has(t.id)) { out.add(t.id); grew = true; }
  }
  return out;
}

/** Move a topic under another (or to the top with null). Refuses a move that would make a loop. */
export function setParent(topics, id, parentId, { now = new Date() } = {}) {
  if (parentId === id) return { ok: false, error: 'self' };
  if (parentId && !topics.some((t) => t.id === parentId)) return { ok: false, error: 'unknown' };
  if (parentId && descendantIds(topics, id).has(parentId)) return { ok: false, error: 'cycle' };
  return {
    ok: true,
    topics: topics.map((t) => {
      if (t.id !== id) return t;
      const copy = clone(t);
      if (parentId) copy.parentId = parentId; else delete copy.parentId;
      copy.updatedAt = iso(now);
      return copy;
    }),
  };
}

/** Topics in display order: parents first, each followed by its sub-topics, in stored order. */
export function topicTree(topics) {
  const out = [];
  const byParent = new Map();
  const ids = new Set(topics.map((t) => t.id));
  for (const t of topics) {
    const key = t.parentId && ids.has(t.parentId) ? t.parentId : '';
    byParent.set(key, [...(byParent.get(key) ?? []), t]);
  }
  const walk = (key, depth, seen) => {
    for (const t of byParent.get(key) ?? []) {
      if (seen.has(t.id)) continue;
      out.push({ topic: t, depth });
      walk(t.id, depth + 1, new Set([...seen, t.id]));
    }
  };
  walk('', 0, new Set());
  return out;
}

/** Move a record to a new position in the stored list (this is the order topics appear in). */
export function moveRecord(records, id, to) {
  const from = records.findIndex((r) => r.id === id);
  if (from < 0) return records;
  const next = records.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

// ------------------------------------------------------------------ creating

/** Slugs a record may not use in one language: every other record's slug and every remembered old slug. */
const slugsTaken = (records, lang, exceptId) => new Set(records.filter((r) => r.id !== exceptId).flatMap((r) => {
  const tr = r.translations[lang];
  return tr ? [tr.slug, ...(tr.redirectSlugs ?? [])] : [];
}));

/** A slug made from `text` that no other topic (or tag) uses in this language. */
export const freeSlug = (records, lang, text, exceptId) => uniqueSlug(slugify(text), slugsTaken(records, lang, exceptId));

/** A new topic that already satisfies the schema, so the first save is valid. */
export function createTopic(content, { lang, name, description, parentId, status = 'published', now = new Date() }) {
  const stamp = iso(now);
  const record = {
    id: newId('topic', usedIds(content)), status, visibility: 'public', createdAt: stamp, updatedAt: stamp,
    translations: { [lang]: { name: name.trim(), slug: freeSlug(content.topics, lang, name), description: description.trim() } },
  };
  if (parentId) record.parentId = parentId;
  return record;
}

/** A new tag that already satisfies the schema. */
export function createTag(content, { lang, name, status = 'published', now = new Date() }) {
  const stamp = iso(now);
  return {
    id: newId('tag', usedIds(content)), status, createdAt: stamp, updatedAt: stamp,
    translations: { [lang]: { name: name.trim(), slug: freeSlug(content.tags, lang, name) } },
  };
}

/** Add a language to a topic or tag (a topic needs a description in every language it has). */
export function addTranslation(records, record, lang, { name, description }) {
  const copy = clone(record);
  const tr = { name: name.trim(), slug: freeSlug(records, lang, name, record.id) };
  if (description?.trim()) tr.description = description.trim();
  copy.translations[lang] = tr;
  return copy;
}

// ------------------------------------------------------------------ applying results

const replaceWhere = (items, changed) => (changed?.size ? items.map((i) => changed.get(i.id) ?? i) : items);

/** The content as it would be after an operation's result (the result holds only what changed). */
export function applyResult(content, result) {
  return {
    ...content,
    topics: result.topics ?? content.topics,
    tags: result.tags ?? content.tags,
    articles: replaceWhere(content.articles, result.articles),
    projects: replaceWhere(content.projects, result.projects),
    homepage: result.homepage ?? content.homepage,
  };
}

/** Delete several tags at once. Returns what changed, as one result. */
export function deleteTags(content, ids, { force = false, now = new Date() } = {}) {
  let work = content;
  const articles = new Map();
  const projects = new Map();
  for (const id of ids) {
    const r = deleteTag(work, id, { force, now });
    for (const [k, v] of r.articles) articles.set(k, v);
    for (const [k, v] of r.projects) projects.set(k, v);
    work = applyResult(work, r);
  }
  return { tags: work.tags, articles, projects };
}
