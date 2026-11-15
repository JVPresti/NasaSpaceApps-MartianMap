import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseStops, routeStopCandidates, stopForWaypoint } from '../data/stops.js';
import { startAtAirlock } from '../plan/routeStart.js';
import { departRoute } from '../state/simulation.js';
import { buildCostGrid, cellCost, heightAt } from './costGrid.js';
import {
  checkNeeds, cheapestInsertion, CREW_SETTINGS, DEFAULT_NEEDS, normaliseNeeds, OBJECTIVE_DEFAULTS, OBJECTIVE_IDS, OBJECTIVES, planFromNeeds,
  RISK_IDS, RISK_SETTINGS, riskPricing, siteStart, TIME_RANGE_MIN, timeRangeMin,
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
// Angel 30 m south of the falls, 172.6 m from the habitat. Pair, required only: 170 s out, 1200 s of work, 170 s back
// = 25.7 min. With Bright Angel first, as the goal text has it: 203 s out, 2100 s of work, 203 s back = 41.8 min.
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
    expect(OBJECTIVE_DEFAULTS).toEqual({ sortie: { timeMin: 30 }, cheyava: { timeMin: 120 }, 'bright-angel': { timeMin: 120 }, samples: { timeMin: 120 } });
    expect(riskPricing('standard')).toBeNull();
    expect(normaliseNeeds({ objective: 'nope', crew: 3, timeMin: 5, o2Pct: 150, risk: 'wild' })).toEqual({ ...DEFAULT_NEEDS, timeMin: 10 });
  });

  it('takes the longest time from the 8 h EVA limit in hazards.json, and caps the plan there (N22)', () => {
    const hazards = readJson('public/data/hazards.json');
    expect(TIME_RANGE_MIN[1]).toBe(hazards.values['suit.eva_duration_max'].value * 60);
    expect(timeRangeMin(constants)).toEqual([10, constants.evaMaxSec / 60]);
    const short = { ...constants, evaMaxSec: 3600 };
    const plan = planFromNeeds({ objective: 'sortie', timeMin: 300 }, { ...site(), constants: short });
    expect(plan.budget.availableSec).toBe(3600);
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
    // the survey reaches Bright Angel, then the falls past it; the sample takes Bright Angel on the way to the falls
    const survey = planFromNeeds({ objective: 'bright-angel', timeMin: 120 }, site());
    expect(ids(survey)).toEqual(['bright-angel', 'cheyava-falls']);
    expect(survey.stops.map((s) => s.required)).toEqual([true, false]);
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
    // by Bright Angel to the falls, 32.6 m more each way: the walk out and the walk home together
    expect(dropped.extraM).toBeCloseTo(65.2, 0);
    expect(dropped.extraWalkSec).toBeCloseTo(65, -1);
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

describe('one set of stops whatever profile the table chose (P7)', () => {
  // A 15 degree band (open ground) 10 m wide across the middle, with a way round from z = 42: the fastest profile
  // walks across it (170 m), the gentlest, which cubes the slope, goes round (about 200 m).
  const grid = flatGrid(101, (i, j) => (Math.abs(i - 50) <= 2 && j <= 70 ? 15 : 0));
  const falls = STOPS.filter((s) => s.id !== 'bright-angel');
  const plan = (profile, timeMin) => planFromNeeds({ objective: 'cheyava', timeMin, profile }, { ...site(grid, { mast: MAST }), stops: falls });

  it('chooses the stops on the reference route and budgets the route the table chose', () => {
    const fastest = plan('fastest', 120);
    const gentlest = plan('gentlest', 120);
    expect(gentlest.referenceProfile).toBe('fastest');
    expect(gentlest.profile).toBe('gentlest');
    expect(gentlest.waypoints).toEqual(fastest.waypoints);
    expect(fastest.route.distance).toBeCloseTo(170, 0);
    expect(gentlest.route.distance).toBeGreaterThan(180);
    expect(gentlest.budget.walkSec).toBeGreaterThan(fastest.budget.walkSec);
  });

  it('says when the stops fit on the reference route but not on the profile chosen', () => {
    // 30.8 min less the 15 % reserve: 26.2 min; across the band the plan takes 25.7 min, round it about 26.6 min
    expect(plan('fastest', 30.8).fits).toBe(true);
    const over = plan('gentlest', 30.8);
    expect(over.fits).toBe(false);
    expect(over.budget).toMatchObject({ fits: false, limit: 'time' });
    expect(over.reasons.at(-1)).toMatchObject({ code: 'profile-over', profile: 'gentlest', reference: 'fastest', limit: 'time' });
  });

  it('keeps a solo crew\'s reference on the radio route it walks', () => {
    const solo = planFromNeeds({ objective: 'cheyava', crew: 1, timeMin: 120, profile: 'gentlest' }, site(undefined, { mast: MAST }));
    expect(solo).toMatchObject({ profile: 'radio', referenceProfile: 'radio' });
  });
});

describe('stop order (P8)', () => {
  it('walks each objective\'s stops in the order its goal text gives: Bright Angel, then Cheyava Falls', () => {
    expect(OBJECTIVES.cheyava.order).toEqual(['bright-angel', 'cheyava-falls']);
    expect(OBJECTIVES['bright-angel'].order).toEqual(['bright-angel', 'cheyava-falls']);
    expect(ids(planFromNeeds({ objective: 'bright-angel', timeMin: 120 }, site()))).toEqual(['bright-angel', 'cheyava-falls']);
    expect(ids(planFromNeeds({ objective: 'cheyava', timeMin: 120 }, site()))).toEqual(['bright-angel', 'cheyava-falls']);
    // whatever the geometry: with the falls moved next to the habitat the order stays
    const nearFalls = STOPS.map((s) => (s.id === 'cheyava-falls' ? { ...s, x: -60, z: 0 } : s));
    expect(ids(planFromNeeds({ objective: 'cheyava', timeMin: 120 }, { ...site(), stops: nearFalls }))).toEqual(['bright-angel', 'cheyava-falls']);
  });

  it('does not depend on the profile or the risk', () => {
    const orders = new Set();
    for (const profile of ['fastest', 'gentlest', 'radio']) {
      for (const risk of RISK_IDS) {
        orders.add(ids(planFromNeeds({ objective: 'cheyava', timeMin: 240, profile, risk }, site(undefined, { mast: MAST }))).join('>'));
      }
    }
    expect([...orders]).toEqual(['bright-angel>cheyava-falls']);
  });
});

describe('the planned waypoints', () => {
  const plan = planFromNeeds({ objective: 'cheyava', timeMin: 120 }, site());

  it('start at the habitat and carry each stop\'s work time and card link', () => {
    expect(plan.waypoints[0]).toEqual({ name: 'HAB', x: -90, z: 0 });
    expect(plan.waypoints.slice(1)).toEqual([
      { name: 'WP3 · Bright Angel outcrop', label: 'Bright Angel', x: 80, z: 30, workSec: 900, stopId: 'bright-angel', required: false },
      { name: 'Cheyava Falls', label: 'Cheyava Falls', x: 80, z: 0, workSec: 1200, stopId: 'cheyava-falls', required: true },
    ]);
    // one display name per stop: route.stops[k].name is the waypoint's label
    expect(plan.stops.map((s) => s.name)).toEqual(plan.waypoints.slice(1).map((w) => w.label));
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
    expect(none.reasons).toEqual([{ code: 'stop-missing', stop: 'sortie', name: 'Sortie' }, { code: 'no-stops' }]);
    const noFalls = planFromNeeds({ objective: 'cheyava' }, { ...site(), stops: STOPS.filter((s) => s.id !== 'cheyava-falls') });
    expect(noFalls.reasons[0]).toEqual({ code: 'stop-missing', stop: 'cheyava-falls', name: 'Cheyava Falls' });
  });
});

describe('Collect samples: the route from the crew\'s sampling tasks (#352)', () => {
  const stop = (stopId) => ({ type: 'stop', stopId });
  const point = (id, x, z) => ({ type: 'point', id, x, z });
  const task = (id, what, count, place) => ({ id, what, count, place });
  const samples = (tasks, extra = {}) => ({ objective: 'samples', timeMin: 120, tasks, ...extra });
  const names = (plan) => plan.waypoints.map((w) => w.name);
  const codes = (plan) => plan.reasons.map((r) => r.code);

  it('leaves the three other goals as they were: the same plan with or without tasks, and no task in it', () => {
    const tasks = [task('t1', 'rock', 3, point('P1', 0, 40))];
    for (const objective of ['sortie', 'cheyava', 'bright-angel']) {
      const plain = planFromNeeds({ objective, timeMin: 120 }, site());
      const withTasks = planFromNeeds({ objective, timeMin: 120, tasks }, site());
      expect(withTasks.waypoints, objective).toEqual(plain.waypoints);
      expect(withTasks.budget, objective).toEqual(plain.budget);
      expect(withTasks.reasons, objective).toEqual(plain.reasons);
      expect(withTasks.tasks).toEqual([]);
      expect(plain.stops.every((s) => !('tasks' in s))).toBe(true);
    }
  });

  it('routes to each task place, with its work, its tasks and, for a clicked point, its own arrival radius', () => {
    const plan = planFromNeeds(samples([task('t1', 'rock', 1, stop('bright-angel')), task('t2', 'photo', 1, point('P1', -50, 20))]), site());
    expect(plan).toMatchObject({ ok: true, fits: true, dropped: [] });
    // P1 is 2.5 m off the straight line to Bright Angel: it goes in on the way
    expect(plan.waypoints).toEqual([
      { name: 'HAB', x: -90, z: 0 },
      { name: 'P1 · task point', label: 'P1', x: -50, z: 20, workSec: 120, stopId: null, required: true, place: 'P1', tasks: ['t2'], arrivalRadiusM: 8 },
      { name: 'WP3 · Bright Angel outcrop', label: 'Bright Angel', x: 80, z: 30, workSec: 480, stopId: 'bright-angel', required: true, place: 'bright-angel', tasks: ['t1'] },
    ]);
    expect(plan.stops.map((s) => [s.id, s.name, s.place, s.tasks, s.workSec])).toEqual([['P1', 'P1', 'P1', ['t2'], 120], ['bright-angel', 'Bright Angel', 'bright-angel', ['t1'], 480]]);
    expect(plan.tasks).toEqual([
      {
        id: 't1', what: 'rock', count: 1, workSec: 480, kept: true, drop: null,
        place: { key: 'bright-angel', type: 'stop', stopId: 'bright-angel', x: 80, z: 30, radiusM: 5, label: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', reason: null },
      },
      {
        id: 't2', what: 'photo', count: 1, workSec: 120, kept: true, drop: null,
        place: { key: 'P1', type: 'point', stopId: null, x: -50, z: 20, radiusM: 8, label: 'P1', waypoint: 'P1 · task point', reason: null },
      },
    ]);
    expect(codes(plan)).toEqual(['task-added', 'fits']);
    const added = plan.reasons[0];
    expect(added).toMatchObject({ task: 't2', place: 'P1', name: 'P1', workSec: 120 });
    expect(added.extraM).toBeGreaterThan(0);
    expect(added.extraM).toBeLessThan(15);
    expect(plan.budget.workSec).toBe(600);
  });

  it('places each task where it adds the least walking, not in list order', () => {
    // the sortie stop is on the straight line to the falls: listed second, walked first
    const plan = planFromNeeds(samples([task('t1', 'rock', 1, stop('cheyava-falls')), task('t2', 'soil', 1, stop('sortie'))]), site());
    expect(names(plan)).toEqual(['HAB', 'S1 · patch', 'Cheyava Falls']);
    // going on past the last place costs the way there once: the falls after the sortie stop, not before it
    expect(names(planFromNeeds(samples([task('t1', 'soil', 1, stop('sortie')), task('t2', 'rock', 1, stop('cheyava-falls'))]), site())))
      .toEqual(['HAB', 'S1 · patch', 'Cheyava Falls']);
  });

  it('inserts by straight-line detour, the way on past the end counted once', () => {
    const chain = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
    expect(cheapestInsertion(chain, { x: 5, z: 4 })).toBe(0);    // 2.8 m off the leg, against 6.4 m on past the end
    expect(cheapestInsertion(chain, { x: 20, z: 0 })).toBe(1);   // 20 m round the leg, against 10 m on past the end
    expect(cheapestInsertion([{ x: 0, z: 0 }], { x: 3, z: 4 })).toBe(0);
  });

  it('merges tasks at one place into one waypoint, its work the sum', () => {
    const plan = planFromNeeds(samples([
      task('t1', 'rock', 1, stop('bright-angel')), task('t2', 'photo', 2, stop('cheyava-falls')), task('t3', 'soil', 1, stop('bright-angel')),
    ]), site());
    expect(plan.waypoints.filter((w) => w.place === 'bright-angel')).toHaveLength(1);
    expect(plan.waypoints.find((w) => w.place === 'bright-angel')).toMatchObject({ workSec: 480 + 240, tasks: ['t1', 't3'] });
    expect(plan.tasks.map((t) => t.kept)).toEqual([true, true, true]);
    expect(plan.reasons.find((r) => r.task === 't3')).toMatchObject({ code: 'task-added', extraM: 0, extraWalkSec: 0, workSec: 240 });
    expect(plan.budget.workSec).toBe(480 + 240 + 240);
  });

  it('plans the work from the task table, times the count, 1.5 times as long alone, never the stop\'s own time', () => {
    const tasks = [task('t1', 'rock', 2, stop('sortie')), task('t2', 'photo', 1, stop('cheyava-falls'))];
    const pair = planFromNeeds(samples(tasks), site());
    const solo = planFromNeeds(samples(tasks, { crew: 1 }), site());
    expect(pair.tasks.map((t) => t.workSec)).toEqual([960, 120]);   // the falls' own 1200 s is not used
    expect(solo.tasks.map((t) => t.workSec)).toEqual([1440, 180]);
    expect(pair.budget.workSec).toBe(1080);
    expect(solo.budget.workSec).toBe(1620);
    expect(solo.reasons).toContainEqual({ code: 'solo-work', factor: 1.5 });
  });

  it('drops a later task that does not fit, says why, and still tries the next one (PO Q2)', () => {
    // 15 min less the 15 % reserve: 765 s. Rock at the sortie stop: 20 s out, 480 s, 20 s back.
    const plan = planFromNeeds(samples([
      task('t1', 'rock', 1, stop('sortie')), task('t2', 'rock', 3, stop('cheyava-falls')), task('t3', 'photo', 1, point('P1', -60, 0)),
    ], { timeMin: 15 }), site());
    expect(plan).toMatchObject({ ok: true, fits: true, dropped: [] });
    expect(plan.tasks.map((t) => [t.id, t.kept])).toEqual([['t1', true], ['t2', false], ['t3', true]]);
    expect(plan.tasks[1].drop).toMatchObject({ limit: 'time' });
    // with the falls: 170 s out, 480 + 1440 s of work, 170 s back
    expect(plan.tasks[1].drop.overSec / 60).toBeCloseTo((170 + 1920 + 170 - 765) / 60, 0);
    expect(plan.tasks[1].drop.extraM).toBeGreaterThan(290);   // 150 m on past the sortie stop, and back
    expect(plan.tasks[2].drop).toBeNull();
    expect(names(plan)).toEqual(['HAB', 'S1 · patch', 'P1 · task point']);
    expect(codes(plan)).toEqual(['task-dropped', 'task-added', 'fits']);
    expect(plan.reasons[0]).toMatchObject({ task: 't2', place: 'cheyava-falls', name: 'Cheyava Falls', limit: 'time', workSec: 1440 });
  });

  it('drops a later task for O2 or battery as for a stop', () => {
    const tasks = [task('t1', 'photo', 1, stop('sortie')), task('t2', 'rock', 3, stop('cheyava-falls'))];
    expect(planFromNeeds(samples(tasks, { timeMin: 240, o2Pct: 8 }), site()).tasks[1].drop).toMatchObject({ limit: 'o2' });
    expect(planFromNeeds(samples(tasks, { timeMin: 240, batteryPct: 18 }), site()).tasks[1].drop).toMatchObject({ limit: 'battery' });
  });

  it('keeps the first task when it alone does not fit: a no-go that names the task and the limit', () => {
    // 10 min less the reserve: 510 s; two rocks at the falls take 170 + 960 + 170 s
    const plan = planFromNeeds(samples([task('t1', 'rock', 2, stop('cheyava-falls')), task('t2', 'photo', 1, stop('sortie'))], { timeMin: 10 }), site());
    expect(plan).toMatchObject({ ok: true, fits: false });
    expect(plan.tasks.map((t) => t.kept)).toEqual([true, false]);
    expect(codes(plan)).toEqual(['task-dropped', 'required-over']);
    const over = plan.reasons.at(-1);
    expect(over).toMatchObject({ stops: ['cheyava-falls'], names: ['Cheyava Falls'], tasks: ['t1'], limit: 'time' });
    expect(over.overSec / 60).toBeCloseTo((1300 - 510) / 60, 0);
  });

  it('refuses a plan whose first task cannot be reached, and leaves out a later one that cannot', () => {
    // a ring of ground over 20 degrees, 30 to 36 m round (40, 0): nothing reaches inside it
    const ring = flatGrid(101, (i, j) => { const r = Math.hypot(i - 70, j - 50); return r >= 15 && r <= 18 ? 25 : 0; });
    const inside = point('P1', 40, 0);
    const none = planFromNeeds(samples([task('t1', 'soil', 1, inside), task('t2', 'rock', 1, stop('sortie'))]), site(ring));
    expect(none).toMatchObject({ ok: false, fits: false, route: null });
    expect(none.reasons.at(-1)).toEqual({ code: 'unreachable', stops: ['P1'], names: ['P1'], tasks: ['t1'] });
    expect(none.tasks.map((t) => [t.kept, t.drop?.limit ?? null])).toEqual([[false, 'unreachable'], [false, null]]);
    const later = planFromNeeds(samples([task('t1', 'rock', 1, stop('sortie')), task('t2', 'soil', 1, inside)]), site(ring));
    expect(later).toMatchObject({ ok: true, fits: true });
    expect(later.tasks[1]).toMatchObject({ kept: false, drop: { limit: 'unreachable', overSec: null, extraM: null } });
    expect(later.reasons[0]).toMatchObject({ code: 'task-dropped', task: 't2', limit: 'unreachable' });
  });

  it('has no route without a task, and plans the default rock sample at Bright Angel when the needs carry none', () => {
    const empty = planFromNeeds(samples([]), site());
    expect(empty).toMatchObject({ ok: false, fits: false, waypoints: [{ name: 'HAB', x: -90, z: 0 }], tasks: [], route: null });
    expect(empty.reasons).toEqual([{ code: 'no-tasks' }]);
    const fallback = planFromNeeds({ objective: 'samples', timeMin: 120 }, site());
    expect(fallback.tasks).toMatchObject([{ id: 't1', what: 'rock', count: 1, kept: true, place: { key: 'bright-angel' } }]);
  });

  it('reports a task at a stop the candidates lack, and plans the next task as the goal', () => {
    const plan = planFromNeeds(samples([task('t1', 'rock', 1, stop('olympus')), task('t2', 'photo', 1, stop('sortie'))]), site());
    expect(plan).toMatchObject({ ok: true, fits: true });
    expect(plan.reasons[0]).toEqual({ code: 'stop-missing', stop: 'olympus', name: 'Olympus' });
    expect(plan.tasks[0]).toMatchObject({ kept: false, drop: { limit: 'unreachable' }, place: { key: 'olympus', label: 'Olympus', x: null } });
    expect(plan.tasks[1].kept).toBe(true);
    expect(codes(plan)).toEqual(['stop-missing', 'fits']);
    const none = planFromNeeds(samples([task('t1', 'rock', 1, stop('olympus'))]), site());
    expect(none).toMatchObject({ ok: false });
    expect(codes(none)).toEqual(['stop-missing', 'no-stops']);
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
    // D10: 2 min of work, so about 4 min outside in all
    expect(plan.budget.workSec).toBe(120);
    expect(plan.budget.usedSec / 60).toBeGreaterThan(3.5);
    expect(plan.budget.usedSec / 60).toBeLessThan(4.5);
    expect(plan.stops[0]).toMatchObject({ id: 'sortie', name: 'Light-toned patch', reason: { tag: 'SIM' } });
    expect(plan.stops[0].reason.en).toMatch(/no rover has looked here/);
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

  // The mirror case (Q10): the objective keeps its own stop and leaves the other one out.
  it('Survey Bright Angel, solo, cautious, 100 min: Bright Angel alone, Cheyava Falls dropped for time', () => {
    const plan = planFromNeeds({ objective: 'bright-angel', crew: 1, timeMin: 100, risk: 'cautious', profile: 'fastest' }, real);
    expect(plan.fits).toBe(true);
    expect(plan.totals.status).toBe('nominal');
    expect(plan.profile).toBe('radio');
    expect(ids(plan)).toEqual(['bright-angel']);
    expect(plan.stops[0]).toMatchObject({ name: 'Bright Angel', workSec: 1350, required: true });
    expect(plan.dropped).toMatchObject([{ id: 'cheyava-falls', name: 'Cheyava Falls', limit: 'time', workSec: 1800 }]);
    expect(plan.route.distance).toBeGreaterThan(880);
    expect(plan.route.distance).toBeLessThan(950);
    expect(plan.budget.usedSec / 60).toBeGreaterThan(56);
    expect(plan.budget.usedSec / 60).toBeLessThan(66);
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

  it('compares the same stops in every profile column whichever profile is chosen (P7, the commander\'s case)', () => {
    const columns = (profile) => {
      const plan = planFromNeeds({ objective: 'cheyava', crew: 2, timeMin: 240, profile }, real);
      const planned = planProfiles(grid, plan.waypoints, { mast, cache: real.cache, pricing: plan.pricing, constants });
      return { stops: ids(plan), columns: Object.fromEntries(Object.entries(planned).map(([id, p]) => [id, [p.distance, p.path.length]])) };
    };
    const fastest = columns('fastest');
    expect(fastest.stops).toEqual(['bright-angel', 'cheyava-falls']);
    expect(columns('gentlest')).toEqual(fastest);
    expect(columns('radio')).toEqual(fastest);
  });

  // The two task lists of the PR (#352): two crews, two lists, two routes, for a reason they chose. Pair, standard
  // risk, 2 h (the goal's default), full suit, fastest profile.
  describe('Collect samples: two task lists, two routes (#352)', () => {
    const stop = (stopId) => ({ type: 'stop', stopId });
    const plan = (tasks) => planFromNeeds({ objective: 'samples', crew: 2, timeMin: 120, risk: 'standard', profile: 'fastest', tasks }, real);
    // A: a rock at Bright Angel, then a photo of Cheyava Falls. The falls go in first: 7 m off the way to Bright Angel,
    // against 51 m on past it.
    const a = plan([{ id: 't1', what: 'rock', count: 1, place: stop('bright-angel') }, { id: 't2', what: 'photo', count: 1, place: stop('cheyava-falls') }]);
    // B: two soil scoops on the light-toned patch, then a photo 65 m east of the airlock (P1, 9 degree ground).
    const b = plan([{ id: 't1', what: 'soil', count: 2, place: stop('sortie') }, { id: 't2', what: 'photo', count: 1, place: { type: 'point', id: 'P1', x: 600, z: 570 } }]);
    const o2Pct = (p) => (100 * p.budget.o2UsedG) / constants.o2UsableG;

    it('A: rock x1 at Bright Angel + photo x1 at Cheyava Falls walks to the falls, then Bright Angel', () => {
      expect(a).toMatchObject({ ok: true, fits: true, profile: 'fastest' });
      expect(a.waypoints.map((w) => w.name)).toEqual(['HAB', 'Cheyava Falls', 'WP3 · Bright Angel outcrop']);
      expect(a.tasks.map((t) => [t.id, t.kept, t.workSec])).toEqual([['t1', true, 480], ['t2', true, 120]]);
      expect(a.budget.workSec).toBe(600);
      expect(a.route.distance).toBeGreaterThan(870);
      expect(a.route.distance).toBeLessThan(905);
      expect(a.budget.usedSec / 60).toBeGreaterThan(44);
      expect(a.budget.usedSec / 60).toBeLessThan(52);
      expect(o2Pct(a)).toBeGreaterThan(14);
      expect(o2Pct(a)).toBeLessThan(16.5);
      expect(a.reasons.map((r) => r.code)).toEqual(['task-added', 'fits']);
      expect(a.totals.status).toBe('nominal');
    });

    it('B: soil x2 at the light-toned patch + photo x1 at a point east of the habitat stays near home', () => {
      expect(b).toMatchObject({ ok: true, fits: true, profile: 'fastest' });
      expect(b.waypoints.map((w) => w.name)).toEqual(['HAB', 'S1 · light-toned patch', 'P1 · task point']);
      expect(b.waypoints[2]).toMatchObject({ place: 'P1', stopId: null, arrivalRadiusM: 8, tasks: ['t2'] });
      expect(b.tasks.map((t) => [t.id, t.kept, t.workSec])).toEqual([['t1', true, 480], ['t2', true, 120]]);
      expect(b.budget.workSec).toBe(600);
      expect(b.route.distance).toBeGreaterThan(150);
      expect(b.route.distance).toBeLessThan(185);
      expect(b.budget.usedSec / 60).toBeGreaterThan(15);
      expect(b.budget.usedSec / 60).toBeLessThan(18.5);
      expect(o2Pct(b)).toBeGreaterThan(3.7);
      expect(o2Pct(b)).toBeLessThan(4.7);
      expect(b.reasons.map((r) => r.code)).toEqual(['task-added', 'fits']);
    });

    it('draws the two as different lines on the map', () => {
      const off = Math.max(...a.route.path.map(([x, z]) => Math.min(...b.route.path.map(([px, pz]) => Math.hypot(px - x, pz - z)))));
      expect(off).toBeGreaterThan(500);
    });

    it('A for a cautious crew with 62 min: the rock fits, the photo is left out for time', () => {
      // 62 min less the 25 % cautious reserve: 46.5 min; the rock alone takes about 45 min, the photo adds about 3
      const tasks = a.tasks.map(({ id, what, count, place }) => ({ id, what, count, place: stop(place.stopId) }));
      const tight = planFromNeeds({ objective: 'samples', crew: 2, timeMin: 62, risk: 'cautious', profile: 'fastest', tasks }, real);
      expect(tight.fits).toBe(true);
      expect(tight.waypoints.map((w) => w.name)).toEqual(['HAB', 'WP3 · Bright Angel outcrop']);
      expect(tight.tasks.map((t) => [t.kept, t.drop?.limit ?? null])).toEqual([[true, null], [false, 'time']]);
      expect(tight.tasks[1].drop.overSec / 60).toBeGreaterThan(0.5);
      expect(tight.tasks[1].drop.overSec / 60).toBeLessThan(3.5);
      expect(tight.reasons.map((r) => r.code)).toEqual(['risk', 'task-dropped', 'fits']);
    });
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
