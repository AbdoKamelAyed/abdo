// Upload validation: decide what a file really is from its bytes (never from its name or the
// type the browser reports) and read its pixel size. Supports PNG, JPEG, GIF and WebP.
//
// SVG is refused on purpose: an SVG file can carry scripts, and a file served from the site's own
// address would run them. It can be allowed once uploads are sanitised.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_DIMENSION = 12000;

export class UploadError extends Error {
  constructor(code, message) { super(message); this.name = 'UploadError'; this.code = code; }
}

const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, to));
const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u32be = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function png(b) {
  if (b.length < 24 || ascii(b, 12, 16) !== 'IHDR') return null;
  return { mimeType: 'image/png', ext: 'png', width: u32be(b, 16), height: u32be(b, 20) };
}

function gif(b) {
  return b.length < 10 ? null : { mimeType: 'image/gif', ext: 'gif', width: u16le(b, 6), height: u16le(b, 8) };
}

function jpeg(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    const length = u16be(b, i + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return { mimeType: 'image/jpeg', ext: 'jpg', height: u16be(b, i + 5), width: u16be(b, i + 7) };
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function webp(b) {
  if (b.length < 30) return null;
  const kind = ascii(b, 12, 16);
  const out = { mimeType: 'image/webp', ext: 'webp' };
  if (kind === 'VP8 ') return { ...out, width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { ...out, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { ...out, width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/** @param {Uint8Array} bytes */
export function inspectImage(bytes, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!(bytes instanceof Uint8Array)) throw new UploadError('invalid', 'Expected file bytes.');
  if (bytes.length === 0) throw new UploadError('empty', 'The file is empty.');
  if (bytes.length > maxBytes) throw new UploadError('too-large', `The file is ${(bytes.length / 1048576).toFixed(1)} MB; the limit is ${(maxBytes / 1048576).toFixed(0)} MB.`);

  let info = null;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') info = png(bytes);
  else if (ascii(bytes, 0, 3) === 'GIF') info = gif(bytes);
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) info = jpeg(bytes);
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') info = webp(bytes);
  else {
    const head = new TextDecoder().decode(bytes.subarray(0, 512)).toLowerCase();
    if (head.includes('<svg') || head.includes('<?xml')) throw new UploadError('svg', 'SVG files are not accepted yet because they can contain scripts. Export the image as PNG, JPEG or WebP.');
    throw new UploadError('unsupported', 'Unsupported file type. Use PNG, JPEG, GIF or WebP.');
  }
  if (!info || !info.width || !info.height) throw new UploadError('corrupt', 'The image is damaged or incomplete.');
  if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) throw new UploadError('dimensions', `The image is ${info.width}×${info.height}px; the limit is ${MAX_DIMENSION}px on each side.`);
  return { ...info, size: bytes.length };
}

/** A safe file name: lowercase ASCII, digits and hyphens, never user-controlled path parts. */
export function safeMediaName(originalName, ext, taken = new Set(), randomSuffix = () => Math.random().toString(36).slice(2, 8)) {
  const stem = String(originalName ?? '').replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  let name = `${stem}.${ext}`;
  while (taken.has(name)) name = `${stem}-${randomSuffix()}.${ext}`;
  return name;
}
