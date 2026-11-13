// Comparing two versions of a translation (from Git history or from the current draft) and restoring one.
//
// Pure. Revision history itself is Git: the admin lists a file's commits, loads the file as it was, and
// uses these functions to show what changed and to build the restored text. Nothing is stored apart
// from the repository, so history cannot be lost, edited or forged from inside the admin.

import { getAt, mapBlockTexts, textFields } from './blocks-meta.mjs';

const TOKEN = /\s+|[\p{L}\p{N}\p{M}'’_-]+|[^\s\p{L}\p{N}\p{M}]/gu;
const MAX_TOKENS = 3000; // beyond this a word-level comparison is not worth its cost; show a plain before/after

/**
 * Word-level difference between two strings, as runs of `{ op: 'same'|'del'|'add', text }`.
 * Consecutive tokens with the same operation are joined.
 */
export function diffText(before, after) {
  if (before === after) return before === '' ? [] : [{ op: 'same', text: before }];
  const a = before.match(TOKEN) ?? [];
  const b = after.match(TOKEN) ?? [];
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return [...(before ? [{ op: 'del', text: before }] : []), ...(after ? [{ op: 'add', text: after }] : [])];

  // Trim the shared start and end, then compare what is left with a longest-common-subsequence table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length; let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const midA = a.slice(start, endA); const midB = b.slice(start, endB);
  const n = midA.length; const m = midB.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const ops = a.slice(0, start).map((text) => ({ op: 'same', text }));
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) { ops.push({ op: 'same', text: midA[i] }); i += 1; j += 1; } else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ op: 'del', text: midA[i] }); i += 1; } else { ops.push({ op: 'add', text: midB[j] }); j += 1; }
  }
  for (; i < n; i += 1) ops.push({ op: 'del', text: midA[i] });
  for (; j < m; j += 1) ops.push({ op: 'add', text: midB[j] });
  for (const text of a.slice(endA)) ops.push({ op: 'same', text });

  const runs = [];
  for (const op of ops) {
    const last = runs.at(-1);
    if (last && last.op === op.op) last.text += op.text; else runs.push({ ...op });
  }
  return runs;
}

const stable = (value) => JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));

/** Indexes (into `sequence`) of one longest increasing subsequence; the rest of the sequence has "moved". */
function stayingPut(sequence) {
  const tails = []; const prev = new Array(sequence.length).fill(-1); const at = [];
  sequence.forEach((value, index) => {
    let lo = 0; let hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sequence[tails[mid]] < value) lo = mid + 1; else hi = mid; }
    if (lo > 0) prev[index] = tails[lo - 1];
    tails[lo] = index; at[lo] = index;
  });
  const keep = new Set();
  for (let k = tails.at(-1); k !== undefined && k !== -1; k = prev[k]) keep.add(k);
  return keep;
}

/**
 * Compare two block lists, matching blocks by id.
 * @returns {{ status: 'same'|'changed'|'added'|'removed'|'moved', id: string, type: string, before?: object, after?: object,
 *   fields?: { path: (string|number)[], runs: object[] }[], props?: string[] }[]} one entry per block, in reading order
 *   (a removed block appears where it used to be)
 */
export function diffBlocks(oldBlocks = [], newBlocks = []) {
  const oldIndex = new Map(oldBlocks.map((b, i) => [b.id, i]));
  const newIds = new Set(newBlocks.map((b) => b.id));

  const survivors = newBlocks.map((b, i) => ({ i, o: oldIndex.get(b.id) })).filter((x) => x.o !== undefined);
  const keep = stayingPut(survivors.map((x) => x.o));
  const staying = new Set(survivors.filter((_, k) => keep.has(k)).map((x) => x.i));

  const entries = newBlocks.map((after, i) => {
    if (!oldIndex.has(after.id)) return { status: 'added', id: after.id, type: after.type, after };
    const before = oldBlocks[oldIndex.get(after.id)];
    const entry = { status: 'same', id: after.id, type: after.type, before, after };
    if (before.type !== after.type) return { ...entry, status: 'changed', props: ['type'], fields: [] };
    if (stable(before) !== stable(after)) {
      // Text that changed, word by word; and anything else that changed (a style, a list's length, a link).
      const fields = [];
      const seen = new Set();
      for (const field of textFields(after)) {
        seen.add(field.path.join('\u0000'));
        const was = getAt(before, field.path);
        if (was !== field.text) fields.push({ path: field.path, runs: diffText(typeof was === 'string' ? was : '', field.text) });
      }
      for (const field of textFields(before)) if (!seen.has(field.path.join('\u0000'))) fields.push({ path: field.path, runs: diffText(field.text, '') });
      const blank = (b) => mapBlockTexts(b, () => '', { includeCode: true });
      const [sb, sa] = [blank(before), blank(after)];
      const props = Object.keys({ ...sb, ...sa }).filter((k) => k !== 'id' && stable(sb[k]) !== stable(sa[k]));
      Object.assign(entry, { status: 'changed', fields, props });
    } else if (!staying.has(i)) entry.status = 'moved';
    return entry;
  });

  // Put each removed block back where it used to be: after the nearest earlier block that still exists.
  const result = [...entries];
  oldBlocks.forEach((block, o) => {
    if (newIds.has(block.id)) return;
    let anchor = -1;
    for (let k = o - 1; k >= 0; k -= 1) { const idx = result.findIndex((e) => e.id === oldBlocks[k].id && e.status !== 'removed'); if (idx !== -1) { anchor = idx; break; } }
    let at = anchor + 1;
    while (at < result.length && result[at].status === 'removed') at += 1;
    result.splice(at, 0, { status: 'removed', id: block.id, type: block.type, before: block });
  });
  return result;
}

export function summarize(entries) {
  const count = (status) => entries.filter((e) => e.status === status).length;
  return { added: count('added'), removed: count('removed'), changed: count('changed'), moved: count('moved'), same: count('same') };
}

/** The text fields of a page (an article has an excerpt, a project a summary) that a full restore brings back. */
export const META = ['title', 'subtitle', 'excerpt', 'summary', 'coverAlt'];

/**
 * Differences between two translations of the same page.
 * @returns {{ meta: { key: string, runs: object[] }[], seo: { key: string, runs: object[] }[], body: ReturnType<typeof diffBlocks>, summary: ReturnType<typeof summarize>, identical: boolean }}
 */
export function diffTranslation(before = {}, after = {}) {
  const meta = META.filter((k) => (before[k] ?? '') !== (after[k] ?? '')).map((key) => ({ key, runs: diffText(before[key] ?? '', after[key] ?? '') }));
  const seoKeys = [...new Set([...Object.keys(before.seo ?? {}), ...Object.keys(after.seo ?? {})])];
  const seo = seoKeys.filter((k) => stable(before.seo?.[k]) !== stable(after.seo?.[k])).map((key) => ({ key, runs: diffText(String(before.seo?.[key] ?? ''), String(after.seo?.[key] ?? '')) }));
  const body = diffBlocks(before.body ?? [], after.body ?? []);
  const summary = summarize(body);
  return { meta, seo, body, summary, identical: !meta.length && !seo.length && summary.added + summary.removed + summary.changed + summary.moved === 0 };
}

/**
 * The translation as it would be after restoring an older version of it.
 * `scope: 'body'` brings back only the text blocks; `'all'` also brings back the title, subtitle, excerpt,
 * cover description and search overrides. The slug (it is the page's address) and the publication
 * status are never taken from the old version.
 */
export function restoreTranslation(current, old, scope = 'body') {
  const next = structuredClone(current);
  next.body = structuredClone(old.body ?? []);
  if (scope === 'all') {
    for (const key of META) { if (old[key] === undefined) delete next[key]; else next[key] = old[key]; }
    if (old.seo === undefined) delete next.seo; else next.seo = structuredClone(old.seo);
  }
  return next;
}
