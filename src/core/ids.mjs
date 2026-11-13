// Stable ID generation: <prefix>_<8 characters of 0-9a-z>, unique across all content.

export const ID_PREFIX = { article: 'art', project: 'prj', topic: 'top', tag: 'tag', media: 'med', author: 'aut', block: 'blk', section: 'hsc', nav: 'nvi', preset: 'dsp', experience: 'exp', education: 'edu', skills: 'skl', custom: 'cus' };
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Uniform random index in [0, n) from a byte source, rejecting biased values. */
function pick(randomBytes, n) {
  const limit = 256 - (256 % n);
  for (;;) {
    const [b] = randomBytes(1);
    if (b < limit) return b % n;
  }
}

const cryptoBytes = (count) => globalThis.crypto.getRandomValues(new Uint8Array(count));

/**
 * @param {string} kind key of ID_PREFIX
 * @param {Set<string>|string[]} taken IDs already in use (never returned)
 * @param {(count: number) => Uint8Array} [randomBytes] injectable for tests
 */
export function newId(kind, taken = [], randomBytes = cryptoBytes) {
  const prefix = ID_PREFIX[kind];
  if (!prefix) throw new Error(`Unknown ID kind "${kind}"`);
  const used = taken instanceof Set ? taken : new Set(taken);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let id = `${prefix}_`;
    for (let i = 0; i < 8; i += 1) id += ALPHABET[pick(randomBytes, ALPHABET.length)];
    if (!used.has(id)) return id;
  }
  throw new Error('Could not generate a unique ID');
}

/** Every ID-looking string that appears anywhere in the given JSON values. */
export function collectIds(...values) {
  const found = new Set();
  const walk = (v) => {
    if (typeof v === 'string') { if (/^[a-z]{3}_[0-9a-z]{8}$/.test(v)) found.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  values.forEach(walk);
  return found;
}
