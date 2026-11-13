import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function readJson(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`);
  }
}

export function writeText(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

export function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

export function listFiles(dir, extension) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => (extension ? name.endsWith(extension) : true))
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();
}

export function shortHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

// Pure text helpers live in src/core/text.mjs (browser-safe); re-exported so existing imports keep working.
export { encodePath, esc, safeJsonForScript, uniqueBy } from '../core/text.mjs';
