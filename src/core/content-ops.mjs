// Creating and summarising content records. Pure helpers shared by the admin screens and tests.

import { blockSkeleton } from './block-specs.mjs';
import { newId, collectIds } from './ids.mjs';
import { slugify, uniqueSlug } from './slugify.mjs';

const iso = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** All IDs in use across the loaded content, so new IDs never collide. */
export function usedIds(content) {
  return collectIds(content.site, content.languagesFile, content.navigation, content.homepage, content.presetsFile, content.topicsFile, content.tagsFile, content.mediaFile, content.profile, content.articles, content.projects);
}

export function slugsInUse(content, kind, lang, exceptId) {
  const items = kind === 'article' ? content.articles : content.projects;
  return new Set(items.filter((i) => i.id !== exceptId).map((i) => i.translations[lang]?.slug).filter(Boolean));
}

/**
 * A new article that already satisfies the schema, so the first save is valid.
 * @param {{ lang: string, title: string, excerpt: string, authorId: string, now?: Date }} input
 */
export function createArticle(content, { lang, title, excerpt, authorId, now = new Date() }) {
  const id = newId('article', usedIds(content));
  const slug = uniqueSlug(slugify(title), slugsInUse(content, 'article', lang));
  const stamp = iso(now);
  return {
    schemaVersion: 1, id, status: 'draft', createdAt: stamp, updatedAt: stamp, authorId,
    featured: false, topicIds: [], tagIds: [],
    translations: { [lang]: { status: 'draft', slug, title: title.trim(), excerpt: excerpt.trim(), body: [] } },
  };
}

export function createProject(content, { lang, title, summary, now = new Date() }) {
  const id = newId('project', usedIds(content));
  const slug = uniqueSlug(slugify(title), slugsInUse(content, 'project', lang));
  const stamp = iso(now);
  return {
    schemaVersion: 1, id, status: 'draft', createdAt: stamp, updatedAt: stamp,
    featured: false, projectStatus: 'in-progress', topicIds: [], tagIds: [],
    translations: { [lang]: { status: 'draft', slug, title: title.trim(), summary: summary.trim() } },
  };
}

export function newBlock(content, type, extraTaken = []) {
  return blockSkeleton(type, newId('block', new Set([...usedIds(content), ...extraTaken])));
}

/** Stamp a record as modified now. */
export function touch(record, now = new Date()) { return { ...record, updatedAt: iso(now) }; }

/** Make a translation or record public: sets statuses and the publication date when missing. */
export function publishArticleTranslation(article, lang, now = new Date()) {
  const next = structuredClone(article);
  next.status = 'published';
  next.translations[lang].status = 'published';
  next.publishedAt ??= iso(now);
  next.updatedAt = iso(now);
  return next;
}

/** Numbers for the overview screen, computed from real content only. */
export function overview(content) {
  const langs = content.languages.filter((l) => l.enabled).map((l) => l.code);
  const count = (items, test) => items.filter(test).length;
  const published = (item) => item.status === 'published';
  const byLanguage = Object.fromEntries(langs.map((code) => [code, {
    articles: count(content.articles, (a) => published(a) && a.translations[code]?.status === 'published'),
    projects: count(content.projects, (p) => published(p) && p.translations[code]?.status === 'published'),
  }]));
  const topicCounts = new Map();
  for (const a of content.articles.filter(published)) for (const id of a.topicIds) topicCounts.set(id, (topicCounts.get(id) ?? 0) + 1);
  const recent = [...content.articles.map((a) => ({ kind: 'article', id: a.id, status: a.status, updatedAt: a.updatedAt, translations: a.translations })),
    ...content.projects.map((p) => ({ kind: 'project', id: p.id, status: p.status, updatedAt: p.updatedAt, translations: p.translations }))]
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)).slice(0, 8);
  return {
    articles: { published: count(content.articles, published), drafts: count(content.articles, (a) => !published(a) && a.status !== 'archived'), archived: count(content.articles, (a) => a.status === 'archived'), total: content.articles.length },
    projects: { published: count(content.projects, published), drafts: count(content.projects, (p) => !published(p) && p.status !== 'archived'), archived: count(content.projects, (p) => p.status === 'archived'), total: content.projects.length },
    byLanguage,
    byTopic: [...topicCounts].map(([id, n]) => ({ id, count: n })).sort((a, b) => b.count - a.count),
    scheduled: count([...content.articles, ...content.projects], (i) => i.status === 'scheduled'),
    recent,
  };
}
