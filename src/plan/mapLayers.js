// The mission table map (#11): a flat, north-up picture of the site drawn from the same data as the 3D terrain, so
// the table needs no second camera. Plain JavaScript (no React, no DOM): the component passes in pixel arrays.
//
// World frame (docs/STATE_AND_ENGINE.md): x east, z south, metres from Cheyava Falls at the centre of the tile.
// Image frame: column = (x / width + 0.5) * w, row = (z / depth + 0.5) * h, as the terrain shader samples the ortho.
// The colours repeat the terrain shader (src/engine/shaders.js, TERRAIN_FRAG) so a layer looks the same in both.

import { SLOPE_LIMITS } from './layers.js';

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
  return `${Math.round(size / step) * step} m across`;
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

/**
 * Overlay colour and opacity of a data layer at one point, as in the terrain shader.
 * @param {number} layer 0 photo, 1 slope, 2 elevation, 3 rock abundance, 4 outcrop
 * @param {{ g: number, slope: number, height: number, relief: number, mask: number }} sample
 * @returns {[number, number, number, number]} linear RGB and alpha
 */
export function layerColour(layer, { g, slope, height, relief, mask }) {
  if (layer === 1) {
    // Walkable ground stays clear on the table map, so the caution and no-go bands read at a glance.
    if (slope > SLOPE_LIMITS.noGo) return [0.9, 0.08, 0.05, 0.6];
    if (slope > SLOPE_LIMITS.caution) return [0.95, 0.6, 0.1, 0.45];
    return [0, 0, 0, 0];
  }
  if (layer === 2) {
    const t = Math.min(1, Math.max(0, height / relief));
    let r = mix(0.1, 0.2, smooth(0, 0.35, t)), gg = mix(0.3, 0.85, smooth(0, 0.35, t)), b = mix(0.9, 0.5, smooth(0, 0.35, t));
    const s2 = smooth(0.35, 0.7, t); r = mix(r, 0.98, s2); gg = mix(gg, 0.85, s2); b = mix(b, 0.2, s2);
    const s3 = smooth(0.7, 1, t); r = mix(r, 0.9, s3); gg = mix(gg, 0.2, s3); b = mix(b, 0.1, s3);
    return [r, gg, b, 0.5];
  }
  if (layer === 3) {
    const d = Math.min(1, Math.max(0.08, 0.08 + ((g - 0.25) / 0.55) * 0.92));
    return [mix(0.15, 1, d), mix(0.2, 0.75, d), mix(0.6, 0.1, d), 0.55];
  }
  if (layer === 4) return [0.3, 0.9, 0.95, smooth(0.05, 0.45, mask) * 0.6];
  return [0, 0, 0, 0];
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
 *   terrain: { n: number, width: number, depth: number, heights: Float32Array, range: number }, slopes: Float32Array }} data
 *   ortho and mask: RGBA pixels of the grayscale images (the red channel is read)
 */
export function paintMap(out, size, crop, layer, { ortho, mask, terrain, slopes }) {
  const { n, width, depth, heights } = terrain;
  const relief = terrain.range;
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
        const m = mask ? mask.data[(my * mask.w + Math.min(mask.w - 1, Math.max(0, Math.floor(u * mask.w)))) * 4] / 255 : 0;
        const [lr, lg, lb, a] = layerColour(layer, { g, slope: slopes[node], height: heights[node], relief, mask: m });
        if (a > 0) {
          const lum = 0.35 + (r + gg + b) * 0.6;
          r = mix(r, lr * lum, a); gg = mix(gg, lg * lum, a); b = mix(b, lb * lum, a);
        }
      }
      const k = (py * size + px) * 4;
      out[k] = toSrgb(r); out[k + 1] = toSrgb(gg); out[k + 2] = toSrgb(b); out[k + 3] = 255;
    }
  }
  return out;
}
