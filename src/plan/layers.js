import { t, formatNumber } from '../i18n/index.js';
/**
 * Plan-mode layer metadata: names, thresholds, colours and units.
 *
 * The colours and thresholds mirror `uLayer` in `src/engine/shaders.js`
 * (TERRAIN_FRAG). The slope limits (15 and 25 degrees) are the mobility limits
 * recorded in the project plan and used by the cost grid.
 */

/** Slope thresholds in degrees. */
export const SLOPE_LIMITS = Object.freeze({ caution: 15, noGo: 25 });

/** @typedef {{ id: string, index: number, name: string, unit: string, summary: string,
 *   source: string, swatches?: Array<{ color: string, label: string, detail?: string }>,
 *   gradient?: string[], minLabel?: string, maxLabel?: string }} LayerMeta */

/** @type {LayerMeta[]} */
export const LAYERS = [
  {
    id: 'none',
    index: 0,
    get name() { return t('ui.none'); },
    get unit() { return t('layers.photo'); },
    get summary() { return t('ui.hirise.orthomosaic.25.cm.per.pixel.no.analysis'); },
    source: 'DATA · NASA/JPL-Caltech/UArizona/MSSS · HiRISE',
  },
  {
    id: 'slope',
    index: 1,
    get name() { return t('ui.slope.hazard'); },
    get unit() { return t('ui.degrees'); },
    get summary() { return t('ui.slope.from.the.hirise.1.m.dem.suit'); },
    get source() { return t('ui.derived.hirise.dtm.limits.in.hazards.json'); },
    swatches: [
      { color: '#33cc66', label: '0–15°', get detail() { return t('ui.walkable'); } },
      { color: '#f2991a', label: '15–25°', get detail() { return t('caution'); } },
      { color: '#e6140d', label: '>25°', get detail() { return t('walkableNoGo'); } },
    ],
  },
  {
    id: 'elevation',
    index: 2,
    get name() { return t('ui.elevation'); },
    unit: 'm',
    get summary() { return t('ui.height.above.the.lowest.point.of.the.tile'); },
    get source() { return t('ui.data.hirise.dtm.2.m.grid'); },
    gradient: ['#1a4ce6', '#33d980', '#fad933', '#e6331a'],
    minLabel: '0 m',
    maxLabel: '221 m',
    swatches: [{ color: '#ffffff', get label() { return t('ui.contours'); }, get detail() { return t('ui.every.5.m'); } }],
  },
  {
    id: 'rock',
    index: 3,
    get name() { return t('ui.rock.abundance'); },
    get unit() { return t('ui.fraction.0.1'); },
    get summary() { return t('ui.hirise.brightness.remapped.to.rock.cover.with.the'); },
    get source() { return t('ui.derived.hirise.golombek.model'); },
    gradient: ['#263399', '#ffbf1a'],
    get minLabel() { return formatNumber(0.08, 2); },
    get maxLabel() { return formatNumber(1, 1); },
    swatches: [],
  },
  {
    id: 'outcrop',
    index: 4,
    get name() { return t('ui.outcrop'); },
    get unit() { return t('ui.fraction.0.1'); },
    get summary() { return t('ui.light.toned.bedrock.from.the.hirise.brightness.mask'); },
    get source() { return t('ui.derived.hirise.orthomosaic.outcrop.mask'); },
    gradient: ['rgba(77, 230, 242, 0)', '#4de6f2'],
    get minLabel() { return t('ui.none'); },
    get maxLabel() { return t('layers.outcropMaximum'); },
    swatches: [],
  },
];

/**
 * @param {number} index 0 to 4, as in the engine's `uLayer`
 * @returns {LayerMeta}
 */
export function layerMeta(index) {
  return LAYERS[index] || LAYERS[0];
}

/**
 * A few sample values quoted in the UI, so a number always has its source.
 * @param {number} layerIndex
 * @returns {string}
 */
export function layerSource(layerIndex) {
  return layerMeta(layerIndex).source;
}
