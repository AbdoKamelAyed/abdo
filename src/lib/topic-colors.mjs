// One CSS rule per topic accent colour in use. Colours are validated hex values (#rrggbb) by the schema, and the
// class name is derived from the digits only, so nothing the owner types can reach the stylesheet unchecked.

const HEX = /^#[0-9a-f]{6}$/;

/** @param {{ color?: string }[]} topics */
export function topicColorCss(topics) {
  const colors = [...new Set(topics.map((t) => (t.color ?? '').toLowerCase()).filter((c) => HEX.test(c)))].sort();
  return colors.map((c) => `.topic-c-${c.slice(1)}{--topic-accent:${c};}`).join('\n');
}
