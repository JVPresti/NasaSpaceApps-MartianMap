// Build public/data/shelters.json from the terrain.
//
// Usage: npm run shelters
//
// 1. Places the habitat with the same rule as src/engine/habitat.js and puts
//    the HAB entry at the foot of the airlock steps.
// 2. Computes the sky view factor of every grid node (src/sim/skyView.js).
// 3. Picks natural safe points: walkable, well below open-plain sky view,
//    spread across the tile, one close to the route, each reachable from HAB.
// 4. Writes the file with a provenance block per value.
//
// The method and every threshold are explained in docs/route/shelters.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COST_CONSTANTS, buildCostGrid, cellToWorld, heightAt } from '../src/sim/costGrid.js';
import { planRoute } from '../src/sim/routePlanner.js';
import { SKY_VIEW_DEFAULTS, computeSkyView, skyViewAt } from '../src/sim/skyView.js';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(root(path), 'utf8'));

const terrainJson = readJson('public/marswalk/assets/terrain.json');
const routeJson = readJson('public/marswalk/assets/route.json');
const habitatJson = readJson('public/marswalk/assets_habitat/habitat.json');
const hazards = readJson('public/data/hazards.json').values;

/** Selection rules. DERIVED or SIM, explained in docs/route/shelters.md. */
const RULES = {
  /** A safe point must cut the isotropic SEP dose by at least this much. */
  minDoseReduction: 0.12,
  /** Every node within this radius must be walkable, so the spot is a patch, not one node. Metres. */
  patchRadiusM: 4,
  /** Rays are cut off at the tile edge, so stay this far inside it. Metres. */
  edgeMarginM: 60,
  /** Natural points are at least this far apart. Metres. */
  minSeparationM: 300,
  /** The route point is within this distance of the HAB to Cheyava Falls polyline. Metres. */
  routeCorridorM: 80,
  /** Natural points to keep, including the route point. */
  count: 4,
};

/** Azimuths for the check of each chosen point, to show the grid result has converged. */
const CHECK_AZIMUTHS = 72;

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function provenance(fields) {
  return {
    mission: null,
    instrument: null,
    product_id: null,
    site: 'Jezero crater, Neretva Vallis, around Cheyava Falls',
    sol_or_date: null,
    reference: null,
    url: null,
    locator: null,
    data_url: null,
    license: null,
    note: null,
    ...fields,
  };
}

const TERRAIN_SOURCE = {
  mission: 'MRO',
  instrument: 'HiRISE',
  product_id: null,
  reference:
    'Marswalk terrain tile public/marswalk/assets/terrain.json (751 x 751 heights, 2 m spacing, from the HiRISE 1 m DEM of Jezero crater)',
  url: 'https://www.uahirise.org/dtm/',
  locator: 'docs/marswalk-assets/README.md, Coordinates and assets sections',
  data_url: 'https://www.uahirise.org/dtm/',
  license: 'HiRISE products are NASA/JPL/University of Arizona, public with no restriction of use (NASA SPD-41A).',
};

// --- Cost grid and habitat -------------------------------------------------

const grid = buildCostGrid(terrainJson);
const { n } = grid;
const slopeLimit = COST_CONSTANTS.SLOPE_LIMIT_DEG;

/**
 * Same placement as `habitat.init` in src/engine/habitat.js: the flattest spot
 * within 30 m of the HAB waypoint, airlock turned toward the first waypoint.
 * The engine samples the rendered mesh; this samples the same height grid.
 */
function placeHabitat() {
  const waypoints = routeJson.waypoints;
  const hab = waypoints.find((w) => w.name === 'HAB') ?? waypoints[0];
  const next = waypoints[1];
  let best = null;
  for (let dz = -30; dz <= 30; dz += 3) {
    for (let dx = -30; dx <= 30; dx += 3) {
      const x = hab.x + dx;
      const z = hab.z + dz;
      let lo = Infinity;
      let hi = -Infinity;
      for (let a = 0; a < 12; a += 1) {
        const h = heightAt(grid, x + Math.cos(a * 0.5236) * 5.5, z + Math.sin(a * 0.5236) * 5.5);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (!best || hi - lo < best.relief) best = { x, z, relief: hi - lo };
    }
  }
  const length = Math.hypot(next.x - best.x, next.z - best.z);
  const dir = { x: (next.x - best.x) / length, z: (next.z - best.z) / length };
  // habitat.json: "the steps reach the ground at about x = 9.9" (habitat space, +X = airlock end).
  const stepsFoot = Number(/x = ([\d.]+)"?$/.exec(habitatJson.airlock)?.[1] ?? 9.9);
  return {
    waypoint: hab,
    centre: best,
    dir,
    stepsFoot,
    entry: { x: round(best.x + dir.x * stepsFoot, 1), z: round(best.z + dir.z * stepsFoot, 1) },
  };
}

const habitat = placeHabitat();

// --- Sky view ---------------------------------------------------------------

const sky = computeSkyView(grid);
console.log(
  `sky view: ${n} x ${n} nodes, ${sky.options.azimuths} azimuths, ${sky.samplesPerRay} samples per ray, ${Math.round(sky.elapsedMs)} ms`,
);

const sorted = Float32Array.from(sky.skyView).sort();
const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const stats = {
  min: quantile(0),
  p01: quantile(0.01),
  p50: quantile(0.5),
  p99: quantile(0.99),
  max: quantile(1 - 1e-9),
};
console.log(
  `sky view over the tile: min ${stats.min.toFixed(3)}, 1 % ${stats.p01.toFixed(3)}, median ${stats.p50.toFixed(3)}, max ${stats.max.toFixed(3)}`,
);

// --- Candidates -------------------------------------------------------------

const patchI = Math.ceil(RULES.patchRadiusM / grid.cellSizeX);
const patchJ = Math.ceil(RULES.patchRadiusM / grid.cellSizeZ);
const marginI = Math.ceil(RULES.edgeMarginM / grid.cellSizeX);
const marginJ = Math.ceil(RULES.edgeMarginM / grid.cellSizeZ);
const maxSkyView = 1 - RULES.minDoseReduction;

function patchIsWalkable(i, j) {
  for (let dj = -patchJ; dj <= patchJ; dj += 1) {
    for (let di = -patchI; di <= patchI; di += 1) {
      const ex = (di * grid.cellSizeX) / RULES.patchRadiusM;
      const ez = (dj * grid.cellSizeZ) / RULES.patchRadiusM;
      if (ex * ex + ez * ez > 1) continue;
      const k = (j + dj) * n + (i + di);
      if (grid.blocked[k] === 1 || !(grid.slopes[k] < slopeLimit)) return false;
    }
  }
  return true;
}

/** Distance from a point to the polyline HAB entry -> WP1 -> ... -> Cheyava Falls. */
const routeLine = [habitat.entry, ...routeJson.waypoints.filter((w) => w.name !== 'HAB')];
function distanceToRoute(x, z) {
  let best = Infinity;
  for (let s = 1; s < routeLine.length; s += 1) {
    const a = routeLine[s - 1];
    const b = routeLine[s];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - (a.x + t * vx), z - (a.z + t * vz)));
  }
  return best;
}

const pool = [];
for (let j = marginJ; j < n - marginJ; j += 1) {
  for (let i = marginI; i < n - marginI; i += 1) {
    const value = sky.skyView[j * n + i];
    if (value > maxSkyView) continue;
    if (!patchIsWalkable(i, j)) continue;
    const { x, z } = cellToWorld(grid, i, j);
    pool.push({ i, j, x, z, skyView: value, routeDistance: distanceToRoute(x, z) });
  }
}
pool.sort((a, b) => a.skyView - b.skyView);
console.log(`candidate nodes: ${pool.length} walkable nodes with sky view <= ${maxSkyView.toFixed(2)}`);

function reachable(point) {
  const route = planRoute(grid, [{ x: point.x, z: point.z }], { start: habitat.entry });
  return route.ok ? route : null;
}

const chosen = [];
function tryPick(filter, tag) {
  for (const candidate of pool) {
    if (!filter(candidate)) continue;
    if (chosen.some((c) => Math.hypot(c.x - candidate.x, c.z - candidate.z) < RULES.minSeparationM)) continue;
    const route = reachable(candidate);
    if (!route) continue;
    chosen.push({ ...candidate, route, tag });
    return true;
  }
  return false;
}

if (!tryPick((c) => c.routeDistance <= RULES.routeCorridorM, 'route')) {
  throw new Error('no safe point near the route');
}
while (chosen.length < RULES.count && tryPick(() => true, 'spread'));

// --- Output -----------------------------------------------------------------

const sepDose = hazards['radiation.sep_2017.event_dose'];

const assumption =
  'Assumes an isotropic SEP flux above the horizon: dose is proportional to the visible solid angle of the upper hemisphere, and the planet blocks everything below the horizontal. ' +
  'The real flux at the surface is stronger toward the zenith, because particles arriving at a low angle cross more atmosphere, so blocking the low sky saves less than this estimate. ' +
  'Read the reduction as an upper bound. It ignores secondary particles from the ground and the rock itself (albedo neutrons) and the galactic background, which comes from the same sky.';

function shelterNote(point) {
  return (
    `Sky view ${point.skyViewCheck.toFixed(3)} of the upper hemisphere at ${SKY_VIEW_DEFAULTS.observerHeightM} m above the ground ` +
    `(${CHECK_AZIMUTHS} azimuths, rays to ${SKY_VIEW_DEFAULTS.maxDistanceM} m), against 1.000 on open flat ground and a tile median of ${stats.p50.toFixed(3)}. `
  );
}

const habitatEntry = {
  id: 'HAB',
  name: 'HAB · habitat airlock',
  type: 'habitat',
  x: habitat.entry.x,
  z: habitat.entry.z,
  events: ['radiation', 'dust_storm', 'low_oxygen'],
  protection: 'full',
  reason:
    'Pressurised habitat. Inside the crew has air, power and walls between them and the sky. It is the only shelter that protects from every event.',
  waypoint: { x: habitat.waypoint.x, z: habitat.waypoint.z },
  values: {
    position: {
      value: [habitat.entry.x, habitat.entry.z],
      unit: 'm (x east, z south, from Cheyava Falls)',
      tag: 'DERIVED',
      label: 'HiRISE DEM · habitat placement',
      provenance: provenance({
        ...TERRAIN_SOURCE,
        reference: 'Habitat placement rule in src/engine/habitat.js (habitat.init) and the airlock geometry in public/marswalk/assets_habitat/habitat.json',
        url: null,
        locator: `habitat.json, airlock: "${habitatJson.airlock}"`,
        data_url: null,
        license: 'Project code and data.',
        note:
          `Foot of the airlock steps. The engine places the habitat on the flattest spot within 30 m of the HAB waypoint (${habitat.waypoint.x}, ${habitat.waypoint.z}): ` +
          `centre (${habitat.centre.x}, ${habitat.centre.z}), ${habitat.centre.relief.toFixed(2)} m of relief under the 11 m footprint, airlock turned toward the first waypoint. ` +
          `The steps reach the ground ${habitat.stepsFoot} m from the habitat origin along that heading. build-shelters.mjs repeats the rule on the same height grid.`,
      }),
    },
  },
};

const natural = chosen.map((point, index) => {
  const check = skyViewAt(grid, point.x, point.z, { azimuths: CHECK_AZIMUTHS });
  point.skyViewCheck = check.skyView;
  const reduction = 1 - check.skyView;
  const maxHorizon = Math.max(...check.horizonDeg);
  const maxAzimuth = (check.horizonDeg.indexOf(maxHorizon) * 360) / CHECK_AZIMUTHS;
  const x = round(point.x, 1);
  const z = round(point.z, 1);
  const where = point.tag === 'route' ? 'next to the route' : 'spread across the tile';
  const valueProvenance = (note) =>
    provenance({
      ...TERRAIN_SOURCE,
      reference: `${TERRAIN_SOURCE.reference}; sky view computed by src/sim/skyView.js through scripts/build-shelters.mjs`,
      note,
    });
  return {
    id: `SP${index + 1}`,
    name: `SP${index + 1} · terrain shade`,
    type: 'natural',
    x,
    z,
    events: ['radiation'],
    protection: 'partial',
    reason:
      `Walkable ground where the terrain hides ${(reduction * 100).toFixed(0)} % of the sky, ${where}. ` +
      `The horizon rises to ${maxHorizon.toFixed(0)} deg toward azimuth ${maxAzimuth.toFixed(0)} deg. ` +
      'Use it to wait out a solar particle event only when the habitat is too far. It gives no protection from a dust storm or low oxygen.',
    values: {
      sky_view_factor: {
        value: round(check.skyView, 3),
        unit: 'fraction of the upper hemisphere',
        tag: 'DERIVED',
        label: 'HiRISE DEM · sky view',
        provenance: valueProvenance(shelterNote(point) + assumption),
      },
      dose_reduction: {
        value: round(reduction, 3),
        unit: 'fraction of the open-ground SEP dose',
        tag: 'DERIVED',
        label: 'HiRISE DEM · sky view',
        provenance: valueProvenance(
          `1 - sky view factor. Applied to the September 2017 event (${sepDose.value} ${sepDose.unit}, RAD in Gale crater, hazards.json radiation.sep_2017.event_dose) ` +
            `it would save at most ${Math.round(sepDose.value * reduction)} µGy. ` +
            assumption,
        ),
      },
      route_from_hab: {
        value: round(point.route.distance, 0),
        unit: 'm',
        tag: 'DERIVED',
        label: 'A* planner · HiRISE DEM',
        provenance: valueProvenance(
          `Walking distance of the A* route from the HAB entry (src/sim/routePlanner.js, slope limit ${slopeLimit} deg). ` +
            `Straight line ${Math.round(Math.hypot(x - habitat.entry.x, z - habitat.entry.z))} m, steepest slope on the route ${point.route.steepestSlopeDeg.toFixed(1)} deg.`,
        ),
      },
    },
  };
});

const output = {
  schema_version: 1,
  title: 'Marswalk shelters and safe points',
  description:
    'Places the route planner can send the crew to when an event starts. The habitat comes first. Natural safe points come from the sky view of the terrain. Field definitions are in public/data/README.md, the method is in docs/route/shelters.md. Built by scripts/build-shelters.mjs; do not edit by hand.',
  frame: 'x east, z south, metres from Cheyava Falls (engine frame, same as route.json)',
  tags: {
    DATA: 'Measured by a mission or a lab study, or stated in a NASA specification or procedure. The provenance block names the document and the page.',
    DERIVED: 'Calculated by us from DATA values. The note gives the calculation.',
    SIM: 'Our own assumption or game choice. The note says why and what it is based on.',
  },
  events: {
    radiation: 'Solar particle event (hazards.json radiation.sep_*)',
    dust_storm: 'Dust storm (hazards.json dust.*)',
    low_oxygen: 'Low suit oxygen (hazards.json suit.*)',
  },
  protection: {
    full: 'Closes the hazard: the crew can stay as long as needed.',
    partial: 'Lowers the hazard but does not stop it. Planner fallback when no full shelter can be reached.',
  },
  sky_view: {
    method:
      `Ray cast on the 751 x 751 height grid: ${SKY_VIEW_DEFAULTS.azimuths} azimuths, rays to ${SKY_VIEW_DEFAULTS.maxDistanceM} m or the tile edge, ` +
      `dose point ${SKY_VIEW_DEFAULTS.observerHeightM} m above the ground. Visible fraction = mean over azimuths of (1 - sin(horizon elevation)), horizon clamped at 0.`,
    tile_stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, round(v, 3)])),
    selection: RULES,
  },
  shelters: [habitatEntry, ...natural],
};

writeFileSync(root('public/data/shelters.json'), `${JSON.stringify(output, null, 2)}\n`);

console.log('\nid    x       z       sky view  dose cut  route m  line m');
for (const s of natural) {
  const line = Math.hypot(s.x - habitat.entry.x, s.z - habitat.entry.z);
  console.log(
    `${s.id.padEnd(5)} ${String(s.x).padStart(7)} ${String(s.z).padStart(7)}  ${s.values.sky_view_factor.value.toFixed(3)}     ${(s.values.dose_reduction.value * 100).toFixed(1).padStart(5)} %  ${String(s.values.route_from_hab.value).padStart(6)}  ${line.toFixed(0).padStart(6)}`,
  );
}
console.log(`HAB entry (${habitat.entry.x}, ${habitat.entry.z}); wrote public/data/shelters.json`);
