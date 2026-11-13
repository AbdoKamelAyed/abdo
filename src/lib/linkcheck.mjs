// Verifies the generated site: every internal link and asset reference must point at a file that
// exists in the output, and every same-page #fragment must match an id on that page.
// Used by the build (a broken link fails the build) and by the tests.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ATTR = /\b(?:href|src)="([^"]*)"/g;
const ID = /\bid="([^"]*)"/g;

function decodeSafe(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** @returns {{ page: string, target: string, reason: string }[]} */
export function checkLinks(outDir, basePath, pages) {
  const problems = [];
  for (const page of pages) {
    const html = readFileSync(join(outDir, page.file), 'utf8');
    const ids = new Set([...html.matchAll(ID)].map((m) => m[1]));

    for (const match of html.matchAll(ATTR)) {
      const raw = match[1].replaceAll('&amp;', '&');
      if (!raw || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(raw)) continue;

      if (raw.startsWith('#')) {
        const id = decodeSafe(raw.slice(1));
        if (id && !ids.has(id)) problems.push({ page: page.file, target: raw, reason: 'no element with this id on the page' });
        continue;
      }

      if (!raw.startsWith('/')) {
        problems.push({ page: page.file, target: raw, reason: 'internal links must be root-relative so they work under any base path' });
        continue;
      }
      if (basePath && !raw.startsWith(`${basePath}/`) && raw !== basePath) {
        problems.push({ page: page.file, target: raw, reason: `internal link does not start with the base path ${basePath}` });
        continue;
      }

      const withoutBase = basePath ? raw.slice(basePath.length) : raw;
      const [pathPart] = withoutBase.split(/[?#]/);
      const decoded = decodeSafe(pathPart);
      const candidate = decoded.endsWith('/') ? join(outDir, decoded, 'index.html') : join(outDir, decoded);
      if (!existsSync(candidate) || !statSync(candidate).isFile()) {
        problems.push({ page: page.file, target: raw, reason: 'no such file in the output' });
      }
    }
  }
  return problems;
}
