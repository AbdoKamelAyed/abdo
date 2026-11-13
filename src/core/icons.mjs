// A small set of line icons a topic can use. Each is plain SVG path data on a 24x24 grid, drawn with the
// current text colour, so they follow the theme (light, dark, any preset) and need no image file or font.
// Pure: the build, the admin picker and the validator all read this one list.

export const ICONS = Object.freeze({
  pen: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z M14.5 6.5l3 3',
  book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3V4z M5 17a3 3 0 013-3h10',
  code: 'M9 7l-5 5 5 5 M15 7l5 5-5 5',
  compass: 'M12 3a9 9 0 100 18 9 9 0 000-18z M15.5 8.5l-2 5-5 2 2-5 5-2z',
  layers: 'M12 3l9 4.5-9 4.5-9-4.5L12 3z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z',
  flask: 'M9 3h6 M10 3v6L4.5 18.5A2 2 0 006.3 21h11.4a2 2 0 001.8-2.5L14 9V3 M7.5 15h9',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8z M12 10a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  music: 'M9 18V6l10-2v12 M9 18a3 3 0 11-6 0 3 3 0 016 0z M19 16a3 3 0 11-6 0 3 3 0 016 0z',
  wrench: 'M15 5a4 4 0 00-3.5 5.5L4.5 17.5a2 2 0 003 3l7-7A4 4 0 0019 9l-2.5 2.5-2.5-.5-.5-2.5L16 6a4 4 0 00-1-1z',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15 M5 19l7-7',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5z',
  heart: 'M12 20s-8-4.6-8-10.2A4.6 4.6 0 0112 7a4.6 4.6 0 018 2.8C20 15.4 12 20 12 20z',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z M9 12l2 2 4-4',
  pin: 'M12 21s6-5.6 6-11a6 6 0 10-12 0c0 5.4 6 11 6 11z M12 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  language: 'M4 6h9 M8.5 4v2 M6 6c0 3.5 2.5 6.5 6 8 M11 6c0 3-2 6-6 8 M13 20l4-9 4 9 M14.5 17h5',
  cpu: 'M7 7h10v10H7V7z M9.5 9.5h5v5h-5v-5z M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  archive: 'M3 5h18v4H3V5z M5 9v10h14V9 M10 13h4',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6 M16 4.5a3.5 3.5 0 010 6.5 M18 14.4c2 .8 3.5 2.6 3.5 5.6',
  file: 'M6 3h8l4 4v14H6V3z M14 3v4h4 M9 12h6 M9 16h6',
});

export const ICON_KEYS = Object.freeze(Object.keys(ICONS));
export const isIcon = (key) => Object.hasOwn(ICONS, key);

/** The icon as an inline SVG string (decorative: hidden from screen readers; the topic name is always beside it). */
export function iconSvg(key, { size = 20 } = {}) {
  if (!isIcon(key)) return '';
  const paths = ICONS[key].split(' M').map((d, i) => `<path d="${i === 0 ? d : `M${d}`}"/>`).join('');
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// Icons for the interface itself (not offered as topic icons).
const UI_ICONS = { search: 'M11 4a7 7 0 100 14 7 7 0 000-14z M16 16l4.5 4.5' };
export function uiIconSvg(key, { size = 18 } = {}) {
  if (!Object.hasOwn(UI_ICONS, key)) return '';
  const paths = UI_ICONS[key].split(' M').map((d, i) => `<path d="${i === 0 ? d : `M${d}`}"/>`).join('');
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}
