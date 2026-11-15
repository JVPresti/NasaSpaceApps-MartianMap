// No jitter (#288, review of #346). Every case here once made EV2 rock: a value lingering at one of its thresholds,
// the radiation lead with the player off the route, a pass on the wrong side. Each runs at 10, 30 and 60 fps and
// measures heading jitter (yawFlips), direction reversals at any walking speed, and walk/idle toggles. None of these
// players ever turns back, so no reversal is excused.
import { describe, expect, it } from 'vitest';
import { CREWMATE, createCrewmate } from './crewmate.js';
import { densePath, gaitToggles, makeTrack, makeWorld, reversals, yawFlips } from './crewmateFixtures.js';

const ROUTE = densePath([{ x: 0, z: 0 }, { x: 80, z: 0 }]);
const SHELTER = { type: 'habitat', x: 80, z: 0 };
const rad = () => ({ radiation: true, shelter: SHELTER });
const calm = () => ({});
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function run(fps, playerAt, senseAt, seconds, { stops = [] } = {}) {
  const DT = 1 / fps, world = makeWorld(), brain = createCrewmate(), frames = [];
  let near = 0;
  for (let t = 0; t <= seconds; t += DT) {
    const p = playerAt(t);
    world.player = { x: p.x, z: p.z };
    const { state } = brain.update(DT, world, { present: true, phase: 'eva', path: ROUTE, stops, link: true, ...senseAt(t) });
    frames.push({ t, x: state.x, z: state.z, yaw: state.yaw, gait: state.gait });
    if (t > 5 && dist(state, p) < 1.2) near += DT;
  }
  return { frames, near, flips: yawFlips(frames), reversals: reversals(frames, { minSpeed: 0.05 }), toggles: gaitToggles(frames) };
}

const along = (v, z, stopX = 70) => (t) => ({ x: Math.min(stopX, v * t), z: typeof z === 'function' ? z(t) : z });
const sway = (z0, amp, w = 1.3) => (t) => z0 + amp * Math.sin(t * w);

// [name, player, sense, seconds, max yaw flips, max walk/idle toggles]
const CASES = [
  // the radiation lead with the player walking beside the route, on either side, up to past OFF_ROUTE_M
  ...[-2, 1, 2, 3, 5, 7.5, 8.5].map((z) => [`radiation lead, player ${z} m off the route`, along(1, z), rad, 90, 2, 4]),
  // lingering at a threshold
  ['radiation lead, player swaying across OFF_ROUTE_M (8 ± 0.4 m)', along(1, sway(CREWMATE.OFF_ROUTE_M, 0.4)), rad, 90, 2, 4],
  ['radiation lead, player stopped and swaying 10 m short of the end (the nearly-there mark)', along(1, sway(0, 0.3, 3)), rad, 90, 2, 4],
  ['buddy walk, player swaying across OFF_ROUTE_M (7.5 ± 0.8 m)', along(1, sway(7.5, 0.8, 1)), calm, 90, 3, 6],
  ['buddy walk, player creeping at 0.25 m/s, just over the STILL_MS line', along(0.25, 0), calm, 200, 0, 16],
  ['buddy walk, player strolling at 0.5 m/s', along(0.5, 0), calm, 150, 0, 4],
  // a slow player gets 10 m ahead, EV2 closes to 6 m and waits again: two toggles every 25 s
  ['buddy walk, player shuffling between 0.10 and 0.34 m/s', (t) => ({ x: 0.22 * t + 0.2 * Math.sin(t * 0.6), z: 0 }), calm, 200, 0, 16],
  ['buddy walk, stop-and-go every 3 s, the gap crossing STOP_M and START_M', (t) => ({ x: Math.floor(t / 6) * 3 + Math.min(3, t % 6), z: 0 }), calm, 120, 0, 30],
  ['dust storm, stop-and-go every 2 s', (t) => ({ x: Math.floor(t / 4) * 2 + Math.min(2, t % 4), z: 0 }), () => ({ storm: true }), 120, 0, 60],
  ['buddy walk, then the radiation alert at T+20 s, player 2 m right of the route', along(1, -2, 75), (t) => (t >= 20 ? rad() : {}), 90, 2, 4],
];

describe.each([10, 30, 60])('EV2 does not jitter at %i fps', (fps) => {
  for (const [name, player, sense, seconds, maxFlips, maxToggles] of CASES) {
    it(name, () => {
      const r = run(fps, player, sense, seconds);
      expect(r.reversals).toEqual([]);
      expect(r.flips).toBeLessThanOrEqual(maxFlips);
      expect(r.toggles).toBeLessThanOrEqual(maxToggles);
    });
  }

  it('radiation alert at a science stop: picks the case up and leads off without crowding the player', () => {
    for (const [px, pz] of [[38, 1], [38, -1], [40, 2], [42, 0.5], [39, -2]]) {
      const track = makeTrack({ x: 0, z: 0 }, [{ to: { x: px, z: pz }, speed: 1 }, { waitSec: 25 }, { to: { x: 75, z: pz }, speed: 1 }]);
      const radAt = track.endSec - (75 - px) - 3, leaveEnd = radAt + 25;   // until the player is well on the way
      const r = run(fps, (t) => track.at(t), (t) => (t >= radAt ? rad() : {}), leaveEnd, { stops: [{ id: 's', name: 'S', x: 40, z: 0, radiusM: 5 }] });
      const after = r.frames.filter((f) => f.t >= radAt);
      expect(yawFlips(after)).toBeLessThanOrEqual(2);
      expect(reversals(after, { minSpeed: 0.05 })).toEqual([]);
      expect(r.near).toBe(0);
    }
  });
});
