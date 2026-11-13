// Tiny DOM toolkit for the admin. Nothing in the admin ever uses innerHTML: every piece of text,
// including all content loaded from the repository, is inserted as a text node, so content can
// never become markup or script. (A test scans the admin sources to keep it that way.)

let uid = 0;
export const nextId = (prefix = 'f') => `${prefix}${(uid += 1)}`;

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (key === 'class') el.className = v;
    else if (key === 'value') value = v;
    else if (key === 'checked') el.checked = true;
    else if (key === 'dataset') Object.assign(el.dataset, v);
    else if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v);
    else el.setAttribute(key, v === true ? '' : String(v));
  }
  append(el, children);
  if (value !== undefined) el.value = value; // after <option>s exist
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// ---------------------------------------------------------------- messages

export function toast(message, kind = 'info') {
  const host = document.getElementById('toasts');
  const item = h('div', { class: `toast toast--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  host.append(item);
  setTimeout(() => item.remove(), kind === 'error' ? 9000 : 4000);
}

/** Opens a <dialog>; resolves with the value passed to close(), or null when dismissed. */
export function modal({ title, body, actions, dir }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'modal', dir, 'aria-labelledby': 'modal-title' });
    const close = (value = null) => { dialog.close(); dialog.remove(); resolve(value); };
    append(dialog, [h('h2', { id: 'modal-title' }, title), h('div', { class: 'modal__body' }, body), h('div', { class: 'modal__actions' }, actions(close))]);
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false }) {
  return modal({
    title,
    body: h('p', {}, message),
    actions: (close) => [
      h('button', { type: 'button', class: 'button', onclick: () => close(false) }, cancelLabel),
      h('button', { type: 'button', class: `button ${danger ? 'button--danger' : 'button--primary'}`, onclick: () => close(true) }, confirmLabel),
    ],
  }).then((v) => v === true);
}

// ---------------------------------------------------------------- form controls

/** A labelled control. `path` links the field to validation messages ("translations.en.title"). */
export function field({ label, hint, path, control, wide = false }) {
  const id = control.id || nextId();
  if (!control.id && 'id' in control) control.id = id;
  const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const wrap = h('div', { class: `field${wide ? ' field--wide' : ''}`, dataset: path ? { path } : {} },
    h('label', { for: id }, label),
    control,
    hint ? h('p', { class: 'field__hint' }, hint) : null,
    error);
  return wrap;
}

export function textInput({ value = '', onInput, maxLength, dir, lang, multiline = false, rows = 4, placeholder, type = 'text', required = false }) {
  const el = h(multiline ? 'textarea' : 'input', { type: multiline ? null : type, rows: multiline ? rows : null, maxlength: maxLength, dir, lang, placeholder, required: required || null, autocomplete: 'off', spellcheck: 'true' });
  el.value = value ?? '';
  if (onInput) el.addEventListener('input', () => onInput(el.value));
  return el;
}

export function selectInput({ value, options, onChange }) {
  const el = h('select', {}, options.map((o) => h('option', { value: o.value }, o.label)));
  el.value = value ?? options[0]?.value ?? '';
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function checkInput({ label, checked, onChange }) {
  const id = nextId();
  const box = h('input', { type: 'checkbox', id, checked: checked || null });
  box.addEventListener('change', () => onChange(box.checked));
  return h('div', { class: 'check' }, box, h('label', { for: id }, label));
}

/** A group of checkboxes for choosing several items (topics, tags...). */
export function checkGroup({ options, selected, onChange, emptyText }) {
  const chosen = new Set(selected);
  if (!options.length) return h('p', { class: 'field__hint' }, emptyText ?? '');
  return h('div', { class: 'checkgroup' }, options.map((o) => {
    const id = nextId();
    const box = h('input', { type: 'checkbox', id, checked: chosen.has(o.value) || null });
    box.addEventListener('change', () => {
      if (box.checked) chosen.add(o.value); else chosen.delete(o.value);
      onChange(options.map((x) => x.value).filter((v) => chosen.has(v)));
    });
    return h('div', { class: 'check' }, box, h('label', { for: id }, o.label));
  }));
}

/** One string per line. */
export function linesInput({ value = [], onInput, dir, rows = 4 }) {
  const el = h('textarea', { rows, dir, spellcheck: 'true' });
  el.value = value.join('\n');
  el.addEventListener('input', () => onInput(el.value.split('\n').map((s) => s.trim()).filter(Boolean)));
  return el;
}

export function tabs({ items, active, onSelect }) {
  const list = h('div', { class: 'tabs', role: 'tablist' });
  for (const item of items) {
    list.append(h('button', { type: 'button', role: 'tab', class: `tab${item.value === active ? ' is-active' : ''}`, 'aria-selected': String(item.value === active), onclick: () => onSelect(item.value) }, item.label));
  }
  return list;
}

export const chip = (text, kind = '') => h('span', { class: `chip${kind ? ` chip--${kind}` : ''}` }, text);

export function fileToBytes(file) {
  return file.arrayBuffer().then((b) => new Uint8Array(b));
}

export function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
