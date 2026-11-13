// Reads and writes the site's content through the GitHub REST API (Git Data endpoints).
//
// - Runs in the browser admin and in Node tests; `fetch` and the API base are injectable.
// - A commit is atomic: every changed file lands in one commit or none does.
// - A commit is refused when the branch moved since the content was loaded (no silent overwrite).
// - Writes are confined to the content folder; paths are checked before any request is made.
// - The token is only ever sent in the Authorization header to `apiBase`. It is never placed in a
//   URL or a request body, and never included in an error message.

export class GitHubError extends Error {
  constructor(kind, message, status = 0) { super(message); this.name = 'GitHubError'; this.kind = kind; this.status = status; }
}
export class ConflictError extends GitHubError {
  constructor(message, currentHeadSha) { super('conflict', message, 409); this.name = 'ConflictError'; this.currentHeadSha = currentHeadSha; }
}

const OWNER_OR_REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const BRANCH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const CONTENT_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const CONCURRENCY = 8;

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function fromBase64(text) {
  const binary = atob(text.replace(/\s/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next; next += 1; results[i] = await fn(items[i], i); }
  });
  await Promise.all(workers);
  return results;
}

export class GitHubStore {
  constructor({ token, owner, repo, branch = 'main', apiBase = 'https://api.github.com', fetch: fetchImpl = globalThis.fetch?.bind(globalThis), contentRoot = 'content' }) {
    if (typeof token !== 'string' || token.length < 10 || /\s/.test(token)) throw new GitHubError('input', 'The access token looks wrong: it is empty, too short or contains spaces.');
    if (!OWNER_OR_REPO.test(owner ?? '')) throw new GitHubError('input', 'The repository owner is not valid.');
    if (!OWNER_OR_REPO.test(repo ?? '')) throw new GitHubError('input', 'The repository name is not valid.');
    if (!BRANCH.test(branch ?? '') || branch.includes('..')) throw new GitHubError('input', 'The branch name is not valid.');
    if (!/^https?:\/\/[^\s/]+$/.test(apiBase)) throw new GitHubError('input', 'The API address is not valid.');
    if (typeof fetchImpl !== 'function') throw new GitHubError('input', 'No fetch implementation available.');
    // The token lives in a closure, not on the object, so it cannot leak through logging or serialisation.
    this.#token = () => token;
    Object.assign(this, { owner, repo, branch, apiBase, contentRoot });
    this.#fetch = fetchImpl;
  }

  #token; #fetch;

  get repoFullName() { return `${this.owner}/${this.repo}`; }

  async #request(method, path, body) {
    const url = `${this.apiBase}/repos/${this.owner}/${this.repo}${path}`;
    let response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.#token()}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new GitHubError('network', 'Could not reach GitHub. Check the connection and try again.');
    }
    let data = null;
    const text = await response.text();
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (response.ok) return data;

    const detail = typeof data?.message === 'string' ? data.message : '';
    const limited = response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail);
    if (response.status === 401) throw new GitHubError('auth', 'GitHub rejected the access token. It may be wrong, expired or revoked.', 401);
    if (response.status === 403 && limited) throw new GitHubError('rate-limit', 'GitHub is limiting requests right now. Wait a few minutes and try again.', 403);
    if (response.status === 403) throw new GitHubError('forbidden', 'The token is not allowed to do this. It needs read and write access to the repository contents.', 403);
    if (response.status === 404) throw new GitHubError('not-found', 'The repository or branch was not found, or the token cannot see it.', 404);
    if (response.status === 409 || response.status === 422) throw new GitHubError('rejected', `GitHub rejected the request${detail ? `: ${detail}` : '.'}`, response.status);
    throw new GitHubError('http', `GitHub returned an unexpected error (${response.status}).`, response.status);
  }

  /** Checks the token, the repository and the branch. Returns what the admin should know up front. */
  async verify() {
    const repo = await this.#request('GET', '');
    await this.#request('GET', `/git/ref/heads/${this.branch.split('/').map(encodeURIComponent).join('/')}`);
    // `permissions` is not guaranteed for every token type, so only an explicit `false` blocks.
    const canWrite = repo?.permissions ? repo.permissions.push !== false : null;
    if (canWrite === false) throw new GitHubError('read-only', 'The token can read this repository but not change it.', 403);
    return { isPrivate: Boolean(repo?.private), canWrite, defaultBranch: repo?.default_branch ?? null };
  }

  async #headCommit() {
    const ref = await this.#request('GET', `/git/ref/heads/${this.branch.split('/').map(encodeURIComponent).join('/')}`);
    const headSha = ref?.object?.sha;
    if (!headSha) throw new GitHubError('http', 'GitHub returned an unexpected branch response.');
    const commit = await this.#request('GET', `/git/commits/${headSha}`);
    return { headSha, treeSha: commit.tree.sha };
  }

  /**
   * Loads every JSON file under the content folder (parsed) and lists the media files (not downloaded).
   * Paths in the result are relative to the content folder.
   */
  async readSnapshot() {
    const { headSha, treeSha } = await this.#headCommit();
    const tree = await this.#request('GET', `/git/trees/${treeSha}?recursive=1`);
    if (tree.truncated) throw new GitHubError('too-large', 'The repository is too large to load through the GitHub API tree endpoint.');
    const prefix = `${this.contentRoot}/`;
    const entries = tree.tree.filter((e) => e.type === 'blob' && e.path.startsWith(prefix)).map((e) => ({ rel: e.path.slice(prefix.length), sha: e.sha, size: e.size ?? 0 }));
    const jsonEntries = entries.filter((e) => e.rel.endsWith('.json'));

    const json = new Map();
    await mapLimit(jsonEntries, CONCURRENCY, async (entry) => {
      const bytes = await this.readBlob(entry.sha);
      let data;
      try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new GitHubError('invalid-json', `${prefix}${entry.rel} is not valid JSON. Fix it in the repository first.`); }
      json.set(entry.rel, { sha: entry.sha, data });
    });
    const media = new Map(entries.filter((e) => e.rel.startsWith('media/files/')).map((e) => [e.rel, { sha: e.sha, size: e.size }]));
    return { headSha, treeSha, json, media };
  }

  async readBlob(sha) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new GitHubError('input', 'Invalid blob identifier.');
    const blob = await this.#request('GET', `/git/blobs/${sha}`);
    if (blob.encoding !== 'base64') throw new GitHubError('http', 'GitHub returned an unexpected blob encoding.');
    return fromBase64(blob.content);
  }

  /**
   * The commits that changed one content file, newest first (`rel` is relative to the content folder).
   * @returns {Promise<{ sha: string, message: string, date: string|null, author: string, url: string|null }[]>}
   */
  async listFileCommits(rel, { limit = 30 } = {}) {
    const path = this.#contentPath(rel);
    const per = Math.min(100, Math.max(1, Math.trunc(limit)));
    const list = await this.#request('GET', `/commits?sha=${encodeURIComponent(this.branch)}&path=${encodeURIComponent(path)}&per_page=${per}`);
    if (!Array.isArray(list)) throw new GitHubError('http', 'GitHub returned an unexpected history response.');
    return list.map((c) => ({
      sha: String(c.sha ?? ''),
      message: String(c.commit?.message ?? '').split('\n')[0],
      date: c.commit?.committer?.date ?? c.commit?.author?.date ?? null,
      author: String(c.commit?.author?.name ?? c.author?.login ?? ''),
      url: typeof c.html_url === 'string' && /^https:\/\/[^\s]+$/.test(c.html_url) ? c.html_url : null,
    })).filter((c) => /^[0-9a-f]{40}$/.test(c.sha));
  }

  /** A content JSON file exactly as it was at a commit, parsed. Resolves to null if it did not exist then. */
  async readJsonAt(rel, commitSha) {
    if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new GitHubError('input', 'Invalid commit identifier.');
    const path = this.#contentPath(rel);
    let file;
    try { file = await this.#request('GET', `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commitSha}`); } catch (error) { if (error.kind === 'not-found') return null; throw error; }
    if (file?.encoding !== 'base64' || typeof file.content !== 'string') throw new GitHubError('too-large', 'GitHub did not return the file contents (it may be larger than 1 MB).');
    try { return JSON.parse(new TextDecoder().decode(fromBase64(file.content))); } catch { throw new GitHubError('invalid-json', 'That version of the file is not valid JSON.'); }
  }

  #contentPath(rel) {
    if (typeof rel !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(rel) || rel.includes('..') || rel.includes('//')) throw new GitHubError('input', 'Invalid file path.');
    return `${this.contentRoot}/${rel}`;
  }

  /**
   * @param {{ message: string, expectedHeadSha: string, changes: ({ path: string, data: string|Uint8Array }|{ path: string, delete: true })[] }} args
   * @returns {Promise<{ commitSha: string, treeSha: string, url: string|null }>}
   */
  async commit({ message, expectedHeadSha, changes }) {
    if (typeof message !== 'string' || !message.trim()) throw new GitHubError('input', 'A commit message is required.');
    if (!Array.isArray(changes) || changes.length === 0) throw new GitHubError('input', 'There is nothing to publish.');
    const seen = new Set();
    for (const change of changes) {
      if (!CONTENT_PATH.test(change.path ?? '') || change.path.split('/').some((s) => s === '..' || s === '.')) throw new GitHubError('input', `Refusing to write outside the content folder: ${String(change.path).slice(0, 80)}`);
      if (seen.has(change.path)) throw new GitHubError('input', `The same file appears twice in one publish: ${change.path}`);
      seen.add(change.path);
    }

    const head = await this.#headCommit();
    if (head.headSha !== expectedHeadSha) throw new ConflictError('The repository changed since you loaded it. Reload to merge the latest version.', head.headSha);

    const entries = await mapLimit(changes, CONCURRENCY, async (change) => {
      const path = `${this.contentRoot}/${change.path}`;
      if (change.delete) return { path, mode: '100644', type: 'blob', sha: null };
      const bytes = typeof change.data === 'string' ? new TextEncoder().encode(change.data) : change.data;
      const blob = await this.#request('POST', '/git/blobs', { content: toBase64(bytes), encoding: 'base64' });
      return { path, mode: '100644', type: 'blob', sha: blob.sha };
    });

    const tree = await this.#request('POST', '/git/trees', { base_tree: head.treeSha, tree: entries });
    const commit = await this.#request('POST', '/git/commits', { message: message.trim(), tree: tree.sha, parents: [head.headSha] });
    try {
      await this.#request('PATCH', `/git/refs/heads/${this.branch.split('/').map(encodeURIComponent).join('/')}`, { sha: commit.sha, force: false });
    } catch (error) {
      if (error.kind === 'rejected') throw new ConflictError('The repository changed while publishing. Nothing was overwritten; reload and try again.', null);
      throw error;
    }
    return { commitSha: commit.sha, treeSha: tree.sha, url: commit.html_url ?? null };
  }
}
