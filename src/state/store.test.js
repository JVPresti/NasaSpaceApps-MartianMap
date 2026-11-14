import { beforeEach, describe, expect, it } from 'vitest';
import { createEventEngine } from '../sim/eventEngine.js';
import exampleEvent from '../sim/events/example-event.json';
import { createInitialState, resetStore, setMode, storeAdapter, useMissionStore } from './store.js';
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

  it('tags every mock value SIM', () => {
    const mock = createMockState();
    const tags = new Set(Object.values(mock.sources).map((s) => s.tag));
    expect([...tags]).toEqual(['SIM']);
    expect(mock.sources['suit.oxygenPct']).toBeDefined();
    expect(mock.route.path.length).toBe(5);
  });
});
