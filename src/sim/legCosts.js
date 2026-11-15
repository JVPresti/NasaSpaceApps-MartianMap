/**
 * Time, oxygen and battery per leg of a planned route (#41).
 *
 * Wraps the planner's output without changing it: the path from `planRoute()` (or any `[[x, z], ...]` route) is split
 * at its waypoints, and each leg goes through `walkCost` from the suit model, so the per-leg numbers, the walkback on
 * the HUD and the suit consumables all come from one metabolic model (`models.walking_metabolic` in hazards.json).
 *
 * Plain JavaScript with no React and no three.js. Coordinates: x east, z south, metres from Cheyava Falls.
 */
import { combinedTag, metabolicPowerW, o2RateGs, SUIT_INPUTS, walkCost } from './suitModel.js';

export { combinedTag };

/** Paths that end this close to their start are round trips: no extra walk home is added. Metres. */
export const ROUND_TRIP_M = 20;
/** A path vertex this much farther from a waypoint than the closest vertex still counts as reaching it. Metres. */
const MATCH_SLACK_M = 0.5;

/**
 * Split a route path into legs at its waypoints.
 * The planner keeps each walkable waypoint as an exact path vertex and ends a leg to a blocked waypoint at the
 * nearest walkable cell, so each leg ends at the first vertex (after the previous leg's end) that is closest to its
 * waypoint.
 * @param {Array<[number, number]>} path
 * @param {Array<{x: number, z: number, name?: string}>} waypoints in walking order, the start first
 * @returns {Array<{ from: object, to: object, path: Array<[number, number]> }>}
 */
export function splitAtWaypoints(path, waypoints) {
  if (!path || path.length < 2) return [];
  const last = path.length - 1;
  if (!waypoints || waypoints.length < 2) {
    return [{ from: { x: path[0][0], z: path[0][1] }, to: { x: path[last][0], z: path[last][1] }, path }];
  }
  const legs = [];
  let start = 0;
  for (let w = 1; w < waypoints.length; w++) {
    let end = last;
    if (w < waypoints.length - 1) {
      const { x, z } = waypoints[w];
      const d = (k) => Math.hypot(path[k][0] - x, path[k][1] - z);
      let best = Infinity;
      for (let k = start; k <= last; k++) best = Math.min(best, d(k));
      end = start;
      while (end < last && d(end) > best + MATCH_SLACK_M) end++;
    }
    legs.push({ from: waypoints[w - 1], to: waypoints[w], path: path.slice(start, end + 1) });
    start = end;
  }
  return legs;
}

const sum = (legs, key) => legs.reduce((a, l) => a + l[key], 0);

/**
 * Per-leg and total costs of walking a route out, plus the walk home and the margin on arrival at the habitat.
 *
 * Legs use the nominal metabolic rate (no pad): they are the plan. The walk home back along the same path uses the
 * walkback pad, as the HUD walkback does. The margin is the HUD margin at the turnaround point:
 * O2 left after the walk out, minus the padded walk home, as time at the flat walking rate, minus the 30 min reserve.
 *
 * @param {Array<[number, number]>} path route path, walking order
 * @param {Array<{x: number, z: number, name?: string}>} waypoints the start first
 * @param {(x: number, z: number) => number} heightAt terrain height in metres
 * @param {object} c constants from suitConstantsFromHazards
 * @param {{ stepM?: number }} [options]
 */
export function routeLegCosts(path, waypoints, heightAt, c, { stepM = 10 } = {}) {
  const legs = splitAtWaypoints(path, waypoints).map(({ from, to, path: legPath }) => {
    const cost = walkCost(legPath, heightAt, c, { stepM, pad: 0 });
    return {
      from: from.name ?? null,
      to: to.name ?? null,
      ...cost,
      o2Pct: 100 * cost.o2G / c.o2UsableG,
      batteryPct: 100 * cost.batteryWh / c.batteryWh,
    };
  });
  if (!legs.length) return null;

  const out = {
    distanceM: sum(legs, 'distanceM'), climbM: sum(legs, 'climbM'), descentM: sum(legs, 'descentM'),
    maxSlopeDeg: Math.max(...legs.map((l) => l.maxSlopeDeg)),
    timeSec: sum(legs, 'timeSec'), o2G: sum(legs, 'o2G'), batteryWh: sum(legs, 'batteryWh'),
  };
  out.o2Pct = 100 * out.o2G / c.o2UsableG;
  out.batteryPct = 100 * out.batteryWh / c.batteryWh;

  const [sx, sz] = path[0], [ex, ez] = path[path.length - 1];
  const roundTrip = Math.hypot(ex - sx, ez - sz) <= ROUND_TRIP_M;
  const back = roundTrip
    ? { distanceM: 0, timeSec: 0, o2G: 0, batteryWh: 0 }
    : walkCost([...path].reverse(), heightAt, c, { stepM });   // default pad: the walkback pad

  const walkRate = o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);
  const arrivalO2G = c.o2UsableG - out.o2G - back.o2G;
  const arrivalBatteryWh = c.batteryWh - out.batteryWh - back.batteryWh;
  // Margin at the end of the plan: the O2 left on arrival as walking time, minus the reserve, capped at the
  // suit.eva_duration_max time left after the walk out and back, as the HUD's margin now (suitReadout).
  const evaMarginSec = c.evaMaxSec - out.timeSec - back.timeSec;
  const marginSec = Math.min(arrivalO2G / walkRate - c.reserveSec, evaMarginSec);
  const status = marginSec <= c.warningSec ? 'warning' : marginSec < c.cautionSec ? 'caution' : 'nominal';

  return {
    legs,
    totals: {
      ...out,
      roundTrip,
      returnDistanceM: back.distanceM, returnTimeSec: back.timeSec, returnO2G: back.o2G, returnBatteryWh: back.batteryWh,
      arrivalO2G, arrivalO2Pct: 100 * arrivalO2G / c.o2UsableG,
      arrivalBatteryWh, arrivalBatteryPct: 100 * arrivalBatteryWh / c.batteryWh,
      marginSec, status,
    },
  };
}

const { speed: SPEED, o2: O2, battery: BATTERY, margin: MARGIN } = SUIT_INPUTS;

/**
 * Sources for the store's `sources` map: one entry per route.legs and route.totals field, tags from hazards.json.
 * @param {object} hazards
 */
export function legCostSources(hazards) {
  const terrain = { tag: 'DERIVED', source: 'planner path on the HiRISE height map (terrain.json), sampled every 10 m' };
  const entry = (ids, source) => ({ tag: combinedTag(hazards, ids), source });
  const time = entry(SPEED, 'suit model: walking_metabolic at constant effort (mobility.speed_rule), no stops');
  const o2 = entry(O2, 'suit model: walking_metabolic O2, share of the xEMU primary tank');
  const battery = entry(BATTERY, 'suit model: xEMU battery, the effort share of the draw is SIM');
  const margin = { ...entry(MARGIN, 'suit model: margin at the end of the plan, the O2 after the walk out and the padded walk home minus the 30 min reserve, capped at the 8 h EVA limit'), label: 'Suit model' };
  const fields = {
    distanceM: terrain, climbM: terrain, descentM: terrain, maxSlopeDeg: terrain,
    timeSec: time, o2G: o2, o2Pct: o2, batteryWh: battery, batteryPct: battery,
  };
  const sources = {};
  for (const [k, v] of Object.entries(fields)) { sources['route.legs.' + k] = v; sources['route.totals.' + k] = v; }
  Object.assign(sources, {
    'route.totals.returnTimeSec': time, 'route.totals.returnO2G': margin, 'route.totals.arrivalO2Pct': margin,
    'route.totals.arrivalBatteryPct': battery, 'route.totals.marginSec': margin, 'route.totals.status': margin,
  });
  return sources;
}

/**
 * Keep route.legs and route.totals in step with route.path and route.waypoints in the store.
 * @param {{ store: { getState: Function, setState: Function, subscribe: Function }, heightAt: Function,
 *   constants: object, sources?: object }} options
 * @returns {{ update: () => void, stop: () => void }}
 */
export function startLegCostRunner({ store, heightAt, constants: c, sources = {} }) {
  let lastPath, lastWaypoints;
  store.setState((s) => ({ sources: { ...s.sources, ...sources } }));

  function update() {
    const { path, waypoints } = store.getState().route;
    if (path === lastPath && waypoints === lastWaypoints) return;
    lastPath = path; lastWaypoints = waypoints;
    const r = path && path.length >= 2 ? routeLegCosts(path, waypoints, heightAt, c) : null;
    store.setState((s) => ({ route: { ...s.route, legs: r ? r.legs : [], totals: r ? r.totals : null } }));
  }

  update();
  const unsubscribe = store.subscribe(update);
  return { update, stop: unsubscribe };
}
