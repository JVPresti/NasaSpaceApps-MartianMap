// Precompute the presentation's route, leg costs and walkback zone with the app's own simulation code (#291).
//
//   node scripts/present/build-plan.mjs        writes public/present/plan.json
//
// Everything comes from src/sim and public/data, the same code the mission table runs:
//   - buildCostGrid: the HiRISE 1 m DTM (public/marswalk/assets/terrain.json, 2 m grid), 20 deg no-go cells;
//   - planRoute: the route from the habitat airlock (shelters.json HAB) through the route.json waypoints to Cheyava Falls;
//   - the suit model (walkCost, constantEffortSpeed, metabolicPowerW, o2RateGs) with hazards.json: O2 for every metre
//     on its real slope, the 20 % walkback pad and the 30 min reserve.
//
// The walkback zone (every place the astronaut can reach and still get home) is not computed here: it comes from
// src/sim/returnZone.js (#335), the module the app uses, through src/present/zoneFrames.js. Each frame of the clip is one
// call with the elapsed time, the astronaut's position on the first sortie and the crew's planned time. The file stores
// the zone as one byte per node, `last`:
// the last frame (1-based) in which the cell is still inside, so the browser draws frame f as last > f.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCostGrid, COST_CONSTANTS } from '../../src/sim/costGrid.js';
import { planRoute } from '../../src/sim/routePlanner.js';
import { splitAtWaypoints } from '../../src/sim/legCosts.js';
import { suitConstantsFromHazards, metabolicPowerW, o2RateGs, walkCost } from '../../src/sim/suitModel.js';
import { buildZoneFrames } from '../../src/present/zoneFrames.js';

// src/sim/returnZone.js comes with #335. Load it here, so a checkout without it fails with this message, not a stack.
const zoneModule = await import('../../src/sim/returnZone.js').catch((err) => {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  console.error('build-plan: src/sim/returnZone.js is missing. It lands with #335 (feat/return-zone); merge that first. ' +
    'public/present/plan.json is committed, so the presentation runs without this step.');
  process.exit(1);
});
const { shelterWindowSec } = zoneModule;

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(root(p), 'utf8'));

const terrain = readJson('public/marswalk/assets/terrain.json');
const hazards = readJson('public/data/hazards.json');
const shelters = readJson('public/data/shelters.json');
const routeJson = readJson('public/marswalk/assets/route.json');
const rad = readJson('public/data/rad.json');
const trekCheck = readJson('docs/data/mars-trek-check/results.json');
const grid = buildCostGrid(terrain);
const c = suitConstantsFromHazards(hazards);
const hab = (shelters.shelters || shelters).find((s) => s.id === 'HAB');

// ---------------------------------------------------------------- scenario (SIM)
// The first sortie's clip (SIM, our scenario): 30 frames out to the stop and working there while the clock runs to
// alertAtSec, the radiation alert at frame 30, then 24 frames walking home. O2 is a full primary tank less a little;
// the crew's planned time binds first, as it does in the app.
const SCENARIO = { framesOut: 30, framesHome: 24, speFrame: 30, arriveFrame: 4, alertAtSec: 13 * 60, o2G: 700,
  windowSec: shelterWindowSec(readJson('src/sim/events/radiation.json')) };

// ---------------------------------------------------------------- height and slope from the cost grid
const hAt = (x, z) => {
  const fx = (x / grid.width + 0.5) * (grid.n - 1), fz = (z / grid.depth + 0.5) * (grid.n - 1);
  const i = Math.max(0, Math.min(grid.n - 2, Math.floor(fx))), j = Math.max(0, Math.min(grid.n - 2, Math.floor(fz)));
  const u = fx - i, v = fz - j, H = grid.heights, n = grid.n;
  return (H[j * n + i] * (1 - u) + H[j * n + i + 1] * u) * (1 - v) + (H[(j + 1) * n + i] * (1 - u) + H[(j + 1) * n + i + 1] * u) * v;
};
const slopeDeg = (x, z) => {
  const d = 2;
  const gx = (hAt(x + d, z) - hAt(x - d, z)) / (2 * d), gz = (hAt(x, z + d) - hAt(x, z - d)) / (2 * d);
  return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
};

// ---------------------------------------------------------------- route and legs
const wps = routeJson.waypoints.slice(1);
const plan = planRoute(grid, wps, { start: { x: hab.x, z: hab.z, name: 'HAB' } });
if (!plan.ok) throw new Error('planner failed: ' + plan.reason);
const path = plan.path;
const stops = [{ x: hab.x, z: hab.z, name: 'HAB' }, ...wps];
const legs = splitAtWaypoints(path, stops).map(({ to, path: legPath }) => {
  const w = walkCost(legPath, hAt, c, { pad: 0 });
  const mid = legPath[Math.floor(legPath.length / 2)];
  return {
    to: to.name, x: to.x, z: to.z, mid: [+mid[0].toFixed(1), +mid[1].toFixed(1)],
    distanceM: Math.round(w.distanceM), timeMin: +(w.timeSec / 60).toFixed(1), o2G: +w.o2G.toFixed(1),
    climbM: Math.round(w.climbM), maxSlopeDeg: +w.maxSlopeDeg.toFixed(1),
  };
});
const out = walkCost(path, hAt, c, { pad: 0 });
const back = walkCost([...path].reverse(), hAt, c);   // default pad: the walkback pad
const flatRate = o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);   // g/s walking on the flat

// Where the route bends around steep ground: the sharpest turn with ground over the caution slope within 25 m.
let bend = null;
for (let k = 2; k < path.length - 2; k++) {
  const [ax, az] = path[k - 1], [bx, bz] = path[k], [cx, cz] = path[k + 1];
  if (stops.some((w) => Math.hypot(w.x - bx, w.z - bz) < 20)) continue;   // a turn at a stop is not a bend
  const a1 = Math.atan2(bz - az, bx - ax), a2 = Math.atan2(cz - bz, cx - bx);
  let turn = Math.abs(a2 - a1); if (turn > Math.PI) turn = 2 * Math.PI - turn;
  let steep = 0, sx = bx, sz = bz;
  for (let dz = -25; dz <= 25; dz += 2.5) for (let dx = -25; dx <= 25; dx += 2.5) {
    if (dx * dx + dz * dz > 625) continue;
    const s = slopeDeg(bx + dx, bz + dz);
    if (s > steep) { steep = s; sx = bx + dx; sz = bz + dz; }
  }
  if (steep < COST_CONSTANTS.SLOPE_CAUTION_DEG) continue;
  const score = turn * steep;
  if (!bend || score > bend.score) bend = { score, x: bx, z: bz, steepX: sx, steepZ: sz, slopeDeg: steep, turnDeg: turn * 180 / Math.PI };
}

// ---------------------------------------------------------------- walkback zone (src/sim/returnZone.js)
// The zone comes from the app's own module through src/present/zoneFrames.js, so the presentation and the app draw the
// same zone.
const zone = buildZoneFrames({ grid, hab, constants: c, scenario: SCENARIO, zoneModule });
for (const f of zone.frames) console.log(`T+${(f.elapsedSec / 60).toFixed(1)} min, margin ${f.marginMin} min, reach ${f.reachM} m, zone ${f.areaHa} ha${f.spe ? ' (alert)' : ''}`);

const result = {
  note: 'Generated by scripts/present/build-plan.mjs from src/sim (cost grid, planner, suit model) and public/data. Do not edit.',
  tile: { width: grid.width, depth: grid.depth },
  constants: {
    o2UsableG: Math.round(c.o2UsableG), reserveMin: c.reserveSec / 60, walkbackPadPct: Math.round(c.walkbackPad * 100),
    evaMaxH: c.evaMaxSec / 3600, slopeNoGoDeg: COST_CONSTANTS.SLOPE_LIMIT_DEG, slopeCautionDeg: COST_CONSTANTS.SLOPE_CAUTION_DEG,
    flatRateGh: +(flatRate * 3600).toFixed(1), speedFlat: c.speedFlat,
  },
  hab: { x: hab.x, z: hab.z },
  waypoints: wps.map((w) => ({ name: w.name, x: w.x, z: w.z })),
  path: path.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]),
  legs,
  totals: {
    distanceM: Math.round(out.distanceM), timeMin: +(out.timeSec / 60).toFixed(1), o2G: +out.o2G.toFixed(1),
    returnO2G: +back.o2G.toFixed(1), returnTimeMin: +(back.timeSec / 60).toFixed(1), maxSlopeDeg: +out.maxSlopeDeg.toFixed(1),
  },
  bend: bend && { x: +bend.x.toFixed(1), z: +bend.z.toFixed(1), steepX: +bend.steepX.toFixed(1), steepZ: +bend.steepZ.toFixed(1), slopeDeg: +bend.slopeDeg.toFixed(1), turnDeg: Math.round(bend.turnDeg) },
  // numbers the presentation quotes from other data files, with the file they come from
  rad: { peak: Math.round(Math.max(...rad.event.channels.dose_rate_b.values)), baseline: +rad.event.baseline.dose_rate_b.value.toFixed(1), unit: 'µGy/h', file: 'public/data/rad.json (RAD detector B, September 2017, Gale crater)' },
  trek: { rmsM: trekCheck.tile.oursMinusTrekM.rms, file: 'docs/data/mars-trek-check/results.json' },
  zone: { ...zone, last: Buffer.from(zone.last).toString('base64') },
};
writeFileSync(root('public/present/plan.json'), JSON.stringify(result) + '\n');
console.log('route', result.totals, 'bend', result.bend);
console.log('legs', JSON.stringify(legs));
