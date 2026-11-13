// "Start from a template": a picker of the twelve article outlines. Resolves with the chosen template id,
// or null when dismissed. Applying it is the caller's job (so it can be undone like any other change).

import { TEMPLATES, templateDescription, templateName } from '../../shared/core/templates.mjs';
import { h, modal } from '../dom.mjs';

/** @returns {Promise<string|null>} */
export function pickTemplate(ctx, { replacing = false } = {}) {
  let choose;
  return modal({
    title: ctx.t('tpl_title'),
    body: h('div', {},
      h('p', { class: 'muted' }, ctx.t(replacing ? 'tpl_hint_replace' : 'tpl_hint')),
      h('div', { class: 'templates' }, TEMPLATES.map((t) => h('button', { type: 'button', class: 'template', dataset: { template: t.id }, onclick: () => choose(t.id) },
        h('strong', {}, templateName(t, ctx.ui)), h('span', { class: 'small muted' }, templateDescription(t, ctx.ui)))))),
    actions: (close) => { choose = close; return [h('button', { type: 'button', class: 'button', onclick: () => close(null) }, ctx.t('cancel'))]; },
  });
}
