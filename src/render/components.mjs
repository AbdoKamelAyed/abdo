// Reusable fragments shared by several pages.

import { focalClass } from '../core/focal.mjs';
import { iconSvg } from '../core/icons.mjs';
import { esc } from '../core/text.mjs';

export const ratioClass = (ratio) => `ratio-${String(ratio).replace(':', '-')}`;

export function image(asset, { eager = false } = {}) {
  if (!asset) return '';
  const dims = asset.width && asset.height ? ` width="${asset.width}" height="${asset.height}"` : '';
  const loading = eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
  const focal = focalClass(asset.focal);
  return `<img${focal ? ` class="${focal}"` : ''} src="${esc(asset.url)}" alt="${esc(asset.alt)}"${dims} ${loading}>`;
}

function timeTag(item, i18n) {
  return `<time datetime="${esc(item.publishedAt)}">${esc(i18n.date(item.publishedAt))}</time>`;
}

function sampleBadge(item, i18n) {
  return item.sample ? `<span class="badge">${esc(i18n.t('sample_label'))}</span>` : '';
}

function eyebrow(item) {
  return item.primaryTopic ? `<p class="eyebrow"><a href="${esc(item.primaryTopic.url)}">${esc(item.primaryTopic.name)}</a></p>` : '';
}

/** @param {'card'|'row'} variant */
export function articleCard(item, i18n, { ratio = '3:2', variant = 'card', headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  const media = item.cover
    ? `<a class="card__media ${ratioClass(ratio)}" href="${esc(item.url)}" tabindex="-1" aria-hidden="true">${image(item.cover)}</a>`
    : '';
  return `<article class="card card--${variant}${item.cover ? '' : ' card--text'}">
  ${media}
  <div class="card__body">
    ${eyebrow(item)}
    <${h} class="card__title"><a href="${esc(item.url)}">${esc(item.title)}</a></${h}>
    <p class="card__excerpt">${esc(item.excerpt)}</p>
    <p class="meta">${timeTag(item, i18n)}<span aria-hidden="true" class="dot">·</span><span>${esc(i18n.t('min_read', { n: i18n.number(item.readingMinutes) }))}</span>${sampleBadge(item, i18n)}</p>
  </div>
</article>`;
}

export function projectCard(item, i18n, { ratio = '4:3', variant = 'card', headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  const media = item.cover
    ? `<a class="card__media ${ratioClass(ratio)}" href="${esc(item.url)}" tabindex="-1" aria-hidden="true">${image(item.cover)}</a>`
    : '';
  const status = item.projectStatus ? `<span>${esc(i18n.t(`project_status_${item.projectStatus}`))}</span>` : '';
  return `<article class="card card--${variant} card--project${item.cover ? '' : ' card--text'}">
  ${media}
  <div class="card__body">
    ${eyebrow(item)}
    <${h} class="card__title"><a href="${esc(item.url)}">${esc(item.title)}</a></${h}>
    <p class="card__excerpt">${esc(item.summary)}</p>
    <p class="meta">${status}${status && item.sample ? '<span aria-hidden="true" class="dot">·</span>' : ''}${sampleBadge(item, i18n)}</p>
  </div>
</article>`;
}

/** The class that carries a topic's accent colour (the rule is generated at build time, see src/lib/topic-colors.mjs). */
export const topicColorClass = (topic) => (topic.color ? ` topic-c-${topic.color.slice(1)}` : '');

export function topicTile(topic, i18n, headingLevel = 3) {
  const h = `h${headingLevel}`;
  const n = topic.articles.length;
  const m = topic.projects.length;
  const counts = [n ? i18n.plural('articles_count', n) : '', m ? i18n.plural('projects_count', m) : ''].filter(Boolean).join(' · ');
  const icon = topic.icon ? `<span class="topic-icon">${iconSvg(topic.icon, { size: 22 })}</span>` : '';
  return `<article class="card card--topic${topicColorClass(topic)}">
  <div class="card__body">
    ${icon}
    <${h} class="card__title"><a href="${esc(topic.url)}">${esc(topic.name)}</a></${h}>
    <p class="card__excerpt">${esc(topic.description)}</p>
    <p class="meta">${esc(counts)}</p>
    ${topic.children?.length ? `<ul class="chips">${topic.children.map((c) => `<li><a href="${esc(c.url)}">${esc(c.name)}</a></li>`).join('')}</ul>` : ''}
  </div>
</article>`;
}

/** A card for whatever the item is (article or project). */
export const itemCard = (item, i18n, options) => (item.kind === 'project' ? projectCard(item, i18n, options) : articleCard(item, i18n, options));

/** Previous / numbered / next links between the pages of a list. `urlOf(n)` is the address of page n. */
export function pagination(i18n, { page, pages, urlOf }) {
  if (pages <= 1) return '';
  const link = (n, label, rel) => `<a href="${esc(urlOf(n))}"${rel ? ` rel="${rel}"` : ''}${n === page ? ' aria-current="page"' : ''}>${label}</a>`;
  const numbers = [];
  for (let n = 1; n <= pages; n += 1) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) numbers.push(n);
    else if (numbers.at(-1) !== '…') numbers.push('…');
  }
  const items = numbers.map((n) => (n === '…' ? '<li aria-hidden="true">…</li>' : `<li>${link(n, esc(i18n.number(n)))}</li>`)).join('');
  return `<nav class="pagination container" aria-label="${esc(i18n.t('nav_pages'))}"><ul>
${page > 1 ? `<li class="pagination__step">${link(page - 1, esc(i18n.t('page_prev')), 'prev')}</li>` : ''}${items}${page < pages ? `<li class="pagination__step">${link(page + 1, esc(i18n.t('page_next')), 'next')}</li>` : ''}
</ul></nav>`;
}

export function breadcrumbs(i18n, trail) {
  const items = trail.map((crumb, i) => (i === trail.length - 1
    ? `<li aria-current="page">${esc(crumb.label)}</li>`
    : `<li><a href="${esc(crumb.url)}">${esc(crumb.label)}</a></li>`)).join('');
  return `<nav class="breadcrumb" aria-label="${esc(i18n.t('nav_breadcrumb'))}"><ol>${items}</ol></nav>`;
}

export function tagList(tags) {
  if (!tags.length) return '';
  return `<ul class="chips">${tags.map((t) => `<li><a href="${esc(t.url)}">${esc(t.name)}</a></li>`).join('')}</ul>`;
}

export function pageHeader({ title, intro, trailHtml = '', eyebrowHtml = '' }) {
  return `<header class="page-header container">
  ${trailHtml}
  ${eyebrowHtml}
  <h1>${esc(title)}</h1>
  ${intro ? `<p class="page-header__intro">${esc(intro)}</p>` : ''}
</header>`;
}

export function emptyState(text) {
  return `<p class="empty">${esc(text)}</p>`;
}
