/**
 * Sky view factor from the height grid.
 *
 * During a solar particle event the dose at the surface comes from the sky
 * that the astronaut can see. The planet already blocks the lower half of the
 * sphere, so open flat ground sees the full upper hemisphere. Terrain that
 * rises above the local horizon hides part of that hemisphere, and with an
 * isotropic flux above the horizon the dose scales with the visible part.
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

import { sampleHeights } from './costGrid.js';

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
 * Sky view factor for every node of the grid.
 * @param {{n: number, width: number, depth: number, heights: Float32Array}} grid
 * @param {Partial<typeof SKY_VIEW_DEFAULTS>} [options]
 * @returns {{n: number, skyView: Float32Array, options: typeof SKY_VIEW_DEFAULTS,
 *   samplesPerRay: number, elapsedMs: number}}
 */
export function computeSkyView(grid, options = {}) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const opts = resolveOptions(options);
  const rays = buildRays(grid, opts);
  const { n, heights } = grid;
  const hMax = maxHeight(heights);
  const skyView = new Float32Array(n * n);
  const tangents = new Float64Array(rays.count);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const index = j * n + i;
      const eye = heights[index] + opts.observerHeightM;
      horizonTangents(grid, rays, i, j, eye, hMax, tangents);
      skyView[index] = skyViewFromTangents(tangents);
    }
  }
  const ended = globalThis.performance?.now?.() ?? Date.now();
  return { n, skyView, options: opts, samplesPerRay: rays.steps, elapsedMs: ended - started };
}
