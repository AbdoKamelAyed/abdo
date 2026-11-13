// Pure text helpers with no Node APIs, so the same code runs in the build and in the browser admin
// (the admin renders previews with the real page renderer).

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for use in HTML text nodes and quoted attribute values. */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Serialize data as JSON that is safe inside an HTML <script> element. */
export function safeJsonForScript(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');
}

/** Percent-encode every segment of a path, keeping the slashes. */
export function encodePath(path) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
