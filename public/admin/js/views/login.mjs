import { checkInput, field, h, textInput } from '../dom.mjs';

export function renderLogin(ctx, { onLogin, repo }) {
  const values = { owner: repo?.owner ?? '', repo: repo?.repo ?? '', branch: repo?.branch ?? 'main', token: '', remember: false };
  const status = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'button button--primary' }, ctx.t('sign_in'));

  const tokenInput = textInput({ type: 'password', onInput: (v) => { values.token = v.trim(); } });
  tokenInput.autocomplete = 'off';
  tokenInput.id = 'token';

  const form = h('form', { class: 'card login', novalidate: true, onsubmit: async (event) => {
    event.preventDefault();
    status.hidden = true;
    if (!values.token || !values.owner || !values.repo || !values.branch) { status.textContent = ctx.t('login_missing'); status.hidden = false; return; }
    submit.disabled = true; submit.textContent = ctx.t('signing_in');
    try { await onLogin({ ...values }); } catch (error) { status.textContent = error.message; status.hidden = false; } finally { submit.disabled = false; submit.textContent = ctx.t('sign_in'); }
  } },
    h('h1', {}, ctx.t('login_title')),
    h('p', {}, ctx.t('login_intro')),
    h('div', { class: 'grid2' },
      field({ label: ctx.t('repo_owner'), control: textInput({ value: values.owner, dir: 'ltr', onInput: (v) => { values.owner = v.trim(); } }) }),
      field({ label: ctx.t('repo_name'), control: textInput({ value: values.repo, dir: 'ltr', onInput: (v) => { values.repo = v.trim(); } }) })),
    field({ label: ctx.t('repo_branch'), control: textInput({ value: values.branch, dir: 'ltr', onInput: (v) => { values.branch = v.trim(); } }) }),
    field({ label: ctx.t('access_token'), hint: ctx.t('token_hint'), control: tokenInput }),
    checkInput({ label: ctx.t('remember_tab'), checked: false, onChange: (v) => { values.remember = v; } }),
    status, submit,
    h('details', { class: 'help' }, h('summary', {}, ctx.t('token_help_title')), h('ol', {}, ctx.t('token_help_steps').split('|').map((step) => h('li', {}, step)))));
  return { el: h('div', { class: 'login-wrap' }, form) };
}
