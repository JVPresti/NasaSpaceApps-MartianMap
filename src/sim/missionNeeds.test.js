import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseStops, routeStopCandidates, stopForWaypoint } from '../data/stops.js';
import { startAtAirlock } from '../plan/routeStart.js';
import { departRoute } from '../state/simulation.js';
import { buildCostGrid, cellCost, heightAt } from './costGrid.js';
import {
  checkNeeds, CREW_SETTINGS, DEFAULT_NEEDS, normaliseNeeds, OBJECTIVE_DEFAULTS, OBJECTIVE_IDS, OBJECTIVES, planFromNeeds, RISK_IDS,
  RISK_SETTINGS, riskPricing, siteStart,
} from './missionNeeds.js';
import { planProfiles, pricedProfileGrid, ROUTE_PROFILES } from './routeProfiles.js';
import { suitConstantsFromHazards } from './suitModel.js';

const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL('../../' + path, import.meta.url)), 'utf8'));
const constants = suitConstantsFromHazards(readJson('public/data/hazards.json'));
const CELL = 2;

/**
 * Flat synthetic grid, as in routePlanner.test.js, with the slope of each node from `slope(i, j)` (over 20 degrees is
 * closed). The heights stay flat, so the suit model walks at 1 m/s and a metre takes a second.
 */
function flatGrid(n, slope = () => 0) {
  const count = n * n;
  const slopes = new Float32Array(count);
  const blocked = new Uint8Array(count);
  const cost = new Float32Array(count);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = j * n + i;
      slopes[k] = slope(i, j);
      blocked[k] = slopes[k] > 20 ? 1 : 0;
      cost[k] = blocked[k] ? Infinity : cellCost(slopes[k], 0.08);
    }
  }
  const width = (n - 1) * CELL;
  return {
    n, width, depth: width, cellSizeX: CELL, cellSizeZ: CELL,
    heights: new Float32Array(count), slopes, cost, blocked, baseCost: cost.slice(), baseBlocked: blocked.slice(),
    density: new Uint8Array([0, 0, 0, 0]), densityN: 2,
  };
}

// 200 m square. The habitat on the west edge, the sortie stop 20 m east of it, Cheyava Falls 170 m east and Bright
// Angel 30 m south of the falls. Pair, required only: 170 s out, 1200 s of work, 170 s back = 25.7 min. With Bright
// Angel (inserted before the falls): 203 s out, 2100 s of work, 203 s back = 41.8 min.
const STOPS = [
  { id: 'sortie', name: 'Sortie', waypoint: 'S1 · patch', x: -70, z: 0, workSec: 300 },
  { id: 'cheyava-falls', name: 'Cheyava Falls', waypoint: 'Cheyava Falls', x: 80, z: 0, workSec: 1200 },
  { id: 'bright-angel', name: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', x: 80, z: 30, workSec: 900 },
];
const site = (grid = flatGrid(101), extra = {}) => ({ grid, start: { name: 'HAB', x: -90, z: 0 }, stops: STOPS, constants, cache: new Map(), ...extra });
const ids = (plan) => plan.stops.map((s) => s.id);
// On the flat grid every point sees a mast 5 m up, so the radio profile has a route.
const MAST = { x: -95, y: 5, z: 0 };

describe('needs', () => {
  it('defaults to the first sortie for a pair, today\'s planner cost, 30 min, full suit', () => {
    expect(DEFAULT_NEEDS).toEqual({ objective: 'sortie', crew: 2, timeMin: 30, o2Pct: 100, batteryPct: 100, risk: 'standard' });
    expect(OBJECTIVE_DEFAULTS).toEqual({ sortie: { timeMin: 30 }, cheyava: { timeMin: 120 }, 'bright-angel': { timeMin: 120 } });
    expect(riskPricing('standard')).toBeNull();
    expect(normaliseNeeds({ objective: 'nope', crew: 3, timeMin: 5, o2Pct: 150, risk: 'wild' })).toEqual({ ...DEFAULT_NEEDS, timeMin: 10 });
  });

  it('checks an update: unknown keys and values throw, numbers are clamped to their range', () => {
    expect(checkNeeds({ timeMin: 900, o2Pct: 0 })).toEqual({ timeMin: 480, o2Pct: 1 });
    expect(() => checkNeeds({ crew: 3 })).toThrow(/crew/);
    expect(() => checkNeeds({ risk: 'reckless' })).toThrow(/risk/);
    expect(() => checkNeeds({ objective: 'olympus' })).toThrow(/objective/);
    expect(() => checkNeeds({ terrain: 'gentlest' })).toThrow(/unknown need/);
    expect(() => checkNeeds({ timeMin: Number.NaN })).toThrow(/finite/);
  });
});

describe('each input changes the plan as stated', () => {
  it('objective: chooses the required and optional stops', () => {
    expect(ids(planFromNeeds({ objective: 'sortie' }, site()))).toEqual(['sortie']);
    expect(ids(planFromNeeds({ objective: 'cheyava', timeMin: 120 }, site()))).toEqual(['bright-angel', 'cheyava-falls']);
    // the falls go where they add the least walking: on the way, 27 m more, rather than 30 m on and back
    const survey = planFromNeeds({ objective: 'bright-angel', timeMin: 120 }, site());
    expect(ids(survey)).toEqual(['cheyava-falls', 'bright-angel']);
    expect(survey.stops.map((s) => s.required)).toEqual([false, true]);
    expect(planFromNeeds({ objective: 'cheyava', timeMin: 120 }, site()).stops.map((s) => s.required)).toEqual([false, true]);
  });

  it('time: drops the optional stop that no longer fits, with how far over it would go', () => {
    const roomy = planFromNeeds({ objective: 'cheyava', timeMin: 60 }, site());
    expect(roomy.fits).toBe(true);
    expect(ids(roomy)).toEqual(['bright-angel', 'cheyava-falls']);
    expect(roomy.reasons.find((r) => r.code === 'stop-added')).toMatchObject({ stop: 'bright-angel', workSec: 900 });

    const tight = planFromNeeds({ objective: 'cheyava', timeMin: 40 }, site());
    expect(tight.fits).toBe(true);
    expect(ids(tight)).toEqual(['cheyava-falls']);
    const [dropped] = tight.dropped;
    expect(dropped).toMatchObject({ id: 'bright-angel', limit: 'time', workSec: 900 });
    // with Bright Angel: 41.8 min against 34 min (40 min less the 15 % standard reserve)
    expect(dropped.overSec / 60).toBeCloseTo(41.8 - 34, 0);
    expect(dropped.extraWalkSec).toBeGreaterThan(0);
    expect(tight.reasons.find((r) => r.code === 'stop-dropped')).toMatchObject({ stop: 'bright-angel', limit: 'time' });
  });

  it('time: keeps a required stop that does not fit, and says by how much the plan is over', () => {
    const short = planFromNeeds({ objective: 'cheyava', timeMin: 25 }, site());
    expect(short.ok).toBe(true);
    expect(short.fits).toBe(false);
    expect(ids(short)).toEqual(['cheyava-falls']);
    expect(short.budget).toMatchObject({ fits: false, limit: 'time' });
    const over = short.reasons.find((r) => r.code === 'required-over');
    expect(over).toMatchObject({ stops: ['cheyava-falls'], limit: 'time' });
    expect(over.overSec / 60).toBeCloseTo(25.7 - 25 * 0.85, 0);
  });

  it('O2: drops the optional stop when the margin at the end would fall into the 30 min reserve', () => {
    const plan = planFromNeeds({ objective: 'cheyava', timeMin: 240, o2Pct: 18 }, site());
    expect(plan.fits).toBe(true);
    expect(ids(plan)).toEqual(['cheyava-falls']);
    expect(plan.dropped[0]).toMatchObject({ id: 'bright-angel', limit: 'o2' });
    expect(plan.dropped[0].marginShortSec).toBeGreaterThan(0);
    expect(plan.budget.o2StartG).toBeCloseTo(0.18 * constants.o2UsableG, 6);
    expect(ids(planFromNeeds({ objective: 'cheyava', timeMin: 240, o2Pct: 30 }, site()))).toEqual(['bright-angel', 'cheyava-falls']);
  });

  it('battery: drops the optional stop when the battery on return would fall under the reserve', () => {
    const plan = planFromNeeds({ objective: 'cheyava', timeMin: 240, batteryPct: 24 }, site());
    expect(plan.fits).toBe(true);
    expect(plan.dropped[0]).toMatchObject({ id: 'bright-angel', limit: 'battery' });
    expect(plan.dropped[0].batteryShortWh).toBeGreaterThan(0);
    expect(plan.budget.arrivalBatteryWh).toBeGreaterThanOrEqual(plan.budget.batteryReserveWh);
    expect(ids(planFromNeeds({ objective: 'cheyava', timeMin: 240, batteryPct: 26 }, site()))).toEqual(['bright-angel', 'cheyava-falls']);
  });

  it('crew: a solo astronaut works 1.5 times as long, so the optional stop a pair keeps no longer fits', () => {
    const pair = planFromNeeds({ objective: 'cheyava', crew: 2, timeMin: 50 }, site());
    const solo = planFromNeeds({ objective: 'cheyava', crew: 1, timeMin: 50 }, site());
    expect(ids(pair)).toEqual(['bright-angel', 'cheyava-falls']);
    expect(ids(solo)).toEqual(['cheyava-falls']);
    expect(solo.stops[0].workSec).toBe(1200 * CREW_SETTINGS[1].workFactor);
    expect(pair.stops.find((s) => s.id === 'cheyava-falls').workSec).toBe(1200);
    expect(solo.reasons).toContainEqual({ code: 'solo-work', factor: 1.5 });
  });

  it('crew: a solo astronaut is held to the radio-contact profile, whatever the table chose', () => {
    const solo = planFromNeeds({ objective: 'sortie', crew: 1, profile: 'gentlest' }, site(undefined, { mast: MAST }));
    expect(solo.profile).toBe('radio');
    expect(solo.requestedProfile).toBe('gentlest');
    expect(solo.reasons).toContainEqual({ code: 'solo-radio', requested: 'gentlest' });
    const pair = planFromNeeds({ objective: 'sortie', crew: 2, profile: 'gentlest' }, site(undefined, { mast: MAST }));
    expect(pair.profile).toBe('gentlest');
  });

  it('crew: without the habitat mast a solo plan falls back to the profile chosen and says so', () => {
    const solo = planFromNeeds({ objective: 'sortie', crew: 1, profile: 'gentlest' }, site());
    expect(solo.profile).toBe('gentlest');
    expect(solo.reasons).toContainEqual({ code: 'radio-unavailable', profile: 'gentlest' });
  });

  it('risk: a bigger reserve drops what a bold crew keeps in the same time', () => {
    const cautious = planFromNeeds({ objective: 'cheyava', timeMin: 45, risk: 'cautious' }, site());
    const bold = planFromNeeds({ objective: 'cheyava', timeMin: 45, risk: 'bold' }, site());
    expect(ids(cautious)).toEqual(['cheyava-falls']);
    expect(ids(bold)).toEqual(['bright-angel', 'cheyava-falls']);
    expect(cautious.budget.reserveSec).toBeCloseTo(45 * 60 * RISK_SETTINGS.cautious.reserveShare, 6);
    expect(bold.budget.reserveSec).toBeCloseTo(45 * 60 * RISK_SETTINGS.bold.reserveShare, 6);
    expect(cautious.reasons.find((r) => r.code === 'risk')).toMatchObject({ risk: 'cautious', slopePenaltyDeg: 7, rockWeight: 1, traverseDiscount: 0.8 });
  });

  it('risk: a cautious crew keeps the O2 margin above the 15 min caution line, a standard crew only out of the reserve', () => {
    const standard = planFromNeeds({ objective: 'cheyava', timeMin: 240, o2Pct: 22 }, site());
    const cautious = planFromNeeds({ objective: 'cheyava', timeMin: 240, o2Pct: 22, risk: 'cautious' }, site());
    expect(ids(standard)).toEqual(['bright-angel', 'cheyava-falls']);
    expect(standard.budget.marginSec).toBeLessThan(constants.cautionSec);
    expect(ids(cautious)).toEqual(['cheyava-falls']);
    expect(cautious.dropped[0].limit).toBe('o2');
  });

  it('risk: a cautious crew goes around slope a bold crew walks across', () => {
    // An 8 degree band (open ground) 20 m wide across the middle, with a way round to the south of z = 22.
    const grid = flatGrid(101, (i, j) => (Math.abs(i - 50) <= 5 && j <= 61 ? 8 : 0));
    const plan = (risk) => planFromNeeds({ objective: 'cheyava', timeMin: 240, risk }, { ...site(grid), stops: STOPS.filter((s) => s.id !== 'bright-angel') });
    const cautious = plan('cautious');
    const bold = plan('bold');
    expect(bold.route.distance).toBeCloseTo(170, 0);
    expect(cautious.route.distance).toBeGreaterThan(bold.route.distance + 10);
    expect(Math.max(...cautious.route.path.map(([, z]) => z))).toBeGreaterThan(20);
  });

  it('risk: a cautious crew keeps to ground Perseverance drove, when the drive is near the way', () => {
    // A drive that bows 30 m north of the straight line to the falls.
    const traverse = [{ sol: 1, points: [[-90, 0], [-60, -30], [50, -30], [80, 0]] }];
    const plan = (risk) => planFromNeeds({ objective: 'cheyava', timeMin: 240, risk }, { ...site(), stops: STOPS.filter((s) => s.id !== 'bright-angel'), traverse });
    expect(plan('standard').route.distance).toBeCloseTo(170, 0);
    const cautious = plan('cautious');
    expect(cautious.route.distance).toBeGreaterThan(190);
    expect(Math.min(...cautious.route.path.map(([, z]) => z))).toBeLessThan(-25);
  });

  it('risk: never moves the 20 degree limit', () => {
    const grid = flatGrid(41, (i) => (i === 20 ? 21 : i === 10 ? 19 : 0));
    for (const risk of RISK_IDS) {
      for (const profile of ROUTE_PROFILES.filter((p) => !p.needsMast)) {
        const priced = pricedProfileGrid(grid, profile, { pricing: riskPricing(risk), cache: new Map() });
        expect(priced.grid.blocked).toBe(grid.blocked);
        expect(priced.grid.cost[5 * 41 + 20]).toBe(Infinity);
        expect(Number.isFinite(priced.grid.cost[5 * 41 + 10])).toBe(true);
      }
    }
  });

  it('profile: plans on the profile chosen at the table, and the comparison reuses its route', () => {
    const s = site(undefined, { mast: MAST });
    const plan = planFromNeeds({ objective: 'cheyava', timeMin: 120, profile: 'gentlest' }, s);
    expect(plan.profile).toBe('gentlest');
    const profiles = planProfiles(s.grid, plan.waypoints, { mast: MAST, cache: s.cache, pricing: plan.pricing, constants });
    expect(profiles.gentlest.path).toBe(plan.route.path);
  });
});

describe('the planned waypoints', () => {
  const plan = planFromNeeds({ objective: 'cheyava', timeMin: 120 }, site());

  it('start at the habitat and carry each stop\'s work time and card link', () => {
    expect(plan.waypoints[0]).toEqual({ name: 'HAB', x: -90, z: 0 });
    expect(plan.waypoints.slice(1)).toEqual([
      { name: 'WP3 · Bright Angel outcrop', x: 80, z: 30, workSec: 900, stopId: 'bright-angel', required: false },
      { name: 'Cheyava Falls', x: 80, z: 0, workSec: 1200, stopId: 'cheyava-falls', required: true },
    ]);
    expect(plan.weights).toMatchObject({ slopeLimitDeg: 20, slopePenaltyDeg: 9, rockWeight: 0.6, reserveShare: 0.15, workFactor: 1 });
  });

  it('price the plan with the work in time and O2', () => {
    expect(plan.budget.workSec).toBe(2100);
    expect(plan.budget.usedSec).toBeCloseTo(plan.budget.walkSec + plan.budget.workSec + plan.budget.returnSec, 6);
    expect(plan.totals.timeSec).toBeCloseTo(plan.budget.walkSec + 2100, 6);
    expect(plan.reasons.at(-1)).toMatchObject({ code: 'fits' });
    expect(plan.reasons.at(-1).spareSec).toBeCloseTo(plan.budget.usableSec - plan.budget.usedSec, 6);
  });

  it('report a stop missing from the candidates, and no plan without its required stop', () => {
    const none = planFromNeeds({ objective: 'sortie' }, { ...site(), stops: STOPS.filter((s) => s.id !== 'sortie') });
    expect(none.ok).toBe(false);
    expect(none.reasons).toEqual([{ code: 'stop-missing', stop: 'sortie' }, { code: 'no-stops' }]);
  });
});

describe('on the real terrain', () => {
  const grid = buildCostGrid(readJson('public/marswalk/assets/terrain.json'));
  const route = readJson('public/marswalk/assets/route.json');
  const stopsJson = readJson('public/data/stops.json');
  const anchors = startAtAirlock(route.waypoints, readJson('public/data/shelters.json'));
  const traverse = readJson('public/data/traverse.json').traverse.drives;
  // engine.getHabitatMast() for the habitat at (541, 582), as in routeProfiles.test.js
  const mast = { x: 544.86, y: heightAt(grid, 541, 582) + 4.31, z: 581.48 };
  const real = { grid, start: siteStart(anchors), stops: routeStopCandidates(stopsJson), constants, mast, traverse, cache: new Map() };
  const cards = parseStops(stopsJson);

  it('keeps every coupling the engine and the EVA runner rely on, for every objective', () => {
    // route.json is not rewritten: the habitat, the spawn (waypoints[1]) and the outcrop model (WP3) stay anchored.
    expect(route.waypoints[0].name).toBe('HAB');
    expect(route.waypoints[1].name).toMatch(/^WP1/);
    expect(route.waypoints.some((w) => w.name.startsWith('WP3'))).toBe(true);
    for (const objective of OBJECTIVE_IDS) {
      const plan = planFromNeeds({ objective, timeMin: 240 }, real);
      expect(plan.ok, objective).toBe(true);
      // the start is the HAB waypoint at the airlock: events.js leaves 'HAB' out of the skipped stops, and the EVA
      // runner counts waypoints[0] as reached and walks to waypoints[1] first
      expect(plan.waypoints[0]).toEqual({ name: 'HAB', x: 535.1, z: 574.1 });
      const departed = departRoute({ waypoints: plan.waypoints });
      expect(departed).toMatchObject({ nextIndex: 1, visited: ['HAB'] });
      expect(plan.waypoints.filter((w) => w.name === 'HAB')).toHaveLength(1);
      // each science stop links to its card by waypoint name; the sortie stop has none yet
      for (const stop of plan.stops) {
        expect(stopForWaypoint(cards, stop.waypoint)?.id ?? 'sortie', objective).toBe(stop.id);
      }
      expect(OBJECTIVES[objective].required.every((id) => plan.stops.some((s) => s.id === id))).toBe(true);
    }
  });

  it('plans the first sortie as about 2 min of walking out and back to the light-toned patch', () => {
    const plan = planFromNeeds({ objective: 'sortie', crew: 2, timeMin: 30 }, real);
    expect(plan.fits).toBe(true);
    expect(plan.route.distance).toBeGreaterThan(50);
    expect(plan.route.distance).toBeLessThan(60);
    expect((plan.budget.walkSec + plan.budget.returnSec) / 60).toBeLessThan(2.5);
    expect(plan.budget.workSec).toBe(300);
  });

  // The two contrasting plans of the PR (8-minute plan, section A): both GO, with different stops and lines.
  it('solo, cautious, 100 min: radio contact, Cheyava Falls alone, Bright Angel dropped for time', () => {
    const plan = planFromNeeds({ objective: 'cheyava', crew: 1, timeMin: 100, risk: 'cautious', profile: 'fastest' }, real);
    expect(plan.fits).toBe(true);
    expect(plan.totals.status).toBe('nominal');
    expect(plan.profile).toBe('radio');
    expect(ids(plan)).toEqual(['cheyava-falls']);
    expect(plan.stops[0].workSec).toBe(1800);
    expect(plan.dropped).toMatchObject([{ id: 'bright-angel', limit: 'time', workSec: 1350 }]);
    expect(plan.budget.usableSec).toBe(100 * 60 * 0.75);
    expect(plan.route.distance).toBeGreaterThan(840);
    expect(plan.route.distance).toBeLessThan(910);
    expect(plan.budget.usedSec / 60).toBeGreaterThan(60);
    expect(plan.budget.usedSec / 60).toBeLessThan(72);
    expect(plan.reasons.map((r) => r.code)).toEqual(['solo-radio', 'solo-work', 'risk', 'stop-dropped', 'fits']);
  });

  it('pair, bold, 2 h: the chosen profile, both stops, and room to spare', () => {
    const plan = planFromNeeds({ objective: 'cheyava', crew: 2, timeMin: 120, risk: 'bold', profile: 'fastest' }, real);
    expect(plan.profile).toBe('fastest');
    expect(ids(plan)).toEqual(['bright-angel', 'cheyava-falls']);
    expect(plan.fits).toBe(true);
    expect(plan.dropped).toEqual([]);
    expect(plan.route.distance).toBeGreaterThan(880);
    expect(plan.route.distance).toBeLessThan(960);
    expect(plan.budget.workSec).toBe(2100);
    expect(plan.budget.usedSec / 60).toBeGreaterThan(65);
    expect(plan.budget.usedSec / 60).toBeLessThan(85);
    expect(plan.budget.spareSec).toBeGreaterThan(30 * 60);
    expect(plan.totals.status).toBe('nominal');
    expect(plan.reasons.map((r) => r.code)).toEqual(['risk', 'stop-added', 'fits']);
  });

  it('draws the two contrasting plans as different lines on the map', () => {
    const solo = planFromNeeds({ objective: 'cheyava', crew: 1, timeMin: 100, risk: 'cautious', profile: 'fastest' }, real);
    const pair = planFromNeeds({ objective: 'cheyava', crew: 2, timeMin: 120, risk: 'bold', profile: 'fastest' }, real);
    // the farthest the solo route gets from the pair route: far more than a walking corridor
    const off = Math.max(...solo.route.path.map(([x, z]) => Math.min(...pair.route.path.map(([px, pz]) => Math.hypot(px - x, pz - z)))));
    expect(off).toBeGreaterThan(50);
  });

  it('solo, cautious, 30 min: keeps Cheyava Falls and says how far over the time it goes', () => {
    const plan = planFromNeeds({ objective: 'cheyava', crew: 1, timeMin: 30, risk: 'cautious', profile: 'fastest' }, real);
    expect(plan.fits).toBe(false);
    expect(ids(plan)).toEqual(['cheyava-falls']);
    expect(plan.reasons.at(-1)).toMatchObject({ code: 'required-over', limit: 'time' });
    expect(plan.reasons.at(-1).overSec / 60).toBeGreaterThan(40);
  });

  it('keeps today\'s cost for the default needs, so the standard grids are the route profiles of #245', () => {
    const sortie = planFromNeeds({ ...DEFAULT_NEEDS, profile: 'fastest' }, real);
    expect(sortie.pricing).toBeNull();
    expect(sortie.fits).toBe(true);
    expect(ids(sortie)).toEqual(['sortie']);
    // the full EVA at its default time keeps both stops
    const full = planFromNeeds({ ...DEFAULT_NEEDS, objective: 'cheyava', ...OBJECTIVE_DEFAULTS.cheyava, profile: 'fastest' }, real);
    expect(full.fits).toBe(true);
    expect(ids(full)).toEqual(['bright-angel', 'cheyava-falls']);
  });
});
