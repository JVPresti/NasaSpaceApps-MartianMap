/**
 * Where a sampling task can go (#352): a point the crew clicks on the mission table map, checked against the planner's
 * own grid before it becomes a task place, and the rock cover around a place for a rock task.
 *
 * - A click on ground over the 20 degree limit moves to walkable ground within SNAP_M, else it is refused ('steep').
 * - A click the planner cannot reach from the airlock is refused ('unreachable'): reachableFrom is the planner's reach,
 *   the cells its A* search can join to the start's cell with the same moves (src/sim/routePlanner.js).
 * - A click close to a known stop or to a point the list already has takes that place, so two tasks share it.
 * - rockCover reads the density grid the Rocks layer paints and the planner prices (costGrid.rockAbundanceAt), a
 *   brightness proxy for rock cover, not a count of rocks (#311).
 *
 * Plain JavaScript with no React and no three.js: the table calls it on the main thread with the shared cost grid
 * (dataFiles.loadCostGrid), and tests call it with the real terrain.
 */

import { nearestCell, rockAbundanceAt } from './costGrid.js';
import { nearestFreeCell } from './routePlanner.js';

/** A click on ground over 20 degrees moves to walkable ground this close (to the centre of the cell), else it is refused. Metres. */
export const SNAP_M = 4;
/** A click this close to a known stop or to a point of the list takes that place. Metres. */
export const NEAR_PLACE_M = 8;
/**
 * SIM, our threshold: a mean rock abundance under this around a place is "little rock cover", where a loose rock within
 * reach is unlikely. About the lowest fifth of the tile (abundance runs from 0.08, bare, to 1, rocky).
 */
export const ROCK_COVER_LOW = 0.2;
/** How far inside the tile edge a click must be. Metres. */
const EDGE_M = 2;
/** The planner's snap radius for the start of a route, in cells (planRoute snapRadius). */
const START_SNAP_CELLS = 16;

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const reachCache = new WeakMap();   // grid -> Map(start key -> Uint8Array)

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const centi = (value) => Math.round(value * 100) / 100;

/**
 * The cells the planner can reach from a start: joined to the start's cell (nearestFreeCell within 16 cells, as
 * planRoute snaps a start) by its moves, 8 neighbours and no diagonal between two blocked orthogonal cells. A breadth-
 * first search on the base grid (`baseBlocked`), so event zones on a clone never change it; every route profile's grid
 * shares the base grid's closed cells, so this is the reach of every profile. Cached per grid and start.
 * @param {{ n: number, width: number, depth: number, blocked: Uint8Array, baseBlocked?: Uint8Array }} grid
 * @param {{ x: number, z: number }} start the airlock (route.waypoints[0])
 * @returns {Uint8Array} n * n, 1 where reachable
 */
export function reachableFrom(grid, start) {
  const key = `${Math.round(start.x * 100)}:${Math.round(start.z * 100)}`;
  let byStart = reachCache.get(grid);
  if (!byStart) {
    byStart = new Map();
    reachCache.set(grid, byStart);
  }
  const cached = byStart.get(key);
  if (cached) return cached;

  const { n } = grid;
  const blocked = grid.baseBlocked ?? grid.blocked;
  const reach = new Uint8Array(n * n);
  const cell = nearestCell(grid, start.x, start.z);
  const free = nearestFreeCell({ n, blocked }, cell.i, cell.j, START_SNAP_CELLS);
  if (free) {
    const queue = new Int32Array(n * n);
    let head = 0;
    let tail = 0;
    const first = free.j * n + free.i;
    reach[first] = 1;
    queue[tail++] = first;
    while (head < tail) {
      const current = queue[head++];
      const i = current % n;
      const j = (current - i) / n;
      for (const [di, dj] of NEIGHBOURS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const next = nj * n + ni;
        if (reach[next] || blocked[next] === 1) continue;
        if (di !== 0 && dj !== 0 && (blocked[j * n + ni] === 1 || blocked[nj * n + i] === 1)) continue;
        reach[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  byStart.set(key, reach);
  return reach;
}

/** Slope of the node nearest a position, degrees; null when the grid has no slopes. */
function slopeOf(grid, x, z) {
  if (!grid.slopes) return null;
  const { i, j } = nearestCell(grid, x, z);
  const slope = grid.slopes[j * grid.n + i];
  return finite(slope) ? Math.round(slope * 10) / 10 : null;
}

/**
 * Check a click on the table map as the place of a task.
 *
 * In order: a click outside the tile less 2 m is 'off-map'; a click within NEAR_PLACE_M of a known stop or a point of
 * the list takes that place (the nearest); a click on blocked ground moves to the nearest walkable cell within SNAP_M,
 * else 'steep'; a point the airlock cannot reach is 'unreachable'. A new point has no id: the caller gives it
 * nextPointId (src/sim/sampleTasks.js).
 * @param {object} grid the base cost grid (costGrid.buildCostGrid)
 * @param {{ x: number, z: number }} point the click, metres
 * @param {{ start: { x: number, z: number }, stops?: Array<{ id: string, x: number, z: number }>,
 *   points?: Array<{ id: string, x: number, z: number }> }} context start: the airlock; stops: the known stops
 *   (stops.routeStopCandidates); points: the clicked points the task list already has
 * @returns {{ ok: true, place: { type: 'stop', stopId: string } | { type: 'point', id?: string, x: number, z: number },
 *   snappedM: number, slopeDeg: number | null }
 *   | { ok: false, reason: 'off-map' | 'steep' | 'unreachable', slopeDeg: number | null }}
 *   snappedM: how far the place is from the click
 */
export function checkTaskPoint(grid, point, { start, stops = [], points = [] } = {}) {
  const { x, z } = point ?? {};
  if (!finite(x) || !finite(z) || Math.abs(x) > grid.width / 2 - EDGE_M || Math.abs(z) > grid.depth / 2 - EDGE_M) {
    return { ok: false, reason: 'off-map', slopeDeg: null };
  }

  let near = null;
  const consider = (place, at) => {
    if (!finite(at?.x) || !finite(at?.z)) return;
    const distance = Math.hypot(at.x - x, at.z - z);
    if (distance <= NEAR_PLACE_M && (!near || distance < near.snappedM)) near = { place, at, snappedM: distance };
  };
  for (const stop of stops) consider({ type: 'stop', stopId: stop.id }, stop);
  for (const p of points) consider({ type: 'point', id: p.id, x: p.x, z: p.z }, p);
  if (near) return { ok: true, place: near.place, snappedM: centi(near.snappedM), slopeDeg: slopeOf(grid, near.at.x, near.at.z) };

  const clicked = slopeOf(grid, x, z);
  const base = { n: grid.n, blocked: grid.baseBlocked ?? grid.blocked };
  let cell = nearestCell(grid, x, z);
  let at = { x, z };
  let snappedM = 0;
  if (base.blocked[cell.j * grid.n + cell.i] === 1) {
    const reachCells = Math.ceil(SNAP_M / Math.min(grid.width / (grid.n - 1), grid.depth / (grid.n - 1)));
    const free = nearestFreeCell(base, cell.i, cell.j, reachCells);
    const centre = free ? { x: (free.i / (grid.n - 1) - 0.5) * grid.width, z: (free.j / (grid.n - 1) - 0.5) * grid.depth } : null;
    const distance = centre ? Math.hypot(centre.x - x, centre.z - z) : Infinity;
    if (distance > SNAP_M) return { ok: false, reason: 'steep', slopeDeg: clicked };
    cell = free;
    at = centre;
    snappedM = distance;
  }
  if (!start || !reachableFrom(grid, start)[cell.j * grid.n + cell.i]) {
    return { ok: false, reason: 'unreachable', slopeDeg: slopeOf(grid, at.x, at.z) };
  }
  return { ok: true, place: { type: 'point', x: centi(at.x), z: centi(at.z) }, snappedM: centi(snappedM), slopeDeg: slopeOf(grid, at.x, at.z) };
}

/**
 * The rock cover around a place: the mean rock abundance (costGrid.rockAbundanceAt, the Rocks layer's grid) over the
 * cells of the density grid whose centres lie within radiusM, at least the cell under the point.
 * @param {{ width: number, depth: number, density: Uint8Array, densityN: number }} grid
 * @param {{ x: number, z: number }} point
 * @param {number} radiusM
 * @returns {{ mean: number, low: boolean }} low: mean under ROCK_COVER_LOW
 */
export function rockCover(grid, point, radiusM) {
  const n = grid.densityN;
  const cellX = grid.width / n;
  const cellZ = grid.depth / n;
  const radius = finite(radiusM) && radiusM > 0 ? radiusM : 0;
  const c0 = Math.max(0, Math.floor((point.x - radius) / cellX + n / 2));
  const c1 = Math.min(n - 1, Math.floor((point.x + radius) / cellX + n / 2));
  const r0 = Math.max(0, Math.floor((point.z - radius) / cellZ + n / 2));
  const r1 = Math.min(n - 1, Math.floor((point.z + radius) / cellZ + n / 2));
  let sum = 0;
  let count = 0;
  for (let r = r0; r <= r1; r += 1) {
    const cz = (r + 0.5) * cellZ - grid.depth / 2;
    for (let c = c0; c <= c1; c += 1) {
      const cx = (c + 0.5) * cellX - grid.width / 2;
      if (Math.hypot(cx - point.x, cz - point.z) > radius) continue;
      sum += rockAbundanceAt(grid, cx, cz);
      count += 1;
    }
  }
  if (count === 0) {
    sum = rockAbundanceAt(grid, point.x, point.z);
    count = 1;
  }
  const mean = sum / count;
  return { mean, low: mean < ROCK_COVER_LOW };
}
