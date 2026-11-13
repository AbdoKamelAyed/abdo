import { overview } from '../../shared/core/content-ops.mjs';
import { chip, h } from '../dom.mjs';

export function renderOverview(ctx) {
  const content = ctx.content();
  const o = overview(content);
  const tile = (label, value, href) => h(href ? 'a' : 'div', { class: 'tile', href }, h('strong', {}, String(value)), h('span', {}, label));
  const topicName = (id) => { const topic = content.topics.find((x) => x.id === id); return topic ? ctx.titleOf(topic.translations, 'name') : id; };

  const staged = ctx.workspace.staged.size;
  const errors = ctx.validation.errors.length;
  const notes = [];
  if (!ctx.repoCheck.isPrivate) notes.push(h('div', { class: 'notice notice--warn' }, ctx.t('public_repo_notice')));
  if (ctx.repoCheck.canWrite === null) notes.push(h('div', { class: 'notice' }, ctx.t('write_unknown_notice')));
  if (content.profile.sample === true) notes.push(h('div', { class: 'notice notice--warn' }, ctx.t('sample_profile_notice'), ' ', h('a', { href: '#/profile' }, ctx.t('nav_profile'))));

  const el = h('div', {},
    h('h1', {}, ctx.t('nav_overview')),
    ...notes,
    h('div', { class: 'tiles' },
      tile(ctx.t('stat_published_articles'), o.articles.published, '#/articles'),
      tile(ctx.t('stat_published_projects'), o.projects.published, '#/projects'),
      tile(ctx.t('stat_drafts'), o.articles.drafts + o.projects.drafts),
      tile(ctx.t('stat_scheduled'), o.scheduled),
      tile(ctx.t('stat_unpublished_changes'), staged, '#/publish'),
      tile(ctx.t('stat_problems'), errors, '#/publish')),
    h('div', { class: 'columns' },
      h('section', { class: 'card' }, h('h2', {}, ctx.t('by_language')),
        h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, ctx.t('language')), h('th', {}, ctx.t('nav_articles')), h('th', {}, ctx.t('nav_projects')))),
          h('tbody', {}, Object.entries(o.byLanguage).map(([code, n]) => h('tr', {}, h('td', {}, ctx.langName(code)), h('td', {}, String(n.articles)), h('td', {}, String(n.projects))))))),
      h('section', { class: 'card' }, h('h2', {}, ctx.t('by_topic')),
        o.byTopic.length ? h('ul', { class: 'plain' }, o.byTopic.map((x) => h('li', {}, topicName(x.id), ' ', chip(String(x.count))))) : h('p', { class: 'muted' }, ctx.t('no_data')))),
    h('section', { class: 'card' }, h('h2', {}, ctx.t('recent_updates')),
      h('ul', { class: 'plain' }, o.recent.map((r) => h('li', {}, h('a', { href: `#/${r.kind === 'article' ? 'articles' : 'projects'}/${r.id}` }, ctx.titleOf(r.translations)), ' ', chip(ctx.t(`status_${r.status}`), r.status === 'published' ? 'ok' : ''), ' ', h('span', { class: 'muted', dir: 'ltr' }, r.updatedAt.slice(0, 10)))))));
  return { el };
}
