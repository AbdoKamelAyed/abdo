// The page shell: <head>, header, footer, scripts. Pages supply only their <main> content.

import { googleFontsUrl } from '../lib/theme.mjs';
import { esc, safeJsonForScript } from '../core/text.mjs';
import { htmlAttributes } from '../core/layout.mjs';
import { uiIconSvg } from '../core/icons.mjs';

// Runs before first paint so a saved light/dark choice never flashes the wrong theme, and tells
// the stylesheet that JavaScript is available. Every storage access is guarded.
const EARLY_SCRIPT = `(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('abdo-theme');if(t==='light'||t==='dark'){d.setAttribute('data-theme',t)}}catch(e){}})();`;

const ogLocale = (locale) => locale.replace('-', '_');

export function renderPage(model, L, page, assets) {
  const { i18n } = L;
  const title = page.kind === 'home' ? `${L.siteName} — ${L.tagline}` : `${page.title} — ${L.siteName}`;
  const description = page.description ?? L.description;
  const url = page.url;
  const alternates = page.alternates ?? { [L.lang]: url };
  const fontsUrl = googleFontsUrl(L.language);

  const head = [];
  head.push('<meta charset="utf-8">');
  head.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  head.push(`<title>${esc(title)}</title>`);
  head.push(`<meta name="description" content="${esc(description)}">`);
  if (!page.noCanonical) head.push(`<link rel="canonical" href="${esc(page.canonicalUrl ?? model.absolute(url))}">`);
  if (page.robots === 'noindex') head.push('<meta name="robots" content="noindex">');

  const altLangs = Object.keys(alternates);
  if (altLangs.length > 1) {
    for (const code of altLangs) head.push(`<link rel="alternate" hreflang="${esc(code)}" href="${esc(model.absolute(alternates[code]))}">`);
    if (alternates[model.defaultLang]) head.push(`<link rel="alternate" hreflang="x-default" href="${esc(model.absolute(alternates[model.defaultLang]))}">`);
  }

  head.push('<meta property="og:site_name" content="' + esc(L.siteName) + '">');
  head.push(`<meta property="og:title" content="${esc(page.title ?? L.siteName)}">`);
  head.push(`<meta property="og:description" content="${esc(description)}">`);
  head.push(`<meta property="og:type" content="${page.ogType ?? 'website'}">`);
  head.push(`<meta property="og:url" content="${esc(model.absolute(url))}">`);
  head.push(`<meta property="og:locale" content="${esc(ogLocale(L.language.locale))}">`);
  for (const code of altLangs.filter((c) => c !== L.lang)) {
    const other = model.langs[code];
    if (other) head.push(`<meta property="og:locale:alternate" content="${esc(ogLocale(other.language.locale))}">`);
  }
  // Social platforms do not render SVG previews, so only raster images are advertised.
  const ogImage = page.ogImage?.isRaster ? page.ogImage : null;
  if (ogImage) head.push(`<meta property="og:image" content="${esc(ogImage.absoluteUrl)}">`);
  head.push(`<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`);

  if (fontsUrl) {
    head.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    head.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    head.push(`<link rel="stylesheet" href="${esc(fontsUrl)}">`);
  }
  head.push(`<link rel="stylesheet" href="${esc(assets.themeCss)}">`);
  head.push(`<link rel="stylesheet" href="${esc(assets.baseCss)}">`);
  head.push(`<link rel="stylesheet" href="${esc(assets.glassCss)}">`);
  head.push(`<script>${EARLY_SCRIPT}</script>`);
  for (const ld of page.jsonld ?? []) head.push(`<script type="application/ld+json">${safeJsonForScript(ld)}</script>`);

  const bannerHtml = model.hasSample && model.site.sampleBanner
    ? `<div class="sample-banner" role="note">${esc(i18n.t('sample_notice'))}</div>`
    : '';

  return `<!doctype html>
<html lang="${esc(L.lang)}" dir="${esc(L.dir)}" data-motion="${esc(model.design.animation)}" ${htmlAttributes(L.language.layout)}>
<head>
${head.join('\n')}
</head>
<body class="${esc(page.bodyClass ?? '')}">
<a class="skip-link" href="#main">${esc(i18n.t('skip'))}</a>
${bannerHtml}
${renderHeader(model, L, page, alternates)}
<main id="main" tabindex="-1">
${page.main}
</main>
${renderFooter(model, L)}
<script src="${esc(assets.siteJs)}" defer></script>
${(page.scripts ?? []).map((src) => `<script src="${esc(src)}" defer></script>`).join('\n')}
</body>
</html>
`;
}

function renderHeader(model, L, page, alternates) {
  const { i18n } = L;
  const navItems = L.nav.header.map((item) => {
    const current = item.page && item.page === page.currentPage ? ' aria-current="page"' : '';
    const rel = item.external ? ' rel="noopener"' : '';
    return `<li><a href="${esc(item.href)}"${current}${rel}>${esc(item.label)}</a></li>`;
  }).join('');

  const otherLangs = model.languages.filter((l) => l.code !== L.lang).map((l) => {
    const href = page.switcher?.[l.code] ?? alternates[l.code] ?? model.langs[l.code].homeUrl;
    return `<a class="lang-switch" href="${esc(href)}" hreflang="${esc(l.code)}" lang="${esc(l.code)}">${esc(l.nativeName)}</a>`;
  }).join('');

  const searchLink = L.searchEnabled
    ? `<a class="search-link" href="${esc(L.pageUrl.search)}"${page.currentPage === 'search' ? ' aria-current="page"' : ''}>${uiIconSvg('search')}<span class="visually-hidden">${esc(i18n.t('search_open'))}</span></a>`
    : '';

  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${esc(L.homeUrl)}">${esc(L.siteName)}</a>
    <nav id="site-nav" class="site-nav" aria-label="${esc(i18n.t('nav_primary'))}">
      <ul>${navItems}</ul>
    </nav>
    <div class="header-tools">
      ${searchLink}
      ${otherLangs}
      <button class="theme-toggle js-only" type="button" data-theme-toggle
        data-label-light="${esc(i18n.t('theme_light'))}" data-label-dark="${esc(i18n.t('theme_dark'))}" data-label-system="${esc(i18n.t('theme_system'))}">
        <span class="visually-hidden">${esc(i18n.t('theme'))}: </span><span class="theme-toggle__label" data-theme-label>${esc(i18n.t('theme_system'))}</span>
      </button>
      <button class="nav-toggle js-only" type="button" aria-expanded="false" aria-controls="site-nav">${esc(i18n.t('menu'))}</button>
    </div>
  </div>
</header>`;
}

function renderFooter(model, L) {
  const { i18n } = L;
  const links = L.nav.footer.map((item) => `<li><a href="${esc(item.href)}"${item.external ? ' rel="noopener"' : ''}>${esc(item.label)}</a></li>`).join('');
  const social = (L.profile?.links ?? []).map((l) => `<li><a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <p class="footer-name">${esc(L.siteName)}</p>
      <p class="footer-tagline">${esc(L.tagline)}</p>
    </div>
    <nav aria-label="${esc(i18n.t('nav_footer'))}"><ul class="footer-links">${links}</ul></nav>
    ${social ? `<ul class="footer-links footer-social">${social}</ul>` : ''}
    <p class="footer-legal">${esc(i18n.t('footer_rights', { year: model.year, name: L.profile?.name ?? L.siteName }))}</p>
  </div>
</footer>`;
}
