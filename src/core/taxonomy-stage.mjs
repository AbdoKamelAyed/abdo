// Puts the result of a taxonomy operation (src/core/taxonomy-ops.mjs) into the workspace, one file per changed
// record. Pure apart from the workspace calls, so it is unit-tested with a real Workspace and used as is by the
// Topic Manager and the Tag Manager.

const TOPICS = 'taxonomy/topics.json';
const TAGS = 'taxonomy/tags.json';
const HOMEPAGE = 'config/homepage.json';

/**
 * @param {{ read(rel: string): any, write(rel: string, data: any): void }} workspace
 * @param {{ topics?: object[], tags?: object[], articles?: Map<string, object>, projects?: Map<string, object>, homepage?: object|null }} result
 * @returns {string[]} the files written
 */
export function stageResult(workspace, result) {
  const written = [];
  const put = (rel, data) => { workspace.write(rel, data); written.push(rel); };
  if (result.topics) put(TOPICS, { ...workspace.read(TOPICS), items: result.topics });
  if (result.tags) put(TAGS, { ...workspace.read(TAGS), items: result.tags });
  for (const [id, record] of result.articles ?? []) put(`articles/${id}.json`, record);
  for (const [id, record] of result.projects ?? []) put(`projects/${id}.json`, record);
  if (result.homepage) put(HOMEPAGE, result.homepage);
  return written;
}
