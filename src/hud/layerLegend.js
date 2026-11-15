/**
 * Plain-text legend of a data layer for the screen reader label of the Walk layer chip (#201), for example
 * "0–15° walkable, 15–20° caution, >20° no-go". `meta` is a layer from src/plan/layers.js.
 * @param {import('../plan/layers.js').LayerMeta} meta
 * @returns {string}
 */
export function legendText(meta) {
  const parts = [];
  if (meta.gradient) parts.push(`${meta.minLabel}–${meta.maxLabel}`);   // the labels carry their unit, for example '0 m'
  for (const s of meta.swatches ?? []) parts.push(s.detail ? `${s.label} ${s.detail}` : s.label);
  return parts.join(', ');
}
