/**
 * A* route planner over the walkability grid.
 *
 * Plain JavaScript with no React and no three.js: it runs in a Web Worker
 * (`routePlanner.worker.js`) so the 3D view never stalls while it searches.
 * The output is the `path` format that `public/marswalk/assets/route.json`
 * already accepts: an ordered list of `[x, z]` pairs in metres.
 *
 * Coordinates: x east, z south, origin at Cheyava Falls.
 */

import {
  cellToWorld,
  costAt,
  nearestCell,
  heightAt,
  isBlockedAt,
  slopeAt,
} from './costGrid.js';

const SQRT2 = Math.SQRT2;
/**
 * How close the route gets to a waypoint that sits on blocked ground. Metres.
 * WP3, the Bright Angel outcrop, sits on a 28.7 degree slope, over the 20 degree
 * suited limit, so the astronaut samples it from walkable ground at its base.
 * With that limit the nearest connected walkable ground is between 15 and 20 m away.
 */
const DEFAULT_GOAL_RADIUS_M = 20;
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Normalise a waypoint to `{x, z, name?}`.
 * Accepts `{x, z}` objects and `[x, z]` pairs.
 * @param {{x: number, z: number, name?: string}|[number, number]} waypoint
 * @returns {{x: number, z: number, name?: string}}
 */
export function normaliseWaypoint(waypoint) {
  if (Array.isArray(waypoint)) {
    if (waypoint.length < 2) throw new Error('waypoint pair needs x and z');
    return { x: Number(waypoint[0]), z: Number(waypoint[1]) };
  }
  if (!waypoint || !Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.z)) {
    throw new Error('waypoint needs finite x and z');
  }
  return { ...waypoint };
}

/**
 * Find a free node near `(i, j)` if the requested node is blocked.
 * Returns null when nothing free is close enough.
 * @param {object} grid
 * @param {number} i
 * @param {number} j
 * @param {number} maxRadius max search radius in cells
 * @returns {{i: number, j: number}|null}
 */
function nearestFreeCell(grid, i, j, maxRadius) {
  const index = j * grid.n + i;
  if (grid.blocked[index] === 0) return { i, j };

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let best = null;
    let bestDistance = Infinity;
    for (let dj = -radius; dj <= radius; dj += 1) {
      for (let di = -radius; di <= radius; di += 1) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== radius) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= grid.n || jj >= grid.n) continue;
        const node = jj * grid.n + ii;
        if (grid.blocked[node] === 1) continue;
        const distance = di * di + dj * dj;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { i: ii, j: jj };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Minimal binary min-heap keyed by f score. */
class MinHeap {
  constructor() {
    this.nodes = [];
    this.scores = [];
  }

  get size() {
    return this.nodes.length;
  }

  push(node, score) {
    const { nodes, scores } = this;
    let i = nodes.length;
    nodes.push(node);
    scores.push(score);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (scores[parent] <= scores[i]) break;
      [nodes[parent], nodes[i]] = [nodes[i], nodes[parent]];
      [scores[parent], scores[i]] = [scores[i], scores[parent]];
      i = parent;
    }
  }

  pop() {
    const { nodes, scores } = this;
    const top = nodes[0];
    const lastNode = nodes.pop();
    const lastScore = scores.pop();
    if (nodes.length > 0) {
      nodes[0] = lastNode;
      scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < nodes.length && scores[left] < scores[smallest]) smallest = left;
        if (right < nodes.length && scores[right] < scores[smallest]) smallest = right;
        if (smallest === i) break;
        [nodes[smallest], nodes[i]] = [nodes[i], nodes[smallest]];
        [scores[smallest], scores[i]] = [scores[i], scores[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/** Octile distance in metres: admissible for 8-direction movement. */
function heuristic(grid, fromI, fromJ, toI, toJ) {
  const dx = Math.abs(fromI - toI) * grid.cellSizeX;
  const dz = Math.abs(fromJ - toJ) * grid.cellSizeZ;
  return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
}

/**
 * The reusable search buffers. A generation stamp avoids clearing a 563k-cell
 * array for every waypoint pair.
 */
function createSearchState(grid) {
  const count = grid.n * grid.n;
  return {
    gScore: new Float64Array(count),
    previous: new Int32Array(count),
    stamp: new Uint32Array(count),
    closed: new Uint32Array(count),
    generation: 0,
  };
}

/**
 * A* between two world positions. The returned path is a list of grid nodes
 * from start to goal, inclusive. Returns null when no path exists.
 *
 * The goal is a radius, not one cell: a science waypoint can sit on an outcrop
 * that is too steep to stand on, and the crew then stops at the walkable edge.
 * If the exact waypoint is walkable, the search reaches it.
 * @param {object} grid
 * @param {{x: number, z: number}} start
 * @param {{x: number, z: number}} goal
 * @param {object} state
 * @param {{maxIterations?: number, snapRadius?: number, goalRadiusM?: number,
 *   heuristicWeight?: number}} options
 * @returns {{nodes: Array<{i: number, j: number}>, snappedM: number}|null}
 */
function searchSegment(grid, start, goal, state, options) {
  const startCell = nearestCell(grid, start.x, start.z);
  const goalCell = nearestCell(grid, goal.x, goal.z);
  const freeStart = nearestFreeCell(grid, startCell.i, startCell.j, options.snapRadius);
  if (!freeStart) return null;

  const { n, cellSizeX, cellSizeZ, cost, blocked } = grid;
  const { gScore, previous, stamp, closed } = state;
  state.generation += 1;
  const generation = state.generation;

  const startNode = freeStart.j * n + freeStart.i;
  const heap = new MinHeap();
  const heuristicWeight = options.heuristicWeight ?? 1;
  gScore[startNode] = 0;
  stamp[startNode] = generation;
  previous[startNode] = -1;
  heap.push(startNode, heuristicWeight * heuristic(grid, freeStart.i, freeStart.j, goalCell.i, goalCell.j));

  let iterations = 0;
  const maxIterations = options.maxIterations ?? n * n;
  const goalRadius = options.goalRadiusM ?? DEFAULT_GOAL_RADIUS_M;

  while (heap.size > 0) {
    const current = heap.pop();
    // A node can be queued more than once when a cheaper path is found. The
    // first pop is final because the heuristic is consistent.
    if (closed[current] === generation) continue;
    closed[current] = generation;
    iterations += 1;
    if (iterations > maxIterations) return null;
    const i = current % n;
    const j = Math.floor(current / n);

    const goalDistance = Math.hypot(
      (i - goalCell.i) * cellSizeX,
      (j - goalCell.j) * cellSizeZ,
    );
    if (goalDistance <= goalRadius && blocked[current] === 0) {
      const nodes = [];
      let node = current;
      while (node !== -1) {
        nodes.push({ i: node % n, j: Math.floor(node / n) });
        node = previous[node];
      }
      nodes.reverse();
      return { nodes, snappedM: goalDistance };
    }

    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      const neighbour = nj * n + ni;
      if (blocked[neighbour] === 1) continue;
      // Do not cut a diagonal between two blocked orthogonal cells.
      if (di !== 0 && dj !== 0) {
        if (blocked[j * n + ni] === 1 || blocked[nj * n + i] === 1) continue;
      }

      const stepLength =
        di !== 0 && dj !== 0
          ? Math.hypot(cellSizeX, cellSizeZ)
          : di !== 0
            ? cellSizeX
            : cellSizeZ;
      // A blocked cell has an infinite cost; the defensive check keeps the
      // search finite if a caller forgets to keep `blocked` and `cost` in sync.
      const multiplier = Number.isFinite(cost[neighbour]) ? cost[neighbour] : Infinity;
      if (!Number.isFinite(multiplier)) continue;
      const tentative = gScore[current] + stepLength * multiplier;

      if (stamp[neighbour] !== generation || tentative < gScore[neighbour]) {
        stamp[neighbour] = generation;
        gScore[neighbour] = tentative;
        previous[neighbour] = current;
        const h = heuristic(grid, ni, nj, goalCell.i, goalCell.j);
        heap.push(neighbour, tentative + heuristicWeight * h);
      }
    }
  }

  return null;
}

/**
 * Whether the straight line between two world positions stays on open ground.
 * Samples at half a cell so a narrow blocked band cannot be jumped over.
 * @param {object} grid
 * @param {{x: number, z: number}} a
 * @param {{x: number, z: number}} b
 * @returns {boolean}
 */
export function isSegmentClear(grid, a, b) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length === 0) return !isBlockedAt(grid, a.x, a.z);
  const step = Math.min(grid.cellSizeX, grid.cellSizeZ) * 0.5;
  const steps = Math.ceil(length / step);
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    if (isBlockedAt(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) {
      return false;
    }
  }
  return true;
}

/**
 * Remove the cell-by-cell zigzag while keeping the line clear of blocked cells.
 * @param {object} grid
 * @param {Array<[number, number]>} path
 * @returns {Array<[number, number]>}
 */
export function smoothPath(grid, path) {
  if (path.length <= 2) return path;
  const result = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i += 1) {
    const a = path[anchor];
    const b = path[i];
    if (!isSegmentClear(grid, { x: a[0], z: a[1] }, { x: b[0], z: b[1] })) {
      anchor = i - 1;
      result.push(path[anchor]);
    }
  }
  result.push(path[path.length - 1]);
  return result;
}

/**
 * Weighted cost of the straight line between two world positions: its length times the mean cost multiplier,
 * sampled at half a cell (nearest node). Infinity when a sample is blocked.
 * @param {object} grid
 * @param {{x: number, z: number}} a
 * @param {{x: number, z: number}} b
 * @returns {number}
 */
export function segmentCost(grid, a, b) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length === 0) return 0;
  const steps = Math.max(1, Math.ceil(length / (Math.min(grid.cellSizeX, grid.cellSizeZ) * 0.5)));
  let total = 0;
  for (let s = 0; s < steps; s += 1) {
    const t = (s + 0.5) / steps;
    const multiplier = costAt(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (!Number.isFinite(multiplier)) return Infinity;
    total += multiplier;
  }
  return (total * length) / steps;
}

/**
 * How much more than the cells it replaces a shortcut may cost in {@link smoothPathByCost}: 2 %. Without slack the
 * line keeps a vertex every few cells; with it the radio and gentlest routes have about half as many vertices and
 * keep their gain (offline runs on the route.json stops, #245).
 */
export const COST_SMOOTHING_SLACK = 0.02;

/**
 * Like {@link smoothPath}, but a shortcut is taken only when it costs at most {@link COST_SMOOTHING_SLACK} more than
 * the cells it replaces, on the grid's own cost. `smoothPath` only keeps clear of blocked cells, so on a grid that
 * prices slope or radio shadow its straight lines cut back across the ground the search went around (#245).
 * @param {object} grid
 * @param {Array<[number, number]>} path
 * @param {number} [slack]
 * @returns {Array<[number, number]>}
 */
export function smoothPathByCost(grid, path, slack = COST_SMOOTHING_SLACK) {
  if (path.length <= 2) return path;
  const point = ([x, z]) => ({ x, z });
  const walked = new Float64Array(path.length);
  for (let k = 1; k < path.length; k += 1) {
    walked[k] = walked[k - 1] + segmentCost(grid, point(path[k - 1]), point(path[k]));
  }
  const result = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i += 1) {
    const a = point(path[anchor]);
    const b = point(path[i]);
    const replaced = walked[i] - walked[anchor];
    const shortcut = isSegmentClear(grid, a, b) && segmentCost(grid, a, b) <= replaced * (1 + slack);
    if (!shortcut) {
      anchor = i - 1;
      result.push(path[anchor]);
    }
  }
  result.push(path[path.length - 1]);
  return result;
}

/**
 * Route metrics in the same shape the Plan panel and the HUD need.
 * @param {object} grid
 * @param {Array<[number, number]>} path
 * @returns {{distance: number, climb: number, steepestSlopeDeg: number}}
 */
export function measurePath(grid, path) {
  let distance = 0;
  let climb = 0;
  let steepestSlopeDeg = 0;
  let previousHeight = null;

  for (let p = 0; p < path.length; p += 1) {
    const [x, z] = path[p];
    const height = heightAt(grid, x, z);
    if (p > 0) {
      const [px, pz] = path[p - 1];
      distance += Math.hypot(x - px, z - pz);
      if (height > previousHeight) climb += height - previousHeight;
    }
    steepestSlopeDeg = Math.max(steepestSlopeDeg, slopeAt(grid, x, z));
    previousHeight = height;
  }

  return { distance, climb, steepestSlopeDeg };
}

/**
 * Weighted cost of a path: each step length times the grid cost multiplier.
 * @param {object} grid
 * @param {Array<[number, number]>} path
 * @returns {number}
 */
export function measureCost(grid, path) {
  let total = 0;
  for (let p = 1; p < path.length; p += 1) {
    const [ax, az] = path[p - 1];
    const [bx, bz] = path[p];
    const length = Math.hypot(bx - ax, bz - az);
    const a = costAt(grid, ax, az);
    const b = costAt(grid, bx, bz);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    total += length * ((a + b) / 2);
  }
  return total;
}

/**
 * Plan a route through an ordered list of waypoints.
 *
 * @param {object} grid grid from `buildCostGrid`
 * @param {Array<{x: number, z: number, name?: string}|[number, number]>} waypointInput
 * @param {{smooth?: boolean, smoothing?: 'clear' | 'cost', start?: {x: number, z: number},
 *   maxIterations?: number, snapRadius?: number, goalRadiusM?: number,
 *   heuristicWeight?: number}} [options]
 *   smoothing: 'clear' (default) takes any shortcut clear of blocked cells; 'cost' only one that costs no more on the
 *   grid ({@link smoothPathByCost}), for grids whose cost carries more than distance (the route profiles, #245).
 * @returns {{
 *   ok: boolean, path: Array<[number, number]>, waypoints: Array<{x: number, z: number, name?: string}>,
 *   distance: number, climb: number, steepestSlopeDeg: number, cost: number,
 *   segments: number, smoothed: boolean, reason?: string, failedSegment?: number
 * }}
 */
export function planRoute(grid, waypointInput, options = {}) {
  const waypoints = waypointInput.map(normaliseWaypoint);
  const start = options.start ? normaliseWaypoint(options.start) : null;
  const routeWaypoints = start ? [start, ...waypoints] : waypoints;
  if (routeWaypoints.length < 2) {
    throw new Error('a route needs at least two waypoints');
  }

  const searchOptions = {
    maxIterations: options.maxIterations ?? grid.n * grid.n,
    snapRadius: options.snapRadius ?? 16,
    goalRadiusM: options.goalRadiusM ?? DEFAULT_GOAL_RADIUS_M,
    heuristicWeight: options.heuristicWeight ?? 1,
  };
  const state = createSearchState(grid);
  const rawSegments = [];
  const waypointSnaps = [];
  let from = routeWaypoints[0];

  for (let w = 0; w < routeWaypoints.length - 1; w += 1) {
    const to = routeWaypoints[w + 1];
    // A free waypoint is reached exactly; a waypoint on an outcrop is reached
    // at the walkable edge within `goalRadiusM`.
    const segmentOptions = {
      ...searchOptions,
      goalRadiusM: isBlockedAt(grid, to.x, to.z) ? searchOptions.goalRadiusM : 1,
    };
    const search = searchSegment(grid, from, to, state, segmentOptions);
    if (!search) {
      return {
        ok: false,
        path: [],
        waypoints,
        distance: 0,
        climb: 0,
        steepestSlopeDeg: 0,
        cost: 0,
        segments: 0,
        smoothed: false,
        waypointSnaps,
        reason: `no path between waypoint ${w} and ${w + 1}`,
        failedSegment: w,
      };
    }

    const segment = search.nodes.map(({ i, j }) => {
      const world = cellToWorld(grid, i, j);
      return [world.x, world.z];
    });
    // Keep the exact waypoint coordinates at each end when they are walkable.
    if (!isBlockedAt(grid, from.x, from.z)) {
      segment[0] = [from.x, from.z];
    }
    if (!isBlockedAt(grid, to.x, to.z)) {
      segment[segment.length - 1] = [to.x, to.z];
    }

    waypointSnaps.push(search.snappedM);
    rawSegments.push(segment);
    const end = segment[segment.length - 1];
    from = { x: end[0], z: end[1] };
  }

  const smoothed = options.smooth !== false;
  const smooth = options.smoothing === 'cost' ? (s) => smoothPathByCost(grid, s) : (s) => smoothPath(grid, s);
  const finalPath = [];
  for (const segment of rawSegments) {
    const smoothedSegment = smoothed ? smooth(segment) : segment;
    if (finalPath.length > 0) smoothedSegment.shift();
    finalPath.push(...smoothedSegment);
  }
  // Measure exactly the points that are returned: rounding 1 mm after measuring
  // made `distance` disagree with the path by about a millimetre (#128).
  const roundedPath = finalPath.map(([x, z]) => [
    Math.round(x * 1000) / 1000,
    Math.round(z * 1000) / 1000,
  ]);
  const metrics = measurePath(grid, roundedPath);
  const weightedCost = measureCost(grid, roundedPath);

  return {
    ok: true,
    path: roundedPath,
    waypoints,
    distance: metrics.distance,
    climb: metrics.climb,
    steepestSlopeDeg: metrics.steepestSlopeDeg,
    cost: weightedCost,
    segments: routeWaypoints.length - 1,
    smoothed,
    waypointSnaps,
  };
}

/**
 * Convenience wrapper for a single pair of positions.
 * @param {object} grid
 * @param {{x: number, z: number}} from
 * @param {{x: number, z: number}} to
 * @param {object} [options]
 */
export function planLeg(grid, from, to, options = {}) {
  return planRoute(grid, [from, to], { ...options, start: undefined });
}
