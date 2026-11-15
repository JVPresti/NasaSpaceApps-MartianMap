/**
 * The route from the crew's needs: which stops, in which order, on which profile, and whether it fits the time, the
 * oxygen and the battery the crew has (8-minute plan, section A; #247, #265).
 *
 * The site anchors of route.json stay where they are (the engine places the habitat, the spawn and the outcrop model
 * from them). This module builds the planned waypoint list at run time: the habitat airlock first (named 'HAB', as
 * events.js and simulation.js expect), then the stops it chose from the candidates of public/data/stops.json.
 *
 * Inputs and what each one changes:
 * - objective: the required and the optional stops (OBJECTIVES).
 * - crew: a solo astronaut must stay in radio contact (the radio-contact profile is forced) and works 1.5 times as
 *   long at each stop; a pair shares the work (the stops.json work times are for a pair).
 * - timeMin, o2Pct, batteryPct: the budget. Optional stops are added in the objective's order while the plan still fits,
 *   each priced with findDetour (rankInsertions, priceDetour) and checked with routeLegCosts.
 * - risk: the slope penalty, the rock weight, the reserve kept out of the budget and the oxygen margin required;
 *   cautious also prefers ground Perseverance drove. The 20 degree suited limit never moves (#242: 17 degrees leaves
 *   no route), because every profile grid shares the base grid's closed cells.
 * - profile: the terrain preference the crew chose at the table (#245, routeProfiles.js).
 *
 * Output is machine-readable: codes and numbers, never sentences (the mission table translates them).
 *
 * Plain JavaScript with no React and no three.js: it runs in the planner worker and in tests.
 */
import { COST_CONSTANTS, heightAt } from './costGrid.js';
import { insertFindWaypoint, priceDetour, rankInsertions } from './findDetour.js';
import { legCostSources, routeLegCosts, startConsumables } from './legCosts.js';
import { DEFAULT_PROFILE, planOnProfile, pricedProfileGrid, PROFILE_IDS, ROUTE_PROFILES } from './routeProfiles.js';

/**
 * What each objective visits, by stop id (stops.json). Optional stops are added in this order while the plan fits.
 * - sortie: the short first mission (#265), one light-toned patch 55 m from the airlock.
 * - cheyava: sample Cheyava Falls; Bright Angel, 51 m short of it on the way, if there is time.
 * - bright-angel: survey the Bright Angel outcrop; Cheyava Falls, 51 m past it, if there is time.
 */
export const OBJECTIVES = Object.freeze({
  sortie: Object.freeze({ required: Object.freeze(['sortie']), optional: Object.freeze([]) }),
  cheyava: Object.freeze({ required: Object.freeze(['cheyava-falls']), optional: Object.freeze(['bright-angel']) }),
  'bright-angel': Object.freeze({ required: Object.freeze(['bright-angel']), optional: Object.freeze(['cheyava-falls']) }),
});
export const OBJECTIVE_IDS = Object.freeze(Object.keys(OBJECTIVES));

/**
 * Crew size. Our rules (SIM): a solo astronaut has no partner to call for help, so the route keeps the habitat mast in
 * sight (the radio-contact profile, #245), and does the photo, texture, sample and seal steps alone, 1.5 times as long
 * as a pair, who split them (one documents while the other samples). The stops.json work times are for a pair.
 */
export const CREW_SETTINGS = Object.freeze({
  1: Object.freeze({ workFactor: 1.5, profile: 'radio' }),
  2: Object.freeze({ workFactor: 1, profile: null }),
});
export const CREW_SIZES = Object.freeze([1, 2]);

/**
 * Risk tolerance. Our choice (SIM), standard being today's planner (costGrid.js COST_CONSTANTS):
 * - slopePenaltyDeg: the slope divisor of the cost, smaller is dearer slope (7 deg cautious, 9 standard, 12 bold);
 * - rockWeight: the weight of rock abundance (1 cautious, 0.6 standard, 0.3 bold);
 * - traverseDiscount: ground Perseverance drove costs this share of other ground (0.8 cautious: the rover crossed it,
 *   so it is known to be passable; 1 elsewhere);
 * - reserveShare: share of the time available kept out of the plan, also the battery kept at the end (25 %, 15 %, 5 %);
 * - marginFloor: the oxygen margin at the end of the plan must stay above the suit's caution threshold (15 min,
 *   cautious) or its warning threshold (0 min, the 30 min reserve untouched). No setting plans into the reserve.
 */
export const RISK_SETTINGS = Object.freeze({
  cautious: Object.freeze({ slopePenaltyDeg: 7, rockWeight: 1, traverseDiscount: 0.8, reserveShare: 0.25, marginFloor: 'caution' }),
  standard: Object.freeze({ slopePenaltyDeg: COST_CONSTANTS.SLOPE_PENALTY_DEG, rockWeight: COST_CONSTANTS.ROCK_PENALTY_WEIGHT, traverseDiscount: 1, reserveShare: 0.15, marginFloor: 'warning' }),
  bold: Object.freeze({ slopePenaltyDeg: 12, rockWeight: 0.3, traverseDiscount: 1, reserveShare: 0.05, marginFloor: 'warning' }),
});
export const RISK_IDS = Object.freeze(Object.keys(RISK_SETTINGS));

/** Time available: from 10 min to the 8 h xEMU EVA limit (hazards.json suit.eva_duration_max). Minutes. */
export const TIME_RANGE_MIN = Object.freeze([10, 480]);
/** O2 and battery at the start, percent of the primary tank and battery. */
export const CONSUMABLE_RANGE_PCT = Object.freeze([1, 100]);

/**
 * The time each objective plans for by default (our choice, SIM). The first sortie is about 2 min of walking and 5 min
 * of work, so 30 min leaves a wide margin; the full EVA to Cheyava Falls with Bright Angel uses about 76 min for a
 * pair (walk 19 min, work 35 min, walk home 22 min), so 2 h keeps both stops. setNeeds applies it when the objective
 * changes and the update gives no time of its own (store.js).
 */
export const OBJECTIVE_DEFAULTS = Object.freeze({
  sortie: Object.freeze({ timeMin: 30 }),
  cheyava: Object.freeze({ timeMin: 120 }),
  'bright-angel': Object.freeze({ timeMin: 120 }),
});

/** Needs before the crew changes anything: the first sortie (the default mission, #265), two astronauts, 30 min. */
export const DEFAULT_NEEDS = Object.freeze({ objective: 'sortie', crew: 2, timeMin: OBJECTIVE_DEFAULTS.sortie.timeMin, o2Pct: 100, batteryPct: 100, risk: 'standard' });
export const NEEDS_KEYS = Object.freeze(Object.keys(DEFAULT_NEEDS));

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, [lo, hi]) => Math.max(lo, Math.min(hi, value));

/**
 * Check a partial update of the needs. Returns the cleaned update; throws on an unknown key or value. Numbers are
 * clamped to their range.
 * @param {object} partial
 * @returns {object}
 */
export function checkNeeds(partial) {
  if (!partial || typeof partial !== 'object') throw new Error('needs must be an object');
  const out = {};
  for (const [key, value] of Object.entries(partial)) {
    if (!NEEDS_KEYS.includes(key)) throw new Error(`unknown need: ${key}`);
    if (key === 'objective' && !OBJECTIVE_IDS.includes(value)) throw new Error(`objective must be one of ${OBJECTIVE_IDS.join(', ')}`);
    if (key === 'risk' && !RISK_IDS.includes(value)) throw new Error(`risk must be one of ${RISK_IDS.join(', ')}`);
    if (key === 'crew' && !CREW_SIZES.includes(value)) throw new Error('crew must be 1 or 2');
    if (['timeMin', 'o2Pct', 'batteryPct'].includes(key) && !finite(value)) throw new Error(`${key} must be a finite number`);
    out[key] = key === 'timeMin' ? clamp(value, TIME_RANGE_MIN) : key === 'o2Pct' || key === 'batteryPct' ? clamp(value, CONSUMABLE_RANGE_PCT) : value;
  }
  return out;
}

/** Needs with every field valid: missing or wrong values take the defaults. */
export function normaliseNeeds(needs) {
  const n = needs && typeof needs === 'object' ? needs : {};
  return {
    objective: OBJECTIVE_IDS.includes(n.objective) ? n.objective : DEFAULT_NEEDS.objective,
    crew: CREW_SIZES.includes(n.crew) ? n.crew : DEFAULT_NEEDS.crew,
    timeMin: finite(n.timeMin) ? clamp(n.timeMin, TIME_RANGE_MIN) : DEFAULT_NEEDS.timeMin,
    o2Pct: finite(n.o2Pct) ? clamp(n.o2Pct, CONSUMABLE_RANGE_PCT) : DEFAULT_NEEDS.o2Pct,
    batteryPct: finite(n.batteryPct) ? clamp(n.batteryPct, CONSUMABLE_RANGE_PCT) : DEFAULT_NEEDS.batteryPct,
    risk: RISK_IDS.includes(n.risk) ? n.risk : DEFAULT_NEEDS.risk,
  };
}

/**
 * What a risk setting changes on the profile grids (routeProfiles.pricedProfileGrid): only what differs from today's
 * cost, so the standard setting plans on today's grids and the default route does not move. Null for standard.
 * @param {string} risk
 * @returns {{ id: string, weights: object, traverseDiscount: number } | null}
 */
export function riskPricing(risk) {
  const setting = RISK_SETTINGS[risk] ?? RISK_SETTINGS.standard;
  const weights = {};
  if (setting.slopePenaltyDeg !== COST_CONSTANTS.SLOPE_PENALTY_DEG) weights.slopePenaltyDeg = setting.slopePenaltyDeg;
  if (setting.rockWeight !== COST_CONSTANTS.ROCK_PENALTY_WEIGHT) weights.rockWeight = setting.rockWeight;
  if (Object.keys(weights).length === 0 && setting.traverseDiscount === 1) return null;
  return { id: risk, weights, traverseDiscount: setting.traverseDiscount };
}

/**
 * The start of every planned route: the HAB waypoint of route.json, moved to the airlock (routeStart.startAtAirlock),
 * or the first anchor when none is named HAB.
 * @param {Array<{ name: string, x: number, z: number }>} anchors
 * @returns {{ name: string, x: number, z: number } | null}
 */
export function siteStart(anchors) {
  if (!Array.isArray(anchors) || anchors.length === 0) return null;
  const hab = anchors.find((w) => w?.name === 'HAB') ?? anchors[0];
  return { name: hab.name, x: hab.x, z: hab.z };
}

/** A candidate stop as a route waypoint: the stops.json waypoint name (stopForWaypoint links it to its card). */
function stopWaypoint(stop, workFactor, required) {
  return { name: stop.waypoint, x: stop.x, z: stop.z, workSec: Math.round(stop.workSec * workFactor), stopId: stop.id, required };
}

/**
 * Whether a plan fits the budget. Time: the walk out, the work and the walk home within the time available less the
 * risk reserve. O2: the margin at the end of the plan (routeLegCosts) above the risk's floor. Battery: the battery on
 * return above the risk reserve share of the capacity.
 */
function checkBudget(totals, budget) {
  const usedSec = totals.timeSec + (totals.roundTrip ? 0 : totals.returnTimeSec);
  const overSec = usedSec - budget.usableSec;
  // As routeLegCosts' status: 'nominal' from the caution threshold up, 'warning' at the warning threshold and below.
  const o2Ok = budget.marginFloor === 'caution' ? totals.marginSec >= budget.marginFloorSec : totals.marginSec > budget.marginFloorSec;
  const marginShortSec = budget.marginFloorSec - totals.marginSec;
  const batteryShortWh = budget.batteryReserveWh - totals.arrivalBatteryWh;
  const limits = [];
  if (overSec > 0) limits.push('time');
  if (!o2Ok) limits.push('o2');
  if (batteryShortWh > 0) limits.push('battery');
  return {
    fits: limits.length === 0,
    limit: limits[0] ?? null,
    limits,
    usedSec,
    overSec,
    marginShortSec: Math.max(0, marginShortSec),
    batteryShortWh: Math.max(0, batteryShortWh),
  };
}

/**
 * Plan the route from the crew's needs.
 *
 * @param {{ objective?: string, crew?: number, timeMin?: number, o2Pct?: number, batteryPct?: number, risk?: string,
 *   profile?: string }} needs the store's needs plus the profile chosen at the table (route.profile)
 * @param {{ grid: object, start: { name: string, x: number, z: number },
 *   stops: Array<{ id: string, name: string, waypoint: string, x: number, z: number, workSec: number }>,
 *   constants: object, mast?: { x: number, y?: number, z: number } | null, traverse?: Array<object> | null,
 *   cache?: Map<string, object> }} site grid: the base cost grid; start: siteStart(anchors); stops: the candidates
 *   (stops.routeStopCandidates); constants: suitConstantsFromHazards; traverse: the drives of traverse.json; cache:
 *   shared with routeProfiles.planProfiles so the comparison reuses the routes searched here
 * @returns {{
 *   ok: boolean, fits: boolean, needs: object, waypoints: Array<object>, stops: Array<object>, dropped: Array<object>,
 *   profile: string, requestedProfile: string, pricing: object | null, weights: object, budget: object,
 *   reasons: Array<object>, route: object | null, totals: object | null
 * }}
 */
export function planFromNeeds(needs, site) {
  const n = normaliseNeeds(needs);
  const { grid, constants: c, mast = null, traverse = null, cache = new Map() } = site;
  if (!site.start || !finite(site.start.x) || !finite(site.start.z)) throw new Error('planFromNeeds needs a start');
  const start = { name: site.start.name ?? 'HAB', x: site.start.x, z: site.start.z };
  const objective = OBJECTIVES[n.objective];
  const crew = CREW_SETTINGS[n.crew];
  const risk = RISK_SETTINGS[n.risk];
  const pricing = riskPricing(n.risk);
  const reasons = [];

  // Profile: the crew's choice, or radio contact for a solo crew; without the habitat mast there is no radio route.
  const requestedProfile = PROFILE_IDS.includes(needs?.profile) ? needs.profile : DEFAULT_PROFILE;
  let profileId = crew.profile ?? requestedProfile;
  if (crew.profile) reasons.push({ code: 'solo-radio', requested: requestedProfile });
  let priced = pricedProfileGrid(grid, ROUTE_PROFILES.find((p) => p.id === profileId), { mast, pricing, traverse, cache });
  if (!priced) {
    const fallback = requestedProfile === profileId ? DEFAULT_PROFILE : requestedProfile;
    reasons.push({ code: 'radio-unavailable', profile: fallback });
    profileId = fallback;
    priced = pricedProfileGrid(grid, ROUTE_PROFILES.find((p) => p.id === profileId), { mast, pricing, traverse, cache });
  }
  if (crew.workFactor !== 1) reasons.push({ code: 'solo-work', factor: crew.workFactor });
  if (pricing) {
    reasons.push({ code: 'risk', risk: n.risk, slopePenaltyDeg: risk.slopePenaltyDeg, rockWeight: risk.rockWeight, traverseDiscount: risk.traverseDiscount, reserveShare: risk.reserveShare });
  }

  const { o2StartG, batteryStartWh } = startConsumables(n, c);
  const availableSec = n.timeMin * 60;
  const reserveSec = availableSec * risk.reserveShare;
  const budget = {
    availableSec,
    reserveSec,
    usableSec: availableSec - reserveSec,
    o2StartG,
    marginFloor: risk.marginFloor,
    marginFloorSec: risk.marginFloor === 'caution' ? c.cautionSec : c.warningSec,
    batteryStartWh,
    batteryReserveWh: risk.reserveShare * c.batteryWh,
  };
  const h = (x, z) => heightAt(grid, x, z);
  const evaluate = (chain) => {
    const route = planOnProfile(priced, chain, cache);
    if (!route.ok) return { ok: false, route };
    const costs = routeLegCosts(route.path, chain, h, c, { o2StartG, batteryStartWh });
    return { ok: true, route, totals: costs.totals, check: checkBudget(costs.totals, budget) };
  };

  // Required stops, each where it adds the least straight-line walking.
  const byId = new Map((site.stops ?? []).map((s) => [s.id, s]));
  let chain = [start];
  for (const id of objective.required) {
    const stop = byId.get(id);
    if (!stop) { reasons.push({ code: 'stop-missing', stop: id }); continue; }
    const [{ k }] = rankInsertions(chain, stop);
    chain = insertFindWaypoint(chain, stopWaypoint(stop, crew.workFactor, true), k + 1, 1);
  }

  const result = (fields) => ({
    needs: n,
    profile: profileId,
    requestedProfile,
    pricing,
    weights: {
      slopeLimitDeg: COST_CONSTANTS.SLOPE_LIMIT_DEG,
      slopePenaltyDeg: risk.slopePenaltyDeg,
      rockWeight: risk.rockWeight,
      traverseDiscount: risk.traverseDiscount,
      reserveShare: risk.reserveShare,
      workFactor: crew.workFactor,
    },
    reasons,
    ...fields,
    stops: fields.waypoints.slice(1).map((w) => ({ id: w.stopId, name: byId.get(w.stopId)?.name ?? w.name, waypoint: w.name, x: w.x, z: w.z, workSec: w.workSec, required: w.required })),
  });

  if (chain.length < 2) {
    reasons.push({ code: 'no-stops' });
    return result({ ok: false, fits: false, waypoints: chain, dropped: [], budget: { ...budget, fits: false, limit: null }, route: null, totals: null });
  }
  let current = evaluate(chain);
  if (!current.ok) {
    reasons.push({ code: 'unreachable', stops: objective.required.slice() });
    return result({ ok: false, fits: false, waypoints: chain, dropped: [], budget: { ...budget, fits: false, limit: null }, route: null, totals: null });
  }

  // Optional stops in the objective's order: priced at their cheapest insertion, kept while the plan still fits.
  const dropped = [];
  for (const id of objective.optional) {
    const stop = byId.get(id);
    if (!stop) { reasons.push({ code: 'stop-missing', stop: id }); continue; }
    const waypoint = stopWaypoint(stop, crew.workFactor, false);
    const detour = priceDetour(priced.grid, { position: start, waypoints: chain, nextIndex: 1, find: waypoint, constants: c });
    if (!detour.ok) {
      dropped.push({ id, name: stop.name, limit: 'unreachable', overSec: null, marginShortSec: null, batteryShortWh: null, extraWalkSec: null, extraM: null, workSec: waypoint.workSec });
      reasons.push({ code: 'stop-dropped', stop: id, limit: 'unreachable' });
      continue;
    }
    const candidate = insertFindWaypoint(chain, waypoint, detour.insertIndex, 1);
    const tried = evaluate(candidate);
    const numbers = { extraWalkSec: detour.extraSec, extraM: detour.extraM, workSec: waypoint.workSec };
    if (tried.ok && tried.check.fits) {
      chain = candidate;
      current = tried;
      reasons.push({ code: 'stop-added', stop: id, ...numbers });
      continue;
    }
    const limit = tried.ok ? tried.check.limit : 'unreachable';
    const over = tried.ok
      ? { overSec: Math.max(0, tried.check.overSec), marginShortSec: tried.check.marginShortSec, batteryShortWh: tried.check.batteryShortWh }
      : { overSec: null, marginShortSec: null, batteryShortWh: null };
    dropped.push({ id, name: stop.name, limit, ...over, ...numbers });
    reasons.push({ code: 'stop-dropped', stop: id, limit, ...over, ...numbers });
  }

  const { check, totals } = current;
  if (check.fits) {
    reasons.push({ code: 'fits', spareSec: -check.overSec });
  } else {
    reasons.push({
      code: 'required-over', stops: objective.required.slice(), limit: check.limit, limits: check.limits,
      overSec: Math.max(0, check.overSec), marginShortSec: check.marginShortSec, batteryShortWh: check.batteryShortWh,
    });
  }

  return result({
    ok: true,
    fits: check.fits,
    waypoints: chain,
    dropped,
    budget: {
      ...budget,
      usedSec: check.usedSec,
      spareSec: -check.overSec,
      walkSec: totals.walkSec,
      workSec: totals.workSec,
      returnSec: totals.roundTrip ? 0 : totals.returnTimeSec,
      o2UsedG: totals.o2G + totals.returnO2G,
      marginSec: totals.marginSec,
      batteryUsedWh: totals.batteryWh + totals.returnBatteryWh,
      arrivalBatteryWh: totals.arrivalBatteryWh,
      fits: check.fits,
      limit: check.limit,
    },
    route: current.route,
    totals,
  });
}

/** Key of the needs that change the plan (not `locked`), so an equal update does not plan again. */
export function needsKey(needs) {
  const n = normaliseNeeds(needs);
  return NEEDS_KEYS.map((k) => n[k]).join('|');
}

/**
 * Source entries for the plan's fields in the store (route.stops, route.dropped, route.planReasons, route.budget,
 * route.weights, route.explain) and for the needs the crew sets. Time and O2 take the tags legCostSources gives
 * route.totals, so the budget carries the same tags as the route panel.
 * @param {object} hazards public/data/hazards.json
 * @returns {Record<string, { tag: string, source: string }>}
 */
export function planSources(hazards) {
  const legs = legCostSources(hazards);
  return {
    'route.stops': { tag: 'SIM', source: 'stops chosen from stops.json by the objective, then kept while the plan fits the time, O2 and battery (src/sim/missionNeeds.js)' },
    'route.dropped': { tag: 'SIM', source: 'optional stops left out: with them the plan goes over the time less the reserve, under the O2 margin floor or under the battery reserve' },
    'route.planReasons': { tag: 'SIM', source: 'why the plan is what it is: the crew rules, the risk setting and each stop added or dropped (src/sim/missionNeeds.js)' },
    'route.weights': { tag: 'SIM', source: 'risk setting: slope penalty, rock weight, rover-ground discount and reserve are our choice; the 20 degree limit is NASA\'s suited walking limit and never moves' },
    'route.budget': { tag: 'SIM', source: 'time available set by the crew, less the risk reserve; the walk out, the work at the stops and the walk home from the suit model' },
    'route.budget.usedSec': { ...legs['route.totals.timeSec'] },
    'route.budget.marginSec': { ...legs['route.totals.marginSec'] },
    'route.explain': { tag: 'DERIVED', source: 'straight line between the ends of each leg, tested on the HiRISE height map against the 20 degree limit like the planner (isSegmentClear)' },
    'route.explain.extraM': { tag: 'DERIVED', source: 'planned leg length on the HiRISE height map minus its straight line' },
    'route.explain.extraSec': { ...legs['route.legs.walkSec'] },
  };
}
