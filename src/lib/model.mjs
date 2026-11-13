// Turns validated content into the site model the renderers read.
//
// This is the single place that decides what is PUBLIC. Renderers only ever see what this file
// returns, so a draft, a private section or an unreferenced media file cannot leak by accident.
//
// Publication rules:
//   article/project  -> top-level status AND the translation's status are "published"
//   topic            -> status "published", visibility "public", translation exists
//   tag              -> status "published", translation exists
//   profile entries  -> visibility "public"
//   media file       -> only files referenced by public content are copied to the output

import { createI18n } from './i18n.mjs';
import { countWords } from '../core/blocks-meta.mjs';
import { relatedItems, relatedTags, relatedTopics, topicRelations } from '../core/related.mjs';
import { searchSettings } from '../core/search-settings.mjs';
import { paragraphs } from './markup.mjs';
import { encodePath } from '../core/text.mjs';

const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

const byNewest = (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.id.localeCompare(b.id);

/** Words in the visible blocks (markup and literal code excluded). */
export const wordCount = countWords;

export function buildModel(content, options = {}) {
  const siteUrl = new URL(options.siteUrl ?? content.site.canonicalDomain);
  const origin = siteUrl.origin;
  const basePath = siteUrl.pathname.replace(/\/+$/, '');
  const languages = content.languages.filter((l) => l.enabled);
  const defaultLang = languages.find((l) => l.default).code;

  const urlFor = (segs) => `${basePath}/${segs.map((s) => encodeURIComponent(s)).join('/')}${segs.length ? '/' : ''}`;
  const absolute = (url) => `${origin}${url}`;

  const mediaById = new Map(content.media.filter((m) => m.status === 'active').map((m) => [m.id, m]));
  const topicById = new Map(content.topics.map((t) => [t.id, t]));
  const tagById = new Map(content.tags.map((t) => [t.id, t]));
  const usedMedia = new Set();

  const mediaView = (id, lang, altOverride) => {
    const asset = mediaById.get(id);
    if (!asset) return null;
    usedMedia.add(id);
    // `options.mediaUrl` lets the browser admin point previews at in-memory files; the build never sets it.
    const url = options.mediaUrl ? options.mediaUrl(asset) : `${basePath}/media/${encodePath(asset.file)}`;
    return {
      id,
      file: asset.file,
      url,
      absoluteUrl: absolute(url),
      mimeType: asset.mimeType,
      width: asset.width ?? null,
      height: asset.height ?? null,
      alt: altOverride ?? asset.alt[lang] ?? '',
      caption: asset.caption?.[lang] ?? '',
      credit: asset.credit ?? '',
      focal: asset.focal ?? null,
      isRaster: RASTER.has(asset.mimeType),
    };
  };

  const model = {
    site: content.site,
    siteUrl: siteUrl.href.replace(/\/$/, ''),
    origin,
    basePath,
    languages,
    defaultLang,
    langs: {},
    design: content.design,
    presets: content.presets,
    search: searchSettings(content.search),
    hasSample: false,
    year: (options.now ?? new Date()).getUTCFullYear(),
    usedMedia,
    mediaById,
    mediaView,
    urlFor,
    absolute,
  };

  const descendantsOf = (topicId, publicIds) => {
    const out = new Set([topicId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of content.topics) {
        if (t.parentId && out.has(t.parentId) && !out.has(t.id) && publicIds.has(t.id)) { out.add(t.id); grew = true; }
      }
    }
    return out;
  };

  for (const language of languages) {
    const lang = language.code;
    const i18n = createI18n(language, content.i18n[lang].strings, content.site.timezone);
    const routes = language.routes;
    const L = {
      language,
      lang,
      dir: language.direction,
      i18n,
      routes,
      siteName: content.site.name[lang],
      tagline: content.site.tagline[lang],
      description: content.site.description[lang],
    };

    // ---- Topics & tags (public only) ----
    const publicTopics = content.topics.filter((t) => t.status === 'published' && t.visibility === 'public' && t.translations[lang]);
    const publicTopicIds = new Set(publicTopics.map((t) => t.id));
    // A private tag is a working label: it never gets a page, a chip, a search entry or a filter.
    const publicTags = content.tags.filter((t) => t.status === 'published' && (t.visibility ?? 'public') === 'public' && t.translations[lang]);
    const publicTagIds = new Set(publicTags.map((t) => t.id));

    const topicView = (t) => {
      const tr = t.translations[lang];
      return {
        kind: 'topic', id: t.id, lang, name: tr.name, slug: tr.slug, description: tr.description,
        parentId: t.parentId && publicTopicIds.has(t.parentId) ? t.parentId : null,
        featured: Boolean(t.featured), sample: Boolean(t.sample),
        icon: t.icon ?? null, color: t.color ? t.color.toLowerCase() : null,
        synonyms: tr.synonyms ?? [], seo: tr.seo ?? {}, redirectSlugs: tr.redirectSlugs ?? [],
        relatedTopicIds: t.relatedTopicIds ?? [], pinnedItemIds: t.pinnedItemIds ?? [],
        media: t.mediaId ? mediaView(t.mediaId, lang) : null,
        segs: [lang, routes.topics, tr.slug],
      };
    };
    const tagView = (t) => {
      const tr = t.translations[lang];
      return {
        kind: 'tag', id: t.id, lang, name: tr.name, slug: tr.slug, sample: Boolean(t.sample),
        description: tr.description ?? '', aliases: tr.aliases ?? [], synonyms: tr.synonyms ?? [], seo: tr.seo ?? {},
        redirectSlugs: tr.redirectSlugs ?? [], relatedTagIds: t.relatedTagIds ?? [],
        segs: [lang, routes.tags, tr.slug],
      };
    };
    const topicViews = new Map();
    const tagViews = new Map();

    // Views are created lazily (mediaView marks media as used only for what is actually public).
    const getTopic = (id) => {
      if (!publicTopicIds.has(id)) return null;
      if (!topicViews.has(id)) { const v = topicView(topicById.get(id)); v.url = urlFor(v.segs); topicViews.set(id, v); }
      return topicViews.get(id);
    };
    const getTag = (id) => {
      if (!publicTagIds.has(id)) return null;
      if (!tagViews.has(id)) { const v = tagView(tagById.get(id)); v.url = urlFor(v.segs); tagViews.set(id, v); }
      return tagViews.get(id);
    };

    // ---- Articles ----
    const profileTr = content.profile.status === 'published' ? content.profile.translations[lang] : null;
    const authorName = profileTr?.name ?? '';

    const alternatesFor = (collection, id, segsFor) => {
      const out = {};
      for (const other of languages) {
        const rec = collection.find((r) => r.id === id);
        const tr = rec?.translations[other.code];
        if (rec && rec.status === 'published' && tr?.status === 'published') out[other.code] = urlFor(segsFor(other, tr));
      }
      return out;
    };

    const articles = content.articles
      .filter((a) => a.status === 'published' && a.translations[lang]?.status === 'published')
      .map((a) => {
        const tr = a.translations[lang];
        const segs = [lang, routes.blog, tr.slug];
        const topics = a.topicIds.map(getTopic).filter(Boolean);
        const cover = a.coverMediaId ? mediaView(a.coverMediaId, lang, tr.coverAlt) : null;
        return {
          kind: 'article', id: a.id, lang, segs, url: urlFor(segs),
          title: tr.title, subtitle: tr.subtitle ?? '', excerpt: tr.excerpt, slug: tr.slug,
          body: tr.body.filter((b) => !b.hidden), template: a.template ?? 'editorial', typography: a.typography ?? null,
          featured: Boolean(a.featured), publishedAt: a.publishedAt, updatedAt: a.updatedAt, sample: Boolean(a.sample),
          topicIds: a.topicIds, tagIds: a.tagIds ?? [],
          topics, primaryTopic: topics[0] ?? null,
          tags: (a.tagIds ?? []).map(getTag).filter(Boolean),
          cover, seo: tr.seo ?? {}, author: authorName,
          readingMinutes: Math.max(1, Math.ceil(wordCount(tr.body) / language.readingWpm)),
          alternates: alternatesFor(content.articles, a.id, (other, otr) => [other.code, other.routes.blog, otr.slug]),
        };
      })
      .sort(byNewest);

    // ---- Projects ----
    const projects = content.projects
      .filter((p) => p.status === 'published' && p.translations[lang]?.status === 'published')
      .map((p) => {
        const tr = p.translations[lang];
        const segs = [lang, routes.portfolio, tr.slug];
        const topics = p.topicIds.map(getTopic).filter(Boolean);
        return {
          kind: 'project', id: p.id, lang, segs, url: urlFor(segs),
          title: tr.title, subtitle: tr.subtitle ?? '', summary: tr.summary, slug: tr.slug,
          role: tr.role ?? '', responsibilities: tr.responsibilities ?? [],
          challenge: paragraphs(tr.challenge ?? ''), process: paragraphs(tr.process ?? ''),
          solution: paragraphs(tr.solution ?? ''), outcome: paragraphs(tr.outcome ?? ''),
          body: (tr.body ?? []).filter((b) => !b.hidden), links: tr.links ?? [],
          projectStatus: p.projectStatus ?? null, startDate: p.startDate ?? null, endDate: p.endDate ?? null,
          tools: p.tools ?? [], typography: p.typography ?? null, featured: Boolean(p.featured), sample: Boolean(p.sample),
          publishedAt: p.publishedAt, updatedAt: p.updatedAt,
          topicIds: p.topicIds, tagIds: p.tagIds ?? [],
          topics, primaryTopic: topics[0] ?? null,
          tags: (p.tagIds ?? []).map(getTag).filter(Boolean),
          cover: p.coverMediaId ? mediaView(p.coverMediaId, lang, tr.coverAlt) : null,
          gallery: (p.galleryMediaIds ?? []).map((id) => mediaView(id, lang)).filter(Boolean),
          relatedArticleIds: p.relatedArticleIds ?? [],
          seo: tr.seo ?? {},
          alternates: alternatesFor(content.projects, p.id, (other, otr) => [other.code, other.routes.portfolio, otr.slug]),
        };
      })
      .sort(byNewest);

    const articleById = new Map(articles.map((a) => [a.id, a]));

    // ---- Relationships (no AI: what the owner filed; the rules live in src/core/related.mjs) ----
    const relations = topicRelations(content.topics.map((t) => ({ id: t.id, parentId: t.parentId ?? null })));
    const related = (item, pool, limit = 3) => relatedItems(item, pool, { limit, relations, tieBreak: byNewest });

    for (const a of articles) {
      a.relatedArticles = related(a, articles);
      a.relatedProjects = projects.filter((p) => p.relatedArticleIds.includes(a.id)).slice(0, 3);
    }
    for (const p of projects) {
      const explicit = p.relatedArticleIds.map((id) => articleById.get(id)).filter(Boolean);
      p.relatedArticles = explicit;
      p.relatedProjects = related(p, projects);
    }

    // ---- Topic and tag pages: only those that have public content in this language ----
    const topics = publicTopics.map((t) => getTopic(t.id));
    for (const t of topics) {
      const ids = descendantsOf(t.id, publicTopicIds);
      t.articles = articles.filter((a) => a.topicIds.some((id) => ids.has(id)));
      t.projects = projects.filter((p) => p.topicIds.some((id) => ids.has(id)));
      t.count = t.articles.length + t.projects.length;
    }
    const activeTopics = topics.filter((t) => t.count > 0);
    const activeTopicIds = new Set(activeTopics.map((t) => t.id));
    for (const t of activeTopics) {
      t.children = activeTopics.filter((c) => c.parentId === t.id);
      t.parent = t.parentId && activeTopicIds.has(t.parentId) ? topicViews.get(t.parentId) : null;
    }

    const tags = publicTags.map((t) => getTag(t.id));
    for (const t of tags) {
      t.articles = articles.filter((a) => a.tagIds.includes(t.id));
      t.projects = projects.filter((p) => p.tagIds.includes(t.id));
      t.count = t.articles.length + t.projects.length;
    }
    const activeTags = tags.filter((t) => t.count > 0);

    // Landing-page extras: pinned items, related topics and tags, and the old addresses that redirect here.
    const everything = [...articles, ...projects];
    for (const t of activeTopics) {
      const inTopic = new Map([...t.articles, ...t.projects].map((x) => [x.id, x]));
      t.pinned = t.pinnedItemIds.map((id) => inTopic.get(id)).filter(Boolean);
      t.related = relatedTopics(t, activeTopics, everything);
    }
    for (const t of activeTags) t.related = relatedTags(t, activeTags, everything);
    const redirects = [];
    for (const [kind, list] of [['topic', activeTopics], ['tag', activeTags]]) {
      for (const t of list) for (const slug of t.redirectSlugs) redirects.push({ kind, segs: [lang, kind === 'topic' ? routes.topics : routes.tags, slug], to: t.url, name: t.name });
    }
    L.redirects = redirects;

    // ---- Profile ----
    const visible = (list) => (list ?? []).filter((e) => e.visibility === 'public' && e.translations[lang]);
    const byStartDesc = (a, b) => b.startDate.localeCompare(a.startDate);
    let profile = null;
    if (profileTr) {
      profile = {
        id: content.profile.id,
        name: profileTr.name, headline: profileTr.headline, summary: profileTr.summary,
        biography: (profileTr.biography ?? []).filter((b) => !b.hidden),
        photo: content.profile.photoMediaId ? mediaView(content.profile.photoMediaId, lang) : null,
        links: content.profile.links ?? [],
        experience: visible(content.profile.experience).sort(byStartDesc).map((e) => ({ ...e.translations[lang], startDate: e.startDate, endDate: e.endDate ?? null, sample: Boolean(e.sample) })),
        education: visible(content.profile.education).sort(byStartDesc).map((e) => ({ ...e.translations[lang], startDate: e.startDate, endDate: e.endDate ?? null, sample: Boolean(e.sample) })),
        skills: visible(content.profile.skills).map((s) => ({ name: s.translations[lang].name, sample: Boolean(s.sample) })),
        customSections: visible(content.profile.customSections).map((s) => ({ id: s.id, title: s.translations[lang].title, body: s.translations[lang].body.filter((b) => !b.hidden), sample: Boolean(s.sample) })),
        sample: Boolean(content.profile.sample),
      };
    }

    // ---- Navigation ----
    const pageUrl = {
      home: urlFor([lang]),
      about: urlFor([lang, routes.about]),
      portfolio: urlFor([lang, routes.portfolio]),
      blog: urlFor([lang, routes.blog]),
      topics: urlFor([lang, routes.topics]),
      tags: urlFor([lang, routes.tags]),
      search: urlFor([lang, routes.search ?? 'search']),
      contact: urlFor([lang, routes.contact]),
    };
    const fallbackNav = ['home', 'blog', 'portfolio', 'about', 'contact'].map((page) => ({ id: `fallback-${page}`, label: i18n.t(page), target: { page } }));
    const resolveNav = (items) => items.map((item) => (item.target.page
      ? { id: item.id, label: item.label, href: pageUrl[item.target.page], page: item.target.page, external: false }
      : { id: item.id, label: item.label, href: item.target.url, page: null, external: true }));
    L.nav = {
      header: resolveNav(content.navigation.header[lang] ?? fallbackNav),
      footer: resolveNav(content.navigation.footer[lang] ?? content.navigation.header[lang] ?? fallbackNav),
    };
    L.pageUrl = pageUrl;
    L.searchSegs = [lang, routes.search ?? 'search'];
    L.searchEnabled = model.search.enabled;
    L.homeUrl = pageUrl.home;
    L.articles = articles;
    L.projects = projects;
    L.topics = activeTopics;
    L.tags = activeTags;
    L.profile = profile;
    L.topicBySlug = new Map(activeTopics.map((t) => [t.slug, t]));

    // ---- Homepage composition (independent per language) ----
    L.home = resolveHome({ content, lang, articles, projects, activeTopics, profile, i18n });

    model.langs[lang] = L;
  }

  // Alternates for pages that exist in every language.
  model.alternatesFor = (pageKey) => Object.fromEntries(languages.map((l) => [l.code, model.langs[l.code].pageUrl[pageKey]]));

  // ---- Sample content detection (what is actually published) ----
  model.hasSample = Object.values(model.langs).some((L) => (
    L.articles.some((a) => a.sample) || L.projects.some((p) => p.sample) || L.topics.some((t) => t.sample)
    || L.tags.some((t) => t.sample) || Boolean(L.profile?.sample)
    || Boolean(L.profile && [...L.profile.experience, ...L.profile.education, ...L.profile.skills, ...L.profile.customSections].some((e) => e.sample))
  ));

  return model;
}

function resolveHome({ content, lang, articles, projects, activeTopics, profile, i18n }) {
  const def = content.homepage.languages[lang];
  if (!def) return [];
  const sections = def.sections.filter((s) => s.enabled);
  const shown = new Set();
  const resolved = new Map();

  const matches = (item, source = {}) => (
    (!source.featuredOnly || item.featured)
    && (!source.topicIds?.length || item.topicIds.some((id) => source.topicIds.includes(id)))
    && (!source.templates?.length || !item.template || source.templates.includes(item.template))
  );

  // Pass 1: featured sections claim their item, so lists below do not repeat it.
  for (const s of sections.filter((x) => x.type === 'featured')) {
    const src = s.source ?? {};
    let pick = null;
    if (src.itemId) {
      pick = articles.find((a) => a.id === src.itemId) ?? projects.find((p) => p.id === src.itemId) ?? null;
    } else {
      const kind = src.kind ?? 'any';
      const pool = [...(kind === 'project' ? [] : articles), ...(kind === 'article' ? [] : projects)].sort(byNewest);
      pick = pool.find((item) => matches(item, src)) ?? pool.find((item) => matches(item, { ...src, featuredOnly: false })) ?? null;
    }
    if (pick) shown.add(pick.id);
    resolved.set(s.id, pick ? { item: pick } : null);
  }

  const out = [];
  for (const s of sections) {
    const base = {
      id: s.id, type: s.type, layout: s.layout ?? 'default', imageRatio: s.imageRatio ?? '3:2',
      spacing: s.spacing ?? 'normal', title: s.title ?? i18n.t(`sec_${s.type}`), intro: s.intro ?? '',
    };
    const limit = s.limit ?? 6;
    if (s.type === 'featured') {
      const r = resolved.get(s.id);
      if (r) out.push({ ...base, ...r });
    } else if (s.type === 'articles') {
      const items = articles.filter((a) => !shown.has(a.id) && matches(a, s.source)).slice(0, limit);
      if (items.length) out.push({ ...base, items });
    } else if (s.type === 'projects') {
      const items = projects.filter((p) => !shown.has(p.id) && matches(p, s.source)).slice(0, limit);
      if (items.length) out.push({ ...base, items });
    } else if (s.type === 'topics') {
      const featured = activeTopics.filter((t) => t.featured);
      const pool = featured.length ? featured : [...activeTopics].sort((a, b) => b.count - a.count);
      const items = pool.slice(0, limit);
      if (items.length) out.push({ ...base, items });
    } else if (s.type === 'highlights') {
      if (profile && (profile.experience.length || profile.education.length || profile.skills.length)) {
        out.push({ ...base, experience: profile.experience.slice(0, 3), education: profile.education.slice(0, 2), skills: profile.skills.slice(0, 12) });
      }
    } else if (s.type === 'follow') {
      if (profile && profile.links.length) out.push({ ...base, links: profile.links });
    }
  }
  return out;
}
