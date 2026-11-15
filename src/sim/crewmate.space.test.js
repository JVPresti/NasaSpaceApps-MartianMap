// Personal space (#377): EV2 walked into the player and the two suits overlapped. EV2 never walks closer than SPACE_M
// (2 m) while following, waiting or leading, steps aside when the player walks up to it, and keeps BODY_M (1.2 m) at
// the science stop and the hand-over, where it stands HANDOVER_M (1.6 m) from them on purpose. Each case runs at 10, 30
// and 60 fps. In these fixtures the player walks through EV2, so the closest they get is what EV2 did to keep clear.
import { describe, expect, it } from 'vitest';
import { HANDOVER_M } from '../engine/partnerSource.js';
import { CREWMATE, createCrewmate } from './crewmate.js';
import { densePath, makeTrack, makeWorld, reversals, withoutSteps, yawFlips } from './crewmateFixtures.js';

const ROUTE = densePath([{ x: 0, z: 0 }, { x: 80, z: 0 }]);
const STOP = { id: 's', name: 'S', x: 40, z: 0, radiusM: 5 };
const rad = () => ({ radiation: true, shelter: { type: 'habitat', x: 80, z: 0 } });
const CLOSE_MODES = new Set(['stop', 'case', 'handover', 'home', 'standby']);   // where HANDOVER_M is allowed
const PLAYER_MIN_M = 1.5;   // a player walking straight at it at 1 m/s gets no closer than this
const hyp = Math.hypot;

function run(fps, playerAt, senseAt, seconds, { stops = [], onTick = null } = {}) {
  const DT = 1 / fps, world = makeWorld(), brain = createCrewmate(), frames = [];
  let prev = null, ownIntrusions = 0, minSpaced = Infinity, minClose = Infinity;
  for (let t = 0; t <= seconds; t += DT) {
    const p = playerAt(t);
    world.player = { x: p.x, z: p.z };
    if (onTick) onTick(t, brain, world);
    const { state } = brain.update(DT, world, { present: true, phase: 'eva', path: ROUTE, stops, link: true, ...senseAt(t) });
    const i = brain.inspect(), d = hyp(state.x - p.x, state.z - p.z);
    // EV2's own move this frame, against where the player is now: it may not end inside SPACE_M
    if (prev && !CLOSE_MODES.has(i.mode)) {
      const before = hyp(prev.x - p.x, prev.z - p.z);
      if (d < before - 1e-9 && d < CREWMATE.SPACE_M - 1e-6) ownIntrusions++;
    }
    if (t > 0.5) { if (CLOSE_MODES.has(i.mode) || !state.carrying) minClose = Math.min(minClose, d); else minSpaced = Math.min(minSpaced, d); }
    frames.push({ t, x: state.x, z: state.z, yaw: state.yaw, yielding: i.yield, player: p });
    prev = { x: state.x, z: state.z };
  }
  const playerTurns = reversals(frames.map((f) => ({ t: f.t, ...f.player })));
  return { frames, ownIntrusions, minSpaced, minClose, flips: yawFlips(frames), reversals: reversals(withoutSteps(frames), { minSpeed: 0.05 }), playerTurns };
}

// [name, player, sense, seconds]
const back = (z = 0, speed = 1) => (t) => ({ x: t < 30 ? t : Math.max(0, 30 - (t - 30) * speed), z });
const CASES = [
  ['following: the player turns round and walks back straight into EV2', back(0), () => ({}), 60],
  ['following: the player walks back 0.5 m off EV2\'s line', back(0.5), () => ({}), 60],
  ['following: the player walks back slowly, at 0.5 m/s', back(0, 0.5), () => ({}), 80],
  ['waiting: the player stops, then walks back head-on into EV2', (t) => ({ x: t < 30 ? t : t < 45 ? 30 : Math.max(0, 30 - (t - 45)), z: 0 }), () => ({}), 75],
  ['dust storm, 3 m behind: the player turns round into EV2', back(0), () => ({ storm: true }), 60],
  ['radiation lead: EV2 passes the player on the route', (t) => ({ x: Math.min(70, t), z: 0 }), (t) => (t > 15 ? rad() : {}), 60],
  ['radiation lead: EV2 passes a player 1 m off the route', (t) => ({ x: Math.min(70, t), z: -1 }), (t) => (t > 15 ? rad() : {}), 60],
  ['radiation lead: the player hurries at 1.4 m/s into EV2 ahead', (t) => ({ x: Math.min(70, t * 1.4), z: 0 }), (t) => (t > 10 ? rad() : {}), 60],
];

describe.each([10, 30, 60])('EV2 keeps its distance from the player at %i fps', (fps) => {
  for (const [name, player, sense, seconds] of CASES) {
    it(name, () => {
      const r = run(fps, player, sense, seconds);
      expect(r.ownIntrusions).toBe(0);                         // EV2 never walks inside SPACE_M itself
      expect(r.minSpaced).toBeGreaterThanOrEqual(PLAYER_MIN_M);
      // holding the gap does not rock it: the dead bands and jitter limits of crewmate.jitter.test.js
      expect(r.flips).toBeLessThanOrEqual(3);
      expect(r.reversals.length).toBeLessThanOrEqual(r.playerTurns.length);
    });
  }

  it('science stop and hand-over: HANDOVER_M from the player, never inside BODY_M', () => {
    const track = makeTrack({ x: 0, z: 0 }, [{ to: { x: 39, z: 0 }, speed: 1 }, { waitSec: 25 }, { to: { x: 75, z: 0 }, speed: 1 }]);
    const r = run(fps, (t) => track.at(t), () => ({}), 110, { stops: [STOP] });
    expect(r.minClose).toBeGreaterThanOrEqual(CREWMATE.BODY_M);
    expect(r.minClose).toBeLessThanOrEqual(HANDOVER_M + 0.3);   // it does come in for the case
    expect(r.minSpaced).toBeGreaterThanOrEqual(PLAYER_MIN_M);
    expect(r.ownIntrusions).toBe(0);
  });

  it('the hand-over on F away from a stop brings the case to HANDOVER_M, then keeps SPACE_M again', () => {
    const track = makeTrack({ x: 0, z: 0 }, [{ to: { x: 20, z: 0 }, speed: 1 }, { waitSec: 60 }]);
    const r = run(fps, (t) => track.at(t), () => ({}), 70, {
      onTick: (t, brain, world) => { if (Math.abs(t - 35) < 0.5 / fps) brain.command('toggleCase', world, { present: true, phase: 'eva', path: ROUTE, stops: [], link: true }); },
    });
    expect(r.minClose).toBeGreaterThanOrEqual(CREWMATE.BODY_M);
    expect(r.minClose).toBeLessThanOrEqual(HANDOVER_M + 0.3);
    expect(r.ownIntrusions).toBe(0);
  });
});
