import { catalogs, getLanguage, t } from '../i18n/index.js';
import { tableLegend } from './layers.js';

// The mission table's text for the map layers of src/plan/layers.js. The list, the order, the swatches and what each
// layer decides come from layers.js, so a layer added or merged there reaches the table's buttons and legend without
// a second list here. The table only words a layer more briefly where it has its own key: `table.layer.<id>` is the
// button, `table.layer.<id>.title` the map caption and `table.layer.<id>.legend` the legend heading; without them the
// layer's own name and summary are used.

const has = (key) => Object.hasOwn(catalogs[getLanguage()], key);

/** Short text on the layer button. */
export function layerButtonText(layer) {
  const key = `table.layer.${layer.id}`;
  return has(key) ? t(key) : layer.name;
}

/** The map caption while the layer is shown. */
export function layerMapTitle(layer) {
  const key = `table.layer.${layer.id}.title`;
  return has(key) ? t(key) : layer.summary;
}

/** The heading of the layer's legend on the map. */
export function layerLegendTitle(layer) {
  const key = `table.layer.${layer.id}.legend`;
  return has(key) ? t(key) : layer.name;
}

/** "What this layer decides": layers.js gives an i18n key in `decides`; null when the layer has none. */
export function layerDecides(layer) {
  return typeof layer?.decides === 'string' && layer.decides ? t(layer.decides) : null;
}

/**
 * The legend rows of a layer, from its swatches and its colour ramp in layers.js. A swatch is drawn clear when the
 * table map leaves that band unpainted: `clear` on the swatch, or the walkable band of the slope layer, which the
 * table map leaves clear so the caution and no-go bands read at a glance (mapLayers.layerColour).
 * The swatches and ramp come from layers.tableLegend for what the table knows now: Terrain's caution band follows the
 * crew's risk, Exposure's ramp is labelled with the loaded sky view grid's range.
 * @param {{ id: string, swatches?: Array<{ color: string, label: string, detail?: string, clear?: boolean }>,
 *   gradient?: string[], minLabel?: string, maxLabel?: string }} layer
 * @param {{ risk?: string, sky?: { min: number, max: number } | null }} [context] store `needs.risk`; the sky view grid
 * @returns {Array<{ key: string, text: string, color: string | null, gradient: string | null }>}
 */
export function legendRows(layer, context = {}) {
  const rows = [];
  if (!layer) return rows;
  const legend = typeof layer.index === 'number' ? tableLegend(layer, context) : layer;
  if (Array.isArray(legend.gradient) && legend.gradient.length > 1) {
    rows.push({
      key: 'ramp',
      text: [legend.minLabel, legend.maxLabel].filter(Boolean).join(' – '),
      color: null,
      gradient: `linear-gradient(90deg, ${legend.gradient.join(', ')})`,
    });
  }
  (legend.swatches ?? []).forEach((swatch, k) => {
    const clear = swatch.clear ?? (layer.id === 'slope' && k === 0);
    rows.push({
      key: `swatch-${k}`,
      text: swatch.detail ? `${swatch.label} · ${swatch.detail}` : swatch.label,
      color: clear ? null : swatch.color,
      gradient: null,
    });
  });
  return rows;
}
