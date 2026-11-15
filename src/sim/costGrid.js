/**
 * Walkability cost grid built from the real Cheyava Falls terrain.
 *
 * This module is plain JavaScript on purpose: no React and no three.js, so it
 * runs both in a Web Worker and in Node-based tests. It is the input of the
 * A* planner (see `routePlanner.js`).
 *
 * Coordinates and layout follow `public/marswalk/assets/terrain.json`:
 * x is east, z is south, both in metres from Cheyava Falls. Node (0, 0) is the
 * north-west corner; row 0 is north and column 0 is west.
 */

/**
 * Penalty constants in one place.
 *
 * The expression `1 + (slope / 9)^2 + 0.6 * rock` comes from the reference
 * planner in
 * `docs/marswalk-assets/testbench-reference/main.js` (`route.astar`). The test
 * bench calls it a placeholder. The slope divisor (9 deg) and the rock weight
 * (0.6) are SIM, our choice: no source sets them, and they decide which route
 * the planner picks (#311). The crew's risk setting swaps them for its own,
 * also SIM (RISK_SETTINGS in `missionNeeds.js`). The shape is our reasoning:
 * slope grows quadratically because a suit gets much slower on steep ground,
 * and rock abundance adds a fixed penalty for the chance of tripping or
 * slipping. The `rock` term is itself SIM, a brightness proxy for rock cover
 * (rockAbundanceAt).
 *
 * The slope limits match `slope.no_go` and `slope.caution` in
 * `public/data/hazards.json` (20 deg is NASA's suited walking limit, xEVA con
 * ops EVA-EXP-0042 Rev B p. 38). The engine's slope layer, the slope-ahead
 * warning and the elevation profile read them from here, and
 * `costGrid.test.js` fails if they drift from `hazards.json`.
 */
export const COST_CONSTANTS = Object.freeze({
  /** Ground steeper than this is NO-GO. Degrees. hazards.json `slope.no_go`. */
  SLOPE_LIMIT_DEG: 20,
  /** Ground steeper than this shows as caution in the slope layer. Degrees. hazards.json `slope.caution`. */
  SLOPE_CAUTION_DEG: 15,
  /** Slope divisor of the quadratic penalty. Degrees. SIM: our choice, no source. */
  SLOPE_PENALTY_DEG: 9,
  /** Weight of the rock-abundance term, 0 to 1. Dimensionless. SIM: our choice, no source. */
  ROCK_PENALTY_WEIGHT: 0.6,
  /** Window used by the engine's slope layer for the central difference. Metres. */
  SLOPE_SAMPLE_M: 2,
  /** Rock density is remapped to this range before it is used. */
  ROCK_DENSITY_MIN: 0.08,
  ROCK_DENSITY_MAX: 1,
});

const DEG_PER_RAD = 180 / Math.PI;

/**
 * Cost multiplier of one open cell: `1 + (slope / slopePenaltyDeg)^slopeExponent + rockWeight * rock`.
 * The defaults are today's planner (COST_CONSTANTS); the route profiles (routeProfiles.js) change the weights.
 * @param {number} slope degrees
 * @param {number} rock rock abundance, 0.08 to 1
 * @param {{ slopePenaltyDeg?: number, slopeExponent?: number, rockWeight?: number }} [weights]
 * @returns {number}
 */
export function cellCost(slope, rock, {
  slopePenaltyDeg = COST_CONSTANTS.SLOPE_PENALTY_DEG,
  slopeExponent = 2,
  rockWeight = COST_CONSTANTS.ROCK_PENALTY_WEIGHT,
} = {}) {
  return 1 + (slope / slopePenaltyDeg) ** slopeExponent + rockWeight * rock;
}

/**
 * Decode a base64 string into bytes without depending on Node or the DOM.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function decodeBase64Bytes(base64) {
  if (typeof base64 !== 'string') {
    throw new TypeError('base64 payload must be a string');
  }
  const atobFn = globalThis.atob;
  if (typeof atobFn !== 'function') {
    throw new Error('This environment has no base64 decoder (atob)');
  }
  const binary = atobFn(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode a base64 payload of little-endian unsigned 16-bit samples.
 * @param {string} base64
 * @returns {Uint16Array}
 */
export function decodeUint16(base64) {
  const bytes = decodeBase64Bytes(base64);
  if (bytes.byteLength % 2 !== 0) {
    throw new Error('base64 payload is not a whole number of 16-bit samples');
  }
  return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

/**
 * Decode a base64 payload of unsigned 8-bit samples.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function decodeUint8(base64) {
  return decodeBase64Bytes(base64);
}

/**
 * Turn `terrain.json` into typed arrays.
 * @param {object} terrainJson parsed contents of `terrain.json`
 * @returns {{n: number, width: number, depth: number, baseElevation: number,
 *   range: number, heights: Float32Array, density: Uint8Array, densityN: number}}
 */
export function decodeTerrain(terrainJson) {
  if (!terrainJson || typeof terrainJson !== 'object') {
    throw new TypeError('terrain data must be an object');
  }
  const { n, width_m: width, depth_m: depth, range_m: range } = terrainJson;
  if (!Number.isInteger(n) || n < 2) {
    throw new Error('terrain.n must be an integer of at least 2');
  }
  if (!(width > 0) || !(depth > 0) || !(range > 0)) {
    throw new Error('terrain width, depth and range must be positive');
  }

  const rawHeights = decodeUint16(terrainJson.heights_u16_b64);
  if (rawHeights.length !== n * n) {
    throw new Error(`expected ${n * n} heights, got ${rawHeights.length}`);
  }
  const heights = new Float32Array(rawHeights.length);
  for (let i = 0; i < rawHeights.length; i += 1) {
    heights[i] = (rawHeights[i] / 65535) * range;
  }

  const densityN = terrainJson.density_n;
  const density = decodeUint8(terrainJson.density_u8_b64);
  if (!Number.isInteger(densityN) || density.length !== densityN * densityN) {
    throw new Error(
      `expected ${densityN * densityN} density samples, got ${density.length}`,
    );
  }

  return {
    n,
    width,
    depth,
    baseElevation: terrainJson.base_elev_m ?? 0,
    range,
    heights,
    density,
    densityN,
  };
}

/**
 * Bilinear sample of the height grid using fractional grid coordinates.
 * @param {Float32Array} heights
 * @param {number} n
 * @param {number} fx column coordinate, 0 to n - 1
 * @param {number} fy row coordinate, 0 to n - 1
 * @returns {number} height in metres above the lowest point of the tile
 */
export function sampleHeights(heights, n, fx, fy) {
  const x0 = Math.max(0, Math.min(n - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(n - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const i = y0 * n + x0;
  const top = heights[i] * (1 - tx) + heights[i + 1] * tx;
  const bottom = heights[i + n] * (1 - tx) + heights[i + n + 1] * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Convert world metres to fractional grid coordinates.
 * @param {{n: number, width: number, depth: number}} grid
 * @param {number} x east, metres
 * @param {number} z south, metres
 * @returns {{fx: number, fy: number}}
 */
export function worldToGrid(grid, x, z) {
  return {
    fx: (x / grid.width + 0.5) * (grid.n - 1),
    fy: (z / grid.depth + 0.5) * (grid.n - 1),
  };
}

/**
 * Convert fractional grid coordinates to world metres.
 * @param {{n: number, width: number, depth: number}} grid
 * @param {number} fx
 * @param {number} fy
 * @returns {{x: number, z: number}}
 */
export function gridToWorld(grid, fx, fy) {
  return {
    x: (fx / (grid.n - 1) - 0.5) * grid.width,
    z: (fy / (grid.n - 1) - 0.5) * grid.depth,
  };
}

/**
 * Height at a world position, bilinear between the four neighbouring nodes.
 * @param {{n: number, width: number, depth: number, heights: Float32Array}} grid
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function heightAt(grid, x, z) {
  const { fx, fy } = worldToGrid(grid, x, z);
  return sampleHeights(grid.heights, grid.n, fx, fy);
}

/**
 * Slope at a world position in degrees.
 *
 * Matches the test bench's slope layer: a central difference over a
 * {@link COST_CONSTANTS.SLOPE_SAMPLE_M} metre window on each side.
 * @param {{n: number, width: number, depth: number, heights: Float32Array}} grid
 * @param {number} x
 * @param {number} z
 * @returns {number} slope in degrees, 0 is flat
 */
export function slopeAt(grid, x, z) {
  const d = COST_CONSTANTS.SLOPE_SAMPLE_M;
  const gx = (heightAt(grid, x + d, z) - heightAt(grid, x - d, z)) / (2 * d);
  const gz = (heightAt(grid, x, z + d) - heightAt(grid, x, z - d)) / (2 * d);
  return Math.atan(Math.hypot(gx, gz)) * DEG_PER_RAD;
}

/**
 * Rock abundance (0.08 to 1) at a world position.
 *
 * The brightness map in `terrain.json` is used as a proxy for rock cover, with
 * the same remap as the test bench (`density()` in `main.js`). It is a model,
 * not a count of individual rocks, and SIM (#311): the remap is our step, and
 * HiRISE brightness also follows lithology, dust and slopes facing the Sun.
 * @param {{width: number, depth: number, density: Uint8Array, densityN: number}} grid
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function rockAbundanceAt(grid, x, z) {
  const n = grid.densityN;
  const c = Math.max(0, Math.min(n - 1, Math.floor((x / grid.width + 0.5) * n)));
  const r = Math.max(0, Math.min(n - 1, Math.floor((z / grid.depth + 0.5) * n)));
  const value = grid.density[r * n + c] / 255;
  return Math.max(
    COST_CONSTANTS.ROCK_DENSITY_MIN,
    Math.min(
      COST_CONSTANTS.ROCK_DENSITY_MAX,
      COST_CONSTANTS.ROCK_DENSITY_MIN +
        ((value - 0.25) / 0.55) * (COST_CONSTANTS.ROCK_DENSITY_MAX - COST_CONSTANTS.ROCK_DENSITY_MIN),
    ),
  );
}

/**
 * Slope at one node using the engine's 2 m central difference.
 * @param {Float32Array} heights
 * @param {number} n
 * @param {number} i column
 * @param {number} j row
 * @param {number} indexPerMetreX
 * @param {number} indexPerMetreZ
 * @returns {number} degrees
 */
function slopeAtNode(heights, n, i, j, indexPerMetreX, indexPerMetreZ) {
  const d = COST_CONSTANTS.SLOPE_SAMPLE_M;
  const dx = d * indexPerMetreX;
  const dz = d * indexPerMetreZ;
  const gx = (sampleHeights(heights, n, i + dx, j) - sampleHeights(heights, n, i - dx, j)) / (2 * d);
  const gz = (sampleHeights(heights, n, i, j + dz) - sampleHeights(heights, n, i, j - dz)) / (2 * d);
  return Math.atan(Math.hypot(gx, gz)) * DEG_PER_RAD;
}

/**
 * Build the walkability grid at load time.
 *
 * Cost is a multiplier, not a distance: the planner multiplies it by the
 * length of the step it is taking. `blocked` is 1 for cells the suit cannot
 * enter (slope over the limit) and 0 otherwise. `baseCost` and `baseBlocked`
 * keep a pristine copy so event zones can be removed again.
 *
 * @param {object} terrainJson parsed `terrain.json`
 * @param {{slopeLimitDeg?: number}} [options]
 * @returns {{
 *   n: number, width: number, depth: number, baseElevation: number,
 *   cellSizeX: number, cellSizeZ: number,
 *   heights: Float32Array, slopes: Float32Array, cost: Float32Array,
 *   blocked: Uint8Array, baseCost: Float32Array, baseBlocked: Uint8Array,
 *   density: Uint8Array, densityN: number
 * }}
 */
export function buildCostGrid(terrainJson, options = {}) {
  const terrain = terrainJson.heights instanceof Float32Array
    ? terrainJson
    : decodeTerrain(terrainJson);
  const { n, width, depth, heights, density, densityN } = terrain;
  const slopeLimit = options.slopeLimitDeg ?? COST_CONSTANTS.SLOPE_LIMIT_DEG;
  const indexPerMetreX = (n - 1) / width;
  const indexPerMetreZ = (n - 1) / depth;
  const count = n * n;

  const slopes = new Float32Array(count);
  const cost = new Float32Array(count);
  const blocked = new Uint8Array(count);
  const densityGrid = { width, depth, density, densityN };
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  for (let i = 0; i < n; i += 1) xs[i] = (i / (n - 1) - 0.5) * width;
  for (let j = 0; j < n; j += 1) zs[j] = (j / (n - 1) - 0.5) * depth;

  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const index = j * n + i;
      const slope = slopeAtNode(heights, n, i, j, indexPerMetreX, indexPerMetreZ);
      const isBlocked = slope > slopeLimit;
      const rock = rockAbundanceAt(densityGrid, xs[i], zs[j]);
      slopes[index] = slope;
      blocked[index] = isBlocked ? 1 : 0;
      cost[index] = isBlocked ? Infinity : cellCost(slope, rock);
    }
  }

  return {
    n,
    width,
    depth,
    baseElevation: terrain.baseElevation,
    cellSizeX: width / (n - 1),
    cellSizeZ: depth / (n - 1),
    heights,
    slopes,
    cost,
    blocked,
    baseCost: cost.slice(),
    baseBlocked: blocked.slice(),
    density,
    densityN,
  };
}

/**
 * Nearest node to a world position.
 * @param {{n: number, width: number, depth: number}} grid
 * @param {number} x
 * @param {number} z
 * @returns {{i: number, j: number}}
 */
export function nearestCell(grid, x, z) {
  const { fx, fy } = worldToGrid(grid, x, z);
  return {
    i: Math.max(0, Math.min(grid.n - 1, Math.round(fx))),
    j: Math.max(0, Math.min(grid.n - 1, Math.round(fy))),
  };
}

/**
 * World position of a node.
 * @param {{n: number, width: number, depth: number}} grid
 * @param {number} i
 * @param {number} j
 * @returns {{x: number, z: number}}
 */
export function cellToWorld(grid, i, j) {
  return gridToWorld(grid, i, j);
}

/**
 * Cost multiplier at a world position (nearest node).
 * @param {object} grid
 * @param {number} x
 * @param {number} z
 * @returns {number} Infinity when blocked
 */
export function costAt(grid, x, z) {
  const { i, j } = nearestCell(grid, x, z);
  return grid.cost[j * grid.n + i];
}

/**
 * Whether the ground at a world position is closed to the suit.
 * @param {object} grid
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function isBlockedAt(grid, x, z) {
  const { i, j } = nearestCell(grid, x, z);
  return grid.blocked[j * grid.n + i] === 1;
}

/**
 * Add a circular blocked or expensive zone at run time (used by events).
 *
 * Zones mutate the grid in place. Call {@link resetZones} to remove all of
 * them, or {@link cloneGrid} to keep the original untouched.
 *
 * @param {object} grid grid from {@link buildCostGrid}
 * @param {{x: number, z: number, radius: number, blocked?: boolean,
 *   costMultiplier?: number, id?: string}} zone
 * @returns {{cells: number, id: string | null}}
 */
export function applyZone(grid, zone) {
  const { x, z, radius } = zone;
  if (!(radius >= 0)) {
    throw new Error('zone radius must be zero or positive');
  }
  const blocked = zone.blocked ?? false;
  const multiplier = zone.costMultiplier ?? 1;
  if (!blocked && multiplier === 1) {
    return { cells: 0, id: zone.id ?? null };
  }

  const { i, j } = nearestCell(grid, x, z);
  const reach = Math.ceil(radius / Math.min(grid.cellSizeX, grid.cellSizeZ));
  const i0 = Math.max(0, i - reach);
  const i1 = Math.min(grid.n - 1, i + reach);
  const j0 = Math.max(0, j - reach);
  const j1 = Math.min(grid.n - 1, j + reach);
  let cells = 0;

  for (let jj = j0; jj <= j1; jj += 1) {
    for (let ii = i0; ii <= i1; ii += 1) {
      const world = cellToWorld(grid, ii, jj);
      if (Math.hypot(world.x - x, world.z - z) > radius) continue;
      const index = jj * grid.n + ii;
      if (blocked) {
        grid.blocked[index] = 1;
        grid.cost[index] = Infinity;
      } else {
        grid.cost[index] *= multiplier;
      }
      cells += 1;
    }
  }
  return { cells, id: zone.id ?? null };
}

/**
 * Apply several zones in one call.
 * @param {object} grid
 * @param {Array<object>} zones
 * @returns {number} number of affected cells
 */
export function applyZones(grid, zones) {
  return zones.reduce((total, zone) => total + applyZone(grid, zone).cells, 0);
}

/**
 * Restore the grid to the state produced by {@link buildCostGrid}.
 * @param {object} grid
 */
export function resetZones(grid) {
  grid.cost.set(grid.baseCost);
  grid.blocked.set(grid.baseBlocked);
}

/**
 * Half-width of the band of ground Perseverance drove, around the centre line of its MMGIS traverse. Metres. Half of
 * the rover's 2.7 m width plus about a 2 m grid cell, so the band has no gaps on the 2 m grid and covers a little of
 * the error of the traverse positions. Our choice (SIM), used by the cautious risk setting (src/sim/missionNeeds.js).
 */
export const TRAVERSE_RADIUS_M = 3;

/** Distance from a point to the segment ab. */
function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/**
 * The grid nodes on ground Perseverance drove: within `radiusM` of a drive of public/data/traverse.json (#249).
 * @param {{ n: number, width: number, depth: number }} grid
 * @param {Array<Array<[number, number]> | { points: Array<[number, number]> }>} drives polylines in metres, or the
 *   drives of parseTraverse (src/data/traverse.js)
 * @param {number} [radiusM]
 * @returns {{ n: number, width: number, depth: number, radiusM: number, cells: Uint8Array, count: number }}
 *   cells[j * n + i] is 1 on the rover's ground
 */
export function traverseMask(grid, drives, radiusM = TRAVERSE_RADIUS_M) {
  const { n, width, depth } = grid;
  const cells = new Uint8Array(n * n);
  let count = 0;
  const perX = (n - 1) / width, perZ = (n - 1) / depth;
  for (const drive of drives ?? []) {
    const points = Array.isArray(drive) ? drive : drive?.points;
    if (!Array.isArray(points)) continue;
    for (let k = 0; k < points.length - 1; k += 1) {
      const [ax, az] = points[k];
      const [bx, bz] = points[k + 1];
      if (![ax, az, bx, bz].every(Number.isFinite)) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - radiusM + width / 2) * perX));
      const i1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + radiusM + width / 2) * perX));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - radiusM + depth / 2) * perZ));
      const j1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + radiusM + depth / 2) * perZ));
      for (let j = j0; j <= j1; j += 1) {
        const z = (j / (n - 1) - 0.5) * depth;
        for (let i = i0; i <= i1; i += 1) {
          const index = j * n + i;
          if (cells[index]) continue;
          const x = (i / (n - 1) - 0.5) * width;
          if (segmentDistance(x, z, ax, az, bx, bz) <= radiusM) {
            cells[index] = 1;
            count += 1;
          }
        }
      }
    }
  }
  return { n, width, depth, radiusM, cells, count };
}

/**
 * Whether a world position is on ground Perseverance drove (nearest node of the mask).
 * @param {{ n: number, width: number, depth: number, cells: Uint8Array }} mask from {@link traverseMask}
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function onTraverse(mask, x, z) {
  const { i, j } = nearestCell(mask, x, z);
  return mask.cells[j * mask.n + i] === 1;
}

/**
 * Deep copy of a grid, so a re-plan can apply event zones without touching the
 * base grid the rest of the app uses.
 * @param {object} grid
 * @returns {object}
 */
export function cloneGrid(grid) {
  return {
    ...grid,
    heights: grid.heights.slice(),
    slopes: grid.slopes.slice(),
    cost: grid.cost.slice(),
    blocked: grid.blocked.slice(),
    baseCost: grid.baseCost.slice(),
    baseBlocked: grid.baseBlocked.slice(),
    density: grid.density.slice(),
  };
}
