/**
 * Sky view factor from the height grid.
 *
 * During a solar particle event the dose at the surface comes from the sky
 * that the astronaut can see. The planet already blocks the lower half of the
 * sphere, so open flat ground sees the full upper hemisphere. Terrain that
 * rises above the local horizon hides part of that hemisphere, and with an
 * isotropic flux above the horizon the dose scales with the visible part.
 * That last step is our assumption (SIM), an upper bound on the saving: the
 * one measurement on Mars, Curiosity's RAD beside Butte M12, saw about 4 %
 * less dose with 19 % of the sky blocked (Ehresmann et al. 2021, JGR Planets
 * 126, doi 10.1029/2021JE006851). The sky view itself is DERIVED geometry.
 *
 * For each cell this module casts rays at a fixed set of azimuths, finds the
 * horizon elevation angle along each ray, and integrates the visible solid
 * angle. The result is a fraction of the upper hemisphere: 1 on open flat
 * ground, lower in a pit or at the foot of a scarp.
 *
 * Plain JavaScript, no React and no three.js. It runs in Node scripts, tests
 * and a Web Worker. The grid layout follows `costGrid.js`: x is east, z is
 * south, node (0, 0) is the north-west corner and the tile is centred on
 * Cheyava Falls.
 */

import { decodeBase64Bytes, sampleHeights } from './costGrid.js';

/**
 * Defaults for the ray cast. All DERIVED choices, explained in
 * `docs/route/shelters.md`.
 */
export const SKY_VIEW_DEFAULTS = Object.freeze({
  /** Number of azimuths, evenly spaced, starting at north. A multiple of 4 keeps mirror symmetry. */
  azimuths: 48,
  /** Rays stop here or at the tile edge, whichever comes first. Metres. */
  maxDistanceM: 400,
  /** First sample distance along each ray. Metres. */
  firstStepM: 1,
  /** Each step is this much longer than the one before. */
  stepGrowth: 1.06,
  /** Steps never get longer than this. Metres. */
  maxStepM: 12,
  /** Height of the dose point above the ground: chest of a crouching astronaut. Metres. */
  observerHeightM: 1,
});

/**
 * Sample distances along one ray, growing geometrically.
 * @param {{maxDistanceM: number, firstStepM: number, stepGrowth: number, maxStepM: number}} options
 * @returns {Float64Array}
 */
export function rayDistances(options) {
  const distances = [];
  let step = options.firstStepM;
  let d = step;
  while (d <= options.maxDistanceM) {
    distances.push(d);
    step = Math.min(options.maxStepM, step * options.stepGrowth);
    d += step;
  }
  return Float64Array.from(distances);
}

/**
 * Precompute the ray offsets in grid units for every azimuth and distance.
 * @param {{n: number, width: number, depth: number}} grid
 * @param {typeof SKY_VIEW_DEFAULTS} options
 */
function buildRays(grid, options) {
  const distances = rayDistances(options);
  const steps = distances.length;
  const count = options.azimuths;
  const perMetreX = (grid.n - 1) / grid.width;
  const perMetreZ = (grid.n - 1) / grid.depth;
  const dfx = new Float64Array(count * steps);
  const dfy = new Float64Array(count * steps);
  for (let a = 0; a < count; a += 1) {
    // Azimuth 0 is north (-z), then clockwise through east (+x).
    const azimuth = (2 * Math.PI * a) / count;
    // Round away the 1e-16 residue of sin and cos so mirrored rays stay mirrored.
    const east = Math.round(Math.sin(azimuth) * 1e12) / 1e12;
    const south = Math.round(-Math.cos(azimuth) * 1e12) / 1e12;
    for (let s = 0; s < steps; s += 1) {
      dfx[a * steps + s] = east * distances[s] * perMetreX;
      dfy[a * steps + s] = south * distances[s] * perMetreZ;
    }
  }
  return { distances, steps, count, dfx, dfy };
}

function maxHeight(heights) {
  let max = -Infinity;
  for (let k = 0; k < heights.length; k += 1) if (heights[k] > max) max = heights[k];
  return max;
}

/**
 * Horizon tangents (rise over run) per azimuth at one fractional grid position.
 * Negative horizons are clamped to 0, because the planet blocks everything
 * below the horizontal anyway.
 */
function horizonTangents(grid, rays, fx, fy, eye, hMax, out) {
  const { n, heights } = grid;
  const { distances, steps, count, dfx, dfy } = rays;
  const last = n - 1;
  for (let a = 0; a < count; a += 1) {
    let best = 0;
    const base = a * steps;
    for (let s = 0; s < steps; s += 1) {
      const d = distances[s];
      // Nothing further out can rise above the current horizon.
      if (hMax - eye <= best * d) break;
      const x = fx + dfx[base + s];
      const y = fy + dfy[base + s];
      if (x < 0 || y < 0 || x > last || y > last) break;
      const tan = (sampleHeights(heights, n, x, y) - eye) / d;
      if (tan > best) best = tan;
    }
    out[a] = best;
  }
  return out;
}

/**
 * Visible fraction of the upper hemisphere from horizon tangents.
 *
 * The solid angle above a horizon at elevation h, for one azimuth slice of
 * width dphi, is dphi * (1 - sin h). Divided by the hemisphere (2 pi) and
 * averaged over the slices, that gives the visible fraction.
 * @param {ArrayLike<number>} tangents horizon tangent per azimuth, 0 or more
 * @returns {number} 1 for open flat ground, 0 for a fully closed sky
 */
export function skyViewFromTangents(tangents) {
  let sum = 0;
  for (let a = 0; a < tangents.length; a += 1) {
    const t = tangents[a];
    sum += 1 - t / Math.sqrt(1 + t * t);
  }
  return sum / tangents.length;
}

function resolveOptions(options) {
  const merged = { ...SKY_VIEW_DEFAULTS, ...options };
  if (!Number.isInteger(merged.azimuths) || merged.azimuths < 4) {
    throw new Error('sky view needs an integer of at least 4 azimuths');
  }
  if (!(merged.maxDistanceM > 0) || !(merged.firstStepM > 0) || !(merged.stepGrowth >= 1)) {
    throw new Error('sky view ray distances must be positive and growing');
  }
  return merged;
}

/**
 * Sky view factor and horizon angles at one world position.
 * @param {{n: number, width: number, depth: number, heights: Float32Array}} grid
 * @param {number} x east, metres
 * @param {number} z south, metres
 * @param {Partial<typeof SKY_VIEW_DEFAULTS>} [options]
 * @returns {{skyView: number, horizonDeg: Float64Array}}
 */
export function skyViewAt(grid, x, z, options = {}) {
  const opts = resolveOptions(options);
  const rays = buildRays(grid, opts);
  const fx = (x / grid.width + 0.5) * (grid.n - 1);
  const fy = (z / grid.depth + 0.5) * (grid.n - 1);
  const eye = sampleHeights(grid.heights, grid.n, fx, fy) + opts.observerHeightM;
  const tangents = horizonTangents(grid, rays, fx, fy, eye, maxHeight(grid.heights), new Float64Array(rays.count));
  const horizonDeg = tangents.map((t) => (Math.atan(t) * 180) / Math.PI);
  return { skyView: skyViewFromTangents(tangents), horizonDeg };
}

/**
 * Sky view factor for every node of the grid, or for every `stride`-th node in both directions.
 *
 * The full 751 x 751 tile takes about 15 s in Node, far too long for the interface, so the app reads a coarse copy
 * made once by `npm run skyview` (scripts/build-sky-view.mjs, public/data/sky_view.json) instead of calling this.
 * @param {{n: number, width: number, depth: number, heights: Float32Array}} grid
 * @param {Partial<typeof SKY_VIEW_DEFAULTS> & { stride?: number }} [options] stride: keep nodes 0, stride, 2 stride…
 *   of the grid; (grid.n - 1) must be a multiple of it so the last node is the tile edge. 1 by default.
 * @returns {{n: number, stride: number, skyView: Float32Array, options: typeof SKY_VIEW_DEFAULTS,
 *   samplesPerRay: number, elapsedMs: number}} n: nodes per side of the result
 */
export function computeSkyView(grid, options = {}) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const { stride = 1, ...rayOptions } = options;
  if (!Number.isInteger(stride) || stride < 1 || (grid.n - 1) % stride !== 0) {
    throw new Error(`sky view stride must be a whole divisor of ${grid.n - 1}`);
  }
  const opts = resolveOptions(rayOptions);
  const rays = buildRays(grid, opts);
  const { n, heights } = grid;
  const count = (n - 1) / stride + 1;
  const hMax = maxHeight(heights);
  const skyView = new Float32Array(count * count);
  const tangents = new Float64Array(rays.count);
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      const i = col * stride;
      const j = row * stride;
      const eye = heights[j * n + i] + opts.observerHeightM;
      horizonTangents(grid, rays, i, j, eye, hMax, tangents);
      skyView[row * count + col] = skyViewFromTangents(tangents);
    }
  }
  const ended = globalThis.performance?.now?.() ?? Date.now();
  return { n: count, stride, skyView, options: opts, samplesPerRay: rays.steps, elapsedMs: ended - started };
}

// --- The coarse grid the app reads ---------------------------------------------------------------------------------

/** Where the app finds the sky view grid made by `npm run skyview`, under the app's base URL. */
export const SKY_VIEW_PATH = 'data/sky_view.json';
/** Spacing of the samples along a route for {@link skyViewAlongPath}, as radio.js samples the radio shadow. Metres. */
export const SKY_PATH_STEP_M = 5;

/**
 * Turn public/data/sky_view.json into a grid laid out like the height grid: node (0, 0) is the north-west corner of
 * the tile, the last node the south-east corner.
 * @param {object} json the parsed file
 * @returns {{ n: number, width: number, depth: number, values: Float32Array, min: number, max: number }}
 *   values: sky view per node, 0 to 1; min and max: the range found on the tile
 */
export function decodeSkyViewGrid(json) {
  if (!json || typeof json !== 'object') throw new TypeError('sky view data must be an object');
  const { n, width_m: width, depth_m: depth, encoding, sky_view_u8_b64: payload } = json;
  if (!Number.isInteger(n) || n < 2) throw new Error('sky view n must be an integer of at least 2');
  if (!(width > 0) || !(depth > 0)) throw new Error('sky view width and depth must be positive');
  if (!encoding || !(encoding.max > encoding.min)) throw new Error('sky view encoding needs min < max');
  const bytes = decodeBase64Bytes(payload);
  if (bytes.length !== n * n) throw new Error(`expected ${n * n} sky view samples, got ${bytes.length}`);
  const values = new Float32Array(bytes.length);
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < bytes.length; k += 1) {
    const value = encoding.min + (bytes[k] / 255) * (encoding.max - encoding.min);
    values[k] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { n, width, depth, values, min, max };
}

/**
 * Sky view at a world position, bilinear between the four nearest nodes; a point outside the tile takes the edge.
 * @param {{ n: number, width: number, depth: number, values: Float32Array }} sky
 * @param {number} x east, metres
 * @param {number} z south, metres
 * @returns {number}
 */
export function sampleSkyView(sky, x, z) {
  const fx = Math.max(0, Math.min(sky.n - 1, (x / sky.width + 0.5) * (sky.n - 1)));
  const fy = Math.max(0, Math.min(sky.n - 1, (z / sky.depth + 0.5) * (sky.n - 1)));
  return sampleHeights(sky.values, sky.n, fx, fy);
}

/**
 * How open the sky is along a route: the exposure readout of the Exposure layer (DERIVED from the HiRISE DTM).
 *
 * If the dose scaled with the visible sky (the SIM assumption at the top of this file, docs/route/shelters.md), `mean`
 * would be the dose on this route as a share of the dose on open flat ground. It is a floor on that share, an upper
 * bound on the saving: the real flux is not isotropic, and RAD measured a dose cut about a fifth of the hidden share.
 * Sampled every few metres and weighted by length, like
 * radio.js `radioShadowAlongPath`.
 * @param {{ n: number, width: number, depth: number, values: Float32Array }} sky decodeSkyViewGrid's result
 * @param {Array<[number, number]>} path [[x, z], ...] in walking order, as route.path
 * @param {number} [stepM]
 * @returns {{ lengthM: number, mean: number, min: number, max: number, lowest: { x: number, z: number } } | null}
 *   lowest: where the sky is most hidden along the route; null without a path or a grid
 */
export function skyViewAlongPath(sky, path, stepM = SKY_PATH_STEP_M) {
  if (!sky || !Array.isArray(path) || path.length < 2 || !(stepM > 0)) return null;
  let lengthM = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let lowest = null;
  for (let k = 0; k < path.length - 1; k += 1) {
    const [ax, az] = path[k];
    const [bx, bz] = path[k + 1];
    const length = Math.hypot(bx - ax, bz - az);
    if (!(length > 0)) continue;
    const steps = Math.max(1, Math.ceil(length / stepM));
    const piece = length / steps;
    for (let s = 0; s < steps; s += 1) {
      const t = (s + 0.5) / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const value = sampleSkyView(sky, x, z);
      lengthM += piece;
      sum += value * piece;
      if (value < min) { min = value; lowest = { x, z }; }
      if (value > max) max = value;
    }
  }
  if (!(lengthM > 0)) return null;
  return { lengthM, mean: sum / lengthM, min, max, lowest };
}
