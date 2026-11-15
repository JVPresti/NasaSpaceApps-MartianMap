// Exports the data for the deck's walkback zone and route animations. Not part of the app build.
//
//   node docs/pitch/tools/walkback-zone.mjs        writes docs/pitch/src/walkback-data.js
//
// Everything is computed with the app's own code, imported from src/sim/:
//   - buildCostGrid: the HiRISE 1 m DTM (public/marswalk/assets/terrain.json, about 2 m grid) and the 20 deg no-go cells;
//   - planRoute: the planned route from the habitat airlock to Cheyava Falls through the route.json waypoints;
//   - the suit model (constantEffortSpeed, metabolicPowerW, o2RateGs, walkCost) with hazards.json: O2 per metre on
//     every slope, the 20 % walkback pad (Apollo 15) and the 30 min reserve (Apollo 17).
//
// The zone: every cell the astronaut can walk to from where they stand and still walk home, padded, keeping the
// reserve. Two Dijkstra passes on a 3x coarser grid (about 5.7 m cells): one from home over reversed edges (the
// walk back from every cell), one from the astronaut (the walk out). A cell is in the zone when
// out + back + reserve <= O2 left.
//
// The app does not draw this zone. It shows the same budget as one number, the margin. The deck says so.
// Scenario values are ours (SIM): the O2 left at the start of the clip and when the radiation alert comes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sim = (f) => import(join(ROOT, 'src/sim', f));
const { buildCostGrid } = await sim('costGrid.js');
const { planRoute } = await sim('routePlanner.js');
const { suitConstantsFromHazards, constantEffortSpeed, metabolicPowerW, o2RateGs, walkCost } = await sim('suitModel.js');

const terrain = JSON.parse(readFileSync(join(ROOT, 'public/marswalk/assets/terrain.json'), 'utf8'));
const hazards = JSON.parse(readFileSync(join(ROOT, 'public/data/hazards.json'), 'utf8'));
const shelters = JSON.parse(readFileSync(join(ROOT, 'public/data/shelters.json'), 'utf8'));
const routeJson = JSON.parse(readFileSync(join(ROOT, 'public/marswalk/assets/route.json'), 'utf8'));
const grid = buildCostGrid(terrain);
const c = suitConstantsFromHazards(hazards);
const hab = (shelters.shelters || shelters).find((s) => s.id === 'HAB');

// ---------------------------------------------------------------- planned route and per-leg costs
const wps = routeJson.waypoints.slice(1);
const plan = planRoute(grid, wps, { start: { x: hab.x, z: hab.z, name: 'HAB' } });
if (!plan.ok) throw new Error('planner failed: ' + plan.reason);
const hAt = (x, z) => {
  const fx = (x / grid.width + 0.5) * (grid.n - 1), fz = (z / grid.depth + 0.5) * (grid.n - 1);
  const i = Math.max(0, Math.min(grid.n - 2, Math.floor(fx))), j = Math.max(0, Math.min(grid.n - 2, Math.floor(fz)));
  const u = fx - i, v = fz - j, H = grid.heights, n = grid.n;
  return (H[j * n + i] * (1 - u) + H[j * n + i + 1] * u) * (1 - v) + (H[(j + 1) * n + i] * (1 - u) + H[(j + 1) * n + i + 1] * u) * v;
};
// split the path at the waypoints (nearest path vertex to each waypoint)
const path = plan.path;
const cuts = [0];
for (const w of wps) {
  let best = cuts[cuts.length - 1], bd = Infinity;
  for (let k = cuts[cuts.length - 1]; k < path.length; k++) { const d = Math.hypot(path[k][0] - w.x, path[k][1] - w.z); if (d < bd) { bd = d; best = k; } }
  cuts.push(best);
}
cuts[cuts.length - 1] = path.length - 1;
const legs = [];
let cumT = 0, cumO = 0;
for (let k = 0; k < wps.length; k++) {
  const seg = path.slice(cuts[k], cuts[k + 1] + 1);
  const w = walkCost(seg, hAt, c, { pad: 0 });
  cumT += w.timeSec; cumO += w.o2G;
  legs.push({ to: wps[k].name, from: cuts[k], end: cuts[k + 1], distanceM: Math.round(w.distanceM), timeMin: +(w.timeSec / 60).toFixed(1), o2G: +w.o2G.toFixed(1), cumTimeMin: +(cumT / 60).toFixed(1), cumO2G: +cumO.toFixed(1), climbM: Math.round(w.climbM) });
}

// ---------------------------------------------------------------- coarse grid and Dijkstra
const S = 3;
const N = Math.floor((grid.n - 1) / S) + 1;
const cell = grid.width / (grid.n - 1) * S;
const H = new Float32Array(N * N), B = new Uint8Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const gi = Math.min(grid.n - 1, i * S), gj = Math.min(grid.n - 1, j * S);
  H[j * N + i] = grid.heights[gj * grid.n + gi];
  // blocked when most fine nodes in the block are over the limit
  let b = 0, tot = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const fi = Math.max(0, Math.min(grid.n - 1, gi + di)), fj = Math.max(0, Math.min(grid.n - 1, gj + dj));
    b += grid.blocked[fj * grid.n + fi]; tot++;
  }
  b = b * 2 > tot ? 1 : 0;
  B[j * N + i] = b;
}
const toCell = (x, z) => {
  const ci = Math.round((x / grid.width + 0.5) * (N - 1)), cj = Math.round((z / grid.depth + 0.5) * (N - 1));
  let best = [ci, cj], bd = Infinity;
  for (let r = 0; r <= 4 && bd === Infinity; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N || B[j * N + i]) continue;
    const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; }
  }
  return best;
};
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const edgeO2 = new Map();
function o2Step(ha, hb, run, pad) {
  const i = (hb - ha) / run, v = constantEffortSpeed(i, c);
  return o2RateGs(metabolicPowerW(v, i, c) * (1 + pad), c) * run / v;
}
// O2 for each of the 8 edges out of every cell, both pads, computed once: the suit model's speed bisection is slow.
const EDGE = { 0: new Float32Array(N * N * 8), [c.walkbackPad]: new Float32Array(N * N * 8) };
for (const pad of [0, c.walkbackPad]) for (let x = 0; x < N * N; x++) {
  const i = x % N, j = (x / N) | 0;
  NB.forEach(([di, dj], k) => {
    const ni = i + di, nj = j + dj;
    EDGE[pad][x * 8 + k] = (ni < 0 || nj < 0 || ni >= N || nj >= N) ? Infinity : o2Step(H[x], H[nj * N + ni], cell * Math.hypot(di, dj), pad);
  });
}
const OPP = NB.map(([di, dj]) => NB.findIndex(([a, b]) => a === -di && b === -dj));
function dijkstra(si, sj, reverse, pad) {
  const dist = new Float32Array(N * N).fill(Infinity);
  const heap = [];   // binary heap of [d, idx]
  const push = (d, x) => { heap.push([d, x]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const s = sj * N + si; dist[s] = 0; push(0, s);
  while (heap.length) {
    const [d, x] = pop();
    if (d > dist[x]) continue;
    const i = x % N, j = (x / N) | 0;
    for (let k0 = 0; k0 < 8; k0++) { const [di, dj] = NB[k0];
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const y = nj * N + ni;
      if (B[y]) continue;
      // reverse: the cost of walking from y to x (the walk home runs the other way)
      const k = k0;
      const w = reverse ? EDGE[pad][y * 8 + OPP[k]] : EDGE[pad][x * 8 + k];
      if (d + w < dist[y]) { dist[y] = d + w; push(d + w, y); }
    }
  }
  return dist;
}

const flatRate = o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);   // g/s walking on the flat
const reserveG = flatRate * c.reserveSec;                             // 30 min at the walking rate
const [hi, hj] = toCell(hab.x, hab.z);
const back = dijkstra(hi, hj, true, c.walkbackPad);

// ---------------------------------------------------------------- the clip
// The astronaut walks the planned route out from the habitat. O2 left starts at O2_START (SIM scenario: late in a
// long EVA) and drains by the suit model's O2 for each metre walked. At SPE_AT of the way out, the radiation alert
// comes: the app re-plans to the habitat, and the zone collapses to the ground on the way home (the walk home plus
// a 10 % allowance, SIM).
const O2_START = 205;   // g, SIM
const FRAMES_OUT = 40, FRAMES_HOME = 14, SPE_FRAME = 30;
const totalOut = legs[legs.length - 1].cumO2G;
// cumulative O2 along the path vertices
const cum = [0];
for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + walkCost([path[k - 1], path[k]], hAt, c, { pad: 0 }).o2G);
const atO2 = (o) => { // position along the path where o grams have been spent
  for (let k = 1; k < path.length; k++) if (cum[k] >= o) { const u = (o - cum[k - 1]) / (cum[k] - cum[k - 1] || 1); return [path[k - 1][0] + (path[k][0] - path[k - 1][0]) * u, path[k - 1][1] + (path[k][1] - path[k - 1][1]) * u, k]; }
  const p = path[path.length - 1]; return [p[0], p[1], path.length - 1];
};
const frames = [];
const last = new Uint8Array(N * N);   // last frame index (1-based) the cell is still in the zone, for every frame so far
const alive = new Uint8Array(N * N).fill(1);
let spent = 0, pos = [hab.x, hab.z, 0];
for (let f = 0; f < FRAMES_OUT + FRAMES_HOME; f++) {
  const spe = f >= SPE_FRAME;
  if (f < SPE_FRAME) { spent = totalOut * 0.62 * f / (SPE_FRAME - 1); pos = atO2(spent); }
  else if (f > SPE_FRAME) { // walk home along the path, back toward the habitat
    const o = Math.max(0, cum[pos[2]] - (cum[pos[2]] / (FRAMES_OUT + FRAMES_HOME - SPE_FRAME)) * 1.0);
    const np = atO2(o); spent += walkCost([[pos[0], pos[1]], [np[0], np[1]]], hAt, c, { pad: c.walkbackPad }).o2G; pos = np;
  }
  const o2Left = O2_START - spent;
  const [pi, pj] = toCell(pos[0], pos[1]);
  const out = dijkstra(pi, pj, false, 0);
  const backHere = back[pj * N + pi];
  let count = 0;
  for (let x = 0; x < N * N; x++) {
    const inZone = spe ? out[x] + back[x] <= backHere * 1.1 + 0.5 : out[x] + back[x] + reserveG <= o2Left;
    if (inZone && alive[x]) { last[x] = f + 1; count++; } else alive[x] = 0;
  }
  const marginMin = (o2Left - backHere - reserveG) / flatRate / 60;
  frames.push({ x: +pos[0].toFixed(1), z: +pos[1].toFixed(1), o2Left: +o2Left.toFixed(0), backG: +backHere.toFixed(1), marginMin: +marginMin.toFixed(0), areaHa: +(count * cell * cell / 1e4).toFixed(1), spe });
  console.log(`frame ${f}: O2 ${o2Left.toFixed(0)} g, walk home ${backHere.toFixed(0)} g, margin ${marginMin.toFixed(0)} min, zone ${(count * cell * cell / 1e4).toFixed(1)} ha${spe ? ' (SPE)' : ''}`);
}

const out = {
  note: 'Generated by docs/pitch/tools/walkback-zone.mjs from src/sim (cost grid, planner, suit model) and public/data. Do not edit.',
  tile: { width: grid.width, depth: grid.depth }, N, cellM: +cell.toFixed(2),
  reserveG: +reserveG.toFixed(1), flatRateGh: +(flatRate * 3600).toFixed(1), o2Start: O2_START, speFrame: SPE_FRAME,
  hab: { x: hab.x, z: hab.z },
  waypoints: routeJson.waypoints.slice(1).map((w) => ({ name: w.name, x: w.x, z: w.z })),
  path: path.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]),
  legs, frames,
  last: Buffer.from(last).toString('base64'),
  blocked: Buffer.from(B).toString('base64'),
};
writeFileSync(join(ROOT, 'docs/pitch/src/walkback-data.js'), 'window.WALKBACK = ' + JSON.stringify(out) + ';\n');
console.log('legs', JSON.stringify(legs));
