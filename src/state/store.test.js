import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventEngine } from '../sim/eventEngine.js';
import exampleEvent from '../sim/events/example-event.json';
import { LOOK_DEFAULTS, LOOK_STORAGE_KEY } from '../engine/lookSettings.js';
import { createInitialState, resetStore, setLookSettings, setMode, setRouteDecision, storeAdapter, useMissionStore } from './store.js';
import { createMockState } from './mock.js';

beforeEach(() => resetStore());

describe('store adapter (docs/EVENT_ENGINE.md contract)', () => {
  it('reads and writes dot paths', () => {
    storeAdapter.set('suit.oxygenSec', 3600);
    expect(storeAdapter.get('suit.oxygenSec')).toBe(3600);
    expect(useMissionStore.getState().suit.oxygenSec).toBe(3600);
  });

  it('creates intermediate objects and returns undefined for missing paths', () => {
    storeAdapter.set('alerts.dust-storm', { id: 'dust-storm', level: 'warning' });
    expect(storeAdapter.get('alerts.dust-storm.level')).toBe('warning');
    expect(storeAdapter.get('nothing.here')).toBeUndefined();
  });

  it('keeps arrays as arrays', () => {
    useMissionStore.setState({ crew: [{ id: 'EV2', x: 1 }] });
    storeAdapter.set('crew.0.x', 5);
    expect(Array.isArray(useMissionStore.getState().crew)).toBe(true);
    expect(useMissionStore.getState().crew[0]).toEqual({ id: 'EV2', x: 5 });
  });

  it('writes immutably, so selectors on parent objects see a change', () => {
    const before = useMissionStore.getState().suit;
    storeAdapter.set('suit.batteryPct', 50);
    expect(useMissionStore.getState().suit).not.toBe(before);
    expect(before.batteryPct).toBeNull();
  });

  it('notifies subscribers on set', () => {
    const seen = [];
    const off = useMissionStore.subscribe((s) => seen.push(s.environment.dustOpacity));
    storeAdapter.set('environment.dustOpacity', 0.4);
    off();
    expect(seen).toEqual([0.4]);
  });

  it('rejects prototype paths and empty segments', () => {
    for (const bad of ['__proto__.x', 'suit.constructor', 'a..b', '', 'prototype']) expect(() => storeAdapter.set(bad, 1)).toThrow();
    expect(({}).x).toBeUndefined();
  });

  it('returns a detached snapshot', () => {
    const snap = storeAdapter.snapshot();
    snap.suit.oxygenPct = 1;
    expect(useMissionStore.getState().suit.oxygenPct).toBeNull();
    expect(Object.keys(snap)).toEqual(Object.keys(createInitialState()));
  });
});

describe('event engine on the real store', () => {
  it('runs the example event end to end and clears its alert', () => {
    let t = 0;
    const engine = createEventEngine({ store: storeAdapter, events: [exampleEvent], getMissionTime: () => t });
    engine.fire('demo-alarm');
    engine.update(t);
    expect(storeAdapter.get('alerts.demo-alarm.active')).toBe(true);
    expect(storeAdapter.get('environment.dustOpacity')).toBe(0.1);
    t = 11;
    engine.update(t);
    expect(storeAdapter.get('alerts.demo-alarm')).toBeNull();
    expect(storeAdapter.get('environment.dustOpacity')).toBe(0);
  });
});

describe('actions and mock data', () => {
  it('only accepts walk or plan as the mode', () => {
    setMode('plan');
    expect(useMissionStore.getState().mode).toBe('plan');
    expect(() => setMode('orbit')).toThrow();
  });

  it('only accepts the three go / no-go decisions', () => {
    expect(useMissionStore.getState().route.decision).toBe('pending');
    setRouteDecision('go');
    expect(useMissionStore.getState().route.decision).toBe('go');
    setRouteDecision('no-go');
    expect(useMissionStore.getState().route.decision).toBe('no-go');
    expect(() => setRouteDecision('maybe')).toThrow();
  });

  it('tags every mock value SIM', () => {
    const mock = createMockState();
    const tags = new Set(Object.values(mock.sources).map((s) => s.tag));
    expect([...tags]).toEqual(['SIM']);
    expect(mock.sources['suit.oxygenPct']).toBeDefined();
    expect(mock.route.path.length).toBe(5);
  });
});

describe('look settings (#102)', () => {
  // resetStore() keeps the preference on purpose, so each case puts the defaults back instead of relying on it.
  afterEach(() => {
    useMissionStore.setState((s) => ({ settings: { ...s.settings, look: { ...LOOK_DEFAULTS } } }));
    vi.unstubAllGlobals();
  });

  it('starts from the defaults in a fresh state', () => {
    expect(createInitialState().settings.look).toEqual(LOOK_DEFAULTS);
    expect(createInitialState().settings.look).not.toBe(LOOK_DEFAULTS);   // a private copy, not the frozen default
    expect(useMissionStore.getState().settings.look).toEqual(LOOK_DEFAULTS);
  });

  it('clamps the sensitivity, rounds it and keeps the inverted axis', () => {
    expect(setLookSettings({ sensitivity: 3, invertY: true })).toEqual({ sensitivity: 2, invertY: true });
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 2, invertY: true });
    expect(setLookSettings({ sensitivity: 1.44 })).toEqual({ sensitivity: 1.4, invertY: true });
  });

  it('applies a partial patch and keeps the other field', () => {
    setLookSettings({ sensitivity: 0.8 });
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 0.8, invertY: false });
    setLookSettings({ invertY: true });
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 0.8, invertY: true });
    expect(setLookSettings(undefined)).toEqual({ sensitivity: 0.8, invertY: true });
  });

  it('saves the clamped value in this browser', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    setLookSettings({ sensitivity: 1.7, invertY: true });
    expect(setItem).toHaveBeenCalledWith(LOOK_STORAGE_KEY, '{"sensitivity":1.7,"invertY":true}');
    setLookSettings({ sensitivity: 9 });
    expect(setItem).toHaveBeenLastCalledWith(LOOK_STORAGE_KEY, '{"sensitivity":2,"invertY":true}');
  });

  it('still applies for the session when storage refuses the write', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
    expect(setLookSettings({ sensitivity: 1.5 })).toEqual({ sensitivity: 1.5, invertY: false });
    expect(useMissionStore.getState().settings.look.sensitivity).toBe(1.5);
  });

  it('keeps the preference across a reset while the mission state goes back to its defaults', () => {
    setLookSettings({ sensitivity: 1.6, invertY: true });
    setMode('walk');
    storeAdapter.set('suit.oxygenSec', 3600);
    resetStore();
    expect(useMissionStore.getState().settings.look).toEqual({ sensitivity: 1.6, invertY: true });
    expect(useMissionStore.getState().mode).toBe('walk');   // on foot in the habitat
    expect(useMissionStore.getState().stage).toBe('habitat');
    expect(useMissionStore.getState().suit.oxygenSec).toBeNull();
    expect(useMissionStore.getState().mission.elapsedSec).toBe(0);
  });

  it('re-reads the saved value on a fresh page load and falls back when it is corrupt', async () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ sensitivity: 1.3, invertY: true }) });
    vi.resetModules();
    const fresh = await import('./store.js');
    expect(fresh.useMissionStore.getState().settings.look).toEqual({ sensitivity: 1.3, invertY: true });
    expect(fresh.createInitialState().settings.look).toEqual(LOOK_DEFAULTS);

    vi.stubGlobal('localStorage', { getItem: () => '{ not json' });
    vi.resetModules();
    expect((await import('./store.js')).useMissionStore.getState().settings.look).toEqual(LOOK_DEFAULTS);
  });
});
