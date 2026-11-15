/**
 * Route review (#274): the walk the astronaut actually made, judged against the plan approved at Begin EVA.
 *
 * The input is the frozen EVA summary written by src/state/eva.js:
 *   track         [{ x, z, atSec, marginSec, slopeDeg, eventId, o2G, home }]: one point every 2 m of horizontal walking.
 *                 marginSec is suit.marginSec (already net of the reserve), slopeDeg the terrain slope under the feet,
 *                 eventId the event-engine event running at that moment, o2G the O2 left in the suit, home true at the
 *                 habitat (never a deviation).
 *   plan          { path, waypoints, legs }: the route snapshot taken at the go decision. route.path changes during the
 *                 EVA (off-route and event re-plans), so the review compares against this snapshot instead.
 *   routeChanges  [{ atSec, kind, reason, after, x, z }]: every real re-plan, the moments the plan changed.
 *   finds         [{ label, x, z, atSec, accepted }]: every find the player marked (#71).
 *   samples       [{ x, z, atSec }]: every sample secured (#36).
 *
 * Three steps:
 *   1. Deviations. One starts when the track is more than 15 m from the approved path and lasts at least 20 m of walking
 *      beyond that line; it ends when the track is back within 10 m. The gap between the two thresholds keeps a walk
 *      along the edge from splitting one detour into many. The stretch starts at the last point within 10 m before the
 *      track left, so it covers the whole detour.
 *   2. Cost, against the stretch of the plan it replaced (the plan between the projections of the stretch's ends):
 *      extra minutes, extra O2 in grams (the suit's own O2 readings for the walked stretch minus the per-leg suit model
 *      costs of the replaced stretch), extra distance, the lowest margin and the steepest slope.
 *   3. Verdict, one rule each, checked in this order:
 *        risky   it crossed ground at or above SLOPE_LIMIT_DEG. A sample, a find or an alert never excuses a no-go slope.
 *        forced  an event was running when it started, or the track follows a slope detour or hazard re-route the
 *                system planned before it started. A correct reaction, not a mistake.
 *        risky   the margin went under the reserve, or the player was still off the route when an event started.
 *        worth   the player marked a find or secured a sample in it (and nothing above applied).
 *        costly  none of the above: time and O2 for nothing.
 *      Risky beats worth it, as the issue asks; forced beats the margin and late-event rules because a detour to a
 *      shelter with the oxygen warning on is the right call even when the margin is already gone.
 *
 * Plain JavaScript: no React, no three.js and no store import, like the rest of src/sim/.
 */
import { COST_CONSTANTS } from './costGrid.js';
import { distanceToPath } from './offRoute.js';

/** The thresholds of the review. "How to read these numbers" in the debrief reads them from here. */
export const REVIEW_RULES = Object.freeze({
  /** A deviation starts when the track is farther than this from the approved path. Metres. */
  enterM: 15,
  /** It ends when the track is back within this. Metres. */
  exitM: 10,
  /** Walking beyond enterM must last at least this long to count. Metres of track. */
  minLengthM: 20,
  /** A find or sample this close to the off-route part of a stretch counts as inside it. Metres. */
  reachM: 10,
  /** Share of the off-route points that must lie within enterM of a system re-plan for the stretch to follow it. */
  followShare: 0.5,
  /** suit.marginSec is the margin over the reserve: below this value the suit is using the reserve. Seconds. */
  reserveMarginSec: 0,
  /** No-go ground for a suited walker (hazards.json slope.no_go, the planner's limit). Degrees. */
  slopeLimitDeg: COST_CONSTANTS.SLOPE_LIMIT_DEG,
});

export const VERDICTS = Object.freeze(['worth', 'forced', 'risky', 'costly']);

/** Re-plans the system asked for: an event re-route to a shelter and the slope detour around no-go ground ahead. */
const SYSTEM_REPLANS = new Set(['event', 'slope']);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const isPoint = (p) => finite(p?.x) && finite(p?.z);

/** Track points with a usable position, in walking order. */
export function usableTrack(track) {
  return Array.isArray(track) ? track.filter(isPoint) : [];
}

/** Cumulative length along a list of points, cum[0] = 0. */
function cumulative(points, at) {
  const cum = [0];
  for (let k = 1; k < points.length; k += 1) {
    const [ax, az] = at(points[k - 1]);
    const [bx, bz] = at(points[k]);
    cum.push(cum[k - 1] + Math.hypot(bx - ax, bz - az));
  }
  return cum;
}

const pathXZ = (p) => p;
const pointXZ = (p) => [p.x, p.z];

/**
 * Distance along a path to the foot of the perpendicular from a point. The nearest segment wins.
 * @param {{ x: number, z: number }} point
 * @param {Array<[number, number]>} path
 * @param {number[]} cum cumulative length of the path
 * @returns {number} metres from the path's start
 */
export function distanceAlong(point, path, cum = cumulative(path, pathXZ)) {
  let best = Infinity;
  let along = 0;
  for (let k = 0; k < path.length - 1; k += 1) {
    const [ax, az] = path[k];
    const [bx, bz] = path[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / length2)) : 0;
    const d = Math.hypot(point.x - (ax + dx * t), point.z - (az + dz * t));
    if (d < best) {
      best = d;
      along = cum[k] + t * Math.sqrt(length2);
    }
  }
  return along;
}

/**
 * The deviations of a track from a path, with the hysteresis of REVIEW_RULES.
 * @param {Array<{ x: number, z: number, home?: boolean }>} track
 * @param {Array<[number, number]>} path
 * @param {typeof REVIEW_RULES} [rules]
 * @returns {Array<{ startIndex: number, crossIndex: number, endIndex: number, returned: boolean, offLengthM: number }>}
 *   startIndex: last point within exitM before the track left; crossIndex: first point beyond enterM; endIndex: first
 *   point back within exitM, or the last point when the track never came back (returned false)
 */
export function findDeviations(track, path, rules = REVIEW_RULES) {
  const points = usableTrack(track);
  if (points.length < 2 || !Array.isArray(path) || path.length < 2) return [];
  const off = points.map((p) => (p.home === true ? 0 : distanceToPath(p, path)));
  const cum = cumulative(points, pointXZ);
  const out = [];
  let lastOn = null;
  let open = null;

  const close = (end, returned) => {
    const offLengthM = cum[end] - cum[open.cross];
    if (offLengthM >= rules.minLengthM) out.push({ startIndex: open.start, crossIndex: open.cross, endIndex: end, returned, offLengthM });
    open = null;
  };

  for (let i = 0; i < points.length; i += 1) {
    if (open === null) {
      if (off[i] > rules.enterM) open = { start: lastOn ?? i, cross: i };
      else if (off[i] <= rules.exitM) lastOn = i;
    } else if (off[i] <= rules.exitM) {
      close(i, true);
      lastOn = i;
    }
  }
  if (open !== null) close(points.length - 1, false);
  return out;
}

/** Cost per metre of each leg of the plan, by distance along the plan path. null without usable legs. */
function legRates(legs) {
  const usable = Array.isArray(legs) ? legs.filter((leg) => finite(leg?.distanceM) && leg.distanceM > 0) : [];
  if (usable.length === 0) return null;
  let start = 0;
  return usable.map((leg, index) => {
    const range = {
      s0: start,
      s1: index === usable.length - 1 ? Infinity : start + leg.distanceM,
      timePerM: finite(leg.timeSec) ? leg.timeSec / leg.distanceM : null,
      o2PerM: finite(leg.o2G) ? leg.o2G / leg.distanceM : null,
    };
    start += leg.distanceM;
    return range;
  });
}

/** Distance, time and O2 of the plan between two distances along it. Time and O2 are null without leg costs. */
function plannedStretch(rates, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (!rates) return { distanceM: hi - lo, timeSec: null, o2G: null };
  let timeSec = 0;
  let o2G = 0;
  for (const range of rates) {
    const overlap = Math.max(0, Math.min(hi, range.s1) - Math.max(lo, range.s0));
    if (overlap <= 0) continue;
    timeSec = timeSec === null || range.timePerM === null ? null : timeSec + overlap * range.timePerM;
    o2G = o2G === null || range.o2PerM === null ? null : o2G + overlap * range.o2PerM;
  }
  return { distanceM: hi - lo, timeSec, o2G };
}

/** The plan waypoint nearest a point, or null. */
function nearestWaypoint(point, waypoints) {
  let best = null;
  for (const [index, w] of (Array.isArray(waypoints) ? waypoints : []).entries()) {
    if (!isPoint(w)) continue;
    const d = Math.hypot(w.x - point.x, w.z - point.z);
    if (!best || d < best.d) best = { d, index, name: typeof w.name === 'string' ? w.name : null };
  }
  return best ? { index: best.index, name: best.name } : null;
}

const minus = (a, b) => (finite(a) && finite(b) ? a - b : null);

/**
 * Price one deviation against the stretch of the plan it replaced.
 * @returns {{ walkedM: number, plannedM: number, extraM: number, elapsedSec: number | null, plannedSec: number | null,
 *   extraSec: number | null, usedO2G: number | null, plannedO2G: number | null, extraO2G: number | null,
 *   minMarginSec: number | null, maxSlopeDeg: number | null, steepestIndex: number | null, lowestIndex: number | null,
 *   farthestIndex: number }}
 */
function priceDeviation(points, cum, deviation, plan, measure) {
  const { startIndex: s, endIndex: e } = deviation;
  const a = points[s];
  const b = points[e];
  const walkedM = cum[e] - cum[s];
  const planned = plannedStretch(measure.rates, distanceAlong(a, plan.path, measure.cum), distanceAlong(b, plan.path, measure.cum));
  const elapsedSec = minus(b.atSec, a.atSec);
  const usedO2G = minus(a.o2G, b.o2G);
  let minMarginSec = null, lowestIndex = null, maxSlopeDeg = null, steepestIndex = null, farthest = -1, farthestIndex = s;
  for (let i = s; i <= e; i += 1) {
    const p = points[i];
    if (finite(p.marginSec) && (minMarginSec === null || p.marginSec < minMarginSec)) { minMarginSec = p.marginSec; lowestIndex = i; }
    if (finite(p.slopeDeg) && (maxSlopeDeg === null || p.slopeDeg > maxSlopeDeg)) { maxSlopeDeg = p.slopeDeg; steepestIndex = i; }
    const d = p.home === true ? 0 : distanceToPath(p, plan.path);
    if (d > farthest) { farthest = d; farthestIndex = i; }
  }
  return {
    walkedM,
    plannedM: planned.distanceM,
    extraM: walkedM - planned.distanceM,
    elapsedSec,
    plannedSec: planned.timeSec,
    extraSec: minus(elapsedSec, planned.timeSec),
    usedO2G,
    plannedO2G: planned.o2G,
    extraO2G: minus(usedO2G, planned.o2G),
    minMarginSec,
    maxSlopeDeg,
    steepestIndex,
    lowestIndex,
    farthestIndex,
  };
}

/** Finds and samples inside a stretch: marked or secured while it lasted, or (for an accepted find) walked to. */
function scienceInside(points, deviation, finds, samples, rules) {
  const t0 = points[deviation.startIndex].atSec;
  const t1 = points[deviation.endIndex].atSec;
  const offPart = points.slice(deviation.crossIndex, Math.max(deviation.crossIndex + 1, deviation.endIndex));
  const during = (item) => finite(item?.atSec) && finite(t0) && finite(t1) && item.atSec >= t0 && item.atSec <= t1;
  const near = (item) => isPoint(item) && offPart.some((p) => Math.hypot(p.x - item.x, p.z - item.z) <= rules.reachM);
  return {
    finds: finds.filter((f) => during(f) || (f?.accepted === true && near(f))),
    samples: samples.filter((s) => (finite(s?.atSec) ? during(s) : near(s))),
  };
}

/** The system re-plan this stretch follows, or null: planned before it started, and most of it walked along its path. */
function followedReplan(points, deviation, routeChanges, rules) {
  const crossSec = points[deviation.crossIndex].atSec;
  const offPart = points.slice(deviation.crossIndex, Math.max(deviation.crossIndex + 1, deviation.endIndex));
  for (const change of routeChanges) {
    if (!SYSTEM_REPLANS.has(change?.kind) || !finite(change.atSec) || !finite(crossSec) || change.atSec > crossSec) continue;
    const path = change.after?.path;
    if (!Array.isArray(path) || path.length < 2) continue;
    const along = offPart.filter((p) => distanceToPath(p, path) <= rules.enterM).length;
    if (along / offPart.length >= rules.followShare) return change;
  }
  return null;
}

/** Event ids running at any point of a range of the track, in order of appearance. */
function eventsIn(points, from, to) {
  const ids = [];
  for (let i = from; i <= to; i += 1) {
    const id = points[i].eventId;
    if (typeof id === 'string' && id !== '' && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The verdict and its one-line reason.
 * @returns {{ verdict: 'worth' | 'forced' | 'risky' | 'costly', reason: object }} reason.code names the rule:
 *   'slope' | 'event' | 'replan' | 'reserve' | 'late-event' | 'find' | 'sample' | 'none'
 */
function judge(points, deviation, cost, science, context, rules) {
  const near = (index) => nearestWaypoint(points[index ?? cost.farthestIndex], context.waypoints);
  const marginAt = (index) => (index !== null && finite(points[index]?.marginSec) ? points[index].marginSec : cost.minMarginSec);

  if (cost.maxSlopeDeg !== null && cost.maxSlopeDeg >= rules.slopeLimitDeg) {
    return {
      verdict: 'risky',
      reason: { code: 'slope', slopeDeg: cost.maxSlopeDeg, near: near(cost.steepestIndex), marginSec: marginAt(cost.steepestIndex) },
    };
  }
  const atStart = eventsIn(points, deviation.startIndex, deviation.crossIndex);
  if (atStart.length > 0) return { verdict: 'forced', reason: { code: 'event', eventId: atStart[0] } };
  const replan = followedReplan(points, deviation, context.routeChanges, rules);
  if (replan) return { verdict: 'forced', reason: { code: 'replan', kind: replan.kind, atSec: replan.atSec } };
  if (cost.minMarginSec !== null && cost.minMarginSec < rules.reserveMarginSec) {
    return { verdict: 'risky', reason: { code: 'reserve', marginSec: cost.minMarginSec, near: near(cost.lowestIndex) } };
  }
  const late = deviation.crossIndex < deviation.endIndex ? eventsIn(points, deviation.crossIndex + 1, deviation.endIndex) : [];
  if (late.length > 0) {
    const index = points.findIndex((p, i) => i > deviation.crossIndex && p.eventId === late[0]);
    return { verdict: 'risky', reason: { code: 'late-event', eventId: late[0], atSec: points[index]?.atSec ?? null } };
  }
  if (science.finds.length > 0) {
    return { verdict: 'worth', reason: { code: 'find', label: science.finds[0].label ?? null, marginSec: cost.minMarginSec } };
  }
  if (science.samples.length > 0) {
    return { verdict: 'worth', reason: { code: 'sample', count: science.samples.length, marginSec: cost.minMarginSec } };
  }
  return { verdict: 'costly', reason: { code: 'none', walkedM: cost.walkedM } };
}

/** Where each re-plan happened: its recorded position, or the track point nearest it in time. */
function replanMarks(routeChanges, points) {
  const out = [];
  for (const change of routeChanges) {
    if (!change || change.kind === 'initial' || !finite(change.atSec)) continue;
    let at = isPoint(change) ? { x: change.x, z: change.z } : null;
    if (!at && points.length > 0) {
      let best = null;
      for (const p of points) {
        if (!finite(p.atSec)) continue;
        const gap = Math.abs(p.atSec - change.atSec);
        if (!best || gap < best.gap) best = { gap, p };
      }
      if (best) at = { x: best.p.x, z: best.p.z };
    }
    if (at) out.push({ atSec: change.atSec, kind: change.kind ?? 'replan', reason: typeof change.reason === 'string' ? change.reason : null, ...at });
  }
  return out;
}

const sumOf = (deviations, key) => {
  const values = deviations.map((d) => d.cost[key]).filter(finite);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
};

/**
 * Review a frozen EVA summary.
 * @param {{ track?: object[], plan?: { path?: Array<[number, number]>, waypoints?: object[], legs?: object[] } | null,
 *   routeChanges?: object[], finds?: object[], samples?: object[] } | null} summary
 * @param {typeof REVIEW_RULES} [rules]
 * @returns {{ ok: boolean, track: object[], deviations: object[], counts: Record<string, number>,
 *   totals: { extraSec: number | null, extraO2G: number | null, extraM: number | null }, replans: object[] }}
 *   ok is false when there is no approved plan to compare with
 */
export function reviewRoute(summary, rules = REVIEW_RULES) {
  const points = usableTrack(summary?.track);
  const plan = summary?.plan;
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const routeChanges = Array.isArray(summary?.routeChanges) ? summary.routeChanges : [];
  const replans = replanMarks(routeChanges, points);
  if (!plan || !Array.isArray(plan.path) || plan.path.length < 2) {
    return { ok: false, track: points, deviations: [], counts, totals: { extraSec: null, extraO2G: null, extraM: null }, replans };
  }

  const measure = { cum: cumulative(plan.path, pathXZ), rates: legRates(plan.legs) };
  const trackCum = cumulative(points, pointXZ);
  const finds = Array.isArray(summary.finds) ? summary.finds : [];
  const samples = Array.isArray(summary.samples) ? summary.samples : [];
  const context = { waypoints: plan.waypoints, routeChanges };

  const deviations = findDeviations(points, plan.path, rules).map((deviation, index) => {
    const cost = priceDeviation(points, trackCum, deviation, plan, measure);
    const science = scienceInside(points, deviation, finds, samples, rules);
    const { verdict, reason } = judge(points, deviation, cost, science, context, rules);
    counts[verdict] += 1;
    const stretch = points.slice(deviation.startIndex, deviation.endIndex + 1);
    return {
      n: index + 1,
      verdict,
      reason,
      ...deviation,
      startSec: finite(stretch[0].atSec) ? stretch[0].atSec : null,
      endSec: finite(stretch.at(-1).atSec) ? stretch.at(-1).atSec : null,
      path: stretch.map((p) => [p.x, p.z]),
      at: { x: points[cost.farthestIndex].x, z: points[cost.farthestIndex].z },   // the point farthest from the plan
      cost,
      finds: science.finds.map((f) => f.label ?? null),
      samples: science.samples.length,
    };
  });

  return {
    ok: true,
    track: points,
    deviations,
    counts,
    totals: deviations.length === 0
      ? { extraSec: 0, extraO2G: 0, extraM: 0 }
      : { extraSec: sumOf(deviations, 'extraSec'), extraO2G: sumOf(deviations, 'extraO2G'), extraM: sumOf(deviations, 'extraM') },
    replans,
  };
}
