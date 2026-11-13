// The admin's working copy: what was loaded from the repository, plus the changes the owner has
// made but not published yet ("staged"). Nothing here touches the network or the DOM, so all of
// it is unit-tested; the screens only call these methods.
//
// Paths are relative to the content folder ("articles/art_x.json", "media/files/photo.png").

import { assembleContent } from './assemble.mjs';
import { toBase64, fromBase64 } from './github-store.mjs';
import { validateContent } from './validate-core.mjs';

const MEDIA_PREFIX = 'media/files/';
export const serialize = (data) => `${JSON.stringify(data, null, 2)}\n`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => structuredClone(v);

export class Workspace {
  /** @param {{ headSha: string, json: Map<string,{sha:string,data:any}>, media: Map<string,{sha:string,size:number}> }} snapshot */
  constructor(snapshot) {
    this.rebase(snapshot);
    this.staged = new Map(); // rel -> { op: 'write'|'delete'|'upload', data?, bytes?, baseSha, conflict? }
  }

  /** Replace the loaded state with a newer snapshot; staged changes are kept (and checked for conflicts). */
  rebase(snapshot) {
    this.headSha = snapshot.headSha;
    this.base = new Map([...snapshot.json].map(([rel, f]) => [rel, { sha: f.sha, data: f.data }]));
    this.baseMedia = new Map(snapshot.media);
    for (const [rel, entry] of this.staged ?? []) {
      const upstream = entry.op === 'upload' ? this.baseMedia.get(rel)?.sha : this.base.get(rel)?.sha;
      if ((upstream ?? null) !== (entry.baseSha ?? null)) entry.conflict = true;
    }
  }

  // ------------------------------------------------------------ reading

  exists(rel) {
    const entry = this.staged.get(rel);
    if (entry) return entry.op !== 'delete';
    return this.base.has(rel) || this.baseMedia.has(rel);
  }

  /** A copy of the current JSON for a file (staged version if there is one), or undefined. */
  read(rel) {
    const entry = this.staged.get(rel);
    if (entry) return entry.op === 'write' ? clone(entry.data) : undefined;
    const file = this.base.get(rel);
    return file ? clone(file.data) : undefined;
  }

  /** Paths of all JSON files that currently exist, optionally under a folder. */
  list(folder = '') {
    const rels = new Set([...this.base.keys()].filter((r) => !(this.staged.get(r)?.op === 'delete')));
    for (const [rel, e] of this.staged) if (e.op === 'write') rels.add(rel);
    return [...rels].filter((r) => r.startsWith(folder)).sort();
  }

  mediaFiles() {
    const files = new Map([...this.baseMedia].map(([rel, m]) => [rel.slice(MEDIA_PREFIX.length), { size: m.size, sha: m.sha, staged: false }]));
    for (const [rel, e] of this.staged) {
      if (!rel.startsWith(MEDIA_PREFIX)) continue;
      const name = rel.slice(MEDIA_PREFIX.length);
      if (e.op === 'upload') files.set(name, { size: e.bytes.length, bytes: e.bytes, staged: true });
      else if (e.op === 'delete') files.delete(name);
    }
    return files;
  }

  stagedBytes(name) { const e = this.staged.get(`${MEDIA_PREFIX}${name}`); return e?.op === 'upload' ? e.bytes : null; }

  // ------------------------------------------------------------ staging

  write(rel, data) {
    if (!rel.endsWith('.json')) throw new Error('Only JSON content files can be written with write().');
    const base = this.base.get(rel);
    const previous = this.staged.get(rel);
    if (base && same(base.data, data)) { this.staged.delete(rel); return; }
    this.staged.set(rel, { op: 'write', data: clone(data), baseSha: base?.sha ?? null, conflict: previous?.conflict ?? false });
  }

  remove(rel) {
    const inBase = this.base.has(rel) || this.baseMedia.has(rel);
    if (!inBase) { this.staged.delete(rel); return; }
    this.staged.set(rel, { op: 'delete', baseSha: (this.base.get(rel) ?? this.baseMedia.get(rel)).sha, conflict: this.staged.get(rel)?.conflict ?? false });
  }

  uploadMedia(name, bytes) {
    const rel = `${MEDIA_PREFIX}${name}`;
    if (this.exists(rel)) throw new Error(`A media file named ${name} already exists.`);
    this.staged.set(rel, { op: 'upload', bytes, baseSha: null, conflict: false });
  }

  discard(rel) { this.staged.delete(rel); }
  discardAll() { this.staged.clear(); }
  keepMine(rel) { const e = this.staged.get(rel); if (e) e.conflict = false; }

  get isDirty() { return this.staged.size > 0; }
  get conflicts() { return [...this.staged].filter(([, e]) => e.conflict).map(([rel]) => rel); }

  // ------------------------------------------------------------ validation

  /** The full content tree as it would be after publishing. */
  content() {
    const files = new Map(this.list().map((rel) => [rel, this.read(rel)]));
    const media = this.mediaFiles();
    return assembleContent(files, { mediaFileExists: (file) => media.has(file) });
  }

  validate(registry) {
    let content;
    try { content = this.content(); } catch (error) { return { content: null, errors: [{ file: '', path: '', message: error.message }], warnings: [] }; }
    return { content, ...validateContent(content, registry) };
  }

  // ------------------------------------------------------------ publishing

  /**
   * Can the staged changes be published right now? Publishing is blocked while any file would
   * fail validation (the site build would fail too), or while a file changed upstream and the
   * owner has not decided between "keep mine" and "discard".
   */
  readiness(registry) {
    const validation = this.validate(registry);
    const reasons = [];
    if (!this.isDirty) reasons.push('nothing');
    if (this.conflicts.length) reasons.push('conflicts');
    if (validation.errors.length) reasons.push('invalid');
    return { ok: reasons.length === 0, reasons, validation };
  }

  /** Set `updatedAt` on every staged record whose content really changed (ignoring `updatedAt` itself). Call just before publishing. */
  stampUpdates(now = new Date()) {
    const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const strip = (d) => { const c = structuredClone(d); delete c.updatedAt; return JSON.stringify(c); };
    for (const [rel, e] of this.staged) {
      if (e.op !== 'write' || typeof e.data.updatedAt !== 'string') continue;
      const base = this.base.get(rel)?.data;
      if (base && strip(base) !== strip(e.data)) e.data.updatedAt = stamp;
    }
  }

  /** What would be committed, in a form GitHubStore.commit understands. */
  changes() {
    return [...this.staged].map(([path, e]) => {
      if (e.op === 'delete') return { path, delete: true };
      if (e.op === 'upload') return { path, data: e.bytes };
      return { path, data: serialize(e.data) };
    });
  }

  summary() {
    const out = { added: 0, changed: 0, deleted: 0, media: 0, files: [] };
    for (const [rel, e] of this.staged) {
      const kind = e.op === 'delete' ? 'deleted' : e.op === 'upload' ? 'added' : (this.base.has(rel) ? 'changed' : 'added');
      out[kind] += 1;
      if (rel.startsWith(MEDIA_PREFIX)) out.media += 1;
      out.files.push({ rel, kind, conflict: Boolean(e.conflict) });
    }
    out.files.sort((a, b) => a.rel.localeCompare(b.rel));
    return out;
  }

  // ------------------------------------------------------------ persistence (IndexedDB in the browser)

  /** A JSON-safe copy of the staged changes, so a page reload does not lose work. */
  exportState() {
    return {
      version: 1,
      headSha: this.headSha,
      staged: [...this.staged].map(([rel, e]) => ({ rel, op: e.op, baseSha: e.baseSha, conflict: Boolean(e.conflict), ...(e.op === 'write' ? { data: e.data } : {}), ...(e.op === 'upload' ? { bytes: toBase64(e.bytes) } : {}) })),
    };
  }

  /** Re-apply saved changes on top of the current snapshot; anything that changed upstream is flagged. */
  importState(state) {
    if (state?.version !== 1 || !Array.isArray(state.staged)) return { restored: 0, conflicts: [] };
    for (const item of state.staged) {
      if (typeof item.rel !== 'string' || !['write', 'delete', 'upload'].includes(item.op)) continue;
      const entry = { op: item.op, baseSha: item.baseSha ?? null, conflict: false };
      if (item.op === 'write') entry.data = item.data;
      if (item.op === 'upload') entry.bytes = fromBase64(item.bytes);
      const upstream = item.op === 'upload' ? this.baseMedia.get(item.rel)?.sha : this.base.get(item.rel)?.sha;
      entry.conflict = (upstream ?? null) !== (entry.baseSha ?? null) || Boolean(item.conflict);
      this.staged.set(item.rel, entry);
    }
    return { restored: this.staged.size, conflicts: this.conflicts };
  }
}
