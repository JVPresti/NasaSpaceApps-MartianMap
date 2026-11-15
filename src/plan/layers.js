import { provenance } from '../data/provenance.js';
import { t, formatNumber } from '../i18n/index.js';
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { RISK_SETTINGS } from '../sim/missionNeeds.js';
/**
 * Map layer metadata: names, what each layer decides, thresholds, colours and units. One list for the mission table,
 * the 3D ground in Walk, the wrist layers page, the Walk layer chip and the L / Shift+L / 0 keys; `view.layer` in the
 * store is the `index` of an entry. Why each layer exists, and why Elevation was merged into Terrain, is written down
 * in docs/data/map-layers-decision.md.
 *
 * Plain data and pure functions: no store, no React. What depends on the moment (the crew's risk setting, the sky view
 * grid once it has loaded) is passed in, to `tableLegend`.
 *
 * - The colours and thresholds mirror `uLayer` in `src/engine/shaders.js` (TERRAIN_FRAG) for the layers the ground
 *   draws (`walk: true`), and `layerColour` in `src/plan/mapLayers.js` for the table map, which draws them all.
 * - The slope limits come from `COST_CONSTANTS` in `src/sim/costGrid.js`, which the shader and the route planner also
 *   read, and which `costGrid.test.js` checks against `slope.caution` and `slope.no_go` in `public/data/hazards.json`.
 * - `decides` is an i18n key: one short line on the decision the layer drives, shown under the table legend.
 * - `provenance` ({ tag, label, source }, English like the rest of the registry) is the legend's source tag.
 * - `walk: false` marks a table-only layer: the ground in Walk stays plain, the wrist and the layer chip leave it out
 *   and L / Shift+L skip it in Walk (WALK_LAYERS, walkLayerIndex, nextLayerIndex).
 */

/** Slope thresholds in degrees: the suit's caution and no-go limits. */
export const SLOPE_LIMITS = Object.freeze({
  caution: COST_CONSTANTS.SLOPE_CAUTION_DEG,
  noGo: COST_CONSTANTS.SLOPE_LIMIT_DEG,
});

/** Colours of the markers the table map draws on some layers, repeated in the legend swatches (mapLayers.css). */
export const MARKER_COLOURS = Object.freeze({
  stop: '#2bffed',        // a stop on the route: the route's science marker (.map-marker.target, var(--cyan))
  candidate: '#c9d0d8',   // a candidate stop the plan did not keep (.map-place-candidate)
  shelter: '#0a0d11',     // a shelter: the habitat's square marker (.map-marker-home)
  radio: '#5b8fbf',       // ground out of sight of the habitat mast, as the engine's radio-shadow overlay
});

const knownRisk = (risk) => (Object.hasOwn(RISK_SETTINGS, risk) ? risk : 'standard');

/**
 * Where the caution band of the Terrain layer starts on the mission table, for a risk setting: the slope the planner
 * prices as it prices the suit's caution limit at standard risk. The slope term of the cost is (slope / k)², with k the
 * risk's slope divisor (missionNeeds.RISK_SETTINGS), so the band starts at caution × k / k(standard), in whole degrees
 * and never past the no-go limit, which never moves: 12° cautious, 15° standard, 20° (no band) bold. DERIVED.
 * @param {string} risk 'cautious' | 'standard' | 'bold'
 * @returns {number}
 */
export function cautionDeg(risk) {
  const k = RISK_SETTINGS[knownRisk(risk)].slopePenaltyDeg;
  return Math.min(SLOPE_LIMITS.noGo, Math.round((SLOPE_LIMITS.caution * k) / COST_CONSTANTS.SLOPE_PENALTY_DEG));
}

const contours = { color: '#ffffff', get label() { return t('ui.contours'); }, get detail() { return t('ui.every.5.m'); } };

/**
 * Legend swatches of the Terrain layer on the mission table for a risk setting. The table map leaves walkable ground
 * clear (`clear`), so the caution and no-go bands read at a glance.
 * @param {string} risk
 */
export function terrainSwatches(risk) {
  const from = cautionDeg(risk);
  const riskName = t('layers.risk.' + knownRisk(risk));
  const noGo = { color: '#e6140d', label: `>${SLOPE_LIMITS.noGo}°`, get detail() { return t('walkableNoGo'); } };
  if (from >= SLOPE_LIMITS.noGo) {
    return [{ color: '#33cc66', clear: true, label: `0–${SLOPE_LIMITS.noGo}°`, detail: t('layers.terrain.walkable.risk', { risk: riskName }) }, noGo, contours];
  }
  return [
    { color: '#33cc66', clear: true, label: `0–${from}°`, get detail() { return t('ui.walkable'); } },
    { color: '#f2991a', label: `${from}–${SLOPE_LIMITS.noGo}°`, detail: t('layers.terrain.caution.risk', { risk: riskName }) },
    noGo,
    contours,
  ];
}

/** @typedef {{ id: string, index: number, walk: boolean, decides: string, provenance: { tag: string, label: string, source: string },
 *   name: string, unit: string, summary: string, source: string,
 *   swatches?: Array<{ color: string, label: string, detail?: string, clear?: boolean }>,
 *   walkSwatches?: Array<{ color: string, label: string, detail?: string }>,
 *   gradient?: string[], minLabel?: string, maxLabel?: string }} LayerMeta
 *   swatches: the table legend at standard risk (tableLegend gives it for the crew's setting); walkSwatches: the legend
 *   of what the ground draws in Walk, where it differs */

/** @type {LayerMeta[]} */
export const LAYERS = [
  {
    // The base map under every layer: it drives no decision of its own.
    id: 'none',
    index: 0,
    walk: true,
    decides: 'layers.decides.none',
    provenance: { tag: 'DATA', label: 'HiRISE · MRO', source: 'HiRISE orthomosaic of Jezero (JEZ_hirise_soc_006), source 25 cm per pixel, shown at about 0.5 m' },
    get name() { return t('ui.none'); },
    get unit() { return t('layers.photo'); },
    get summary() { return t('ui.hirise.orthomosaic.25.cm.per.pixel.no.analysis'); },
    source: 'DATA · NASA/JPL-Caltech/UArizona/MSSS · HiRISE',
  },
  {
    // Terrain: the slope bands and, since Elevation was merged in, its 5 m contours. The id stays 'slope' so the
    // table's keys (table.layer.slope*) and the preview image keep their names.
    id: 'slope',
    index: 1,
    walk: true,
    decides: 'layers.decides.slope',
    provenance: {
      tag: 'DERIVED', label: 'HiRISE DTM',
      source: 'slope and 5 m contours from the HiRISE 1 m DEM; the 20 degree no-go limit from hazards.json (suit), the caution band from the crew\'s risk setting as the planner prices it',
    },
    get name() { return t('layers.terrain'); },
    get unit() { return t('layers.terrain.unit'); },
    get summary() { return t('layers.terrain.summary', SLOPE_LIMITS); },
    get source() { return t('ui.derived.hirise.dtm.limits.in.hazards.json'); },
    // At standard risk; tableLegend gives the table's band for the crew's setting. The ground keeps the suit's limits.
    get swatches() { return terrainSwatches('standard'); },
    walkSwatches: [
      { color: '#33cc66', label: `0–${SLOPE_LIMITS.caution}°`, get detail() { return t('ui.walkable'); } },
      { color: '#f2991a', label: `${SLOPE_LIMITS.caution}–${SLOPE_LIMITS.noGo}°`, get detail() { return t('caution'); } },
      { color: '#e6140d', label: `>${SLOPE_LIMITS.noGo}°`, get detail() { return t('walkableNoGo'); } },
      contours,
    ],
  },
  {
    // Rock cover from the density grid of terrain.json, the same grid the route planner prices (costGrid.rockAbundanceAt).
    // Bare ground stays almost clear and rocky ground turns yellow, so the photo still reads under the layer.
    id: 'rock',
    index: 2,
    walk: true,
    decides: 'layers.decides.rock',
    provenance: {
      tag: 'DERIVED', label: 'HiRISE · Golombek model',
      source: 'rock abundance from the density grid of terrain.json (HiRISE brightness remapped with the Golombek et al. 2003 model), the grid the route planner prices',
    },
    get name() { return t('ui.rock.abundance'); },
    get unit() { return t('ui.fraction.0.1'); },
    get summary() { return t('layers.rock.summary'); },
    get source() { return t('layers.rock.source'); },
    gradient: ['rgba(38, 51, 153, 0.15)', '#ffbf1a'],
    get minLabel() { return `${formatNumber(COST_CONSTANTS.ROCK_DENSITY_MIN, 2)} ${t('layers.rock.bare')}`; },
    get maxLabel() { return `${formatNumber(COST_CONSTANTS.ROCK_DENSITY_MAX, 1)} ${t('layers.rock.rocky')}`; },
    swatches: [],
  },
  {
    // Light-toned bedrock, the science target; on the table, with the candidate stops of stops.json.
    id: 'outcrop',
    index: 3,
    walk: true,
    decides: 'layers.decides.outcrop',
    provenance: {
      tag: 'DERIVED', label: 'HiRISE · outcrop mask',
      source: 'light-toned bedrock from the HiRISE brightness mask (outcrop_mask.jpg); candidate stops from stops.json, kept or dropped by the plan',
    },
    get name() { return t('ui.outcrop'); },
    get unit() { return t('ui.fraction.0.1'); },
    get summary() { return t('layers.outcrop.summary'); },
    get source() { return t('ui.derived.hirise.orthomosaic.outcrop.mask'); },
    gradient: ['rgba(77, 230, 242, 0)', '#4de6f2'],
    get minLabel() { return t('ui.none'); },
    get maxLabel() { return t('layers.outcropMaximum'); },
    get swatches() {
      return [
        { color: MARKER_COLOURS.stop, label: t('layers.outcrop.stop'), detail: t('layers.outcrop.stop.detail') },
        { color: MARKER_COLOURS.candidate, label: t('layers.outcrop.candidate'), detail: t('layers.outcrop.candidate.detail') },
      ];
    },
    walkSwatches: [],
  },
  {
    // Where the habitat mast cannot be seen: the cells the radio-contact profile prices (radio.radioShadowMask).
    id: 'radio',
    index: 4,
    walk: false,
    decides: 'layers.decides.radio',
    provenance: {
      tag: 'DERIVED', label: 'HiRISE DTM · line of sight',
      source: 'line of sight from each 10 m cell to the habitat mast over the HiRISE height grid, the mask the radio-contact route prices (src/sim/radio.js)',
    },
    get name() { return t('ui.radio.shadow'); },
    get unit() { return t('layers.radio.unit'); },
    get summary() { return t('layers.radio.summary'); },
    get source() { return t('layers.radio.source'); },
    get swatches() {
      return [
        { color: '#000000', clear: true, label: t('layers.radio.sight') },
        { color: MARKER_COLOURS.radio, label: t('layers.radio.shadow'), detail: t('layers.radio.shadow.detail') },
      ];
    },
  },
  {
    // How open the sky is (public/data/sky_view.json): a radiation readout and the shelter choice, not the path.
    id: 'exposure',
    index: 5,
    walk: false,
    decides: 'layers.decides.exposure',
    provenance: {
      tag: 'DERIVED', label: 'HiRISE DTM · sky view',
      source: 'share of the sky seen from 1 m above the ground, on the 6 m grid of public/data/sky_view.json (npm run skyview); shelters from shelters.json. Narrow range on this tile',
    },
    get name() { return t('layers.exposure'); },
    get unit() { return t('layers.exposure.unit'); },
    get summary() { return t('layers.exposure.summary'); },
    get source() { return t('layers.exposure.source'); },
    gradient: ['#1a4ce6', '#33d980', '#fad933', '#e6331a'],
    get minLabel() { return t('layers.exposure.sheltered'); },
    get maxLabel() { return t('layers.exposure.open'); },
    get swatches() { return [{ color: MARKER_COLOURS.shelter, label: t('layers.exposure.shelter'), detail: t('layers.exposure.shelter.detail') }]; },
  },
];

/**
 * The legend of a layer on the mission table for what the table knows now. Terrain's caution band follows the crew's
 * risk setting; Exposure's ramp is labelled with the range of the loaded sky view grid (its colours span that range,
 * mapLayers.layerColour), and with words alone until it loads.
 * @param {LayerMeta} layer
 * @param {{ risk?: string, sky?: { min: number, max: number } | null }} [context] risk: store `needs.risk`; sky: the
 *   decoded grid (skyView.decodeSkyViewGrid)
 * @returns {{ swatches: Array<object>, gradient?: string[], minLabel?: string, maxLabel?: string }}
 */
export function tableLegend(layer, { risk = 'standard', sky = null } = {}) {
  const legend = { swatches: layer.swatches ?? [], gradient: layer.gradient, minLabel: layer.minLabel, maxLabel: layer.maxLabel };
  if (layer.id === 'slope') return { ...legend, swatches: terrainSwatches(risk) };
  if (layer.id === 'exposure' && sky && Number.isFinite(sky.min) && Number.isFinite(sky.max)) {
    return { ...legend, minLabel: `${formatNumber(sky.min, 2)} ${legend.minLabel}`, maxLabel: `${formatNumber(sky.max, 2)} ${legend.maxLabel}` };
  }
  return legend;
}

/**
 * The provenance path of a layer's legend tag (`<SourceTag path={layerProvenancePath(layer)} requireSource={false} />`):
 * the layer's `provenance`, registered below.
 * @param {LayerMeta} layer
 */
export function layerProvenancePath(layer) {
  return 'map.layer.' + layer.id;
}

provenance.define(Object.fromEntries(LAYERS.map((layer) => [layerProvenancePath(layer), layer.provenance])));

/** The layers the ground draws in Walk, in L order; the wrist layers page lists them. */
export const WALK_LAYERS = Object.freeze(LAYERS.filter((layer) => layer.walk));

/**
 * @param {number} index as in the store's `view.layer` and the engine's `uLayer`
 * @returns {LayerMeta}
 */
export function layerMeta(index) {
  return LAYERS[index] || LAYERS[0];
}

/**
 * The layer Walk shows for a store index: the layer itself when the ground draws it, else none (0). A table-only
 * layer chosen at the table stays chosen in the store and comes back on the table; Walk just shows no layer.
 * @param {number} index
 * @returns {number}
 */
export function walkLayerIndex(index) {
  const layer = LAYERS[index];
  return layer && layer.walk ? layer.index : 0;
}

/**
 * The row of WALK_LAYERS (the wrist layers page) that Walk shows for a store index: 0, none, for a table-only layer.
 * @param {number} index
 * @returns {number}
 */
export function walkRow(index) {
  return Math.max(0, WALK_LAYERS.findIndex((layer) => layer.index === walkLayerIndex(index)));
}

/**
 * The next layer for L (+1) or Shift+L (-1), wrapping at both ends: every layer at the table, only WALK_LAYERS in Walk.
 * @param {number} index the store's `view.layer`
 * @param {number} direction +1 or -1
 * @param {'plan' | 'walk'} mode
 * @returns {number}
 */
export function nextLayerIndex(index, direction, mode) {
  const list = mode === 'walk' ? WALK_LAYERS : LAYERS;
  const current = list.findIndex((layer) => layer.index === (mode === 'walk' ? walkLayerIndex(index) : index));
  const next = ((current < 0 ? 0 : current) + (direction < 0 ? -1 : 1) + list.length) % list.length;
  return list[next].index;
}

/**
 * A few sample values quoted in the UI, so a number always has its source.
 * @param {number} layerIndex
 * @returns {string}
 */
export function layerSource(layerIndex) {
  return layerMeta(layerIndex).source;
}
