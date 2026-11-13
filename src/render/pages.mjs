// Page generators. Each returns { segs, html, entry } where `segs` is the output path below the
// site root (e.g. ['ar', 'مدونة', 'my-post']) and `entry` feeds the sitemap.

import { renderBlocks } from '../lib/blocks.mjs';
import { articleLd, breadcrumbLd, collectionLd, personPageLd, projectLd, websiteLd } from '../lib/seo.mjs';
import { esc } from '../core/text.mjs';
import { overrideClasses } from '../core/typography.mjs';
import { iconSvg } from '../core/icons.mjs';
import {
  articleCard, breadcrumbs, emptyState, image, itemCard, pageHeader, pagination, projectCard, ratioClass, tagList, topicColorClass, topicTile,
} from './components.mjs';
import { renderPage } from './layout.mjs';
import { searchPage, searchUrl } from './search-page.mjs';

/** What a page renderer needs for one language. */
function pageContext(model, L, assets) {
  // What blocks may ask of the site. Related items and the author come from the *public* views only,
  // so a block can never reveal a draft.
  const blockCtx = {
    lang: L.lang,
    media: model.mediaView,
    t: L.i18n.t,
    item: (kind, id) => {
      const found = (kind === 'project' ? L.projects : L.articles).find((x) => x.id === id);
      return found ? { title: found.title, excerpt: found.excerpt ?? found.summary ?? '', url: found.url } : null;
    },
    author: () => (L.profile ? { name: L.profile.name, headline: L.profile.headline, summary: L.profile.summary, photo: L.profile.photo, url: L.pageUrl.about } : null),
  };
  return { model, L, i18n: L.i18n, blockCtx, assets };
}

/** The full HTML of one article or project page, or null when it is not public in that language. */
/** The site's own pages that can be previewed without choosing a record (used by the Appearance Studio and the Homepage Builder). */
export const PREVIEW_PAGES = { home: homePage, about: aboutPage, blog: blogIndex, portfolio: portfolioIndex, topics: topicsIndex, tags: tagsIndex };

export function previewPage(model, assets, { kind, id, lang }) {
  const L = model.langs[lang];
  if (!L) return null;
  const ctx = pageContext(model, L, assets);
  if (PREVIEW_PAGES[kind]) return renderPage(model, L, PREVIEW_PAGES[kind](ctx), assets);
  if (kind === 'topic' || kind === 'tag') {
    const found = (kind === 'topic' ? L.topics : L.tags).find((x) => x.id === id);
    return found ? renderPage(model, L, (kind === 'topic' ? topicPage : tagPage)(ctx, found), assets) : null;
  }
  const item = (kind === 'project' ? L.projects : L.articles).find((x) => x.id === id);
  if (!item) return null;
  return renderPage(model, L, kind === 'project' ? projectPage(ctx, item) : articlePage(ctx, item), assets);
}

export function generatePages(model, assets) {
  const pages = [];
  for (const L of Object.values(model.langs)) {
    const ctx = pageContext(model, L, assets);
    const add = (spec) => {
      const html = renderPage(model, L, spec, assets);
      pages.push({
        segs: spec.segs,
        html,
        entry: spec.noindex ? null : { url: spec.url, lastmod: spec.lastmod ?? model.site.updatedAt, alternates: spec.alternates ?? { [L.lang]: spec.url } },
      });
    };

    add(homePage(ctx));
    add(aboutPage(ctx));
    for (const spec of blogPages(ctx)) add(spec);
    for (const a of L.articles) add(articlePage(ctx, a));
    for (const spec of portfolioPages(ctx)) add(spec);
    for (const p of L.projects) add(projectPage(ctx, p));
    add(topicsIndex(ctx));
    for (const t of L.topics) add(topicPage(ctx, t));
    add(tagsIndex(ctx));
    for (const t of L.tags) add(tagPage(ctx, t));
    if (L.searchEnabled && assets.searchJs) add(searchPage(ctx, assets));
    add(contactPage(ctx));
    // Old addresses of renamed or merged topics and tags: a small page that sends the visitor on.
    for (const r of L.redirects) pages.push({ segs: r.segs, html: redirectPage(model, L, r), entry: null });
  }
  return pages;
}

/** A static "this page moved" page: a meta refresh plus a canonical link and a visible link, never indexed. */
function redirectPage(model, L, r) {
  const { i18n } = L;
  return `<!doctype html>
<html lang="${esc(L.lang)}" dir="${esc(L.dir)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(i18n.t('moved_title'))} — ${esc(L.siteName)}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(model.absolute(r.to))}">
<meta http-equiv="refresh" content="0; url=${esc(r.to)}">
</head>
<body>
<h1>${esc(i18n.t('moved_title'))}</h1>
<p>${esc(i18n.t('moved_text'))} <a href="${esc(r.to)}">${esc(r.name)}</a></p>
</body>
</html>
`;
}

const homeCrumb = ({ L, i18n }) => ({ label: i18n.t('home'), url: L.homeUrl });

function socialImage(model) {
  return model.site.socialImageMediaId ? model.mediaView(model.site.socialImageMediaId, model.defaultLang) : null;
}

function indexSpec(ctx, key, { title, intro, main, items, lastmod, page = 1, pages = 1 }) {
  const { model, L, i18n } = ctx;
  const segsOf = (n) => (n === 1 ? [L.lang, L.routes[key]] : [L.lang, L.routes[key], 'page', String(n)]);
  const urlOf = (n) => (n === 1 ? L.pageUrl[key] : model.urlFor(segsOf(n)));
  const url = urlOf(page);
  const trail = [homeCrumb(ctx), { label: title, url: L.pageUrl[key] }];
  const heading = page > 1 ? `${title} — ${i18n.t('page_n', { n: i18n.number(page) })}` : title;
  return {
    kind: key, segs: segsOf(page), url, currentPage: key === 'tags' ? 'topics' : key,
    title: heading, description: intro, alternates: page === 1 ? model.alternatesFor(key) : { [L.lang]: url }, switcher: model.alternatesFor(key), lastmod,
    main: `${pageHeader({ title, intro, trailHtml: breadcrumbs(i18n, trail) })}\n${main}\n${pagination(i18n, { page, pages, urlOf })}`,
    jsonld: [collectionLd(model, L, { name: heading, description: intro, url, items: items ?? [] }), breadcrumbLd(model, trail)],
  };
}

/** A list that is split into pages of `search.pageSize` items (one page when there are few items). */
function listPages(ctx, key, { title, intro, items, card, empty }) {
  const { model, i18n } = ctx;
  const size = model.search.pageSize;
  const pages = Math.max(1, Math.ceil(items.length / size));
  return Array.from({ length: pages }, (_, i) => {
    const slice = items.slice(i * size, (i + 1) * size);
    const main = slice.length
      ? `<div class="container"><div class="grid">${slice.map((x) => card(x, i18n)).join('')}</div></div>`
      : `<div class="container">${emptyState(i18n.t(empty))}</div>`;
    return indexSpec(ctx, key, { title, intro, main, items: slice, page: i + 1, pages });
  });
}

// ---------------------------------------------------------------- home

function homePage({ model, L, i18n }) {
  const sections = L.home.map((s) => homeSection(model, L, i18n, s)).join('\n');
  const main = `<h1 class="visually-hidden">${esc(L.siteName)} — ${esc(L.tagline)}</h1>\n${sections || `<div class="container">${emptyState(i18n.t('no_articles'))}</div>`}`;
  return {
    kind: 'home', segs: [L.lang], url: L.homeUrl, currentPage: 'home', title: L.siteName, description: L.description,
    alternates: model.alternatesFor('home'), ogImage: socialImage(model), main, jsonld: [websiteLd(model, L)],
  };
}

function sectionHead(s, moreUrl, moreLabel) {
  return `<div class="section__head"><h2 id="${esc(s.id)}">${esc(s.title)}</h2>${moreUrl ? `<a class="section__more" href="${esc(moreUrl)}">${esc(moreLabel)}</a>` : ''}</div>${s.intro ? `<p class="section__intro">${esc(s.intro)}</p>` : ''}`;
}

function homeSection(model, L, i18n, s) {
  const wrap = (inner, cls = '') => `<section class="section section--${s.type} space-${s.spacing} ${cls}" aria-labelledby="${esc(s.id)}"><div class="container">${inner}</div></section>`;

  if (s.type === 'featured') return featured(L, i18n, s);

  if (s.type === 'articles') {
    const ratio = s.imageRatio;
    let body;
    if (s.layout === 'editorial' && s.items.length > 1) {
      const [lead, ...rest] = s.items;
      body = `<div class="editorial-grid">${articleCard(lead, i18n, { ratio: '16:9', variant: 'lead' })}<div class="editorial-grid__side">${rest.map((a) => articleCard(a, i18n, { ratio, variant: 'row' })).join('')}</div></div>`;
    } else if (s.layout === 'list') {
      body = `<div class="stack">${s.items.map((a) => articleCard(a, i18n, { ratio, variant: 'row' })).join('')}</div>`;
    } else {
      body = `<div class="grid">${s.items.map((a) => articleCard(a, i18n, { ratio })).join('')}</div>`;
    }
    return wrap(sectionHead(s, L.pageUrl.blog, i18n.t('all_articles')) + body);
  }

  if (s.type === 'projects') {
    const body = s.layout === 'list'
      ? `<div class="stack">${s.items.map((p) => projectCard(p, i18n, { ratio: s.imageRatio, variant: 'row' })).join('')}</div>`
      : `<div class="grid">${s.items.map((p) => projectCard(p, i18n, { ratio: s.imageRatio })).join('')}</div>`;
    return wrap(sectionHead(s, L.pageUrl.portfolio, i18n.t('all_projects')) + body);
  }

  if (s.type === 'topics') {
    return wrap(sectionHead(s, L.pageUrl.topics, i18n.t('all_topics')) + `<div class="grid">${s.items.map((t) => topicTile(t, i18n)).join('')}</div>`);
  }

  if (s.type === 'highlights') {
    const entry = (e) => `<li><p class="entry__title">${esc(e.title)}</p><p class="entry__org">${esc(e.organization)}</p><p class="meta">${esc(i18n.yearMonth(e.startDate))} – ${esc(e.endDate ? i18n.yearMonth(e.endDate) : i18n.t('present'))}</p></li>`;
    const cols = [];
    if (s.experience.length) cols.push(`<div class="col"><h3>${esc(i18n.t('experience'))}</h3><ul class="entries">${s.experience.map(entry).join('')}</ul></div>`);
    if (s.education.length) cols.push(`<div class="col"><h3>${esc(i18n.t('education'))}</h3><ul class="entries">${s.education.map(entry).join('')}</ul></div>`);
    if (s.skills.length) cols.push(`<div class="col"><h3>${esc(i18n.t('skills'))}</h3><ul class="chips chips--static">${s.skills.map((k) => `<li>${esc(k.name)}</li>`).join('')}</ul></div>`);
    return wrap(sectionHead(s, L.pageUrl.about, i18n.t('about')) + `<div class="columns">${cols.join('')}</div>`);
  }

  if (s.type === 'follow') {
    return wrap(`${sectionHead(s)}<ul class="link-list">${s.links.map((l) => `<li><a class="button button--ghost" href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul>`, 'section--follow');
  }
  throw new Error(`Unknown homepage section type "${s.type}"`);
}

function featured(L, i18n, s) {
  const item = s.item;
  const isProject = item.kind === 'project';
  const text = isProject ? item.summary : item.excerpt;
  const label = isProject ? i18n.t('view_project') : i18n.t('read_more');
  const meta = isProject
    ? (item.projectStatus ? `<p class="meta"><span>${esc(i18n.t(`project_status_${item.projectStatus}`))}</span></p>` : '')
    : `<p class="meta"><time datetime="${esc(item.publishedAt)}">${esc(i18n.date(item.publishedAt))}</time><span aria-hidden="true" class="dot">·</span><span>${esc(i18n.t('min_read', { n: i18n.number(item.readingMinutes) }))}</span></p>`;
  const badge = item.sample ? `<p class="meta"><span class="badge">${esc(i18n.t('sample_label'))}</span></p>` : '';
  const layout = s.layout === 'overlay' ? 'overlay' : 'split';
  const media = item.cover ? `<a class="hero__media ${ratioClass(s.imageRatio)}" href="${esc(item.url)}" tabindex="-1" aria-hidden="true">${image(item.cover, { eager: true })}</a>` : '';
  return `<section class="hero hero--${layout}${item.cover ? '' : ' hero--noimage'}" aria-label="${esc(s.title)}">
  <div class="container hero__inner">
    ${media}
    <div class="hero__panel">
      ${item.primaryTopic ? `<p class="eyebrow"><a href="${esc(item.primaryTopic.url)}">${esc(item.primaryTopic.name)}</a></p>` : ''}
      <h2 class="hero__title"><a href="${esc(item.url)}">${esc(item.title)}</a></h2>
      <p class="hero__text">${esc(text)}</p>
      ${meta}${badge}
      <a class="button" href="${esc(item.url)}">${esc(label)}</a>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------- about / contact

function aboutPage({ model, L, i18n, blockCtx }) {
  const p = L.profile;
  const url = L.pageUrl.about;
  const trail = [homeCrumb({ L, i18n }), { label: i18n.t('about'), url }];
  const entryHtml = (e) => `<li><p class="entry__title">${esc(e.title)}</p><p class="entry__org">${esc(e.organization)}</p><p class="meta">${esc(i18n.yearMonth(e.startDate))} – ${esc(e.endDate ? i18n.yearMonth(e.endDate) : i18n.t('present'))}</p>${e.summary ? `<p>${esc(e.summary)}</p>` : ''}</li>`;
  const sections = [];
  if (p.biography.length) sections.push(`<section class="prose" id="biography">${renderBlocks(p.biography, blockCtx)}</section>`);
  if (p.experience.length) sections.push(`<section class="profile-section" id="experience"><h2>${esc(i18n.t('experience'))}</h2><ol class="timeline">${p.experience.map(entryHtml).join('')}</ol></section>`);
  if (p.education.length) sections.push(`<section class="profile-section" id="education"><h2>${esc(i18n.t('education'))}</h2><ol class="timeline">${p.education.map(entryHtml).join('')}</ol></section>`);
  if (p.skills.length) sections.push(`<section class="profile-section" id="skills"><h2>${esc(i18n.t('skills'))}</h2><ul class="chips chips--static">${p.skills.map((k) => `<li>${esc(k.name)}</li>`).join('')}</ul></section>`);
  for (const c of p.customSections) sections.push(`<section class="profile-section" id="section-${esc(c.id)}"><h2>${esc(c.title)}</h2><div class="prose">${renderBlocks(c.body, blockCtx)}</div></section>`);

  const photo = p.photo ? `<div class="profile-photo">${image(p.photo, { eager: true })}</div>` : '';
  const main = `<header class="page-header container">${breadcrumbs(i18n, trail)}<h1>${esc(p.name)}</h1><p class="page-header__intro">${esc(p.headline)}</p><p class="page-header__summary">${esc(p.summary)}</p>${photo}</header>
<div class="container container--narrow stack-lg">${sections.join('\n')}</div>`;
  return {
    kind: 'about', segs: [L.lang, L.routes.about], url, currentPage: 'about', title: i18n.t('about'),
    description: p.summary, alternates: model.alternatesFor('about'), ogImage: p.photo,
    main, jsonld: [personPageLd(model, L, p.photo?.isRaster ? p.photo.absoluteUrl : null), breadcrumbLd(model, trail)],
  };
}

function contactPage({ model, L, i18n }) {
  const links = L.profile?.links ?? [];
  const main = links.length
    ? `<div class="container container--narrow"><p>${esc(i18n.t('contact_intro'))}</p><ul class="link-list link-list--stack">${links.map((l) => `<li><a class="button button--ghost" href="${esc(l.url)}"${l.kind === 'email' ? '' : ' rel="noopener"'}>${esc(l.label)}</a></li>`).join('')}</ul></div>`
    : `<div class="container container--narrow">${emptyState(i18n.t('contact_none'))}</div>`;
  return indexSpec({ model, L, i18n }, 'contact', { title: i18n.t('contact'), intro: i18n.t('contact_intro'), main });
}

// ---------------------------------------------------------------- blog

function blogPages(ctx) {
  const { L, i18n } = ctx;
  return listPages(ctx, 'blog', { title: i18n.t('blog'), intro: i18n.t('blog_intro'), items: L.articles, card: articleCard, empty: 'no_articles' });
}
function blogIndex(ctx) { return blogPages(ctx)[0]; }

function articlePage({ model, L, i18n, blockCtx }, a) {
  const trail = [homeCrumb({ L, i18n }), { label: i18n.t('blog'), url: L.pageUrl.blog }, { label: a.title, url: a.url }];
  const updatedDiffers = i18n.date(a.updatedAt) !== i18n.date(a.publishedAt);
  const meta = [
    a.author ? `<span>${esc(i18n.t('by', { name: a.author }))}</span>` : '',
    `<time datetime="${esc(a.publishedAt)}">${esc(i18n.t('published_on', { date: i18n.date(a.publishedAt) }))}</time>`,
    updatedDiffers ? `<time datetime="${esc(a.updatedAt)}">${esc(i18n.t('updated_on', { date: i18n.date(a.updatedAt) }))}</time>` : '',
    `<span>${esc(i18n.t('min_read', { n: i18n.number(a.readingMinutes) }))}</span>`,
    a.sample ? `<span class="badge">${esc(i18n.t('sample_label'))}</span>` : '',
  ].filter(Boolean).join('<span aria-hidden="true" class="dot">·</span>');

  const topics = a.topics.length ? `<p class="eyebrow">${a.topics.map((t) => `<a href="${esc(t.url)}">${esc(t.name)}</a>`).join('<span aria-hidden="true" class="dot">·</span>')}</p>` : '';
  const cover = a.cover ? `<figure class="article__cover container">${image(a.cover, { eager: true })}</figure>` : '';

  const relatedArticles = a.relatedArticles.length
    ? `<section class="related" aria-labelledby="rel-a"><h2 id="rel-a">${esc(i18n.t('related_articles'))}</h2><div class="grid">${a.relatedArticles.map((r) => articleCard(r, i18n, { headingLevel: 3 })).join('')}</div></section>` : '';
  const relatedProjects = a.relatedProjects.length
    ? `<section class="related" aria-labelledby="rel-p"><h2 id="rel-p">${esc(i18n.t('related_projects'))}</h2><div class="grid">${a.relatedProjects.map((r) => projectCard(r, i18n, { headingLevel: 3 })).join('')}</div></section>` : '';

  const main = `<article class="article article--${esc(a.template)}${overrideClasses(a.typography)}">
  <header class="article__header container container--narrow">
    ${breadcrumbs(i18n, trail)}
    ${topics}
    <h1>${esc(a.title)}</h1>
    ${a.subtitle ? `<p class="standfirst">${esc(a.subtitle)}</p>` : ''}
    <p class="meta byline">${meta}</p>
  </header>
  ${cover}
  <div class="container">
    <div class="prose">${renderBlocks(a.body, blockCtx)}</div>
    ${a.tags.length ? `<footer class="article__footer">${tagList(a.tags)}</footer>` : ''}
  </div>
</article>
${relatedArticles || relatedProjects ? `<div class="container">${relatedArticles}${relatedProjects}</div>` : ''}`;

  return {
    kind: 'article', segs: a.segs, url: a.url, currentPage: 'blog', title: a.seo.title ?? a.title,
    description: a.seo.description ?? a.excerpt, alternates: a.alternates, ogImage: a.cover, ogType: 'article',
    canonicalUrl: a.seo.canonicalUrl, robots: a.seo.robots, lastmod: a.updatedAt, main,
    jsonld: [articleLd(model, L, a), breadcrumbLd(model, trail)],
  };
}

// ---------------------------------------------------------------- portfolio

function portfolioPages(ctx) {
  const { L, i18n } = ctx;
  return listPages(ctx, 'portfolio', { title: i18n.t('portfolio'), intro: i18n.t('portfolio_intro'), items: L.projects, card: projectCard, empty: 'no_projects' });
}
function portfolioIndex(ctx) { return portfolioPages(ctx)[0]; }

function projectPage({ model, L, i18n, blockCtx }, p) {
  const trail = [homeCrumb({ L, i18n }), { label: i18n.t('portfolio'), url: L.pageUrl.portfolio }, { label: p.title, url: p.url }];
  const period = p.startDate
    ? `${i18n.dateOnly(p.startDate)} – ${p.endDate ? i18n.dateOnly(p.endDate) : i18n.t('present')}`
    : '';
  const facts = [
    p.role ? [i18n.t('role'), esc(p.role)] : null,
    period ? [i18n.t('period'), esc(period)] : null,
    p.projectStatus ? [i18n.t('status'), esc(i18n.t(`project_status_${p.projectStatus}`))] : null,
    p.tools.length ? [i18n.t('tools'), `<ul class="chips chips--static">${p.tools.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`] : null,
    p.responsibilities.length ? [i18n.t('responsibilities'), `<ul class="plain-list">${p.responsibilities.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`] : null,
  ].filter(Boolean);

  const story = [['challenge', p.challenge], ['process', p.process], ['solution', p.solution], ['outcome', p.outcome]]
    .filter(([, paras]) => paras.length)
    .map(([key, paras]) => `<section class="case-section"><h2>${esc(i18n.t(key))}</h2>${paras.map((t) => `<p>${esc(t)}</p>`).join('')}</section>`).join('');

  const gallery = p.gallery.length
    ? `<section class="gallery" aria-label="${esc(i18n.t('image_of'))}">${p.gallery.map((g) => `<figure class="figure figure--wide">${image(g)}${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</section>` : '';
  const links = p.links.length
    ? `<section class="case-section"><h2>${esc(i18n.t('links'))}</h2><ul class="plain-list">${p.links.map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join('')}</ul></section>` : '';
  const relatedArticles = p.relatedArticles.length
    ? `<section class="related" aria-labelledby="rel-a"><h2 id="rel-a">${esc(i18n.t('related_writing'))}</h2><div class="grid">${p.relatedArticles.map((r) => articleCard(r, i18n)).join('')}</div></section>` : '';
  const relatedProjects = p.relatedProjects.length
    ? `<section class="related" aria-labelledby="rel-p"><h2 id="rel-p">${esc(i18n.t('related_projects'))}</h2><div class="grid">${p.relatedProjects.map((r) => projectCard(r, i18n)).join('')}</div></section>` : '';

  const main = `<article class="project${overrideClasses(p.typography)}">
  <header class="article__header container container--narrow">
    ${breadcrumbs(i18n, trail)}
    ${p.topics.length ? `<p class="eyebrow">${p.topics.map((t) => `<a href="${esc(t.url)}">${esc(t.name)}</a>`).join('<span aria-hidden="true" class="dot">·</span>')}</p>` : ''}
    <h1>${esc(p.title)}</h1>
    ${p.subtitle ? `<p class="standfirst">${esc(p.subtitle)}</p>` : ''}
    <p class="lead">${esc(p.summary)}</p>
    ${p.sample ? `<p class="meta"><span class="badge">${esc(i18n.t('sample_label'))}</span></p>` : ''}
  </header>
  ${p.cover ? `<figure class="article__cover container">${image(p.cover, { eager: true })}</figure>` : ''}
  <div class="container">
    ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
    <div class="prose">${story}${p.body.length ? renderBlocks(p.body, blockCtx) : ''}${links}</div>
    ${p.tags.length ? `<footer class="article__footer">${tagList(p.tags)}</footer>` : ''}
  </div>
  ${gallery ? `<div class="container">${gallery}</div>` : ''}
</article>
${relatedArticles || relatedProjects ? `<div class="container">${relatedArticles}${relatedProjects}</div>` : ''}`;

  return {
    kind: 'project', segs: p.segs, url: p.url, currentPage: 'portfolio', title: p.seo.title ?? p.title,
    description: p.seo.description ?? p.summary, alternates: p.alternates, ogImage: p.cover, ogType: 'article',
    canonicalUrl: p.seo.canonicalUrl, robots: p.seo.robots, lastmod: p.updatedAt, main,
    jsonld: [projectLd(model, L, p), breadcrumbLd(model, trail)],
  };
}

// ---------------------------------------------------------------- topics & tags

function topicsIndex(ctx) {
  const { L, i18n } = ctx;
  const roots = L.topics.filter((t) => !t.parent);
  const main = roots.length
    ? `<div class="container"><div class="grid">${roots.map((t) => topicTile(t, i18n)).join('')}</div></div>`
    : `<div class="container">${emptyState(i18n.t('no_topics'))}</div>`;
  return indexSpec(ctx, 'topics', { title: i18n.t('topics'), intro: i18n.t('topics_intro'), main, items: roots.map((t) => ({ name: t.name, url: t.url })) });
}

const seoImage = (model, L, seo, fallback) => (seo.ogMediaId ? model.mediaView(seo.ogMediaId, L.lang) : fallback ?? null);

function chipList(items) {
  return `<ul class="chips">${items.map((x) => `<li><a href="${esc(x.url)}">${esc(x.name)}</a></li>`).join('')}</ul>`;
}

/** A section of cards, at most `size` of them, with a link to the full list in search when there are more. */
function cappedSection(ctx, { id, heading, items, total, link }) {
  const { model, i18n } = ctx;
  if (!items.length) return '';
  const size = model.search.pageSize;
  const shown = items.slice(0, size);
  const more = link && items.length > size
    ? `<p class="section__more-wrap"><a class="section__more" href="${esc(link)}">${esc(i18n.t('search_show_all', { n: i18n.number(total) }))}</a></p>` : '';
  return `<section class="related" aria-labelledby="${id}"><h2 id="${id}">${esc(heading)}</h2><div class="grid">${shown.map((x) => itemCard(x, i18n)).join('')}</div>${more}</section>`;
}

function topicPage(ctx, t) {
  const { model, L, i18n } = ctx;
  const trail = [homeCrumb(ctx), { label: i18n.t('topics'), url: L.pageUrl.topics }];
  if (t.parent) trail.push({ label: t.parent.name, url: t.parent.url });
  trail.push({ label: t.name, url: t.url });

  const pinnedIds = new Set(t.pinned.map((x) => x.id));
  const articles = t.articles.filter((x) => !pinnedIds.has(x.id));
  const projects = t.projects.filter((x) => !pinnedIds.has(x.id));
  const link = (type) => (L.searchEnabled ? searchUrl(L, { topic: t.id, type }) : null);
  const tagCounts = new Map();
  for (const item of [...t.articles, ...t.projects]) for (const tag of item.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const popular = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).slice(0, 8).map(([tag]) => tag);

  const sections = [
    t.pinned.length ? `<section class="related" aria-labelledby="t-pin"><h2 id="t-pin">${esc(i18n.t('start_here'))}</h2><div class="grid">${t.pinned.map((x) => itemCard(x, i18n)).join('')}</div></section>` : '',
    t.children.length ? `<section class="related"><h2>${esc(i18n.t('subtopics'))}</h2>${chipList(t.children)}</section>` : '',
    cappedSection(ctx, { id: 't-a', heading: i18n.t('articles_in'), items: articles, total: t.articles.length, link: link('article') }),
    cappedSection(ctx, { id: 't-p', heading: i18n.t('projects_in'), items: projects, total: t.projects.length, link: link('project') }),
    popular.length ? `<section class="related"><h2>${esc(i18n.t('search_popular_tags'))}</h2>${chipList(popular)}</section>` : '',
    t.related.length ? `<section class="related"><h2>${esc(i18n.t('related_topics'))}</h2>${chipList(t.related)}</section>` : '',
    L.searchEnabled ? `<p class="topic-search"><a class="button button--ghost" href="${esc(searchUrl(L, { topic: t.id }))}">${esc(i18n.t('search_in_topic'))}</a></p>` : '',
  ].join('');

  const icon = t.icon ? `<span class="topic-icon">${iconSvg(t.icon, { size: 20 })}</span>` : '';
  const main = `<div class="topic-scope${topicColorClass(t)}">${pageHeader({ title: t.name, intro: t.description, trailHtml: breadcrumbs(i18n, trail), eyebrowHtml: `<p class="eyebrow">${icon}${esc(i18n.t('topic'))}</p>` })}
<div class="container">${sections}</div></div>`;
  const alternates = {};
  for (const other of model.languages) {
    const o = model.langs[other.code].topics.find((x) => x.id === t.id);
    if (o && (other.code === L.lang ? true : o.seo.robots !== 'noindex')) alternates[other.code] = o.url;
  }
  return {
    kind: 'topic', segs: t.segs, url: t.url, currentPage: 'topics', title: t.seo.title ?? t.name, description: t.seo.description ?? t.description,
    alternates, main, canonicalUrl: t.seo.canonicalUrl, robots: t.seo.robots, noindex: t.seo.robots === 'noindex',
    ogImage: seoImage(model, L, t.seo, t.media),
    jsonld: [collectionLd(model, L, { name: t.name, description: t.description, url: t.url, items: [...t.pinned, ...articles, ...projects] }), breadcrumbLd(model, trail)],
  };
}

function tagsIndex(ctx) {
  const { L, i18n } = ctx;
  const main = L.tags.length
    ? `<div class="container"><ul class="chips chips--large">${L.tags.map((t) => `<li><a href="${esc(t.url)}">${esc(t.name)} <span class="chip__count">${esc(i18n.number(t.count))}</span></a></li>`).join('')}</ul></div>`
    : `<div class="container">${emptyState(i18n.t('no_topics'))}</div>`;
  return indexSpec(ctx, 'tags', { title: i18n.t('tags'), intro: i18n.t('tags_intro'), main, items: L.tags.map((t) => ({ name: t.name, url: t.url })) });
}

function tagPage(ctx, t) {
  const { model, L, i18n } = ctx;
  const trail = [homeCrumb(ctx), { label: i18n.t('tags'), url: L.pageUrl.tags }, { label: t.name, url: t.url }];
  const link = (type) => (L.searchEnabled ? searchUrl(L, { tag: t.id, type }) : null);
  const aliases = t.aliases.length ? `<p class="page-header__summary">${esc(i18n.t('also_known_as'))}: ${esc(t.aliases.join(' · '))}</p>` : '';
  const sections = [
    cappedSection(ctx, { id: 'g-a', heading: i18n.t('articles_in'), items: t.articles, total: t.articles.length, link: link('article') }),
    cappedSection(ctx, { id: 'g-p', heading: i18n.t('projects_in'), items: t.projects, total: t.projects.length, link: link('project') }),
    t.related.length ? `<section class="related"><h2>${esc(i18n.t('related_tags'))}</h2>${chipList(t.related)}</section>` : '',
    L.searchEnabled ? `<p class="topic-search"><a class="button button--ghost" href="${esc(searchUrl(L, { tag: t.id }))}">${esc(i18n.t('search_in_tag'))}</a></p>` : '',
  ].join('');
  const main = `${pageHeader({ title: t.name, intro: t.description, trailHtml: breadcrumbs(i18n, trail), eyebrowHtml: `<p class="eyebrow">${esc(i18n.t('tagged'))}</p>` })}
${aliases ? `<div class="container">${aliases}</div>` : ''}
<div class="container">${sections}</div>`;
  const alternates = {};
  for (const other of model.languages) {
    const o = model.langs[other.code].tags.find((x) => x.id === t.id);
    if (o && (other.code === L.lang ? true : o.seo.robots !== 'noindex')) alternates[other.code] = o.url;
  }
  const description = t.seo.description ?? (t.description || `${t.name} — ${L.siteName}`);
  return {
    kind: 'tag', segs: t.segs, url: t.url, currentPage: 'topics', title: t.seo.title ?? t.name, description, alternates, main,
    canonicalUrl: t.seo.canonicalUrl, robots: t.seo.robots, noindex: t.seo.robots === 'noindex', ogImage: seoImage(model, L, t.seo, null),
    jsonld: [collectionLd(model, L, { name: t.name, description: t.description || undefined, url: t.url, items: [...t.articles, ...t.projects] }), breadcrumbLd(model, trail)],
  };
}
