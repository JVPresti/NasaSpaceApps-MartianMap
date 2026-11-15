import { beforeEach, describe, expect, it } from 'vitest';
import { resetStore, useMissionStore } from '../state/store.js';
import { FIX_MODES } from './navigation.js';
import {
  DRIFT_RATE_PER_M,
  FIX_STILL_SEC,
  HORIZON_MIN_CLEAR,
  NAV_DRIFT_TICK_MS,
  RANGING_BOUND_M,
  createDriftState,
  horizonClearCount,
  startNavigationDrift,
  stepDrift,
} from './navigationDrift.js';

beforeEach(() => resetStore());

/** A store ready for the runner: truth at (0, 0), clear air, daylight, mission time 0. */
function seedStore(overrides = {}) {
  useMissionStore.setState((s) => ({
    mission: { ...s.mission, elapsedSec: 0, paused: false, sky: 'late_afternoon' },
    environment: { ...s.environment, dustOpacity: 0 },
    navigation: { ...s.navigation, trueX: 0, trueZ: 0, x: null, z: null, errorM: null, fixMode: null, lastFixSec: null },
    ...overrides,
  }));
}

/** A runner with manual ticks at 250 ms and no habitat mast. */
function manualRunner({ lineOfSight = () => ({ clear: true }), getMast = () => null, random, now } = {}) {
  let t = 0;
  const runner = startNavigationDrift({
    store: useMissionStore,
    lineOfSight,
    getMast,
    now: () => (now ? now() : t),
    random: random ?? (() => 0.5),
    setInterval: () => 0,
    clearInterval: () => {},
  });
  runner.step = (n = 1) => { t += NAV_DRIFT_TICK_MS * n; };
  return runner;
}

describe('stepDrift', () => {
  const base = createDriftState({}, 0, () => 0);

  it('grows the error at the SIM drift rate with the distance walked', () => {
    const s = stepDrift(base, { movedM: 100, speedMs: 1, dtSec: 0.25, ranging: false, fixAllowed: false, elapsedSec: 0 });
    expect(s.errorM).toBeCloseTo(0.4 + DRIFT_RATE_PER_M * 100, 6);
    expect(s.fixMode).toBe(FIX_MODES.deadReckoning);
    expect(Math.hypot(s.offsetDx, s.offsetDz)).toBeCloseTo(s.errorM, 6);
  });

  it('takes a terrain fix after standing still long enough', () => {
    let s = { ...base, stillSec: FIX_STILL_SEC - 0.25 };
    s = stepDrift(s, { movedM: 0, speedMs: 0, dtSec: 0.25, ranging: false, fixAllowed: true, elapsedSec: 42 });
    expect(s.errorM).toBeLessThan(1);
    expect(s.fixMode).toBe(FIX_MODES.terrainFix);
    expect(s.lastFixSec).toBe(42);
    expect(s.distanceSinceFixM).toBe(0);
    expect(Math.hypot(s.offsetDx, s.offsetDz)).toBeCloseTo(s.errorM, 6);
  });

  it('does not fix while the astronaut keeps walking, even with a fix allowed', () => {
    const s = stepDrift(base, { movedM: 3, speedMs: 1, dtSec: 0.25, ranging: false, fixAllowed: true, elapsedSec: 42 });
    expect(s.fixMode).toBe(FIX_MODES.deadReckoning);
    expect(s.distanceSinceFixM).toBe(3);
  });

  it('bounds the error at the ranging bound with line of sight, and names the mode', () => {
    const s = stepDrift(base, { movedM: 300, speedMs: 1, dtSec: 0.25, ranging: true, fixAllowed: false, elapsedSec: 0 });
    expect(s.errorM).toBe(RANGING_BOUND_M);
    expect(s.fixMode).toBe(FIX_MODES.radioRanging);
  });

  it('keeps dead reckoning while ranging has not engaged yet', () => {
    const s = stepDrift(base, { movedM: 10, speedMs: 1, dtSec: 0.25, ranging: true, fixAllowed: false, elapsedSec: 0 });
    expect(s.errorM).toBeCloseTo(0.4 + DRIFT_RATE_PER_M * 10, 6);   // under the bound: ranging is not doing anything yet
    expect(s.fixMode).toBe(FIX_MODES.deadReckoning);
  });

  it('turns the offset only while moving', () => {
    const r = (n = 0) => () => n;
    let s = stepDrift(base, { movedM: 1, speedMs: 1, dtSec: 0.25, ranging: false, fixAllowed: false, elapsedSec: 0, random: r(1) });
    const before = Math.atan2(s.offsetDz, s.offsetDx);
    s = stepDrift(s, { movedM: 0, speedMs: 0, dtSec: 0.25, ranging: false, fixAllowed: false, elapsedSec: 0, random: r(1) });
    expect(Math.atan2(s.offsetDz, s.offsetDx)).toBeCloseTo(before, 9);   // standing still: same direction
  });
});

describe('horizonClearCount', () => {
  it('counts the clear rays out of the given directions', () => {
    const los = (a, b) => ({ clear: b.x >= a.x });
    expect(horizonClearCount(los, { x: 0, z: 0 }, 150, 8)).toBe(5);
    expect(horizonClearCount(() => ({ clear: false }), { x: 0, z: 0 })).toBe(0);
    expect(horizonClearCount(undefined, { x: 0, z: 0 })).toBe(0);
  });
});

describe('startNavigationDrift', () => {
  it('writes the estimate offset from the truth by the current error and tags its fields SIM', () => {
    seedStore();
    const runner = manualRunner({ random: () => 0 });   // offset due east (+x)
    runner.tick();
    runner.step();
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 50, trueZ: 0 } }));
    runner.tick();
    const nav = useMissionStore.getState().navigation;
    expect(nav.errorM).toBeCloseTo(0.4 + DRIFT_RATE_PER_M * 50, 3);
    expect(Math.hypot(nav.x - 50, nav.z)).toBeCloseTo(nav.errorM, 1);
    const sources = useMissionStore.getState().sources;
    for (const path of ['navigation.x', 'navigation.z', 'navigation.errorM', 'navigation.fixMode', 'navigation.lastFixSec']) {
      expect(sources[path].tag).toBe('SIM');
    }
    runner.stop();
  });

  it('grows the ring while walking and shrinks it after a 5 s stop in clear air', () => {
    seedStore();
    const runner = manualRunner();
    runner.tick();
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 250, trueZ: 0 } }));
    runner.tick();   // walked 250 m: error past the fix limit
    const walked = useMissionStore.getState().navigation;
    expect(walked.errorM).toBeCloseTo(0.4 + DRIFT_RATE_PER_M * 250, 3);
    expect(walked.fixMode).toBe(FIX_MODES.deadReckoning);
    for (let i = 0; i < (FIX_STILL_SEC * 1000) / NAV_DRIFT_TICK_MS; i += 1) { runner.step(); runner.tick(); }
    const fixed = useMissionStore.getState().navigation;
    expect(fixed.errorM).toBeLessThan(1);
    expect(fixed.fixMode).toBe(FIX_MODES.terrainFix);
    expect(Math.hypot(fixed.x - 250, fixed.z)).toBeLessThanOrEqual(fixed.errorM + 0.01);
    runner.stop();
  });

  it('keeps growing in a dust storm: no fix while standing still', () => {
    seedStore({ environment: { dustOpacity: 2 } });   // the 2022 regional storm
    const runner = manualRunner();
    runner.tick();
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 100, trueZ: 0 } }));
    runner.tick();
    const walked = useMissionStore.getState().navigation;
    expect(walked.errorM).toBeCloseTo(0.4 + DRIFT_RATE_PER_M * 100, 3);
    expect(walked.fixMode).toBe(FIX_MODES.deadReckoning);
    for (let i = 0; i < (FIX_STILL_SEC * 1000) / NAV_DRIFT_TICK_MS; i += 1) { runner.step(); runner.tick(); }
    const nav = useMissionStore.getState().navigation;
    expect(nav.errorM).toBe(walked.errorM);            // standing still: the storm blocks every fix, the ring never shrinks
    expect(nav.fixMode).toBe(FIX_MODES.deadReckoning);
    expect(nav.lastFixSec).toBe(0);                    // no fix taken
    runner.stop();
  });

  it('takes no fix at night', () => {
    seedStore({ mission: { elapsedSec: 0, paused: false, sky: 'night' } });
    const runner = manualRunner();
    runner.tick();
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 80, trueZ: 0 } }));
    runner.tick();
    const errorBefore = useMissionStore.getState().navigation.errorM;
    for (let i = 0; i < (FIX_STILL_SEC * 1000) / NAV_DRIFT_TICK_MS; i += 1) { runner.step(); runner.tick(); }
    const nav = useMissionStore.getState().navigation;
    expect(nav.errorM).toBe(errorBefore);              // no snap under 1 m
    expect(nav.fixMode).not.toBe(FIX_MODES.terrainFix);
    runner.stop();
  });

  it('stops fixing when the horizon is hidden behind a ridge', () => {
    seedStore();
    // Horizon rays blocked, but clear air and daylight: the astronaut cannot see the horizon.
    const runner = manualRunner({ lineOfSight: () => ({ clear: false }) });
    runner.tick();
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 60, trueZ: 0 } }));
    runner.tick();
    const errorBefore = useMissionStore.getState().navigation.errorM;
    for (let i = 0; i < (FIX_STILL_SEC * 1000) / NAV_DRIFT_TICK_MS; i += 1) { runner.step(); runner.tick(); }
    const nav = useMissionStore.getState().navigation;
    expect(nav.errorM).toBe(errorBefore);              // no fix: the horizon never clears
    expect(nav.fixMode).not.toBe(FIX_MODES.terrainFix);
    runner.stop();
  });

  it('bounds the error with radio ranging while the mast is in line of sight, and loses the bound behind a ridge', () => {
    const mast = { id: 'mast', x: 400, z: 0 };
    let losClear = true;
    const runner = manualRunner({
      getMast: () => mast,
      lineOfSight: (a, b) => ({ clear: b?.id === 'mast' && losClear }),   // horizon blocked, mast link controlled
    });
    seedStore();
    runner.tick();
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 300, trueZ: 0 } }));
    runner.tick();
    const bounded = useMissionStore.getState().navigation;
    expect(bounded.errorM).toBe(RANGING_BOUND_M);
    expect(bounded.fixMode).toBe(FIX_MODES.radioRanging);

    // Behind the ridge the link drops: ranging stops and the error grows past the bound while walking.
    losClear = false;
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 600, trueZ: 0 } }));
    runner.tick();
    const free = useMissionStore.getState().navigation;
    expect(free.errorM).toBeGreaterThan(RANGING_BOUND_M);
    expect(free.fixMode).toBe(FIX_MODES.deadReckoning);
    runner.stop();
  });

  it('changes nothing while the mission is paused', () => {
    seedStore();
    const runner = manualRunner();
    runner.tick();
    const before = useMissionStore.getState().navigation;
    useMissionStore.setState((s) => ({ mission: { ...s.mission, paused: true }, navigation: { ...s.navigation, trueX: 80, trueZ: 0 } }));
    for (let i = 0; i < 5; i += 1) { runner.step(); runner.tick(); }
    const after = useMissionStore.getState().navigation;
    expect(after.x).toBe(before.x);
    expect(after.z).toBe(before.z);
    expect(after.errorM).toBe(before.errorM);
    expect(after.lastFixSec).toBe(before.lastFixSec);
    runner.stop();
  });

  it('re-seeds from a fresh fix written by initNavigation (a new EVA)', () => {
    seedStore();
    const runner = manualRunner();
    runner.tick();
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, trueX: 100, trueZ: 0 } }));
    runner.tick();
    expect(useMissionStore.getState().navigation.errorM).toBeGreaterThan(1);   // drift has accumulated
    useMissionStore.setState((s) => ({ navigation: { ...s.navigation, errorM: 0.4, fixMode: FIX_MODES.terrainFix, lastFixSec: 60 } }));
    runner.tick();
    const nav = useMissionStore.getState().navigation;
    expect(nav.errorM).toBeLessThan(1);
    expect(nav.fixMode).toBe(FIX_MODES.terrainFix);    // standing on the fresh fix: the mode stays until the next walk
    expect(nav.lastFixSec).toBe(60);
    runner.stop();
  });

  it('seeds a fresh fix when the store has no navigation values yet', () => {
    seedStore();
    const runner = manualRunner();
    runner.tick();
    const nav = useMissionStore.getState().navigation;
    expect(nav.errorM).toBe(0.4);
    expect(nav.fixMode).toBe(FIX_MODES.terrainFix);
    expect(Number.isFinite(nav.x)).toBe(true);
    expect(Number.isFinite(nav.z)).toBe(true);
    runner.stop();
  });

  it('requires at least HORIZON_MIN_CLEAR horizon rays for a fix', () => {
    expect(HORIZON_MIN_CLEAR).toBeGreaterThan(0);
  });
});
