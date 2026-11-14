import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRouteProgress, resampleRoute, routeSignature, validRoutePath } from './minimapRoute.js';

const readJson = (path) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'));

const routeJson = readJson('public/marswalk/assets/route.json');
const PATH = routeJson.waypoints.map((w) => [w.x, w.z]);
const TOTAL_M = 894.99861;

function pointAt(path, distance) {
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const d = Math.hypot(bx - ax, bz - az);
    if (left <= d) {
      const t = Math.max(0, Math.min(1, left / d));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t };
    }
    left -= d;
  }
  const [x, z] = path[path.length - 1];
  return { x, z };
}

/** A point `offsetM` metres left of the route at `distance`, used to test the 12 m lateral limit. */
function offsetAt(path, distance, offsetM) {
  const p = pointAt(path, distance);
  const q = pointAt(path, Math.min(TOTAL_M, distance + 1));
  const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1;
  return { x: p.x - (dz / d) * offsetM, z: p.z + (dx / d) * offsetM };
}

function walkTo(tracker, path, upToM, stepM = 20) {
  let state = tracker.get();
  for (let d = 0; ; d += stepM) {
    const at = Math.min(d, upToM);
    state = tracker.update(pointAt(path, at));
    if (at >= upToM) return state;
  }
}

describe('route resampling', () => {
  it('accepts the real route and samples it at most one metre apart', () => {
    expect(validRoutePath(PATH)).toBe(true);
    expect(validRoutePath(PATH.slice(0, 1))).toBe(false);
    expect(validRoutePath([[0, 0], [1, NaN]])).toBe(false);
    const samples = resampleRoute(PATH);
    expect(samples.total).toBeCloseTo(TOTAL_M, 4);
    for (let i = 1; i < samples.points.length; i++) {
      const gap = samples.points[i].len - samples.points[i - 1].len;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThanOrEqual(1.000001);
    }
  });
});

describe('route progress following routeGlow rules', () => {
  it('advances along the five real waypoints and reports walked and remaining separately', () => {
    const tracker = createRouteProgress();
    tracker.setPath(PATH);
    let state = tracker.update(pointAt(PATH, 0));
    expect(state).toMatchObject({ hasRoute: true, progressM: 0, offRoute: false });
    expect(state.totalM).toBeCloseTo(TOTAL_M, 4);
    expect(state.remainingM).toBeCloseTo(TOTAL_M, 4);

    for (let d = 20; d < TOTAL_M; d += 20) {
      state = tracker.update(pointAt(PATH, d));
      expect(state.progressM).toBeCloseTo(d, 0);
      expect(Math.abs(state.progressM - d)).toBeLessThan(0.6);
      expect(state.remainingM).toBeCloseTo(state.totalM - state.progressM, 9);
      expect(state.offRoute).toBe(false);
    }

    state = tracker.update(pointAt(PATH, TOTAL_M));
    expect(state.progressM).toBeCloseTo(TOTAL_M, 3);
    expect(state.remainingM).toBeCloseTo(0, 3);
  });

  it('allows walking backwards along the route', () => {
    const tracker = createRouteProgress();
    tracker.setPath(PATH);
    walkTo(tracker, PATH, 500);
    const at500 = tracker.get().progressM;
    expect(at500).toBeCloseTo(500, 0);

    for (const d of [490, 480, 470]) {
      const state = tracker.update(pointAt(PATH, d));
      expect(state.progressM).toBeCloseTo(d, 0);
      expect(state.progressM).toBeLessThan(at500);
      expect(state.offRoute).toBe(false);
    }
  });

  it('keeps the last progress when the astronaut leaves the route', () => {
    const tracker = createRouteProgress();
    tracker.setPath(PATH);
    walkTo(tracker, PATH, 500);
    const before = tracker.get().progressM;

    const outside = offsetAt(PATH, 500, 12.5);
    let state = tracker.update(outside);
    expect(state.offRoute).toBe(true);
    expect(state.progressM).toBeCloseTo(before, 9);

    const inside = offsetAt(PATH, 500, 5);
    state = tracker.update(inside);
    expect(state.offRoute).toBe(false);
    expect(state.progressM).toBeCloseTo(before, 0);
  });

  it('resets only when the route changes, not when the same points arrive in a new array', () => {
    const tracker = createRouteProgress();
    tracker.setPath(PATH);
    walkTo(tracker, PATH, 200);
    expect(routeSignature(PATH)).toBe(routeSignature(PATH.map((p) => [...p])));
    tracker.setPath(PATH.map((p) => [...p]));
    expect(tracker.get().progressM).toBeCloseTo(200, 0);

    tracker.setPath([[0, 0], [100, 0]]);
    expect(tracker.get()).toMatchObject({ hasRoute: true, progressM: 0, totalM: 100, remainingM: 100 });
    tracker.update({ x: 40, z: 0 });
    expect(tracker.get().progressM).toBeCloseTo(40, 6);

    tracker.setPath(null);
    expect(tracker.get()).toEqual({ hasRoute: false, progressM: null, totalM: null, remainingM: null, offRoute: false });
  });

  it('does not jump to a later pass when the route crosses itself', () => {
    const cross = [[0, 0], [100, 100], [0, 100], [100, 0]];   // crosses at (50, 50)
    const total = resampleRoute(cross).total;
    const tracker = createRouteProgress();
    tracker.setPath(cross);
    tracker.update({ x: 0, z: 0 });
    for (let d = 10; d <= 70; d += 10) tracker.update(pointAt(cross, d));
    const firstPass = tracker.get().progressM;
    expect(firstPass).toBeGreaterThan(60);
    expect(firstPass).toBeLessThan(80);

    const atCrossing = tracker.update({ x: 50, z: 50 });
    expect(atCrossing.progressM).toBeLessThan(100);   // not the 312 m crossing on the way back

    for (let d = 80; d <= total; d += 10) tracker.update(pointAt(cross, d));
    expect(tracker.get().progressM).toBeGreaterThan(300);
    for (let d = total - 10; d >= 310; d -= 10) tracker.update(pointAt(cross, d));
    const secondPass = tracker.update({ x: 50, z: 50 }).progressM;
    expect(secondPass).toBeCloseTo(312.13, 0);
  });

  it('stays put without a route, a position or a valid path', () => {
    const tracker = createRouteProgress();
    expect(tracker.update({ x: 0, z: 0 })).toMatchObject({ hasRoute: false, progressM: null });
    tracker.setPath([[0, 0], [10, 0]]);
    expect(tracker.update({ x: null, z: 5 }).progressM).toBe(0);
    tracker.setPath([[0, 0], [10, NaN]]);
    expect(tracker.get().hasRoute).toBe(false);
  });
});

// App owns one tracker for the whole session because the HUD is unmounted in Plan mode. These tests
// drive that lifetime through the public tracker contract: remounting re-syncs the route, a pause does
// not touch the progress, and a new route content starts at 0.
describe('tracker lifetime across Plan and Walk', () => {
  it('keeps the walked distance when the minimap remounts with the same route', () => {
    const tracker = createRouteProgress();
    tracker.setPath(PATH);
    walkTo(tracker, PATH, 240);
    const walked = tracker.get();
    expect(walked.progressM).toBeCloseTo(240, 0);

    // Walk -> Plan: the HUD unmounts, so nothing updates the tracker; its snapshot must not change.
    expect(tracker.get()).toEqual(walked);

    // Plan -> Walk: the new Minimap mount re-syncs the same route content and must not reset it.
    tracker.setPath(PATH.map((p) => [...p]));
    expect(tracker.get()).toEqual(walked);

    const next = tracker.update(pointAt(PATH, 260));
    expect(next.progressM).toBeCloseTo(260, 0);
    expect(next.offRoute).toBe(false);
  });

  it('resets to 0 when the route content changes during a pause in Walk mode', () => {
    const tracker = createRouteProgress();
    tracker.setPath(PATH);
    walkTo(tracker, PATH, 240);
    // No update while the HUD is away (Plan), then a re-plan changes the route.
    tracker.setPath([[10, 10], [60, 10], [60, 40]]);
    expect(tracker.get()).toMatchObject({ hasRoute: true, progressM: 0, totalM: 80, remainingM: 80, offRoute: false });
  });

  it('does not seed a new route from a position already far along it', () => {
    const tracker = createRouteProgress();
    tracker.setPath(PATH);
    const at300 = tracker.update(pointAt(PATH, 300));
    // Progress means ground actually walked: starting 300 m along leaves the whole route as remaining.
    expect(at300).toMatchObject({ hasRoute: true, progressM: 0, offRoute: true });
    expect(at300.remainingM).toBeCloseTo(TOTAL_M, 4);

    // Walking back to the beginning starts the count there.
    expect(tracker.update(pointAt(PATH, 0))).toMatchObject({ progressM: 0, offRoute: false });
    expect(tracker.update(pointAt(PATH, 10)).progressM).toBeCloseTo(10, 0);
  });

  it('reports walking back along a route that doubles back as backwards progress', () => {
    // Out and back on the same line: the tracker stays on the pass already walked instead of jumping
    // to the untravelled second pass. Walking back is allowed and lowers the number (routeGlow rule).
    const path = [[0, 0], [100, 0], [0, 0]];
    const tracker = createRouteProgress();
    tracker.setPath(path);
    walkTo(tracker, path, 100, 20);
    expect(tracker.get().progressM).toBeCloseTo(100, 0);

    let previous = 100;
    for (const d of [90, 80, 70]) {
      const state = tracker.update(pointAt(path, d));
      expect(state.progressM).toBeCloseTo(d, 0);
      expect(state.progressM).toBeLessThan(previous);
      expect(state.offRoute).toBe(false);
      previous = state.progressM;
    }
  });

  it('follows a nearer branch inside the window: close branches stay ambiguous', () => {
    // A 40 x 6 m loop: the return edge is 6 m from the outbound edge, so both sit inside the 12 m
    // corridor and the 60 m window. A position nearer the return edge is counted on that branch.
    const loop = [[0, 0], [40, 0], [40, 6], [0, 6], [0, 0]];
    const tracker = createRouteProgress();
    tracker.setPath(loop);
    tracker.update({ x: 0, z: 0 });
    expect(tracker.update({ x: 20, z: 0 }).progressM).toBeCloseTo(20, 1);
    const nearerReturn = tracker.update({ x: 20, z: 4 });   // 4 m from the outbound edge, 2 m from the return
    expect(nearerReturn.progressM).toBeGreaterThan(40);
    expect(nearerReturn.offRoute).toBe(false);
  });

  it('keeps separate progress for separate trackers: there is no shared singleton', () => {
    const a = createRouteProgress();
    const b = createRouteProgress();
    a.setPath(PATH);
    b.setPath(PATH);
    walkTo(a, PATH, 300);
    expect(b.update(pointAt(PATH, 0)).progressM).toBe(0);
    expect(a.get().progressM).toBeCloseTo(300, 0);
  });
});
