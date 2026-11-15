// The mission table map (#11): a flat, north-up picture of the site drawn from the same data as the 3D terrain, so
// the table needs no second camera. Plain JavaScript (no React, no DOM): the component passes in pixel arrays.
//
// World frame (docs/STATE_AND_ENGINE.md): x east, z south, metres from Cheyava Falls at the centre of the tile.
// Image frame: column = (x / width + 0.5) * w, row = (z / depth + 0.5) * h, as the terrain shader samples the ortho.
// The colours repeat the terrain shader (src/engine/shaders.js, TERRAIN_FRAG) so a layer looks the same in both; radio
// shadow and exposure are drawn here only (table-only layers, src/plan/layers.js).

import { EXPOSURE_RANGE, SLOPE_LIMITS } from './layers.js';
import { formatNumber, t } from '../i18n/index.js';
import { rockAbundanceAt, sampleHeights } from '../sim/costGrid.js';
import { inRadioShadow } from '../sim/radio.js';
import { sampleSkyView } from '../sim/skyView.js';

/** Layer indices of src/plan/layers.js, as in the store's `view.layer` and the engine's `uLayer`. */
export const LAYER = Object.freeze({ IMAGE: 0, TERRAIN: 1, ROCK: 2, OUTCROP: 3, RADIO: 4, EXPOSURE: 5 });
/** Spacing of the Terrain layer's contour lines, as in the terrain shader. Metres. */
export const CONTOUR_STEP_M = 5;
/**
 * The smallest side of the table map's default framing. Metres. A 55 m first sortie then fills a third of the map
 * instead of a tenth, so the layers and the route profiles change something the eye can see; the full EVA (about
 * 780 m from the habitat to Cheyava Falls) frames at its own size.
 */
export const MAP_MIN_SPAN_M = 150;

/**
 * The square of ground the map shows: every point (route and stops) with a margin, clamped inside the tile.
 * @param {Array<{ x: number, z: number }>} points
 * @param {{ width: number, depth: number }} tile
 * @param {{ pad?: number, min?: number }} [options] pad: margin as a share of the larger side; min: smallest size in m
 * @returns {{ x0: number, z0: number, size: number }} north-west corner and side, metres
 */
export function mapCrop(points, tile, { pad = 0.14, min = 500 } = {}) {
  const valid = points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z));
  const limit = Math.min(tile.width, tile.depth);
  if (!valid.length) return { x0: -limit / 2, z0: -limit / 2, size: limit };
  const xs = valid.map((p) => p.x), zs = valid.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const side = Math.max(maxX - minX, maxZ - minZ);
  const size = Math.min(limit, Math.max(min, side * (1 + 2 * pad)));
  const clamp = (centre, extent) => Math.min(extent / 2 - size / 2, Math.max(-extent / 2 + size / 2, centre));
  const cx = clamp((minX + maxX) / 2, tile.width);
  const cz = clamp((minZ + maxZ) / 2, tile.depth);
  return { x0: cx - size / 2, z0: cz - size / 2, size };
}

/**
 * Zoom a crop about a point given as a share (0 to 1) of the square, keeping that point under the pointer.
 * @param {{ x0: number, z0: number, size: number }} crop
 * @param {number} factor below 1 zooms in
 * @param {number} fx share of the width from the left edge
 * @param {number} fz share of the height from the top edge
 * @param {{ width: number, depth: number }} tile
 * @param {number} [min] smallest side in metres
 */
export function zoomCrop(crop, factor, fx, fz, tile, min = 120) {
  const limit = Math.min(tile.width, tile.depth);
  const size = Math.min(limit, Math.max(min, crop.size * factor));
  const x = crop.x0 + fx * crop.size, z = crop.z0 + fz * crop.size;
  return clampCrop({ x0: x - fx * size, z0: z - fz * size, size }, tile);
}

/** Keep a crop inside the tile. */
export function clampCrop(crop, tile) {
  const x0 = Math.min(tile.width / 2 - crop.size, Math.max(-tile.width / 2, crop.x0));
  const z0 = Math.min(tile.depth / 2 - crop.size, Math.max(-tile.depth / 2, crop.z0));
  return { x0, z0, size: crop.size };
}

/** World position to a share (0 to 100) of the map square, for an SVG with viewBox 0 0 100 100. */
export function toMap(x, z, crop) {
  return [((x - crop.x0) / crop.size) * 100, ((z - crop.z0) / crop.size) * 100];
}

/** Round a map width to a readable number of metres for the caption. */
export function acrossLabel(size) {
  const step = size >= 1000 ? 50 : 10;
  return t('map.across', { m: Math.round(size / step) * step });
}

/**
 * The places a layer marks on the table map (LayerPlaces.jsx), beside the route's own stop markers:
 * - Outcrop: the candidate stops of stops.json the route does not visit, with why: dropped by the plan (route.dropped,
 *   with its limit) or part of another objective. The stops it visits already have their numbered markers.
 * - Exposure: the natural shelters of shelters.json with their dose cut. The habitat is the route's first marker.
 * @param {number} layer
 * @param {{ candidates?: Array<{ id: string, name: string, waypoint: string, x: number, z: number }>,
 *   stops?: Array<{ id: string }>, dropped?: Array<{ id: string, limit: string }>, waypoints?: Array<{ name: string }>,
 *   shelters?: Array<object> }} data candidates: stops.routeStopCandidates; stops, dropped, waypoints: the store's route
 * @returns {Array<{ id: string, kind: 'candidate' | 'shelter', x: number, z: number, label: string, detail: string, title: string }>}
 */
export function layerPlaces(layer, { candidates = [], stops = [], dropped = [], waypoints = [], shelters = [] } = {}) {
  if (layer === LAYER.OUTCROP) {
    const visited = new Set(stops.map((s) => s.id));
    const names = new Set(waypoints.map((w) => w.name));
    const why = new Map(dropped.map((d) => [d.id, d.limit]));
    return candidates
      .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.z) && !visited.has(c.id) && !names.has(c.waypoint))
      .map((c) => {
        const label = c.waypoint?.includes(' · ') ? c.waypoint.split(' · ')[1] : c.name;
        const limit = why.get(c.id);
        const detail = limit ? t('layers.stop.dropped.' + (['time', 'o2', 'battery'].includes(limit) ? limit : 'unreachable')) : t('layers.stop.other');
        return { id: c.id, kind: 'candidate', x: c.x, z: c.z, label, detail, title: `${c.name}: ${detail}` };
      });
  }
  if (layer === LAYER.EXPOSURE) {
    return shelters
      .filter((s) => s.type === 'natural' && Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.values?.sky_view_factor?.value))
      .map((s) => {
        const sky = s.values.sky_view_factor.value;
        const pct = Math.round((s.values.dose_reduction?.value ?? 1 - sky) * 100);
        const label = t('layers.shelter.tag', { id: s.id, pct });
        return { id: s.id, kind: 'shelter', x: s.x, z: s.z, label, detail: '', title: t('layers.shelter.title', { name: s.name, sky: formatNumber(sky, 2), pct }) };
      });
  }
  return [];
}

// Mars colour ramp of the terrain shader (linear RGB). HiRISE is grayscale; the colour is artistic (credits statement).
const RAMP = [
  [0, [0.068, 0.042, 0.021]],
  [0.35, [0.228, 0.143, 0.072]],
  [0.6, [0.468, 0.298, 0.152]],
  [0.82, [0.705, 0.479, 0.262]],
  [1, [0.845, 0.633, 0.372]],
];

/** @param {number} g HiRISE brightness 0 to 1 @returns {number[]} linear RGB */
export function marsColour(g) {
  for (let k = 1; k < RAMP.length; k += 1) {
    const [t1, c1] = RAMP[k];
    if (g <= t1 || k === RAMP.length - 1) {
      const [t0, c0] = RAMP[k - 1];
      const f = Math.min(1, Math.max(0, (g - t0) / (t1 - t0)));
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The four-stop ramp of the Exposure layer (layers.js gradient), the one the old Elevation layer used. t: 0 to 1. */
function ramp4(t) {
  let r = mix(0.1, 0.2, smooth(0, 0.35, t)), gg = mix(0.3, 0.85, smooth(0, 0.35, t)), b = mix(0.9, 0.5, smooth(0, 0.35, t));
  const s2 = smooth(0.35, 0.7, t); r = mix(r, 0.98, s2); gg = mix(gg, 0.85, s2); b = mix(b, 0.2, s2);
  const s3 = smooth(0.7, 1, t); r = mix(r, 0.9, s3); gg = mix(gg, 0.2, s3); b = mix(b, 0.1, s3);
  return [r, gg, b];
}

/**
 * Overlay colour and opacity of a data layer at one point. The layers the ground also draws (Terrain, Rocks, Outcrop)
 * repeat the terrain shader; Radio shadow and Exposure are drawn on the table only.
 * @param {number} layer an index of LAYER
 * @param {{ slope?: number, rock?: number, mask?: number, shadow?: boolean, sky?: number | null }} sample
 *   slope in degrees; rock: abundance 0.08 to 1 from the planner's density grid; mask: outcrop mask 0 to 1; shadow: the
 *   habitat mast cannot see this point; sky: sky view 0 to 1, null when the grid is not loaded
 * @param {{ cautionDeg?: number }} [options] cautionDeg: where the Terrain layer's caution band starts (layers.cautionDeg)
 * @returns {[number, number, number, number]} linear RGB and alpha
 */
export function layerColour(layer, { slope, rock, mask, shadow, sky } = {}, { cautionDeg = SLOPE_LIMITS.caution } = {}) {
  if (layer === LAYER.TERRAIN) {
    // Walkable ground stays clear on the table map, so the caution and no-go bands read at a glance.
    if (slope > SLOPE_LIMITS.noGo) return [0.9, 0.08, 0.05, 0.6];
    if (slope > cautionDeg) return [0.95, 0.6, 0.1, 0.45];
    return [0, 0, 0, 0];
  }
  if (layer === LAYER.ROCK) {
    const d = Math.min(1, Math.max(0.08, rock));
    return [mix(0.15, 1, d), mix(0.2, 0.75, d), mix(0.6, 0.1, d), 0.55];
  }
  if (layer === LAYER.OUTCROP) return [0.3, 0.9, 0.95, smooth(0.05, 0.45, mask) * 0.6];
  if (layer === LAYER.RADIO) return shadow ? [0.357, 0.561, 0.749, 0.55] : [0, 0, 0, 0];
  if (layer === LAYER.EXPOSURE) {
    if (!Number.isFinite(sky)) return [0, 0, 0, 0];
    const [r, gg, b] = ramp4(Math.min(1, Math.max(0, (sky - EXPOSURE_RANGE.min) / (EXPOSURE_RANGE.max - EXPOSURE_RANGE.min))));
    return [r, gg, b, 0.45];
  }
  return [0, 0, 0, 0];
}

/**
 * Strength (0 to 1) of a contour line at one pixel, as the terrain shader draws its 5 m contours: full on the contour,
 * fading out over about 1.5 pixels.
 * @param {number} height metres
 * @param {number} slopeDeg slope at the point, which sets how fast the height changes across a pixel
 * @param {number} metresPerPixel
 * @returns {number}
 */
export function contourLine(height, slopeDeg, metresPerPixel) {
  const c = height / CONTOUR_STEP_M;
  const width = Math.max(1e-4, (Math.tan((Math.min(slopeDeg, 89) * Math.PI) / 180) * metresPerPixel * 1.4) / CONTOUR_STEP_M);
  return 1 - smooth(0, 1.5, Math.abs(c - Math.floor(c + 0.5)) / width);
}

/** Slope in degrees at every node of the height grid (central differences, one-sided at the edges). */
export function slopeGrid({ n, width, depth, heights }) {
  const out = new Float32Array(n * n);
  const dx = width / (n - 1), dz = depth / (n - 1);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const gx = (heights[j * n + i1] - heights[j * n + i0]) / ((i1 - i0) * dx);
      const gz = (heights[j1 * n + i] - heights[j0 * n + i]) / ((j1 - j0) * dz);
      out[j * n + i] = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
    }
  }
  return out;
}

const toSrgb = (c) => {
  const v = Math.min(1, Math.max(0, c));
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
};

/**
 * Paint the map square into an RGBA pixel array.
 * @param {Uint8ClampedArray} out size * size * 4
 * @param {number} size pixels per side
 * @param {{ x0: number, z0: number, size: number }} crop
 * @param {number} layer
 * @param {{ ortho: { w: number, h: number, data: Uint8ClampedArray }, mask?: { w: number, h: number, data: Uint8ClampedArray } | null,
 *   terrain: { n: number, width: number, depth: number, heights: Float32Array, range: number, density: Uint8Array, densityN: number },
 *   slopes: Float32Array, radio?: object | null, sky?: object | null }} data
 *   ortho and mask: RGBA pixels of the grayscale images (the red channel is read); terrain: costGrid.decodeTerrain, whose
 *   density grid is the one the planner prices; radio: radio.radioShadowMask for the habitat mast; sky: skyView.decodeSkyViewGrid
 * @param {{ cautionDeg?: number }} [options] passed to layerColour
 */
export function paintMap(out, size, crop, layer, { ortho, mask, terrain, slopes, radio = null, sky = null }, options = {}) {
  const { n, width, depth, heights } = terrain;
  const metres = crop.size / size;
  for (let py = 0; py < size; py += 1) {
    const z = crop.z0 + (py + 0.5) * metres;
    const v = z / depth + 0.5;
    const oy = Math.min(ortho.h - 1, Math.max(0, Math.floor(v * ortho.h)));
    const gj = Math.min(n - 1, Math.max(0, Math.round(v * (n - 1))));
    const my = mask ? Math.min(mask.h - 1, Math.max(0, Math.floor(v * mask.h))) : 0;
    for (let px = 0; px < size; px += 1) {
      const x = crop.x0 + (px + 0.5) * metres;
      const u = x / width + 0.5;
      const ox = Math.min(ortho.w - 1, Math.max(0, Math.floor(u * ortho.w)));
      const g = ortho.data[(oy * ortho.w + ox) * 4] / 255;
      let [r, gg, b] = marsColour(g);
      // a little light so the flat map is not darker than the lit terrain
      r *= 1.35; gg *= 1.35; b *= 1.35;
      if (layer > 0) {
        const gi = Math.min(n - 1, Math.max(0, Math.round(u * (n - 1))));
        const node = gj * n + gi;
        const sample = { slope: slopes[node] };
        if (layer === LAYER.ROCK) sample.rock = rockAbundanceAt(terrain, x, z);
        else if (layer === LAYER.OUTCROP) sample.mask = mask ? mask.data[(my * mask.w + Math.min(mask.w - 1, Math.max(0, Math.floor(u * mask.w)))) * 4] / 255 : 0;
        else if (layer === LAYER.RADIO) sample.shadow = radio ? inRadioShadow(radio, x, z) : false;
        else if (layer === LAYER.EXPOSURE) sample.sky = sky ? sampleSkyView(sky, x, z) : null;
        const [lr, lg, lb, a] = layerColour(layer, sample, options);
        if (a > 0) {
          const lum = 0.35 + (r + gg + b) * 0.6;
          r = mix(r, lr * lum, a); gg = mix(gg, lg * lum, a); b = mix(b, lb * lum, a);
        }
        if (layer === LAYER.TERRAIN) {
          // 5 m contours, the part of the old Elevation layer that still reads; a bilinear height keeps the lines smooth
          const line = contourLine(sampleHeights(heights, n, u * (n - 1), v * (n - 1)), slopes[node], metres);
          if (line > 0) { const w = line * 0.6; r = mix(r, 1, w); gg = mix(gg, 1, w); b = mix(b, 1, w); }
        }
      }
      const k = (py * size + px) * 4;
      out[k] = toSrgb(r); out[k + 1] = toSrgb(gg); out[k + 2] = toSrgb(b); out[k + 3] = 255;
    }
  }
  return out;
}
