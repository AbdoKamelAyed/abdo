// Renders what an article or project would look like once published, with the site's own renderer.
//
// The admin shows this in a sandboxed frame, so the author previews the real page (real layout, real
// typography, both languages, light and dark) rather than an approximation. Pure and browser-safe:
// nothing here touches the file system, the network or the DOM.

import { generateGlassCss, generateThemeCss } from '../lib/theme.mjs';
import { buildModel } from '../lib/model.mjs';
import { topicColorCss } from '../lib/topic-colors.mjs';
import { PREVIEW_PAGES, previewPage } from '../render/pages.mjs';

export class PreviewError extends Error {
  /** @param {string} message English text for logs; @param {string|null} code lets the admin show a sentence in its own language */
  constructor(message, code = null) { super(message); this.code = code; }
}

const MEDIA_SCHEME = 'media:';
const MEDIA_PLACEHOLDER = /media:([A-Za-z0-9._%-]+)/g;

/** The generated stylesheets for the content's current design (the same text the build writes). */
export function previewStyles(content) {
  const languages = content.languages.filter((l) => l.enabled);
  const topicCss = topicColorCss(content.topics);
  return {
    // The topic accent colours are generated CSS in the build (appended to base.css); here they go with the theme.
    themeCss: `${generateThemeCss(content.design, content.presets, languages)}${topicCss ? `\n${topicCss}\n` : ''}`,
    glassCss: generateGlassCss(content.design, content.presets),
  };
}

/**
 * @param {object} content  assembled content (workspace.content())
 * @param {{
 *   kind: 'article'|'project'|'topic'|'tag'|'home'|'blog'|'portfolio'|'topics'|'tags'|'about', id?: string (not for whole pages), lang: string,
 *   assets: { themeCss: string, glassCss: string, baseCss: string },
 *   theme?: 'light'|'dark'|'auto',
 *   now?: Date,
 * }} options
 * @returns {{ html: string, files: string[] }} a complete HTML document (no scripts) whose images point at
 *   `media:<file>` placeholders, and the media files the page really uses. The caller loads those files
 *   (saved or still unsaved) and swaps the placeholders with `fillMedia`.
 */
export function renderPreview(content, { kind, id, lang, assets, theme = 'auto', now = new Date() }) {
  // A whole page of the site ('home', 'blog', 'portfolio', 'topics', 'about') is drawn from published content only.
  const isPage = Object.hasOwn(PREVIEW_PAGES, kind);
  const pool = { project: content.projects, topic: content.topics, tag: content.tags }[kind] ?? content.articles;
  const record = isPage ? null : pool.find((r) => r.id === id);
  if (!isPage && !record) throw new PreviewError(`There is no ${kind} "${id}".`);
  if (!isPage && !record.translations?.[lang]) throw new PreviewError(`This ${kind} has no "${lang}" translation to preview.`);

  // Preview the record as if it were published; everything else stays exactly as the site would show it.
  const asPublished = (r) => {
    if (r.id !== id) return r;
    const copy = structuredClone(r);
    copy.status = 'published';
    copy.translations[lang].status = 'published';
    copy.publishedAt ??= now.toISOString();
    copy.updatedAt ??= copy.publishedAt;
    return copy;
  };
  // A topic or tag page is shown whatever its state, so the owner sees it before publishing it.
  const asVisible = (r) => {
    if (r.id !== id) return r;
    const copy = structuredClone(r);
    copy.status = 'published';
    if (kind === 'topic') copy.visibility = 'public'; else delete copy.visibility;
    return copy;
  };
  const forced = isPage ? content : {
    ...content,
    articles: kind === 'article' ? content.articles.map(asPublished) : content.articles,
    projects: kind === 'project' ? content.projects.map(asPublished) : content.projects,
    topics: kind === 'topic' ? content.topics.map(asVisible) : content.topics,
    tags: kind === 'tag' ? content.tags.map(asVisible) : content.tags,
  };

  let html;
  try {
    const model = buildModel(forced, { siteUrl: 'https://preview.invalid/', now, mediaUrl: (asset) => `${MEDIA_SCHEME}${encodeURIComponent(asset.file)}` });
    html = previewPage(model, { ...assets, siteJs: '' }, { kind, id, lang });
  } catch (error) {
    throw new PreviewError(`The page cannot be drawn yet: ${error.message}`);
  }
  if (!html) {
    // The site only builds a topic or tag page once public content in this language is filed under it.
    if (kind === 'topic' || kind === 'tag') throw new PreviewError('This page is built once public content is filed under it.', 'empty-taxonomy');
    throw new PreviewError('The page is not available in this language.');
  }

  const document = html
    .replace(/<script\b[\s\S]*?<\/script>\s*/g, '') // the preview is static; scripts are also blocked by the sandbox
    .replace(/<html\b([^>]*)>/, (_, attrs) => `<html${attrs.replace(/\sdata-theme="[^"]*"/, '')}${theme === 'auto' ? '' : ` data-theme="${theme}"`}>`)
    .replace('<head>', '<head>\n<base target="_blank">');
  const files = [...new Set([...document.matchAll(MEDIA_PLACEHOLDER)].map((m) => decodeURIComponent(m[1])))];
  return { html: document, files };
}

/** Replace the media placeholders with real URLs (`urls`: file name -> URL). Files without a URL get an empty image. */
export function fillMedia(html, urls) {
  return html.replace(MEDIA_PLACEHOLDER, (_, encoded) => {
    const url = urls.get?.(decodeURIComponent(encoded)) ?? urls[decodeURIComponent(encoded)];
    return url && !/["'<>\s]/.test(url) ? url : 'data:,';
  });
}
