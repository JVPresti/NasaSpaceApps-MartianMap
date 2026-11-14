import { describe, expect, it } from 'vitest';
import { MARKER_DOT_PX, MIN_RING_PX, drawPositionMarker, markerState, ringRadiusPx } from './positionMarker.js';

// A north-up map at 4 px per metre, centred on (0, 0) at pixel (500, 400): the Plan map without perspective.
const flat = (x, z) => ({ x: 500 + x * 4, y: 400 + z * 4, inFront: true });
const nav = { x: 10, z: -5, errorM: 6, headingDeg: 90, fixMode: 'terrain fix' };

/** Records the canvas calls the marker makes. */
function fakeContext() {
  const calls = [];
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const ctx = { calls, measureText: (text) => ({ width: text.length * 7 }) };
  for (const name of ['save', 'restore', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'fillText']) ctx[name] = record(name);
  return ctx;
}

describe('uncertainty ring', () => {
  it('scales the error radius to pixels and never draws inside the dot', () => {
    expect(ringRadiusPx(6, 4)).toBe(24);
    expect(ringRadiusPx(0.4, 4)).toBe(MIN_RING_PX);
    expect(ringRadiusPx(null, 4)).toBe(MIN_RING_PX);
    expect(ringRadiusPx(6, 0)).toBe(MIN_RING_PX);
    expect(MIN_RING_PX).toBeGreaterThan(MARKER_DOT_PX);
  });

  it('follows navigation.errorM: a larger error draws a larger ring', () => {
    const small = markerState(nav, flat), large = markerState({ ...nav, errorM: 20 }, flat);
    expect(small.ringPx).toBeCloseTo(24);
    expect(large.ringPx).toBeCloseTo(80);
  });

  it('measures the scale at the marker, whatever the map rotation', () => {
    const rotated = (x, z) => ({ x: 300 - z * 2, y: 200 + x * 2 });   // heading-up minimap at 2 px per metre, turned 90°
    expect(markerState(nav, rotated).ringPx).toBeCloseTo(12);
    expect(markerState(nav, rotated, { northDeg: -90 }).headingDeg).toBe(0);
  });
});

describe('marker state', () => {
  it('places the estimate and labels it with error and fix mode', () => {
    expect(markerState(nav, flat)).toEqual({ x: 540, y: 380, ringPx: 24, headingDeg: 90, caution: true, label: '±6.0 m · terrain fix' });
    expect(markerState({ ...nav, errorM: 0.4 }, flat)).toMatchObject({ caution: false, label: '±0.4 m · terrain fix' });
  });

  it('is null without a position or behind the camera', () => {
    expect(markerState({ ...nav, x: null }, flat)).toBeNull();
    expect(markerState(null, flat)).toBeNull();
    expect(markerState(nav, () => null)).toBeNull();
    expect(markerState(nav, (x, z) => ({ ...flat(x, z), inFront: false }))).toBeNull();
  });

  it('draws without a heading or an error', () => {
    expect(markerState({ ...nav, headingDeg: null, errorM: null }, flat)).toMatchObject({ headingDeg: null, ringPx: MIN_RING_PX, caution: false, label: null });
  });
});

describe('drawing', () => {
  it('draws the ring at ringPx around the dot, then the label beside it', () => {
    const ctx = fakeContext(), m = markerState(nav, flat);
    drawPositionMarker(ctx, m);
    const arcs = ctx.calls.filter((c) => c[0] === 'arc' && c[4] === 0);
    expect(arcs[0]).toEqual(['arc', 540, 380, 24, 0, Math.PI * 2]);
    expect(arcs[1]).toEqual(['arc', 540, 380, MARKER_DOT_PX, 0, Math.PI * 2]);
    const text = ctx.calls.find((c) => c[0] === 'fillText');
    expect(text[1]).toBe('±6.0 m · terrain fix');
    expect(text[2]).toBeGreaterThan(540 + 24);
    expect(ctx.calls[0][0]).toBe('save');
    expect(ctx.calls.at(-1)[0]).toBe('restore');
  });

  it('can leave the label out for a small minimap', () => {
    const ctx = fakeContext();
    drawPositionMarker(ctx, markerState(nav, flat), { label: false });
    expect(ctx.calls.some((c) => c[0] === 'fillText')).toBe(false);
  });
});
