import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  combinedTag, constantEffortSpeed, createSuitState, metabolicPowerW, o2RateGs, pathHome, pathToShelter, stepSuit, suitConstantsFromHazards, suitReadout, SUIT_INPUTS, walkCost,
} from './suitModel.js';
import { startSuitRunner } from './suitRunner.js';

const hazards = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/data/hazards.json', import.meta.url)), 'utf8'));
const c = suitConstantsFromHazards(hazards);
const checks = hazards.models.walking_metabolic.checks;
const deg = (d) => Math.tan(d * Math.PI / 180);

// O2 in grams for walking `metres` at speed v on gradient i (no walkback pad)
const o2For = (metres, v, i) => o2RateGs(metabolicPowerW(v, i, c), c) * metres / v;

describe('constants from hazards.json', () => {
  it('reads the xEMU tank and battery in SI units', () => {
    expect(c.o2UsableG).toBeCloseTo(771, 0);
    expect(c.batteryWh).toBe(756);
    expect(c.designAvgW).toBeCloseTo(352, 0);
    expect(c.reserveSec).toBe(1800);
  });
});

describe('metabolic power (models.walking_metabolic checks)', () => {
  it('flat walking at 1 m/s costs 589 W and 40 g of O2 per km', () => {
    expect(metabolicPowerW(1.0, 0, c)).toBeCloseTo(checks['flat_1km_at_1.0_m_s'].power_w, -1);
    expect(o2For(1000, 1.0, 0)).toBeCloseTo(checks['flat_1km_at_1.0_m_s'].o2_g, 0);
  });

  it('a 20 degree climb at 0.5 m/s costs 946 W and 129 g of O2 per km', () => {
    const k = checks.climb_1km_along_20deg_at_0_5_m_s || checks['climb_1km_along_20deg_at_0.5_m_s'];
    expect(metabolicPowerW(0.5, deg(20), c)).toBeCloseTo(k.power_w, -1);
    expect(o2For(1000, 0.5, deg(20))).toBeCloseTo(k.o2_g, 0);
  });

  it('a flat kilometre and a 20 degree climb give clearly different consumption', () => {
    const flat = walkCost([[0, 0], [1000, 0]], () => 0, c, { pad: 0 });
    const climb = walkCost([[0, 0], [1000, 0]], (x) => x * deg(20), c, { pad: 0 });
    expect(climb.o2G / flat.o2G).toBeGreaterThan(3);
    expect(climb.timeSec).toBeGreaterThan(flat.timeSec * 3);
    expect(climb.o2G).toBeCloseTo(checks.climb_1km_along_20deg_constant_effort.o2_g, -1);
  });
});

describe('constant-effort speed (mobility.speed_rule)', () => {
  it('slows uphill and stays near flat speed downhill, as listed in hazards.json', () => {
    expect(constantEffortSpeed(0, c)).toBeCloseTo(1.0, 2);
    expect(constantEffortSpeed(deg(5), c)).toBeCloseTo(0.63, 2);
    expect(constantEffortSpeed(deg(10), c)).toBeCloseTo(0.44, 2);
    expect(constantEffortSpeed(deg(20), c)).toBeCloseTo(0.30, 2);
    expect(constantEffortSpeed(deg(-5), c)).toBeCloseTo(1.12, 2);
    expect(constantEffortSpeed(deg(-20), c)).toBeCloseTo(0.79, 2);
  });
});

describe('consumables', () => {
  const run = (speedMs, gradient, sec) => { let s = createSuitState(c); for (let t = 0; t < sec; t += 0.25) s = stepSuit(s, { dtSec: 0.25, speedMs, gradient }, c); return s; };

  it('O2 and battery fall while walking, faster uphill and when jogging', () => {
    const full = createSuitState(c), stand = run(0, 0, 600), walk = run(1.0, 0, 600), climb = run(0.5, deg(15), 600), jog = run(1.5, 0, 600);
    expect(stand.o2G).toBeLessThan(full.o2G);
    expect(walk.o2G).toBeLessThan(stand.o2G);
    expect(climb.o2G).toBeLessThan(walk.o2G);
    expect(jog.o2G).toBeLessThan(walk.o2G);
    expect(walk.batteryWh).toBeLessThan(stand.batteryWh);
    expect(jog.batteryWh).toBeLessThan(walk.batteryWh);
  });

  it('caps the speed at the jog speed, so a 4.5 m/s jog costs the same as 1.5 m/s', () => {
    expect(run(4.5, 0, 60).o2G).toBeCloseTo(run(1.5, 0, 60).o2G, 6);
  });

  it('draws about 113 W of battery at 589 W metabolic, as the effort_share note says', () => {
    const s = stepSuit(createSuitState(c), { dtSec: 3600, speedMs: 1.0, gradient: 0 }, c);
    expect(Math.abs(c.batteryWh - s.batteryWh - 113)).toBeLessThan(1);   // the note rounds; 1200 BTU/h is 351.7 W, not 352
  });
});

describe('walkback and margin', () => {
  const route = [[520, 600], [330, 300], [150, 120], [-40, -60], [0, 0]];   // route.json waypoints, habitat first

  it('goes back along the route to the habitat from the nearest point on it', () => {
    const home = pathHome({ x: 150, z: 130 }, route, { x: 520, z: 600 });
    expect(home[0]).toEqual([150, 130]);
    expect(home[home.length - 1]).toEqual([520, 600]);
    expect(home).toEqual([[150, 130], [155, 125], [330, 300], [520, 600]]);   // player, foot of the perpendicular on the WP1-WP2 leg (7 m away), WP1, habitat
  });

  it('goes straight to the habitat without a route', () => {
    expect(pathHome({ x: 0, z: 0 }, null, { x: 520, z: 600 })).toEqual([[0, 0], [520, 600]]);
  });

  it('gets shorter as the player walks home', () => {
    const far = walkCost(pathHome({ x: 0, z: 0 }, route, { x: 520, z: 600 }), () => 0, c);
    const near = walkCost(pathHome({ x: 330, z: 300 }, route, { x: 520, z: 600 }), () => 0, c);
    expect(near.timeSec).toBeLessThan(far.timeSec);
  });

  it('turns caution below 15 min of margin and warning at 0', () => {
    const s = { ...createSuitState(c), o2RateSmoothGs: o2RateGs(589, c) }, rate = s.o2RateSmoothGs;
    const at = (marginMin) => ({ ...s, o2G: rate * (c.reserveSec + marginMin * 60) });
    expect(suitReadout(at(30), { timeSec: 0, o2G: 0 }, c).status).toBe('nominal');
    expect(suitReadout(at(10), { timeSec: 0, o2G: 0 }, c).status).toBe('caution');
    expect(suitReadout(at(-1), { timeSec: 0, o2G: 0 }, c).status).toBe('warning');
    expect(suitReadout(at(10), { timeSec: 0, o2G: 0 }, c).marginSec).toBeCloseTo(600, 0);
  });
});

describe('margin now (#195)', () => {
  const rest = createSuitState(c);

  it('never exceeds the 8 h EVA limit at rest', () => {
    const r = suitReadout(rest, { timeSec: 0, o2G: 0 }, c);
    expect(r.o2MarginSec / 60).toBeGreaterThan(1000);   // the full tank at the resting rate: about 1192 min
    expect(r.marginSec).toBe(hazards.values['suit.eva_duration_max'].value * 3600);
    expect(r.marginLimit).toBe('eva');
  });

  it('takes off the EVA time so far and the walkback time', () => {
    const r = suitReadout(rest, { timeSec: 600, o2G: 0 }, c, { elapsedSec: 3600 });
    expect(r.marginSec).toBe(8 * 3600 - 3600 - 600);
  });

  it('keeps the O2 margin when the tank runs out first', () => {
    const s = { ...rest, o2RateSmoothGs: o2RateGs(589, c), o2G: o2RateGs(589, c) * (c.reserveSec + 600) };
    const r = suitReadout(s, { timeSec: 0, o2G: 0 }, c);
    expect(r.marginSec).toBeCloseTo(600, 0);
    expect(r.marginLimit).toBe('o2');
  });

  it('carries the same tag as the Plan margin at the end of the plan', () => {
    expect(c.sources['suit.marginSec'].tag).toBe(combinedTag(hazards, SUIT_INPUTS.margin));
    expect(c.sources['suit.marginSec'].tag).toBe('SIM');
    expect(SUIT_INPUTS.margin).toContain('suit.eva_duration_max');
  });
});

describe('walkback to a shelter (#195)', () => {
  const shelterRoute = [[100, 100], [100, 400], [829, 400]];   // re-planned from the player at (100, 100) to the shelter

  it('walks forward to the end of the shelter route', () => {
    const path = pathToShelter({ x: 100, z: 100 }, shelterRoute, { x: 829, z: 400 });
    expect(path[path.length - 1]).toEqual([829, 400]);
    expect(walkCost(path, () => 0, c).distanceM).toBeCloseTo(300 + 729, 0);
  });

  it('starts from the nearest point on the route', () => {
    expect(pathToShelter({ x: 105, z: 300 }, shelterRoute, { x: 829, z: 400 })).toEqual([[105, 300], [100, 300], [100, 400], [829, 400]]);
  });

  it('goes straight to the shelter without a route', () => {
    expect(pathToShelter({ x: 0, z: 0 }, null, { x: 3, z: 4 })).toEqual([[0, 0], [3, 4]]);
  });
});

describe('runner on a store', () => {
  function fakeStore(state) {
    return { getState: () => state, setState: (fn) => { state = { ...state, ...(typeof fn === 'function' ? fn(state) : fn) }; } };
  }

  it('writes the suit section and consumes more while walking than standing', () => {
    let t = 0;
    const store = fakeStore({ navigation: { x: 0, z: 0 }, route: { path: null }, mission: { paused: false }, suit: {}, sources: {} });
    const r = startSuitRunner({ store, heightAt: () => 0, constants: c, now: () => t, setInterval: () => 0, clearInterval: () => {} });
    for (let k = 0; k < 40; k++) { t += 250; r.tick(); }   // 10 s standing
    const standing = c.o2UsableG - store.getState().suit.oxygenG;
    for (let k = 0; k < 40; k++) { t += 250; const n = store.getState().navigation; store.setState({ navigation: { x: n.x + 0.25, z: 0 } }); r.tick(); }   // 10 s at 1 m/s
    const walking = c.o2UsableG - store.getState().suit.oxygenG - standing;
    expect(walking).toBeGreaterThan(standing * 2);
    const s = store.getState();
    expect(s.suit.walkbackSec).toBeGreaterThan(0);
    expect(s.suit.status).toBe('nominal');
    expect(s.sources['suit.oxygenPct'].tag).toBe('DERIVED');
    r.stop();
  });

  it('times the walkback along the shelter route during an event', () => {
    const path = [[0, 0], [0, 300], [729, 300]];
    const store = fakeStore({
      navigation: { x: 0, z: 0 }, mission: { paused: false, elapsedSec: 0 }, suit: {}, sources: {},
      route: { path, shelter: { id: 'S1', name: 'Shelter', x: 729, z: 300 } },
    });
    const r = startSuitRunner({ store, heightAt: () => 0, constants: c, now: () => 0, setInterval: () => 0, clearInterval: () => {} });
    r.tick();
    const s = store.getState().suit;
    expect(s.walkbackTo).toBe('shelter');
    expect(s.walkbackSec).toBeCloseTo(walkCost(path, () => 0, c).timeSec, 6);
    expect(s.walkbackSec).toBeGreaterThan(10 * 60);
    r.stop();
  });

  it('caps the margin with the mission time from the store', () => {
    const store = fakeStore({ navigation: { x: 0, z: 0 }, route: { path: null }, mission: { paused: false, elapsedSec: 2 * 3600 }, suit: {}, sources: {} });
    const r = startSuitRunner({ store, heightAt: () => 0, constants: c, habitat: { x: 0, z: 0 }, now: () => 0, setInterval: () => 0, clearInterval: () => {} });
    r.tick();
    expect(store.getState().suit.marginSec).toBe(6 * 3600);
    expect(store.getState().suit.walkbackTo).toBe('habitat');
    r.stop();
  });

  it('consumes nothing while the mission is paused', () => {
    let t = 0;
    const store = fakeStore({ navigation: { x: 0, z: 0 }, route: { path: null }, mission: { paused: true }, suit: {}, sources: {} });
    const r = startSuitRunner({ store, heightAt: () => 0, constants: c, now: () => t, setInterval: () => 0, clearInterval: () => {} });
    for (let k = 0; k < 20; k++) { t += 250; r.tick(); }
    expect(store.getState().suit.oxygenG).toBeCloseTo(c.o2UsableG, 6);
  });
});
