import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AIRLOCK_CYCLE_MS, AIRLOCK_MIN_DARK_MS, STAGE, beginEgress, canAdvance, canSwitchMode, completeEgress, continueFromDebrief, inAirlock, isOnSurface,
  isPlanning, runAirlockCycle, showDebrief,
} from './flow.js';
import { pauseMission, resetStore, setMode, useMissionStore } from './store.js';
import { pauseEva, restartEva, resumeEva } from './evaSession.js';
import { startSimulation } from './simulation.js';
import { startAtAirlock } from '../plan/routeStart.js';
import { resetDataFiles } from '../data/dataFiles.js';

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const files = {
  'hazards.json': read('../../public/data/hazards.json'),
  'shelters.json': read('../../public/data/shelters.json'),
  'stops.json': read('../../public/data/stops.json'),
};
const route = read('../../public/marswalk/assets/route.json');
const entry = files['shelters.json'].shelters.find((s) => s.id === 'HAB');
const respond = (url) => {
  const name = Object.keys(files).find((key) => String(url).endsWith(key));
  return Promise.resolve(name ? { ok: true, json: () => Promise.resolve(files[name]) } : { ok: false, status: 404 });
};
const ENGINE = { heightAt: () => 0 };

function fakeEngine() {
  const engine = {
    inputEnabled: false, requested: 0, released: 0, resets: 0,
    requestPointerLock: vi.fn(() => { engine.requested += 1; return Promise.resolve(true); }),
    releasePointerLock() { engine.released += 1; },
    setInputEnabled(value) { engine.inputEnabled = value; },
    resetSession() { engine.resets += 1; },
  };
  return engine;
}

/** What the mission table leaves in the store: the route from the airlock, planned. */
function planned() {
  const waypoints = startAtAirlock(route.waypoints, files['shelters.json']);
  useMissionStore.setState((s) => ({
    route: { ...s.route, waypoints, path: waypoints.map((w) => [w.x, w.z]), decision: 'go' },
    navigation: { ...s.navigation, trueX: 0, trueZ: 0, headingDeg: 0 },   // inside the habitat, far from the airlock entry
  }));
}

const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeEach(() => {
  resetStore();
  resetDataFiles();
  const values = new Map();
  vi.stubGlobal('sessionStorage', { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('flow stages', () => {
  it('starts inside the habitat, on foot', () => {
    const s = useMissionStore.getState();
    expect(s.stage).toBe(STAGE.HABITAT);
    expect(s.mode).toBe('walk');
    expect(isPlanning(s)).toBe(true);
    expect(isOnSurface(s)).toBe(false);
  });

  it('goes habitat, egress, eva, debrief, and back to eva only through Continue EVA', () => {
    expect(canAdvance(STAGE.HABITAT, STAGE.EGRESS)).toBe(true);
    expect(canAdvance(STAGE.HABITAT, STAGE.EVA)).toBe(false);
    expect(canAdvance(STAGE.EGRESS, STAGE.HABITAT)).toBe(false);
    expect(canAdvance(STAGE.EVA, STAGE.HABITAT)).toBe(false);
    expect(canAdvance(STAGE.DEBRIEF, STAGE.HABITAT)).toBe(false);   // only a restart (resetStore) goes back inside

    setMode('plan');   // at the mission table
    beginEgress();
    expect(useMissionStore.getState()).toMatchObject({ stage: STAGE.EGRESS, mode: 'walk' });   // the table closes
    expect(inAirlock(useMissionStore.getState())).toBe(true);
    completeEgress();
    expect(isOnSurface(useMissionStore.getState())).toBe(true);
    expect(inAirlock(useMissionStore.getState())).toBe(false);
    showDebrief();   // X at the table (#244) froze the summary
    expect(useMissionStore.getState().stage).toBe(STAGE.DEBRIEF);
    continueFromDebrief();   // Continue EVA
    expect(isOnSurface(useMissionStore.getState())).toBe(true);
  });

  it('refuses every Plan / Walk switch during the airlock cycle, so the table cannot open over the new EVA', () => {
    setMode('plan');
    beginEgress();
    expect(canSwitchMode(useMissionStore.getState())).toBe(false);
    expect(setMode('plan')).toBe(false);   // M or the pad's Start in the 2.6 s cycle
    expect(useMissionStore.getState().mode).toBe('walk');
    completeEgress();
    expect(canSwitchMode(useMissionStore.getState())).toBe(true);
    expect(setMode('plan')).toBe(true);   // on the surface the table reopens (#282)
    expect(useMissionStore.getState().mode).toBe('plan');
  });

  it('refuses a skipped or repeated transition', () => {
    expect(() => completeEgress()).toThrow(/habitat to eva/);
    beginEgress();
    expect(() => beginEgress()).toThrow(/egress to egress/);
    expect(useMissionStore.getState().stage).toBe(STAGE.EGRESS);
  });
});

describe('airlock cycle', () => {
  function clock() {
    let t = 0;
    const queue = [];
    return {
      now: () => t,
      schedule: (fn) => { queue.push(fn); return queue.length; },
      cancel: () => { queue.length = 0; },
      advance(ms, step = 16) {
        for (let done = 0; done < ms; done += step) { t += step; const next = queue.splice(0); next.forEach((fn) => fn()); }
      },
    };
  }

  it('goes dark once, then finishes once, in about the cycle length', () => {
    const c = clock();
    const onDark = vi.fn(), onDone = vi.fn();
    runAirlockCycle({ ...c, onDark, onDone });
    c.advance(AIRLOCK_CYCLE_MS * 0.2);
    expect(onDark).not.toHaveBeenCalled();
    c.advance(AIRLOCK_CYCLE_MS * 0.1);
    expect(onDark).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    c.advance(AIRLOCK_CYCLE_MS * 0.75);
    expect(onDone).toHaveBeenCalledTimes(1);
    c.advance(1000);
    expect(onDark).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stands still while the pause menu is open', () => {
    const c = clock();
    let running = true;
    const onDone = vi.fn();
    const cycle = runAirlockCycle({ ...c, running: () => running, onDone });
    c.advance(1000);
    const at = cycle.progress();
    running = false;
    c.advance(10_000);
    expect(cycle.progress()).toBe(at);
    expect(onDone).not.toHaveBeenCalled();
    running = true;
    c.advance(AIRLOCK_CYCLE_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('gives the move its own frame and time before the end, even after one very long frame', () => {
    const c = clock();
    const order = [];
    runAirlockCycle({ ...c, onDark: () => order.push(['dark', c.now()]), onDone: () => order.push(['done', c.now()]) });
    c.advance(AIRLOCK_CYCLE_MS * 3, AIRLOCK_CYCLE_MS * 3);   // one frame of three cycle lengths
    expect(order.map(([name]) => name)).toEqual(['dark']);
    c.advance(1000);
    expect(order.map(([name]) => name)).toEqual(['dark', 'done']);
    expect(order[1][1] - order[0][1]).toBeGreaterThanOrEqual(AIRLOCK_MIN_DARK_MS);
  });

  it('never calls back after stop', () => {
    const c = clock();
    const onDone = vi.fn();
    const cycle = runAirlockCycle({ ...c, onDone });
    cycle.stop();
    c.advance(AIRLOCK_CYCLE_MS * 2);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('the simulator flow with the real simulation', () => {
  it('holds the clock and runs no suit, event or EVA runner in the habitat; all start after the airlock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(respond));
    planned();
    const engine = fakeEngine();
    const stop = startSimulation(ENGINE);
    pauseMission();   // the start screen

    // Start: walking in the habitat with the clock held.
    await expect(resumeEva({ engine, mode: 'walk', holdClock: true })).resolves.toMatchObject({ ok: true });
    expect(engine.inputEnabled).toBe(true);
    await flush();
    vi.advanceTimersByTime(10 * 60_000);   // ten minutes in the habitat, past the dust storm's trigger time
    let s = useMissionStore.getState();
    expect(s.mission.paused).toBe(true);
    expect(s.mission.elapsedSec).toBe(0);
    expect(s.suit.oxygenPct).toBeNull();
    expect(Object.values(s.alerts).filter((a) => a?.active)).toEqual([]);
    expect(s.environment.dustOpacity).toBe(0);
    expect(s.eva.phase).toBe('ready');

    // The mission table, open and closed: still nothing runs.
    setMode('plan');
    vi.advanceTimersByTime(60_000);
    setMode('walk');
    expect(useMissionStore.getState().mission.elapsedSec).toBe(0);

    // Begin EVA, the cycle, then out: a new clock at 0:00 that runs once the app resumes it.
    beginEgress();
    vi.advanceTimersByTime(AIRLOCK_CYCLE_MS);
    expect(useMissionStore.getState().suit.oxygenPct).toBeNull();
    useMissionStore.setState((st) => ({ navigation: { ...st.navigation, trueX: entry.x - 0.4, trueZ: entry.z - 0.5 } }));   // exitAirlock()
    completeEgress();
    useMissionStore.setState((st) => ({ mission: { ...st.mission, paused: false } }));
    await flush();
    vi.advanceTimersByTime(5000);
    s = useMissionStore.getState();
    expect(s.mission.elapsedSec).toBeCloseTo(5, 6);
    expect(s.suit.oxygenPct).toBeGreaterThan(99);
    expect(s.suit.walkbackSec).toBeLessThan(2);
    expect(s.route.nextIndex).toBe(1);
    expect(s.navigation.fixMode).toBe('terrain fix');
    stop();
  });

  it('a restart from the pause menu or the debrief puts the astronaut back in the habitat with a fresh mission', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const engine = fakeEngine();
    let stopSim = startSimulation(ENGINE);
    beginEgress();
    completeEgress();
    showDebrief();
    useMissionStore.setState((s) => ({ eva: { ...s.eva, phase: 'ended', summary: { distanceM: 10 } } }));
    pauseEva({ engine });

    const result = restartEva({
      engine,
      stopSimulation: () => stopSim(),
      startSimulation: () => { stopSim = startSimulation(ENGINE); },
    });
    expect(result.ok).toBe(true);
    const s = useMissionStore.getState();
    expect(s.stage).toBe(STAGE.HABITAT);
    expect(s.mode).toBe('walk');
    expect(s.eva.summary).toBeNull();
    expect(s.mission.paused).toBe(true);
    expect(engine.resets).toBe(1);
    // The pause menu's "End the EVA and go back to the mission table" opens the table right after.
    setMode('plan');
    expect(isPlanning(useMissionStore.getState())).toBe(true);
    stopSim();
  });
});
