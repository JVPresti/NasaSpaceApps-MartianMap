import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordEvaEvent } from './eva.js';
import { startEventRunner } from './events.js';
import { resetStore, useMissionStore } from './store.js';

beforeEach(() => resetStore());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('event runner mission time', () => {
  it('uses mission.elapsedSec (pause and time scale aware), not wall time, and keeps start/end in the EVA history', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    // The radiation event has a planner block; keep its lazy planner load pending, this test starts no worker.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const runner = startEventRunner({
      store: useMissionStore,
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
