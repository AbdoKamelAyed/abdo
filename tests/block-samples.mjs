// One fully-populated example of every block type. Every text field holds a unique "T<n>" marker so
// tests can prove that no text field is missed by the helpers that count, search or replace text.

const MEDIA = ['med_9f3k2a01', 'med_9f3k2a02', 'med_9f3k2a03', 'med_9f3k2a04'];

/** @param {{ related?: { kind: string, id: string }[] }} [options] */
export function sampleBlocks({ related = [{ kind: 'article', id: 'art_welcome1' }, { kind: 'project', id: 'prj_archive1' }] } = {}) {
  let n = 0;
  const T = () => `T${(n += 1)}`;
  let b = 0;
  const id = () => `blk_s${String((b += 1)).padStart(7, '0')}`;
  return [
    { id: id(), type: 'paragraph', text: `${T()} with a note[^n1] and **bold**, ++underline++, ~~gone~~, ==marked==, x^2^, H~2~O`, style: 'intro', dropCap: true, align: 'center', dir: 'auto' },
    { id: id(), type: 'heading', level: 2, text: T() },
    { id: id(), type: 'heading', level: 6, text: T(), align: 'end' },
    { id: id(), type: 'quote', text: T(), cite: T(), variant: 'pull' },
    { id: id(), type: 'list', ordered: true, items: [T(), `  ${T()}`, `    ${T()}`, T()] },
    { id: id(), type: 'image', mediaId: MEDIA[0], caption: T(), size: 'wide', aspect: '16:9', border: 'thin', radius: 'lg' },
    { id: id(), type: 'callout', tone: 'tip', title: T(), text: T() },
    { id: id(), type: 'divider' },
    { id: id(), type: 'checklist', title: T(), items: [{ text: T(), checked: true }, { text: T(), level: 1 }, { text: T() }] },
    { id: id(), type: 'definitions', items: [{ term: T(), definition: T() }, { term: T(), definition: T() }] },
    { id: id(), type: 'code', language: 'js', caption: T(), text: 'const a = "<b>literal</b>" && 1;' },
    { id: id(), type: 'table', caption: T(), header: true, align: ['start', 'end'], rows: [[T(), T()], [T(), T()], [T(), T()]] },
    { id: id(), type: 'gallery', columns: 3, ratio: '4:3', caption: T(), items: [{ mediaId: MEDIA[0], caption: T() }, { mediaId: MEDIA[1] }, { mediaId: MEDIA[2], caption: T() }] },
    { id: id(), type: 'compare', beforeId: MEDIA[0], afterId: MEDIA[1], beforeLabel: T(), afterLabel: T(), caption: T() },
    { id: id(), type: 'imagetext', mediaId: MEDIA[3], side: 'end', text: `${T()}\n\n${T()}`, caption: T() },
    { id: id(), type: 'factbox', title: T(), note: T(), items: [{ label: T(), value: T() }, { label: T(), value: T() }] },
    { id: id(), type: 'timeline', title: T(), events: [{ date: T(), title: T(), text: T() }, { title: T() }] },
    { id: id(), type: 'stats', items: [{ value: T(), label: T(), note: T() }, { value: T(), label: T() }] },
    { id: id(), type: 'related', title: T(), items: related },
    { id: id(), type: 'author', note: T() },
    { id: id(), type: 'footnotes', title: T(), items: [{ key: 'n1', text: T() }] },
    { id: id(), type: 'references', title: T(), items: [{ text: T(), url: 'https://example.com/ref' }, { text: T() }] },
  ];
}

/** Every string a test planted: values that look like T<number> (also inside longer sentences). */
export function plantedMarkers(value, out = new Set()) {
  if (typeof value === 'string') for (const m of value.matchAll(/\bT\d+\b/g)) out.add(m[0]);
  else if (Array.isArray(value)) value.forEach((v) => plantedMarkers(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => plantedMarkers(v, out));
  return out;
}
