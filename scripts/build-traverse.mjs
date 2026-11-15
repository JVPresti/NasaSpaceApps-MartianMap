// Build public/data/traverse.json: Perseverance's drives across the Marswalk tile, and where the rover stood when it
// took each surface image the science stops show (#249).
//
// Usage: npm run traverse                       downloads the two MMGIS layers
//        npm run traverse -- --from <folder>    reads M20_traverse.json and M20_waypoints.json from a folder
//
// 1. Reads the Mars 2020 traverse (one line per drive, with its sol and the RMC it drove from and to) and the rover
//    waypoints (one localization per RMC) from the Where is the rover map (MMGIS).
// 2. Projects longitude and latitude into the engine frame with the projection of the HiRISE DTM the tile was cut
//    from: equirectangular, lat_ts = 0, sphere R = 3,396,190 m, origin at the sol 1210 waypoint
//    (blender/data/jezero_cheyava_meta.json). scripts/mars-trek-check.mjs checks the same conversion against Mars Trek.
// 3. Clips each drive to the tile, simplifies it to SIMPLIFY_M and rounds to 0.1 m.
// 4. Places each stop image (public/data/stops.json) at the rover position where it was taken: the RMC (site and
//    drive) written in a Mars 2020 raw image ID, or else the rover's stop on the image sol when it did not drive
//    that sol. An image whose position cannot be told is left out and reported.
// 5. Writes the file with a provenance block per dataset. The output has no dates, so two runs give the same bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export const OUT = 'public/data/traverse.json';
export const MMGIS = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/';
export const TRAVERSE_URL = MMGIS + 'M20_traverse.json';
export const WAYPOINTS_URL = MMGIS + 'M20_waypoints.json';
/** The human page of the MMGIS layers, claimed by the m2020-rover-waypoint entry in scripts/credits-sources.mjs. */
export const MAP_PAGE = 'https://mars.nasa.gov/mars2020/mission/where-is-the-rover/';
/** Douglas-Peucker tolerance. Metres. Under the 2 m height grid and a pixel of the table map. */
export const SIMPLIFY_M = 0.5;

const LICENSE = 'NASA material, not copyrighted in the United States; credit NASA/JPL-Caltech (NASA media usage guidelines, https://www.nasa.gov/nasa-brand-center/images-and-media/)';
const DEG = Math.PI / 180;

/**
 * Longitude and latitude in degrees to engine metres (x east, z south) about an origin, for an equirectangular
 * projection with lat_ts = 0 on a sphere. East-west metres are true metres at the origin latitude.
 */
export function projector({ lat, lon }, radiusM) {
  const mPerDeg = radiusM * DEG;
  const cosLat = Math.cos(lat * DEG);
  return (lonDeg, latDeg) => ({ x: (lonDeg - lon) * cosLat * mPerDeg, z: -(latDeg - lat) * mPerDeg });
}

/** Liang-Barsky: the part of segment a-b inside |x| <= hx, |z| <= hz, or null. */
function clipSegment(a, b, hx, hz) {
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x + hx], [dx, hx - a.x], [-dz, a.z + hz], [dz, hz - a.z]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  return [{ x: a.x + t0 * dx, z: a.z + t0 * dz }, { x: a.x + t1 * dx, z: a.z + t1 * dz }];
}

/**
 * The parts of a polyline inside the box |x| <= hx, |z| <= hz. A line that leaves the box and comes back becomes
 * two parts. Points on the edge are added where the line crosses it.
 * @param {Array<{x: number, z: number}>} points
 * @returns {Array<Array<{x: number, z: number}>>}
 */
export function clipPolyline(points, hx, hz) {
  const parts = [];
  let current = null;
  const same = (p, q) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.z - q.z) < 1e-9;
  for (let i = 1; i < points.length; i += 1) {
    const piece = clipSegment(points[i - 1], points[i], hx, hz);
    if (!piece) { current = null; continue; }
    if (!current || !same(current.at(-1), piece[0])) {
      current = [piece[0]];
      parts.push(current);
    }
    current.push(piece[1]);
  }
  return parts.filter((part) => part.length > 1);
}

/** Douglas-Peucker: drop points closer than `tolerance` metres to the line through their neighbours. */
export function simplify(points, tolerance) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const a = points[first], b = points[last];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    let worst = -1, index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const p = points[i];
      const d = len === 0 ? Math.hypot(p.x - a.x, p.z - a.z) : Math.abs(dx * (a.z - p.z) - dz * (a.x - p.x)) / len;
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round1 = (v) => Math.round(v * 10) / 10 + 0;   // + 0 turns -0 into 0

/** Length of a polyline. Metres. */
export function lineLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return sum;
}

/**
 * Rover site and drive (RMC) written in a Mars 2020 raw image ID, for example
 * ZL0_1187_0772321307_818EBY_N0541010ZCAM09237_0630LMJ → "54_1010" (site 054, drive 1010). Null for other IDs.
 */
export function rmcFromImageId(id) {
  const match = /_N(\d{3})(\d{4})[A-Z]/.exec(String(id ?? ''));
  return match ? `${Number(match[1])}_${Number(match[2])}` : null;
}

/**
 * RMC where the rover stood all through `sol`: the end of its last drive before that sol. Null when it drove on that
 * sol, since the image may then come from before or after the drive, or when no earlier drive is known.
 * @param {number} sol
 * @param {Array<{sol: number, toRMC: string, SCLK_START?: number}>} drives
 */
export function roverStopForSol(sol, drives) {
  if (drives.some((d) => d.sol === sol)) return null;
  const before = drives.filter((d) => d.sol < sol).sort((a, b) => a.sol - b.sol || (a.SCLK_START ?? 0) - (b.SCLK_START ?? 0));
  return before.at(-1)?.toRMC ?? null;
}

/** Drive lines of a GeoJSON feature. */
function featureLines(feature) {
  const g = feature.geometry;
  if (g?.type === 'LineString') return [g.coordinates];
  if (g?.type === 'MultiLineString') return g.coordinates;
  return [];
}

/**
 * Build the traverse.json content from the two MMGIS layers.
 * @param {{ traverse: object, waypoints: object, meta: object, terrain: {width_m: number, depth_m: number},
 *   stops: Array<object> }} input
 */
export function buildTraverse({ traverse, waypoints, meta, terrain, stops }) {
  const radius = Number(/R=(\d+)/.exec(meta.projection)?.[1]);
  if (!(radius > 3e6)) throw new Error('jezero_cheyava_meta.json: projection must name the sphere radius (R=...)');
  const [lat, lon] = meta.center_latlon;
  const toEngine = projector({ lat, lon }, radius);
  const hx = terrain.width_m / 2, hz = terrain.depth_m / 2;

  const drives = [];
  for (const feature of traverse.features) {
    const { sol, fromRMC, toRMC } = feature.properties ?? {};
    for (const line of featureLines(feature)) {
      const projected = line.map(([lo, la]) => toEngine(lo, la));
      for (const part of clipPolyline(projected, hx, hz)) {
        const points = simplify(part, SIMPLIFY_M).map((p) => [round1(p.x), round1(p.z)]);
        drives.push({ sol, from: fromRMC ?? null, to: toRMC ?? null, points });
      }
    }
  }
  drives.sort((a, b) => a.sol - b.sol);
  if (drives.length === 0) throw new Error('no drive of the traverse crosses the tile');
  const sols = [drives[0].sol, drives.at(-1).sol];
  const lengthM = Math.round(drives.reduce((sum, d) => sum + lineLength(d.points.map(([x, z]) => ({ x, z }))), 0));

  const allDrives = traverse.features.map((f) => f.properties).filter((p) => Number.isFinite(p?.sol) && p.toRMC);
  const byRmc = new Map(waypoints.features.map((f) => [f.properties.RMC, f.properties]));
  const images = [];
  const skipped = [];
  for (const stop of stops) {
    for (const image of stop.images ?? []) {
      const fromId = rmcFromImageId(image.image_id);
      const rmc = fromId ?? roverStopForSol(image.sol, allDrives);
      const wp = rmc ? byRmc.get(rmc) : null;
      if (!wp) { skipped.push(`${image.image_id}: rover position on sol ${image.sol} unknown`); continue; }
      const p = toEngine(wp.lon, wp.lat);
      if (Math.abs(p.x) > hx || Math.abs(p.z) > hz) { skipped.push(`${image.image_id}: taken outside the tile`); continue; }
      const basis = fromId
        ? `The image ID names the rover site and drive, RMC ${rmc}.`
        : `The rover did not drive on sol ${image.sol}; it stood at RMC ${rmc}, the end of its last drive before that sol.`;
      images.push({
        stop: stop.id,
        file: image.file,
        image_id: image.image_id,
        sol: image.sol,
        camera: image.camera,
        rmc,
        x: round1(p.x),
        z: round1(p.z),
        tag: fromId ? 'DATA' : 'DERIVED',
        label: 'Mars 2020 waypoints · MMGIS',
        provenance: {
          mission: 'Mars 2020',
          instrument: null,
          product_id: `MMGIS layer M20_waypoints, RMC ${rmc}`,
          site: 'Jezero crater, Neretva Vallis, at Cheyava Falls',
          sol_or_date: `sol ${wp.sol} (rover localization), image sol ${image.sol}`,
          reference: 'NASA/JPL-Caltech, Mars 2020 "Where is the rover" map, MMGIS waypoint layer',
          url: MAP_PAGE,
          locator: `M20_waypoints.json, RMC ${rmc}: ${wp.Note ?? 'rover localization'}, lon ${wp.lon}, lat ${wp.lat}`,
          data_url: WAYPOINTS_URL,
          license: LICENSE,
          note: `${basis} Where the rover stood, not where the camera pointed. Projected like the traverse.`,
        },
      });
    }
  }

  return {
    output: {
      schema_version: 1,
      title: 'Perseverance on the Marswalk tile: traverse and image positions',
      description: 'The drives Perseverance made across the tile, and where the rover stood for each surface image the science stops show. Field definitions are in public/data/README.md. Built by scripts/build-traverse.mjs; do not edit by hand.',
      frame: 'x east, z south, metres from Cheyava Falls (engine frame, same as route.json)',
      projection: `${meta.projection}; origin ${lat} N, ${lon} E, the sol 1210 waypoint (blender/data/jezero_cheyava_meta.json)`,
      traverse: {
        tag: 'DATA',
        label: 'Mars 2020 traverse · MMGIS',
        sols,
        length_m: lengthM,
        provenance: {
          mission: 'Mars 2020',
          instrument: null,
          product_id: 'MMGIS layer M20_traverse',
          site: 'Jezero crater, Neretva Vallis: the part of the traverse inside the Marswalk tile',
          sol_or_date: `sols ${sols[0]} to ${sols[1]}`,
          reference: 'NASA/JPL-Caltech, Mars 2020 "Where is the rover" map, MMGIS traverse layer',
          url: MAP_PAGE,
          locator: 'M20_traverse.json: one line per drive, with its sol and the RMC it drove from and to',
          data_url: TRAVERSE_URL,
          license: LICENSE,
          note: `Each drive clipped to the ${terrain.width_m.toFixed(1)} x ${terrain.depth_m} m tile, simplified to ${SIMPLIFY_M} m and rounded to 0.1 m: ${drives.length} drives, ${lengthM} m. The rover's own path, not a route for walking.`,
        },
        drives,
      },
      images,
    },
    skipped,
  };
}

/** JSON with two-space indentation, but every [x, z] pair on one line. */
export function formatJson(value) {
  return `${JSON.stringify(value, null, 2).replace(/\[\s+(-?[\d.e+-]+),\s+(-?[\d.e+-]+)\s+\]/g, '[$1, $2]')}\n`;
}

async function readLayer(url, folder) {
  if (folder) return readJson(join(folder, url.split('/').pop()));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const at = process.argv.indexOf('--from');
  const folder = at > 0 ? process.argv[at + 1] : null;
  const [traverse, waypoints] = await Promise.all([readLayer(TRAVERSE_URL, folder), readLayer(WAYPOINTS_URL, folder)]);
  const { output, skipped } = buildTraverse({
    traverse,
    waypoints,
    meta: readJson(root('blender/data/jezero_cheyava_meta.json')),
    terrain: readJson(root('public/marswalk/assets/terrain.json')),
    stops: readJson(root('public/data/stops.json')).stops,
  });
  writeFileSync(root(OUT), formatJson(output));
  const t = output.traverse;
  console.log(`${OUT}: ${t.drives.length} drives, sols ${t.sols[0]} to ${t.sols[1]}, ${t.length_m} m; ${output.images.length} images placed`);
  for (const line of skipped) console.log(`  skipped ${line}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
