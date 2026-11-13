// Homepage Builder logic: what each kind of section can be set to, and the operations on a language's
// list of sections (add, duplicate, remove, hide, reorder, change). Pure functions that return new lists; the
// builder screen and the tests share them. The shapes match `homepageSection` in schemas/config.schema.json.
//
// Each language has its own list. Nothing here knows about the other language.

import { newId } from './ids.mjs';

export const SECTION_TYPES = ['featured', 'articles', 'projects', 'topics', 'highlights', 'follow'];
export const RATIOS = ['16:9', '4:3', '3:2', '1:1', '3:4'];
export const SPACINGS = ['compact', 'normal', 'relaxed'];
export const LIMIT_RANGE = Object.freeze({ min: 1, max: 12 });

/**
 * Which settings each kind of section really has (a setting the page renderer ignores is not offered).
 * `layouts` is the list the renderer understands; the first is the default.
 */
export const SECTION_SPECS = {
  featured: { layouts: ['split', 'overlay'], fields: ['title', 'layout', 'imageRatio', 'kind', 'itemId', 'featuredOnly'], defaults: { layout: 'split', imageRatio: '3:2', source: { kind: 'any', featuredOnly: true } } },
  articles: { layouts: ['grid', 'editorial', 'list'], fields: ['title', 'intro', 'layout', 'limit', 'imageRatio', 'spacing', 'featuredOnly', 'topicIds', 'templates'], defaults: { layout: 'grid', limit: 6, imageRatio: '3:2' } },
  projects: { layouts: ['grid', 'list'], fields: ['title', 'intro', 'layout', 'limit', 'imageRatio', 'spacing', 'featuredOnly', 'topicIds'], defaults: { layout: 'grid', limit: 3, imageRatio: '4:3' } },
  topics: { layouts: [], fields: ['title', 'intro', 'limit', 'spacing'], defaults: { limit: 6 } },
  highlights: { layouts: [], fields: ['title', 'intro', 'spacing'], defaults: {} },
  follow: { layouts: [], fields: ['title', 'intro', 'spacing'], defaults: {} },
};

/**
 * Ready-made sections, named after the kinds of content the site is meant to show. Each is an ordinary
 * section once added; the title is left out so it follows the interface language unless the preset has its own.
 */
export const SECTION_PRESETS = [
  { id: 'featured', type: 'featured', set: {} },
  { id: 'latest_articles', type: 'articles', set: { layout: 'editorial', limit: 5 } },
  { id: 'featured_topics', type: 'topics', set: {} },
  { id: 'featured_portfolio', type: 'projects', set: { layout: 'grid', limit: 3, source: { featuredOnly: true } } },
  { id: 'latest_projects', type: 'projects', set: { layout: 'list', limit: 3 } },
  { id: 'insights', type: 'articles', set: { layout: 'list', limit: 4, source: { templates: ['personal-journal', 'opinion'] } }, titles: { ar: 'رؤى شخصية', en: 'Personal insights' } },
  { id: 'highlights', type: 'highlights', set: {} },
  { id: 'follow', type: 'follow', set: {} },
];

const clone = (v) => structuredClone(v);
const indexOf = (sections, id) => sections.findIndex((s) => s.id === id);

/** A section with only meaningful settings kept: no empty text, no empty lists, a limit within range, a layout the type knows. */
export function normalizeSection(section) {
  const spec = SECTION_SPECS[section.type];
  const out = clone(section);
  for (const key of ['title', 'intro']) if (typeof out[key] === 'string') { out[key] = out[key].trim(); if (!out[key]) delete out[key]; }
  if (out.limit !== undefined) {
    const n = Math.round(Number(out.limit));
    if (Number.isFinite(n)) out.limit = Math.max(LIMIT_RANGE.min, Math.min(LIMIT_RANGE.max, n)); else delete out.limit;
  }
  if (!spec.fields.includes('limit')) delete out.limit;
  if (spec.layouts.length === 0 || (out.layout && !spec.layouts.includes(out.layout))) delete out.layout;
  if (!spec.fields.includes('imageRatio') || !RATIOS.includes(out.imageRatio)) delete out.imageRatio;
  if (!spec.fields.includes('spacing') || !SPACINGS.includes(out.spacing) || out.spacing === 'normal') delete out.spacing;
  if (out.source) {
    const s = out.source;
    for (const key of ['topicIds', 'templates']) if (!Array.isArray(s[key]) || s[key].length === 0) delete s[key];
    if (!s.itemId) delete s.itemId;
    if (s.featuredOnly !== true) delete s.featuredOnly;
    if (!['article', 'project', 'any'].includes(s.kind)) delete s.kind;
    if (Object.keys(s).length === 0) delete out.source;
  }
  return out;
}

/** A new section of `kind` (a type or a preset id), with its own unused ID. The caller passes every ID already in use. */
export function newSection(kind, lang, taken = []) {
  const preset = SECTION_PRESETS.find((p) => p.id === kind);
  const type = preset?.type ?? kind;
  const spec = SECTION_SPECS[type];
  if (!spec) throw new Error(`Unknown section kind "${kind}"`);
  const section = { id: newId('section', taken), type, enabled: true, ...clone(spec.defaults), ...clone(preset?.set ?? {}) };
  if (spec.defaults.source || preset?.set.source) section.source = { ...clone(spec.defaults.source ?? {}), ...clone(preset?.set.source ?? {}) };
  const title = preset?.titles?.[lang];
  if (title) section.title = title;
  return normalizeSection(section);
}

/** Insert `section` after the section with id `afterId` (or at the end). */
export function insertSection(sections, section, afterId = null) {
  const next = clone(sections);
  const at = afterId ? indexOf(next, afterId) + 1 : next.length;
  next.splice(at > 0 ? at : next.length, 0, section);
  return next;
}

export function duplicateSection(sections, id, taken = []) {
  const i = indexOf(sections, id);
  if (i < 0) throw new Error(`There is no section "${id}".`);
  const copy = { ...clone(sections[i]), id: newId('section', taken) };
  const next = clone(sections);
  next.splice(i + 1, 0, copy);
  return { sections: next, id: copy.id };
}

export const removeSection = (sections, id) => sections.filter((s) => s.id !== id);

export const setEnabled = (sections, id, enabled) => sections.map((s) => (s.id === id ? { ...s, enabled: Boolean(enabled) } : s));

/** Move a section to position `to` (0-based; clamped). */
export function moveSection(sections, id, to) {
  const from = indexOf(sections, id);
  if (from < 0) return clone(sections);
  const next = clone(sections);
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}
export const moveBy = (sections, id, delta) => moveSection(sections, id, indexOf(sections, id) + delta);

/** Replace one section with a changed copy (settings are normalised). `change` receives a copy it may edit. */
export function updateSection(sections, id, change) {
  return sections.map((s) => {
    if (s.id !== id) return s;
    const copy = clone(s);
    change(copy);
    return normalizeSection(copy);
  });
}

/**
 * A copy of one language's sections for use in another: same structure and sources, new IDs, and without the
 * titles and intros, which are written in the first language.
 */
export function copyStructure(sections, taken = []) {
  const used = new Set(taken);
  return sections.map((s) => {
    const id = newId('section', used);
    used.add(id);
    const copy = { ...clone(s), id };
    delete copy.title;
    delete copy.intro;
    return copy;
  });
}
