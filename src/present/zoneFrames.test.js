import { describe, expect, it, vi } from 'vitest';
import { SORTIE, buildZoneFrames } from './zoneFrames.js';

// A stand-in for src/sim/returnZone.js (#335): a 4 x 1 strip whose inside nodes are counted from the west, fewer each
// frame, and none after the alert's homeward modifier.
const ZONE_STATE = { OUTSIDE: 0, EDGE: 1, INSIDE: 2 };
function fakeModule() {
  let call = 0;
  return {
    ZONE_STATE,
    zoneMarginAt: () => 600,
    computeReturnZone: vi.fn(({ modifiers }) => {
      const inside = modifiers.homeward ? 1 : Math.max(1, 4 - call);
      call++;
      const state = new Uint8Array(4).map((_, i) => (i < inside ? ZONE_STATE.INSIDE : ZONE_STATE.OUTSIDE));
      return { cols: 4, rows: 1, x0: 0, z0: 0, dx: 50, dz: 20, state, stats: { reachM: inside * 50, limit: modifiers.homeward ? 'window' : 'eva' } };
    }),
  };
}

const scenario = { framesOut: 3, framesHome: 2, speFrame: 3, arriveFrame: 1, alertAtSec: 780, o2G: 700, windowSec: 210 };
const input = (zoneModule) => ({ grid: {}, hab: { x: 0, z: 0 }, constants: { speedFlat: 1 }, scenario, zoneModule });

describe('buildZoneFrames', () => {
  it('runs the zone module once a frame with the sortie limit and the alert modifiers', () => {
    const m = fakeModule();
    buildZoneFrames(input(m));
    const calls = m.computeReturnZone.mock.calls.map(([a]) => a);
    expect(calls).toHaveLength(5);
    expect(calls[0].evaLimitSec).toBeCloseTo(SORTIE.timeMin * 60 * (1 - SORTIE.reserveShare));
    expect(calls[2].modifiers).toEqual({});
    expect(calls[3].modifiers).toEqual({ homeward: true, shelterWithinSec: 210 });
    // the shelter window shrinks while the crew walks home
    expect(calls[4].modifiers.shelterWithinSec).toBeLessThan(210);
  });

  it('records the last frame each node is inside, and a node that leaves stays out', () => {
    const z = buildZoneFrames(input(fakeModule()));
    expect([...z.last]).toEqual([5, 3, 2, 1]);
    expect(z.frames.map((f) => f.areaHa)).toEqual([0.4, 0.3, 0.2, 0.1, 0.1]);
    expect(z.frames[3]).toMatchObject({ spe: true, limit: 'window', marginMin: 10 });
    expect(z.scenario).toMatchObject({ plannedMin: 30, usableMin: 25.5, tag: 'SIM' });
  });
});
