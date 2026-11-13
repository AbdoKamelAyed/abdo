// Renders structured content blocks to HTML. Pure functions: block data in, escaped HTML out.
// Runs in the build and in the browser admin (live preview), so it must stay free of Node APIs.

import { focalClass } from '../core/focal.mjs';
import { buildTree, listLevel, listText } from '../core/lists.mjs';
import { esc } from '../core/text.mjs';
import { inline, isSafeUrl, paragraphs, plain } from './markup.mjs';

const PARAGRAPH_STYLES = new Set(['intro', 'lead', 'standfirst', 'caption', 'byline', 'small', 'highlight']);

/**
 * @param {object[]} blocks
 * @param {{
 *   lang: string,
 *   media: (id: string, lang: string, alt?: string) => object|null,
 *   t?: (key: string) => string,
 *   item?: (kind: 'article'|'project', id: string) => ({ title: string, excerpt: string, url: string })|null,
 *   author?: () => ({ name: string, headline: string, summary: string, photo: object|null, url: string })|null,
 * }} ctx
 */
export function renderBlocks(blocks, ctx) {
  const visible = blocks.filter((b) => !b.hidden);
  const notes = visible.find((b) => b.type === 'footnotes');
  const footnotes = new Map((notes?.items ?? []).map((n, i) => [n.key, i + 1]));
  const local = { ...ctx, footnotes, t: ctx.t ?? ((key) => key) };
  return visible.map((b) => renderBlock(b, local)).join('\n');
}

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Class names for the per-block display options (spacing, tone, width). */
function displayClasses(block) {
  const d = block.display ?? {};
  return cx(
    d.spacing && d.spacing !== 'normal' && `space-${d.spacing}`,
    d.tone && d.tone !== 'none' && `tone-${d.tone}`,
    d.width && d.width !== 'normal' && `w-${d.width}`,
  );
}

/** ` class="…" dir="…"` for an element, from its own classes plus the block's display options. */
function attrs(block, ...own) {
  const cls = cx(...own, displayClasses(block));
  return `${cls ? ` class="${esc(cls)}"` : ''}${block.dir ? ` dir="${esc(block.dir)}"` : ''}`;
}

const textAlignClass = (block) => (block.align && block.align !== 'start' ? `ta-${block.align}` : '');

/** A figure. `captionHtml` must already be escaped HTML (the caller runs the text through inline()). */
function figure(asset, { captionHtml = '', className }) {
  const dims = asset.width && asset.height ? ` width="${asset.width}" height="${asset.height}"` : '';
  const credit = asset.credit ? `${captionHtml ? ' ' : ''}<span class="credit">${esc(asset.credit)}</span>` : '';
  const focal = focalClass(asset.focal);
  return `<figure class="${esc(className)}"><img${focal ? ` class="${focal}"` : ''} src="${esc(asset.url)}" alt="${esc(asset.alt)}"${dims} loading="lazy" decoding="async">`
    + `${captionHtml || credit ? `<figcaption>${captionHtml}${credit}</figcaption>` : ''}</figure>`;
}

function renderBlock(block, ctx) {
  const md = (text) => inline(text, ctx);
  switch (block.type) {
    case 'paragraph': {
      const style = PARAGRAPH_STYLES.has(block.style) ? block.style : '';
      return `<p${attrs(block, style, block.dropCap && 'dropcap', block.smallCaps && 'smallcaps', textAlignClass(block))}>${md(block.text)}</p>`;
    }

    case 'heading':
      return `<h${block.level}${attrs(block, textAlignClass(block))} id="${esc(block.id)}">${md(block.text)}</h${block.level}>`;

    case 'quote': {
      const cite = block.cite ? `<footer><cite>${md(block.cite)}</cite></footer>` : '';
      if (block.variant === 'pull') {
        return `<aside${attrs(block, 'pullquote')}><blockquote><p>${md(block.text)}</p>${cite}</blockquote></aside>`;
      }
      return `<blockquote${attrs(block, 'quote')}><p>${md(block.text)}</p>${cite}</blockquote>`;
    }

    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const tree = buildTree(block.items.map((raw) => ({ level: listLevel(raw), text: listText(raw) })));
      const draw = (nodes, own = '') => `<${tag}${own}>${nodes.map((n) => `<li>${md(n.entry.text)}${n.children.length ? draw(n.children) : ''}</li>`).join('')}</${tag}>`;
      return draw(tree, attrs(block));
    }

    case 'image': {
      const asset = ctx.media(block.mediaId, ctx.lang, block.alt);
      if (!asset) return '';
      const size = block.size ?? 'inline';
      const frame = cx(
        block.border && block.border !== 'none' && `frame-${block.border}`,
        block.radius && block.radius !== 'sm' && `radius-${block.radius}`,
        block.aspect && block.aspect !== 'auto' && `aspect-${block.aspect.replace(':', '-')}`,
      );
      const caption = block.caption ?? asset.caption;
      return figure(asset, {
        captionHtml: caption ? md(caption) : '',
        className: cx('figure', `figure--${size}`, frame, displayClasses(block))
      });
    }

    case 'callout': {
      const tone = block.tone ?? 'note';
      return `<aside${attrs(block, 'callout', `callout--${tone}`)} role="note">${block.title ? `<p class="callout__title">${md(block.title)}</p>` : ''}<p>${md(block.text)}</p></aside>`;
    }

    case 'divider':
      return `<hr${attrs(block, 'divider')}>`;

    case 'checklist': {
      const row = (item) => {
        const done = Boolean(item.checked);
        return `<div class="checklist__row"><span class="checklist__box" aria-hidden="true"></span>`
          + `<span class="visually-hidden">${esc(ctx.t(done ? 'block_done' : 'block_todo'))}: </span><span>${md(item.text)}</span></div>`;
      };
      const draw = (nodes) => `<ul>${nodes.map((n) => `<li class="${n.entry.checked ? 'is-done' : 'is-todo'}">${row(n.entry)}${n.children.length ? draw(n.children) : ''}</li>`).join('')}</ul>`;
      const tree = buildTree(block.items.map((item) => ({ ...item, level: item.level ?? 0 })));
      return `<div${attrs(block, 'checklist')}>${block.title ? `<p class="block-title">${md(block.title)}</p>` : ''}${draw(tree)}</div>`;
    }

    case 'definitions':
      return `<dl${attrs(block, 'definitions')}>${block.items.map((i) => `<div><dt>${md(i.term)}</dt><dd>${md(i.definition)}</dd></div>`).join('')}</dl>`;

    case 'code': {
      const lang = block.language ? esc(block.language) : '';
      const head = block.caption || lang ? `<figcaption>${block.caption ? md(block.caption) : ''}${lang ? `<span class="code-block__lang" dir="ltr">${lang}</span>` : ''}</figcaption>` : '';
      return `<figure${attrs(block, 'code-block')}>${head}<pre dir="ltr" tabindex="0"><code${lang ? ` class="language-${lang}"` : ''}>${esc(block.text)}</code></pre></figure>`;
    }

    case 'table': {
      const hasHeader = block.header !== false;
      const align = (i) => { const a = block.align?.[i]; return a && a !== 'start' ? ` class="ta-${esc(a)}"` : ''; };
      const row = (cells, tag) => `<tr>${cells.map((c, i) => `<${tag}${tag === 'th' ? ' scope="col"' : ''}${align(i)}>${md(c)}</${tag}>`).join('')}</tr>`;
      const head = hasHeader ? `<thead>${row(block.rows[0], 'th')}</thead>` : '';
      const body = block.rows.slice(hasHeader ? 1 : 0).map((r) => row(r, 'td')).join('');
      return `<figure${attrs(block, 'table-block')}><div class="table-scroll" tabindex="0" role="region"${block.caption ? ` aria-label="${esc(plain(block.caption))}"` : ''}>`
        + `<table>${block.caption ? `<caption>${md(block.caption)}</caption>` : ''}${head}<tbody>${body}</tbody></table></div></figure>`;
    }

    case 'gallery': {
      const items = block.items.map((item) => {
        const asset = ctx.media(item.mediaId, ctx.lang, item.alt);
        if (!asset) return '';
        const caption = item.caption ?? asset.caption;
        return figure(asset, { captionHtml: caption ? md(caption) : '', className: 'gallery-block__item' });
      }).join('');
      if (!items) return '';
      const ratio = block.ratio && block.ratio !== 'auto' ? `aspect-${block.ratio.replace(':', '-')}` : '';
      return `<figure${attrs(block, 'gallery-block', `cols-${block.columns ?? 3}`, ratio)}><div class="gallery-block__grid">${items}</div>${block.caption ? `<figcaption>${md(block.caption)}</figcaption>` : ''}</figure>`;
    }

    case 'compare': {
      const before = ctx.media(block.beforeId, ctx.lang, block.beforeAlt);
      const after = ctx.media(block.afterId, ctx.lang, block.afterAlt);
      if (!before || !after) return '';
      const side = (asset, label, fallbackKey) => figure(asset, {
        captionHtml: `<span class="compare__label">${label ? md(label) : esc(ctx.t(fallbackKey))}</span>`,
        className: 'compare__side'
      });
      return `<figure${attrs(block, 'compare', 'w-wide')}><div class="compare__pair">${side(before, block.beforeLabel, 'block_before')}${side(after, block.afterLabel, 'block_after')}</div>`
        + `${block.caption ? `<figcaption>${md(block.caption)}</figcaption>` : ''}</figure>`;
    }

    case 'imagetext': {
      const asset = ctx.media(block.mediaId, ctx.lang, block.alt);
      if (!asset) return '';
      const caption = block.caption ?? asset.caption;
      const fig = figure(asset, { captionHtml: caption ? md(caption) : '', className: 'imagetext__figure' });
      return `<div${attrs(block, 'imagetext', `imagetext--${block.side ?? 'start'}`, 'w-wide')}>${fig}<div class="imagetext__text">${paragraphs(block.text).map((p) => `<p>${md(p)}</p>`).join('')}</div></div>`;
    }

    case 'factbox': {
      const rows = block.items.map((i) => `<div><dt>${md(i.label)}</dt><dd>${md(i.value)}</dd></div>`).join('');
      return `<aside${attrs(block, 'factbox')}>${block.title ? `<p class="block-title">${md(block.title)}</p>` : ''}<dl>${rows}</dl>${block.note ? `<p class="factbox__note">${md(block.note)}</p>` : ''}</aside>`;
    }

    case 'timeline': {
      const events = block.events.map((e) => `<li>${e.date ? `<span class="timeline__date">${md(e.date)}</span>` : ''}<div class="timeline__body"><p class="timeline__title">${md(e.title)}</p>${e.text ? `<p>${md(e.text)}</p>` : ''}</div></li>`).join('');
      return `<section${attrs(block, 'timeline')}>${block.title ? `<p class="block-title">${md(block.title)}</p>` : ''}<ol>${events}</ol></section>`;
    }

    case 'stats': {
      const items = block.items.map((i) => `<li><span class="stats__value">${esc(i.value)}</span><span class="stats__label">${md(i.label)}</span>${i.note ? `<span class="stats__note">${md(i.note)}</span>` : ''}</li>`).join('');
      return `<ul${attrs(block, 'stats')} role="list">${items}</ul>`;
    }

    case 'related': {
      const cards = block.items.map((ref) => {
        const found = ctx.item?.(ref.kind, ref.id);
        if (!found) return '';
        return `<li><a class="related-card" href="${esc(found.url)}"><span class="related-card__kind">${esc(ctx.t(ref.kind === 'project' ? 'block_project' : 'block_article'))}</span>`
          + `<strong>${esc(found.title)}</strong>${found.excerpt ? `<span>${esc(found.excerpt)}</span>` : ''}</a></li>`;
      }).join('');
      if (!cards) return '';
      return `<aside${attrs(block, 'related-block')}><p class="block-title">${block.title ? md(block.title) : esc(ctx.t('block_related'))}</p><ul>${cards}</ul></aside>`;
    }

    case 'author': {
      const a = ctx.author?.();
      if (!a) return '';
      const photo = a.photo ? `<img class="author-card__photo" src="${esc(a.photo.url)}" alt="" width="64" height="64" loading="lazy" decoding="async">` : '';
      return `<aside${attrs(block, 'author-card')}>${photo}<div><p class="author-card__label">${esc(ctx.t('block_author'))}</p><p class="author-card__name"><a href="${esc(a.url)}">${esc(a.name)}</a></p>`
        + `<p>${block.note ? md(block.note) : esc(a.headline || a.summary || '')}</p></div></aside>`;
    }

    case 'footnotes': {
      const items = block.items.map((n) => `<li id="fn-${esc(n.key)}">${md(n.text)} <a href="#fnref-${esc(n.key)}" role="doc-backlink" aria-label="${esc(ctx.t('block_back'))}">↩</a></li>`).join('');
      return `<aside${attrs(block, 'footnotes')} role="doc-endnotes"><p class="block-title">${block.title ? md(block.title) : esc(ctx.t('block_notes'))}</p><ol>${items}</ol></aside>`;
    }

    case 'references': {
      const items = block.items.map((r) => {
        const link = r.url && isSafeUrl(r.url) ? ` <a href="${esc(r.url)}" rel="noopener" dir="ltr">${esc(r.url)}</a>` : '';
        return `<li>${md(r.text)}${link}</li>`;
      }).join('');
      return `<aside${attrs(block, 'references')}><p class="block-title">${block.title ? md(block.title) : esc(ctx.t('block_references'))}</p><ol>${items}</ol></aside>`;
    }

    default:
      // The schema rejects unknown types, so this only guards against a renderer/schema mismatch.
      throw new Error(`No renderer for block type "${block.type}"`);
  }
}
