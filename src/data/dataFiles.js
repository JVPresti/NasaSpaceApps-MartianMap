// One request per data file per page (#205). Production serves every file with
// `cache-control: max-age=0, must-revalidate`, so two modules that fetch the same URL
// in parallel download it twice. Every runtime JSON fetch goes through loadJsonUrl,
// which keeps one promise per URL. Callers share the parsed object and must not mutate it.
//
// Plain JavaScript, no React and no three.js.
import { buildCostGrid } from '../sim/costGrid.js';

export const TERRAIN_PATH = 'marswalk/assets/terrain.json';
export const ROUTE_PATH = 'marswalk/assets/route.json';

const requests = new Map();
let costGrid = null;

function absolute(url) {
  try {
    return new URL(url, globalThis.location?.href ?? 'http://localhost/').href;
  } catch {
    return url;
  }
}

function fileName(url) {
  return url.split(/[?#]/)[0].split('/').pop();
}

function forgetOnFailure(map, key, request) {
  request.catch(() => {
    if (map.get(key) === request) map.delete(key);   // a failed load is retried by the next caller
  });
}

/**
 * Fetch and parse a JSON file once. Later calls with the same URL get the same promise.
 * Errors name the file: "hazards.json 404", "hazards.json: invalid JSON".
 * @param {string} url
 * @returns {Promise<any>}
 */
export function loadJsonUrl(url) {
  const key = absolute(url);
  let request = requests.get(key);
  if (request) return request;
  const name = fileName(url);
  let started;
  try {
    started = Promise.resolve(fetch(url));   // the request starts now, as a plain fetch would
  } catch (cause) {
    started = Promise.reject(cause);
  }
  request = started
    .then(async (response) => {
      if (!response.ok) throw new Error(`${name} ${response.status}`);
      try {
        return await response.json();
      } catch (cause) {
        throw new Error(`${name}: invalid JSON`, { cause });
      }
    });
  requests.set(key, request);
  forgetOnFailure(requests, key, request);
  return request;
}

/**
 * A JSON file under public/, by its path from there, such as 'data/hazards.json'.
 * @param {string} path
 * @param {string} [base] Vite base URL
 */
export function loadDataFile(path, base = import.meta.env?.BASE_URL ?? '/') {
  return loadJsonUrl(base + path);
}

/** The route planner's cost grid from terrain.json, decoded once and shared. Read-only: zones go on a clone. */
export function loadCostGrid() {
  if (costGrid) return costGrid;
  const request = loadDataFile(TERRAIN_PATH).then((terrainJson) => buildCostGrid(terrainJson));
  costGrid = request;
  request.catch(() => {
    if (costGrid === request) costGrid = null;
  });
  return request;
}

/** Forget every loaded file. For tests that stub fetch. */
export function resetDataFiles() {
  requests.clear();
  costGrid = null;
}
