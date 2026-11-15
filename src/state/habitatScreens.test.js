import { describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { createInitialState } from './store.js';
import { CABIN, connectHabitatScreens, habitatScreenData, topAlert } from './habitatScreens.js';

const state = (patch = {}) => ({ ...createInitialState(), ...patch });

describe('habitatScreenData', () => {
  it('shows the suit, the partner and the weather from the store, with their source tags', () => {
    const d = habitatScreenData(state({
      suit: { ...createInitialState().suit, oxygenPct: 78, batteryPct: 75, metabolicW: 420, marginSec: 2460 },
      crew: [{ id: 'EV2', name: 'EV2', oxygenPct: 81, batteryPct: 70, rangeM: 31.8, separation: 'nominal' }],
      environment: { dustOpacity: 0.62, tempC: -18, windMs: 8, pressurePa: 724, doseRateUgyH: 16, doseUgy: 16.1 },
      sources: {
        'suit.oxygenPct': { tag: 'SIM', source: 'suit model' },
        'crew.0.oxygenPct': { tag: 'SIM', source: 'partner runner' },
        'environment.tempC': { tag: 'DATA', label: 'MEDA · Perseverance · sol 313', source: 'MEDA ATS' },
      },
    }));
    expect(d.team).toEqual([
      { name: 'EV1', o2Pct: 78, batteryPct: 75, metabolicW: 420, marginSec: 2460, status: null, tag: 'SIM' },
      { name: 'EV2', o2Pct: 81, batteryPct: 70, rangeM: 31.8, status: null, separation: 'nominal', tag: 'SIM' },
    ]);
    expect(d.weather).toMatchObject({ tau: 0.62, tempC: -18, windMs: 8, pressurePa: 724, doseRateUgyH: 16, source: 'MEDA · Perseverance · sol 313' });
    expect(d.weather.tags.tempC).toBe('DATA');
  });
  it('labels the cabin as SIM: the habitat interior is not simulated', () => {
    expect(habitatScreenData(state()).cabin).toEqual({ ...CABIN, tag: 'SIM' });
  });
  it('shows nothing for values the store does not have yet, instead of inventing them', () => {
    const d = habitatScreenData(state());
    expect(d.team).toEqual([{ name: 'EV1', o2Pct: null, batteryPct: null, metabolicW: null, marginSec: null, status: null, tag: null }]);
    expect(d.weather.tempC).toBeNull();
    expect(d.route.player).toBeNull();
  });
  it('puts the dust storm on hold and picks the most severe alert', () => {
    const d = habitatScreenData(state({ alerts: {
      'dust-storm': { eventId: 'dust-storm', level: 'warning', text: 'Dust storm', active: true },
      radiation: { eventId: 'radiation', level: 'caution', text: 'Radiation', active: true },
      old: null,
    } }));
    expect(d.stormHold).toBe(true);
    expect(d.alert).toEqual({ id: 'dust-storm', level: 'warning', text: 'Dust storm' });
    expect(topAlert({})).toBeNull();
  });
  it('gives the planning table the route, the visited waypoints, the player and the shelter', () => {
    const d = habitatScreenData(state({
      route: { ...createInitialState().route, path: [[0, 0], [10, 10]], waypoints: [{ name: 'HAB', x: 520, z: 600 }], visited: [0], shelter: { id: 'HAB', x: 535, z: 574 } },
      navigation: { ...createInitialState().navigation, x: 8, z: 70, headingDeg: 354 },
    }));
    expect(d.route).toMatchObject({ path: [[0, 0], [10, 10]], visited: [0], shelter: { x: 535, z: 574 }, player: { x: 8, z: 70, headingDeg: 354 } });
  });
});

describe('connectHabitatScreens', () => {
  it('sends the data at once, then only after the store changed, at most 4 times per second', () => {
    vi.useFakeTimers();
    const store = create(() => createInitialState()), engine = { setHabitatScreens: vi.fn() };
    const off = connectHabitatScreens(engine, store);
    expect(engine.setHabitatScreens).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(engine.setHabitatScreens).toHaveBeenCalledTimes(1);   // nothing changed
    store.setState({ environment: { ...store.getState().environment, tempC: -20 } });
    store.setState({ environment: { ...store.getState().environment, tempC: -21 } });
    vi.advanceTimersByTime(250);
    expect(engine.setHabitatScreens).toHaveBeenCalledTimes(2);   // two changes, one update
    expect(engine.setHabitatScreens.mock.calls[1][0].weather.tempC).toBe(-21);
    off();
    vi.useRealTimers();
  });
});
