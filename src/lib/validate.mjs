// Node-side loading of the content tree from disk, on top of the pure core.
//
// The validation rules live in src/core/validate-core.mjs so the browser admin can run them too.

import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assembleContent } from '../core/assemble.mjs';
import { createRegistryFromSchemas } from '../core/registry.mjs';
import { listFiles, readJson } from './util.mjs';

export { formatProblems, validateContent } from '../core/validate-core.mjs';

export function createRegistry(rootDir) {
  const schemas = listFiles(join(rootDir, 'schemas'), '.schema.json').map((name) => readJson(join(rootDir, 'schemas', name)));
  return createRegistryFromSchemas(schemas);
}

/**
 * Load every content file. Missing optional folders are treated as empty; malformed JSON
 * throws immediately with the file name.
 */
export function loadContent(rootDir, contentDir = join(rootDir, 'content')) {
  const files = new Map();
  const walk = (folder, extension = '.json') => {
    for (const name of listFiles(join(contentDir, folder), extension)) {
      files.set(`${folder}/${name}`, readJson(join(contentDir, folder, name)));
    }
  };
  for (const folder of ['config', 'i18n', 'taxonomy', 'media', 'profile', 'articles', 'projects']) walk(folder);
  return assembleContent(files, {
    label: (rel) => relative(rootDir, join(contentDir, rel)),
    mediaFileExists: (file) => existsSync(join(contentDir, 'media', 'files', file)),
  });
}
