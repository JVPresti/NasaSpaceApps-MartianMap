/**
 * The return zone: every place the crew can walk to from where they stand, do the planned work there, and still walk
 * home inside the budget the crew planned at the mission table.
 *
 * Two Dijkstra passes over the HiRISE height grid of the cost grid (costGrid.buildCostGrid):
 * - from home (the habitat airlock, or the event shelter), over reversed edges: the time, O2 and battery to walk home
 *   from every node, with the walkback pad (suit.reserve.walkback_pad), as the HUD walkback and the plan's walk home;
 * - from the astronaut, over forward edges: the time, O2 and battery to get to every node at the nominal rate, as the
 *   plan's legs (legCosts.routeLegCosts).
 * Each edge is priced with the suit model's walking cost (suitModel.walkCost: constant effort, Minetti on Mars), so a
 * path's cost here is walkCost on that path. Ground over the 20 degree no-go limit (the grid's `blocked`) is closed.
 *
 * A node is inside when going there, the work there (a planned stop's workSec, legCosts.workCost) and the walk home fit
 * the crew's budget (#282, missionNeeds.planFromNeeds `budget`, checked as its checkBudget checks a route):
 *   time:    EVA time so far + time there + work + time home <= the usable time (time available less the risk reserve)
 *   O2:      the suit model's O2 margin at home, (O2 left - O2 there - work O2 - O2 home) / walking rate - 30 min
 *            reserve (suitModel.o2Margin), over the risk's floor (0 min, or 15 min for a cautious crew)
 *   battery: battery left - battery there - work - battery home >= the risk's battery reserve
 * It is on the edge when the tighter of the time and O2 margins is under the caution margin (15 min). Without a plan
 * the time limit is suit.eva_duration_max and the floor is the warning margin, the suit model's own limits.
 *
 * Event modifiers come from the event engine and the re-planner, never from physics made up here:
 * - shelterWithinSec: an event with a warning window (the radiation alert: the time from its start to the peak dose
 *   rate of its timeline) keeps only ground from which the crew reaches the shelter before the window closes.
 * - homeward: an active event sends the crew to a shelter (its `planner` request). Neither event changes walking speed
 *   or cost in the sim, so the zone applies the re-plan's own rule: only ground no farther from home than the crew.
 * - hazards: active hazard areas (store hazards.zones), closed like no-go ground.
 *
 * Plain JavaScript with no React and no three.js: it runs in returnZone.worker.js and in tests.
 * Coordinates: x east, z south, metres from Cheyava Falls; node (0, 0) is the north-west corner.
 */

import { constantEffortSpeed, evaMargin, metabolicPowerW, o2Margin, o2RateGs, walkingO2RateGs } from './suitModel.js';
import { workCost } from './legCosts.js';

/**
 * Zone nodes per cost grid node. 2 gives 3.8 m x 4 m cells. Measured on a Ryzen 7 5700X (docs/qa/return-zone/): 3 to
 * 94 ms in Node (scripts/bench-return-zone.mjs; 83 to 85 ms is the whole tile at full tank and 8 h) and 6 to 77 ms in the
 * browser's worker on the first sortie, against 389 to 405 ms for the whole tile on the grid's own 1.9 m x 2 m spacing.
 * The 20 degree no-go ground keeps its full resolution (zoneGrid closes a coarse cell when any of its fine nodes is
 * closed).
 */
export const DEFAULT_ZONE_STEP = 2;

/** Values of `state`: outside the zone, on its edge (margin under caution), inside. */
export const ZONE_STATE = Object.freeze({ OUTSIDE: 0, EDGE: 1, INSIDE: 2 });

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Gradient range and step of the walking cost tables. Steeper edges are priced at the table's end. */
const TABLE_I_MAX = 1.5;
const TABLE_STEP = 1 / 2000;

const tableCache = new WeakMap();
const zoneGridCache = new WeakMap();

/**
 * Walking cost per metre as a function of gradient, from the suit model: seconds per metre (1 / constant-effort speed)
 * and O2 grams per metre at the nominal metabolic rate. Linear interpolation between 0.0005 steps of gradient, because
 * solving the constant-effort speed (a 40-step bisection) for each of 4.5 million edges would take seconds.
 * @param {object} c constants from suitConstantsFromHazards
 * @returns {{ secPerM: Float64Array, o2PerM: Float64Array, iMax: number, step: number, size: number }}
 */
export function walkingTables(c) {
  const cached = tableCache.get(c);
  if (cached) return cached;
  const size = Math.round((2 * TABLE_I_MAX) / TABLE_STEP) + 1;
  const secPerM = new Float64Array(size), o2PerM = new Float64Array(size);
  for (let k = 0; k < size; k += 1) {
    const i = -TABLE_I_MAX + k * TABLE_STEP;
    const v = constantEffortSpeed(i, c);
    secPerM[k] = 1 / v;
    o2PerM[k] = o2RateGs(metabolicPowerW(v, i, c), c) / v;
  }
  const tables = { secPerM, o2PerM, iMax: TABLE_I_MAX, step: TABLE_STEP, size };
  tableCache.set(c, tables);
  return tables;
}

/**
 * Seconds and grams of O2 (nominal rate, no pad) to walk `run` metres up `rise` metres. Writes into `out`.
 * @param {ReturnType<typeof walkingTables>} tables
 */
export function edgeCost(tables, run, rise, out) {
  const g = Math.max(-tables.iMax, Math.min(tables.iMax, rise / run));
  const f = (g + tables.iMax) / tables.step;
  const k = Math.min(tables.size - 2, Math.floor(f)), t = f - k;
  out.sec = run * (tables.secPerM[k] + (tables.secPerM[k + 1] - tables.secPerM[k]) * t);
  out.o2 = run * (tables.o2PerM[k] + (tables.o2PerM[k + 1] - tables.o2PerM[k]) * t);
  return out;
}

/**
 * The nodes the zone is computed on: every `step`-th node of the cost grid. A coarser node is closed when any node of
 * the block it stands for is closed, so a coarse zone never crosses a thin no-go band the full grid has.
 * @param {{ n: number, width: number, depth: number, heights: Float32Array, blocked: Uint8Array }} grid
 * @param {number} [step] 1 keeps the grid's 1.9 m x 2 m spacing; 2 gives about 4 m
 */
export function zoneGrid(grid, step = 1) {
  let byStep = zoneGridCache.get(grid);
  if (!byStep) { byStep = new Map(); zoneGridCache.set(grid, byStep); }
  if (byStep.has(step)) return byStep.get(step);
  const { n, width, depth } = grid;
  const cols = Math.floor((n - 1) / step) + 1, rows = cols;
  const heights = new Float32Array(cols * rows), blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let q = 0; q < cols; q += 1) {
      const i = q * step, j = r * step;
      heights[r * cols + q] = grid.heights[j * n + i];
      let closed = 0;
      const h = Math.floor(step / 2);
      for (let jj = Math.max(0, j - h); jj <= Math.min(n - 1, j + h) && !closed; jj += 1) {
        for (let ii = Math.max(0, i - h); ii <= Math.min(n - 1, i + h); ii += 1) {
          if (grid.blocked[jj * n + ii]) { closed = 1; break; }
        }
      }
      blocked[r * cols + q] = closed;
    }
  }
  const dx = (width / (n - 1)) * step, dz = (depth / (n - 1)) * step;
  const out = { cols, rows, step, x0: -width / 2, z0: -depth / 2, dx, dz, heights, blocked };
  byStep.set(step, out);
  return out;
}

/** World position of a zone node. */
export function zoneNodeToWorld(zg, q, r) {
  return { x: zg.x0 + q * zg.dx, z: zg.z0 + r * zg.dz };
}

/** Nearest zone node to a world position, clamped to the grid. */
export function zoneNodeAt(zg, x, z) {
  const q = Math.max(0, Math.min(zg.cols - 1, Math.round((x - zg.x0) / zg.dx)));
  const r = Math.max(0, Math.min(zg.rows - 1, Math.round((z - zg.z0) / zg.dz)));
  return r * zg.cols + q;
}

/** The nearest open node to an index within `maxRings` rings, or -1. */
function nearestOpen(zg, index, closed, maxRings = 12) {
  if (!closed[index]) return index;
  const q0 = index % zg.cols, r0 = Math.floor(index / zg.cols);
  for (let ring = 1; ring <= maxRings; ring += 1) {
    let best = -1, bestD = Infinity;
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dq = -ring; dq <= ring; dq += 1) {
        if (Math.max(Math.abs(dq), Math.abs(dr)) !== ring) continue;
        const q = q0 + dq, r = r0 + dr;
        if (q < 0 || r < 0 || q >= zg.cols || r >= zg.rows) continue;
        const k = r * zg.cols + q;
        if (closed[k]) continue;
        const d = (dq * zg.dx) ** 2 + (dr * zg.dz) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Binary min-heap of node indices keyed by a Float64Array, with decrease-key through a position table. */
function createHeap(size, keys) {
  const heap = new Int32Array(size), pos = new Int32Array(size).fill(-1);
  let length = 0;
  const swap = (a, b) => { const x = heap[a], y = heap[b]; heap[a] = y; heap[b] = x; pos[y] = a; pos[x] = b; };
  const up = (k) => { while (k > 0) { const p = (k - 1) >> 1; if (keys[heap[p]] <= keys[heap[k]]) break; swap(k, p); k = p; } };
  const down = (k) => {
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < length && keys[heap[l]] < keys[heap[m]]) m = l;
      if (r < length && keys[heap[r]] < keys[heap[m]]) m = r;
      if (m === k) return;
      swap(k, m); k = m;
    }
  };
  return {
    get length() { return length; },
    push(node) {
      if (pos[node] >= 0) { up(pos[node]); return; }
      heap[length] = node; pos[node] = length; length += 1; up(length - 1);
    },
    pop() {
      const top = heap[0];
      length -= 1;
      pos[top] = -2;
      if (length > 0) { heap[0] = heap[length]; pos[heap[0]] = 0; down(0); }
      return top;
    },
    done: (node) => pos[node] === -2,
  };
}

/**
 * One Dijkstra pass by O2. Under the constant-effort rule the power stays that of flat walking on walkable ground, so
 * O2 grows in step with time and the O2-cheapest path is also the quickest. Nodes past `maxO2` or `maxSec` are left
 * at Infinity: they are outside whatever the other pass says.
 * @param {ReturnType<typeof zoneGrid>} zg
 * @param {number} start node index
 * @param {{ tables: object, closed: Uint8Array, reverse: boolean, o2Factor: number, maxO2: number, maxSec: number }} options
 *   reverse: price the walk from each node to the start (the walk home); o2Factor: 1 + the walkback pad, or 1
 * @returns {{ o2: Float64Array, sec: Float64Array }}
 */
function sweep(zg, start, { tables, closed, reverse, o2Factor, maxO2, maxSec }) {
  const { cols, rows, heights } = zg;
  const size = cols * rows;
  const o2 = new Float64Array(size).fill(Infinity), sec = new Float64Array(size).fill(Infinity);
  if (start < 0) return { o2, sec };
  const runs = NEIGHBOURS.map(([dq, dr]) => Math.hypot(dq * zg.dx, dr * zg.dz));
  const heap = createHeap(size, o2);
  const cost = { sec: 0, o2: 0 };
  o2[start] = 0; sec[start] = 0;
  heap.push(start);
  while (heap.length) {
    const a = heap.pop();
    if (o2[a] > maxO2) break;   // the heap is ordered by O2: every node left costs more
    if (sec[a] > maxSec) continue;
    const qa = a % cols, ra = (a - qa) / cols, ha = heights[a];
    for (let k = 0; k < 8; k += 1) {
      const q = qa + NEIGHBOURS[k][0], r = ra + NEIGHBOURS[k][1];
      if (q < 0 || r < 0 || q >= cols || r >= rows) continue;
      const b = r * cols + q;
      if (closed[b] || heap.done(b)) continue;
      // reverse: the astronaut walks from b to a, so the rise is a's height minus b's
      const rise = reverse ? ha - heights[b] : heights[b] - ha;
      edgeCost(tables, runs[k], rise, cost);
      const next = o2[a] + cost.o2 * o2Factor;
      if (next < o2[b]) { o2[b] = next; sec[b] = sec[a] + cost.sec; heap.push(b); }
    }
  }
  return { o2, sec };
}

/** Close the nodes inside active hazard areas ({ x, z, radiusM, active }), on a copy of the grid's closed mask. */
function closedMask(zg, hazards) {
  const live = (hazards ?? []).filter((h) => h && h.active !== false && Number.isFinite(h.x) && Number.isFinite(h.z) && h.radiusM > 0);
  if (!live.length) return zg.blocked;
  const closed = zg.blocked.slice();
  for (const h of live) {
    const q0 = Math.max(0, Math.floor((h.x - h.radiusM - zg.x0) / zg.dx)), q1 = Math.min(zg.cols - 1, Math.ceil((h.x + h.radiusM - zg.x0) / zg.dx));
    const r0 = Math.max(0, Math.floor((h.z - h.radiusM - zg.z0) / zg.dz)), r1 = Math.min(zg.rows - 1, Math.ceil((h.z + h.radiusM - zg.z0) / zg.dz));
    for (let r = r0; r <= r1; r += 1) {
      for (let q = q0; q <= q1; q += 1) {
        if (Math.hypot(zg.x0 + q * zg.dx - h.x, zg.z0 + r * zg.dz - h.z) <= h.radiusM) closed[r * zg.cols + q] = 1;
      }
    }
  }
  return closed;
}

/**
 * Battery (Wh) of a walk from its time and O2. The suit model's battery draw (batteryDrawW) is a fixed part plus a part
 * that follows metabolic power, and O2 is power x time / energy per litre x density, so the sum over a path's steps is
 * this one line: walkCost's battery for the same path. O2 with the walkback pad gives the padded battery, as walkCost.
 */
export function batteryWhOf(sec, o2G, c) {
  const joules = (o2G * c.jPerL) / c.rhoO2;
  return (c.batteryAvgW * ((1 - c.batteryEffortShare) * sec + (c.batteryEffortShare * joules) / c.designAvgW)) / 3600;
}

/** Work cost at the stops: per node within `radiusM` of a stop, its workCost (time, O2, battery). */
function stopWork(zg, stops, radiusM, c) {
  const work = new Map();
  for (const stop of stops ?? []) {
    if (!stop || !Number.isFinite(stop.x) || !Number.isFinite(stop.z) || !(stop.workSec > 0)) continue;
    const w = workCost(stop.workSec, c);
    const q0 = Math.max(0, Math.floor((stop.x - radiusM - zg.x0) / zg.dx)), q1 = Math.min(zg.cols - 1, Math.ceil((stop.x + radiusM - zg.x0) / zg.dx));
    const r0 = Math.max(0, Math.floor((stop.z - radiusM - zg.z0) / zg.dz)), r1 = Math.min(zg.rows - 1, Math.ceil((stop.z + radiusM - zg.z0) / zg.dz));
    for (let r = r0; r <= r1; r += 1) {
      for (let q = q0; q <= q1; q += 1) {
        if (Math.hypot(zg.x0 + q * zg.dx - stop.x, zg.z0 + r * zg.dz - stop.z) > radiusM) continue;
        const k = r * zg.cols + q, prev = work.get(k);
        if (!prev || prev.timeSec < w.timeSec) work.set(k, w);
      }
    }
  }
  return work;
}

const NO_WORK = Object.freeze({ timeSec: 0, o2G: 0, batteryWh: 0 });

/**
 * @typedef {object} ReturnZone
 * @property {number} cols nodes west to east
 * @property {number} rows nodes north to south
 * @property {number} x0 x of node (0, 0), the north-west corner, metres
 * @property {number} z0 z of node (0, 0), metres
 * @property {number} dx node spacing east, metres
 * @property {number} dz node spacing south, metres
 * @property {number} step cost grid nodes per zone node (1: the grid's own spacing)
 * @property {Uint8Array} state ZONE_STATE per node, row-major from the north-west corner
 * @property {Float32Array} marginSec the tighter of the O2 margin and the time to spare at each node, seconds; -Infinity
 *   where it cannot be reached
 * @property {Float32Array} toSec time to get to each node from the astronaut, seconds
 * @property {Float32Array} homeSec time to walk home from each node, seconds
 * @property {Float32Array} toO2G O2 to get to each node at the nominal rate, grams; Infinity past the O2 or time left
 * @property {Float32Array} homeO2G O2 to walk home from each node with the walkback pad, grams; Infinity likewise
 * @property {{ x: number, z: number }} home
 * @property {{ x: number, z: number }} from
 * @property {{ o2G: number, o2UsableG: number, batteryWh: number | null, batteryReserveWh: number, rateGs: number,
 *   reserveSec: number, evaLimitSec: number, elapsedSec: number, marginFloorSec: number, marginFloor: 'caution' | 'warning',
 *   cautionSec: number, warningSec: number, homeward: boolean, shelterWithinSec: number | null, planned: boolean }} inputs
 *   what the zone was computed with; planned: a crew plan set the limits
 * @property {{ insideCells: number, edgeCells: number, insideM2: number, edgeM2: number, reachM: number,
 *   limit: 'o2' | 'eva' | 'battery' | 'window' | 'event' | null, ms: number, bounds: { minX: number, maxX: number, minZ: number, maxZ: number } | null }} stats
 *   reachM: the farthest inside node from home, straight line; limit: what shuts out the most ground ('eva' is the
 *   time limit, 'window' an event's shelter window, 'event' the re-plan's way home);
 *   bounds: the box around every node inside or on the edge, null when there is none
 */

/**
 * Compute the return zone.
 * @param {{
 *   grid: { n: number, width: number, depth: number, heights: Float32Array, blocked: Uint8Array },
 *   home: { x: number, z: number },
 *   from?: { x: number, z: number } | null,
 *   suit: { o2G: number, batteryWh?: number, elapsedSec?: number },
 *   constants: object,
 *   evaLimitSec?: number,
 *   plan?: { marginFloor?: 'caution' | 'warning', marginFloorSec?: number, batteryReserveWh?: number,
 *     stops?: Array<{ x: number, z: number, workSec: number }>, stopRadiusM?: number },
 *   modifiers?: { homeward?: boolean, shelterWithinSec?: number, hazards?: Array<{ x: number, z: number, radiusM: number, active?: boolean }> },
 *   step?: number,
 *   now?: () => number,
 * }} input
 *   grid: buildCostGrid's grid (or any object with those fields); home: the habitat airlock or the event shelter;
 *   from: the astronaut, home when left out (the plan's zone before the EVA); suit.o2G: O2 left, grams; elapsedSec:
 *   EVA time so far; constants: suitConstantsFromHazards; evaLimitSec: the EVA time limit, suit.eva_duration_max by
 *   default, never more (pass the plan's budget.usableSec); plan: the rest of the plan's budget (budget.marginFloor,
 *   marginFloorSec, batteryReserveWh) and the stops still to work (route.waypoints with workSec), each counted within
 *   stopRadiusM (5 m, the waypoint arrival radius); step: zone node spacing in cost grid nodes
 * @returns {ReturnZone}
 */
export function computeReturnZone({ grid, home, from = null, suit, constants: c, evaLimitSec, plan = {}, modifiers = {}, step = DEFAULT_ZONE_STEP, now = () => Date.now() }) {
  const started = now();
  if (!home || !Number.isFinite(home.x) || !Number.isFinite(home.z)) throw new Error('return zone needs a finite home');
  if (!suit || !Number.isFinite(suit.o2G)) throw new Error('return zone needs suit.o2G');
  const at = from && Number.isFinite(from.x) && Number.isFinite(from.z) ? from : home;
  const zg = zoneGrid(grid, step);
  const tables = walkingTables(c);
  const closed = closedMask(zg, modifiers.hazards);
  const size = zg.cols * zg.rows;

  const rate = walkingO2RateGs(c);
  const elapsed = Number.isFinite(suit.elapsedSec) ? Math.max(0, suit.elapsedSec) : 0;
  const limit = Math.min(c.evaMaxSec, Number.isFinite(evaLimitSec) ? evaLimitSec : c.evaMaxSec);
  const floor = plan.marginFloor === 'caution' ? 'caution' : 'warning';
  const floorSec = Number.isFinite(plan.marginFloorSec) ? plan.marginFloorSec : floor === 'caution' ? c.cautionSec : c.warningSec;
  const batteryWh = Number.isFinite(suit.batteryWh) ? suit.batteryWh : null;
  const batteryReserveWh = Number.isFinite(plan.batteryReserveWh) ? plan.batteryReserveWh : 0;
  const window = Number.isFinite(modifiers.shelterWithinSec) ? Math.max(0, modifiers.shelterWithinSec) : null;
  const work = stopWork(zg, plan.stops, Number.isFinite(plan.stopRadiusM) ? plan.stopRadiusM : 5, c);
  // Nothing past these can be inside: the whole O2 above the reserve, the whole time left (or the shelter window).
  const maxO2 = Math.max(0, suit.o2G - c.reserveSec * rate);
  const maxSec = Math.max(0, Math.min(limit - elapsed, window ?? Infinity));

  const homeNode = nearestOpen(zg, zoneNodeAt(zg, home.x, home.z), closed);
  const fromNode = nearestOpen(zg, zoneNodeAt(zg, at.x, at.z), closed);
  const back = sweep(zg, homeNode, { tables, closed, reverse: true, o2Factor: 1 + c.walkbackPad, maxO2, maxSec });
  const to = sweep(zg, fromNode, { tables, closed, reverse: false, o2Factor: 1, maxO2, maxSec });

  const homeward = modifiers.homeward === true && fromNode >= 0;
  // Homeward: ground no farther from home than the astronaut, by the walk home's O2 (half a node of slack).
  const homewardO2 = homeward ? back.o2[fromNode] + 0.5 * Math.min(zg.dx, zg.dz) * tables.o2PerM[Math.round(TABLE_I_MAX / TABLE_STEP)] * (1 + c.walkbackPad) : Infinity;

  const state = new Uint8Array(size), marginSec = new Float32Array(size).fill(-Infinity);
  const toSec = new Float32Array(size), homeSec = new Float32Array(size), toO2G = new Float32Array(size), homeO2G = new Float32Array(size);
  const shut = { o2: 0, eva: 0, battery: 0, window: 0, event: 0 };
  let insideCells = 0, edgeCells = 0, reach2 = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < size; k += 1) {
    toSec[k] = to.sec[k]; homeSec[k] = back.sec[k]; toO2G[k] = to.o2[k]; homeO2G[k] = back.o2[k];
    if (!(to.o2[k] < Infinity) || !(back.o2[k] < Infinity)) continue;
    const w = work.get(k) ?? NO_WORK;
    // checkBudget's three checks, in the suit model's terms
    const o2m = o2Margin(suit.o2G - to.o2[k] - w.o2G, back.o2[k], rate, c);
    const spare = evaMargin(elapsed + to.sec[k] + w.timeSec, back.sec[k], c, limit);
    const m = Math.min(o2m, spare);
    marginSec[k] = m;
    if (spare < 0) { shut.eva += 1; continue; }
    if (floor === 'caution' ? !(o2m >= floorSec) : !(o2m > floorSec)) { shut.o2 += 1; continue; }
    if (batteryWh !== null && batteryWh - batteryWhOf(to.sec[k], to.o2[k], c) - w.batteryWh - batteryWhOf(back.sec[k], back.o2[k], c) < batteryReserveWh) { shut.battery += 1; continue; }
    if (window !== null && to.sec[k] + back.sec[k] > window) { shut.window += 1; continue; }
    if (back.o2[k] > homewardO2) { shut.event += 1; continue; }
    if (m < c.cautionSec) { state[k] = ZONE_STATE.EDGE; edgeCells += 1; } else { state[k] = ZONE_STATE.INSIDE; insideCells += 1; }
    const q = k % zg.cols, r = (k - q) / zg.cols;
    const x = zg.x0 + q * zg.dx, z = zg.z0 + r * zg.dz, d2 = (x - home.x) ** 2 + (z - home.z) ** 2;
    if (d2 > reach2) reach2 = d2;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cellM2 = zg.dx * zg.dz;
  const empty = insideCells + edgeCells === 0;
  // the event rules first: they are why the zone changed; else the budget limit that shuts out the most ground
  let bound = window !== null && (shut.window > 0 || empty) ? 'window'
    : homeward && shut.event > 0 ? 'event'
      : ['eva', 'o2', 'battery'].reduce((best, id) => (shut[id] > (best ? shut[best] : 0) ? id : best), null);
  // An empty zone with nothing counted: the sweeps stopped at once because the time or the O2 over the reserve is spent
  // (maxSec or maxO2 at 0), so no node reached the checks. Name the budget that ran out, never "whole tile in reach".
  if (bound === null && empty) {
    if (batteryWh !== null && batteryWh <= batteryReserveWh) bound = 'battery';
    else bound = limit - elapsed <= (suit.o2G / rate - c.reserveSec - floorSec) ? 'eva' : 'o2';
  }
  return {
    cols: zg.cols, rows: zg.rows, x0: zg.x0, z0: zg.z0, dx: zg.dx, dz: zg.dz, step,
    state, marginSec, toSec, homeSec, toO2G, homeO2G,
    home: { x: home.x, z: home.z }, from: { x: at.x, z: at.z },
    inputs: {
      o2G: suit.o2G, o2UsableG: c.o2UsableG, batteryWh, batteryReserveWh, rateGs: rate, reserveSec: c.reserveSec, evaLimitSec: limit,
      elapsedSec: elapsed, marginFloorSec: floorSec, marginFloor: floor, cautionSec: c.cautionSec, warningSec: c.warningSec, homeward,
      shelterWithinSec: window, planned: Number.isFinite(evaLimitSec) && evaLimitSec < c.evaMaxSec,
    },
    stats: {
      insideCells, edgeCells, insideM2: insideCells * cellM2, edgeM2: edgeCells * cellM2, reachM: Math.sqrt(reach2),
      limit: bound, ms: now() - started,
      bounds: empty ? null : { minX, maxX, minZ, maxZ },
    },
  };
}

/**
 * The zone's state at a world position (nearest node); OUTSIDE off the grid.
 * @param {ReturnZone} zone
 */
export function zoneStateAt(zone, x, z) {
  const q = Math.round((x - zone.x0) / zone.dx), r = Math.round((z - zone.z0) / zone.dz);
  if (q < 0 || r < 0 || q >= zone.cols || r >= zone.rows) return ZONE_STATE.OUTSIDE;
  return zone.state[r * zone.cols + q];
}

/** The zone's margin at a world position (nearest node), seconds; -Infinity off the grid or where it cannot be reached. */
export function zoneMarginAt(zone, x, z) {
  const q = Math.round((x - zone.x0) / zone.dx), r = Math.round((z - zone.z0) / zone.dz);
  if (q < 0 || r < 0 || q >= zone.cols || r >= zone.rows) return -Infinity;
  return zone.marginSec[r * zone.cols + q];
}

/**
 * Paint the zone into an RGBA array of cols x rows pixels, one per node, for a canvas to scale up with smoothing.
 * Colours are [r, g, b, a] in 0 to 255. `rim`, when given, paints the zone's outer boundary: the nodes inside or on the
 * edge that touch a node the margin or an event shuts out. No-go holes and ground no path reaches get no rim, so the
 * line follows the limit the zone is about.
 * @param {ReturnZone} zone
 * @param {{ outside: number[], edge: number[], inside: number[], rim?: number[] }} colours
 * @param {Uint8ClampedArray} [out]
 */
export function zoneRgba(zone, colours, out = new Uint8ClampedArray(zone.cols * zone.rows * 4)) {
  const by = [colours.outside, colours.edge, colours.inside];
  const { cols, rows, state, marginSec } = zone;
  const shut = (k) => state[k] === ZONE_STATE.OUTSIDE && marginSec && marginSec[k] > -Infinity;
  for (let k = 0; k < state.length; k += 1) {
    let c = by[state[k]];
    if (colours.rim && state[k] !== ZONE_STATE.OUTSIDE) {
      const q = k % cols, r = (k - q) / cols;
      if ((q > 0 && shut(k - 1)) || (q < cols - 1 && shut(k + 1)) || (r > 0 && shut(k - cols)) || (r < rows - 1 && shut(k + cols))) c = colours.rim;
    }
    const o = k * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
  }
  return out;
}

/**
 * An event's warning window, seconds from its start: the first timeline entry at the peak dose rate
 * (environment.doseRateUgyH). Only the radiation alert has one; null for any other event. The timeline is the one the
 * mission runs (missions.missionEventDefinitions scales it: 210 s in the full EVA, 17.5 s in the first sortie, SIM).
 * @param {{ timeline?: Array<{ atSec: number, set?: Record<string, number> }> }} definition
 * @returns {number | null}
 */
export function shelterWindowSec(definition) {
  const doses = (definition?.timeline ?? []).filter((e) => Number.isFinite(e?.set?.['environment.doseRateUgyH']));
  if (doses.length < 2) return null;
  const peak = Math.max(...doses.map((e) => e.set['environment.doseRateUgyH']));
  if (!(peak > doses[0].set['environment.doseRateUgyH'])) return null;
  return doses.find((e) => e.set['environment.doseRateUgyH'] === peak).atSec;
}

/**
 * The event modifiers the event engine's state gives: `homeward` while an active alert belongs to an event whose
 * definition has a planner request (it sends the crew to a shelter); `shelterWithinSec`, the time left in the warning
 * window of an active event that has one (shelterWindowSec), never under 0; and the active hazard areas.
 * @param {{ alerts?: Record<string, { eventId?: string, active?: boolean, startedAtSec?: number } | null>,
 *   hazards?: { zones?: Array<object> }, mission?: { elapsedSec?: number } }} state the mission store's state
 * @param {Array<{ id: string, planner?: object, timeline?: Array<object> }>} definitions the mission's event definitions
 * @returns {{ homeward: boolean, shelterWithinSec: number | null, windowSec: number | null, hazards: Array<object>, events: string[] }}
 *   windowSec: the whole window; events: the ids that set homeward or the window
 */
export function zoneModifiers(state, definitions) {
  const byId = new Map(definitions.filter(Boolean).map((d) => [d.id, d]));
  const active = Object.values(state?.alerts ?? {}).filter((a) => a && a.active !== false && byId.get(a.eventId ?? a.id)?.planner);
  const elapsed = Number.isFinite(state?.mission?.elapsedSec) ? state.mission.elapsedSec : 0;
  let shelterWithinSec = null, windowSec = null;
  for (const a of active) {
    const w = shelterWindowSec(byId.get(a.eventId ?? a.id));
    if (w === null) continue;
    const left = Math.max(0, w - (Number.isFinite(a.startedAtSec) ? Math.max(0, elapsed - a.startedAtSec) : 0));
    if (shelterWithinSec === null || left < shelterWithinSec) { shelterWithinSec = left; windowSec = w; }
  }
  const events = [...new Set(active.map((a) => a.eventId ?? a.id))].sort();
  return { homeward: events.length > 0, shelterWithinSec, windowSec, hazards: state?.hazards?.zones ?? [], events };
}
