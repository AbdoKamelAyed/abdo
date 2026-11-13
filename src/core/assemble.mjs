// Turns a flat map of parsed JSON files into the structured content object the validator and the
// content model work with. Pure: no file system, so the build and the browser admin share it.
//
// `files` maps a content-relative path ("articles/art_x.json") to its parsed JSON.

const REQUIRED = [
  'config/site.json', 'config/languages.json', 'config/navigation.json', 'config/homepage.json',
  'config/design.json', 'config/presets.json', 'taxonomy/topics.json', 'taxonomy/tags.json',
  'media/media.json', 'profile/author.json',
];

/**
 * @param {Map<string, any>} files
 * @param {{ label?: (rel: string) => string, mediaFileExists?: (file: string) => boolean }} [options]
 *   `label` turns a content-relative path into the path shown in error messages.
 */
export function assembleContent(files, options = {}) {
  const label = options.label ?? ((rel) => `content/${rel}`);
  const fileOf = new Map();
  const get = (rel) => {
    if (!files.has(rel)) throw new Error(`Missing required content file: ${label(rel)}`);
    const record = files.get(rel);
    fileOf.set(record, label(rel));
    return record;
  };
  for (const rel of REQUIRED) get(rel);

  const inFolder = (folder) => [...files.keys()].filter((rel) => rel.startsWith(`${folder}/`) && rel.endsWith('.json') && !rel.slice(folder.length + 1).includes('/')).sort();

  const content = { fileOf, mediaFileExists: options.mediaFileExists ?? (() => true) };
  content.site = get('config/site.json');
  content.languagesFile = get('config/languages.json');
  content.navigation = get('config/navigation.json');
  content.homepage = get('config/homepage.json');
  content.design = get('config/design.json');
  content.presetsFile = get('config/presets.json');
  content.search = files.has('config/search.json') ? get('config/search.json') : null; // optional: no file means the defaults

  content.i18n = {};
  for (const rel of inFolder('i18n')) content.i18n[rel.slice('i18n/'.length).replace(/\.json$/, '')] = get(rel);

  content.topicsFile = get('taxonomy/topics.json');
  content.tagsFile = get('taxonomy/tags.json');
  content.mediaFile = get('media/media.json');
  content.profile = get('profile/author.json');
  content.articles = inFolder('articles').map(get);
  content.projects = inFolder('projects').map(get);

  // Derived convenience arrays (same objects as in the files, so fileOf still resolves them).
  content.languages = content.languagesFile.items ?? [];
  content.presets = content.presetsFile.items ?? [];
  content.topics = content.topicsFile.items ?? [];
  content.tags = content.tagsFile.items ?? [];
  content.media = content.mediaFile.items ?? [];
  return content;
}
