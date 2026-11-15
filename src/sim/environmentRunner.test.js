import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import medaJson from '../../public/data/meda_sol.json';
import radJson from '../../public/data/rad.json';
import { medaAt, parseMedaSol, parseRad } from '../data/medaRad.js';
import { provenance } from '../data/provenance.js';
import { EVENT_ENVIRONMENT_SOURCES, startEventRunner } from '../state/events.js';
import { resetStore, useMissionStore } from '../state/store.js';
import { CLEAR_TAU_SOURCE, DOSE_SOURCE, missionLmstSec, startEnvironmentRunner } from './environmentRunner.js';
import { MARS_SEC_PER_EARTH_SEC } from './missionClock.js';

const meda = parseMedaSol(medaJson);
const rad = parseRad(radJson);
const BACKGROUND_UGY_H = 8.75;   // 0.21 mGy/day, rad.json

const noTimer = { setInterval: () => 0, clearInterval: () => {} };
const setMission = (fields) => useMissionStore.setState((s) => ({ mission: { ...s.mission, ...fields } }));
const environment = () => useMissionStore.getState().environment;
const sources = () => useMissionStore.getState().sources;

beforeEach(() => {
  resetStore();
  setMission({ initialLmst: '15:30', elapsedSec: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('missionLmstSec', () => {
  it('adds the elapsed Earth seconds, converted to Mars seconds, to the start LMST', () => {
    expect(missionLmstSec({ initialLmst: '15:30', elapsedSec: 0 })).toBe(55800);
    expect(missionLmstSec({ initialLmst: '15:30', elapsedSec: 600 })).toBeCloseTo(55800 + 600 * MARS_SEC_PER_EARTH_SEC, 9);
  });

  it('is null before the clock has a start time', () => {
    expect(missionLmstSec({ initialLmst: null, elapsedSec: 10 })).toBeNull();
    expect(missionLmstSec({ initialLmst: 'noon', elapsedSec: 10 })).toBeNull();
  });
});

describe('environment runner: MEDA replay', () => {
  it('writes temperature and wind at the mission LMST, each with its MEDA source', () => {
    startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    const expected = medaAt(meda, 55800);
    expect(environment().tempC).toBeCloseTo(expected.values.tempC, 9);
    expect(environment().windMs).toBeCloseTo(expected.values.windMs, 9);
    expect(environment().tempC).toBeGreaterThan(-120);
    expect(environment().tempC).toBeLessThan(30);
    expect(sources()['environment.tempC']).toMatchObject({ tag: expect.stringMatching(/^(DATA|DERIVED)$/), label: 'MEDA · Perseverance · sol 1187' });
    expect(sources()['environment.windMs'].label).toBe('MEDA · Perseverance · sol 312');
  });

  it('follows the mission clock through the sol', () => {
    const runner = startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    setMission({ elapsedSec: 3600 });
    runner.tick();
    expect(environment().tempC).toBeCloseTo(medaAt(meda, 55800 + 3600 * MARS_SEC_PER_EARTH_SEC).values.tempC, 9);
  });

  it('writes no weather when meda_sol.json did not load', () => {
    startEnvironmentRunner({ store: useMissionStore, meda: null, rad, ...noTimer });
    expect(environment().tempC).toBeNull();
    expect(sources()['environment.tempC']).toBeUndefined();
  });
});

describe('environment runner: dust opacity', () => {
  it('starts from the clear-season tau with a DATA source', () => {
    startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    expect(environment().dustOpacity).toBe(0.45);
    expect(sources()['environment.dustOpacity']).toBe(CLEAR_TAU_SOURCE);
  });

  it('leaves a tau the dust storm already wrote', () => {
    useMissionStore.setState((s) => ({
      environment: { ...s.environment, dustOpacity: 3.17 },
      sources: { ...s.sources, 'environment.dustOpacity': EVENT_ENVIRONMENT_SOURCES['environment.dustOpacity'] },
    }));
    startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    expect(environment().dustOpacity).toBe(3.17);
  });
});

describe('environment runner: RAD dose', () => {
  it('sums the RAD background rate over mission time', () => {
    const runner = startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    expect(environment().doseUgy).toBe(0);
    expect(environment().doseRateUgyH).toBeCloseTo(BACKGROUND_UGY_H, 9);
    expect(sources()['environment.doseRateUgyH']).toMatchObject({ tag: 'DATA', label: 'RAD · Curiosity (Gale) · DATA' });
    expect(sources()['environment.doseUgy']).toBe(DOSE_SOURCE);

    setMission({ elapsedSec: 360 });
    runner.tick();
    expect(environment().doseUgy).toBeCloseTo(BACKGROUND_UGY_H * 0.1, 9);   // 6 min at 8.75 µGy/h
  });

  it('adds nothing while the mission time stands still (pause)', () => {
    const runner = startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    setMission({ elapsedSec: 360 });
    runner.tick();
    const dose = environment().doseUgy;
    runner.tick();
    runner.tick();
    expect(environment().doseUgy).toBe(dose);
  });

  it('sums the event rate while the radiation alert is active, then returns to the background', () => {
    const runner = startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    useMissionStore.setState((s) => ({
      alerts: { ...s.alerts, radiation: { id: 'radiation', eventId: 'radiation', active: true } },
      environment: { ...s.environment, doseRateUgyH: 29.92 },
    }));
    setMission({ elapsedSec: 3600 });
    runner.tick();
    expect(environment().doseRateUgyH).toBe(29.92);   // the event owns the rate
    expect(environment().doseUgy).toBeCloseTo(29.92, 9);

    useMissionStore.setState((s) => ({ alerts: { ...s.alerts, radiation: null } }));
    setMission({ elapsedSec: 7200 });
    runner.tick();
    expect(environment().doseUgy).toBeCloseTo(29.92 + 29.92, 9);   // the rate held since the last tick
    expect(environment().doseRateUgyH).toBeCloseTo(BACKGROUND_UGY_H, 9);
  });

  it('stops writing after stop()', () => {
    const runner = startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    runner.stop();
    setMission({ elapsedSec: 3600 });
    runner.tick();
    expect(environment().doseUgy).toBe(0);
  });
});

describe('environment strip values during the events (#189)', () => {
  // The HUD shows an environment value only when sources[path] is set (src/hud/Hud.jsx, EnvValue).
  const shown = (path) => !!sources()[path] && provenance.resolve(path, sources()[path]) !== null;

  it('has a tagged temperature, wind, tau and dose through the dust storm and the radiation alert', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));   // keep the planner load pending
    const env = startEnvironmentRunner({ store: useMissionStore, meda, rad, ...noTimer });
    const events = startEventRunner({ store: useMissionStore, ...noTimer });
    const at = (sec) => { setMission({ elapsedSec: sec }); events.tick(); env.tick(); };
    const paths = ['environment.tempC', 'environment.windMs', 'environment.dustOpacity', 'environment.doseUgy'];

    at(60);
    for (const path of paths) expect(shown(path)).toBe(true);

    at(480);        // the dust storm starts
    at(480 + 54);   // 54 s in
    expect(environment().dustOpacity).toBe(3.17);
    expect(sources()['environment.dustOpacity']).toBe(EVENT_ENVIRONMENT_SOURCES['environment.dustOpacity']);
    for (const path of paths) expect(shown(path)).toBe(true);

    const before = environment().doseUgy;
    at(720);         // the radiation alert starts
    at(720 + 150);   // 150 s in
    expect(environment().doseRateUgyH).toBe(20);
    expect(sources()['environment.doseRateUgyH']).toBe(EVENT_ENVIRONMENT_SOURCES['environment.doseRateUgyH']);
    expect(environment().doseUgy).toBeGreaterThan(before);
    for (const path of paths) expect(shown(path)).toBe(true);

    events.stop();
    env.stop();
  });
});
