// Perseverance on the map (#249): the rover's drives across the tile and where it stood for each stop image, from
// public/data/traverse.json (built by scripts/build-traverse.mjs from the MMGIS layers of the Where is the rover map).
//
// Plain JavaScript, no React and no three.js.
import { loadDataFile } from './dataFiles.js';

export const TRAVERSE_PATH = 'data/traverse.json';

const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

/**
 * Check traverse.json and keep what the maps draw.
 * @returns {{ sols: [number, number], lengthM: number, drives: Array<{sol: number, points: Array<[number, number]>}>,
 *   images: Array<{stop: string, file: string, image_id: string, sol: number, camera: string, rmc: string, x: number,
 *   z: number, tag: string, provenance: object}> }}
 */
export function parseTraverse(data) {
  const t = data?.traverse;
  if (!t || !Array.isArray(t.drives) || t.drives.length === 0) throw new Error('traverse.json needs traverse.drives');
  t.drives.forEach((d, i) => {
    if (!Number.isInteger(d?.sol) || !Array.isArray(d.points) || d.points.length < 2 || !d.points.every(point)) {
      throw new Error(`traverse.json drive ${i}: needs a sol and at least two [x, z] points`);
    }
  });
  if (!Array.isArray(t.sols) || t.sols.length !== 2 || !t.sols.every(Number.isInteger)) throw new Error('traverse.json: sols must be [first, last]');
  const images = data.images ?? [];
  if (!Array.isArray(images)) throw new Error('traverse.json: images must be an array');
  images.forEach((image, i) => {
    if (typeof image?.file !== 'string' || !image.file.startsWith('images/') || !Number.isFinite(image.x) || !Number.isFinite(image.z)) {
      throw new Error(`traverse.json image ${i}: needs a file under images/ and finite x and z`);
    }
  });
  return { sols: t.sols, lengthM: t.length_m, drives: t.drives, images };
}

/** Fetch and check traverse.json through the shared loader, so every map shares one request. */
export async function loadTraverse(base) {
  return parseTraverse(await loadDataFile(TRAVERSE_PATH, base));
}

/**
 * One pin per place: images taken within `radiusM` of the first image of a group share its pin, at their mean
 * position. The three stop images were all taken within about a metre of each other, at Cheyava Falls.
 * @returns {Array<{ x: number, z: number, images: Array<object> }>}
 */
export function groupImages(images, radiusM = 5) {
  const groups = [];
  for (const image of images) {
    const near = groups.find((g) => Math.hypot(g.images[0].x - image.x, g.images[0].z - image.z) <= radiusM);
    if (near) near.images.push(image);
    else groups.push({ images: [image] });
  }
  return groups.map((g) => ({
    x: g.images.reduce((sum, i) => sum + i.x, 0) / g.images.length,
    z: g.images.reduce((sum, i) => sum + i.z, 0) / g.images.length,
    images: g.images.slice().sort((a, b) => a.sol - b.sol),
  }));
}
