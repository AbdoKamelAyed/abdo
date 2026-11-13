// A small in-memory stand-in for the parts of the GitHub REST API the admin uses (Git Data
// endpoints). It lets tests exercise the real client code, over real HTTP, without a network or a
// real repository. It is a test double: it proves the client follows the documented protocol, not
// that GitHub behaves identically in every edge case.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, sep } from 'node:path';

const sha1 = (...parts) => createHash('sha1').update(Buffer.concat(parts.map((p) => Buffer.from(p)))).digest('hex');
const blobSha = (bytes) => sha1(`blob ${bytes.length}\0`, bytes);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full); else yield full;
  }
}

export async function startFakeGitHub({ seedDir, owner = 'abdo', repo = 'site', branch = 'main', token = 'test-token-0123456789', isPrivate = false, canPush = true, port = 0 } = {}) {
  const blobs = new Map(); // sha -> Buffer
  const trees = new Map(); // sha -> Map(path -> { sha, mode })
  const commits = new Map(); // sha -> { tree, parents, message }
  const refs = new Map(); // branch -> commit sha
  const requests = [];
  let counter = 0;

  const addBlob = (bytes) => { const buf = Buffer.from(bytes); const sha = blobSha(buf); blobs.set(sha, buf); return sha; };
  const addTree = (entries) => { const sha = sha1('tree', JSON.stringify([...entries].sort())); trees.set(sha, entries); return sha; };
  // Commit times start at a fixed instant and advance a minute per commit, so history is deterministic.
  const addCommit = (tree, parents, message) => { counter += 1; const sha = sha1('commit', tree, String(counter), message); commits.set(sha, { tree, parents, message, date: new Date(Date.UTC(2026, 0, 1, 0, counter)).toISOString().replace('.000Z', 'Z') }); return sha; };

  // Seed: <seedDir>/content/** becomes content/** in the repository.
  const seed = new Map();
  if (seedDir) {
    for (const file of walk(seedDir)) seed.set(`content/${relative(seedDir, file).split(sep).join('/')}`, { sha: addBlob(readFileSync(file)), mode: '100644' });
  }
  refs.set(branch, addCommit(addTree(seed), [], 'Initial content'));

  const api = {
    owner, repo, branch, token, requests, blobs,
    get headSha() { return refs.get(branch); },
    files() { return new Map([...trees.get(commits.get(refs.get(branch)).tree)].map(([path, e]) => [path, blobs.get(e.sha)])); },
    readText(path) { const f = api.files().get(path); return f ? f.toString('utf8') : null; },
    /** Simulates someone else pushing to the branch. */
    externalCommit(changes, message = 'External change') {
      const head = commits.get(refs.get(branch));
      const entries = new Map(trees.get(head.tree));
      for (const [path, data] of Object.entries(changes)) {
        if (data === null) entries.delete(path); else entries.set(path, { sha: addBlob(data), mode: '100644' });
      }
      refs.set(branch, addCommit(addTree(entries), [refs.get(branch)], message));
      return refs.get(branch);
    },
    setCanPush(value) { canPush = value; },
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
    url: '',
  };

  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Max-Age': '60' };
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', ...cors }); res.end(body === undefined ? '' : JSON.stringify(body)); };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://fake');
      let body = null;
      if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { message: 'Problems parsing JSON' }); } }
      requests.push({ method: req.method, path: url.pathname, search: url.search, auth: req.headers.authorization ?? null, body });

      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { message: 'Bad credentials' });

      const base = `/repos/${owner}/${repo}`;
      if (!url.pathname.startsWith(base)) return send(res, 404, { message: 'Not Found' });
      const path = url.pathname.slice(base.length);
      let m;

      if (req.method === 'GET' && path === '') return send(res, 200, { name: repo, private: isPrivate, default_branch: branch, permissions: { admin: false, push: canPush, pull: true } });
      if (req.method === 'GET' && (m = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
        const name = decodeURIComponent(m[1]);
        return refs.has(name) ? send(res, 200, { ref: `refs/heads/${name}`, object: { type: 'commit', sha: refs.get(name) } }) : send(res, 404, { message: 'Not Found' });
      }
      if (req.method === 'GET' && (m = path.match(/^\/git\/commits\/([0-9a-f]{40})$/))) {
        const c = commits.get(m[1]);
        return c ? send(res, 200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : send(res, 404, { message: 'Not Found' });
      }
      if (req.method === 'GET' && (m = path.match(/^\/git\/trees\/([0-9a-f]{40})$/))) {
        const t = trees.get(m[1]);
        if (!t) return send(res, 404, { message: 'Not Found' });
        return send(res, 200, { sha: m[1], truncated: false, tree: [...t].map(([p, e]) => ({ path: p, mode: e.mode, type: 'blob', sha: e.sha, size: blobs.get(e.sha).length })) });
      }
      if (req.method === 'GET' && (m = path.match(/^\/git\/blobs\/([0-9a-f]{40})$/))) {
        const b = blobs.get(m[1]);
        return b ? send(res, 200, { sha: m[1], size: b.length, encoding: 'base64', content: b.toString('base64') }) : send(res, 404, { message: 'Not Found' });
      }

      if (req.method === 'GET' && path === '/commits') {
        // History of one file: the commits (newest first) whose version of it differs from their parent's.
        const wanted = url.searchParams.get('path');
        const limit = Math.min(100, Number(url.searchParams.get('per_page') ?? 30));
        const from = url.searchParams.get('sha') ?? branch;
        let sha = refs.get(from) ?? (commits.has(from) ? from : null);
        if (!sha) return send(res, 404, { message: 'Not Found' });
        const out = [];
        while (sha && out.length < limit) {
          const c = commits.get(sha);
          const here = trees.get(c.tree).get(wanted)?.sha ?? null;
          const before = c.parents.length ? (trees.get(commits.get(c.parents[0]).tree).get(wanted)?.sha ?? null) : null;
          if (!wanted || here !== before) out.push({ sha, html_url: `https://github.com/${owner}/${repo}/commit/${sha}`, author: { login: owner }, commit: { message: c.message, author: { name: 'Abdo', date: c.date }, committer: { name: 'Abdo', date: c.date } } });
          sha = c.parents[0] ?? null;
        }
        return send(res, 200, out);
      }
      if (req.method === 'GET' && (m = path.match(/^\/contents\/(.+)$/))) {
        const ref = url.searchParams.get('ref') ?? refs.get(branch);
        const c = commits.get(refs.get(ref) ?? ref);
        const entry = c && trees.get(c.tree).get(decodeURIComponent(m[1]));
        if (!entry) return send(res, 404, { message: 'Not Found' });
        const bytes = blobs.get(entry.sha);
        return send(res, 200, { type: 'file', path: decodeURIComponent(m[1]), sha: entry.sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
      }

      // ---- writes
      if (!canPush) return send(res, 403, { message: 'Resource not accessible by personal access token' });
      if (req.method === 'POST' && path === '/git/blobs') {
        if (body?.encoding !== 'base64' || typeof body.content !== 'string') return send(res, 422, { message: 'Invalid blob' });
        return send(res, 201, { sha: addBlob(Buffer.from(body.content, 'base64')) });
      }
      if (req.method === 'POST' && path === '/git/trees') {
        const baseTree = trees.get(body?.base_tree);
        if (!baseTree) return send(res, 422, { message: 'base_tree not found' });
        const entries = new Map(baseTree);
        for (const e of body.tree ?? []) {
          if (e.sha === null) { if (!entries.has(e.path)) return send(res, 422, { message: `Path ${e.path} does not exist` }); entries.delete(e.path); } else {
            if (!blobs.has(e.sha)) return send(res, 422, { message: 'Blob does not exist' });
            entries.set(e.path, { sha: e.sha, mode: e.mode });
          }
        }
        return send(res, 201, { sha: addTree(entries) });
      }
      if (req.method === 'POST' && path === '/git/commits') {
        if (!trees.has(body?.tree) || !(body.parents ?? []).every((p) => commits.has(p))) return send(res, 422, { message: 'Invalid commit' });
        const sha = addCommit(body.tree, body.parents, body.message);
        return send(res, 201, { sha, html_url: `https://github.com/${owner}/${repo}/commit/${sha}` });
      }
      if (req.method === 'PATCH' && (m = path.match(/^\/git\/refs\/heads\/(.+)$/))) {
        const name = decodeURIComponent(m[1]);
        if (!refs.has(name)) return send(res, 404, { message: 'Not Found' });
        if (!commits.has(body?.sha)) return send(res, 422, { message: 'Object does not exist' });
        if (!body.force && !commits.get(body.sha).parents.includes(refs.get(name))) return send(res, 422, { message: 'Update is not a fast forward' });
        refs.set(name, body.sha);
        return send(res, 200, { ref: `refs/heads/${name}`, object: { sha: body.sha } });
      }
      return send(res, 404, { message: 'Not Found' });
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  api.url = `http://127.0.0.1:${server.address().port}`;
  return api;
}
