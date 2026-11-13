// "Related" recommendations without AI: only what the owner filed. The rules are deliberately simple and
// explained on the Topic Manager screen, so the result is never a surprise.
//
//   content related to content   shared topics count 3 each, shared tags 1 each, and a topic that is the parent or
//                                a sub-topic of one of the other's topics counts 1
//   topics related to a topic    the ones the owner chose first (in the order chosen), then sibling topics
//                                (same parent), then topics that often appear on the same content
//   tags related to a tag        the ones the owner chose first, then tags that appear on the same content
//
// Every list is stable: equal scores are ordered by the caller's tie-break (newest first for content, ID otherwise).

const WEIGHT = Object.freeze({ topic: 3, tag: 1, nearTopic: 1, sibling: 5, together: 2 });

/** @param {{ id: string, parentId?: string|null }[]} topics */
export function topicRelations(topics) {
  const parent = new Map(topics.map((t) => [t.id, t.parentId ?? null]));
  return { parent, near: (a, b) => parent.get(a) === b || parent.get(b) === a };
}

/** How strongly two pieces of content belong together (0 = not related). */
export function relatedScore(a, b, relations) {
  const bt = new Set(b.topicIds ?? []);
  const bg = new Set(b.tagIds ?? []);
  let score = 0;
  for (const id of a.topicIds ?? []) {
    if (bt.has(id)) score += WEIGHT.topic;
    else if ([...bt].some((other) => relations?.near(id, other))) score += WEIGHT.nearTopic;
  }
  for (const id of a.tagIds ?? []) if (bg.has(id)) score += WEIGHT.tag;
  return score;
}

/** The best matches for `item` from `pool`, never the item itself. `tieBreak(a, b)` orders equal scores. */
export function relatedItems(item, pool, { limit = 3, relations, tieBreak = (x, y) => x.id.localeCompare(y.id) } = {}) {
  return pool
    .filter((other) => other.id !== item.id)
    .map((other) => ({ other, s: relatedScore(item, other, relations) }))
    .filter((r) => r.s > 0)
    .sort((x, y) => y.s - x.s || tieBreak(x.other, y.other))
    .slice(0, limit)
    .map((r) => r.other);
}

/**
 * Topics related to `topic`. `explicitIds` are the owner's choices; `topics` is the pool (only topics that can be
 * shown); `items` is the content, for "appears together".
 */
export function relatedTopics(topic, topics, items, { limit = 6 } = {}) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const out = [];
  const seen = new Set([topic.id]);
  for (const id of topic.relatedTopicIds ?? []) if (byId.has(id) && !seen.has(id)) { seen.add(id); out.push(byId.get(id)); }
  const score = new Map();
  for (const t of topics) if (!seen.has(t.id) && (t.parentId ?? null) === (topic.parentId ?? null) && t.parentId) score.set(t.id, WEIGHT.sibling);
  for (const item of items) {
    if (!(item.topicIds ?? []).includes(topic.id)) continue;
    for (const id of item.topicIds) if (id !== topic.id && byId.has(id) && !seen.has(id)) score.set(id, (score.get(id) ?? 0) + WEIGHT.together);
  }
  const rest = [...score].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => byId.get(id));
  return [...out, ...rest].slice(0, limit);
}

/** Tags related to `tag`: the owner's choices, then tags that are used on the same content. */
export function relatedTags(tag, tags, items, { limit = 8 } = {}) {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const out = [];
  const seen = new Set([tag.id]);
  for (const id of tag.relatedTagIds ?? []) if (byId.has(id) && !seen.has(id)) { seen.add(id); out.push(byId.get(id)); }
  const score = new Map();
  for (const item of items) {
    if (!(item.tagIds ?? []).includes(tag.id)) continue;
    for (const id of item.tagIds) if (id !== tag.id && byId.has(id) && !seen.has(id)) score.set(id, (score.get(id) ?? 0) + 1);
  }
  const rest = [...score].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => byId.get(id));
  return [...out, ...rest].slice(0, limit);
}
