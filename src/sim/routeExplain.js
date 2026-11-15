/**
 * Why the route bends (#246): for each leg of a planned route, whether the straight line between its two ends is
 * open, and when the planner left it, what it went around and what the detour costs.
 *
 * Structured output only, no sentences: the mission table turns the codes and numbers into text in each language.
 *
 * - The straight line is tested with the planner's own `isSegmentClear` (cells over the 20 degree suited limit are
 *   closed). A closed line is a hard block: `block: 'slope'`.
 * - An open line the route still leaves is a soft detour: the cost the planner priced was lower around than across.
 *   The cause is the cost term the detour saves most on: 'steep' (slope under the limit), 'rock', 'radio' (out of
 *   sight of the habitat mast, radio-contact profile) or 'traverse' (ground Perseverance drove, cautious risk).
 * - The detour's price is the planned leg against the straight line: extra metres, and extra walking seconds from the
 *   suit model over the real heights (negative when going around avoids a climb).
 *
 * Plain JavaScript with no React and no three.js. Coordinates: x east, z south, metres from Cheyava Falls.
 */
import { COST_CONSTANTS, heightAt, isBlockedAt, onTraverse, rockAbundanceAt, slopeAt } from './costGrid.js';
import { splitAtWaypoints } from './legCosts.js';
import { inRadioShadow } from './radio.js';
import { isSegmentClear } from './routePlanner.js';
import { walkCost } from './suitModel.js';

/** Spacing of the samples along a line. Metres. */
export const EXPLAIN_STEP_M = 1;
/** A leg this much longer than its straight line has left it: 3 % of the line, and at least 5 m. */
export const BEND_SHARE = 0.03;
export const BEND_MIN_M = 5;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Walk a polyline in steps of about `stepM` and call `visit(x, z, metres)` at the middle of each step.
 * @param {Array<[number, number]>} path
 * @param {number} stepM
 * @param {(x: number, z: number, metres: number) => void} visit
 */
function eachStep(path, stepM, visit) {
  for (let k = 0; k < path.length - 1; k += 1) {
    const [ax, az] = path[k];
    const [bx, bz] = path[k + 1];
    const length = Math.hypot(bx - ax, bz - az);
    if (length === 0) continue;
    const n = Math.max(1, Math.ceil(length / stepM));
    for (let s = 0; s < n; s += 1) {
      const t = (s + 0.5) / n;
      visit(ax + (bx - ax) * t, az + (bz - az) * t, length / n);
    }
  }
}

const lengthOf = (path) => {
  let total = 0;
  for (let k = 1; k < path.length; k += 1) total += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
  return total;
};

/**
 * What a line crosses, and the integral of each cost term along it in the planner's units (metres times multiplier).
 * @param {object} grid
 * @param {Array<[number, number]>} path
 * @param {object} pricing
 */
function tally(grid, path, { weights, shadowMask, shadowMultiplier, traverseMask, traverseDiscount }) {
  const p = weights.slopePenaltyDeg ?? COST_CONSTANTS.SLOPE_PENALTY_DEG;
  const e = weights.slopeExponent ?? 2;
  const w = weights.rockWeight ?? COST_CONSTANTS.ROCK_PENALTY_WEIGHT;
  const out = { lengthM: 0, steepestDeg: 0, overLimitM: 0, overCautionM: 0, rockSum: 0, slopeCost: 0, rockCost: 0, shadowCost: 0, traverseCost: 0 };
  eachStep(path, EXPLAIN_STEP_M, (x, z, metres) => {
    const slope = slopeAt(grid, x, z);
    const rock = rockAbundanceAt(grid, x, z);
    out.lengthM += metres;
    out.steepestDeg = Math.max(out.steepestDeg, slope);
    out.rockSum += rock * metres;
    if (isBlockedAt(grid, x, z)) {
      out.overLimitM += metres;
      return;   // no price on closed ground: the line is blocked, not dear
    }
    if (slope > COST_CONSTANTS.SLOPE_CAUTION_DEG) out.overCautionM += metres;
    const slopeTerm = (slope / p) ** e;
    const base = 1 + slopeTerm + w * rock;
    out.slopeCost += slopeTerm * metres;
    out.rockCost += w * rock * metres;
    if (shadowMask && shadowMultiplier !== 1 && inRadioShadow(shadowMask, x, z)) out.shadowCost += (shadowMultiplier - 1) * base * metres;
    if (traverseMask && traverseDiscount !== 1 && onTraverse(traverseMask, x, z)) out.traverseCost += (traverseDiscount - 1) * base * metres;
  });
  return out;
}

/**
 * Explain one leg.
 * @param {object} grid the base cost grid (its blocked cells are the 20 degree limit)
 * @param {Array<[number, number]>} legPath the planned leg, walking order
 * @param {{ from?: string | null, to?: string | null, constants?: object | null, weights?: object,
 *   shadowMask?: object | null, shadowMultiplier?: number, traverseMask?: object | null, traverseDiscount?: number }} [options]
 *   weights, shadowMask with shadowMultiplier (radio.js) and traverseMask with traverseDiscount (costGrid.traverseMask):
 *   the cost the route was planned on (routeProfiles.js); constants (suitConstantsFromHazards) give the extra seconds,
 *   null without them
 * @returns {{ from: string | null, to: string | null, clear: boolean, block: null | 'slope' | 'steep' | 'rock' | 'radio' | 'traverse',
 *   straightM: number, routeM: number, extraM: number, extraSec: number | null, steepestDeg: number, overLimitM: number,
 *   overCautionM: number, rockStraight: number, rockRoute: number }}
 */
export function explainLeg(grid, legPath, {
  from = null, to = null, constants = null, weights = {}, shadowMask = null, shadowMultiplier = 1, traverseMask = null, traverseDiscount = 1,
} = {}) {
  const a = legPath[0];
  const b = legPath[legPath.length - 1];
  const straight = [a, b];
  const pricing = { weights, shadowMask, shadowMultiplier, traverseMask, traverseDiscount };
  const line = tally(grid, straight, pricing);
  const route = tally(grid, legPath, pricing);
  const straightM = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const routeM = lengthOf(legPath);
  const extraM = Math.max(0, routeM - straightM);
  const open = isSegmentClear(grid, { x: a[0], z: a[1] }, { x: b[0], z: b[1] });
  const bent = !open || extraM > Math.max(BEND_MIN_M, BEND_SHARE * straightM);

  let block = null;
  if (!open) {
    block = 'slope';
  } else if (bent) {
    // The detour saves most on this term (the straight line's integral minus the route's). The traverse term is a
    // discount, so the route saves by having more of it.
    const savings = [
      ['steep', line.slopeCost - route.slopeCost],
      ['rock', line.rockCost - route.rockCost],
      ['radio', line.shadowCost - route.shadowCost],
      ['traverse', line.traverseCost - route.traverseCost],
    ];
    block = savings.reduce((best, item) => (item[1] > best[1] ? item : best))[0];
  }

  let extraSec = null;
  if (constants) {
    const h = (x, z) => heightAt(grid, x, z);
    extraSec = walkCost(legPath, h, constants, { pad: 0 }).timeSec - walkCost(straight, h, constants, { pad: 0 }).timeSec;
  }

  return {
    from,
    to,
    clear: !bent,
    block,
    straightM,
    routeM,
    extraM,
    extraSec: bent ? extraSec : finite(extraSec) ? 0 : null,
    steepestDeg: line.steepestDeg,
    overLimitM: line.overLimitM,
    overCautionM: line.overCautionM,
    rockStraight: line.lengthM > 0 ? line.rockSum / line.lengthM : 0,
    rockRoute: route.lengthM > 0 ? route.rockSum / route.lengthM : 0,
  };
}

/**
 * Explain every leg of a route, split at its waypoints like route.legs (legCosts.splitAtWaypoints), so leg k of the
 * explanation is leg k of the cost table.
 * @param {object} grid the base cost grid
 * @param {Array<[number, number]>} path planned route
 * @param {Array<{ x: number, z: number, name?: string }>} waypoints the start first
 * @param {object} [options] as for {@link explainLeg}, without from and to
 * @returns {Array<ReturnType<typeof explainLeg>>}
 */
export function explainRoute(grid, path, waypoints, options = {}) {
  if (!Array.isArray(path) || path.length < 2) return [];
  return splitAtWaypoints(path, waypoints).map(({ from, to, path: legPath }) => (
    explainLeg(grid, legPath, { ...options, from: from?.name ?? null, to: to?.name ?? null })
  ));
}
