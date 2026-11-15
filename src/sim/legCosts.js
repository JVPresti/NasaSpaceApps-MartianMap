/**
 * Time, oxygen and battery per leg of a planned route (#41).
 *
 * Wraps the planner's output without changing it: the path from `planRoute()` (or any `[[x, z], ...]` route) is split
 * at its waypoints, and each leg goes through `walkCost` from the suit model, so the per-leg numbers, the walkback on
 * the HUD and the suit consumables all come from one metabolic model (`models.walking_metabolic` in hazards.json).
 *
 * Plain JavaScript with no React and no three.js. Coordinates: x east, z south, metres from Cheyava Falls.
 */
import { batteryDrawW, combinedTag, marginLimitOf, metabolicPowerW, o2RateGs, SUIT_INPUTS, walkCost } from './suitModel.js';

export { combinedTag };

/** Paths that end this close to their start are round trips: no extra walk home is added. Metres. */
export const ROUND_TRIP_M = 20;

/**
 * Time, O2 and battery of the work at a stop (#247): the crew stands and works for `workSec` at the xEMU design average
 * metabolic rate (hazards.json suit.metabolic.design_average, 1200 BTU/h, 352 W). That rate is the suit's planning
 * average for a whole EVA, above the Apollo surface average (980 kJ/h, 272 W), so it does not flatter the budget.
 * @param {number} workSec seconds at the stop; anything not finite or below zero counts as no work
 * @param {object} c constants from suitConstantsFromHazards
 * @returns {{ timeSec: number, o2G: number, batteryWh: number }}
 */
export function workCost(workSec, c) {
  const timeSec = Number.isFinite(workSec) && workSec > 0 ? workSec : 0;
  return { timeSec, o2G: o2RateGs(c.designAvgW, c) * timeSec, batteryWh: batteryDrawW(c.designAvgW, c) * timeSec / 3600 };
}

/**
 * O2 and battery at the start of the EVA from the crew's needs (`needs.o2Pct`, `needs.batteryPct`, 0 to 100); a full
 * xEMU primary tank and battery without them.
 * @param {{ o2Pct?: number, batteryPct?: number } | null | undefined} needs
 * @param {object} c constants from suitConstantsFromHazards
 * @returns {{ o2StartG: number, batteryStartWh: number }}
 */
export function startConsumables(needs, c) {
  const share = (pct) => (Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) / 100 : 1);
  return { o2StartG: share(needs?.o2Pct) * c.o2UsableG, batteryStartWh: share(needs?.batteryPct) * c.batteryWh };
}
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
 * totals keeps that O2 margin and the 8 h EVA clock's margin (suit.eva_duration_max less the whole EVA) apart, and
 * marginLimit names the smaller one (#323), as suitReadout does for the live readout.
 *
 * Work at the stops (#247): a waypoint with `workSec` adds that work ({@link workCost}) to the leg that reaches it.
 * A leg's timeSec, o2G and batteryWh are walking plus work; walkSec and the work* fields keep the two apart. The walk
 * home has no stops.
 *
 * @param {Array<[number, number]>} path route path, walking order
 * @param {Array<{x: number, z: number, name?: string, workSec?: number}>} waypoints the start first
 * @param {(x: number, z: number) => number} heightAt terrain height in metres
 * @param {object} c constants from suitConstantsFromHazards
 * @param {{ stepM?: number, o2StartG?: number, batteryStartWh?: number }} [options] o2StartG and batteryStartWh: O2 and
 *   battery at the start (startConsumables), a full tank and battery by default
 */
export function routeLegCosts(path, waypoints, heightAt, c, { stepM = 10, o2StartG = c.o2UsableG, batteryStartWh = c.batteryWh } = {}) {
  const legs = splitAtWaypoints(path, waypoints).map(({ from, to, path: legPath }) => {
    const walk = walkCost(legPath, heightAt, c, { stepM, pad: 0 });
    const work = workCost(to.workSec, c);
    const timeSec = walk.timeSec + work.timeSec, o2G = walk.o2G + work.o2G, batteryWh = walk.batteryWh + work.batteryWh;
    return {
      from: from.name ?? null,
      to: to.name ?? null,
      ...walk,
      walkSec: walk.timeSec,
      workSec: work.timeSec, workO2G: work.o2G, workBatteryWh: work.batteryWh,
      timeSec, o2G, batteryWh,
      o2Pct: 100 * o2G / c.o2UsableG,
      batteryPct: 100 * batteryWh / c.batteryWh,
    };
  });
  if (!legs.length) return null;

  const out = {
    distanceM: sum(legs, 'distanceM'), climbM: sum(legs, 'climbM'), descentM: sum(legs, 'descentM'),
    maxSlopeDeg: Math.max(...legs.map((l) => l.maxSlopeDeg)),
    timeSec: sum(legs, 'timeSec'), o2G: sum(legs, 'o2G'), batteryWh: sum(legs, 'batteryWh'),
    walkSec: sum(legs, 'walkSec'), workSec: sum(legs, 'workSec'), workO2G: sum(legs, 'workO2G'), workBatteryWh: sum(legs, 'workBatteryWh'),
  };
  out.o2Pct = 100 * out.o2G / c.o2UsableG;
  out.batteryPct = 100 * out.batteryWh / c.batteryWh;

  const [sx, sz] = path[0], [ex, ez] = path[path.length - 1];
  const roundTrip = Math.hypot(ex - sx, ez - sz) <= ROUND_TRIP_M;
  const back = roundTrip
    ? { distanceM: 0, timeSec: 0, o2G: 0, batteryWh: 0 }
    : walkCost([...path].reverse(), heightAt, c, { stepM });   // default pad: the walkback pad

  const walkRate = o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);
  const arrivalO2G = o2StartG - out.o2G - back.o2G;
  const arrivalBatteryWh = batteryStartWh - out.batteryWh - back.batteryWh;
  // Margin at the end of the plan: the O2 left on arrival as walking time, minus the reserve, and the
  // suit.eva_duration_max time left after the walk out and back, as the HUD's margin now (suitReadout). Both are kept
  // so the table can name the limit that sets the figure (#323); the margin is the smaller of the two.
  const o2MarginSec = arrivalO2G / walkRate - c.reserveSec;
  const evaMarginSec = c.evaMaxSec - out.timeSec - back.timeSec;
  const marginSec = Math.min(o2MarginSec, evaMarginSec);
  const status = marginSec <= c.warningSec ? 'warning' : marginSec < c.cautionSec ? 'caution' : 'nominal';

  return {
    legs,
    totals: {
      ...out,
      roundTrip,
      returnDistanceM: back.distanceM, returnTimeSec: back.timeSec, returnO2G: back.o2G, returnBatteryWh: back.batteryWh,
      arrivalO2G, arrivalO2Pct: 100 * arrivalO2G / c.o2UsableG,
      arrivalBatteryWh, arrivalBatteryPct: 100 * arrivalBatteryWh / c.batteryWh,
      marginSec, o2MarginSec, evaMarginSec, marginLimit: marginLimitOf(o2MarginSec, evaMarginSec), status,
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
  const time = entry(SPEED, 'suit model: walking_metabolic at constant effort (mobility.speed_rule), plus the work time at each stop (stops.json, SIM)');
  const o2 = entry(O2, 'suit model: walking_metabolic O2 plus the work at the stops, share of the xEMU primary tank');
  const battery = entry(BATTERY, 'suit model: xEMU battery, the effort share of the draw is SIM');
  const margin = { ...entry(MARGIN, 'suit model: margin at the end of the plan, the O2 after the walk out, the work at the stops and the padded walk home minus the 30 min reserve, or the 8 h EVA limit less the whole EVA when that is tighter'), label: 'Suit model' };
  const walk = entry(SPEED, 'suit model: walking_metabolic at constant effort (mobility.speed_rule), no stops');
  // The work time is our estimate (stops.json work_time_s), so everything computed from it is SIM.
  const work = { tag: 'SIM', source: 'work time at the stops: stops.json work_time_s (SIM), longer for a solo crew' };
  const workUse = { tag: 'SIM', source: 'work at the stops: stops.json work_time_s (SIM) at the xEMU design average metabolic rate (hazards.json suit.metabolic.design_average)' };
  const fields = {
    distanceM: terrain, climbM: terrain, descentM: terrain, maxSlopeDeg: terrain,
    timeSec: time, o2G: o2, o2Pct: o2, batteryWh: battery, batteryPct: battery,
    walkSec: walk, workSec: work, workO2G: workUse, workBatteryWh: workUse,
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
 * The waypoints to price route.path against, with no work left at a stop the crew has already reached (route.visited)
 * or that the route now leaves out (route.skipped), and none at all while an event sends the crew to a shelter
 * (route.shelter): a re-planned path is the walk from where the crew is, so the work of those stops is not in it.
 * @param {{ waypoints?: Array<object>, visited?: string[], skipped?: string[], shelter?: object | null } | null} route
 * @returns {Array<object>} the same list when nothing changes
 */
export function waypointsForCosts(route) {
  const waypoints = Array.isArray(route?.waypoints) ? route.waypoints : [];
  const done = new Set([...(route?.visited ?? []), ...(route?.skipped ?? [])]);
  const sheltered = Boolean(route?.shelter);
  if (!sheltered && done.size === 0) return waypoints;
  let changed = false;
  const out = waypoints.map((w) => {
    if (!(w?.workSec > 0) || !(sheltered || done.has(w.name))) return w;
    changed = true;
    return { ...w, workSec: 0 };
  });
  return changed ? out : waypoints;
}

/**
 * Keep route.legs and route.totals in step with route.path, route.waypoints and the crew's needs in the store. The
 * waypoints carry the work time at each stop (#247), less the work already done or left out (waypointsForCosts);
 * needs.o2Pct and needs.batteryPct set the O2 and battery at the start (startConsumables).
 * @param {{ store: { getState: Function, setState: Function, subscribe: Function }, heightAt: Function,
 *   constants: object, sources?: object }} options
 * @returns {{ update: () => void, stop: () => void }}
 */
export function startLegCostRunner({ store, heightAt, constants: c, sources = {} }) {
  let last = [];
  store.setState((s) => ({ sources: { ...s.sources, ...sources } }));

  function update() {
    const { route, needs } = store.getState();
    const { path, waypoints, visited, skipped, shelter } = route;
    const inputs = [path, waypoints, visited, skipped, shelter, needs];
    if (inputs.every((value, k) => value === last[k])) return;
    last = inputs;
    const r = path && path.length >= 2 ? routeLegCosts(path, waypointsForCosts(route), heightAt, c, startConsumables(needs, c)) : null;
    store.setState((s) => ({ route: { ...s.route, legs: r ? r.legs : [], totals: r ? r.totals : null } }));
  }

  update();
  const unsubscribe = store.subscribe(update);
  return { update, stop: unsubscribe };
}
