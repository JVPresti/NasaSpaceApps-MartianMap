/**
 * Unexpected find (#71, plan section 3.4 scenario 3): what a detour to a marked rock costs.
 *
 * The player marks a point off the route. This module prices the visit with the same planner and suit model as the
 * route: walk from where the route is now to the find, then rejoin the route at the waypoint that makes the detour
 * cheapest. It returns the extra walking time and O2, the walkback margin before and after, and a go or no-go.
 * The map never decides (plan section 2): the verdict is advice, and the player can still add a no-go find.
 *
 * Plain JavaScript with no React and no three.js: it runs inside the planner worker, where the cost grid lives.
 * Coordinates: x east, z south, metres from Cheyava Falls.
 */
import { heightAt, isBlockedAt } from './costGrid.js';
import { legCostSources } from './legCosts.js';
import { planRoute } from './routePlanner.js';
import { walkCost } from './suitModel.js';

/** How long the point pose must stay on one spot to drop a marker. Milliseconds. Plan section 3.4: 2 s. */
export const FIND_HOLD_MS = 2000;
/** Farthest ground the point gesture can mark. Metres. A rock worth a detour is one you can see clearly. */
export const FIND_RANGE_M = 50;
/** The aim may wander this far from where the hold started before the timer starts over. Metres. */
export const FIND_STEADY_M = 3;
/** Finds on the map at once: undecided plus accepted and not reached yet. Keeps the visor and the minimap readable. */
export const MAX_FINDS = 3;
/** Insertion points priced with the planner, after a straight-line pre-sort. Each one costs two A* runs. */
export const DETOUR_CANDIDATES = 2;

const finite = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Marker label: M01, M02, ... */
export function findLabel(seq) {
  return 'M' + String(seq).padStart(2, '0');
}

/** Waypoint name of an accepted find. The part before " · " is the short name the HUD shows. */
export function findWaypointName(label) {
  return label + ' · find';
}

/**
 * Where the remaining route goes now: the player, then each waypoint not reached yet.
 * @param {{x: number, z: number}} position
 * @param {Array<{x: number, z: number}>} waypoints
 * @param {number} nextIndex first waypoint not reached yet
 */
function remainingChain(position, waypoints, nextIndex) {
  const start = Number.isInteger(nextIndex) ? Math.max(0, nextIndex) : 0;
  const chain = [{ x: position.x, z: position.z, index: start }];
  for (let i = start; i < (waypoints?.length ?? 0); i += 1) {
    if (finite(waypoints[i])) chain.push({ x: waypoints[i].x, z: waypoints[i].z, index: i });
  }
  return chain;
}

/**
 * Insertion points in the order worth planning: the straight-line detour of each, smallest first.
 * Candidate k puts the find between chain[k] and chain[k + 1]; the last candidate (k = chain.length - 1) goes
 * there and back from the end of the route.
 */
export function rankInsertions(chain, find) {
  const out = [];
  for (let k = 0; k < chain.length; k += 1) {
    const a = chain[k], b = chain[k + 1];
    const straight = b ? dist(a, find) + dist(find, b) - dist(a, b) : 2 * dist(a, find);
    out.push({ k, straight });
  }
  return out.sort((p, q) => p.straight - q.straight);
}

const ZERO = { distanceM: 0, timeSec: 0, o2G: 0 };

function costOf(grid, path, c) {
  return walkCost(path, (x, z) => heightAt(grid, x, z), c, { pad: 0 });
}

/**
 * Price one insertion point: plan a -> find -> b and a -> b, and keep the difference.
 * @returns {{ ok: boolean, extraSec?: number, extraO2G?: number, extraM?: number, path?: Array<[number, number]> }}
 */
function priceInsertion(grid, chain, k, find, c) {
  const a = chain[k], b = chain[k + 1] ?? a;   // past the end: there and back to the last point
  const detour = planRoute(grid, [find, b], { start: a, smooth: true });
  if (!detour.ok) return { ok: false };
  let base = ZERO;
  if (chain[k + 1]) {
    const direct = planRoute(grid, [b], { start: a, smooth: true });
    if (!direct.ok) return { ok: false };
    base = costOf(grid, direct.path, c);
  }
  const via = costOf(grid, detour.path, c);
  // Smoothing and the cost weights can make the planned detour a few seconds shorter than the direct leg.
  // A detour never saves time, so the difference stops at zero.
  return {
    ok: true,
    extraSec: Math.max(0, via.timeSec - base.timeSec),
    extraO2G: Math.max(0, via.o2G - base.o2G),
    extraM: Math.max(0, via.distanceM - base.distanceM),
    path: detour.path,
  };
}

/**
 * Margin after the detour and the go / no-go.
 *
 * The walkback margin is the HUD's (suitModel.suitReadout): O2 time left, minus the padded walk home, minus the
 * 30 min reserve. The detour spends extraO2G more before the crew is back on the route, so the margin after is
 * the margin now minus that O2 as time at the current O2 rate (oxygenG / oxygenSec, the rate the HUD uses).
 * No-go when the find is on ground closed to the suit, when no path reaches it, or when the margin after falls
 * to the warning threshold (suit.alert.warning_margin, 0 min: the 30 min reserve itself would be used).
 *
 * @param {{ blocked: boolean, reachable: boolean, extraO2G: number | null,
 *   suit: { oxygenG?: number | null, oxygenSec?: number | null, marginSec?: number | null } | null,
 *   constants: { warningSec: number, cautionSec: number } }} input
 */
export function detourVerdict({ blocked, reachable, extraO2G, suit, constants: c }) {
  const before = Number.isFinite(suit?.marginSec) ? suit.marginSec : null;
  const rate = Number.isFinite(suit?.oxygenG) && Number.isFinite(suit?.oxygenSec) && suit.oxygenSec > 0
    ? suit.oxygenG / suit.oxygenSec
    : null;
  const after = before !== null && rate && Number.isFinite(extraO2G) ? before - extraO2G / rate : null;
  const marginStatus = after === null ? null : after <= c.warningSec ? 'warning' : after < c.cautionSec ? 'caution' : 'nominal';
  let verdict = 'go', reason = null;
  if (blocked) { verdict = 'no-go'; reason = 'blocked'; }
  else if (!reachable) { verdict = 'no-go'; reason = 'unreachable'; }
  else if (after === null) { verdict = 'unknown'; reason = 'no-margin'; }
  else if (marginStatus === 'warning') { verdict = 'no-go'; reason = 'margin'; }
  return { marginBeforeSec: before, marginAfterSec: after, marginStatus, verdict, reason };
}

/**
 * Price a detour to a find from the current position along the remaining route.
 *
 * @param {object} grid cost grid from buildCostGrid (blocked cells are the planner's 20 degree no-go)
 * @param {{
 *   position: {x: number, z: number},
 *   waypoints: Array<{x: number, z: number, name?: string}>,
 *   nextIndex: number,
 *   find: {x: number, z: number},
 *   constants: object,
 *   suit?: { oxygenG?: number | null, oxygenSec?: number | null, marginSec?: number | null } | null,
 *   candidates?: number,
 * }} request constants: suitConstantsFromHazards; suit: the store's suit section now
 * @returns {{
 *   ok: boolean, blocked: boolean, insertIndex: number | null,
 *   extraSec: number | null, extraO2G: number | null, extraM: number | null,
 *   marginBeforeSec: number | null, marginAfterSec: number | null, marginStatus: string | null,
 *   verdict: 'go' | 'no-go' | 'unknown', reason: string | null, path: Array<[number, number]> | null,
 * }} insertIndex: where the find goes in route.waypoints (nextIndex means "go there first")
 */
export function priceDetour(grid, { position, waypoints, nextIndex = 0, find, constants: c, suit = null, candidates = DETOUR_CANDIDATES }) {
  if (!finite(position)) throw new Error('priceDetour needs a finite position');
  if (!finite(find)) throw new Error('priceDetour needs a finite find point');
  const blocked = isBlockedAt(grid, find.x, find.z);
  const chain = remainingChain(position, waypoints, nextIndex);

  let best = null;
  for (const { k } of rankInsertions(chain, find).slice(0, Math.max(1, candidates))) {
    const priced = priceInsertion(grid, chain, k, find, c);
    if (priced.ok && (!best || priced.extraSec < best.extraSec)) best = { ...priced, k };
  }

  const reachable = best !== null;
  const insertIndex = reachable
    ? (chain[best.k + 1] ? chain[best.k + 1].index : (waypoints?.length ?? 0))
    : null;
  return {
    ok: reachable,
    blocked,
    insertIndex,
    extraSec: reachable ? best.extraSec : null,
    extraO2G: reachable ? best.extraO2G : null,
    extraM: reachable ? best.extraM : null,
    ...detourVerdict({ blocked, reachable, extraO2G: reachable ? best.extraO2G : null, suit, constants: c }),
    path: reachable ? best.path : null,
  };
}

/**
 * Waypoints with an accepted find inserted. Waypoints already reached stay where they are, so route.nextIndex
 * keeps pointing at the same place: the find, when it goes in first, or the current target.
 * @param {Array<object>} waypoints
 * @param {object} waypoint the find as a waypoint ({ name, x, z, find })
 * @param {number} index from priceDetour().insertIndex
 * @param {number} nextIndex
 */
export function insertFindWaypoint(waypoints, waypoint, index, nextIndex = 0) {
  const list = Array.isArray(waypoints) ? waypoints : [];
  const at = Math.max(Number.isInteger(nextIndex) ? nextIndex : 0, Math.min(list.length, Number.isInteger(index) ? index : list.length));
  return [...list.slice(0, at), waypoint, ...list.slice(at)];
}

/**
 * Sources of the detour numbers, with the same tags as the values they come from: the time and O2 of a route leg
 * (legCostSources) and the HUD walkback margin (suit.marginSec).
 * @param {object} hazards parsed hazards.json
 * @param {object} constants suitConstantsFromHazards(hazards)
 */
export function findSources(hazards, constants) {
  const legs = legCostSources(hazards);
  const margin = constants.sources['suit.marginSec'];
  return {
    'finds.extraSec': { tag: legs['route.legs.timeSec'].tag, source: 'detour: planner path to the find and back to the route at constant effort, minus the leg it replaces; no time at the rock' },
    'finds.extraO2G': { tag: legs['route.legs.o2G'].tag, source: 'detour: walking O2 of the suit model for the same paths, minus the leg it replaces' },
    'finds.marginBeforeSec': { tag: margin.tag, source: 'HUD walkback margin now: ' + margin.source },
    'finds.marginAfterSec': { tag: margin.tag, source: 'walkback margin now minus the detour O2 at the current O2 rate' },
    'finds.verdict': { tag: margin.tag, source: 'no-go on ground over 20 degrees, with no path, or when the margin after reaches 0 min (the 30 min reserve)' },
  };
}
