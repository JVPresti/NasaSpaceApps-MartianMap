/**
 * The return zone: every place the astronaut can walk to from where they stand and still walk home with the 30 min
 * reserve untouched.
 *
 * Two Dijkstra passes over the HiRISE height grid of the cost grid (costGrid.buildCostGrid):
 * - from home (the habitat airlock, or the event shelter), over reversed edges: the time and O2 to walk home from every
 *   node, with the walkback pad (suit.reserve.walkback_pad), as the HUD walkback;
 * - from the astronaut, over forward edges: the time and O2 to get to every node, at the nominal rate, as the plan's legs.
 * Each edge is priced with the suit model's walking cost (suitModel.walkCost: constant effort, Minetti on Mars), so a
 * path's cost here is walkCost on that path. Ground over the 20 degree no-go limit (the grid's `blocked`) is closed.
 *
 * A node is inside when its margin, the suit model's margin at that node (suitModel.o2Margin and evaMargin, the formula
 * suitReadout uses), stays over the warning margin (0 min):
 *   O2 margin  = (O2 left - O2 to get there) / rate - O2 home / rate - 30 min reserve
 *   EVA margin = EVA limit - (EVA time so far + time to get there) - time home
 * It is on the edge when that margin is under the caution margin (15 min). The rate is the flat walking rate, as the
 * plan's margin (route.totals.marginSec, legCosts.js) uses, so the zone does not breathe in and out when the astronaut
 * stops. The EVA limit is suit.eva_duration_max, or the shorter time the crew planned when the caller passes it.
 *
 * Event modifiers come from the event engine, never from rules made up here:
 * - homeward: an active event asks the crew to go to a shelter (its `planner` request, src/sim/events/*.json). The
 *   zone then keeps only ground no farther from home, in walking time, than the astronaut is now.
 * - hazards: active hazard areas (store hazards.zones), closed like no-go ground.
 *
 * Plain JavaScript with no React and no three.js: it runs in returnZone.worker.js and in tests.
 * Coordinates: x east, z south, metres from Cheyava Falls; node (0, 0) is the north-west corner.
 */

import { constantEffortSpeed, evaMargin, marginStatus, metabolicPowerW, o2Margin, o2RateGs, walkingO2RateGs } from './suitModel.js';

/**
 * Zone nodes per cost grid node. 2 gives 3.8 m x 4 m cells: the full-tank zone (the whole tile) takes about 130 ms on a
 * Ryzen 7 5700X, against about 700 ms on the grid's own 1.9 m x 2 m spacing. The 20 degree no-go ground keeps its full
 * resolution (zoneGrid closes a coarse cell when any of its fine nodes is closed).
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
 * @typedef {object} ReturnZone
 * @property {number} cols nodes west to east
 * @property {number} rows nodes north to south
 * @property {number} x0 x of node (0, 0), the north-west corner, metres
 * @property {number} z0 z of node (0, 0), metres
 * @property {number} dx node spacing east, metres
 * @property {number} dz node spacing south, metres
 * @property {number} step cost grid nodes per zone node (1: the grid's own spacing)
 * @property {Uint8Array} state ZONE_STATE per node, row-major from the north-west corner
 * @property {Float32Array} marginSec the suit model's margin at each node, seconds; -Infinity where it cannot be reached
 * @property {Float32Array} toSec time to get to each node from the astronaut, seconds
 * @property {Float32Array} homeSec time to walk home from each node, seconds
 * @property {Float32Array} toO2G O2 to get to each node at the nominal rate, grams; Infinity past the O2 or time left
 * @property {Float32Array} homeO2G O2 to walk home from each node with the walkback pad, grams; Infinity likewise
 * @property {{ x: number, z: number }} home
 * @property {{ x: number, z: number }} from
 * @property {{ o2G: number, o2UsableG: number, rateGs: number, reserveSec: number, evaLimitSec: number, elapsedSec: number,
 *   cautionSec: number, warningSec: number, homeward: boolean }} inputs what the zone was computed with
 * @property {{ insideCells: number, edgeCells: number, insideM2: number, edgeM2: number, reachM: number,
 *   limit: 'o2' | 'eva' | 'event' | null, ms: number, bounds: { minX: number, maxX: number, minZ: number, maxZ: number } | null }} stats
 *   reachM: the farthest inside node from home, straight line; limit: what closes the zone where it is tightest;
 *   bounds: the box around every node inside or on the edge, null when there is none
 */

/**
 * Compute the return zone.
 * @param {{
 *   grid: { n: number, width: number, depth: number, heights: Float32Array, blocked: Uint8Array },
 *   home: { x: number, z: number },
 *   from?: { x: number, z: number } | null,
 *   suit: { o2G: number, elapsedSec?: number },
 *   constants: object,
 *   evaLimitSec?: number,
 *   modifiers?: { homeward?: boolean, hazards?: Array<{ x: number, z: number, radiusM: number, active?: boolean }> },
 *   step?: number,
 *   now?: () => number,
 * }} input
 *   grid: buildCostGrid's grid (or any object with those fields); home: the habitat airlock or the event shelter;
 *   from: the astronaut, home when left out (the plan's zone before the EVA); suit.o2G: O2 left, grams; elapsedSec:
 *   EVA time so far; constants: suitConstantsFromHazards; evaLimitSec: the EVA time limit, suit.eva_duration_max by
 *   default, never more; step: zone node spacing in cost grid nodes
 * @returns {ReturnZone}
 */
export function computeReturnZone({ grid, home, from = null, suit, constants: c, evaLimitSec, modifiers = {}, step = DEFAULT_ZONE_STEP, now = () => Date.now() }) {
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
  // Nothing past these can be inside: the whole O2 above the reserve, the whole time left.
  const maxO2 = Math.max(0, suit.o2G - c.reserveSec * rate);
  const maxSec = Math.max(0, limit - elapsed);

  const homeNode = nearestOpen(zg, zoneNodeAt(zg, home.x, home.z), closed);
  const fromNode = nearestOpen(zg, zoneNodeAt(zg, at.x, at.z), closed);
  const back = sweep(zg, homeNode, { tables, closed, reverse: true, o2Factor: 1 + c.walkbackPad, maxO2, maxSec });
  const to = sweep(zg, fromNode, { tables, closed, reverse: false, o2Factor: 1, maxO2, maxSec });

  const homeward = modifiers.homeward === true && fromNode >= 0;
  // Homeward: ground no farther from home than the astronaut, by the walk home's O2 (half a node of slack).
  const homewardO2 = homeward ? back.o2[fromNode] + 0.5 * Math.min(zg.dx, zg.dz) * tables.o2PerM[Math.round(TABLE_I_MAX / TABLE_STEP)] * (1 + c.walkbackPad) : Infinity;

  const state = new Uint8Array(size), marginSec = new Float32Array(size).fill(-Infinity);
  const toSec = new Float32Array(size), homeSec = new Float32Array(size), toO2G = new Float32Array(size), homeO2G = new Float32Array(size);
  let insideCells = 0, edgeCells = 0, reach2 = 0, o2Binds = 0, evaBinds = 0, eventCut = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < size; k += 1) {
    toSec[k] = to.sec[k]; homeSec[k] = back.sec[k]; toO2G[k] = to.o2[k]; homeO2G[k] = back.o2[k];
    if (!(to.o2[k] < Infinity) || !(back.o2[k] < Infinity)) continue;
    const o2m = o2Margin(suit.o2G - to.o2[k], back.o2[k], rate, c);
    const evam = evaMargin(elapsed + to.sec[k], back.sec[k], c, limit);
    const m = Math.min(o2m, evam);
    marginSec[k] = m;
    const status = marginStatus(m, c);
    if (status === 'warning') { if (o2m <= evam) o2Binds += 1; else evaBinds += 1; continue; }
    if (back.o2[k] > homewardO2) { eventCut += 1; continue; }
    if (status === 'caution') { state[k] = ZONE_STATE.EDGE; edgeCells += 1; } else { state[k] = ZONE_STATE.INSIDE; insideCells += 1; }
    const q = k % zg.cols, r = (k - q) / zg.cols;
    const x = zg.x0 + q * zg.dx, z = zg.z0 + r * zg.dz, d2 = (x - home.x) ** 2 + (z - home.z) ** 2;
    if (d2 > reach2) reach2 = d2;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cellM2 = zg.dx * zg.dz;
  const bound = homeward && eventCut > 0 ? 'event' : o2Binds + evaBinds === 0 ? null : o2Binds >= evaBinds ? 'o2' : 'eva';
  return {
    cols: zg.cols, rows: zg.rows, x0: zg.x0, z0: zg.z0, dx: zg.dx, dz: zg.dz, step,
    state, marginSec, toSec, homeSec, toO2G, homeO2G,
    home: { x: home.x, z: home.z }, from: { x: at.x, z: at.z },
    inputs: { o2G: suit.o2G, o2UsableG: c.o2UsableG, rateGs: rate, reserveSec: c.reserveSec, evaLimitSec: limit, elapsedSec: elapsed, cautionSec: c.cautionSec, warningSec: c.warningSec, homeward },
    stats: {
      insideCells, edgeCells, insideM2: insideCells * cellM2, edgeM2: edgeCells * cellM2, reachM: Math.sqrt(reach2),
      limit: bound, ms: now() - started,
      bounds: insideCells + edgeCells > 0 ? { minX, maxX, minZ, maxZ } : null,
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
 * The event modifiers the event engine's state gives: `homeward` while an active alert belongs to an event whose
 * definition has a planner request (it sends the crew to a shelter), and the active hazard areas.
 * @param {{ alerts?: Record<string, { eventId?: string, active?: boolean } | null>, hazards?: { zones?: Array<object> } }} state
 *   the mission store's state
 * @param {Array<{ id: string, planner?: object }>} definitions event definitions (src/sim/events/*.json)
 * @returns {{ homeward: boolean, hazards: Array<object>, events: string[] }} events: the ids that set homeward
 */
export function zoneModifiers(state, definitions) {
  const sends = new Set(definitions.filter((d) => d && d.planner).map((d) => d.id));
  const events = Object.values(state?.alerts ?? {})
    .filter((a) => a && a.active !== false && sends.has(a.eventId ?? a.id))
    .map((a) => a.eventId ?? a.id);
  return { homeward: events.length > 0, hazards: state?.hazards?.zones ?? [], events: [...new Set(events)].sort() };
}
