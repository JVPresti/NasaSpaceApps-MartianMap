import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCostGrid, heightAt } from './costGrid.js';
import { combinedTag, legCostSources, routeLegCosts, splitAtWaypoints, startLegCostRunner } from './legCosts.js';
import { planRoute } from './routePlanner.js';
import { metabolicPowerW, o2RateGs, suitConstantsFromHazards } from './suitModel.js';

const readJson = (p) => JSON.parse(readFileSync(fileURLToPath(new URL('../../' + p, import.meta.url)), 'utf8'));
const hazards = readJson('public/data/hazards.json');
const c = suitConstantsFromHazards(hazards);
const tan = (d) => Math.tan(d * Math.PI / 180);
const flat = () => 0;

describe('splitting a path at its waypoints', () => {
  it('cuts at the vertices that match the waypoints', () => {
    const wps = [{ name: 'A', x: 0, z: 0 }, { name: 'B', x: 100, z: 0 }, { name: 'C', x: 100, z: 100 }];
    const path = [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100]];
    const legs = splitAtWaypoints(path, wps);
    expect(legs.map((l) => l.path)).toEqual([[[0, 0], [50, 0], [100, 0]], [[100, 0], [100, 50], [100, 100]]]);
    expect(legs.map((l) => l.to.name)).toEqual(['B', 'C']);
  });

  it('ends a leg at the nearest vertex when the planner stopped short of a blocked waypoint', () => {
    const wps = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }];
    const legs = splitAtWaypoints([[0, 0], [88, 6], [200, 0]], wps);
    expect(legs[0].path).toEqual([[0, 0], [88, 6]]);
    expect(legs[1].path).toEqual([[88, 6], [200, 0]]);
  });

  it('treats a path without waypoints as one leg', () => {
    expect(splitAtWaypoints([[0, 0], [10, 0]], [])).toHaveLength(1);
  });
});

describe('cost of a leg', () => {
  const legOf = (h) => routeLegCosts([[0, 0], [1000, 0]], [{ x: 0, z: 0 }, { x: 1000, z: 0 }], h, c).legs[0];

  it('a flat 1 km and a 1 km climb at 20 degrees give clearly different time and O2', () => {
    const level = legOf(flat), climb = legOf((x) => x * tan(20));
    const k = hazards.models.walking_metabolic.checks;
    expect(level.o2G).toBeCloseTo(k['flat_1km_at_1.0_m_s'].o2_g, 0);           // 40 g
    expect(level.timeSec / 60).toBeCloseTo(k['flat_1km_at_1.0_m_s'].time_min, 0); // 16.7 min
    expect(climb.o2G).toBeCloseTo(k.climb_1km_along_20deg_constant_effort.o2_g, -1); // 142 g
    expect(climb.o2G / level.o2G).toBeGreaterThan(3);
    expect(climb.timeSec / level.timeSec).toBeGreaterThan(3);
    expect(climb.batteryWh).toBeGreaterThan(level.batteryWh);
    expect(climb.climbM).toBeCloseTo(1000 * tan(20), 0);
    expect(climb.maxSlopeDeg).toBeCloseTo(20, 1);
    expect(level.maxSlopeDeg).toBe(0);
  });

  it('uphill and downhill over the same ground differ', () => {
    const ramp = (x) => x * tan(10), wps = [{ x: 0, z: 0 }, { x: 500, z: 0 }];
    const up = routeLegCosts([[0, 0], [500, 0]], wps, ramp, c).legs[0];
    const down = routeLegCosts([[500, 0], [0, 0]], [...wps].reverse(), ramp, c).legs[0];
    expect(up.distanceM).toBeCloseTo(down.distanceM, 6);
    expect(up.climbM).toBeCloseTo(down.descentM, 6);
    expect(up.timeSec).toBeGreaterThan(down.timeSec * 1.5);
    expect(up.o2G).toBeGreaterThan(down.o2G * 1.5);
  });
});

describe('totals and the margin at the habitat', () => {
  const hills = (x, z) => 20 * Math.sin(x / 80) + 10 * Math.cos(z / 60);
  const wps = [{ name: 'HAB', x: 0, z: 0 }, { name: 'A', x: 300, z: 0 }, { name: 'B', x: 300, z: 400 }, { name: 'C', x: 0, z: 500 }];
  const r = routeLegCosts(wps.map((w) => [w.x, w.z]), wps, hills, c);

  it('the totals are the sums of the legs', () => {
    for (const key of ['distanceM', 'climbM', 'descentM', 'timeSec', 'o2G', 'o2Pct', 'batteryWh', 'batteryPct']) {
      expect(r.totals[key]).toBeCloseTo(r.legs.reduce((a, l) => a + l[key], 0), 9);
    }
    expect(r.totals.maxSlopeDeg).toBe(Math.max(...r.legs.map((l) => l.maxSlopeDeg)));
  });

  it('walks home along the same path with the 20 % pad and keeps the 30 min reserve out of the margin', () => {
    const t = r.totals;
    expect(t.returnDistanceM).toBeCloseTo(t.distanceM, 6);
    expect(t.returnO2G).toBeGreaterThan(t.o2G);   // the pad, whatever the hills do
    expect(t.arrivalO2G).toBeCloseTo(c.o2UsableG - t.o2G - t.returnO2G, 9);
    const rate = o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);
    expect(t.marginSec).toBeCloseTo(t.arrivalO2G / rate - c.reserveSec, 6);
    expect(t.status).toBe('nominal');
  });

  it('caps the margin at the end of the plan at the EVA time left after the walk out and back (#195)', () => {
    const short = { ...c, evaMaxSec: 3600 };
    const t = routeLegCosts(wps.map((w) => [w.x, w.z]), wps, hills, short).totals;
    expect(t.marginSec).toBeCloseTo(3600 - t.timeSec - t.returnTimeSec, 6);
    expect(r.totals.marginSec).toBeLessThan(c.evaMaxSec);
  });

  it('adds no walk home to a round trip', () => {
    const loop = [...wps, wps[0]];
    const t = routeLegCosts(loop.map((w) => [w.x, w.z]), loop, hills, c).totals;
    expect(t.roundTrip).toBe(true);
    expect(t.returnO2G).toBe(0);
  });

  it('turns warning when the tank cannot cover a long route and the walk home', () => {
    const far = [{ x: 0, z: 0 }, { x: 9000, z: 0 }];
    expect(routeLegCosts(far.map((w) => [w.x, w.z]), far, flat, c).totals.status).toBe('warning');
  });
});

describe('tags from hazards.json', () => {
  it('takes the weakest tag of the inputs, never better than DERIVED', () => {
    expect(combinedTag(hazards, ['metabolic.model_mass'])).toBe('DERIVED');
    expect(combinedTag(hazards, ['metabolic.model_mass', 'mobility.speed.flat'])).toBe('SIM');
    expect(() => combinedTag(hazards, ['no.such.value'])).toThrow();
  });

  it('tags geometry DERIVED and time, O2 and battery SIM, because the speed rule is SIM', () => {
    const s = legCostSources(hazards);
    expect(s['route.legs.distanceM'].tag).toBe('DERIVED');
    expect(s['route.legs.maxSlopeDeg'].tag).toBe('DERIVED');
    expect(s['route.legs.timeSec'].tag).toBe('SIM');
    expect(s['route.legs.o2G'].tag).toBe('SIM');
    expect(s['route.legs.batteryPct'].tag).toBe('SIM');
    expect(s['route.totals.marginSec'].tag).toBe('SIM');
  });

  it('tags the margin at the end of the plan like the HUD margin now (#195)', () => {
    const s = legCostSources(hazards);
    expect(s['route.totals.marginSec'].tag).toBe(c.sources['suit.marginSec'].tag);
    expect(s['route.totals.marginSec'].label).toBe(c.sources['suit.marginSec'].label);
  });
});

describe('runner on a store', () => {
  function fakeStore(state) {
    const subs = new Set();
    return {
      getState: () => state,
      setState: (fn) => { state = { ...state, ...(typeof fn === 'function' ? fn(state) : fn) }; for (const f of subs) f(state); },
      subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    };
  }

  it('fills route.legs and route.totals when a route arrives and clears them when it goes', () => {
    const store = fakeStore({ route: { waypoints: [], path: null, legs: [], totals: null }, sources: {} });
    const r = startLegCostRunner({ store, heightAt: flat, constants: c, sources: legCostSources(hazards) });
    expect(store.getState().route.totals).toBe(null);
    const wps = [{ name: 'HAB', x: 0, z: 0 }, { name: 'A', x: 100, z: 0 }, { name: 'B', x: 100, z: 100 }];
    store.setState((s) => ({ route: { ...s.route, waypoints: wps, path: wps.map((w) => [w.x, w.z]) } }));
    expect(store.getState().route.legs).toHaveLength(2);
    expect(store.getState().route.totals.distanceM).toBeCloseTo(200, 6);
    expect(store.getState().sources['route.legs.o2G'].tag).toBe('SIM');
    store.setState((s) => ({ route: { ...s.route, path: null } }));
    expect(store.getState().route.legs).toEqual([]);
    r.stop();
  });
});

describe('the route.json waypoints on the real terrain', () => {
  const grid = buildCostGrid(readJson('public/marswalk/assets/terrain.json'));
  const route = readJson('public/marswalk/assets/route.json');
  const plan = planRoute(grid, route.waypoints);
  const r = routeLegCosts(plan.path, route.waypoints, (x, z) => heightAt(grid, x, z), c);
  const apollo = hazards.values;

  it('has one leg per pair of waypoints, adding up to the planner distance', () => {
    expect(plan.ok).toBe(true);
    expect(r.legs.map((l) => l.to)).toEqual(route.waypoints.slice(1).map((w) => w.name));
    // planRoute now measures the rounded path it returns, so this is a 1 mm check.
    expect(r.totals.distanceM).toBeCloseTo(plan.distance, 3);
  });

  it('lands in plausible ranges next to the Apollo EVA numbers in hazards.json', () => {
    const t = r.totals, avgW = t.o2G / t.timeSec / c.rhoO2 * c.jPerL;
    // above the Apollo lunar EVA average (980 kJ/h = 272 W), below the xEMU design peak (879 W)
    expect(avgW).toBeGreaterThan(apollo['metabolic.apollo_eva_average'].value / 3.6);
    expect(avgW).toBeLessThan(c.designPeakW);
    // walking pace between the 0.3 m/s floor and the 1.5 m/s jog; Apollo 14 EVA-2 walked 3 km in 72.8 min (0.69 m/s)
    const pace = t.distanceM / t.timeSec;
    expect(pace).toBeGreaterThan(c.speedMin);
    expect(pace).toBeLessThan(c.speedJog);
    // a short sortie: well under the 693 g xEMU design EVA use and the 8 h EVA limit
    expect(t.o2G + t.returnO2G).toBeLessThan(apollo['suit.o2.design_eva_use'].value);
    expect(t.timeSec + t.returnTimeSec).toBeLessThan(apollo['suit.eva_duration_max'].value * 3600);
    expect(t.status).toBe('nominal');
  });
});
