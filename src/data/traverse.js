// Perseverance's traverse across the tile (#249): public/data/traverse.json, built by scripts/build-traverse.mjs
// from the Mars 2020 MMGIS layers. The mission table map and the helmet minimap draw the drives; the photo pins
// mark where the rover stood for the Perseverance images on the stop cards.
//
// Plain JavaScript, no React and no three.js.
import { loadDataFile } from './dataFiles.js';

export const TRAVERSE_PATH = 'data/traverse.json';

/** Photos taken this close together share one pin: at map scale they are the same place. Metres. */
export const PHOTO_GROUP_M = 15;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const isPoint = (p) => Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1]);

/**
 * Check traverse.json and keep what the maps draw. Drives without two valid points and photos without a position
 * are left out rather than drawn wrong.
 * @param {object} json
 * @returns {{ drives: Array<{ sol: number, path: Array<[number, number]> }>,
 *   photos: Array<{ file: string, stop: string, sol: number, x: number, z: number, rover: { sol: number, rmc: string } }>,
 *   sols: [number, number] | null, tag: string, label: string, provenance: object | null }}
 */
export function parseTraverse(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.drives)) throw new Error('traverse.json: no drives');
  const drives = json.drives
    .map((d) => ({ sol: Number(d?.sol), path: Array.isArray(d?.path) ? d.path.filter(isPoint).map(([x, z]) => [x, z]) : [] }))
    .filter((d) => finite(d.sol) && d.path.length >= 2);
  const photos = (Array.isArray(json.photos) ? json.photos : [])
    .filter((p) => typeof p?.file === 'string' && finite(p.x) && finite(p.z) && finite(p.sol))
    .map((p) => ({ file: p.file, stop: p.stop ?? null, sol: p.sol, x: p.x, z: p.z, rover: { sol: p.rover?.sol ?? null, rmc: p.rover?.rmc ?? null } }));
  const sols = drives.length ? [Math.min(...drives.map((d) => d.sol)), Math.max(...drives.map((d) => d.sol))] : null;
  return { drives, photos, sols, tag: json.tag ?? 'DATA', label: json.label ?? 'Mars 2020 · rover traverse', provenance: json.provenance ?? null };
}

/**
 * Photos grouped by place: one pin per group, at the mean position, oldest sol first inside a group.
 * @param {Array<{ x: number, z: number, sol: number }>} photos
 * @param {number} [radiusM]
 * @returns {Array<{ x: number, z: number, photos: Array<object> }>}
 */
export function photoGroups(photos, radiusM = PHOTO_GROUP_M) {
  const groups = [];
  for (const photo of photos ?? []) {
    const near = groups.find((g) => Math.hypot(g.x - photo.x, g.z - photo.z) <= radiusM);
    if (near) {
      near.photos.push(photo);
      near.x = near.photos.reduce((s, p) => s + p.x, 0) / near.photos.length;
      near.z = near.photos.reduce((s, p) => s + p.z, 0) / near.photos.length;
    } else {
      groups.push({ x: photo.x, z: photo.z, photos: [photo] });
    }
  }
  for (const g of groups) g.photos.sort((a, b) => a.sol - b.sol);
  return groups;
}

let request = null;

/** traverse.json through the shared loader, parsed once per page. Rejects if the file is missing or broken. */
export function loadTraverse() {
  request ??= loadDataFile(TRAVERSE_PATH).then(parseTraverse);
  request.catch(() => { request = null; });
  return request;
}
