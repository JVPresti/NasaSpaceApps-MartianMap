// Build public/data/traverse.json: Perseverance's path across the Marswalk tile, and where the rover stood
// for each Perseverance image in public/data/stops.json (#249).
//
// Usage: npm run traverse              (downloads are cached in node_modules/.cache/pds)
//        npm run traverse -- --refresh (download again)
//
// 1. Downloads the Mars 2020 traverse and waypoint layers of the NASA "Where is the rover" map (MMGIS), about
//    2.3 MB of GeoJSON: one line per drive, one point per rover localization.
// 2. Puts them in the engine frame: x east, z south, metres from Cheyava Falls. The origin and the projection
//    are the ones the tile was cut with (blender/data/jezero_cheyava_meta.json), as in scripts/mars-trek-check.mjs.
// 3. Clips every drive to the tile, drops repeated points and simplifies each line to 0.3 m.
// 4. For each image in stops.json with a sol, takes the last rover localization on or before that sol: the place
//    the rover stood, not where the camera pointed.
//
// The layers grow as the rover drives on, but the drives over this tile (sols 1140 to 1266) do not change, so a
// rerun writes the same bytes.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchText, stringifyCompact } from './pdsFetch.mjs';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(root(path), 'utf8'));
const OUT = 'public/data/traverse.json';

const LAYERS = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/';
const TRAVERSE_URL = `${LAYERS}M20_traverse.json`;
const WAYPOINTS_URL = `${LAYERS}M20_waypoints.json`;
const MAP_PAGE = 'https://mars.nasa.gov/mars2020/mission/where-is-the-rover/';
const NASA_MEDIA = 'NASA material, not subject to copyright in the United States (NASA Images and Media Usage Guidelines)';

/** Sphere radius of the DTM projection the tile was cut from (equirectangular, lat_ts = 0). Metres. */
const MARS_RADIUS_M = 3396190;
/** Douglas-Peucker tolerance. The map shows the tile at about 0.5 m per pixel at best. Metres. */
const SIMPLIFY_M = 0.3;

const meta = readJson('blender/data/jezero_cheyava_meta.json');
const terrain = readJson('public/marswalk/assets/terrain.json');
const stops = readJson('public/data/stops.json');

const [LAT0, LON0] = meta.center_latlon;
const DEG = Math.PI / 180;
const M_PER_DEG = MARS_RADIUS_M * DEG;
const COS_LAT = Math.cos(LAT0 * DEG);
const HALF_W = terrain.width_m / 2;
const HALF_D = terrain.depth_m / 2;

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
/** Longitude and latitude (degrees) to engine metres, x east and z south. */
const toEngine = (lon, lat) => [(lon - LON0) * COS_LAT * M_PER_DEG, -(lat - LAT0) * M_PER_DEG];
const inTile = ([x, z]) => Math.abs(x) <= HALF_W && Math.abs(z) <= HALF_D;
/** Round to 0.1 m without leaving the tile: a point clipped to the edge must not round past it. */
const inside = (value, half) => Math.max(-Math.floor(half * 10) / 10, Math.min(Math.floor(half * 10) / 10, round(value)));

/** Liang-Barsky: the part of segment a-b inside the tile, or null. */
function clipSegment(a, b) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] + HALF_W], [dx, HALF_W - a[0]], [-dz, a[1] + HALF_D], [dz, HALF_D - a[1]]]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [[a[0] + dx * t0, a[1] + dz * t0], [a[0] + dx * t1, a[1] + dz * t1]];
}

/** Pieces of a polyline inside the tile: a line that leaves and comes back gives two pieces. */
function clipLine(points) {
  const pieces = [];
  let current = null;
  for (let k = 0; k < points.length - 1; k += 1) {
    const clipped = clipSegment(points[k], points[k + 1]);
    if (!clipped) {
      current = null;
      continue;
    }
    const [start, end] = clipped;
    const last = current?.at(-1);
    if (!last || Math.hypot(last[0] - start[0], last[1] - start[1]) > 1e-6) {
      current = [start];
      pieces.push(current);
    }
    current.push(end);
  }
  return pieces;
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const [ax, az] = points[0];
  const [bx, bz] = points.at(-1);
  const length = Math.hypot(bx - ax, bz - az);
  let worst = -1;
  let worstAt = 0;
  for (let k = 1; k < points.length - 1; k += 1) {
    const [px, pz] = points[k];
    const d = length === 0
      ? Math.hypot(px - ax, pz - az)
      : Math.abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / length;
    if (d > worst) {
      worst = d;
      worstAt = k;
    }
  }
  if (worst <= tolerance) return [points[0], points.at(-1)];
  return [...simplify(points.slice(0, worstAt + 1), tolerance).slice(0, -1), ...simplify(points.slice(worstAt), tolerance)];
}

const withoutRepeats = (points) => points.filter((p, k) => k === 0 || p[0] !== points[k - 1][0] || p[1] !== points[k - 1][1]);

// --- Drives -------------------------------------------------------------------------------------------------

const traverse = JSON.parse(await fetchText(TRAVERSE_URL));
const drives = [];
for (const feature of traverse.features) {
  if (feature.geometry?.type !== 'LineString') continue;
  const points = withoutRepeats(feature.geometry.coordinates.map(([lon, lat]) => toEngine(lon, lat)));
  for (const piece of clipLine(points)) {
    const path = withoutRepeats(simplify(piece, SIMPLIFY_M).map(([x, z]) => [inside(x, HALF_W), inside(z, HALF_D)]));
    if (path.length < 2) continue;
    drives.push({
      sol: Number(feature.properties.sol),
      from: String(feature.properties.fromRMC),
      to: String(feature.properties.toRMC),
      path,
    });
  }
}
drives.sort((a, b) => a.sol - b.sol || a.from.localeCompare(b.from, 'en', { numeric: true }));
if (drives.length === 0) throw new Error('no drive crosses the tile: check the origin and the layer');
const sols = drives.map((d) => d.sol);
const lengthM = drives.reduce((sum, d) => sum + d.path.slice(1).reduce((s, [x, z], k) => s + Math.hypot(x - d.path[k][0], z - d.path[k][1]), 0), 0);

// --- Where the rover stood for each image ------------------------------------------------------------------

const waypoints = JSON.parse(await fetchText(WAYPOINTS_URL)).features
  .map((f) => f.properties)
  .filter((p) => Number.isFinite(+p.sol) && Number.isFinite(p.lon) && Number.isFinite(p.lat));

const photos = [];
for (const stop of stops.stops) {
  for (const image of stop.images ?? []) {
    if (!image?.file || !Number.isFinite(image.sol)) continue;
    const at = waypoints.filter((p) => +p.sol <= image.sol).at(-1);
    if (!at) throw new Error(`no rover localization on or before sol ${image.sol} for ${image.file}`);
    const [x, z] = toEngine(at.lon, at.lat);
    if (!inTile([x, z])) throw new Error(`the rover was outside the tile on sol ${image.sol} (${image.file})`);
    photos.push({
      file: image.file,
      stop: stop.id,
      sol: image.sol,
      x: round(x),
      z: round(z),
      rover: { sol: +at.sol, rmc: String(at.RMC) },
    });
  }
}

// --- Write --------------------------------------------------------------------------------------------------

const out = {
  schema_version: 1,
  title: 'Perseverance traverse across the Marswalk tile',
  description: 'The drives Perseverance made across the 1.4 x 1.5 km tile, and where the rover stood for each image in stops.json. Field definitions are in public/data/README.md. Built by scripts/build-traverse.mjs; do not edit by hand.',
  frame: 'x east, z south, metres from Cheyava Falls (engine frame, same as route.json)',
  tag: 'DATA',
  label: 'Mars 2020 · rover traverse',
  provenance: {
    mission: 'Mars 2020',
    instrument: 'Rover localization (end-of-drive positions fixed by the rover team against orbital maps)',
    product_id: 'MMGIS layers M20_traverse and M20_waypoints',
    site: 'Neretva Vallis, Jezero crater',
    sol_or_date: `sols ${Math.min(...sols)} to ${Math.max(...sols)}`,
    reference: 'NASA/JPL-Caltech, Mars 2020 rover traverse and waypoints (Where is the rover map, MMGIS)',
    url: MAP_PAGE,
    locator: `${drives.length} drive lines that cross the tile, clipped to its edges`,
    data_url: TRAVERSE_URL,
    license: NASA_MEDIA,
    note: `Longitude and latitude converted to the engine frame with the origin and projection of blender/data/jezero_cheyava_meta.json, then each line simplified to ${SIMPLIFY_M} m. The 64 rover fixes on the tile agree with the HiRISE elevation model to 0.07 m RMS (docs/data/mars-trek-check). Photo positions are the last localization on or before the image's sol, from ${WAYPOINTS_URL}: where the rover stood, not where the camera pointed.`,
  },
  stats: { drives: drives.length, length_m: round(lengthM, 0), sols: [Math.min(...sols), Math.max(...sols)] },
  drives,
  photos,
};

writeFileSync(root(OUT), stringifyCompact(out));
console.log(`${OUT}: ${drives.length} drives, ${round(lengthM, 0)} m, sols ${out.stats.sols.join('-')}, ${drives.reduce((n, d) => n + d.path.length, 0)} points, ${photos.length} photos`);
for (const p of photos) console.log(`  ${p.file}: sol ${p.sol}, rover at sol ${p.rover.sol} ${p.rover.rmc}, x ${p.x} z ${p.z}`);
