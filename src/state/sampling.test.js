import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_SITE_M, SAMPLING_POLL_MS, applySamplingEvent, connectSampling, emptyChecklist, nextChecklist } from './sampling.js';
import { createInitialState, resetStore, useMissionStore } from './store.js';

const ticks = (c) => [c.photo, c.texture, c.sample, c.seal];
const run = (events, s = createInitialState().sampling) => events.reduce((acc, e) => applySamplingEvent(acc, e, 60), s);
const site = { x: 0.4, z: 1.1 };
const rock = { kind: 'rock', site: 'Cheyava Falls', ...site };

describe('the sampling slice', () => {
  it('starts empty, with the checklist shape of emptyChecklist()', () => {
    const s = createInitialState().sampling;
    expect(s).toMatchObject({ count: 0, photos: 0, samples: [], status: null });
    expect(s.checklist).toEqual(emptyChecklist());
  });
});

describe('nextChecklist', () => {
  it('ticks in order for a rock sample poured into the case', () => {
    let c = emptyChecklist();
    c = nextChecklist(c, { type: 'photo', ...rock });        expect(ticks(c)).toEqual([true, false, false, false]);
    c = nextChecklist(c, { type: 'collect', id: 1, ...rock }); expect(ticks(c)).toEqual([true, false, false, false]);
    c = nextChecklist(c, { type: 'texture', id: 1, ...rock }); expect(ticks(c)).toEqual([true, true, false, false]);
    c = nextChecklist(c, { type: 'secured', id: 1, into: 'case', ...rock }); expect(ticks(c)).toEqual([true, true, true, false]);
    c = nextChecklist(c, { type: 'sealed', id: 1, into: 'case', ...rock });  expect(ticks(c)).toEqual([true, true, true, true]);
  });

  it('drops a photo of a different site when the scoop starts', () => {
    let c = nextChecklist(emptyChecklist(), { type: 'photo', x: 0, z: 0 });
    c = nextChecklist(c, { type: 'collect', id: 1, kind: 'ground', x: PHOTO_SITE_M + 0.5, z: 0 });
    expect(c.photo).toBe(false);
    expect(c.siteAt).toEqual({ x: PHOTO_SITE_M + 0.5, z: 0 });
  });

  it('accepts a photo taken after the scoop, of the same site only', () => {
    let c = nextChecklist(emptyChecklist(), { type: 'collect', id: 1, ...rock });
    expect(nextChecklist(c, { type: 'photo', x: 20, z: 20 }).photo).toBe(false);
    c = nextChecklist(c, { type: 'photo', x: 0.5, z: 0.5 });
    expect(c.photo).toBe(true);
  });

  it('ignores events of another sample', () => {
    let c = nextChecklist(emptyChecklist(), { type: 'collect', id: 2, ...rock });
    c = nextChecklist(c, { type: 'texture', id: 1 });
    c = nextChecklist(c, { type: 'sealed', id: 1 });
    expect(ticks(c)).toEqual([false, false, false, false]);
  });

  it('starts a new checklist after a sealed sample', () => {
    let c = { ...emptyChecklist(), photo: true, texture: true, sample: true, seal: true, sampleId: 1, photoAt: site, siteAt: site };
    expect(ticks(nextChecklist(c, { type: 'photo', ...site }))).toEqual([true, false, false, false]);
    c = nextChecklist(c, { type: 'collect', id: 2, ...site });
    expect(ticks(c)).toEqual([false, false, false, false]);   // the earlier photo belonged to the sealed sample
    expect(c.sampleId).toBe(2);
  });

  it('ignores events it does not know, such as input', () => {
    const c = emptyChecklist();
    expect(nextChecklist(c, { type: 'input', action: 'stow' })).toBe(c);
  });
});

describe('applySamplingEvent', () => {
  it('counts a sample when it is in a container and marks it sealed later', () => {
    const s = run([
      { type: 'photo', ...rock },
      { type: 'collect', id: 1, ...rock },
      { type: 'texture', id: 1, ...rock },
      { type: 'secured', id: 1, into: 'pouch', ...rock },
    ]);
    expect(s.count).toBe(1);
    expect(s.photos).toBe(1);
    expect(s.samples).toEqual([{ id: 1, kind: 'rock', site: 'Cheyava Falls', x: 0.4, z: 1.1, into: 'pouch', photo: true, texture: true, sealed: false, atSec: 60 }]);
    const sealed = applySamplingEvent(s, { type: 'sealed', id: 1, into: 'pouch', ...rock }, 70);
    expect(sealed.samples[0].sealed).toBe(true);
    expect(sealed.count).toBe(1);
  });

  it('counts each sample once', () => {
    const e = { type: 'secured', id: 3, kind: 'ground', site: null, x: 1, z: 2, into: 'case' };
    const s = run([{ type: 'collect', id: 3, kind: 'ground', x: 1, z: 2 }, e, e]);
    expect(s.count).toBe(1);
    expect(s.samples).toHaveLength(1);
  });

  it('keeps the status written by the bridge', () => {
    const s = { ...createInitialState().sampling, status: { phase: 'idle' } };
    expect(applySamplingEvent(s, { type: 'photo', x: 0, z: 0 }).status).toBe(s.status);
  });
});

describe('connectSampling', () => {
  beforeEach(() => { resetStore(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function fakeEngine() {
    const listeners = new Set();
    let status = { phase: 'idle', holding: null, target: null, caseState: 'carried', caseInReach: false, actions: { click: null, photo: null, stow: null, case: 'call-case' } };
    return {
      getSampling: vi.fn(() => status),
      onSampling: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      emit: (e) => { for (const fn of listeners) fn(e); },
      setStatus: (s) => { status = s; },
      listeners,
    };
  }

  it('writes the status at once and then only when it changes', () => {
    const engine = fakeEngine(), seen = [];
    const off = connectSampling(engine);
    const unsub = useMissionStore.subscribe((s, prev) => { if (s.sampling.status !== prev.sampling.status) seen.push(s.sampling.status); });
    expect(useMissionStore.getState().sampling.status.caseState).toBe('carried');
    vi.advanceTimersByTime(SAMPLING_POLL_MS * 5);
    expect(seen).toHaveLength(0);   // same status: no store write
    engine.setStatus({ ...engine.getSampling(), phase: 'collecting' });
    vi.advanceTimersByTime(SAMPLING_POLL_MS);
    expect(seen.map((s) => s.phase)).toEqual(['collecting']);
    unsub(); off();
  });

  it('applies events to the checklist and the count, with the mission time', () => {
    const engine = fakeEngine();
    const off = connectSampling(engine);
    useMissionStore.setState((s) => ({ mission: { ...s.mission, elapsedSec: 125 } }));
    engine.emit({ type: 'collect', id: 1, kind: 'ground', site: null, x: 1, z: 2 });
    engine.emit({ type: 'texture', id: 1, kind: 'ground', site: null, x: 1, z: 2 });
    engine.emit({ type: 'secured', id: 1, kind: 'ground', site: null, x: 1, z: 2, into: 'pouch' });
    const s = useMissionStore.getState().sampling;
    expect(s.count).toBe(1);
    expect(s.samples[0]).toMatchObject({ kind: 'ground', into: 'pouch', atSec: 125, texture: true, photo: false });
    expect(ticks(s.checklist)).toEqual([false, true, true, false]);
    off();
    expect(engine.listeners.size).toBe(0);
  });

  it('does nothing for an engine without sampling', () => {
    expect(() => connectSampling({})()).not.toThrow();
  });
});
