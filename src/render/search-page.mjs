// The search page: a static shell the browser script (public/assets/search-ui.js, bundled with the engine) fills in.
// Without JavaScript the page says so and links to the browsable pages, so nothing is hidden behind the script.

import { esc, safeJsonForScript } from '../core/text.mjs';
import { SEARCH_TYPES } from '../core/search-settings.mjs';
import { breadcrumbs, pageHeader } from './components.mjs';

/** The address of the search page with some of its state already set (used by "search in this topic"). */
export function searchUrl(L, params = {}) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) q.set(key, value);
  const text = q.toString();
  return text ? `${L.pageUrl.search}?${text}` : L.pageUrl.search;
}

/** Everything the script needs, as one JSON block (no inline handlers, no secrets). */
function clientData(model, L, assets) {
  const { i18n } = L;
  const nu = L.language.numerals === 'arab' ? 'arab' : 'latn';
  const strings = { ...i18n.withPrefix('search_'), min_read: i18n.withPrefix('min_read').min_read };
  return {
    lang: L.lang,
    locale: `${L.language.locale}-u-nu-${nu}`,
    index: assets.searchIndex[L.lang],
    settings: {
      pageSize: model.search.pageSize, view: model.search.defaultView, pagination: model.search.pagination,
      autocomplete: model.search.autocomplete, instant: model.search.instant,
      types: SEARCH_TYPES.filter((type) => model.search.types[type]),
    },
    browse: [
      { label: i18n.t('blog'), url: L.pageUrl.blog }, { label: i18n.t('portfolio'), url: L.pageUrl.portfolio },
      { label: i18n.t('topics'), url: L.pageUrl.topics }, { label: i18n.t('tags'), url: L.pageUrl.tags }, { label: i18n.t('about'), url: L.pageUrl.about },
    ],
    strings,
  };
}

export function searchPage({ model, L, i18n }, assets) {
  const url = L.pageUrl.search;
  const trail = [{ label: i18n.t('home'), url: L.homeUrl }, { label: i18n.t('search'), url }];
  const data = clientData(model, L, assets);
  const browse = data.browse.map((b) => `<li><a href="${esc(b.url)}">${esc(b.label)}</a></li>`).join('');
  const types = data.settings.types.map((type) => `<label class="check"><input type="checkbox" name="type" value="${esc(type)}" data-type> <span>${esc(i18n.t(`search_type_${type}`))}</span> <span class="check__count" data-type-count="${esc(type)}"></span></label>`).join('');
  const option = (value, key, selected = false) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(i18n.t(key))}</option>`;

  const main = `${pageHeader({ title: i18n.t('search'), intro: i18n.t('search_intro'), trailHtml: breadcrumbs(i18n, trail) })}
<div class="container search">
  <div class="search__nojs">
    <p>${esc(i18n.t('search_needs_js'))}</p>
    <ul class="chips">${browse}</ul>
  </div>
  <div class="search__app">
    <form class="search__form" role="search" action="${esc(url)}" method="get" data-search-form>
      <label class="visually-hidden" for="search-q">${esc(i18n.t('search_label'))}</label>
      <div class="search__field">
        <input id="search-q" name="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="search-suggest" aria-describedby="search-tips" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="${esc(i18n.t('search_placeholder'))}">
        <button class="button" type="submit">${esc(i18n.t('search_button'))}</button>
      </div>
      <ul id="search-suggest" class="search__suggest" role="listbox" aria-label="${esc(i18n.t('search_suggestions'))}" hidden></ul>
      <p id="search-tips" class="visually-hidden">${esc(i18n.t('search_suggest_hint'))}</p>
    </form>
    <details class="search__filters" open data-filters>
      <summary>${esc(i18n.t('search_filters'))}</summary>
      <div class="search__filter-grid">
        <fieldset class="search__types"><legend>${esc(i18n.t('search_filter_type'))}</legend>${types}</fieldset>
        <label class="field"><span>${esc(i18n.t('search_filter_topic'))}</span><select data-topic><option value="">${esc(i18n.t('search_filter_any_topic'))}</option></select></label>
        <label class="field"><span>${esc(i18n.t('search_filter_tag'))}</span><select data-tag><option value="">${esc(i18n.t('search_filter_any_tag'))}</option></select></label>
        <label class="field"><span>${esc(i18n.t('search_filter_from'))}</span><input type="date" data-from></label>
        <label class="field"><span>${esc(i18n.t('search_filter_to'))}</span><input type="date" data-to></label>
        <label class="field"><span>${esc(i18n.t('search_sort'))}</span><select data-sort>${option('relevance', 'search_sort_relevance', true)}${option('newest', 'search_sort_newest')}${option('oldest', 'search_sort_oldest')}</select></label>
      </div>
      <p><button class="button button--ghost" type="button" data-clear>${esc(i18n.t('search_filters_clear'))}</button></p>
    </details>
    <div class="search__bar">
      <p class="search__status" role="status" aria-live="polite" data-status>${esc(i18n.t('search_loading'))}</p>
      <div class="search__views" role="group" aria-label="${esc(i18n.t('search_view'))}">
        ${['grid', 'list', 'compact'].map((v) => `<button type="button" class="button button--ghost" data-view="${v}" aria-pressed="false">${esc(i18n.t(`search_view_${v}`))}</button>`).join('')}
      </div>
    </div>
    <div class="search__aside" data-aside></div>
    <h2 class="visually-hidden">${esc(i18n.t('search_results'))}</h2>
    <ol class="search__results search__results--grid" data-results></ol>
    <div class="search__more" data-more></div>
    <section class="search__idle" data-idle hidden></section>
    <details class="search__help">
      <summary>${esc(i18n.t('search_help_title'))}</summary>
      <ul class="plain-list"><li>${esc(i18n.t('search_help_words'))}</li><li>${esc(i18n.t('search_help_phrase'))}</li><li>${esc(i18n.t('search_help_exclude'))}</li><li>${esc(i18n.t('search_help_arabic'))}</li></ul>
    </details>
  </div>
  <script type="application/json" id="search-data">${safeJsonForScript(data)}</script>
</div>`;

  return {
    kind: 'search', segs: L.searchSegs, url, currentPage: 'search', title: i18n.t('search'), description: i18n.t('search_intro'),
    alternates: model.alternatesFor('search'), robots: 'noindex', noindex: true, bodyClass: 'page-search',
    main, scripts: [assets.searchJs],
  };
}
