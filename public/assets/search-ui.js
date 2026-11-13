/* ABDO search page behaviour.
 *
 * This file is not loaded on its own: the build (src/lib/search-bundle.mjs) puts it after the search engine
 * (src/core/search-text.mjs + src/core/search-engine.mjs) inside one script, so `search`, `suggest`, `didYouMean`,
 * `relatedSearches`, `recommend`, `highlight`, `snippet`, `optionsOf` and `INDEX_VERSION` are in scope here.
 *
 * Rendering rule: every piece of text from the index goes into the page with createTextNode / textContent, and every
 * address is checked to be a path on this site before it becomes an href or src. Nothing is ever assembled as HTML.
 */
function searchUi() {
  const root = document.querySelector('.search');
  const dataElement = document.getElementById('search-data');
  if (!root || !dataElement) return;

  let data;
  try { data = JSON.parse(dataElement.textContent); } catch (error) { return; }
  const S = data.strings;
  const SORTS = ['relevance', 'newest', 'oldest'];
  const VIEWS = ['grid', 'list', 'compact'];

  const numberFormat = new Intl.NumberFormat(data.locale);
  const dateFormat = new Intl.DateTimeFormat(data.locale, { dateStyle: 'long', timeZone: 'UTC' });
  const pluralRules = new Intl.PluralRules(data.lang);
  const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
  const say = (key, vars) => fill(S[key] !== undefined ? S[key] : key, vars || {});
  const sayPlural = (base, n, vars) => {
    const form = `${base}_${pluralRules.select(n)}`;
    return fill(S[form] !== undefined ? S[form] : S[`${base}_other`], Object.assign({ n: numberFormat.format(n) }, vars));
  };

  // A path on this site ("/en/blog/x/"), never another origin or a script address.
  const safePath = (value) => (typeof value === 'string' && /^\/(?!\/)/.test(value) && !/[\u0000-\u001f\\]/.test(value) ? value : '#');
  const validDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '');

  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props || {})) {
      if (value === false || value === null || value === undefined) continue;
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else node.setAttribute(name, value === true ? '' : String(value));
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return node;
  }
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
  const pieces = (list) => list.map((piece) => (piece.h ? h('mark', { text: piece.t }) : document.createTextNode(piece.t)));

  const $ = (selector) => root.querySelector(selector);
  const form = $('[data-search-form]');
  const input = $('#search-q');
  const suggestBox = $('#search-suggest');
  const filters = $('[data-filters]');
  const topicSelect = $('[data-topic]');
  const tagSelect = $('[data-tag]');
  const fromInput = $('[data-from]');
  const toInput = $('[data-to]');
  const sortSelect = $('[data-sort]');
  const statusEl = $('[data-status]');
  const asideEl = $('[data-aside]');
  const resultsEl = $('[data-results]');
  const moreEl = $('[data-more]');
  const idleEl = $('[data-idle]');
  const typeBoxes = Array.from(root.querySelectorAll('[data-type]'));
  const viewButtons = Array.from(root.querySelectorAll('[data-view]'));

  // ---------------------------------------------------------------- state <-> address

  function readUrl() {
    const p = new URLSearchParams(location.search);
    return {
      q: (p.get('q') || '').slice(0, 200),
      types: (p.get('type') || '').split(',').filter((t) => data.settings.types.indexOf(t) >= 0),
      topic: p.get('topic') || '',
      tag: p.get('tag') || '',
      from: validDate(p.get('from')),
      to: validDate(p.get('to')),
      sort: SORTS.indexOf(p.get('sort')) >= 0 ? p.get('sort') : 'relevance',
      view: VIEWS.indexOf(p.get('view')) >= 0 ? p.get('view') : data.settings.view,
      page: Math.max(1, Math.min(500, parseInt(p.get('page'), 10) || 1)),
    };
  }

  function query(next) {
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.types.length) p.set('type', next.types.join(','));
    if (next.topic) p.set('topic', next.topic);
    if (next.tag) p.set('tag', next.tag);
    if (next.from) p.set('from', next.from);
    if (next.to) p.set('to', next.to);
    if (next.sort !== 'relevance') p.set('sort', next.sort);
    if (next.view !== data.settings.view) p.set('view', next.view);
    if (next.page > 1) p.set('page', String(next.page));
    return p.toString();
  }
  const addressOf = (next) => location.pathname + (query(next) ? `?${query(next)}` : '');
  const state = readUrl();
  const withState = (patch) => Object.assign({}, state, { page: 1 }, patch);

  function remember(push) {
    try { history[push ? 'pushState' : 'replaceState'](null, '', addressOf(state)); } catch (error) { /* the page still works without a changing address */ }
  }

  // ---------------------------------------------------------------- the index

  let index = null;
  let loading = null;
  let engineOptions = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(data.index, { credentials: 'same-origin' })
        .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
        .then((json) => {
          if (!json || json.v !== INDEX_VERSION || !Array.isArray(json.docs)) throw new Error('unsupported index');
          index = json;
          engineOptions = optionsOf(json);
          buildFilters();
          return json;
        })
        .catch((error) => { loading = null; throw error; });
    }
    return loading;
  }

  function failed() {
    statusEl.textContent = say('search_failed');
    clear(resultsEl); clear(moreEl); clear(asideEl);
    const list = h('ul', { class: 'chips' }, data.browse.map((b) => h('li', null, h('a', { href: safePath(b.url), text: b.label }))));
    asideEl.append(list);
  }

  // ---------------------------------------------------------------- filter controls

  function buildFilters() {
    for (const [select, facets] of [[topicSelect, index.facets.topics], [tagSelect, index.facets.tags]]) {
      for (const facet of facets) select.append(h('option', { value: facet.id, 'data-facet': facet.id, text: facet.n }));
    }
    syncControls();
  }

  function syncControls() {
    input.value = state.q;
    for (const box of typeBoxes) box.checked = state.types.indexOf(box.value) >= 0;
    topicSelect.value = state.topic;
    tagSelect.value = state.tag;
    fromInput.value = state.from;
    toInput.value = state.to;
    sortSelect.value = state.sort;
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.getAttribute('data-view') === state.view));
    resultsEl.className = `search__results search__results--${state.view}`;
  }

  function updateFacetCounts(result) {
    for (const box of typeBoxes) {
      const count = root.querySelector(`[data-type-count="${box.value}"]`);
      if (count) count.textContent = result ? `(${numberFormat.format(result.facets.types[box.value] || 0)})` : '';
    }
    for (const [select, facets, counts] of [[topicSelect, index.facets.topics, result && result.facets.topics], [tagSelect, index.facets.tags, result && result.facets.tags]]) {
      Array.from(select.options).forEach((option) => {
        if (!option.value) return;
        const at = facets.findIndex((f) => f.id === option.value);
        const facet = facets[at];
        const n = counts ? (counts[at] || 0) : facet.c;
        option.textContent = `${facet.n} (${numberFormat.format(n)})`;
        option.disabled = Boolean(counts) && n === 0 && option.value !== select.value;
      });
    }
  }

  // ---------------------------------------------------------------- results

  let lastResult = null;

  function hasFilter() { return Boolean(state.types.length || state.topic || state.tag || state.from || state.to); }

  function run({ typing } = {}) {
    if (!index) return;
    const words = state.q.trim();
    if (!words && !hasFilter()) { renderIdle(); return; }
    const request = { q: state.q, types: state.types, topic: state.topic, tag: state.tag, from: state.from, to: state.to, sort: state.sort };
    let result = search(index, Object.assign({ prefix: Boolean(typing) }, request));
    // Pressing Enter on a half-typed word still finds what it starts: try it as a prefix when nothing matched.
    if (result.total === 0 && !typing && words && !/[\s"]$/.test(state.q)) {
      const second = search(index, Object.assign({ prefix: true }, request));
      if (second.total > 0) result = second;
    }
    lastResult = result;
    renderResults(result);
  }

  function renderIdle() {
    lastResult = null;
    statusEl.textContent = say('search_hint');
    clear(resultsEl); clear(moreEl); clear(asideEl); clear(idleEl);
    updateFacetCounts(null);
    const rec = recommend(index, { docs: 4, topics: 8 });
    idleEl.hidden = false;
    idleEl.append(h('h2', { text: say('search_idle_title') }));
    if (rec.topics.length) idleEl.append(h('ul', { class: 'chips' }, rec.topics.map((t) => h('li', null, h('a', { href: safePath(t.u), text: t.n })))));
    if (rec.docs.length) {
      idleEl.append(h('h3', { text: say('search_newest') }));
      idleEl.append(h('ul', { class: 'plain-list' }, rec.docs.map((i) => h('li', null, h('a', { href: safePath(index.docs[i].u), text: index.docs[i].t })))));
    }
  }

  function renderResults(result) {
    clear(idleEl); idleEl.hidden = true;
    clear(asideEl);
    const words = state.q.trim();
    statusEl.textContent = result.query.empty
      ? sayPlural('search_browse', result.total)
      : (result.total === 0 ? say('search_none', { q: words }) : sayPlural('search_status', result.total, { q: words }));

    if (result.partial && result.total) asideEl.append(h('p', { class: 'notice', text: say('search_partial') }));
    if (result.total === 0) {
      const maybe = didYouMean(index, state.q);
      if (maybe) {
        asideEl.append(h('p', null, `${say('search_did_you_mean')} `, h('a', { href: addressOf(withState({ q: maybe.text })), 'data-q': maybe.text, text: maybe.text }), '?'));
      }
      asideEl.append(h('p', { text: say('search_none_help') }));
      const rec = recommend(index, { docs: 4, topics: 6 });
      if (rec.topics.length) asideEl.append(h('ul', { class: 'chips' }, rec.topics.map((t) => h('li', null, h('a', { href: safePath(t.u), text: t.n })))));
      if (rec.docs.length) asideEl.append(h('ul', { class: 'plain-list' }, rec.docs.map((i) => h('li', null, h('a', { href: safePath(index.docs[i].u), text: index.docs[i].t })))));
    } else {
      const related = relatedSearches(index, result, { limit: 6, skip: { topic: state.topic, tag: state.tag } });
      if (related.length) {
        asideEl.append(h('div', { class: 'search__related' },
          h('p', { class: 'search__related-title', text: say('search_related') }),
          h('ul', { class: 'chips' }, related.map((r) => h('li', null, h('a', { href: addressOf(withState({ [r.kind]: r.id })), 'data-kind': r.kind, 'data-id': r.id, text: r.name }))))));
      }
    }
    updateFacetCounts(result);

    const size = data.settings.pageSize;
    const pages = Math.max(1, Math.ceil(result.total / size));
    if (state.page > pages) state.page = pages;
    const more = data.settings.pagination === 'more';
    const hits = more ? result.hits.slice(0, state.page * size) : result.hits.slice((state.page - 1) * size, state.page * size);

    clear(resultsEl);
    for (const hit of hits) resultsEl.append(resultItem(index.docs[hit.i], result.query));

    clear(moreEl);
    if (more) {
      if (hits.length < result.total) moreEl.append(h('button', { type: 'button', class: 'button', 'data-more-button': true, text: say('search_load_more') }));
    } else if (pages > 1) {
      moreEl.append(pagination(pages));
    }
  }

  function pagination(pages) {
    const link = (n, label, extra) => h('a', Object.assign({ href: addressOf(Object.assign({}, state, { page: n })), 'data-page': n }, extra || {}), label);
    const items = [];
    if (state.page > 1) items.push(h('li', { class: 'pagination__step' }, link(state.page - 1, say('search_page_prev'), { rel: 'prev' })));
    let gap = false;
    for (let n = 1; n <= pages; n += 1) {
      if (n === 1 || n === pages || Math.abs(n - state.page) <= 1) {
        gap = false;
        items.push(h('li', null, link(n, numberFormat.format(n), n === state.page ? { 'aria-current': 'page' } : {})));
      } else if (!gap) { gap = true; items.push(h('li', { 'aria-hidden': 'true', text: '…' })); }
    }
    if (state.page < pages) items.push(h('li', { class: 'pagination__step' }, link(state.page + 1, say('search_page_next'), { rel: 'next' })));
    return h('nav', { class: 'pagination', 'aria-label': say('search_results_nav') }, h('ul', null, items));
  }

  function resultItem(doc, parsed) {
    const textOf = (value) => (value ? String(value) : '');
    const hasMatch = (text) => highlight(text, parsed, engineOptions).some((p) => p.h);
    let excerpt = textOf(doc.d);
    if (!parsed.empty && !hasMatch(excerpt) && textOf(doc.x) && hasMatch(doc.x)) excerpt = doc.x;
    if (!excerpt) excerpt = textOf(doc.x);
    const cut = snippet(excerpt, parsed, { width: 190, options: engineOptions });

    const thumb = doc.th ? h('a', { class: 'result__thumb', href: safePath(doc.u), tabindex: '-1', 'aria-hidden': 'true' }, h('img', { src: safePath(doc.th), alt: '', loading: 'lazy', decoding: 'async' })) : null;
    const tags = (doc.tg || []).slice(0, 3).map((i) => index.facets.tags[i]).filter(Boolean)
      .map((tag) => h('li', null, h('a', { href: safePath(tag.u), text: tag.n })));
    const foot = [];
    if (doc.p) foot.push(h('time', { datetime: doc.p, text: dateFormat.format(new Date(`${doc.p}T00:00:00Z`)) }));
    if (doc.m) {
      if (foot.length) foot.push(h('span', { class: 'dot', 'aria-hidden': 'true', text: '·' }));
      foot.push(h('span', { text: say('min_read', { n: numberFormat.format(doc.m) }) }));
    }

    return h('li', { class: `result result--${doc.y}${thumb ? '' : ' result--text'}` },
      thumb,
      h('div', { class: 'result__body' },
        h('p', { class: 'result__meta' }, h('span', { class: 'badge', text: say(`search_type_${doc.y}`) }), doc.c ? h('span', { text: doc.c }) : null),
        h('h3', { class: 'result__title' }, h('a', { href: safePath(doc.u) }, pieces(highlight(doc.t, parsed, engineOptions)))),
        excerpt ? h('p', { class: 'result__text' }, cut.before ? '… ' : '', pieces(cut.pieces), cut.after ? ' …' : '') : null,
        foot.length || tags.length ? h('div', { class: 'result__foot' }, foot.length ? h('p', { class: 'meta' }, foot) : null, tags.length ? h('ul', { class: 'chips chips--small' }, tags) : null) : null));
  }

  // ---------------------------------------------------------------- suggestions (autocomplete)

  let suggestions = [];
  let active = -1;

  function closeSuggest() {
    suggestBox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function showSuggest() {
    if (!index || !data.settings.autocomplete) return;
    suggestions = suggest(index, input.value, { terms: 4, docs: 4 });
    clear(suggestBox);
    if (!suggestions.length) { closeSuggest(); return; }
    suggestions.forEach((item, n) => {
      const label = item.kind === 'term'
        ? [h('span', { text: item.text })]
        : [h('span', { text: item.title }), h('span', { class: 'badge', text: say(`search_type_${item.type}`) })];
      suggestBox.append(h('li', { id: `search-opt-${n}`, role: 'option', class: `search__option search__option--${item.kind}`, 'aria-selected': 'false', 'data-n': n }, label));
    });
    suggestBox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  }

  function moveActive(delta) {
    if (suggestBox.hidden || !suggestions.length) return;
    active = (active + delta + suggestions.length + 1) % (suggestions.length + 1);
    if (active === suggestions.length) active = -1;
    Array.from(suggestBox.children).forEach((li, n) => li.setAttribute('aria-selected', String(n === active)));
    if (active >= 0) input.setAttribute('aria-activedescendant', `search-opt-${active}`); else input.removeAttribute('aria-activedescendant');
  }

  function choose(n) {
    const item = suggestions[n];
    if (!item) return;
    closeSuggest();
    if (item.kind === 'doc') { location.href = safePath(item.url); return; }
    input.value = `${item.text} `;
    state.q = input.value;
    state.page = 1;
    remember(true);
    run();
    input.focus();
  }

  // ---------------------------------------------------------------- events

  let timer = null;
  // Changing a filter also uses whatever is typed in the box, so unsent text is never thrown away.
  const apply = (patch, push) => {
    Object.assign(state, { page: 1 }, 'q' in patch ? {} : { q: input.value.slice(0, 200) }, patch);
    syncControls(); remember(push); run();
  };

  input.addEventListener('input', () => {
    if (!index) loadIndex().then(() => { if (document.activeElement === input) showSuggest(); }).catch(failed);
    else showSuggest();
    if (!data.settings.instant) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      loadIndex().then(() => { state.q = input.value; state.page = 1; remember(false); run({ typing: true }); }).catch(failed);
    }, 140);
  });
  input.addEventListener('focus', () => { loadIndex().catch(failed); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (suggestBox.hidden) showSuggest(); else moveActive(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); }
    else if (event.key === 'Escape') { if (!suggestBox.hidden) { event.preventDefault(); closeSuggest(); } }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(active); }
  });
  input.addEventListener('blur', () => { setTimeout(closeSuggest, 120); });
  suggestBox.addEventListener('mousedown', (event) => { event.preventDefault(); });
  suggestBox.addEventListener('click', (event) => {
    const option = event.target.closest('[data-n]');
    if (option) choose(Number(option.getAttribute('data-n')));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    closeSuggest();
    loadIndex().then(() => { apply({ q: input.value }, true); }).catch(failed);
  });

  for (const box of typeBoxes) box.addEventListener('change', () => apply({ types: typeBoxes.filter((b) => b.checked).map((b) => b.value) }, false));
  topicSelect.addEventListener('change', () => apply({ topic: topicSelect.value }, false));
  tagSelect.addEventListener('change', () => apply({ tag: tagSelect.value }, false));
  fromInput.addEventListener('change', () => apply({ from: validDate(fromInput.value) }, false));
  toInput.addEventListener('change', () => apply({ to: validDate(toInput.value) }, false));
  sortSelect.addEventListener('change', () => apply({ sort: sortSelect.value }, false));
  $('[data-clear]').addEventListener('click', () => apply({ types: [], topic: '', tag: '', from: '', to: '' }, false));
  for (const button of viewButtons) {
    button.addEventListener('click', () => { state.view = button.getAttribute('data-view'); syncControls(); remember(false); });
  }

  // Related searches, "did you mean" and page links change the state without reloading the page.
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-kind], a[data-q], a[data-page]');
    if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      if (link.hasAttribute('data-kind')) apply({ [link.getAttribute('data-kind')]: link.getAttribute('data-id') }, true);
      else if (link.hasAttribute('data-q')) apply({ q: link.getAttribute('data-q') }, true);
      else { state.page = Number(link.getAttribute('data-page')); remember(true); run(); resultsEl.scrollIntoView({ block: 'start' }); }
      return;
    }
    if (event.target.closest('[data-more-button]')) { state.page += 1; remember(false); run(); }
  });

  window.addEventListener('popstate', () => {
    Object.assign(state, readUrl());
    syncControls();
    run();
  });

  // ---------------------------------------------------------------- start

  syncControls();
  if (window.matchMedia && window.matchMedia('(max-width: 800px)').matches && !hasFilter()) filters.removeAttribute('open');
  loadIndex().then(() => { syncControls(); run(); }).catch(failed);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', searchUi);
else searchUi();
