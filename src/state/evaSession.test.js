import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOCK_STORAGE_KEY, createClockSession, readClockSession, startMissionClock, writeClockSession } from '../sim/missionClock.js';
import { resetStore, setMode, setNeeds, useMissionStore } from './store.js';
import { pauseEva, resumeEva, restartEva } from './evaSession.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
}

/** A clock with a manual wall clock and one manual interval, so pause boundaries are exact in the test. */
function testClock(storage, now) {
  let timer = null;
  const clock = startMissionClock({
    store: useMissionStore,
    storage,
    now,
    setInterval: (fn) => { timer = fn; return 1; },
    clearInterval: () => { timer = null; },
  });
  return { clock, tick: () => timer && timer(), hasTimer: () => timer !== null };
}

function fakeEngine({ lock = true } = {}) {
  let resolveLock = null;
  const engine = {
    inputEnabled: true,
    released: 0,
    resets: 0,
    resetState: null,
    requested: 0,
    requestPointerLock: vi.fn(() => {
      engine.requested += 1;
      if (lock !== 'deferred') return Promise.resolve(lock);
      return new Promise((resolve) => { resolveLock = resolve; });
    }),
    setInputEnabled(value) { engine.inputEnabled = value; },
    releasePointerLock() { engine.released += 1; },
    resetSession() { engine.resets += 1; engine.resetState = useMissionStore.getState(); },
    resolveLock(value) { resolveLock(value); },
  };
  return engine;
}

beforeEach(() => {
  resetStore();
});

describe('EVA pause and resume', () => {
  it('restores the #59 session and freezes it when the start screen takes over', () => {
    const storage = memoryStorage();
    const start = 1_700_000_000_000;
    writeClockSession(storage, createClockSession({}, start));

    let now = start + 12_000;
    const { clock, tick } = testClock(storage, () => now);
    // A restored running session includes the time the page was absent, per #59.
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(12, 9);
    expect(useMissionStore.getState().mission.paused).toBe(false);

    pauseEva({ engine: {} });
    expect(useMissionStore.getState().mission.paused).toBe(true);

    now += 30_000;
    tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(12, 9);
    clock.stop();
  });

  it('pauses the real clock exactly, and never resumes Walk before pointer lock is granted', async () => {
    const storage = memoryStorage();
    let now = 1_700_000_000_000;
    const { clock, tick, hasTimer } = testClock(storage, () => now);

    now += 5000;
    tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(5, 9);

    const engine = fakeEngine({ lock: 'deferred' });
    pauseEva({ engine });
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(engine.inputEnabled).toBe(false);
    expect(engine.released).toBe(1);
    const pausedAt = useMissionStore.getState().mission.elapsedSec;
    expect(pausedAt).toBeCloseTo(5, 9);

    now += 20_000;
    tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBe(pausedAt);

    // First attempt: the browser refuses the lock. Time and input must stay frozen.
    const refused = resumeEva({ engine, mode: 'walk' });
    await Promise.resolve();
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(engine.inputEnabled).toBe(false);
    engine.resolveLock(false);
    await expect(refused).resolves.toMatchObject({ ok: false });
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(engine.inputEnabled).toBe(false);

    // Second attempt: the lock is granted, and only then do inputs and the clock resume.
    const accepted = resumeEva({ engine, mode: 'walk' });
    await Promise.resolve();
    expect(useMissionStore.getState().mission.paused).toBe(true);
    engine.resolveLock(true);
    await expect(accepted).resolves.toMatchObject({ ok: true });
    expect(useMissionStore.getState().mission.paused).toBe(false);
    expect(engine.inputEnabled).toBe(true);

    now += 2000;
    tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(pausedAt + 2, 9);
    expect(hasTimer()).toBe(true);
    clock.stop();
  });

  it('resumes Plan without asking for pointer lock', async () => {
    const engine = fakeEngine({ lock: false });
    pauseEva({ engine });
    expect(useMissionStore.getState().mission.paused).toBe(true);

    await expect(resumeEva({ engine, mode: 'plan' })).resolves.toMatchObject({ ok: true });
    expect(engine.requested).toBe(0);
    expect(engine.inputEnabled).toBe(true);
    expect(useMissionStore.getState().mission.paused).toBe(false);
  });

  it('abandons a late lock grant instead of resuming behind the menu', async () => {
    const engine = fakeEngine({ lock: 'deferred' });
    pauseEva({ engine });
    expect(engine.released).toBe(1);

    let current = true;
    const pending = resumeEva({ engine, mode: 'walk', isCurrent: () => current });
    await Promise.resolve();
    expect(useMissionStore.getState().mission.paused).toBe(true);

    // Escape, a switch to Plan or a restart happens while the browser is still answering.
    current = false;
    engine.resolveLock(true);
    await expect(pending).resolves.toMatchObject({ ok: false, stale: true, message: null });
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(engine.inputEnabled).toBe(false);
    expect(engine.released).toBe(2);   // the pause, then the abandoned grant
  });

  it('explains a refused lock without blaming permissions alone and points at a retry', async () => {
    const engine = fakeEngine({ lock: false });
    pauseEva({ engine });
    const result = await resumeEva({ engine, mode: 'walk' });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/stays paused/);
    expect(result.message).toMatch(/Wait briefly after Escape/);
    expect(result.message).toMatch(/browser settings/);
    expect(result.message).toMatch(/try again/);
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(engine.inputEnabled).toBe(false);
  });

  it('reports a missing engine lock API instead of resuming Walk', async () => {
    const engine = { inputEnabled: true, setInputEnabled(value) { engine.inputEnabled = value; } };
    pauseEva({ engine });
    const result = await resumeEva({ engine, mode: 'walk' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not available/i);
    expect(result.lockFailed).toBe(true);
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(engine.inputEnabled).toBe(false);
  });
});

describe('EVA without mouse capture (#197)', () => {
  it('flags a refused lock so the menus can offer drag-to-look', async () => {
    const engine = fakeEngine({ lock: false });
    pauseEva({ engine });
    const result = await resumeEva({ engine, mode: 'walk' });
    expect(result).toMatchObject({ ok: false, lockFailed: true });
    expect(result.message).toMatch(/continue without mouse capture/i);
  });

  it('resumes Walk with drag-to-look after a refusal, without a second lock request', async () => {
    const engine = fakeEngine({ lock: false });
    pauseEva({ engine });
    await resumeEva({ engine, mode: 'walk' });
    expect(engine.requested).toBe(1);
    expect(useMissionStore.getState().mission.paused).toBe(true);

    await expect(resumeEva({ engine, mode: 'walk', capture: false })).resolves.toEqual({ ok: true, message: null });
    expect(engine.requested).toBe(1);
    expect(engine.inputEnabled).toBe(true);
    expect(useMissionStore.getState().mission.paused).toBe(false);
  });

  it('resumes Walk without capture when the engine has no lock API at all', async () => {
    const engine = { inputEnabled: false, setInputEnabled(value) { engine.inputEnabled = value; } };
    pauseEva({ engine });
    await expect(resumeEva({ engine, mode: 'walk', capture: false })).resolves.toMatchObject({ ok: true });
    expect(engine.inputEnabled).toBe(true);
    expect(useMissionStore.getState().mission.paused).toBe(false);
  });

  it('cancels a lock request still in flight so a late grant cannot capture the drag pointer', async () => {
    const engine = fakeEngine({ lock: 'deferred' });
    pauseEva({ engine });
    const releasedBefore = engine.released;
    await resumeEva({ engine, mode: 'walk', capture: false });
    expect(engine.requested).toBe(0);
    expect(engine.released).toBe(releasedBefore + 1);
  });

  it('pauses the same way after a drag-to-look resume', async () => {
    const engine = fakeEngine({ lock: false });
    await resumeEva({ engine, mode: 'walk', capture: false });
    pauseEva({ engine });
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(engine.inputEnabled).toBe(false);
  });
});

describe('EVA restart', () => {
  it('stops the old runners, clears the persisted session, resets store and engine, and starts one paused clock', () => {
    const storage = memoryStorage();
    let now = 1_700_000_000_000;
    const old = testClock(storage, () => now);
    now += 10_000;
    old.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(10, 9);

    // Junk from the running EVA, all of which has to disappear.
    useMissionStore.setState((s) => ({
      ...s,
      mode: 'walk',
      navigation: { ...s.navigation, x: 42, z: -17 },
      suit: { ...s.suit, oxygenPct: 55 },
      route: { ...s.route, path: [[0, 0], [10, 10]], distanceM: 14.1 },
      alerts: { dust: { id: 'dust', active: true } },
      eva: { ...s.eva, phase: 'ended', distanceM: 123, events: [{ type: 'start', eventId: 'dust', atSec: 10 }], summary: { distanceM: 123 } },
    }));

    const order = [];
    let newClock = null;
    const engine = fakeEngine();
    const startSimulation = vi.fn(() => {
      order.push('start');
      expect(storage.getItem(CLOCK_STORAGE_KEY)).toBeNull();
      newClock = testClock(storage, () => now);
      return () => newClock.clock.stop();
    });
    const stopSimulation = vi.fn(() => { order.push('stop'); old.clock.stop(); });

    const result = restartEva({ engine, stopSimulation, startSimulation, storage });

    expect(result.ok).toBe(true);
    expect(result.message).toBeNull();
    expect(order).toEqual(['stop', 'start']);
    expect(engine.resets).toBe(1);
    expect(engine.resetState.mode).toBe('plan');   // a new EVA starts at the planning table (#166)
    expect(engine.resetState.navigation.x).toBeNull();
    expect(engine.resetState.suit.oxygenPct).toBeNull();
    expect(engine.resetState.route.path).toBeNull();
    expect(engine.resetState.alerts).toEqual({});
    expect(engine.resetState.eva).toMatchObject({ phase: 'ready', distanceM: 0, events: [], routeChanges: [], summary: null });

    const mission = useMissionStore.getState().mission;
    expect(mission.paused).toBe(true);
    expect(mission.elapsedSec).toBe(0);
    expect(mission.startedAtMs).toBe(now);

    const persisted = readClockSession(storage);
    expect(persisted).toMatchObject({ paused: true, elapsedSec: 0, startedAtMs: now });
    const newStart = mission.startedAtMs;

    // Time on the new start screen does not advance the EVA.
    now += 30_000;
    newClock.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBe(0);

    // A later remount restores the new paused session, never the old 10-second one.
    newClock.clock.stop();
    const remounted = testClock(storage, () => now);
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(useMissionStore.getState().mission.elapsedSec).toBe(0);
    expect(useMissionStore.getState().mission.startedAtMs).toBe(newStart);
    remounted.clock.stop();
  });

  it('still pauses the store and reports a reset problem', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = fakeEngine();
    engine.resetSession = () => { throw new Error('WebGL lost'); };
    const result = restartEva({ engine, storage: memoryStorage() });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/engine reset: WebGL lost/);
    expect(useMissionStore.getState().mission.paused).toBe(true);
    error.mockRestore();
  });

  it('refuses to create a second simulation when there is no stop callback', () => {
    const startSimulation = vi.fn();
    const result = restartEva({ engine: fakeEngine(), startSimulation, storage: memoryStorage() });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/stopSimulation and startSimulation/);
    expect(startSimulation).not.toHaveBeenCalled();
    expect(useMissionStore.getState().mission.paused).toBe(true);
  });

  it('does not start a new simulation when the old stop throws', () => {
    const startSimulation = vi.fn();
    const result = restartEva({
      engine: fakeEngine(),
      startSimulation,
      stopSimulation: () => { throw new Error('stop failed'); },
      storage: memoryStorage(),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/simulation stop: stop failed/);
    expect(startSimulation).not.toHaveBeenCalled();
    expect(useMissionStore.getState().mission.paused).toBe(true);
  });

  it('keeps the needs of the crew and the route profile for the next EVA, unlocked (D9)', () => {
    setNeeds({ objective: 'cheyava', crew: 1, risk: 'cautious' });
    useMissionStore.setState((state) => ({ route: { ...state.route, profile: 'gentlest' } }));
    setMode('walk');   // Begin EVA locks them
    restartEva({ engine: fakeEngine(), storage: memoryStorage() });
    const { needs, route, mode } = useMissionStore.getState();
    expect(needs).toMatchObject({ objective: 'cheyava', crew: 1, risk: 'cautious', locked: false });
    expect(route.profile).toBe('gentlest');
    expect(mode).toBe('plan');
  });
});
