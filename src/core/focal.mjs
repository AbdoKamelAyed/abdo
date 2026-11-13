// The focal point of an image: the part that must stay visible when a frame crops it (a card, a
// 16:9 hero, a square thumbnail). Stored on the media asset as percentages from the top-left corner.
//
// It is drawn with classes, not with an inline style, so the same page works under the admin's strict
// Content Security Policy (the preview) and the public site. The stylesheet has a class for every
// step of FOCAL_STEP percent; the stored value is exact, the drawn one is rounded to the nearest step.

export const FOCAL_STEP = 5;

const clamp = (n) => Math.max(0, Math.min(100, n));
const step = (n) => clamp(Math.round(Number(n) / FOCAL_STEP) * FOCAL_STEP);

/** The two class names for a focal point, or '' when there is none or it is the centre (the default). */
export function focalClass(focal) {
  if (!focal || !Number.isFinite(Number(focal.x)) || !Number.isFinite(Number(focal.y))) return '';
  const x = step(focal.x);
  const y = step(focal.y);
  return x === 50 && y === 50 ? '' : `fx-${x} fy-${y}`;
}

/** Every class the stylesheet must define. */
export function focalClassNames() {
  const out = [];
  for (let n = 0; n <= 100; n += FOCAL_STEP) out.push({ axis: 'x', n }, { axis: 'y', n });
  return out;
}

/** A focal point as stored: whole numbers 0 to 100. Returns null for the centre or for nonsense. */
export function normalizeFocal(x, y) {
  const fx = Math.round(Number(x));
  const fy = Math.round(Number(y));
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  const point = { x: clamp(fx), y: clamp(fy) };
  return point.x === 50 && point.y === 50 ? null : point;
}
