import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLOCK_STORAGE_KEY,
  DEMO_MISSION_CLOCK,
  MARS_SEC_PER_EARTH_SEC,
  SOL_LENGTH_EARTH_SEC,
  clearClockSession,
  clockReading,
  createClockSession,
  defaultSessionStorage,
  demoStartLmstForSky,
  elapsedSecAt,
  formatLmst,
  localMeanSolarTimeHours,
  longitudeOffsetHours,
  parseLmst,
  pauseClockSession,
  primeMeridianMeanTimeHours,
  readClockSession,
  resolveClockConfig,
  resumeClockSession,
  setClockTimeScale,
  startMissionClock,
  toStoredClockSession,
  writeClockSession,
} from './missionClock.js';
import { pauseMission, resetStore, resumeMission, setMissionTimeScale, useMissionStore } from '../state/store.js';

const START = 1_700_000_000_000;

function memoryStorage(initial) {
  const values = new Map();
  if (initial !== undefined) values.set(CLOCK_STORAGE_KEY, initial);
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    dump: () => values.get(CLOCK_STORAGE_KEY),
  };
}

/** Minimal store with the Zustand method names, so clock tests need no React. */
function fakeStore() {
  let state = { mission: { paused: false, timeScale: 1 }, view: { sky: 'clear_day' }, sources: {} };
  const listeners = new Set();
  return {
    getState: () => state,
    setState: (partial) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
      for (const listener of [...listeners]) listener(state);
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    listenerCount: () => listeners.size,
    patchMission: (patch) => {
      state = { ...state, mission: { ...state.mission, ...patch } };
      for (const listener of [...listeners]) listener(state);
    },
  };
}

function clockOptions(overrides = {}) {
  let timer = null;
  return {
    store: fakeStore(),
    storage: memoryStorage(),
    now: () => START,
    setInterval: (fn) => { timer = fn; return 7; },
    clearInterval: () => { timer = null; },
    runTimer: () => timer && timer(),
    ...overrides,
  };
}

describe('mission clock timing', () => {
  it('derives elapsed time from timestamps, not from ticks or frame times', () => {
    const session = createClockSession({}, START);
    expect(elapsedSecAt(session, START)).toBe(0);
    expect(elapsedSecAt(session, START + 10_000)).toBeCloseTo(10, 9);
    // One huge jump and many small ticks are the same function of the wall clock.
    expect(elapsedSecAt(session, START + 3_600_000)).toBeCloseTo(3600, 9);
  });

  it('ignores an irregular tick pattern and a large timestamp jump', () => {
    let t = START;
    const options = clockOptions({ now: () => t });
    const clock = startMissionClock(options);
    for (const dtMs of [250, 3000, 100, 12_000]) {
      t += dtMs;
      options.runTimer();
    }
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(15.35, 9);

    t += 1_000_000;
    options.runTimer();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(1015.35, 9);
    clock.stop();

    // A reading before the anchor never subtracts time from the anchored value.
    const session = createClockSession({}, START);
    expect(elapsedSecAt(session, START - 10_000)).toBe(0);
  });

  it('freezes elapsed time exactly at pause and continues from resume, through repeats', () => {
    // Pure session transforms, used by the runner below.
    const base = createClockSession({}, START);
    const purePaused = pauseClockSession(base, START + 1000);
    expect(elapsedSecAt(purePaused, START + 60_000)).toBeCloseTo(1, 9);
    const pureResumed = resumeClockSession(purePaused, START + 60_000);
    expect(elapsedSecAt(pureResumed, START + 61_000)).toBeCloseTo(2, 9);
    expect(pauseClockSession(purePaused, START + 120_000)).toEqual(purePaused);
    expect(resumeClockSession(pureResumed, START + 120_000)).toEqual(pureResumed);

    let t = START;
    const options = clockOptions({ now: () => t });
    const clock = startMissionClock(options);

    t += 5000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(5, 9);

    t += 1500;
    clock.pause();
    const paused = options.store.getState().mission;
    expect(paused.paused).toBe(true);
    expect(paused.elapsedSec).toBeCloseTo(6.5, 9);

    t += 60_000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(6.5, 9);

    clock.pause();                       // repeated pause must not move the boundary
    t += 1000;
    clock.resume();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(6.5, 9);
    expect(options.store.getState().mission.paused).toBe(false);

    t += 3500;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(10, 9);

    clock.pause();
    clock.resume();
    clock.resume();
    t += 1000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(11, 9);
    clock.stop();
  });

  it('keeps elapsed time and paused status continuous when time scale changes', () => {
    let t = START;
    const options = clockOptions({ now: () => t });
    const clock = startMissionClock(options);

    t += 10_000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(10, 9);

    clock.setTimeScale(2);
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(10, 9);
    t += 5000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(20, 9);

    clock.pause();
    clock.setTimeScale(60);
    const frozen = options.store.getState().mission.elapsedSec;
    t += 30_000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(frozen, 9);
    expect(options.store.getState().mission.paused).toBe(true);

    clock.resume();
    t += 1000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(frozen + 60, 9);
    clock.stop();
  });
});

describe('Mars sol and local mean solar time', () => {
  it('advances 24 Mars hours in exactly 88,775 Earth seconds and rolls the sol', () => {
    const session = createClockSession({ initialSol: 1210, initialLmst: '17:45' }, START);
    const afterSol = clockReading(session, START + SOL_LENGTH_EARTH_SEC * 1000);
    expect(afterSol.elapsedSec).toBeCloseTo(SOL_LENGTH_EARTH_SEC, 9);
    expect(afterSol.sol).toBe(1211);
    expect(afterSol.lmst).toBe('17:45');

    const half = clockReading(session, START + (SOL_LENGTH_EARTH_SEC / 2) * 1000);
    expect(half.sol).toBe(1211);
    expect(half.lmst).toBe('05:45');
  });

  it('rolls over repeatedly and keeps the Mars clock rate', () => {
    const session = createClockSession({ initialSol: 1210, initialLmst: '17:45' }, START);
    const twoSols = clockReading(session, START + (2 * SOL_LENGTH_EARTH_SEC + 120) * 1000);
    expect(twoSols.sol).toBe(1212);
    expect(twoSols.lmst).toBe('17:46');
    expect(twoSols.elapsedSec).toBeCloseTo(2 * SOL_LENGTH_EARTH_SEC + 120, 6);

    expect(MARS_SEC_PER_EARTH_SEC).toBeCloseTo(86400 / 88775, 15);
    expect(clockReading(session, START + 88775 * 1000).lmst).toBe('17:45');
  });

  it('applies time scale to LMST as well as elapsed time', () => {
    const session = createClockSession({ initialSol: 1210, initialLmst: '17:45', timeScale: 2 }, START);
    const reading = clockReading(session, START + SOL_LENGTH_EARTH_SEC * 1000);
    expect(reading.elapsedSec).toBeCloseTo(2 * SOL_LENGTH_EARTH_SEC, 9);
    // Two mission sols in 88,775 real seconds at scale 2.
    expect(reading.sol).toBe(1212);
    expect(reading.lmst).toBe('17:45');
  });

  it('formats and parses 24-hour local time', () => {
    expect(parseLmst('00:00')).toBe(0);
    expect(parseLmst('17:45')).toBe(63_900);
    expect(parseLmst('23:59')).toBe(86_340);
    expect(formatLmst(63_900)).toBe('17:45');
    expect(formatLmst(86_399)).toBe('23:59');
    expect(formatLmst(-60)).toBe('23:59');
  });

  it('uses the Mars24 longitude sign and helper direction', () => {
    expect(longitudeOffsetHours(77.3053)).toBeCloseTo(5.1536866667, 9);
    expect(longitudeOffsetHours(-77.3053)).toBeCloseTo(-5.1536866667, 9);
    expect(localMeanSolarTimeHours(6, 77.3053)).toBeCloseTo(11.1536866667, 9);
    expect(localMeanSolarTimeHours(6, -77.3053)).toBeCloseTo(0.8463133333, 9);
    expect(localMeanSolarTimeHours(22, 77.3053)).toBeCloseTo(3.1536866667, 9);
    expect(primeMeridianMeanTimeHours(localMeanSolarTimeHours(6, 77.3053), 77.3053)).toBeCloseTo(6, 12);
  });

  it('does not apply longitude twice to a configured local start time', () => {
    const session = createClockSession({ initialLmst: '17:45', longitudeDeg: 77.3053 }, START);
    expect(clockReading(session, START).lmst).toBe('17:45');
    // 120 Earth seconds is about 117 Mars clock seconds: 17:45 + 1 min, not 17:45 + 5 h.
    expect(clockReading(session, START + 120_000).lmst).toBe('17:46');
  });
});

describe('configuration', () => {
  it('applies the demo defaults and the documented starting skies', () => {
    const defaults = resolveClockConfig();
    expect(defaults).toMatchObject({
      initialSol: 1210, initialLmst: '17:45', timeScale: 1, sky: 'late_afternoon', longitudeDeg: 77.3053,
    });
    expect(defaults.initialLmstSec).toBe(63_900);
    expect(resolveClockConfig({ sky: 'clear_day' }).initialLmst).toBe('14:00');
    expect(resolveClockConfig({ sky: 'dust_storm' }).initialLmst).toBe('14:00');
    expect(resolveClockConfig({ sky: 'late_afternoon' }).initialLmst).toBe('17:45');
    expect(resolveClockConfig({ sky: 'night' }).initialLmst).toBe('22:00');
    expect(demoStartLmstForSky('unknown')).toBe(DEMO_MISSION_CLOCK.initialLmst);
    // An explicit caller time overrides the preset.
    expect(resolveClockConfig({ sky: 'night', initialLmst: '20:30' }).initialLmst).toBe('20:30');
  });

  it('rejects invalid configurations with a meaningful error', () => {
    expect(() => resolveClockConfig([])).toThrow(/mission clock: config/);
    expect(() => resolveClockConfig({ initialSol: 1.5 })).toThrow(/mission clock: initialSol/);
    expect(() => resolveClockConfig({ initialSol: -1 })).toThrow(/mission clock: initialSol/);
    expect(() => resolveClockConfig({ initialLmst: '7:45' })).toThrow(/mission clock: lmst/);
    expect(() => resolveClockConfig({ initialLmst: '24:00' })).toThrow(/mission clock: lmst/);
    expect(() => resolveClockConfig({ initialLmst: '17:60' })).toThrow(/mission clock: lmst/);
    expect(() => resolveClockConfig({ initialLmst: 17 })).toThrow(/mission clock: lmst/);
    expect(() => resolveClockConfig({ timeScale: 0 })).toThrow(/mission clock: timeScale/);
    expect(() => resolveClockConfig({ timeScale: -2 })).toThrow(/mission clock: timeScale/);
    expect(() => resolveClockConfig({ timeScale: Number.POSITIVE_INFINITY })).toThrow(/mission clock: timeScale/);
    expect(() => resolveClockConfig({ longitudeDeg: 200 })).toThrow(/mission clock: longitudeDeg/);
    expect(() => resolveClockConfig({ sky: 'noon' })).toThrow(/mission clock: sky/);
    expect(() => createClockSession({}, -1)).toThrow(/mission clock: now/);
    expect(() => setClockTimeScale(createClockSession({}, START), 0, START)).toThrow(/mission clock: timeScale/);
    expect(() => startMissionClock({})).toThrow(/mission clock: store/);
    expect(() => startMissionClock({ store: fakeStore(), intervalMs: 0 })).toThrow(/mission clock: intervalMs/);
    expect(() => startMissionClock({ store: fakeStore(), now: () => Number.NaN })).toThrow(/mission clock: now/);
  });
});

describe('persistence', () => {
  it('round-trips one clock session in the storage under a fixed key', () => {
    const storage = memoryStorage();
    const session = createClockSession({ sky: 'night', initialLmst: '22:00', timeScale: 4 }, START);
    expect(writeClockSession(storage, session)).toBe(true);
    expect(JSON.parse(storage.dump()).version).toBe(1);
    expect(readClockSession(storage)).toEqual(session);
    expect(toStoredClockSession(session)).not.toHaveProperty('initialLmstSec');
    expect(clearClockSession(storage)).toBe(true);
    expect(readClockSession(storage)).toBeNull();
  });

  it('restores a running session so time the page was absent still counts', () => {
    let t = START;
    const storage = memoryStorage();
    const first = startMissionClock(clockOptions({ now: () => t, storage }));
    t += 12_345;
    first.tick();
    first.stop();

    const options = clockOptions({ now: () => START + 112_345, storage });
    const restored = startMissionClock(options);
    expect(options.store.getState().mission.paused).toBe(false);
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(112.345, 9);
    restored.stop();
  });

  it('restores a paused session without counting the reload gap', () => {
    let t = START;
    const storage = memoryStorage();
    const options = clockOptions({ now: () => t, storage });
    const clock = startMissionClock(options);
    t += 5000;
    clock.tick();
    clock.pause();
    clock.stop();

    const resumedOptions = clockOptions({ now: () => t + 600_000, storage });
    const restored = startMissionClock(resumedOptions);
    expect(resumedOptions.store.getState().mission.paused).toBe(true);
    expect(resumedOptions.store.getState().mission.elapsedSec).toBeCloseTo(5, 9);
    t += 600_000;
    restored.tick();
    expect(resumedOptions.store.getState().mission.elapsedSec).toBeCloseTo(5, 9);
    restored.stop();
  });

  it('tolerates denied and unavailable storage', () => {
    const denied = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    };
    expect(readClockSession(denied)).toBeNull();
    expect(writeClockSession(denied, createClockSession({}, START))).toBe(false);
    expect(clearClockSession(denied)).toBe(false);

    const options = clockOptions({ storage: denied });
    const clock = startMissionClock(options);
    clock.tick();
    clock.pause();
    clock.resume();
    expect(options.store.getState().mission.startedAtMs).toBe(START);
    clock.stop();

    expect(readClockSession(null)).toBeNull();
    expect(writeClockSession(null, createClockSession({}, START))).toBe(false);
  });

  it('ignores malformed JSON and malformed session fields', () => {
    const badJson = memoryStorage('{not json');
    expect(readClockSession(badJson)).toBeNull();
    const options = clockOptions({ storage: badJson });
    const clock = startMissionClock(options);
    expect(options.store.getState().mission.startedAtMs).toBe(START);
    clock.stop();

    const malformed = memoryStorage(JSON.stringify({
      version: 1, startedAtMs: START, anchorMs: START, elapsedSec: 'ten', paused: false,
      timeScale: 1, initialSol: 1210, initialLmst: '17:45', longitudeDeg: 77.3053, sky: 'late_afternoon',
    }));
    expect(readClockSession(malformed)).toBeNull();
    const fallback = clockOptions({ storage: malformed });
    const fresh = startMissionClock(fallback);
    expect(fallback.store.getState().mission.elapsedSec).toBe(0);
    fresh.stop();
  });

  it('treats a throwing sessionStorage getter as unavailable', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      expect(defaultSessionStorage()).toBeNull();
    } finally {
      if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
      else delete globalThis.sessionStorage;
    }
  });
});

describe('runner cleanup and direct store writes', () => {
  it('clears its interval and subscription on stop, and stops ticking afterwards', () => {
    const options = clockOptions();
    let cleared = null;
    options.clearInterval = (id) => { cleared = id; };
    const clock = startMissionClock(options);
    expect(options.store.listenerCount()).toBe(1);
    clock.stop();
    expect(cleared).toBe(7);
    expect(options.store.listenerCount()).toBe(0);

    options.store.patchMission({ paused: true });
    expect(options.store.getState().mission.elapsedSec).toBe(0);
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBe(0);
    clock.stop();
    expect(cleared).toBe(7);
  });

  it('honours a direct mission.paused write at its exact instant and does not overwrite it', () => {
    let t = START;
    const options = clockOptions({ now: () => t });
    const clock = startMissionClock(options);

    t += 5000;
    clock.tick();
    t += 2500;
    options.store.patchMission({ paused: true });    // like suitRunner users or a raw store write
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(7.5, 9);
    expect(options.store.getState().mission.paused).toBe(true);

    t += 60_000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(7.5, 9);
    expect(options.store.getState().mission.paused).toBe(true);

    options.store.patchMission({ paused: false });
    t += 1000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(8.5, 9);
    clock.stop();
  });

  it('honours a direct mission.timeScale write and ignores an invalid one', () => {
    let t = START;
    const options = clockOptions({ now: () => t });
    const clock = startMissionClock(options);

    t += 10_000;
    clock.tick();
    options.store.patchMission({ timeScale: 3 });
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(10, 9);
    t += 1000;
    clock.tick();
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(13, 9);

    options.store.patchMission({ timeScale: 0 });
    t += 1000;
    clock.tick();
    expect(options.store.getState().mission.timeScale).toBe(3);
    expect(options.store.getState().mission.elapsedSec).toBeCloseTo(16, 9);
    clock.stop();
  });

  it('restores on a restart after stop rather than starting a second clock', () => {
    let t = START;
    const storage = memoryStorage();
    const options = clockOptions({ now: () => t, storage });
    const first = startMissionClock(options);
    t += 4000;
    first.tick();
    first.stop();

    t += 1000;
    const secondOptions = clockOptions({ now: () => t, storage });
    const second = startMissionClock(secondOptions);
    expect(second.getSession().startedAtMs).toBe(START);
    expect(secondOptions.store.getState().mission.elapsedSec).toBeCloseTo(5, 9);
    t += 1000;
    second.tick();
    expect(secondOptions.store.getState().mission.elapsedSec).toBeCloseTo(6, 9);
    second.stop();
  });
});

describe('real Zustand store integration', () => {
  beforeEach(() => resetStore());

  function startOnRealStore(t, storage = memoryStorage()) {
    return {
      storage,
      clock: startMissionClock({
        store: useMissionStore,
        now: () => t.value,
        storage,
        config: { sky: 'late_afternoon' },
        setInterval: () => 1,
        clearInterval: () => {},
      }),
    };
  }

  it('publishes the documented fields, starting sky and source tags', () => {
    const t = { value: START };
    const { clock } = startOnRealStore(t);
    const mission = useMissionStore.getState().mission;
    expect(mission.startedAtMs).toBe(START);
    expect(mission.anchorMs).toBe(START);
    expect(mission.elapsedSec).toBe(0);
    expect(mission.paused).toBe(false);
    expect(mission.sol).toBe(1210);
    expect(mission.lmst).toBe('17:45');
    expect(mission.timeScale).toBe(1);
    expect(mission.initialSol).toBe(1210);
    expect(mission.initialLmst).toBe('17:45');
    expect(mission.longitudeDeg).toBe(77.3053);
    expect(mission.sky).toBe('late_afternoon');
    expect(useMissionStore.getState().view.sky).toBe('late_afternoon');

    const sources = useMissionStore.getState().sources;
    expect(sources['mission.startedAtMs'].tag).toBe('SIM');
    expect(sources['mission.initialLmst'].tag).toBe('SIM');
    expect(sources['mission.timeScale'].tag).toBe('SIM');
    expect(sources['mission.elapsedSec'].tag).toBe('DERIVED');
    expect(sources['mission.lmst'].tag).toBe('DERIVED');
    clock.stop();
  });

  it('runs pause, resume, scale and direct writes through the real store', () => {
    const t = { value: START };
    const { clock } = startOnRealStore(t);

    t.value += 5000;
    clock.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(5, 9);

    t.value += 2500;
    pauseMission();
    expect(useMissionStore.getState().mission.paused).toBe(true);
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(7.5, 9);

    t.value += 60_000;
    clock.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(7.5, 9);

    resumeMission();
    t.value += 2000;
    clock.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(9.5, 9);

    setMissionTimeScale(2);
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(9.5, 9);
    t.value += 3000;
    clock.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(15.5, 9);

    // A raw direct write, not the action, still anchors precisely.
    t.value += 1000;
    useMissionStore.setState((s) => ({ mission: { ...s.mission, paused: true } }));
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(17.5, 9);
    t.value += 30_000;
    clock.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(17.5, 9);
    clock.stop();
  });

  it('applies an alternate demo start sky and keeps the original sky after restore', () => {
    const t = { value: START };
    const storage = memoryStorage();
    const options = {
      store: useMissionStore,
      now: () => t.value,
      storage,
      config: { sky: 'night', timeScale: 60 },
      setInterval: () => 1,
      clearInterval: () => {},
    };
    const clock = startMissionClock(options);
    expect(useMissionStore.getState().mission.initialLmst).toBe('22:00');
    expect(useMissionStore.getState().mission.lmst).toBe('22:00');
    expect(useMissionStore.getState().mission.timeScale).toBe(60);
    expect(useMissionStore.getState().view.sky).toBe('night');

    t.value += 1000;
    clock.tick();
    expect(useMissionStore.getState().mission.elapsedSec).toBeCloseTo(60, 9);
    clock.stop();

    resetStore();
    const restored = startMissionClock({
      store: useMissionStore,
      now: () => t.value,
      storage,
      config: { sky: 'clear_day' },
      setInterval: () => 1,
      clearInterval: () => {},
    });
    // The restored session wins over the new config so clock and light stay coherent.
    expect(useMissionStore.getState().mission.sky).toBe('night');
    expect(useMissionStore.getState().view.sky).toBe('night');
    expect(useMissionStore.getState().mission.initialLmst).toBe('22:00');
    expect(useMissionStore.getState().mission.timeScale).toBe(60);
    restored.stop();
  });

  it('preserves unrelated mission fields and does not touch the sky after start', () => {
    const t = { value: START };
    const { clock } = startOnRealStore(t);
    useMissionStore.setState((s) => ({ mission: { ...s.mission, note: 'keep me' }, view: { ...s.view, sky: 'dust_storm' } }));
    t.value += 1000;
    clock.tick();
    expect(useMissionStore.getState().mission.note).toBe('keep me');
    expect(useMissionStore.getState().view.sky).toBe('dust_storm');
    clock.stop();
  });

  it('persists and restores the real store session across a reload', () => {
    const t = { value: START };
    const { storage, clock } = startOnRealStore(t);
    t.value += 7000;
    clock.tick();
    clock.stop();

    const restored = startOnRealStore({ value: t.value + 93_000 }, storage).clock;
    const mission = useMissionStore.getState().mission;
    expect(mission.paused).toBe(false);
    expect(mission.elapsedSec).toBeCloseTo(100, 9);
    expect(mission.startedAtMs).toBe(START);
    restored.stop();
  });
});
