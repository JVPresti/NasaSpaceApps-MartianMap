/**
 * Science stops from `public/data/stops.json`: text, Perseverance images and
 * the sampling checklist for Bright Angel and Cheyava Falls (#37).
 *
 * Plan mode (#14, #17) looks a stop up by the selected waypoint with
 * `stopForWaypoint`. Walk mode (#61) calls `arrivedStop` with the player
 * position. The card that shows a stop is #66; the checklist ticks in #36.
 *
 * Positions are in the engine frame: x east, z south, metres from Cheyava
 * Falls. Distances are horizontal (x and z only).
 *
 * Plain JavaScript, no React and no three.js.
 */

/** Where the app serves the file, relative to the Vite base URL. */
export const STOPS_PATH = 'data/stops.json';

export const PROVENANCE_KEYS = [
  'mission',
  'instrument',
  'product_id',
  'site',
  'sol_or_date',
  'reference',
  'url',
  'locator',
  'data_url',
  'license',
  'note',
];

const TAGS = new Set(['DATA', 'DERIVED', 'SIM']);
const CHECKLIST = ['photo', 'texture', 'sample', 'seal'];

function checkProvenance(block, where) {
  const missing = PROVENANCE_KEYS.filter((k) => !block || !(k in block));
  if (missing.length > 0) throw new Error(`${where}: provenance lacks ${missing.join(', ')}`);
  for (const k of ['reference', 'license', 'note']) {
    if (!block[k]) throw new Error(`${where}: provenance ${k} must not be empty`);
  }
}

function checkTagged(entry, where) {
  if (!TAGS.has(entry?.tag)) throw new Error(`${where}: tag must be DATA, DERIVED or SIM`);
  if (entry.tag !== 'SIM') {
    const blocks = Array.isArray(entry.provenance) ? entry.provenance : [entry.provenance];
    if (blocks.some((b) => !b?.url)) throw new Error(`${where}: only SIM values may have a null url`);
  }
}

/**
 * Check the parsed file and return its stops.
 * @param {object} data parsed `stops.json`
 * @returns {Array<object>}
 */
export function parseStops(data) {
  if (!data || !Array.isArray(data.stops) || data.stops.length === 0) {
    throw new Error('stops.json needs a non-empty stops array');
  }
  const ids = new Set();
  for (const stop of data.stops) {
    const where = `stop ${String(stop?.id)}`;
    if (typeof stop.id !== 'string' || !stop.id || ids.has(stop.id)) throw new Error(`${where}: id must be a unique string`);
    ids.add(stop.id);
    if (typeof stop.name !== 'string' || typeof stop.waypoint !== 'string') throw new Error(`${where}: needs name and waypoint`);
    if (!Number.isFinite(stop.x) || !Number.isFinite(stop.z)) throw new Error(`${where}: needs finite x and z`);
    checkTagged(stop.position, `${where} position`);
    checkProvenance(stop.position.provenance, `${where} position`);
    const radius = stop.arrival_radius;
    if (!(radius?.value > 0) || radius.unit !== 'm') throw new Error(`${where}: arrival_radius must be a positive value in m`);
    checkProvenance(radius.provenance, `${where} arrival_radius`);

    if (!Array.isArray(stop.text) || stop.text.length < 2 || stop.text.length > 4) throw new Error(`${where}: text needs 2 to 4 sentences`);
    stop.text.forEach((s, i) => {
      if (typeof s.sentence !== 'string' || !s.sentence.trim()) throw new Error(`${where} sentence ${i}: empty`);
      if (!Array.isArray(s.provenance) || s.provenance.length === 0) throw new Error(`${where} sentence ${i}: needs provenance`);
      checkTagged(s, `${where} sentence ${i}`);
      s.provenance.forEach((b) => checkProvenance(b, `${where} sentence ${i}`));
    });

    if (!Array.isArray(stop.images) || stop.images.length === 0) throw new Error(`${where}: needs at least one image`);
    for (const image of stop.images) {
      const at = `${where} image ${String(image.image_id)}`;
      if (typeof image.file !== 'string' || !image.file.startsWith('images/')) throw new Error(`${at}: file must be under images/`);
      if (!image.credit || !image.image_id || !Number.isInteger(image.sol) || !image.camera || !image.original_url) {
        throw new Error(`${at}: needs credit, image_id, sol, camera and original_url`);
      }
      checkTagged(image, at);
      checkProvenance(image.provenance, at);
    }

    const steps = (stop.checklist ?? []).map((c) => c.id);
    if (steps.join() !== CHECKLIST.join()) throw new Error(`${where}: checklist must be ${CHECKLIST.join(', ')}`);
  }
  return data.stops;
}

/** @returns {object|null} */
export function stopById(stops, id) {
  return stops.find((s) => s.id === id) ?? null;
}

/**
 * The stop linked to a route waypoint, or null for a waypoint with no stop.
 * @param {Array<object>} stops
 * @param {string|{name: string}} waypoint a waypoint from route.json or its name
 */
export function stopForWaypoint(stops, waypoint) {
  const name = typeof waypoint === 'string' ? waypoint : waypoint?.name;
  return stops.find((s) => s.waypoint === name) ?? null;
}

/** Horizontal distance in metres from a position to a stop. */
export function distanceToStop(stop, position) {
  return Math.hypot(position.x - stop.x, position.z - stop.z);
}

/**
 * The closest stop to a position.
 * @returns {{stop: object, distanceM: number}|null} null for an empty list
 */
export function nearestStop(stops, position) {
  let best = null;
  for (const stop of stops) {
    const distanceM = distanceToStop(stop, position);
    if (!best || distanceM < best.distanceM) best = { stop, distanceM };
  }
  return best;
}

/** True when the position is within the stop's arrival radius (2 m for both stops). */
export function hasArrived(stop, position) {
  return distanceToStop(stop, position) <= stop.arrival_radius.value;
}

/** The stop the position has arrived at, or null. The nearest wins if radii overlap. */
export function arrivedStop(stops, position) {
  const near = nearestStop(stops, position);
  return near && hasArrived(near.stop, position) ? near.stop : null;
}

/**
 * URL for an image entry, for an <img src>.
 * @param {{file: string}} image
 * @param {string} [base] Vite base URL
 */
export function imageUrl(image, base = import.meta.env?.BASE_URL ?? '/') {
  return `${base}data/${image.file}`;
}

/**
 * Fetch and check `stops.json`.
 * @param {{fetch?: typeof fetch, base?: string, signal?: AbortSignal}} [options]
 * @returns {Promise<Array<object>>}
 */
export async function loadStops({ fetch: fetchImpl = globalThis.fetch, base = import.meta.env?.BASE_URL ?? '/', signal } = {}) {
  const response = await fetchImpl(base + STOPS_PATH, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`stops.json ${response.status}`);
  return parseStops(await response.json());
}
