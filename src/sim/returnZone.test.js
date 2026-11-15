import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCostGrid, heightAt } from './costGrid.js';
import {
  computeReturnZone, edgeCost, walkingTables, ZONE_STATE, zoneGrid, zoneMarginAt, zoneModifiers, zoneNodeAt, zoneRgba, zoneStateAt,
} from './returnZone.js';
import { suitConstantsFromHazards, suitReadout, walkCost, walkingO2RateGs } from './suitModel.js';

const hazards = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/data/hazards.json', import.meta.url)), 'utf8'));
const c = suitConstantsFromHazards(hazards);
const rate = walkingO2RateGs(c);

/**
 * A square test grid at 2 m spacing centred on 0, 0, built by the real cost grid builder so the 20 degree limit closes
 * steep ground as it does on the HiRISE tile.
 * @param {number} n nodes per side
 * @param {(x: number, z: number) => number} height metres
 */
function testGrid(n, height = () => 0) {
  const width = (n - 1) * 2, depth = width;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) heights[j * n + i] = height((i / (n - 1) - 0.5) * width, (j / (n - 1) - 0.5) * depth);
  return buildCostGrid({ n, width, depth, heights, density: new Uint8Array(4), densityN: 2, baseElevation: 0, range: 100 });
}

/** O2 that leaves a margin of exactly 0 after a flat walk of `radius` m out and back (padded back). */
function o2ForRadius(radius) {
  const t = walkingTables(c);
  const flat = t.o2PerM[Math.round(t.iMax / t.step)];
  return radius * flat * (2 + c.walkbackPad) + c.reserveSec * rate;
}

const reached = (zone) => {
  const out = new Set();
  zone.state.forEach((s, k) => { if (s !== ZONE_STATE.OUTSIDE) out.add(k); });
  return out;
};

describe('walking cost per edge', () => {
  it('matches the suit model walkCost on a straight 2 m step, uphill and downhill, within 0.05 %', () => {
    const tables = walkingTables(c), out = {};
    for (const rise of [-0.6, -0.2, 0, 0.1, 0.35, 0.7]) {
      const exact = walkCost([[0, 0], [2, 0]], (x) => (x > 1 ? rise : 0), c, { stepM: 10, pad: 0 });
      edgeCost(tables, 2, rise, out);
      expect(Math.abs(out.o2 - exact.o2G) / exact.o2G).toBeLessThan(5e-4);
      expect(Math.abs(out.sec - exact.timeSec) / exact.timeSec).toBeLessThan(5e-4);
    }
  });
});

describe('flat ground', () => {
  const grid = testGrid(201);   // 400 m square
  const R = 120;
  const zone = computeReturnZone({ grid, home: { x: 0, z: 0 }, suit: { o2G: o2ForRadius(R) }, constants: c, step: 1 });

  it('reaches the expected radius along the axes and the diagonals', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2]]) {
      expect(zoneStateAt(zone, dx * (R - 3), dz * (R - 3))).not.toBe(ZONE_STATE.OUTSIDE);
      expect(zoneStateAt(zone, dx * (R + 3), dz * (R + 3))).toBe(ZONE_STATE.OUTSIDE);
    }
  });

  it('is a disc: nothing past the radius, and the 8-neighbour grid shaves at most 8 % between the axes', () => {
    zone.state.forEach((s, k) => {
      if (s === ZONE_STATE.OUTSIDE) return;
      const q = k % zone.cols, r = (k - q) / zone.cols;
      expect(Math.hypot(zone.x0 + q * zone.dx, zone.z0 + r * zone.dz)).toBeLessThanOrEqual(R + 2);
    });
    const a = 22.5 * Math.PI / 180;
    expect(zoneStateAt(zone, Math.cos(a) * R * 0.91, Math.sin(a) * R * 0.91)).not.toBe(ZONE_STATE.OUTSIDE);
    const area = zone.stats.insideM2 + zone.stats.edgeM2;
    expect(area).toBeGreaterThan(0.9 * Math.PI * R * R);
    expect(area).toBeLessThan(1.02 * Math.PI * R * R);
  });

  it('puts the last 15 min of margin in the edge band, as a ring at the rim', () => {
    expect(zoneStateAt(zone, 0, 0)).toBe(ZONE_STATE.EDGE);   // this O2 leaves under 15 min anywhere
    // 18 min of margin at 60 m: walking out and back costs 2.2 s of margin per metre, so it drops under 15 min past 142 m
    const roomy = computeReturnZone({ grid, home: { x: 0, z: 0 }, suit: { o2G: o2ForRadius(60) + 18 * 60 * rate }, constants: c, step: 1 });
    expect(zoneStateAt(roomy, 0, 0)).toBe(ZONE_STATE.INSIDE);
    expect(zoneStateAt(roomy, 135, 0)).toBe(ZONE_STATE.INSIDE);
    expect(zoneStateAt(roomy, 150, 0)).toBe(ZONE_STATE.EDGE);
    expect(zoneStateAt(roomy, 0, -190)).toBe(ZONE_STATE.EDGE);
    expect(roomy.stats.edgeCells).toBeGreaterThan(0);
  });
});

describe('a slope wall', () => {
  // flat to x = 40 m, then a 30 m cliff over 6 m (over 70 degrees), then a flat plateau
  const grid = testGrid(161, (x) => (x < 40 ? 0 : x > 46 ? 30 : (x - 40) * 5));
  const zone = computeReturnZone({ grid, home: { x: 0, z: 0 }, suit: { o2G: c.o2UsableG }, constants: c, step: 1 });

  it('closes the zone at the wall: the plateau behind it is outside with a full tank', () => {
    expect(zoneStateAt(zone, 20, 0)).toBe(ZONE_STATE.INSIDE);
    expect(zoneStateAt(zone, -150, 100)).toBe(ZONE_STATE.INSIDE);
    for (const z of [-150, -60, 0, 60, 150]) expect(zoneStateAt(zone, 80, z)).toBe(ZONE_STATE.OUTSIDE);
    expect(zoneMarginAt(zone, 80, 0)).toBe(-Infinity);
  });

  it('closes a coarse zone at the wall too', () => {
    const coarse = computeReturnZone({ grid, home: { x: 0, z: 0 }, suit: { o2G: c.o2UsableG }, constants: c, step: 2 });
    expect(zoneStateAt(coarse, 80, 0)).toBe(ZONE_STATE.OUTSIDE);
    expect(zoneStateAt(coarse, 20, 0)).toBe(ZONE_STATE.INSIDE);
  });
});

// rolling ground: about 4 m of relief, under the no-go limit
const rolling = (x, z) => 2 * Math.sin(x / 23) + 1.5 * Math.cos(z / 17) + 0.8 * Math.sin((x + z) / 9);

describe('less oxygen', () => {
  const grid = testGrid(181, rolling);
  const at = (o2G) => computeReturnZone({ grid, home: { x: -30, z: 20 }, from: { x: 10, z: -15 }, suit: { o2G, elapsedSec: 600 }, constants: c, step: 1 });

  it('shrinks the zone monotonically: each zone fits inside the one with more O2', () => {
    let previous = null;
    for (const o2G of [86, 84, 81, 79, 77, 75.5]) {
      const cells = reached(at(o2G));
      if (previous) {
        expect(cells.size).toBeLessThan(previous.size);
        for (const k of cells) expect(previous.has(k)).toBe(true);
      }
      previous = cells;
    }
  });
});

describe('the suit model margin', () => {
  const grid = testGrid(181, rolling);
  const input = { grid, home: { x: -30, z: 20 }, from: { x: 25, z: -10 }, suit: { o2G: 400, elapsedSec: 900 }, constants: c, step: 1, evaLimitSec: 20 * 60 };
  const zone = computeReturnZone(input);

  it('is the margin suitReadout gives at the node, after walking there, with the walk home from there', () => {
    let checked = 0;
    for (let k = 0; k < zone.state.length; k += 997) {
      if (!(zone.toO2G[k] < Infinity) || !(zone.homeO2G[k] < Infinity)) continue;
      const there = { o2G: input.suit.o2G - zone.toO2G[k], o2RateSmoothGs: rate, batteryWh: c.batteryWh, powerW: c.pBaseW };
      const readout = suitReadout(there, { o2G: zone.homeO2G[k], timeSec: zone.homeSec[k] }, { ...c, evaMaxSec: 20 * 60 }, { elapsedSec: input.suit.elapsedSec + zone.toSec[k] });
      expect(zone.marginSec[k]).toBeCloseTo(readout.marginSec, 1);
      const expected = readout.status === 'warning' ? ZONE_STATE.OUTSIDE : readout.status === 'caution' ? ZONE_STATE.EDGE : ZONE_STATE.INSIDE;
      if (Math.abs(readout.marginSec - c.cautionSec) > 0.1 && Math.abs(readout.marginSec - c.warningSec) > 0.1) expect(zone.state[k]).toBe(expected);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
    expect(zone.stats.limit).toBe('eva');
  });

  it('prices the walk home along a straight line as walkCost does, with the walkback pad', () => {
    const flat = testGrid(101, (x) => 0.05 * x);   // a 2.9 degree tilt, rising to the east
    const z = computeReturnZone({ grid: flat, home: { x: 0, z: 0 }, suit: { o2G: c.o2UsableG }, constants: c, step: 1 });
    const k = zoneNodeAt(zoneGrid(flat, 1), 60, 0);
    const h = (x, zz) => heightAt(flat, x, zz);
    const exact = walkCost([[60, 0], [0, 0]], h, c, { stepM: 2 });
    expect(Math.abs(z.homeO2G[k] - exact.o2G) / exact.o2G).toBeLessThan(1e-3);
    expect(Math.abs(z.homeSec[k] - exact.timeSec) / exact.timeSec).toBeLessThan(1e-3);
    const out = walkCost([[0, 0], [60, 0]], h, c, { stepM: 2, pad: 0 });
    expect(Math.abs(z.toO2G[k] - out.o2G) / out.o2G).toBeLessThan(1e-3);
  });
});

describe('event modifiers', () => {
  const grid = testGrid(181, rolling);
  const base = { grid, home: { x: 0, z: 0 }, from: { x: 40, z: 0 }, suit: { o2G: c.o2UsableG }, constants: c, step: 1 };

  it('homeward keeps only ground no farther from home than the astronaut, and snaps the zone tighter', () => {
    const open = computeReturnZone(base);
    const storm = computeReturnZone({ ...base, modifiers: { homeward: true } });
    expect(storm.stats.limit).toBe('event');
    expect(reached(storm).size).toBeLessThan(reached(open).size / 10);
    expect(zoneStateAt(storm, 20, 0)).not.toBe(ZONE_STATE.OUTSIDE);
    expect(zoneStateAt(storm, 80, 0)).toBe(ZONE_STATE.OUTSIDE);
    expect(zoneStateAt(open, 80, 0)).not.toBe(ZONE_STATE.OUTSIDE);
  });

  it('closes active hazard areas and ignores inactive ones', () => {
    const z = computeReturnZone({ ...base, modifiers: { hazards: [{ x: -60, z: 0, radiusM: 12, active: true }, { x: 60, z: 60, radiusM: 12, active: false }] } });
    expect(zoneStateAt(z, -60, 0)).toBe(ZONE_STATE.OUTSIDE);
    expect(zoneStateAt(z, 60, 60)).not.toBe(ZONE_STATE.OUTSIDE);
  });

  it('reads homeward from the active alerts of events that send the crew to a shelter', () => {
    const defs = [{ id: 'dust-storm', planner: { action: 'replan', target: 'habitat' } }, { id: 'low-oxygen-caution' }];
    expect(zoneModifiers({ alerts: {} }, defs).homeward).toBe(false);
    expect(zoneModifiers({ alerts: { 'low-oxygen-caution': { eventId: 'low-oxygen-caution', active: true } } }, defs).homeward).toBe(false);
    const storm = zoneModifiers({ alerts: { 'dust-storm': { eventId: 'dust-storm', active: true } }, hazards: { zones: [] } }, defs);
    expect(storm).toEqual({ homeward: true, hazards: [], events: ['dust-storm'] });
    expect(zoneModifiers({ alerts: { 'dust-storm': null } }, defs).homeward).toBe(false);
  });
});

describe('zoneRgba', () => {
  it('writes one RGBA pixel per node in the state colours', () => {
    const zone = { cols: 2, rows: 1, state: new Uint8Array([ZONE_STATE.OUTSIDE, ZONE_STATE.EDGE]) };
    const px = zoneRgba(zone, { outside: [1, 2, 3, 4], edge: [5, 6, 7, 8], inside: [0, 0, 0, 0] });
    expect([...px]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
