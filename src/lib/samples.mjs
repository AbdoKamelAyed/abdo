// Support for `--exclude-samples`: build the site without any placeholder content.
//
// Content marked `"sample": true` is removed before validation, so anything that still points at
// it (a real article that uses a sample topic, say) is reported as a normal "unknown reference"
// error instead of silently publishing a half-broken site.

export function stripSamples(content) {
  const keep = (item) => !item.sample;
  const profile = structuredClone(content.profile);
  const copy = {
    ...content,
    articles: content.articles.filter(keep),
    projects: content.projects.filter(keep),
    topics: content.topics.filter(keep),
    tags: content.tags.filter(keep),
    media: content.media.filter(keep),
    profile,
  };
  for (const key of ['experience', 'education', 'skills', 'customSections']) {
    if (profile[key]) profile[key] = profile[key].filter(keep);
  }
  // Keep the file-level wrappers consistent so validation and error messages see the same data.
  copy.topicsFile = { ...content.topicsFile, items: copy.topics };
  copy.tagsFile = { ...content.tagsFile, items: copy.tags };
  copy.mediaFile = { ...content.mediaFile, items: copy.media };
  for (const [from, to] of [[content.topicsFile, copy.topicsFile], [content.tagsFile, copy.tagsFile], [content.mediaFile, copy.mediaFile], [content.profile, profile]]) {
    const file = content.fileOf.get(from);
    if (file) content.fileOf.set(to, file);
  }
  return copy;
}

/** Does anything that would be published still carry the sample flag? */
export function profileIsSample(content) {
  return content.profile.sample === true;
}
