/**
 * The swatches of what the ground draws for a layer in Walk: `walkSwatches` where the table legend differs (the
 * Terrain caution band follows the crew's risk on the table only; the table's stop markers are not on the ground).
 * @param {import('../plan/layers.js').LayerMeta} meta
 */
export function walkSwatches(meta) {
  return meta.walkSwatches ?? meta.swatches ?? [];
}

/**
 * Plain-text legend of a data layer for the screen reader label of the Walk layer chip (#201), for example
 * "0–15° walkable, 15–20° caution, >20° no-go, Contours every 5 m". `meta` is a layer from src/plan/layers.js.
 * @param {import('../plan/layers.js').LayerMeta} meta
 * @returns {string}
 */
export function legendText(meta) {
  const parts = [];
  if (meta.gradient) parts.push(`${meta.minLabel}–${meta.maxLabel}`);   // the labels carry their unit, for example '0 m'
  for (const s of walkSwatches(meta)) parts.push(s.detail ? `${s.label} ${s.detail}` : s.label);
  return parts.join(', ');
}
