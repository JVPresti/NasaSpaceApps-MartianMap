/**
 * Route profiles for the mission table (#245): the same planner and the same stops, priced three ways, so the crew
 * can compare the routes and pick one.
 *
 * - fastest: today's cost, distance x (1 + (slope / 9)^2 + 0.6 x rock), blocked over 20 degrees
 * - gentlest: the slope term cubed, so every degree over 9 costs more than it does today
 * - radio: today's cost, three times as dear where the habitat mast is out of sight
 *
 * The route barely moves on this site (track review, #242), so the profiles are a comparison, not an optimiser:
 * each is measured the same way, with the leg-cost code the route panel uses (src/sim/legCosts.js).
 *
 * Plain JavaScript with no React and no three.js: it runs in the planner worker and in tests.
 */
import { cellCost, COST_CONSTANTS, rockAbundanceAt, slopeAt, traverseMask } from './costGrid.js';
import { legCostSources, routeLegCosts } from './legCosts.js';
import { inRadioShadow, radioShadowAlongPath, radioShadowMask } from './radio.js';
import { explainRoute } from './routeExplain.js';
import { planRoute } from './routePlanner.js';

/**
 * The profiles in display order. The weights are our choice (SIM), tuned offline on the route.json stops: the
 * gentlest route walks 104 m on ground over 15 degrees against 151 m, and the radio route is out of contact for 29 %
 * of its length against 49 %, for 0.3 and 1.9 min more walking. A larger exponent or multiplier added hundreds of
 * metres for little more gain. The steepest point (19.8 degrees) and the shadow over the channel stops are the same
 * on every profile: the stops themselves sit there. Fastest keeps today's smoothing so the default route does not
 * change; the others smooth by cost so their straight lines do not cut back across what they priced.
 */
export const ROUTE_PROFILES = Object.freeze([
  Object.freeze({ id: 'fastest', weights: Object.freeze({}), shadowMultiplier: 1, smoothing: 'clear', needsMast: false }),
  Object.freeze({ id: 'gentlest', weights: Object.freeze({ slopeExponent: 3 }), shadowMultiplier: 1, smoothing: 'cost', needsMast: false }),
  Object.freeze({ id: 'radio', weights: Object.freeze({}), shadowMultiplier: 3, smoothing: 'cost', needsMast: true }),
]);

export const PROFILE_IDS = Object.freeze(ROUTE_PROFILES.map((profile) => profile.id));
export const DEFAULT_PROFILE = 'fastest';

/** Spacing of the slope samples along a route. Metres. */
export const SLOPE_SAMPLE_STEP_M = 1;

const finiteMast = (mast) => Boolean(mast) && Number.isFinite(mast.x) && Number.isFinite(mast.z);

/** Short key for a mast position, to cache what depends on it. */
export function mastKey(mast) {
  return finiteMast(mast) ? `${mast.x.toFixed(1)},${Number.isFinite(mast.y) ? mast.y.toFixed(1) : '-'},${mast.z.toFixed(1)}` : '';
}

/**
 * A copy of the grid with one profile's cost. Blocked cells, heights and slopes are shared with the base grid, so the
 * 20 degree limit is the same on every profile and every pricing.
 *
 * `pricing` is the crew's risk setting (src/sim/missionNeeds.js): its weights (slopePenaltyDeg, rockWeight) go under
 * the profile's own (the gentlest profile's slopeExponent), and ground Perseverance drove (`traverse`, a mask from
 * costGrid.traverseMask) costs traverseDiscount times as much as other ground. The discount is applied as a premium
 * of 1 / traverseDiscount on the other ground: A* (routePlanner.js) needs every multiplier to be at least 1, or its
 * distance heuristic overestimates and it misses the cheaper way along the rover's tracks.
 * @param {object} grid from buildCostGrid
 * @param {{ weights: object, shadowMultiplier: number }} profile
 * @param {object | null} [mask] radio shadow mask (radio.js), needed when shadowMultiplier is not 1
 * @param {{ weights?: object, traverseDiscount?: number, traverse?: object | null }} [pricing]
 * @returns {object}
 */
export function profileGrid(grid, profile, mask = null, pricing = {}) {
  const pricesShadow = profile.shadowMultiplier !== 1;
  if (pricesShadow && !mask) throw new Error(`profile ${profile.id} needs the radio shadow mask`);
  const discount = pricing.traverse && Number.isFinite(pricing.traverseDiscount) ? pricing.traverseDiscount : 1;
  const weights = { ...(pricing.weights ?? {}), ...profile.weights };
  if (!pricesShadow && discount === 1 && Object.keys(weights).length === 0) return grid;

  const { n, width, depth, slopes, blocked } = grid;
  const cells = discount !== 1 ? pricing.traverse.cells : null;
  const cost = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) {
    const z = (j / (n - 1) - 0.5) * depth;
    for (let i = 0; i < n; i += 1) {
      const index = j * n + i;
      if (blocked[index] === 1) {
        cost[index] = Infinity;
        continue;
      }
      const x = (i / (n - 1) - 0.5) * width;
      let multiplier = cellCost(slopes[index], rockAbundanceAt(grid, x, z), weights);
      if (pricesShadow && inRadioShadow(mask, x, z)) multiplier *= profile.shadowMultiplier;
      if (cells && cells[index] !== 1) multiplier /= discount;
      cost[index] = multiplier;
    }
  }
  // Profile grids are planned on, never zoned: the base copy shares the array (half the memory per grid).
  return { ...grid, cost, baseCost: cost };
}

/** Short key for the drives of traverse.json, to cache the mask built from them. Empty without drives. */
export function traverseKey(drives) {
  if (!Array.isArray(drives) || drives.length === 0) return '';
  let count = 0;
  for (const drive of drives) count += (Array.isArray(drive) ? drive : drive?.points ?? []).length;
  const first = drives[0], last = drives[drives.length - 1];
  const points = (d) => (Array.isArray(d) ? d : d?.points ?? []);
  return `${drives.length}:${count}:${points(first)[0]}:${points(last).at(-1)}`;
}

/** Results of planRoute kept per profile grid and waypoint list; old entries go first once there are this many. */
const ROUTE_CACHE_SIZE = 48;

const plannedKey = (waypoints) => waypoints.map((w) => `${w.name ?? ''}@${Math.round(w.x * 1000)},${Math.round(w.z * 1000)}`).join('|');

/**
 * The grid of one profile under one pricing, built once and kept in `cache`, with the radio mask and the traverse
 * mask it needs. Null for the radio profile without a mast.
 * @param {object} grid
 * @param {object} profile an entry of ROUTE_PROFILES
 * @param {{ mast?: object | null, pricing?: { id?: string, weights?: object, traverseDiscount?: number } | null,
 *   traverse?: Array<object> | null, cache?: Map<string, object> }} [options]
 * @returns {{ key: string, grid: object, mask: object | null, traverse: object | null, smoothing: 'clear' | 'cost' } | null}
 */
export function pricedProfileGrid(grid, profile, { mast = null, pricing = null, traverse = null, cache = new Map() } = {}) {
  const key = mastKey(mast);
  const maskKey = 'mask:' + key;
  if (key && !cache.has(maskKey)) cache.set(maskKey, radioShadowMask(grid, mast));
  const mask = key ? cache.get(maskKey) : null;
  if (profile.needsMast && !mask) return null;

  const discounts = Number.isFinite(pricing?.traverseDiscount) && pricing.traverseDiscount !== 1;
  const tKey = discounts ? traverseKey(traverse) : '';
  if (tKey && !cache.has('traverse:' + tKey)) cache.set('traverse:' + tKey, traverseMask(grid, traverse));
  const tMask = tKey ? cache.get('traverse:' + tKey) : null;

  const gridKey = `${profile.id}:${profile.shadowMultiplier !== 1 ? key : ''}:${pricing?.id ?? ''}:${tKey}`;
  if (!cache.has(gridKey)) cache.set(gridKey, profileGrid(grid, profile, mask, { weights: pricing?.weights, traverseDiscount: pricing?.traverseDiscount, traverse: tMask }));
  const priced = cache.get(gridKey);
  // A grid that prices more than today's cost is smoothed by cost, or the straight lines of smoothPath would cut back
  // across what it priced (#245). Only the fastest profile at today's weights keeps today's smoothing and route.
  const smoothing = priced === grid ? profile.smoothing : 'cost';
  return { key: gridKey, grid: priced, mask, traverse: tMask, smoothing };
}

/**
 * planRoute on a profile grid, kept in `cache` by grid and waypoints, so the needs planner (missionNeeds.js) and the
 * profile comparison do not search the same route twice.
 * @param {{ key: string, grid: object, smoothing: 'clear' | 'cost' }} priced from {@link pricedProfileGrid}
 * @param {Array<object>} waypoints the start first
 * @param {Map<string, object>} cache
 */
export function planOnProfile(priced, waypoints, cache) {
  const key = `route:${priced.key}:${priced.smoothing}:${plannedKey(waypoints)}`;
  if (cache.has(key)) return cache.get(key);
  const route = planRoute(priced.grid, waypoints, { smoothing: priced.smoothing });
  cache.set(key, route);
  const routes = [...cache.keys()].filter((k) => k.startsWith('route:'));
  if (routes.length > ROUTE_CACHE_SIZE) cache.delete(routes[0]);
  return route;
}

/**
 * The slope underfoot along a route, sampled every metre on the HiRISE height map (the slope layer's measure), so
 * a straight line between two path vertices is checked too.
 * @param {object} grid
 * @param {Array<[number, number]>} path
 * @param {number} [stepM]
 * @returns {{ steepestDeg: number, overCautionM: number }} overCautionM: metres on ground over the 15 degree caution
 */
export function slopeAlongPath(grid, path, stepM = SLOPE_SAMPLE_STEP_M) {
  let steepestDeg = 0;
  let overCautionM = 0;
  if (!Array.isArray(path) || path.length === 0) return { steepestDeg, overCautionM };
  steepestDeg = slopeAt(grid, path[0][0], path[0][1]);
  for (let k = 0; k < path.length - 1; k += 1) {
    const [ax, az] = path[k];
    const [bx, bz] = path[k + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(length / stepM));
    for (let s = 0; s < n; s += 1) {
      const mid = slopeAt(grid, ax + (bx - ax) * ((s + 0.5) / n), az + (bz - az) * ((s + 0.5) / n));
      const end = slopeAt(grid, ax + (bx - ax) * ((s + 1) / n), az + (bz - az) * ((s + 1) / n));
      steepestDeg = Math.max(steepestDeg, mid, end);
      if (mid > COST_CONSTANTS.SLOPE_CAUTION_DEG) overCautionM += length / n;
    }
  }
  return { steepestDeg, overCautionM };
}

/**
 * Plan the route for each profile. Runs in the planner worker; `cache` keeps the profile grids, the radio and traverse
 * masks and the recent routes between requests (the grid never changes, the mast only once).
 * @param {object} grid from buildCostGrid
 * @param {Array<{ x: number, z: number, name?: string }>} waypoints the start first
 * @param {{ mast?: { x: number, y?: number, z: number } | null, only?: string[] | null, cache?: Map<string, object>,
 *   pricing?: { id?: string, weights?: object, traverseDiscount?: number } | null, traverse?: Array<object> | null,
 *   constants?: object | null }} [options] pricing: the risk setting's weights (missionNeeds.js), the same for every
 *   profile; traverse: the drives of traverse.json for its discount; constants (suitConstantsFromHazards): the extra
 *   seconds in each leg's explanation
 * @returns {Record<string, object>} by profile id: planRoute's result plus steepestDeg, overCautionM, explain (one
 *   entry per leg, routeExplain.js) and, with a mast, shadowShare and longestShadowM; `{ ok: false, reason: 'no-mast' }`
 *   for the radio profile without a mast
 */
export function planProfiles(grid, waypoints, { mast = null, only = null, cache = new Map(), pricing = null, traverse = null, constants = null } = {}) {
  const key = mastKey(mast);
  const results = {};
  for (const profile of ROUTE_PROFILES) {
    if (only && !only.includes(profile.id)) continue;
    const priced = pricedProfileGrid(grid, profile, { mast, pricing, traverse, cache });
    if (!priced) {
      results[profile.id] = { ok: false, reason: 'no-mast' };
      continue;
    }
    const route = planOnProfile(priced, waypoints, cache);
    if (!route.ok) {
      results[profile.id] = { ok: false, reason: route.reason, failedSegment: route.failedSegment };
      continue;
    }
    // Measured on the base grid: the heights are the same, and the cost a profile was planned on is not a metric.
    const slope = slopeAlongPath(grid, route.path);
    const radio = key ? radioShadowAlongPath(grid, route.path, mast) : null;
    const explain = explainRoute(grid, route.path, waypoints, {
      constants,
      weights: { ...(pricing?.weights ?? {}), ...profile.weights },
      shadowMask: priced.mask,
      shadowMultiplier: profile.shadowMultiplier,
      traverseMask: priced.traverse,
      traverseDiscount: priced.traverse ? pricing?.traverseDiscount ?? 1 : 1,
    });
    results[profile.id] = {
      ...route,
      steepestDeg: slope.steepestDeg,
      overCautionM: slope.overCautionM,
      shadowShare: radio ? radio.share : null,
      longestShadowM: radio ? radio.longestM : null,
      explain,
    };
  }
  return results;
}

/**
 * What the table shows and stores for each profile: the planner's numbers plus the walk-out time, oxygen and
 * battery from routeLegCosts, the same code that fills route.legs and route.totals.
 * @param {Record<string, object>} planned from planProfiles
 * @param {Array<{ x: number, z: number, name?: string }>} waypoints the start first
 * @param {(x: number, z: number) => number} heightAt
 * @param {object} constants from suitConstantsFromHazards
 * @param {{ o2StartG?: number, batteryStartWh?: number }} [start] O2 and battery at the start (legCosts.startConsumables)
 * @returns {Record<string, object>} by profile id; timeSec and o2G include the work at the stops the waypoints carry
 *   (workSec, #247), explain is the planner's per-leg explanation (#246)
 */
export function summariseProfiles(planned, waypoints, heightAt, constants, start = {}) {
  const summaries = {};
  for (const id of PROFILE_IDS) {
    const result = planned?.[id];
    if (!result) continue;
    if (!result.ok) {
      summaries[id] = { id, ok: false, reason: result.reason ?? 'no route' };
      continue;
    }
    const costs = routeLegCosts(result.path, waypoints, heightAt, constants, start);
    summaries[id] = {
      id,
      ok: true,
      path: result.path,
      distanceM: result.distance,
      climbM: result.climb,
      steepestSlopeDeg: result.steepestDeg,
      overCautionM: result.overCautionM,
      timeSec: costs?.totals.timeSec ?? null,
      o2G: costs?.totals.o2G ?? null,
      o2Pct: costs?.totals.o2Pct ?? null,
      batteryWh: costs?.totals.batteryWh ?? null,
      marginSec: costs?.totals.marginSec ?? null,
      workSec: costs?.totals.workSec ?? null,
      shadowShare: result.shadowShare,
      longestShadowM: result.longestShadowM,
      explain: result.explain ?? null,
    };
  }
  return summaries;
}

/**
 * Source entries for the comparison columns. Time and oxygen take the tags legCostSources gives route.totals, so a
 * profile's numbers carry the same tags as the route panel's.
 * @param {object} hazards public/data/hazards.json
 * @returns {Record<string, { tag: string, source: string }>}
 */
export function profileSources(hazards) {
  const legs = legCostSources(hazards);
  return {
    'route.profiles.distanceM': { tag: 'DERIVED', source: 'A* planner on the HiRISE height map (terrain.json), one route per profile' },
    'route.profiles.steepestSlopeDeg': { tag: 'DERIVED', source: 'slope of the HiRISE height map, sampled every metre along the route' },
    'route.profiles.overCautionM': { tag: 'DERIVED', source: 'route length on HiRISE slopes over the 15 degree caution limit' },
    'route.profiles.shadowShare': { tag: 'DERIVED', source: 'line of sight on the HiRISE height map from 1.7 m above the ground to the habitat mast, every 5 m along the route' },
    'route.profiles.weights': { tag: 'SIM', source: 'profile weights are our choice: gentlest prices slope cubed, radio contact triples the cost out of sight of the mast; under them, the slope divisor and rock weight of the risk setting, also our choice, on a brightness proxy for rock cover' },
    'route.profiles.timeSec': { ...legs['route.totals.timeSec'] },
    'route.profiles.o2G': { ...legs['route.totals.o2G'] },
  };
}
