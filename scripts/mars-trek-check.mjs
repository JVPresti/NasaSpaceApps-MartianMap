// Check our terrain layers against the DEM that NASA Mars Trek serves.
//
// Usage:
//   node scripts/mars-trek-check.mjs fetch     download the Trek DTM window (about 4 min)
//   node scripts/mars-trek-check.mjs           fetch if needed, then compare and write results
//   add --cache <dir> to keep the downloaded window somewhere other than the OS temp folder
//
// What it reads from Mars Trek (all public, no login):
//   1. The HiRISE Jezero DTM, "MRO HiRISE, Jezero DEM, Controlled"
//      (JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40),
//      through Trek's catalogue download stream. The file is a 1.84 GB uncompressed
//      GeoTIFF with one row per strip, and the server ignores HTTP range requests,
//      so the script streams it from the start and keeps only the rows around our tile.
//   2. The MOLA global DEM (463 m pixels) through Trek's ArcGIS ImageServer identify call.
//   3. Perseverance waypoints and traverse path through Trek's ArcGIS MapServer query.
//
// What it writes (docs/data/mars-trek-check/):
//   results.json, profile.csv, and the PNG maps listed in the README.
//
// The method and every number are explained in docs/data/mars-trek-check/README.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { decodeTerrain, heightAt, slopeAt } from '../src/sim/costGrid.js';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(root(path), 'utf8'));
const OUT_DIR = root('docs/data/mars-trek-check');

const args = process.argv.slice(2);
const cacheFlag = args.indexOf('--cache');
const CACHE_DIR = cacheFlag >= 0 ? args[cacheFlag + 1] : join(tmpdir(), 'mars-trek-check');
const command = args[0] === 'fetch' ? 'fetch' : 'compare';

// --- Mars Trek sources ------------------------------------------------------

const TREK = {
  dtmLabel: 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40',
  dtmStream: 'https://trek.nasa.gov/mars/TrekWS/rest/cat/data/stream?label=',
  arcgis: 'https://trek.nasa.gov/mars/trekarcgis/rest/services',
  molaService: 'mola128_mola64_merge_90Nto90S_SimpleC_clon0',
};

/** Sphere radius used by the DTM's projection (GeoTIFF GeogSemiMajorAxis). Metres. */
const MARS_RADIUS_M = 3396190;

/**
 * Tile origin: Cheyava Falls. Two published values exist in the repo:
 *  - blender/data/jezero_cheyava_meta.json (center_latlon, the Perseverance sol 1210
 *    waypoint from MMGIS, 8 decimals) together with the DTM pixel window the tile was cut from;
 *  - docs/marswalk-assets/README.md, the same waypoint rounded to 4 decimals.
 * The check uses the first and tests the second as an alternative frame.
 */
const cropMeta = readJson('blender/data/jezero_cheyava_meta.json');
const ORIGIN = { lat: cropMeta.center_latlon[0], lon: cropMeta.center_latlon[1] };
const README_ORIGIN = { lat: 18.4975, lon: 77.3053 };

/** Rows and columns of the Trek DTM kept around our tile. Wide enough for the shift search. */
const WINDOW = { row0: 9300, rows: 1800, col0: 3900, cols: 2000 };

// --- Fetch ------------------------------------------------------------------

const windowPath = () => join(CACHE_DIR, 'jez_dtm_window.f32');
const windowMetaPath = () => join(CACHE_DIR, 'jez_dtm_window.json');

/** Read the tags of the first TIFF directory from a buffer that holds it. */
function readTiffTags(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint16(0, true) !== 0x4949) throw new Error('expected a little-endian TIFF');
  // GDAL writes the image directory right after the header; the header pointer
  // goes to a copy at the end of the file, which we cannot reach without range requests.
  const ifd = 8;
  const count = view.getUint16(ifd, true);
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 };
  const tags = {};
  for (let i = 0; i < count; i += 1) {
    const at = ifd + 2 + 12 * i;
    const tag = view.getUint16(at, true);
    const type = view.getUint16(at + 2, true);
    const n = view.getUint32(at + 4, true);
    const bytes = size[type] * n;
    const off = bytes <= 4 ? at + 8 : view.getUint32(at + 8, true);
    if (off + bytes > buf.byteLength) return null;
    const read = (k) => {
      const p = off + k * size[type];
      if (type === 3) return view.getUint16(p, true);
      if (type === 4) return view.getUint32(p, true);
      if (type === 12) return view.getFloat64(p, true);
      if (type === 11) return view.getFloat32(p, true);
      return view.getUint8(p);
    };
    tags[tag] = type === 2
      ? new TextDecoder().decode(buf.subarray(off, off + n - 1))
      : Array.from({ length: n }, (_, k) => read(k));
  }
  return tags;
}

async function fetchWindow() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const url = TREK.dtmStream + TREK.dtmLabel;
  console.log(`Streaming ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Trek returned HTTP ${response.status}`);
  const reader = response.body.getReader();

  const out = new Uint8Array(WINDOW.rows * WINDOW.cols * 4);
  const rowLength = WINDOW.cols * 4;
  let head = new Uint8Array(0);
  let ranges = null; // byte range in the file of each window row
  let lastNeeded = Infinity;
  let pos = 0; // file offset of the first byte of the current chunk
  let nextReport = 0;
  const started = Date.now();

  while (pos < lastNeeded) {
    const { done, value } = await reader.read();
    if (done) throw new Error('stream ended before the window was complete');

    if (!ranges) {
      const merged = new Uint8Array(head.length + value.length);
      merged.set(head);
      merged.set(value, head.length);
      head = merged;
      const tags = head.length > 4096 ? readTiffTags(head) : null;
      if (tags) {
        if (tags[258][0] !== 32 || tags[339][0] !== 3 || tags[259][0] !== 1 || tags[278][0] !== 1) {
          throw new Error('expected uncompressed float32, one row per strip');
        }
        const offsets = tags[273];
        ranges = Array.from({ length: WINDOW.rows }, (_, r) => offsets[WINDOW.row0 + r] + WINDOW.col0 * 4);
        lastNeeded = ranges[WINDOW.rows - 1] + rowLength;
        writeFileSync(
          windowMetaPath(),
          JSON.stringify({
            source: url,
            fetched: new Date().toISOString(),
            width: tags[256][0],
            height: tags[257][0],
            pixelScale: tags[33550],
            tiepoint: tags[33922],
            geoKeys: tags[34735],
            geoDoubles: tags[34736],
            geoAscii: tags[34737],
            noData: tags[42113],
            window: WINDOW,
          }, null, 1),
        );
      }
    }

    const chunk = ranges && head ? head : value;
    const chunkStart = ranges && head ? 0 : pos;
    if (ranges) {
      const chunkEnd = chunkStart + chunk.length;
      for (let r = 0; r < WINDOW.rows; r += 1) {
        const rs = ranges[r];
        const re = rs + rowLength;
        if (re <= chunkStart || rs >= chunkEnd) continue;
        const from = Math.max(rs, chunkStart);
        const to = Math.min(re, chunkEnd);
        out.set(chunk.subarray(from - chunkStart, to - chunkStart), r * rowLength + (from - rs));
      }
      pos = chunkEnd;
      head = null;
    } else {
      pos = head.length;
    }
    if (pos >= nextReport) {
      const total = Number.isFinite(lastNeeded) ? (lastNeeded / 1048576).toFixed(0) : '?';
      console.log(`  ${(pos / 1048576).toFixed(0)} MB of ${total} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`);
      nextReport += 64 << 20;
    }
  }
  await reader.cancel();
  writeFileSync(windowPath(), out);
  console.log(`Saved ${WINDOW.rows} x ${WINDOW.cols} window to ${windowPath()}`);
}

if (command === 'fetch') {
  await fetchWindow();
  process.exit(0);
}

// --- Compare ----------------------------------------------------------------

if (!existsSync(windowPath())) await fetchWindow();
const meta = JSON.parse(readFileSync(windowMetaPath(), 'utf8'));
const rawWindow = readFileSync(windowPath());
const trekWindow = new Float32Array(rawWindow.buffer, rawWindow.byteOffset, rawWindow.byteLength / 4);

const terrainJson = readJson('public/marswalk/assets/terrain.json');
const routeJson = readJson('public/marswalk/assets/route.json');
const sheltersJson = readJson('public/data/shelters.json');
const grid = decodeTerrain(terrainJson);

const DEG = Math.PI / 180;
const M_PER_DEG = MARS_RADIUS_M * DEG;
const COS_LAT = Math.cos(ORIGIN.lat * DEG);
/** Projected (equirectangular, lat_ts = 0) coordinates of the origin. Metres. */
const ORIGIN_X = ORIGIN.lon * M_PER_DEG;
const ORIGIN_Y = ORIGIN.lat * M_PER_DEG;
const [, , , TIE_X, TIE_Y] = meta.tiepoint;
const PIXEL = meta.pixelScale[0];

/** Engine metres (x east, z south) to longitude and latitude in degrees. */
const toLonLat = (x, z) => ({
  lon: ORIGIN.lon + x / (COS_LAT * M_PER_DEG),
  lat: ORIGIN.lat - z / M_PER_DEG,
});
/** Longitude and latitude to engine metres. */
const toEngine = (lon, lat) => ({
  x: (lon - ORIGIN.lon) * COS_LAT * M_PER_DEG,
  z: -(lat - ORIGIN.lat) * M_PER_DEG,
});

/**
 * How the engine frame maps onto the DTM pixels. `asBuilt` is the frame the
 * README documents; the others are the mistakes this check looks for.
 */
const FRAMES = {
  asBuilt: { ewScale: 1 / COS_LAT, flipX: 1, flipZ: 1 },
  readmeOrigin: {
    ewScale: 1 / COS_LAT, flipX: 1, flipZ: 1,
    dX: (README_ORIGIN.lon - ORIGIN.lon) * M_PER_DEG,
    dY: (README_ORIGIN.lat - ORIGIN.lat) * M_PER_DEG,
  },
  noEastWestCorrection: { ewScale: 1, flipX: 1, flipZ: 1 },
  mirroredEastWest: { ewScale: 1 / COS_LAT, flipX: -1, flipZ: 1 },
  mirroredNorthSouth: { ewScale: 1 / COS_LAT, flipX: 1, flipZ: -1 },
};

/** Trek DTM elevation (m, MOLA areoid) at engine metres, bilinear. NaN outside the window or on no-data. */
function trekHeight(x, z, frame = FRAMES.asBuilt) {
  const px = ORIGIN_X + (frame.dX ?? 0) + frame.flipX * x * frame.ewScale;
  const py = ORIGIN_Y + (frame.dY ?? 0) - frame.flipZ * z;
  const fc = (px - TIE_X) / PIXEL - 0.5 - WINDOW.col0; // PixelIsArea: centre of pixel c is c + 0.5
  const fr = (TIE_Y - py) / PIXEL - 0.5 - WINDOW.row0;
  const c0 = Math.floor(fc);
  const r0 = Math.floor(fr);
  if (c0 < 0 || r0 < 0 || c0 + 1 >= WINDOW.cols || r0 + 1 >= WINDOW.rows) return NaN;
  const tx = fc - c0;
  const ty = fr - r0;
  const i = r0 * WINDOW.cols + c0;
  const a = trekWindow[i];
  const b = trekWindow[i + 1];
  const c = trekWindow[i + WINDOW.cols];
  const d = trekWindow[i + WINDOW.cols + 1];
  if (Math.min(a, b, c, d) < -1e30) return NaN;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

const ourHeight = (x, z) => grid.baseElevation + heightAt(grid, x, z);
const ourSlope = (x, z) => slopeAt(grid, x, z);

/** Same central difference as slopeAt in src/sim/costGrid.js, on the Trek DTM. */
function trekSlope(x, z, { naive = false } = {}) {
  const d = 2;
  // naive: treat a projected metre east-west as a true metre, the 5.4 % stretch
  const k = naive ? COS_LAT : 1;
  const gx = (trekHeight(x + d * k, z) - trekHeight(x - d * k, z)) / (2 * d);
  const gz = (trekHeight(x, z + d) - trekHeight(x, z - d)) / (2 * d);
  return Math.atan(Math.hypot(gx, gz)) / DEG;
}

/** Mean of a function over a disc, sampled on a 1 m lattice. */
function discMean(fn, x, z, radius) {
  let sum = 0;
  let count = 0;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dz * dz > radius * radius) continue;
      sum += fn(x + dx, z + dz);
      count += 1;
    }
  }
  return sum / count;
}

const stats = (values) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const mean = v.reduce((s, a) => s + a, 0) / v.length;
  const rms = Math.sqrt(v.reduce((s, a) => s + a * a, 0) / v.length);
  const sd = Math.sqrt(v.reduce((s, a) => s + (a - mean) ** 2, 0) / v.length);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, mean, sd, rms, min: v[0], p05: q(0.05), median: q(0.5), p95: q(0.95), max: v[v.length - 1] };
};
const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
const roundAll = (object, digits = 3) =>
  Object.fromEntries(Object.entries(object).map(([k, v]) => [k, typeof v === 'number' ? round(v, digits) : v]));

// --- 0. The team's source crop against the Trek file ------------------------

/** Read a little-endian float32 .npy file. */
function readNpy(path) {
  const buf = readFileSync(root(path));
  const headerLength = buf.readUInt16LE(8);
  const header = buf.toString('latin1', 10, 10 + headerLength);
  const shape = /'shape': \((\d+), (\d+)\)/.exec(header).slice(1).map(Number);
  if (!header.includes("'<f4'")) throw new Error(`${path} is not little-endian float32`);
  const body = buf.subarray(10 + headerLength);
  const copy = new Uint8Array(body);
  return { shape, data: new Float32Array(copy.buffer) };
}
const crop = readNpy('blender/data/jezero_cheyava_dtm_1m.npy');
const cropCheck = (() => {
  const { col0, row0, size } = cropMeta.pixel_window;
  let maxAbs = 0;
  let equal = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const a = crop.data[r * size + c];
      const b = trekWindow[(row0 - WINDOW.row0 + r) * WINDOW.cols + (col0 - WINDOW.col0 + c)];
      if (a === b) equal += 1;
      maxAbs = Math.max(maxAbs, Math.abs(a - b));
    }
  }
  return { file: 'blender/data/jezero_cheyava_dtm_1m.npy', shape: crop.shape, pixelWindow: cropMeta.pixel_window, identicalPixels: equal, totalPixels: size * size, maxAbsDiffM: maxAbs };
})();
console.log('Crop check', cropCheck);

// --- 1. Whole-tile height comparison and frame hypotheses -------------------

const nodes = [];
for (let r = 0; r < grid.n; r += 1) {
  for (let c = 0; c < grid.n; c += 1) {
    nodes.push({
      x: (c / (grid.n - 1) - 0.5) * grid.width,
      z: (r / (grid.n - 1) - 0.5) * grid.depth,
      h: grid.baseElevation + grid.heights[r * grid.n + c],
    });
  }
}
const sparse = nodes.filter((_, i) => i % 7 === 0);

/** Residual RMS (after the mean offset) of ours against Trek, with the Trek grid shifted by (dx, dz). */
function residual(frame, dx, dz, set = sparse) {
  const diffs = set.map((p) => p.h - trekHeight(p.x + dx, p.z + dz, frame));
  return { ...stats(diffs), dx, dz };
}

/** Find the shift that best lines the Trek DTM up with our grid. Coarse 1 m search, then 0.1 m. */
function bestShift(frame) {
  let best = residual(frame, 0, 0);
  for (let dz = -15; dz <= 15; dz += 1) {
    for (let dx = -15; dx <= 15; dx += 1) {
      const r = residual(frame, dx, dz);
      if (r.sd < best.sd) best = r;
    }
  }
  const [cx, cz] = [best.dx, best.dz];
  for (let dz = cz - 1; dz <= cz + 1 + 1e-9; dz += 0.1) {
    for (let dx = cx - 1; dx <= cx + 1 + 1e-9; dx += 0.1) {
      const r = residual(frame, dx, dz);
      if (r.sd < best.sd) best = r;
    }
  }
  return best;
}

console.log('Comparing the whole tile...');
const tileDiff = stats(nodes.map((p) => p.h - trekHeight(p.x, p.z)));
const frames = Object.fromEntries(
  Object.entries(FRAMES).map(([name, frame]) => {
    const zero = residual(frame, 0, 0);
    const shift = bestShift(frame);
    return [name, {
      atZeroShift: { meanOffsetM: round(zero.mean, 3), residualSdM: round(zero.sd, 3) },
      bestShift: { dxM: round(shift.dx, 1), dzM: round(shift.dz, 1), meanOffsetM: round(shift.mean, 3), residualSdM: round(shift.sd, 3) },
    }];
  }),
);

// --- 2. Slope classes over the tile -------------------------------------------

const slopeClass = (s) => (s > 25 ? 2 : s > 15 ? 1 : 0);
const confusion = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const slopeDiffs = [];
const naiveDiffs = [];
const ourClasses = new Uint8Array(nodes.length);
const trekClasses = new Uint8Array(nodes.length);
const margin = 4;
nodes.forEach((p, i) => {
  if (Math.abs(p.x) > grid.width / 2 - margin || Math.abs(p.z) > grid.depth / 2 - margin) {
    ourClasses[i] = 255;
    trekClasses[i] = 255;
    return;
  }
  const ours = ourSlope(p.x, p.z);
  const trek = trekSlope(p.x, p.z);
  ourClasses[i] = slopeClass(ours);
  trekClasses[i] = slopeClass(trek);
  confusion[ourClasses[i]][trekClasses[i]] += 1;
  slopeDiffs.push(ours - trek);
  if (i % 7 === 0) naiveDiffs.push(ours - trekSlope(p.x, p.z, { naive: true }));
});
const classTotal = confusion.flat().reduce((s, a) => s + a, 0);
const classAgree = confusion[0][0] + confusion[1][1] + confusion[2][2];

// --- 3. Mars Trek MOLA and rover data -------------------------------------------

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

const molaUrl = (lon, lat) =>
  `${TREK.arcgis}/${TREK.molaService}/ImageServer/identify?geometry=${encodeURIComponent(JSON.stringify({ x: lon, y: lat }))}` +
  '&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json';
async function molaAt(lon, lat) {
  const result = await getJson(molaUrl(lon, lat));
  return Number(result.value);
}

const lonLatEnvelope = (() => {
  const a = toLonLat(-grid.width / 2, grid.depth / 2);
  const b = toLonLat(grid.width / 2, -grid.depth / 2);
  return { xmin: a.lon, ymin: a.lat, xmax: b.lon, ymax: b.lat };
})();
const inTile = ({ x, z }) => Math.abs(x) < grid.width / 2 - margin && Math.abs(z) < grid.depth / 2 - margin;

const traverseUrl =
  `${TREK.arcgis}/Perseverance_Traverse_Path/MapServer/0/query?where=1%3D1` +
  `&geometry=${encodeURIComponent(JSON.stringify(lonLatEnvelope))}&geometryType=esriGeometryEnvelope&inSR=104905` +
  '&outFields=sol,fromRMC,toRMC&returnGeometry=true&returnZ=true&f=json';
const MMGIS_WAYPOINTS = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';

console.log('Querying Trek traverse path and MMGIS waypoints...');
const traverse = await getJson(traverseUrl);
const traverseVertices = [];
for (const feature of traverse.features) {
  for (const [lon, lat, zValue] of feature.geometry.paths.flat()) {
    const p = toEngine(lon, lat);
    if (zValue && inTile(p)) traverseVertices.push({ sol: feature.attributes.sol, ...p, rover: zValue });
  }
}
const waypointsJson = await getJson(MMGIS_WAYPOINTS);
const waypoints = waypointsJson.features
  .map((f) => f.properties)
  .map((p) => ({ sol: p.sol, rmc: p.RMC, note: p.Note, lon: p.lon, lat: p.lat, rover: p.elev_geoid, ...toEngine(p.lon, p.lat) }))
  .filter((p) => inTile(p) && p.rover > -9000);

const roverCompare = (list) => ({
  oursMinusRover: roundAll(stats(list.map((p) => ourHeight(p.x, p.z) - p.rover))),
  trekMinusRover: roundAll(stats(list.map((p) => trekHeight(p.x, p.z) - p.rover))),
});

/** Mean of the Trek DTM over the MOLA 128 pixel-per-degree cell that holds (lon, lat). */
function molaCellHiriseMean(lon, lat, ppd = 128) {
  const l0 = Math.floor(lon * ppd) / ppd;
  const b0 = Math.floor(lat * ppd) / ppd;
  const c0 = Math.max(0, Math.floor((l0 * M_PER_DEG - TIE_X) / PIXEL) - WINDOW.col0);
  const c1 = Math.min(WINDOW.cols, Math.floor(((l0 + 1 / ppd) * M_PER_DEG - TIE_X) / PIXEL) - WINDOW.col0);
  const r0 = Math.max(0, Math.floor((TIE_Y - (b0 + 1 / ppd) * M_PER_DEG) / PIXEL) - WINDOW.row0);
  const r1 = Math.min(WINDOW.rows, Math.floor((TIE_Y - b0 * M_PER_DEG) / PIXEL) - WINDOW.row0);
  let sum = 0;
  let count = 0;
  for (let r = r0; r < r1; r += 1) {
    for (let c = c0; c < c1; c += 1) {
      const v = trekWindow[r * WINDOW.cols + c];
      if (v > -1e30) {
        sum += v;
        count += 1;
      }
    }
  }
  return { meanM: sum / count, coveredPct: (100 * count) / (((l0 + 1 / ppd - l0) * M_PER_DEG / PIXEL) * ((1 / ppd) * M_PER_DEG / PIXEL)) };
}

// --- 4. Spot points ---------------------------------------------------------

const hab = sheltersJson.shelters.find((s) => s.id === 'HAB');
const wp1 = routeJson.waypoints.find((w) => w.name.startsWith('WP1'));
const SPOTS = [
  { id: 'cheyava', name: 'Cheyava Falls (tile origin)', x: 0, z: 0 },
  { id: 'steep', name: 'Steep spot from the asset README', x: -201, z: -52 },
  { id: 'channel', name: 'WP1, channel floor', x: wp1.x, z: wp1.z },
  { id: 'habitat', name: 'Habitat airlock (shelters.json HAB)', x: hab.x, z: hab.z },
];

console.log('Spot points and MOLA...');
const spots = [];
for (const spot of SPOTS) {
  const { lon, lat } = toLonLat(spot.x, spot.z);
  const nearest = waypoints
    .map((w) => ({ ...w, d: Math.hypot(w.x - spot.x, w.z - spot.z) }))
    .sort((a, b) => a.d - b.d)[0];
  spots.push({
    ...spot,
    lon: round(lon, 6),
    lat: round(lat, 6),
    ours: { elevationM: round(ourHeight(spot.x, spot.z)), slopeDeg: round(ourSlope(spot.x, spot.z), 1), slopeMean10mDeg: round(discMean(ourSlope, spot.x, spot.z, 10), 1) },
    trek: { elevationM: round(trekHeight(spot.x, spot.z)), slopeDeg: round(trekSlope(spot.x, spot.z), 1), slopeMean10mDeg: round(discMean(trekSlope, spot.x, spot.z, 10), 1) },
    diff: {
      elevationM: round(ourHeight(spot.x, spot.z) - trekHeight(spot.x, spot.z), 3),
      slopeDeg: round(ourSlope(spot.x, spot.z) - trekSlope(spot.x, spot.z), 1),
    },
    trekMolaM: await molaAt(lon, lat),
    hiriseMeanOverMolaCell: roundAll(molaCellHiriseMean(lon, lat), 2),
    molaUrl: molaUrl(lon, lat),
    nearestRover: nearest && nearest.d < 30
      ? { sol: nearest.sol, rmc: nearest.rmc, distanceM: round(nearest.d, 1), elevationM: round(nearest.rover), oursThereM: round(ourHeight(nearest.x, nearest.z)) }
      : null,
  });
}

// --- 5. Profile along the placeholder route ---------------------------------

const routeLine = routeJson.waypoints.map((w) => ({ name: w.name, x: w.x, z: w.z }));
const profile = [];
let along = 0;
for (let i = 0; i + 1 < routeLine.length; i += 1) {
  const a = routeLine[i];
  const b = routeLine[i + 1];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  for (let s = 0; s < length; s += 2) {
    const x = a.x + ((b.x - a.x) * s) / length;
    const z = a.z + ((b.z - a.z) * s) / length;
    profile.push({ d: along + s, x, z, ours: ourHeight(x, z), trek: trekHeight(x, z), ourSlope: ourSlope(x, z), trekSlope: trekSlope(x, z) });
  }
  along += length;
}
const last = routeLine[routeLine.length - 1];
profile.push({ d: along, x: last.x, z: last.z, ours: ourHeight(last.x, last.z), trek: trekHeight(last.x, last.z), ourSlope: ourSlope(last.x, last.z), trekSlope: trekSlope(last.x, last.z) });
const molaProfile = [];
for (let d = 0; d <= along; d += 100) {
  const p = profile.reduce((best, q) => (Math.abs(q.d - d) < Math.abs(best.d - d) ? q : best));
  const { lon, lat } = toLonLat(p.x, p.z);
  const mola = await molaAt(lon, lat);
  molaProfile.push({ d: p.d, mola, trek: p.trek, molaMinusTrek: mola - p.trek });
}

// --- Write results ----------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
const results = {
  generated: new Date().toISOString(),
  generatedBy: 'node scripts/mars-trek-check.mjs',
  sources: {
    trekDtm: { label: TREK.dtmLabel, url: meta.source, fetched: meta.fetched, size: [meta.width, meta.height], pixelM: PIXEL, tiepoint: meta.tiepoint, window: WINDOW },
    trekMola: `${TREK.arcgis}/${TREK.molaService}/ImageServer`,
    trekTraverse: traverseUrl,
    mmgisWaypoints: MMGIS_WAYPOINTS,
  },
  origin: { ...ORIGIN, source: 'blender/data/jezero_cheyava_meta.json center_latlon', readmeOrigin: README_ORIGIN,
    readmeMinusMetaM: { east: round((README_ORIGIN.lon - ORIGIN.lon) * M_PER_DEG * COS_LAT, 2), north: round((README_ORIGIN.lat - ORIGIN.lat) * M_PER_DEG, 2) },
    cropWindowCentre: { dtmColumn: cropMeta.pixel_window.col0 + cropMeta.pixel_window.size / 2, dtmRow: cropMeta.pixel_window.row0 + cropMeta.pixel_window.size / 2 },
    projectedX: round(ORIGIN_X, 1), projectedY: round(ORIGIN_Y, 1), dtmColumn: round((ORIGIN_X - TIE_X) / PIXEL, 1), dtmRow: round((TIE_Y - ORIGIN_Y) / PIXEL, 1) },
  crop: cropCheck,
  tile: { oursMinusTrekM: roundAll(tileDiff), frames },
  slope: {
    oursMinusTrekDeg: roundAll(stats(slopeDiffs), 2),
    oursMinusTrekWithoutEastWestCorrectionDeg: roundAll(stats(naiveDiffs), 2),
    classes: ['0-15 deg', '15-25 deg', 'over 25 deg'],
    confusionOursRowsTrekColumns: confusion,
    agreementPct: round((100 * classAgree) / classTotal, 2),
  },
  spots,
  rover: {
    trekTraverseVertices: { n: traverseVertices.length, sols: [Math.min(...traverseVertices.map((v) => v.sol)), Math.max(...traverseVertices.map((v) => v.sol))], skippedZeroZSols: [...new Set(traverse.features.filter((f) => f.geometry.paths.flat().some((v) => !v[2])).map((f) => f.attributes.sol))], ...roverCompare(traverseVertices) },
    mmgisWaypoints: { n: waypoints.length, sols: [Math.min(...waypoints.map((v) => v.sol)), Math.max(...waypoints.map((v) => v.sol))], ...roverCompare(waypoints) },
  },
  profile: {
    route: routeLine.map((w) => w.name),
    lengthM: round(along, 1),
    oursMinusTrekM: roundAll(stats(profile.map((p) => p.ours - p.trek))),
    oursMinusTrekSlopeDeg: roundAll(stats(profile.map((p) => p.ourSlope - p.trekSlope)), 2),
    mola: molaProfile.map((m) => ({ d: round(m.d, 0), mola: m.mola, trek: round(m.trek), molaMinusTrek: round(m.molaMinusTrek, 1) })),
  },
};
writeFileSync(join(OUT_DIR, 'results.json'), `${JSON.stringify(results, null, 1)}\n`);
writeFileSync(
  join(OUT_DIR, 'profile.csv'),
  'distance_m,x_m,z_m,ours_elev_m,trek_elev_m,diff_m,ours_slope_deg,trek_slope_deg\n' +
    profile
      .filter((_, i) => i % 5 === 0 || i === profile.length - 1)
      .map((p) => [p.d, p.x, p.z, p.ours, p.trek, p.ours - p.trek, p.ourSlope, p.trekSlope].map((v, k) => v.toFixed(k < 3 ? 1 : k < 6 ? 2 : 1)).join(','))
      .join('\n') + '\n',
);

// --- Pictures ---------------------------------------------------------------

/** Minimal PNG encoder (8-bit RGB). */
function png(width, height, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const n = grid.n;
const gap = 12;
const shade = (i) => {
  // simple hillshade from our grid, light from the north-west
  const c = i % n;
  const r = Math.floor(i / n);
  const h = (cc, rr) => grid.heights[Math.min(n - 1, Math.max(0, rr)) * n + Math.min(n - 1, Math.max(0, cc))];
  const gx = (h(c + 1, r) - h(c - 1, r)) / 4;
  const gz = (h(c, r + 1) - h(c, r - 1)) / 4;
  return Math.max(0, Math.min(1, 0.6 + 0.9 * (-gx - gz) / Math.SQRT2 / Math.hypot(1, gx, gz)));
};
const CLASS_RGB = [null, [242, 153, 26], [230, 20, 13]];
{
  // ours | Trek | where the class differs
  const width = n * 3 + gap * 2;
  const rgb = Buffer.alloc(width * n * 3, 255);
  for (let i = 0; i < n * n; i += 1) {
    const r = Math.floor(i / n);
    const c = i % n;
    const g = 70 + 150 * shade(i);
    const panels = [ourClasses[i], trekClasses[i], ourClasses[i] === trekClasses[i] ? 254 : 253];
    panels.forEach((cls, k) => {
      let col = [g, g, g];
      if (cls === 1 || cls === 2) col = CLASS_RGB[cls].map((v) => v * 0.65 + g * 0.35);
      if (cls === 253) col = [200, 0, 160];
      if (cls === 254) col = [g * 0.5 + 100, g * 0.5 + 100, g * 0.5 + 100];
      const at = (r * width + k * (n + gap) + c) * 3;
      rgb[at] = col[0];
      rgb[at + 1] = col[1];
      rgb[at + 2] = col[2];
    });
  }
  writeFileSync(join(OUT_DIR, 'slope-classes-ours-trek-diff.png'), png(width, n, rgb));
}
{
  // elevation difference, blue = ours lower, red = ours higher, full colour at 0.25 m
  const rgb = Buffer.alloc(n * n * 3);
  for (let i = 0; i < n * n; i += 1) {
    const d = nodes[i].h - trekHeight(nodes[i].x, nodes[i].z);
    const t = Number.isFinite(d) ? Math.max(-1, Math.min(1, d / 0.25)) : 0;
    const g = 255 * (1 - Math.abs(t));
    rgb[i * 3] = t > 0 ? 255 : g;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = t < 0 ? 255 : g;
  }
  writeFileSync(join(OUT_DIR, 'elevation-diff.png'), png(n, n, rgb));
}
{
  // profile chart as SVG: elevation on top, ours minus Trek below
  const W = 900;
  const pad = { l: 64, r: 16 };
  const top = { y: 16, h: 280 };
  const bottom = { y: 330, h: 110 };
  const H = 520;
  const all = profile.flatMap((p) => [p.ours, p.trek]).concat(molaProfile.map((m) => m.mola));
  const lo = Math.floor(Math.min(...all) / 10) * 10;
  const hi = Math.ceil(Math.max(...all) / 10) * 10;
  const dMax = 1;
  const sx = (d) => pad.l + (d / along) * (W - pad.l - pad.r);
  const sy = (e) => top.y + ((hi - e) / (hi - lo)) * top.h;
  const sd = (v) => bottom.y + ((dMax - Math.max(-dMax, Math.min(dMax, v))) / (2 * dMax)) * bottom.h;
  const path = (fy) => profile.map((p, i) => `${i ? 'L' : 'M'}${sx(p.d).toFixed(1)},${fy(p).toFixed(1)}`).join('');
  const parts = [];
  for (let e = lo; e <= hi; e += 10) parts.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(e)}" y2="${sy(e)}" style="stroke:#ddd"/><text x="${pad.l - 6}" y="${sy(e) + 4}" text-anchor="end">${e}</text>`);
  for (const v of [-1, -0.5, 0, 0.5, 1]) parts.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${sd(v)}" y2="${sd(v)}" style="stroke:${v ? '#ddd' : '#999'}"/><text x="${pad.l - 6}" y="${sd(v) + 4}" text-anchor="end">${v}</text>`);
  for (let d = 0; d <= along; d += 100) parts.push(`<text x="${sx(d)}" y="${bottom.y + bottom.h + 16}" text-anchor="middle">${d}</text>`);
  let walked = 0;
  routeLine.forEach((w, i) => {
    if (i) walked += Math.hypot(w.x - routeLine[i - 1].x, w.z - routeLine[i - 1].z);
    parts.push(`<line x1="${sx(walked)}" x2="${sx(walked)}" y1="${top.y}" y2="${bottom.y + bottom.h}" style="stroke:#bbb;stroke-dasharray:3 3"/><text x="${sx(walked) + (i === routeLine.length - 1 ? -3 : 3)}" y="${top.y + 12}" text-anchor="${i === routeLine.length - 1 ? 'end' : 'start'}">${w.name.split(' ')[0] === 'Cheyava' ? 'Cheyava Falls' : w.name.split(' ')[0]}</text>`);
  });
  parts.push(`<path d="${path((p) => sy(p.trek))}" style="fill:none;stroke:#e8590c;stroke-width:5;stroke-opacity:0.55"/>`);
  parts.push(`<path d="${path((p) => sy(p.ours))}" style="fill:none;stroke:#1c7ed6;stroke-width:1.5"/>`);
  parts.push(`<path d="${path((p) => sd(p.ours - p.trek))}" style="fill:none;stroke:#333;stroke-width:1.2"/>`);
  for (const m of molaProfile) parts.push(`<circle cx="${sx(m.d)}" cy="${sy(m.mola)}" r="3.5" style="fill:#888"/>`);
  const ly = H - 34;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="11">
<rect width="${W}" height="${H}" style="fill:#fff"/>
${parts.join('\n')}
<text transform="translate(14 ${top.y + top.h / 2}) rotate(-90)" text-anchor="middle">elevation, m (MOLA areoid)</text>
<text transform="translate(14 ${bottom.y + bottom.h / 2}) rotate(-90)" text-anchor="middle">ours - Trek, m</text>
<text x="${pad.l}" y="${bottom.y + bottom.h + 32}">distance along the placeholder route, m (HAB to Cheyava Falls)</text>
<g transform="translate(${pad.l} ${ly})">
<line x1="0" x2="24" y1="10" y2="10" style="stroke:#1c7ed6;stroke-width:1.5"/><text x="30" y="14">ours (terrain.json)</text>
<line x1="160" x2="184" y1="10" y2="10" style="stroke:#e8590c;stroke-width:5;stroke-opacity:0.55"/><text x="190" y="14">Mars Trek HiRISE Jezero DTM</text>
<circle cx="382" cy="10" r="3.5" style="fill:#888"/><text x="392" y="14">Mars Trek MOLA global DEM, 463 m pixels</text>
<line x1="630" x2="654" y1="10" y2="10" style="stroke:#333;stroke-width:1.2"/><text x="660" y="14">ours - Trek (lower panel)</text>
</g>
</svg>
`;
  writeFileSync(join(OUT_DIR, 'profile.svg'), svg);
}

console.log(JSON.stringify({ tile: results.tile, slope: results.slope, spots: results.spots, rover: results.rover, profile: results.profile }, null, 1));
