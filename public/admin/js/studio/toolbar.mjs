// The inline formatting toolbar that sits above every markup-aware text field.
//
// It never touches the page's HTML: it rewrites the field's text (the site's small markup language) with
// the pure helpers in core/editing.mjs and then fires the field's own "input" event, so the change flows
// through the same path as typing (model, undo history, preview).

import { SPECIAL_CHARACTERS, addFootnoteDefinition, insertText, linkProblem, makeLink, nextFootnoteKey, removeLink, toggleFormat } from '../../shared/core/editing.mjs';
import { newId } from '../../shared/core/ids.mjs';
import { shiftLines } from '../../shared/core/lists.mjs';
import { usedIds } from '../../shared/core/content-ops.mjs';
import { field, h, modal, textInput, toast } from '../dom.mjs';

const BUTTONS = [
  { kind: 'bold', glyph: 'B', label: 'tb_bold', key: 'b' },
  { kind: 'italic', glyph: 'I', label: 'tb_italic', key: 'i' },
  { kind: 'underline', glyph: 'U', label: 'tb_underline', key: 'u' },
  { kind: 'strike', glyph: 'S', label: 'tb_strike' },
  { kind: 'mark', glyph: 'H', label: 'tb_mark' },
  { kind: 'code', glyph: '</>', label: 'tb_code' },
  { kind: 'sup', glyph: 'x²', label: 'tb_sup' },
  { kind: 'sub', glyph: 'x₂', label: 'tb_sub' },
];

/**
 * @param {{ ctx: object, input: HTMLInputElement|HTMLTextAreaElement, blocks: object[], seal: () => void, structural: (fn: () => void) => void }} args
 *   `blocks` is the body being edited (footnotes are added to it); `structural` applies a change that adds or
 *   removes blocks (it records undo history and redraws the editor).
 * @returns {HTMLElement} the toolbar; call `shortcuts()` result is installed on the input already
 */
export function inlineToolbar({ ctx, input, blocks, seal, structural, nested = false }) {
  const fire = (result) => {
    if (!result.changed) return false;
    seal();
    input.value = result.value;
    input.focus();
    input.setSelectionRange(result.start, result.end);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  function indent(delta) {
    const [s, e] = selection();
    const result = shiftLines(input.value, s, e, delta);
    fire({ changed: result.text !== input.value, value: result.text, start: result.start, end: result.end });
  }
  const selection = () => [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length];

  function format(kind) {
    const [s, e] = selection();
    const result = toggleFormat(input.value, s, e, kind);
    if (!fire(result) && result.reason === 'spaces') toast(ctx.t('tb_no_spaces'), 'error');
  }

  async function link() {
    const [s, e] = selection();
    const label = input.value.slice(s, e);
    let url = '';
    const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const address = textInput({ dir: 'ltr', placeholder: 'https://', onInput: (v) => { url = v.trim(); } });
    const submit = (close) => () => {
      const problem = linkProblem(url);
      if (problem) { const key = `link_problem_${problem}`; error.textContent = ctx.t(key); error.hidden = false; return; }
      close(url);
    };
    const result = await modal({
      title: ctx.t('tb_link'),
      body: h('div', {}, label ? h('p', { class: 'muted' }, `“${label}”`) : null, field({ label: ctx.t('link_dialog_address'), hint: ctx.t('link_dialog_hint'), control: address, wide: true }), error),
      actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')), h('button', { type: 'button', class: 'button button--primary', id: 'link-confirm', onclick: submit(close) }, ctx.t('tb_link'))],
    });
    if (result) fire(makeLink(input.value, s, e, result));
    else input.focus();
  }

  async function footnote() {
    const [, e] = selection();
    let text = '';
    const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const result = await modal({
      title: ctx.t('tb_footnote'),
      body: h('div', {}, field({ label: ctx.t('footnote_text'), control: textInput({ multiline: true, rows: 3, dir: input.dir || undefined, lang: input.lang || undefined, onInput: (v) => { text = v.trim(); } }), wide: true }), error),
      actions: (close) => [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel')), h('button', { type: 'button', class: 'button button--primary', id: 'footnote-confirm', onclick: () => { if (!text) { error.textContent = ctx.t('footnote_text_required'); error.hidden = false; return; } close(text); } }, ctx.t('tb_footnote'))],
    });
    if (!result) { input.focus(); return; }
    const key = nextFootnoteKey(blocks);
    // Adding the definition may create a footnotes block, so this is a structural change; the reference goes in first.
    seal();
    structural(() => {
      const next = insertText(input.value, e, e, `[^${key}]`);
      input.value = next.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      addFootnoteDefinition(blocks, key, result, newId('block', usedIds(ctx.content())));
    });
  }

  const special = h('details', { class: 'tb__special' },
    h('summary', { 'aria-label': ctx.t('tb_special'), title: ctx.t('tb_special') }, 'Ω'),
    h('div', { class: 'tb__chars' }, SPECIAL_CHARACTERS.map((group) => h('div', { class: 'tb__group' }, group.chars.map((entry) => {
      const char = typeof entry === 'string' ? entry : entry.char;
      const name = typeof entry === 'string' ? `${char} U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}` : ctx.t(entry.name);
      return h('button', { type: 'button', class: 'button button--small', 'aria-label': name, title: name, onclick: () => { const [s, e] = selection(); fire(insertText(input.value, s, e, char)); special.open = false; } }, typeof entry === 'string' ? char : '␣');
    })))));

  const bar = h('div', { class: 'tb', role: 'toolbar', 'aria-label': ctx.t('tb_label') },
    ...BUTTONS.map((b) => h('button', { type: 'button', class: `button button--small tb__${b.kind}`, dataset: { format: b.kind }, 'aria-label': ctx.t(b.label), title: ctx.t(b.label), onmousedown: (event) => event.preventDefault(), onclick: () => format(b.kind) }, b.glyph)),
    h('button', { type: 'button', class: 'button button--small', dataset: { format: 'link' }, 'aria-label': ctx.t('tb_link'), title: ctx.t('tb_link'), onmousedown: (event) => event.preventDefault(), onclick: link }, ctx.t('tb_link_short')),
    h('button', { type: 'button', class: 'button button--small', dataset: { format: 'unlink' }, 'aria-label': ctx.t('tb_unlink'), title: ctx.t('tb_unlink'), onmousedown: (event) => event.preventDefault(), onclick: () => { fire(removeLink(input.value, selection()[0])); } }, ctx.t('tb_unlink_short')),
    h('button', { type: 'button', class: 'button button--small', dataset: { format: 'footnote' }, 'aria-label': ctx.t('tb_footnote'), title: ctx.t('tb_footnote'), onmousedown: (event) => event.preventDefault(), onclick: footnote }, '[¹]'),
    special,
    ...(nested ? [
      h('button', { type: 'button', class: 'button button--small', dataset: { indent: 'out' }, 'aria-label': ctx.t('tb_outdent'), title: `${ctx.t('tb_outdent')} (Ctrl+[)`, onmousedown: (event) => event.preventDefault(), onclick: () => indent(-1) }, ctx.t('tb_outdent_short')),
      h('button', { type: 'button', class: 'button button--small', dataset: { indent: 'in' }, 'aria-label': ctx.t('tb_indent'), title: `${ctx.t('tb_indent')} (Ctrl+])`, onmousedown: (event) => event.preventDefault(), onclick: () => indent(1) }, ctx.t('tb_indent_short')),
    ] : []));

  input.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    // Physical key codes, so the shortcuts also work while an Arabic keyboard layout is active.
    const hit = BUTTONS.find((b) => b.key && event.code === `Key${b.key.toUpperCase()}`);
    if (hit) { event.preventDefault(); format(hit.kind); return; }
    if (event.code === 'KeyK') { event.preventDefault(); link(); }
    if (nested && event.code === 'BracketRight') { event.preventDefault(); indent(1); }
    if (nested && event.code === 'BracketLeft') { event.preventDefault(); indent(-1); }
  });
  return bar;
}
