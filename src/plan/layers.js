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
    name: 'None',
    unit: 'photo',
    summary: 'HiRISE orthomosaic, 25 cm per pixel. No analysis layer.',
    source: 'DATA · NASA/JPL-Caltech/UArizona/MSSS · HiRISE',
  },
  {
    id: 'slope',
    index: 1,
    name: 'Slope hazard',
    unit: 'degrees',
    summary: 'Slope from the HiRISE 1 m DEM. Suit mobility limits: 15° caution, 25° no-go.',
    source: 'DERIVED · HiRISE DTM · limits in hazards.json',
    swatches: [
      { color: '#33cc66', label: '0–15°', detail: 'walkable' },
      { color: '#f2991a', label: '15–25°', detail: 'caution' },
      { color: '#e6140d', label: '>25°', detail: 'no-go' },
    ],
  },
  {
    id: 'elevation',
    index: 2,
    name: 'Elevation',
    unit: 'm',
    summary: 'Height above the lowest point of the tile, with a contour every 5 m.',
    source: 'DATA · HiRISE DTM · 2 m grid',
    gradient: ['#1a4ce6', '#33d980', '#fad933', '#e6331a'],
    minLabel: '0 m',
    maxLabel: '221 m',
    swatches: [{ color: '#ffffff', label: 'Contours', detail: 'every 5 m' }],
  },
  {
    id: 'rock',
    index: 3,
    name: 'Rock abundance',
    unit: 'fraction 0–1',
    summary: 'HiRISE brightness remapped to rock cover with the Golombek size-frequency model.',
    source: 'DERIVED · HiRISE · Golombek model',
    gradient: ['#263399', '#ffbf1a'],
    minLabel: '0.08',
    maxLabel: '1.0',
    swatches: [],
  },
  {
    id: 'outcrop',
    index: 4,
    name: 'Outcrop',
    unit: 'fraction 0–1',
    summary: 'Light-toned bedrock from the HiRISE brightness mask.',
    source: 'DERIVED · HiRISE orthomosaic · outcrop mask',
    gradient: ['rgba(77, 230, 242, 0)', '#4de6f2'],
    minLabel: 'none',
    maxLabel: 'outcrop',
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
