/**
 * The route from the crew's needs: which stops, in which order, on which profile, and whether it fits the time, the
 * oxygen and the battery the crew has (8-minute plan, section A; #247, #265).
 *
 * The site anchors of route.json stay where they are (the engine places the habitat, the spawn and the outcrop model
 * from them). This module builds the planned waypoint list at run time: the habitat airlock first (named 'HAB', as
 * events.js and simulation.js expect), then the stops it chose from the candidates of public/data/stops.json.
 *
 * Inputs and what each one changes:
 * - objective: the required and the optional stops (OBJECTIVES); 'samples' (#352) routes to the places of the crew's
 *   sampling tasks instead (needs.tasks, src/sim/sampleTasks.js).
 * - crew: a solo astronaut must stay in radio contact (the radio-contact profile is forced) and works 1.5 times as
 *   long at each stop; a pair shares the work (the stops.json work times are for a pair).
 * - timeMin, o2Pct, batteryPct: the budget. Optional stops are added in the objective's order while the plan still fits,
 *   each checked with routeLegCosts on the planned route, walk out, work and walk home together.
 * - risk: the slope penalty, the rock weight, the reserve kept out of the budget and the oxygen margin required;
 *   cautious also prefers ground Perseverance drove. The 20 degree suited limit never moves (#242: 17 degrees leaves
 *   no route), because every profile grid shares the base grid's closed cells.
 * - profile: the terrain preference the crew chose at the table (#245, routeProfiles.js). It sets the route walked and
 *   the budget of that route, never the stops: they are chosen on one reference route (the fastest, or the radio route
 *   a solo crew must walk), so the three profile columns always compare the same stops (round 1 review, P7).
 *
 * Stop order (P8, the product owner's call): each objective walks its stops in one fixed order, the order its goal
 * text gives (OBJECTIVES order): Bright Angel on the way, then Cheyava Falls, as Perseverance came down Neretva Vallis.
 * The order never depends on the profile, the risk or the time. Only a stop an objective does not list is placed by
 * straight-line distance from the airlock, nearest first.
 *
 * Output is machine-readable: codes and numbers, never sentences (the mission table translates them).
 *
 * Plain JavaScript with no React and no three.js: it runs in the planner worker and in tests.
 */
import { COST_CONSTANTS, heightAt } from './costGrid.js';
import { rankInsertions } from './findDetour.js';
import { routeLegCosts, startConsumables } from './legCosts.js';
import { DEFAULT_PROFILE, planOnProfile, pricedProfileGrid, PROFILE_IDS, ROUTE_PROFILES } from './routeProfiles.js';
import { normaliseTasks, resolvePlace, STOP_RADIUS_DEFAULT_M, taskWorkSec } from './sampleTasks.js';

/**
 * What each objective visits, by stop id (stops.json). Optional stops are added in the `optional` order while the plan
 * fits; `order` is the walking order of whatever is kept, as the goal text gives it.
 * - sortie: the short first mission (#265), one light-toned patch 55 m from the airlock.
 * - cheyava: sample Cheyava Falls; Bright Angel on the way, if there is time.
 * - bright-angel: survey the Bright Angel outcrop; Cheyava Falls, 51 m past it, if there is time.
 */
const FULL_EVA_ORDER = Object.freeze(['bright-angel', 'cheyava-falls']);
export const OBJECTIVES = Object.freeze({
  sortie: Object.freeze({ required: Object.freeze(['sortie']), optional: Object.freeze([]), order: Object.freeze(['sortie']) }),
  cheyava: Object.freeze({ required: Object.freeze(['cheyava-falls']), optional: Object.freeze(['bright-angel']), order: FULL_EVA_ORDER }),
  'bright-angel': Object.freeze({ required: Object.freeze(['bright-angel']), optional: Object.freeze(['cheyava-falls']), order: FULL_EVA_ORDER }),
  // Collect samples (#352): no fixed stops; the crew's sampling tasks (needs.tasks, src/sim/sampleTasks.js) give the
  // places, routed by cheapest insertion (planFromNeeds).
  samples: Object.freeze({ required: Object.freeze([]), optional: Object.freeze([]), order: Object.freeze([]) }),
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
 * Risk tolerance. Our choice (SIM), standard being today's planner (costGrid.js COST_CONSTANTS). No source sets any of
 * these numbers; the slope divisor and the rock weight decide which route the planner picks (#311):
 * - slopePenaltyDeg: the slope divisor of the cost, smaller is dearer slope (7 deg cautious, 9 standard, 12 bold). SIM;
 * - rockWeight: the weight of rock abundance, itself a brightness proxy (1 cautious, 0.6 standard, 0.3 bold). SIM;
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

/**
 * Time available: from 10 min to the 8 h xEMU EVA limit, hazards.json suit.eva_duration_max (missionNeeds.test.js
 * fails if the two drift apart). With the hazards loaded, read the range from {@link timeRangeMin}; planFromNeeds
 * caps the time at constants.evaMaxSec. Minutes.
 */
export const TIME_RANGE_MIN = Object.freeze([10, 480]);

/**
 * The time range from the suit constants: 10 min to suit.eva_duration_max.
 * @param {{ evaMaxSec: number }} constants from suitConstantsFromHazards
 * @returns {[number, number]} minutes
 */
export function timeRangeMin(constants) {
  return [TIME_RANGE_MIN[0], finite(constants?.evaMaxSec) ? constants.evaMaxSec / 60 : TIME_RANGE_MIN[1]];
}
/** O2 and battery at the start, percent of the primary tank and battery. */
export const CONSUMABLE_RANGE_PCT = Object.freeze([1, 100]);

/**
 * The time each objective plans for by default (our choice, SIM). The first sortie is about 2 min of walking and 5 min
 * of work, so 30 min leaves a wide margin; the full EVA to Cheyava Falls with Bright Angel uses about 76 min for a
 * pair (walk 19 min, work 35 min, walk home 22 min), so 2 h keeps both stops. Collecting samples plans 2 h too: the
 * default task, a rock sample at Bright Angel, is the full EVA's walk with 8 min of work. setNeeds applies it when the
 * objective changes and the update gives no time of its own (store.js).
 */
export const OBJECTIVE_DEFAULTS = Object.freeze({
  sortie: Object.freeze({ timeMin: 30 }),
  cheyava: Object.freeze({ timeMin: 120 }),
  'bright-angel': Object.freeze({ timeMin: 120 }),
  samples: Object.freeze({ timeMin: 120 }),
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

/**
 * A candidate stop as a route waypoint. `name` is the stops.json waypoint name, the key the card, the waypoint runner
 * and the event runner link by (stopForWaypoint, route.visited); `label` is the stop's one display name (stops.json
 * name). The table and the map number the waypoints by position (waypointNumber) and show `label`, never the code
 * inside `name`.
 */
function stopWaypoint(stop, workFactor, required) {
  return { name: stop.waypoint, label: stop.name, x: stop.x, z: stop.z, workSec: Math.round(stop.workSec * workFactor), stopId: stop.id, required };
}

/** A readable name for a stop id the candidates do not have (a stops.json error): 'cheyava-falls' -> 'Cheyava Falls'. */
function nameFromId(id) {
  return String(id).split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * The stops in walking order after the start: the objective's order, then any stop it does not list, nearest the start
 * first by straight-line distance (ties by id).
 */
function walkingOrder(start, stops, order = []) {
  const rank = (w) => (order.includes(w.stopId) ? order.indexOf(w.stopId) : order.length);
  const distance = (w) => Math.hypot(w.x - start.x, w.z - start.z);
  const byOrder = (a, b) => rank(a) - rank(b) || distance(a) - distance(b) || String(a.stopId).localeCompare(String(b.stopId));
  return [start, ...stops.slice().sort(byOrder)];
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

/** What a stop or a task left out for want of a path reports: no figures. */
const UNREACHABLE = Object.freeze({ limit: 'unreachable', overSec: null, marginShortSec: null, batteryShortWh: null, extraWalkSec: null, extraM: null });

/**
 * Where a sampling task's place goes in the chain (#352): after chain[k] for the k that adds the least straight-line
 * walking (findDetour.rankInsertions, the finds' cheapest insertion). Going on past the last place costs the way there
 * once, not there and back, since the walk home retraces the path either way (legCosts.routeLegCosts): its straight
 * detour is halved. Ties go to the smaller k.
 * @param {Array<{ x: number, z: number }>} chain the start first
 * @param {{ x: number, z: number }} place
 * @returns {number} k: the place goes in at k + 1
 */
export function cheapestInsertion(chain, place) {
  const last = chain.length - 1;
  let best = null;
  for (const option of rankInsertions(chain, place)) {
    const straight = option.k === last ? option.straight / 2 : option.straight;
    if (!best || straight < best.straight || (straight === best.straight && option.k < best.k)) best = { k: option.k, straight };
  }
  return best.k;
}

/**
 * Plan the route from the crew's needs.
 *
 * For the 'samples' objective (#352) the stops are the places of the crew's sampling tasks (needs.tasks, see
 * planTasks below); `tasks` then lists every task in list order, kept or dropped:
 * `{ id, what, count, place: ResolvedPlace, workSec, kept, drop: null | { limit, overSec, marginShortSec,
 * batteryShortWh, extraWalkSec, extraM } }`, and `dropped` is empty. A task waypoint carries `place` (its place key),
 * `tasks` (the ids of the tasks kept there) and, for a clicked point, `arrivalRadiusM`. Every other objective returns
 * `tasks: []`.
 *
 * @param {{ objective?: string, crew?: number, timeMin?: number, o2Pct?: number, batteryPct?: number, risk?: string,
 *   profile?: string, tasks?: Array<object> }} needs the store's needs plus the profile chosen at the table (route.profile)
 * @param {{ grid: object, start: { name: string, x: number, z: number },
 *   stops: Array<{ id: string, name: string, waypoint: string, x: number, z: number, workSec: number }>,
 *   constants: object, mast?: { x: number, y?: number, z: number } | null, traverse?: Array<object> | null,
 *   cache?: Map<string, object> }} site grid: the base cost grid; start: siteStart(anchors); stops: the candidates
 *   (stops.routeStopCandidates); constants: suitConstantsFromHazards; traverse: the drives of traverse.json; cache:
 *   shared with routeProfiles.planProfiles so the comparison reuses the routes searched here
 * @returns {{
 *   ok: boolean, fits: boolean, needs: object, waypoints: Array<object>, stops: Array<object>, dropped: Array<object>,
 *   tasks: Array<object>, profile: string, requestedProfile: string, referenceProfile: string, pricing: object | null, weights: object,
 *   budget: object, reasons: Array<object>, route: object | null, totals: object | null
 * }} profile: the route walked and budgeted; referenceProfile: the route the stops were chosen on
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
  const profileOf = (id) => ROUTE_PROFILES.find((p) => p.id === id);
  const requestedProfile = PROFILE_IDS.includes(needs?.profile) ? needs.profile : DEFAULT_PROFILE;
  let profileId = crew.profile ?? requestedProfile;
  if (crew.profile) reasons.push({ code: 'solo-radio', requested: requestedProfile });
  let priced = pricedProfileGrid(grid, profileOf(profileId), { mast, pricing, traverse, cache });
  if (!priced) {
    const fallback = requestedProfile === profileId ? DEFAULT_PROFILE : requestedProfile;
    reasons.push({ code: 'radio-unavailable', profile: fallback });
    profileId = fallback;
    priced = pricedProfileGrid(grid, profileOf(profileId), { mast, pricing, traverse, cache });
  }
  // The stops are chosen on one reference route, whatever the table chose: the radio route a solo crew walks, the
  // fastest otherwise. A click on another profile then changes the route walked and its budget, never the stops.
  const referenceProfile = crew.profile && profileId === crew.profile ? crew.profile : DEFAULT_PROFILE;
  const reference = referenceProfile === profileId ? priced : pricedProfileGrid(grid, profileOf(referenceProfile), { mast, pricing, traverse, cache });
  if (crew.workFactor !== 1) reasons.push({ code: 'solo-work', factor: crew.workFactor });
  if (pricing) {
    reasons.push({ code: 'risk', risk: n.risk, slopePenaltyDeg: risk.slopePenaltyDeg, rockWeight: risk.rockWeight, traverseDiscount: risk.traverseDiscount, reserveShare: risk.reserveShare });
  }

  const { o2StartG, batteryStartWh } = startConsumables(n, c);
  // The time available never passes the xEMU EVA limit (hazards.json suit.eva_duration_max).
  const availableSec = Math.min(n.timeMin * 60, c.evaMaxSec);
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
  const evaluate = (chain, on) => {
    const route = planOnProfile(on, chain, cache);
    if (!route.ok) return { ok: false, route };
    const costs = routeLegCosts(route.path, chain, h, c, { o2StartG, batteryStartWh });
    return { ok: true, route, totals: costs.totals, check: checkBudget(costs.totals, budget) };
  };
  // What a stop adds: the walk out and home together (the walk home retraces the path), and its work.
  const walking = (e) => e.totals.walkSec + (e.totals.roundTrip ? 0 : e.totals.returnTimeSec);
  const walked = (e) => e.totals.distanceM + (e.totals.roundTrip ? 0 : e.totals.returnDistanceM);

  const byId = new Map((site.stops ?? []).map((s) => [s.id, s]));
  const nameOf = (id) => byId.get(id)?.name ?? nameFromId(id);

  const result = (fields) => ({
    needs: n,
    profile: profileId,
    requestedProfile,
    referenceProfile,
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
    tasks: [],
    ...fields,
    stops: fields.waypoints.slice(1).map((w) => ({
      id: w.stopId ?? w.place, name: w.label, waypoint: w.name, x: w.x, z: w.z, workSec: w.workSec, required: w.required, reason: byId.get(w.stopId)?.reason ?? null,
      ...(Array.isArray(w.tasks) ? { place: w.place, tasks: w.tasks } : {}),
    })),
  });
  const noRoute = (fields) => result({ ok: false, fits: false, budget: { ...budget, fits: false, limit: null }, route: null, totals: null, ...fields });

  // The route walked: the profile in use on the stops chosen. Its budget is the plan's verdict. `required`: the stops
  // (and, for sampling, the task) whose plan alone does not fit when the verdict is required-over.
  const conclude = ({ chain, current, dropped, tasks = [], required }) => {
    const walkedPlan = reference === priced ? current : evaluate(chain, priced);
    if (!walkedPlan.ok) {
      reasons.push({ code: 'profile-unreachable', profile: profileId });
      return noRoute({ waypoints: chain, dropped, tasks });
    }
    const { check, totals } = walkedPlan;
    const over = { limit: check.limit, limits: check.limits, overSec: Math.max(0, check.overSec), marginShortSec: check.marginShortSec, batteryShortWh: check.batteryShortWh };
    if (check.fits) {
      reasons.push({ code: 'fits', spareSec: -check.overSec });
    } else if (!current.check.fits) {
      reasons.push({ code: 'required-over', ...required, ...over });
    } else {
      // the stops fit on the reference route, not on the profile chosen at the table
      reasons.push({ code: 'profile-over', profile: profileId, reference: referenceProfile, ...over });
    }

    return result({
      ok: true,
      fits: check.fits,
      waypoints: chain,
      dropped,
      tasks,
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
      route: walkedPlan.route,
      totals,
    });
  };

  // What a candidate that does not fit reports: the limit it breaks and by how much, and what it adds to the walk.
  const shortfall = (tried, current) => (tried.ok
    ? {
      limit: tried.check.limit, overSec: Math.max(0, tried.check.overSec), marginShortSec: tried.check.marginShortSec,
      batteryShortWh: tried.check.batteryShortWh, extraWalkSec: walking(tried) - walking(current), extraM: walked(tried) - walked(current),
    }
    : { ...UNREACHABLE });

  /**
   * Collect samples (#352): the crew's sampling tasks give the places. Each task in list order goes in where it adds
   * the least straight-line walking (findDetour.rankInsertions, as the finds); a task at a place already on the route
   * adds its work there. The first task is the goal: kept even when it does not fit. Each later one is kept only when
   * the plan with it still fits the time, O2 and battery, and a task left out does not stop the next one being tried
   * (PO Q2: the optional stops' rule).
   */
  const planTasks = () => {
    const tasks = normaliseTasks(needs?.tasks);
    if (tasks.length === 0) {
      reasons.push({ code: 'no-tasks' });
      return noRoute({ waypoints: [start], dropped: [] });
    }
    let chain = [start];
    let current = null;
    let first = null;   // the goal task and its place, once one is on the route
    const planned = [];
    // the tasks after a goal task with no path: not tried, so neither kept nor dropped
    const unplanned = (from) => tasks.slice(from).map((task) => taskEntry(task, resolvePlace(task.place, site.stops)));
    const taskEntry = (task, place) => ({
      id: task.id, what: task.what, count: task.count, place: place ?? missingPlace(task.place), workSec: taskWorkSec(task, crew.workFactor), kept: false, drop: null,
    });
    const missingPlace = (place) => ({
      key: place.stopId, type: 'stop', stopId: place.stopId, x: null, z: null, radiusM: STOP_RADIUS_DEFAULT_M, label: nameOf(place.stopId), waypoint: null, reason: null,
    });

    for (const [index, task] of tasks.entries()) {
      const place = resolvePlace(task.place, site.stops);
      const entry = taskEntry(task, place);
      planned.push(entry);
      if (!place) {
        reasons.push({ code: 'stop-missing', stop: task.place.stopId, name: nameOf(task.place.stopId) });
        entry.drop = { ...UNREACHABLE };
        continue;
      }
      const at = chain.findIndex((w) => w.place === place.key);
      let candidate;
      if (at > 0) {
        candidate = chain.map((w, k) => (k === at ? { ...w, workSec: w.workSec + entry.workSec, tasks: [...w.tasks, task.id] } : w));
      } else {
        const waypoint = {
          name: place.waypoint, label: place.label, x: place.x, z: place.z, workSec: entry.workSec, stopId: place.stopId, required: true,
          place: place.key, tasks: [task.id], ...(place.type === 'point' ? { arrivalRadiusM: place.radiusM } : {}),
        };
        const k = cheapestInsertion(chain, place);
        candidate = [...chain.slice(0, k + 1), waypoint, ...chain.slice(k + 1)];
      }
      const tried = evaluate(candidate, reference);

      if (!first) {
        // the goal task: kept whatever it costs, and without a path there is no plan
        if (!tried.ok) {
          reasons.push({ code: 'unreachable', stops: [place.key], names: [place.label], tasks: [task.id] });
          entry.drop = { ...UNREACHABLE };
          return noRoute({ waypoints: candidate, dropped: [], tasks: [...planned, ...unplanned(index + 1)] });
        }
        first = { task, place };
        entry.kept = true;
        chain = candidate;
        current = tried;
        continue;
      }
      if (tried.ok && tried.check.fits) {
        reasons.push({
          code: 'task-added', task: task.id, place: place.key, name: place.label,
          extraWalkSec: walking(tried) - walking(current), extraM: walked(tried) - walked(current), workSec: entry.workSec,
        });
        entry.kept = true;
        chain = candidate;
        current = tried;
        continue;
      }
      entry.drop = shortfall(tried, current);
      reasons.push({ code: 'task-dropped', task: task.id, place: place.key, name: place.label, ...entry.drop, workSec: entry.workSec });
    }

    if (!first) {
      reasons.push({ code: 'no-stops' });
      return noRoute({ waypoints: chain, dropped: [], tasks: planned });
    }
    return conclude({
      chain, current, dropped: [], tasks: planned,
      required: { stops: [first.place.key], names: [first.place.label], tasks: [first.task.id] },
    });
  };
  if (n.objective === 'samples') return planTasks();

  const kept = [];
  for (const id of objective.required) {
    const stop = byId.get(id);
    if (!stop) { reasons.push({ code: 'stop-missing', stop: id, name: nameOf(id) }); continue; }
    kept.push(stopWaypoint(stop, crew.workFactor, true));
  }
  let chain = walkingOrder(start, kept, objective.order);

  const failed = (code) => {
    reasons.push(code === 'no-stops' ? { code } : { code, stops: objective.required.slice(), names: objective.required.map(nameOf) });
    return result({ ok: false, fits: false, waypoints: chain, dropped: [], budget: { ...budget, fits: false, limit: null }, route: null, totals: null });
  };

  if (chain.length < 2) return failed('no-stops');
  let current = evaluate(chain, reference);
  if (!current.ok) return failed('unreachable');

  // Optional stops in the objective's order, each kept while the plan with it still fits on the reference route.
  const dropped = [];
  for (const id of objective.optional) {
    const stop = byId.get(id);
    if (!stop) { reasons.push({ code: 'stop-missing', stop: id, name: nameOf(id) }); continue; }
    const waypoint = stopWaypoint(stop, crew.workFactor, false);
    const candidate = walkingOrder(start, [...chain.slice(1), waypoint], objective.order);
    const tried = evaluate(candidate, reference);
    if (tried.ok && tried.check.fits) {
      reasons.push({ code: 'stop-added', stop: id, name: stop.name, extraWalkSec: walking(tried) - walking(current), extraM: walked(tried) - walked(current), workSec: waypoint.workSec });
      chain = candidate;
      current = tried;
      continue;
    }
    const entry = tried.ok
      ? {
        limit: tried.check.limit, overSec: Math.max(0, tried.check.overSec), marginShortSec: tried.check.marginShortSec,
        batteryShortWh: tried.check.batteryShortWh, extraWalkSec: walking(tried) - walking(current), extraM: walked(tried) - walked(current),
      }
      : { limit: 'unreachable', overSec: null, marginShortSec: null, batteryShortWh: null, extraWalkSec: null, extraM: null };
    dropped.push({ id, name: stop.name, ...entry, workSec: waypoint.workSec });
    reasons.push({ code: 'stop-dropped', stop: id, name: stop.name, ...entry, workSec: waypoint.workSec });
  }

  return conclude({ chain, current, dropped, required: { stops: objective.required.slice(), names: objective.required.map(nameOf) } });
}

/** Key of the needs that change the plan (not `locked`), so an equal update does not plan again. */
export function needsKey(needs) {
  const n = normaliseNeeds(needs);
  return NEEDS_KEYS.map((k) => n[k]).join('|');
}
