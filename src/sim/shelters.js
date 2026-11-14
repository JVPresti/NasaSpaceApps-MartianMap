/**
 * Shelter list from `public/data/shelters.json`.
 *
 * The file holds the habitat and the natural safe points with their
 * provenance. This module turns it into the `{id, name, x, z}` list that
 * `replanToNearestShelter` in `replan.js` takes, filtered by event.
 *
 * Full shelters (the habitat) come first. Partial ones (terrain that hides
 * part of the sky) only lower the dose, so `replanForEvent` tries them only
 * when no full shelter can be reached. Choosing between them by dose, time and
 * distance is issue #23.
 *
 * Plain JavaScript, no React and no three.js.
 */

import { replanToNearestShelter } from './replan.js';

/** Where the app serves the file, relative to the Vite base URL. */
export const SHELTERS_PATH = 'data/shelters.json';

const PROVENANCE_KEYS = [
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

/**
 * Check the parsed file and return its shelter entries.
 * @param {object} data parsed `shelters.json`
 * @returns {Array<object>}
 */
export function parseShelters(data) {
  if (!data || !Array.isArray(data.shelters) || data.shelters.length === 0) {
    throw new Error('shelters.json needs a non-empty shelters array');
  }
  if (data.shelters[0].id !== 'HAB') {
    throw new Error('shelters.json must list HAB first');
  }
  const ids = new Set();
  for (const shelter of data.shelters) {
    if (typeof shelter.id !== 'string' || ids.has(shelter.id)) {
      throw new Error(`shelter id must be a unique string, got ${String(shelter.id)}`);
    }
    ids.add(shelter.id);
    if (!Number.isFinite(shelter.x) || !Number.isFinite(shelter.z)) {
      throw new Error(`shelter ${shelter.id} needs finite x and z`);
    }
    if (!Array.isArray(shelter.events) || shelter.events.length === 0) {
      throw new Error(`shelter ${shelter.id} needs a list of events`);
    }
    if (shelter.protection !== 'full' && shelter.protection !== 'partial') {
      throw new Error(`shelter ${shelter.id} protection must be full or partial`);
    }
    for (const [key, value] of Object.entries(shelter.values ?? {})) {
      const missing = PROVENANCE_KEYS.filter((k) => !(k in (value.provenance ?? {})));
      if (!value.tag || !value.unit || missing.length > 0) {
        throw new Error(`shelter ${shelter.id} value ${key} lacks tag, unit or provenance (${missing.join(', ')})`);
      }
    }
  }
  return data.shelters;
}

function toPlannerShelter(shelter) {
  return { id: shelter.id, name: shelter.name, x: shelter.x, z: shelter.z };
}

/**
 * Shelters valid for one event, in the shape `replanToNearestShelter` takes.
 * @param {object} data parsed `shelters.json`
 * @param {string} eventId `radiation`, `dust_storm` or `low_oxygen`
 * @param {{protection?: 'full'|'partial'|'any', target?: 'nearestShelter'|'habitat'}} [options]
 *   `target: 'habitat'` matches the event engine's planner target and returns HAB only.
 * @returns {Array<{id: string, name: string, x: number, z: number}>}
 */
export function sheltersForEvent(data, eventId, options = {}) {
  const shelters = parseShelters(data);
  if (options.target === 'habitat') return [toPlannerShelter(shelters[0])];
  const protection = options.protection ?? 'any';
  return shelters
    .filter((s) => s.events.includes(eventId))
    .filter((s) => protection === 'any' || s.protection === protection)
    .map(toPlannerShelter);
}

/**
 * Re-plan to the cheapest full shelter for the event, or to the cheapest
 * partial one when no full shelter can be reached.
 * @param {object} grid cost grid from `buildCostGrid`
 * @param {{x: number, z: number}} from current position
 * @param {object} data parsed `shelters.json`
 * @param {string} eventId
 * @param {object} [options] passed to `replanToNearestShelter`
 * @returns {object} result of `replanToNearestShelter`, plus `protection`
 */
export function replanForEvent(grid, from, data, eventId, options = {}) {
  const full = sheltersForEvent(data, eventId, { protection: 'full' });
  if (full.length > 0) {
    const result = replanToNearestShelter(grid, from, full, options);
    if (result.ok) return { ...result, protection: 'full' };
  }
  const partial = sheltersForEvent(data, eventId, { protection: 'partial' });
  if (partial.length === 0) {
    return { ...replanToNearestShelter(grid, from, full, options), protection: 'full' };
  }
  return { ...replanToNearestShelter(grid, from, partial, options), protection: 'partial' };
}
