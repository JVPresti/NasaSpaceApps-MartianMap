import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordEvaEvent } from './eva.js';
import { eventEnvironmentSources, listEvents, startEventRunner } from './events.js';
import { resetStore, setMode, setNeeds, useMissionStore } from './store.js';
import { provenance } from '../data/provenance.js';
import { MISSION_SOURCES } from '../sim/missions.js';
import { resetDataFiles } from '../data/dataFiles.js';

beforeEach(() => resetStore());

afterEach(() => {
  vi.unstubAllGlobals();
  resetDataFiles();
  vi.useRealTimers();
});

describe('event runner mission time', () => {
  it('uses mission.elapsedSec (pause and time scale aware), not wall time, and keeps start/end in the EVA history', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    // The radiation event has a planner block; keep its lazy planner load pending, this test starts no worker.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    // The full EVA keeps the radiation alert at T+720 s (src/sim/missions.js).
    const runner = startEventRunner({
      store: useMissionStore,
      objective: 'cheyava',
      setInterval: () => 0,
      clearInterval: () => {},
      onEventLog: (entry) => recordEvaEvent(useMissionStore, entry),
    });

    // Twelve wall minutes would trigger the 720 s radiation event under the old wall-clock calculation.
    vi.setSystemTime(new Date('2026-11-14T12:12:00Z'));
    runner.tick();
    expect(useMissionStore.getState().alerts.radiation).toBeUndefined();
    expect(useMissionStore.getState().eva.events).toEqual([]);

    // Mission time is what the #59 clock publishes: paused and time-scaled.
    useMissionStore.setState((state) => ({ mission: { ...state.mission, elapsedSec: 720 } }));
    runner.tick();
    expect(useMissionStore.getState().alerts.radiation).toMatchObject({ eventId: 'radiation', active: true });
    expect(useMissionStore.getState().eva.events).toContainEqual({
      type: 'start',
      eventId: 'radiation',
      label: 'Radiation alert',
      atSec: 720,
    });

    // The radiation event ends within 25 m of the real HAB entry in shelters.json.
    useMissionStore.setState((state) => ({
      navigation: { ...state.navigation, x: 535.1, z: 574.1 },
      mission: { ...state.mission, elapsedSec: 800 },
    }));
    runner.tick();
    expect(useMissionStore.getState().alerts.radiation).toBeNull();
    expect(useMissionStore.getState().eva.events).toContainEqual({
      type: 'end',
      eventId: 'radiation',
      label: 'Radiation alert',
      atSec: 800,
    });

    runner.stop();
  });
});

// The airlock entry of shelters.json, the centre of both events' 25 m end area, and the first sortie stop (stops.json).
const AIRLOCK = { x: 535.1, z: 574.1 };
const STOP = { x: 493, z: 539 };

function quietRunner(options = {}) {
  // Both events have a planner block; keep its lazy planner load pending, these tests start no worker.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  return startEventRunner({ store: useMissionStore, setInterval: () => 0, clearInterval: () => {}, ...options });
}

function at(elapsedSec, position, nextIndex) {
  useMissionStore.setState((state) => ({
    mission: { ...state.mission, elapsedSec },
    navigation: { ...state.navigation, x: position.x, z: position.z },
    route: nextIndex === undefined ? state.route : { ...state.route, nextIndex },
  }));
}

const activeAlerts = () => Object.values(useMissionStore.getState().alerts).filter((alert) => alert?.active).map((alert) => alert.eventId);

describe('event runner missions (#265)', () => {
  it('runs the first mission from the default needs: storm after the stop, radiation after the storm', () => {
    const runner = quietRunner();
    expect(runner.mission).toBe('first');

    at(10, { x: 520, z: 560 }, 1); runner.tick();
    at(55, STOP, 2); runner.tick();               // at the stop at T+55 s: about 20 s to sample
    at(74, STOP); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(75, STOP); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    at(89, { x: 500, z: 545 }); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    at(95, { x: 505, z: 550 }); runner.tick();     // 20 s after the storm, still 38 m from the airlock
    expect(activeAlerts()).toEqual(['dust-storm', 'radiation']);
    at(105, { x: 510, z: 556 }); runner.tick();    // 31 m out
    // The compressed storm ramp reaches the 2018 Gale peak 30 s after it started.
    expect(useMissionStore.getState().environment.dustOpacity).toBe(8);

    at(120, AIRLOCK); runner.tick();               // both end within 25 m of the airlock
    expect(activeAlerts()).toEqual([]);
    expect(useMissionStore.getState().environment.dustOpacity).toBe(0.45);
    runner.stop();
  });

  it('holds both events while the crew is inside the end area, however late, and plays them outside', () => {
    const runner = quietRunner();
    at(300, AIRLOCK, 1); runner.tick();            // past both latest times, never out of the airlock area
    expect(activeAlerts()).toEqual([]);
    at(301, { x: 500, z: 545 }); runner.tick();    // 46 m out: the storm plays
    expect(activeAlerts()).toEqual(['dust-storm']);
    at(316, { x: 500, z: 545 }); runner.tick();    // and the radiation alert 15 s after it
    expect(activeAlerts()).toEqual(['dust-storm', 'radiation']);
    runner.stop();
  });

  it('waits for a slow crew to reach the stop before the storm', () => {
    const runner = quietRunner();
    at(80, { x: 510, z: 550 }, 1); runner.tick();  // due, but still walking out
    expect(activeAlerts()).toEqual([]);
    at(110, STOP, 2); runner.tick();
    at(129, STOP); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(130, STOP); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    runner.stop();
  });

  it('runs the full EVA from a full objective, at T+480 s and T+720 s as before', () => {
    setNeeds({ objective: 'bright-angel' });
    const runner = quietRunner();
    expect(runner.mission).toBe('full');
    at(479, { x: 0, z: 0 }, 1); runner.tick();
    expect(activeAlerts()).toEqual([]);
    at(480, { x: 0, z: 0 }); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm']);
    expect(useMissionStore.getState().environment.dustOpacity).toBe(0.45);
    at(570, { x: 0, z: 0 }); runner.tick();        // the 90 s ramp of dust-storm.json
    expect(useMissionStore.getState().environment.dustOpacity).toBe(8);
    at(720, { x: 0, z: 0 }); runner.tick();
    expect(activeAlerts()).toEqual(['dust-storm', 'radiation']);
    expect(runner.listEvents().find((event) => event.id === 'radiation').trigger).toEqual({ type: 'missionTime', atSec: 720 });
    runner.stop();
  });

  it('reads the mission once, from the objective locked at Begin EVA: a later change changes nothing', () => {
    setNeeds({ objective: 'sortie' });
    setMode('walk');                               // Begin EVA locks the needs
    expect(setNeeds({ objective: 'cheyava' })).toBe(false);
    const runner = quietRunner({ objective: useMissionStore.getState().needs.objective });
    // Even a direct write to the needs after the start leaves the running mission alone.
    useMissionStore.setState((state) => ({ needs: { ...state.needs, objective: 'cheyava' } }));
    at(55, STOP, 2); runner.tick();
    at(75, STOP); runner.tick();
    expect(runner.mission).toBe('first');
    expect(activeAlerts()).toEqual(['dust-storm']);
    runner.stop();
  });

  it('lists the triggers of the chosen objective before the EVA', () => {
    expect(listEvents().find((event) => event.id === 'dust-storm').trigger.atSec).toBe(75);
    setNeeds({ objective: 'cheyava' });
    expect(listEvents().find((event) => event.id === 'dust-storm').trigger.atSec).toBe(480);
  });

  it('tags the shortened times SIM in the registry and in the event sources', () => {
    for (const path of Object.keys(MISSION_SOURCES)) expect(provenance.lookup(path)?.tag).toBe('SIM');
    expect(eventEnvironmentSources('first')['environment.dustOpacity'].source).toMatch(/30 s \(SIM\)/);
    expect(eventEnvironmentSources('full')['environment.dustOpacity'].source).not.toMatch(/first mission/);
  });
});
