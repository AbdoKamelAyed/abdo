// Nested lists. Pure functions shared by the renderer, the validator and the editor.
//
// A `list` block keeps its items as plain strings. A nested item is written with leading spaces:
// two spaces per level, three levels below the first at most (so 0, 2, 4 or 6 spaces). A checklist
// item is an object and carries the same depth as a number in `level` (0 to 3). In both cases an item
// may be at most one level deeper than the item above it, and the first item is at level 0, the same
// rule as in an outline. The renderer clamps what it finds, so odd hand-edited data still displays
// sensibly, while the validator reports it so it can be fixed.

export const MAX_LEVEL = 3;
const STEP = 2;

/** Depth encoded by the leading spaces (or tabs) of a list item, 0 to MAX_LEVEL. */
export function listLevel(raw) {
  const lead = /^[ \t]*/.exec(String(raw))[0];
  const spaces = lead.replaceAll('\t', ' '.repeat(STEP)).length;
  return Math.min(MAX_LEVEL, Math.floor(spaces / STEP));
}

/** The item without its indentation. */
export const listText = (raw) => String(raw).replace(/^[ \t]+/, '');

/** An item at `level`. */
export const withLevel = (raw, level) => `${' '.repeat(STEP * Math.max(0, Math.min(MAX_LEVEL, level)))}${listText(raw)}`;

/**
 * Levels as they will be drawn: never deeper than one more than the item above, never negative, and
 * the first item always at 0.
 * @param {number[]} levels
 */
export function clampLevels(levels) {
  const out = [];
  for (let i = 0; i < levels.length; i += 1) {
    const max = i === 0 ? 0 : Math.min(MAX_LEVEL, out[i - 1] + 1);
    out.push(Math.max(0, Math.min(max, Number.isFinite(levels[i]) ? Math.trunc(levels[i]) : 0)));
  }
  return out;
}

/**
 * The tree for a flat run of entries `{ level, ... }`. Each node is `{ entry, children }`.
 * @template T
 * @param {(T & { level: number })[]} entries
 * @returns {{ entry: T, children: any[] }[]}
 */
export function buildTree(entries) {
  const levels = clampLevels(entries.map((e) => e.level));
  const root = [];
  const stack = [{ children: root, level: -1 }];
  entries.forEach((entry, i) => {
    const node = { entry, children: [] };
    while (stack.at(-1).level >= levels[i]) stack.pop();
    stack.at(-1).children.push(node);
    stack.push({ children: node.children, level: levels[i] });
  });
  return root;
}

/** Problems with the depth of a `list` block's items, as short messages with the item index. */
export function listProblems(items) {
  const problems = [];
  let previous = -1;
  items.forEach((raw, i) => {
    const level = listLevel(raw);
    const lead = /^[ \t]*/.exec(String(raw))[0];
    if (!listText(raw).trim()) problems.push({ index: i, message: 'this item is empty' });
    else if (i === 0 && level > 0) problems.push({ index: i, message: 'the first item cannot be indented' });
    else if (level > previous + 1 && i > 0) problems.push({ index: i, message: 'an item can be at most one level deeper than the item above it' });
    else if (lead.replaceAll('\t', ' '.repeat(STEP)).length > MAX_LEVEL * STEP) problems.push({ index: i, message: `lists have at most ${MAX_LEVEL + 1} levels` });
    previous = level;
  });
  return problems;
}

/** Problems with the `level` of a checklist's items. */
export function checklistProblems(items) {
  const problems = [];
  let previous = -1;
  items.forEach((item, i) => {
    const level = item.level ?? 0;
    if (i === 0 && level > 0) problems.push({ index: i, message: 'the first item cannot be indented' });
    else if (i > 0 && level > previous + 1) problems.push({ index: i, message: 'an item can be at most one level deeper than the item above it' });
    previous = level;
  });
  return problems;
}

/**
 * Indent or outdent the lines touched by a selection in a list's text box, then make the whole text
 * consistent again (an item can never be more than one level deeper than the one above). Returns the
 * new text and a selection that still covers the same lines.
 * @param {string} value  the text box, one item per line
 * @param {number} start  selection start
 * @param {number} end    selection end
 * @param {1|-1} delta
 */
export function shiftLines(value, start, end, delta) {
  const lines = value.split('\n');
  const starts = [];
  let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const first = Math.max(0, starts.findLastIndex((s) => s <= start));
  const lastPos = Math.max(start, end > start && value[end - 1] === '\n' ? end - 1 : end);
  const last = Math.max(first, starts.findLastIndex((s) => s <= lastPos));
  const levels = lines.map(listLevel);
  for (let i = first; i <= last; i += 1) levels[i] = Math.max(0, Math.min(MAX_LEVEL, levels[i] + delta));
  const fixed = clampLevels(levels);
  const next = lines.map((line, i) => withLevel(line, fixed[i]));
  const nextStarts = [];
  offset = 0;
  for (const line of next) { nextStarts.push(offset); offset += line.length + 1; }
  const nextEnd = nextStarts[last] + next[last].length;
  const shiftStart = nextStarts[first] + (start - starts[first]) + (next[first].length - lines[first].length);
  return {
    text: next.join('\n'),
    start: Math.max(nextStarts[first], Math.min(shiftStart, nextEnd)),
    end: end === start ? Math.max(nextStarts[first], Math.min(shiftStart, nextEnd)) : nextEnd,
  };
}
