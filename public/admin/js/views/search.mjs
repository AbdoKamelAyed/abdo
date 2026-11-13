// Search settings: what the site's search covers and how it ranks, plus a test box that runs a real query
// against an index built here, in the browser, with the same code the build uses.

import { didYouMean, search } from '../../shared/core/search-engine.mjs';
import { DEFAULT_SEARCH, MAX_SYNONYM_GROUPS, PAGE_SIZE, PAGINATION, RANKINGS, SEARCH_TYPES, VIEWS, parseGroups, searchSettings } from '../../shared/core/search-settings.mjs';
import { buildModel } from '../../shared/lib/model.mjs';
import { buildSearchIndex } from '../../shared/lib/search-index.mjs';
import { checkInput, chip, confirmDialog, field, h, selectInput, tabs, textInput } from '../dom.mjs';
import { problemsPanel } from './editor-common.mjs';

const REL = 'config/search.json';
const WEIGHTS = ['title', 'tags', 'headings', 'description', 'body'];

export function renderSearch(ctx) {
  const file = ctx.workspace.read(REL) ?? { schemaVersion: 1 };
  const root = h('div', { class: 'search-admin' });
  const panel = problemsPanel(ctx, root, REL);
  const languages = ctx.languages();
  // Start in the language the admin is shown in, when the site has it.
  const startLang = (languages.find((l) => l.code === ctx.ui) ?? languages[0]).code;
  let synLang = startLang;
  let testLang = startLang;
  let query = '';
  let timer = null;
  let cache = { key: '', index: null };

  const eff = () => searchSettings(file);

  /** Write the file, leaving out everything that equals the default, so the file only says what the owner changed. */
  function persist() {
    for (const key of ['types', 'languages', 'synonyms']) if (file[key] && Object.keys(file[key]).length === 0) delete file[key];
    if (Object.keys(file).length === 1 && !ctx.workspace.base.has(REL)) ctx.workspace.remove(REL); else ctx.workspace.write(REL, file);
    ctx.changed();
    scheduleTest();
  }
  const setValue = (key, value) => { if (value === DEFAULT_SEARCH[key]) delete file[key]; else file[key] = value; persist(); };

  // ---- general
  const sizeError = h('p', { class: 'inline-error', role: 'alert', hidden: true });
  const sizeInput = textInput({ type: 'number', value: String(eff().pageSize) });
  sizeInput.min = String(PAGE_SIZE.min); sizeInput.max = String(PAGE_SIZE.max); sizeInput.id = 'ss-page-size';
  sizeInput.addEventListener('input', () => {
    const n = Number(sizeInput.value);
    if (!Number.isInteger(n) || n < PAGE_SIZE.min || n > PAGE_SIZE.max) { sizeError.textContent = ctx.t('ss_page_size_range', { min: PAGE_SIZE.min, max: PAGE_SIZE.max }); sizeError.hidden = false; return; }
    sizeError.hidden = true; setValue('pageSize', n);
  });

  const weightsLine = h('p', { class: 'field__hint', id: 'ss-weights' });
  const drawWeights = () => { weightsLine.textContent = WEIGHTS.map((w) => `${ctx.t(`ss_w_${w}`)} ${RANKINGS[eff().ranking][w]}`).join(' · '); };
  drawWeights();

  const typeChecks = SEARCH_TYPES.map((type) => {
    const box = checkInput({ label: ctx.t(`ss_type_${type}`), checked: eff().types[type], onChange: (v) => {
      file.types = { ...(file.types ?? {}) };
      if (v) delete file.types[type]; else file.types[type] = false;
      persist();
    } });
    box.querySelector('input').dataset.searchType = type;
    return box;
  });

  const enabledBox = checkInput({ label: ctx.t('ss_enabled'), checked: eff().enabled, onChange: (v) => setValue('enabled', v) });
  enabledBox.querySelector('input').id = 'ss-enabled';

  const general = h('div', { class: 'card' },
    h('h2', {}, ctx.t('ss_general')),
    enabledBox, h('p', { class: 'field__hint' }, ctx.t('ss_enabled_hint')),
    h('div', { class: 'field' }, h('span', { class: 'label' }, ctx.t('ss_types')), h('div', { class: 'checkgroup checkgroup--flat' }, typeChecks), h('p', { class: 'field__hint' }, ctx.t('ss_types_hint'))),
    h('div', { class: 'grid2' },
      field({ label: ctx.t('ss_page_size'), hint: ctx.t('ss_page_size_hint'), control: sizeInput }),
      field({ label: ctx.t('ss_view'), control: selectInput({ value: eff().defaultView, options: VIEWS.map((v) => ({ value: v, label: ctx.t(`ss_view_${v}`) })), onChange: (v) => setValue('defaultView', v) }) }),
      field({ label: ctx.t('ss_pagination'), control: selectInput({ value: eff().pagination, options: PAGINATION.map((v) => ({ value: v, label: ctx.t(`ss_pagination_${v}`) })), onChange: (v) => setValue('pagination', v) }) }),
      field({ label: ctx.t('ss_ranking'), control: selectInput({ value: eff().ranking, options: Object.keys(RANKINGS).map((v) => ({ value: v, label: ctx.t(`ss_ranking_${v}`) })), onChange: (v) => { setValue('ranking', v); drawWeights(); } }) })),
    sizeError, weightsLine,
    checkInput({ label: ctx.t('ss_autocomplete'), checked: eff().autocomplete, onChange: (v) => setValue('autocomplete', v) }),
    checkInput({ label: ctx.t('ss_instant'), checked: eff().instant, onChange: (v) => setValue('instant', v) }));

  // ---- how words are compared, per language
  const normalisation = h('div', { class: 'card' },
    h('h2', {}, ctx.t('ss_norm')), h('p', { class: 'muted' }, ctx.t('ss_norm_hint')),
    ...languages.map((l) => {
      const flag = (key, label) => {
        const box = checkInput({ label, checked: eff().languages?.[l.code]?.[key] ?? true, onChange: (v) => {
          file.languages = { ...(file.languages ?? {}) };
          const mine = { ...(file.languages[l.code] ?? {}) };
          if (v) delete mine[key]; else mine[key] = false;
          if (Object.keys(mine).length) file.languages[l.code] = mine; else delete file.languages[l.code];
          persist();
        } });
        box.querySelector('input').dataset.normalize = `${l.code}:${key}`;
        return box;
      };
      return h('fieldset', { class: 'langset' }, h('legend', {}, l.nativeName), flag('foldTaMarbuta', ctx.t('ss_fold_ta')), flag('stripDefiniteArticle', ctx.t('ss_strip_article')));
    }),
    h('p', { class: 'field__hint' }, ctx.t('ss_norm_always')));

  // ---- synonyms
  const synHost = h('div');
  const synTabs = h('div');
  function drawSynonyms() {
    synTabs.replaceChildren(tabs({ items: languages.map((l) => ({ value: l.code, label: l.nativeName })), active: synLang, onSelect: (code) => { synLang = code; drawSynonyms(); } }));
    const l = languages.find((x) => x.code === synLang);
    const error = h('p', { class: 'inline-error', role: 'alert', hidden: true });
    const area = textInput({ multiline: true, rows: 6, dir: l.direction, lang: l.code, value: (file.synonyms?.[synLang] ?? []).map((g) => g.join(' ')).join('\n') });
    area.id = 'ss-synonyms';
    const check = () => {
      const { groups, bad, tooMany } = parseGroups(area.value);
      error.hidden = bad.length === 0 && !tooMany;
      error.textContent = tooMany ? ctx.t('ss_syn_many', { max: MAX_SYNONYM_GROUPS }) : bad.length ? ctx.t('ss_syn_bad', { lines: bad.join(', ') }) : '';
      file.synonyms = { ...(file.synonyms ?? {}) };
      if (groups.length) file.synonyms[synLang] = groups; else delete file.synonyms[synLang];
      persist();
    };
    area.addEventListener('input', check);
    synHost.replaceChildren(field({ label: ctx.t('ss_syn_label', { language: l.nativeName }), hint: ctx.t('ss_syn_hint'), wide: true, control: area }), error);
  }
  drawSynonyms();
  const synonyms = h('div', { class: 'card' }, h('h2', {}, ctx.t('ss_syn')), h('p', { class: 'muted' }, ctx.t('ss_syn_intro')), synTabs, synHost);

  // ---- the test box
  const stats = h('p', { class: 'muted', id: 'ss-stats', role: 'status' });
  const results = h('div', { id: 'ss-results', 'aria-live': 'polite' });

  function indexFor(lang) {
    const content = ctx.content();
    const key = `${lang}|${JSON.stringify(file)}|${content.articles.length}|${ctx.workspace.staged.size}|${ctx.validation.errors.length}`;
    if (cache.key === key) return cache.index;
    const model = buildModel({ ...content, search: file }, { siteUrl: 'https://preview.invalid/', now: new Date(), mediaUrl: (asset) => asset.file });
    const L = model.langs[lang];
    if (!L) throw new Error(ctx.t('ss_test_nolang'));
    const built = buildSearchIndex(model, L, model.search);
    cache = { key, index: built };
    return built;
  }

  function runTest() {
    let built;
    try { built = indexFor(testLang); } catch (error) { stats.textContent = ''; results.replaceChildren(h('p', { class: 'notice notice--warn' }, ctx.t('ss_test_error', { message: String(error?.message ?? error) }))); return; }
    const { index, docCount, termCount } = built;
    stats.textContent = ctx.t('ss_test_stats', { docs: docCount, terms: termCount, kb: Math.max(1, Math.round(JSON.stringify(index).length / 1024)) });
    if (!query.trim()) { results.replaceChildren(h('p', { class: 'muted' }, ctx.t('ss_test_prompt'))); return; }
    const found = search(index, { q: query });
    const words = found.query.words.map((w) => w.key);
    const read = h('p', { class: 'muted small', id: 'ss-read' }, ctx.t('ss_test_read', { words: words.join(' · ') || '—', phrases: found.query.phrases.length, excluded: found.query.excluded.length }));
    if (!found.total) {
      const fix = didYouMean(index, query);
      results.replaceChildren(...[read, h('p', { class: 'notice' }, ctx.t('ss_test_none')), fix ? h('p', {}, ctx.t('ss_test_mean', { text: fix.text })) : null].filter(Boolean));
      return;
    }
    results.replaceChildren(...[
      read,
      found.partial ? h('p', { class: 'notice notice--warn' }, ctx.t('ss_test_partial')) : null,
      h('p', { class: 'muted', id: 'ss-count' }, ctx.t('ss_test_count', { n: found.total })),
      h('ol', { class: 'hits' }, found.hits.slice(0, 10).map(({ i, score }) => {
        const d = index.docs[i];
        return h('li', { class: 'hit', dataset: { type: d.y } },
          h('div', {}, chip(ctx.t(`ss_type_${d.y}`)), ' ', h('strong', {}, d.t), ' ', h('span', { class: 'muted small' }, ctx.t('ss_test_score', { score }))),
          h('div', { class: 'muted small', dir: 'ltr' }, d.u));
      }))].filter(Boolean));
  }
  function scheduleTest() { clearTimeout(timer); timer = setTimeout(runTest, 150); }

  const queryInput = textInput({ type: 'search', placeholder: ctx.t('ss_test_placeholder'), onInput: (v) => { query = v; scheduleTest(); } });
  queryInput.id = 'ss-query';
  const test = h('div', { class: 'card' },
    h('h2', {}, ctx.t('ss_test')), h('p', { class: 'muted' }, ctx.t('ss_test_intro')),
    h('div', { class: 'grid2' },
      field({ label: ctx.t('language'), control: selectInput({ value: testLang, options: languages.map((l) => ({ value: l.code, label: l.nativeName })), onChange: (v) => { testLang = v; scheduleTest(); } }) }),
      field({ label: ctx.t('ss_test_query'), hint: ctx.t('ss_test_syntax'), control: queryInput })),
    stats, results);

  async function reset() {
    const ok = await confirmDialog({ title: ctx.t('ss_reset_title'), message: ctx.t('ss_reset_message'), confirmLabel: ctx.t('ss_reset'), cancelLabel: ctx.t('cancel'), danger: true });
    if (!ok) return;
    for (const key of Object.keys(file)) if (key !== 'schemaVersion') delete file[key];
    persist();
    ctx.render();
  }

  root.append(
    h('div', { class: 'page-head' }, h('h1', {}, ctx.t('nav_search')), h('button', { type: 'button', class: 'button', id: 'search-reset', onclick: reset }, ctx.t('ss_reset'))),
    h('p', { class: 'muted' }, ctx.t('ss_intro')),
    panel.el, general, normalisation, synonyms, test,
    h('p', { class: 'muted small' }, ctx.t('unpublished_changes_note')));
  runTest();
  return { el: root, dispose: () => { clearTimeout(timer); panel.dispose(); } };
}
