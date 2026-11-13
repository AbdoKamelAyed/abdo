// Side panels of the Studio that work on the body text: outline, writing checks, find and replace.
// Each factory returns `{ el, refresh }`; `refresh()` is called after every change (debounced by the Studio).

import { findMatches, replaceAll } from '../../shared/core/editing.mjs';
import { editorialChecks, goalProgress, outline, readability, repeatedWords, writingStats } from '../../shared/core/writing.mjs';
import { checkInput, confirmDialog, h, textInput, toast } from '../dom.mjs';

const number = (n) => Number(n).toLocaleString('en');
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, String(value)); } catch { /* storage may be blocked; the goal is then simply not remembered */ } },
};

const section = (name, title, ...children) => h('section', { class: 'panel', dataset: { panel: name } }, h('h3', {}, title), ...children);

// ---------------------------------------------------------------- outline

export function outlinePanel({ ctx, getBlocks, reveal }) {
  const list = h('ol', { class: 'outline' });
  const el = section('outline', ctx.t('panel_outline'), list);
  function refresh() {
    const heads = outline(getBlocks());
    list.replaceChildren(...(heads.length
      ? heads.map((head) => h('li', { class: `outline__item outline__item--${head.level}` },
        h('button', { type: 'button', class: 'linklike', onclick: () => reveal(head.blockIndex) }, h('span', { class: 'muted' }, `H${head.level} `), head.text || ctx.t('empty_heading'))))
      : [h('li', { class: 'muted' }, ctx.t('outline_empty'))]));
  }
  refresh();
  return { el, refresh };
}

// ---------------------------------------------------------------- writing statistics and checks

export function checksPanel({ ctx, recordId, getLang, getBlocks, getTranslation, getRecord, reveal }) {
  const goalKey = () => `abdo.goal.${recordId}.${getLang()}`;
  const readGoal = () => { const n = Number.parseInt(store.get(goalKey()) ?? '', 10); return Number.isInteger(n) && n > 0 ? n : null; };

  const tiles = h('dl', { class: 'stats' });
  const level = h('p', { class: 'small' });
  const goalInput = textInput({ type: 'number', value: readGoal() ?? '', onInput: (v) => { const n = Number.parseInt(v, 10); store.set(goalKey(), Number.isInteger(n) && n > 0 ? n : null); refresh(); } });
  goalInput.min = '0'; goalInput.step = '50'; goalInput.id = 'goal-input';
  const progress = h('progress', { max: '100', value: '0', hidden: true, 'aria-label': ctx.t('goal_label') });
  const goalText = h('p', { class: 'small muted' });
  const repeated = h('div', { class: 'small' });
  const checks = h('ul', { class: 'checks' });

  const el = section('checks', ctx.t('panel_checks'),
    tiles, level,
    h('div', { class: 'field' }, h('label', { for: 'goal-input' }, ctx.t('goal_label')), goalInput, progress, goalText),
    h('h4', {}, ctx.t('rep_title')), repeated,
    h('h4', {}, ctx.t('chk_title')), checks);

  function refresh() {
    const lang = getLang(); const blocks = getBlocks(); const tr = getTranslation();
    const wpm = ctx.languages().find((l) => l.code === lang)?.readingWpm ?? 200;
    const stats = writingStats(blocks, { wpm });
    const read = readability(blocks);

    tiles.replaceChildren(...[
      ['stat_words', number(stats.words)], ['stat_characters', number(stats.characters)], ['stat_paragraphs', number(stats.paragraphs)],
      ['stat_reading', stats.readingMinutes ? ctx.t('stat_minutes', { n: stats.readingMinutes }) : '—'],
    ].map(([key, value]) => h('div', { class: 'stats__tile' }, h('dt', {}, ctx.t(key)), h('dd', {}, value))));

    const levelKey = read.level ? `diff_${read.level}` : 'diff_unknown';
    level.replaceChildren(h('strong', {}, `${ctx.t('stat_difficulty')}: `), ctx.t(levelKey), h('span', { class: 'muted' }, ` — ${ctx.t('diff_note')}`));

    const goal = goalProgress(stats.words, readGoal());
    progress.hidden = !goal;
    if (goal) { progress.value = goal.percent; goalText.textContent = goal.reached ? ctx.t('goal_reached', { words: number(goal.words), goal: number(goal.goal) }) : ctx.t('goal_progress', { words: number(goal.words), goal: number(goal.goal), percent: goal.percent }); } else goalText.textContent = ctx.t('goal_hint');

    const rep = repeatedWords(blocks);
    repeated.replaceChildren(...(rep.frequent.length || rep.doubled.length
      ? [
        rep.frequent.length ? h('p', {}, rep.frequent.map((f) => h('span', { class: 'chip' }, `${f.word} ×${f.count}`))) : null,
        ...rep.doubled.map((d) => h('p', { class: 'check-item check-item--warn' }, ctx.t('rep_doubled', { word: d.word, n: d.blockIndex + 1 }), ' ', h('button', { type: 'button', class: 'linklike', onclick: () => reveal(d.blockIndex) }, ctx.t('go_to_block', { n: d.blockIndex + 1 })))),
      ]
      : [h('p', { class: 'muted' }, ctx.t('rep_none'))]));

    const found = editorialChecks({ blocks, title: tr.title ?? '', excerpt: tr.excerpt ?? '', seoTitle: tr.seo?.title, seoDescription: tr.seo?.description, hasCover: Boolean(getRecord().coverMediaId) });
    checks.replaceChildren(...(found.length
      ? found.map((c) => { const key = `chk_${c.code}`; return h('li', { class: `check-item check-item--${c.level}`, dataset: { check: c.code } }, ctx.t(key, c.params), c.blockIndex != null ? [' ', h('button', { type: 'button', class: 'linklike', onclick: () => reveal(c.blockIndex) }, ctx.t('go_to_block', { n: c.blockIndex + 1 }))] : null); })
      : [h('li', { class: 'muted' }, ctx.t('chk_none'))]));
  }
  refresh();
  return { el, refresh, onLanguageChange: () => { goalInput.value = readGoal() ?? ''; refresh(); } };
}

// ---------------------------------------------------------------- find and replace

export function findPanel({ ctx, getBlocks, getEditor, reveal }) {
  const state = { query: '', replacement: '', caseSensitive: false, wholeWord: false };
  const results = h('ul', { class: 'finds' });
  const summary = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const replaceButton = h('button', { type: 'button', class: 'button button--small', id: 'replace-all', disabled: true, onclick: replace }, ctx.t('replace_all'));

  const queryInput = textInput({ onInput: (v) => { state.query = v; refresh(); } });
  queryInput.id = 'find-query'; queryInput.setAttribute('type', 'search');
  const replaceInput = textInput({ onInput: (v) => { state.replacement = v; } });
  replaceInput.id = 'find-replacement';

  const el = section('find', ctx.t('panel_find'),
    h('div', { class: 'field' }, h('label', { for: 'find-query' }, ctx.t('find_label')), queryInput),
    h('div', { class: 'field' }, h('label', { for: 'find-replacement' }, ctx.t('replace_label')), replaceInput),
    checkInput({ label: ctx.t('find_case'), checked: false, onChange: (v) => { state.caseSensitive = v; refresh(); } }),
    checkInput({ label: ctx.t('find_word'), checked: false, onChange: (v) => { state.wholeWord = v; refresh(); } }),
    summary, results, replaceButton, h('p', { class: 'small muted' }, ctx.t('find_code_note')));

  const options = () => ({ caseSensitive: state.caseSensitive, wholeWord: state.wholeWord });
  function refresh() {
    const hits = findMatches(getBlocks(), state.query, options());
    const total = hits.reduce((n, hit) => n + hit.count, 0);
    summary.textContent = state.query ? (total ? ctx.t('find_count', { n: total }) : ctx.t('find_none')) : '';
    replaceButton.disabled = total === 0;
    results.replaceChildren(...hits.slice(0, 60).map((hit) => h('li', {}, h('button', { type: 'button', class: 'linklike', onclick: () => reveal(hit.blockIndex) }, h('strong', {}, ctx.t('go_to_block', { n: hit.blockIndex + 1 })), ' ', h('span', { dir: 'auto' }, `…${hit.excerpt}…`)))));
  }

  async function replace() {
    const editor = getEditor();
    const total = findMatches(editor.blocks, state.query, options()).reduce((n, hit) => n + hit.count, 0);
    if (!total) return;
    const ok = await confirmDialog({ title: ctx.t('replace_all'), message: ctx.t('replace_confirm', { n: total, find: state.query, replacement: state.replacement || ctx.t('replace_nothing') }), confirmLabel: ctx.t('replace_all'), cancelLabel: ctx.t('cancel') });
    if (!ok) return;
    let count = 0;
    editor.apply(() => { const next = replaceAll(editor.blocks, state.query, state.replacement, options()); count = next.count; editor.blocks.splice(0, editor.blocks.length, ...next.blocks); });
    toast(ctx.t('replaced', { n: count }), 'info');
    refresh();
  }
  return { el, refresh };
}
