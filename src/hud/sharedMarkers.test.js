import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/store.js';
import { NEUTRAL, createSharedMarkersSelector, crewName, sharedMarkers } from './sharedMarkers.js';
import { findMarkers } from './minimapFinds.js';

const crew = [{ id: 'me', name: 'Me', color: 0, role: 'surface', joinedAt: 1 }, { id: 'b', name: 'Beatriz Lopez', color: 1, role: 'surface', joinedAt: 2 }, { id: 'h', name: 'Hab', color: null, role: 'habitat', joinedAt: 3 }];
const m = (cid, author, extra = {}) => ({ id: 1, cid, author, kind: 'find', x: 1, z: 2, label: 'M01', at: 5, pending: false, ...extra });
function state({ markers = [], finds = [], findCids = {} } = {}) {
  const s = createInitialState();
  return { ...s, online: { ...s.online, status: 'open', me: crew[0], crew }, shared: { ...s.shared, markers, findCids }, finds: { ...s.finds, list: finds } };
}

describe('sharedMarkers', () => {
  it('is empty offline', () => {
    expect(sharedMarkers(createInitialState())).toEqual([]);
  });

  it('draws other players in their suit colour with their name, and the habitat seat in grey', () => {
    const out = sharedMarkers(state({ markers: [m('c1', 'b'), m('c2', 'h', { kind: 'note', label: 'Ridge' }), m('c3', 'gone', { kind: 'go', label: '' })] }));
    expect(out.map((x) => x.label)).toEqual(['Beatriz M01', 'Ridge', 'Go']);
    expect(out[0].color).toMatch(/^rgb\(/);
    expect(out[1].color).toBe(NEUTRAL);
    expect(out[2].color).toBe(NEUTRAL);
    expect(out.every((x) => x.status === 'shared')).toBe(true);
  });

  it('skips this player\'s own finds that Finds still draws, keeps the ones from before a reload', () => {
    const finds = [{ id: 'find-1', label: 'M01', x: 1, z: 2, status: 'priced' }];
    const out = sharedMarkers(state({ markers: [m('mine', 'me'), m('old', 'me', { label: 'M02' })], finds, findCids: { 'find-1': 'mine' } }));
    expect(out.map((x) => x.id)).toEqual(['shared-old']);
    expect(out[0].label).toBe('M02');
  });

  it('the selector returns the same array while its inputs are unchanged', () => {
    const sel = createSharedMarkersSelector();
    const s = state({ markers: [m('c1', 'b')] });
    expect(sel(s)).toBe(sel({ ...s }));
    expect(sel({ ...s, shared: { ...s.shared, markers: [] } })).toEqual([]);
  });

  it('minimap markers keep their own colour', () => {
    const [x] = findMarkers([{ x: 0, z: 0, label: 'B', status: 'shared', color: 'rgb(1, 2, 3)' }], () => ({ x: 50, y: 50 }), 50, 50, 50);
    expect(x.color).toBe('rgb(1, 2, 3)');
  });

  it('names a player who left as another player', () => {
    expect(crewName(state(), 'b')).toBe('Beatriz Lopez');
    expect(crewName(state(), 'zz')).toBe('another player');
  });
});
