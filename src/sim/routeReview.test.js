import { describe, expect, it } from 'vitest';
import { COST_CONSTANTS } from './costGrid.js';
import { distanceAlong, findDeviations, REVIEW_RULES, reviewRoute } from './routeReview.js';

// A straight plan east along z = 0: HAB at the origin, WP1 at 200 m, the target at 400 m. Each leg is 200 m, walked at
// 1 m/s with 0.1 g of O2 per metre in the plan.
const PLAN = {
  path: [[0, 0], [200, 0], [400, 0]],
  waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP1 · channel floor', x: 200, z: 0 }, { name: 'Cheyava Falls', x: 400, z: 0 }],
  legs: [
    { from: 'HAB', to: 'WP1 · channel floor', distanceM: 200, timeSec: 200, o2G: 20 },
    { from: 'WP1 · channel floor', to: 'Cheyava Falls', distanceM: 200, timeSec: 200, o2G: 20 },
  ],
};

const STEP_M = 2;
const O2_PER_M = 0.12;   // the walked track uses a little more O2 per metre than the plan

/**
 * A synthetic track along a polyline of corners: a point every 2 m and at every corner, walked at 1 m/s from t = 0,
 * O2 falling 0.12 g/m from 600 g, the margin falling 1 s per metre from 3000 s, 5° under the feet and no event.
 * `edit(point, s)` changes any field of a point at walked distance s.
 */
function walk(corners, edit = () => ({})) {
  const points = [];
  let s = 0;
  const push = (x, z) => {
    const base = { x, z, atSec: s, marginSec: 3000 - s, slopeDeg: 5, eventId: null, o2G: 600 - O2_PER_M * s, home: false };
    points.push({ ...base, ...edit(base, s) });
  };
  push(corners[0][0], corners[0][1]);
  for (let k = 1; k < corners.length; k += 1) {
    const [ax, az] = corners[k - 1];
    const [bx, bz] = corners[k];
    const length = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(length / STEP_M));
    for (let i = 1; i <= n; i += 1) {
      s += length / n;
      push(ax + (bx - ax) * i / n, az + (bz - az) * i / n);
    }
  }
  return points;
}

const review = (track, extra = {}) => reviewRoute({ track, plan: PLAN, routeChanges: [], finds: [], samples: [], ...extra });
/** Mission time at which a track first reaches a point. */
const timeAt = (track, predicate) => track.find(predicate).atSec;

describe('route review thresholds', () => {
  it('reads the slope limit from the planner constants and keeps the 15 m / 10 m / 20 m hysteresis', () => {
    expect(REVIEW_RULES.slopeLimitDeg).toBe(COST_CONSTANTS.SLOPE_LIMIT_DEG);
    expect(REVIEW_RULES).toMatchObject({ enterM: 15, exitM: 10, minLengthM: 20, reserveMarginSec: 0 });
    expect(REVIEW_RULES.exitM).toBeLessThan(REVIEW_RULES.enterM);
  });

  it('measures distance along the plan to the foot of the perpendicular', () => {
    expect(distanceAlong({ x: 150, z: 30 }, PLAN.path)).toBeCloseTo(150, 9);
    expect(distanceAlong({ x: 420, z: 0 }, PLAN.path)).toBeCloseTo(400, 9);
  });
});

describe('finding deviations', () => {
  it('finds none when the walk follows the plan, with a few metres of wander', () => {
    const track = walk([[0, 0], [100, 4], [200, -6], [300, 3], [400, 0]]);
    const result = review(track);
    expect(result.ok).toBe(true);
    expect(result.deviations).toEqual([]);
    expect(result.totals).toEqual({ extraSec: 0, extraO2G: 0, extraM: 0 });
    expect(result.counts).toEqual({ worth: 0, forced: 0, risky: 0, costly: 0 });
  });

  it('does not count a step 16 m off the route and back: under 20 m walked beyond the line', () => {
    const track = walk([[0, 0], [100, 0], [100, 16], [100, 0], [400, 0]]);
    expect(findDeviations(track, PLAN.path)).toEqual([]);
  });

  it('does not count walking exactly 15 m off the route: only farther than 15 m starts one', () => {
    const track = walk([[0, 0], [100, 0], [100, 15], [300, 15], [300, 0], [400, 0]]);
    expect(findDeviations(track, PLAN.path)).toEqual([]);
  });

  it('counts the same excursion once it lasts 20 m beyond the line', () => {
    // Out to 18 m, 4 m along it, back to 10 m: about 2 + 4 + 8 = 14 m walked beyond 15 m. Not enough.
    expect(findDeviations(walk([[0, 0], [100, 0], [100, 18], [104, 18], [104, 0], [400, 0]]), PLAN.path)).toEqual([]);
    // 30 m along the edge at 18 m: well past 20 m beyond the line.
    const [one] = findDeviations(walk([[0, 0], [100, 0], [100, 18], [130, 18], [130, 0], [400, 0]]), PLAN.path);
    expect(one.returned).toBe(true);
    expect(one.offLengthM).toBeGreaterThanOrEqual(REVIEW_RULES.minLengthM);
  });

  it('keeps one detour in one piece while the track dips between 10 and 15 m (hysteresis)', () => {
    const track = walk([[0, 0], [100, 0], [100, 30], [140, 30], [140, 12], [160, 12], [160, 30], [200, 30], [200, 0], [400, 0]]);
    const deviations = findDeviations(track, PLAN.path);
    expect(deviations).toHaveLength(1);
    // It starts at the last point within 10 m before the track left and ends at the first point back within 10 m.
    const [d] = deviations;
    expect(track[d.startIndex]).toMatchObject({ x: 100 });
    expect(Math.abs(track[d.startIndex].z)).toBeLessThanOrEqual(REVIEW_RULES.exitM);
    expect(track[d.crossIndex].z).toBeGreaterThan(REVIEW_RULES.enterM);
    expect(track[d.endIndex]).toMatchObject({ x: 200 });
    expect(track[d.endIndex].z).toBeLessThanOrEqual(REVIEW_RULES.exitM);
  });

  it('splits two detours that come back within 10 m between them', () => {
    const track = walk([[0, 0], [100, 0], [100, 30], [140, 30], [140, 5], [160, 5], [160, 30], [200, 30], [200, 0], [400, 0]]);
    expect(findDeviations(track, PLAN.path)).toHaveLength(2);
  });

  it('keeps a detour that never came back, and never counts the habitat as off the route', () => {
    const open = findDeviations(walk([[0, 0], [100, 0], [100, 60], [200, 60]]), PLAN.path);
    expect(open).toHaveLength(1);
    expect(open[0].returned).toBe(false);
    const home = walk([[0, 0], [0, 40], [0, 0]], () => ({ home: true }));
    expect(findDeviations(home, PLAN.path)).toEqual([]);
  });
});

describe('pricing a deviation', () => {
  it('prices a detour against the stretch of the plan it replaced', () => {
    const track = walk([[0, 0], [150, 0], [200, 60], [250, 0], [400, 0]]);
    const [d] = review(track).deviations;
    const { cost } = d;
    // Walked: the two sides of the triangle from the departure point to the return point. Planned: the base below them.
    expect(cost.walkedM).toBeGreaterThan(cost.plannedM);
    expect(cost.plannedM).toBeCloseTo(track[d.endIndex].x - track[d.startIndex].x, 6);
    expect(cost.extraM).toBeCloseTo(cost.walkedM - cost.plannedM, 9);
    // 1 m/s on the track and in the plan: extra time is the extra distance; extra O2 is 0.12 g/m walked minus 0.1 g/m planned.
    expect(cost.extraSec).toBeCloseTo(cost.extraM, 6);
    expect(cost.extraO2G).toBeCloseTo(O2_PER_M * cost.walkedM - 0.1 * cost.plannedM, 6);
    expect(cost.minMarginSec).toBeCloseTo(3000 - track[d.endIndex].atSec, 6);
    expect(cost.maxSlopeDeg).toBe(5);
  });

  it('prices across two legs with their own rates', () => {
    const plan = { ...PLAN, legs: [PLAN.legs[0], { ...PLAN.legs[1], timeSec: 400, o2G: 60 }] };
    const track = walk([[0, 0], [150, 0], [150, 60], [250, 60], [250, 0], [400, 0]]);
    const [d] = reviewRoute({ track, plan }).deviations;
    const a = track[d.startIndex].x, b = track[d.endIndex].x;
    expect(d.cost.plannedSec).toBeCloseTo((200 - a) * 1 + (b - 200) * 2, 6);
    expect(d.cost.plannedO2G).toBeCloseTo((200 - a) * 0.1 + (b - 200) * 0.3, 6);
  });

  it('leaves time and O2 unknown without per-leg costs instead of inventing them', () => {
    const track = walk([[0, 0], [150, 0], [200, 60], [250, 0], [400, 0]]);
    const [d] = reviewRoute({ track, plan: { ...PLAN, legs: [] } }).deviations;
    expect(d.cost.extraSec).toBeNull();
    expect(d.cost.extraO2G).toBeNull();
    expect(d.cost.extraM).toBeGreaterThan(0);
  });
});

describe('judging a deviation', () => {
  const detour = [[0, 0], [150, 0], [200, 60], [250, 0], [400, 0]];
  const inDetour = (p) => p.z > 20;

  it('calls a detour to a marked find with margin above the reserve worth it, with its extra minutes and O2', () => {
    const track = walk(detour);
    const result = review(track, { finds: [{ id: 'find-1', label: 'M01', x: 200, z: 60, atSec: 30, accepted: true }] });
    const [d] = result.deviations;
    expect(d.verdict).toBe('worth');
    expect(d.reason).toMatchObject({ code: 'find', label: 'M01' });
    expect(d.reason.marginSec).toBeGreaterThan(0);
    expect(d.cost.extraSec).toBeGreaterThan(0);
    expect(d.cost.extraO2G).toBeGreaterThan(0);
    expect(d.finds).toEqual(['M01']);
    expect(result.counts.worth).toBe(1);
    expect(result.totals.extraSec).toBeCloseTo(d.cost.extraSec, 9);
    expect(result.totals.extraO2G).toBeCloseTo(d.cost.extraO2G, 9);
  });

  it('calls a find marked while off the route worth it too, and a sample secured in the stretch', () => {
    const track = walk(detour);
    const marked = review(track, { finds: [{ label: 'M02', x: 900, z: 900, atSec: timeAt(track, inDetour), accepted: false }] });
    expect(marked.deviations[0]).toMatchObject({ verdict: 'worth', reason: { code: 'find', label: 'M02' } });
    const sampled = review(track, { samples: [{ id: 1, kind: 'rock', x: 200, z: 60, atSec: timeAt(track, inDetour) }] });
    expect(sampled.deviations[0]).toMatchObject({ verdict: 'worth', reason: { code: 'sample', count: 1 } });
  });

  it('calls walking across a slope at or above 20° risky, even with a sample taken in the same stretch', () => {
    const steep = walk(detour, (p) => (p.z > 30 ? { slopeDeg: 23 } : {}));
    const sample = { id: 1, kind: 'rock', x: 200, z: 60, atSec: timeAt(steep, inDetour) };
    const [d] = review(steep, { samples: [sample] }).deviations;
    expect(d.verdict).toBe('risky');
    expect(d.reason).toMatchObject({ code: 'slope', slopeDeg: 23, near: { name: 'WP1 · channel floor' } });
    expect(d.reason.marginSec).toBeGreaterThan(0);
    expect(d.samples).toBe(1);

    const atLimit = walk(detour, (p) => (p.z > 30 ? { slopeDeg: REVIEW_RULES.slopeLimitDeg } : {}));
    expect(review(atLimit).deviations[0].verdict).toBe('risky');
    const under = walk(detour, (p) => (p.z > 30 ? { slopeDeg: REVIEW_RULES.slopeLimitDeg - 0.1 } : {}));
    expect(review(under).deviations[0].verdict).toBe('costly');
  });

  it('calls a detour started during a dust storm or an SPE forced', () => {
    for (const eventId of ['dust-storm', 'radiation']) {
      const track = walk(detour, (p, s) => (s >= 100 ? { eventId } : {}));
      const [d] = review(track).deviations;
      expect(d.verdict).toBe('forced');
      expect(d.reason).toEqual({ code: 'event', eventId });
    }
  });

  it('keeps a forced detour forced when the margin is already under the reserve, but not across a no-go slope', () => {
    const warning = walk(detour, (p, s) => (s >= 100 ? { eventId: 'low-oxygen-warning', marginSec: -60 } : {}));
    expect(review(warning).deviations[0]).toMatchObject({ verdict: 'forced', reason: { code: 'event' } });
    const steep = walk(detour, (p, s) => ({ ...(s >= 100 ? { eventId: 'dust-storm' } : {}), ...(p.z > 30 ? { slopeDeg: 24 } : {}) }));
    expect(review(steep).deviations[0]).toMatchObject({ verdict: 'risky', reason: { code: 'slope' } });
  });

  it('keeps a forced detour forced when a second alert starts during it, with its lowest margin', () => {
    // A dust storm runs from before the departure; an SPE starts while the crew is off the route. The track keeps the
    // event that started last (src/state/eva.js), so the second alert shows up as a new event id mid-stretch.
    const track = walk(detour, (p, s) => (s >= 200 ? { eventId: 'radiation' } : s >= 100 ? { eventId: 'dust-storm' } : {}));
    const [d] = review(track).deviations;
    expect(track[d.crossIndex].atSec).toBeLessThan(200);
    expect(track.slice(d.crossIndex + 1, d.endIndex + 1).some((p) => p.eventId === 'radiation')).toBe(true);
    expect(d).toMatchObject({ verdict: 'forced', reason: { code: 'event', eventId: 'dust-storm' } });
    expect(d.cost.minMarginSec).toBeCloseTo(3000 - track[d.endIndex].atSec, 6);
    // Without the storm at the start, the same SPE makes it risky: still off the route when an alert started.
    const late = walk(detour, (p, s) => (s >= 200 ? { eventId: 'radiation' } : {}));
    expect(review(late).deviations[0]).toMatchObject({ verdict: 'risky', reason: { code: 'late-event' } });
  });

  it('calls a detour that follows a slope detour the system planned forced, and an off-route re-plan not', () => {
    const track = walk(detour);
    const detourPath = [[150, 0], [200, 60], [250, 0], [400, 0]];
    const slope = review(track, { routeChanges: [{ atSec: 140, kind: 'slope', reason: 'Detour: steeper than 25° ahead', after: { path: detourPath } }] });
    expect(slope.deviations[0]).toMatchObject({ verdict: 'forced', reason: { code: 'replan', kind: 'slope', atSec: 140 } });
    // Planned after the detour began: it did not cause it.
    const late = review(track, { routeChanges: [{ atSec: 9999, kind: 'slope', after: { path: detourPath } }] });
    expect(late.deviations[0].verdict).toBe('costly');
    const offRoute = review(track, { routeChanges: [{ atSec: 140, kind: 'offroute', after: { path: detourPath } }] });
    expect(offRoute.deviations[0].verdict).toBe('costly');
    // A system re-plan somewhere else does not excuse this walk.
    const elsewhere = review(track, { routeChanges: [{ atSec: 140, kind: 'event', after: { path: [[0, 0], [0, -300]] } }] });
    expect(elsewhere.deviations[0].verdict).toBe('costly');
  });

  it('calls a detour risky when the margin went under the reserve, even to a find', () => {
    const track = walk(detour, (p) => (p.z > 40 ? { marginSec: -120 } : {}));
    const [d] = review(track, { finds: [{ label: 'M01', x: 200, z: 60, atSec: 30, accepted: true }] }).deviations;
    expect(d).toMatchObject({ verdict: 'risky', reason: { code: 'reserve', marginSec: -120 } });
  });

  it('calls a detour risky when the player was still off the route when an event started', () => {
    const track = walk(detour, (p, s) => (s >= 200 ? { eventId: 'radiation' } : {}));
    const [d] = review(track).deviations;
    expect(d).toMatchObject({ verdict: 'risky', reason: { code: 'late-event', eventId: 'radiation' } });
    expect(d.reason.atSec).toBeGreaterThan(track[d.crossIndex].atSec);
  });

  it('calls a detour with none of that costly', () => {
    const result = review(walk(detour));
    expect(result.deviations[0]).toMatchObject({ n: 1, verdict: 'costly', reason: { code: 'none' } });
    expect(result.counts).toEqual({ worth: 0, forced: 0, risky: 0, costly: 1 });
  });

  it('numbers deviations in walking order and sums their costs', () => {
    const track = walk([[0, 0], [50, 0], [80, 40], [110, 0], [250, 0], [280, -40], [310, 0], [400, 0]], (p) => (p.x > 200 && p.z < -30 ? { slopeDeg: 22 } : {}));
    const result = review(track, { finds: [{ label: 'M01', x: 80, z: 40, atSec: 1, accepted: true }] });
    expect(result.deviations.map((d) => [d.n, d.verdict])).toEqual([[1, 'worth'], [2, 'risky']]);
    expect(result.totals.extraM).toBeCloseTo(result.deviations[0].cost.extraM + result.deviations[1].cost.extraM, 9);
    expect(result.deviations[0].path[0]).toEqual([track[result.deviations[0].startIndex].x, track[result.deviations[0].startIndex].z]);
  });
});

describe('the rest of the review', () => {
  it('has nothing to compare without an approved plan', () => {
    const result = reviewRoute({ track: walk([[0, 0], [100, 0]]), plan: null });
    expect(result.ok).toBe(false);
    expect(result.deviations).toEqual([]);
  });

  it('places each re-plan where it happened: its recorded position, or the track point nearest in time', () => {
    const track = walk([[0, 0], [400, 0]]);
    const { replans } = review(track, {
      routeChanges: [
        { atSec: 0, kind: 'initial', after: { path: PLAN.path } },
        { atSec: 50, kind: 'offroute', reason: 'Off route: new route from your position', x: 51, z: 3 },
        { atSec: 120, kind: 'event', reason: 'Dust storm' },
      ],
    });
    expect(replans).toEqual([
      { atSec: 50, kind: 'offroute', reason: 'Off route: new route from your position', x: 51, z: 3 },
      { atSec: 120, kind: 'event', reason: 'Dust storm', x: 120, z: 0 },
    ]);
  });
});
