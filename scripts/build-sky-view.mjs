// Build public/data/sky_view.json: the sky view factor of the terrain tile on a coarse grid, for the Exposure layer of
// the mission table and its route readout (src/sim/skyView.js skyViewAlongPath).
//
// Usage: npm run skyview
//
// The sky view of every node of the 751 x 751 height grid takes about 15 s in Node (src/sim/skyView.js), far too long
// for the interface, so this script computes it once, on every third node (6 m apart, 251 x 251 nodes, about 1.6 s),
// with the same rays as scripts/build-shelters.mjs, and stores one byte per node. It then checks 400 random nodes of
// the full grid against the exact value at that point and prints the error of the coarse grid read bilinearly.
//
// The method and its limits are in docs/route/shelters.md; why the layer exists is in docs/data/map-layers-decision.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeTerrain } from '../src/sim/costGrid.js';
import { computeSkyView, decodeSkyViewGrid, sampleSkyView, skyViewAt } from '../src/sim/skyView.js';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const terrain = decodeTerrain(JSON.parse(readFileSync(root('public/marswalk/assets/terrain.json'), 'utf8')));
// The full-grid range, measured by scripts/build-shelters.mjs on every node.
const fullStats = JSON.parse(readFileSync(root('public/data/shelters.json'), 'utf8')).sky_view.tile_stats;

/** Keep every third node: 751 = 3 x 250 + 1, so the last node is still the tile edge. */
const STRIDE = 3;
/** Random nodes of the full grid checked against the exact sky view, and the seed that picks them. */
const CHECKS = 400;
let seed = 20261114;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

const sky = computeSkyView(terrain, { stride: STRIDE });
console.log(`sky view: ${sky.n} x ${sky.n} nodes (every ${STRIDE}rd of ${terrain.n}), ${sky.options.azimuths} azimuths, ${Math.round(sky.elapsedMs)} ms`);

const sorted = Float32Array.from(sky.skyView).sort();
const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const stats = { min: quantile(0), p01: quantile(0.01), p50: quantile(0.5), p99: quantile(0.99), max: sorted[sorted.length - 1] };

// One byte per node over [floor(min, 0.01), 1]: about 0.0008 per step on this tile, far below the method's error.
const encoding = { type: 'u8', min: Math.floor(stats.min * 100) / 100, max: 1 };
const bytes = new Uint8Array(sky.skyView.length);
for (let k = 0; k < bytes.length; k += 1) {
  const t = (sky.skyView[k] - encoding.min) / (encoding.max - encoding.min);
  bytes[k] = Math.round(Math.max(0, Math.min(1, t)) * 255);
}

const output = {
  schema_version: 1,
  title: 'Marswalk sky view factor',
  description:
    'Fraction of the upper hemisphere a crouching astronaut sees at each node of a 6 m grid over the terrain tile: 1 on open flat ground, lower where ' +
    'the terrain hides part of the sky. Less sky means less dose in a solar particle event, though far less than in proportion (see the provenance note). ' +
    'Read by the Exposure layer of the mission table and its route readout (src/sim/skyView.js). Built by scripts/build-sky-view.mjs; do not edit by hand.',
  frame: 'Node (0, 0) is the north-west corner of the tile, the last node the south-east corner; rows run south. x east, z south, metres from Cheyava Falls.',
  n: sky.n,
  width_m: terrain.width,
  depth_m: terrain.depth,
  stride: STRIDE,
  source_n: terrain.n,
  method:
    `Ray cast on the ${terrain.n} x ${terrain.n} height grid, kept on every ${STRIDE}rd node: ${sky.options.azimuths} azimuths, rays to ${sky.options.maxDistanceM} m ` +
    `or the tile edge, dose point ${sky.options.observerHeightM} m above the ground. Visible fraction = mean over azimuths of (1 - sin(horizon elevation)), horizon clamped at 0. ` +
    'Same rays as public/data/shelters.json.',
  stats: Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, round(value, 3)])),
  encoding: { ...encoding, note: 'value = min + byte / 255 * (max - min)' },
  tag: 'DERIVED',
  label: 'HiRISE DTM · sky view',
  provenance: {
    mission: 'MRO',
    instrument: 'HiRISE',
    product_id: null,
    site: 'Jezero crater, Neretva Vallis, around Cheyava Falls',
    sol_or_date: null,
    reference:
      'Marswalk terrain tile public/marswalk/assets/terrain.json (751 x 751 heights, 2 m spacing, from the HiRISE 1 m DEM of Jezero crater); ' +
      'sky view computed by src/sim/skyView.js through scripts/build-sky-view.mjs',
    url: 'https://www.uahirise.org/dtm/',
    locator: 'docs/route/shelters.md, sections "Why the terrain helps at all" and "Limits of the estimate"',
    data_url: 'https://www.uahirise.org/dtm/',
    license: 'HiRISE products are NASA/JPL/University of Arizona, public with no restriction of use (NASA SPD-41A).',
    note:
      'The sky view is DERIVED geometry. Taking the dose on a route as its mean sky view times the open-ground dose assumes an isotropic SEP flux above the ' +
      'horizon, our assumption (SIM). The real flux is stronger toward the zenith, so hiding the low sky saves less: read 1 - sky view as an upper bound on ' +
      "the saving. The one measurement on Mars found a far smaller cut: Curiosity's RAD beside Butte M12, with 19 % of the sky blocked, measured about 4 % " +
      'less dose (Ehresmann et al. 2021, JGR Planets 126, doi 10.1029/2021JE006851). Rays stop at the tile edge, which raises the sky view ' +
      `near the edge. On this 6 m grid the values span only ${round(stats.min, 2)} to ${round(stats.max, 2)}; the full 2 m grid reaches ` +
      `${fullStats.min} at its lowest node (public/data/shelters.json, sky_view.tile_stats), so the terrain never hides more than about ` +
      `${Math.round((1 - fullStats.min) * 100)} % of the sky.`,
  },
  sky_view_u8_b64: Buffer.from(bytes).toString('base64'),
};

// Check the file as the app reads it, against the exact value at random nodes of the full grid.
const grid = decodeSkyViewGrid(output);
let sum = 0;
let worst = 0;
for (let k = 0; k < CHECKS; k += 1) {
  const i = Math.floor(random() * terrain.n);
  const j = Math.floor(random() * terrain.n);
  const x = (i / (terrain.n - 1) - 0.5) * terrain.width;
  const z = (j / (terrain.n - 1) - 0.5) * terrain.depth;
  const error = Math.abs(sampleSkyView(grid, x, z) - skyViewAt(terrain, x, z).skyView);
  sum += error;
  worst = Math.max(worst, error);
}
console.log(`tile: min ${stats.min.toFixed(3)}, 1 % ${stats.p01.toFixed(3)}, median ${stats.p50.toFixed(3)}, max ${stats.max.toFixed(3)}`);
console.log(`check at ${CHECKS} random nodes of the full grid: mean error ${(sum / CHECKS).toFixed(4)}, worst ${worst.toFixed(4)}`);

const path = root('public/data/sky_view.json');
writeFileSync(path, JSON.stringify(output, null, 2) + '\n');
console.log(`wrote ${path} (${Math.round(JSON.stringify(output).length / 1024)} KB)`);
