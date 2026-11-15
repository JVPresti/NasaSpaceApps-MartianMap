// No back and forth (#288, playtest feedback on the scripted EV2: "not following and just going back and forth").
// A 3-minute first-mission run on a recorded player walk: out of the airlock, a stop to look around, a 90 degree and a
// 135 degree turn, a 10 m backtrack, the sortie stop, the storm, the walk home and into the cabin. It measures what the
// playtest saw: direction reversals, time spent far away, walking into the player or the habitat, and how EV2 waits.
import { describe, expect, it } from 'vitest';
import { assertPartnerState } from '../engine/partnerSource.js';
import { CREWMATE, createCrewmate } from './crewmate.js';
import { canStand, densePath, habToWorld, makeHabitat, makeTrack, makeWorld, recordTrack, reversals } from './crewmateFixtures.js';

const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angle = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));

// the walk, in habitat space [x, v] (x toward the airlock end): the route bends 90 degrees at B and 135 degrees at C
const h = makeHabitat();
const H = (x, v) => habToWorld(h, x, v);
const A = H(10.6, 0), B = H(35, 0), C = H(35, 18), D = H(24, 7), S = H(14, 14);
const M = H(28, 0), BACK = H(18, 1);                   // 17 m out, then 10 m back, 1 m to the side of the route
const OUT = densePath([A, B, C, D, S]), HOME = densePath([S, A]);
const PAUSE_SEC = 8, STORM_AT = 118, RADIATION_AT = 133, END = 180;
const inside = [[9.9, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.6, -1.2], [0.2, -1.75]];
const legs = [
  { to: M, speed: 1 }, { to: BACK, speed: 1 }, { to: M, speed: 1 },   // the 10 m backtrack, and on again
  { to: B, speed: 1 }, { waitSec: PAUSE_SEC },                          // a stop to look around
  { to: C, speed: 1 }, { to: D, speed: 1 },                             // the 90 degree turn at B and the 135 degree turn at C
  { to: S, speed: 1 }, { waitSec: 0 },
];
const outbound = makeTrack(A, legs);
const atStop = outbound.endSec;                                          // about T+98
const homeLegs = [{ waitSec: STORM_AT + 2 - atStop }, { to: A, speed: 1 }, ...inside.map(([x, v]) => ({ to: H(x, v), speed: 0.8 })), { waitSec: 60 }];
const track = makeTrack(A, [...legs, ...homeLegs]);
const recorded = recordTrack(track, END);
const backFrom = makeTrack(A, legs.slice(0, 1)).endSec, backTo = makeTrack(A, legs.slice(0, 2)).endSec;   // the backtrack
const PAUSE_AT = makeTrack(A, legs.slice(0, 4)).endSec;
const ROCK = { ...H(35 + 1.4, 9), r: 0.5 };   // beside the B-C leg, where EV2 cuts nothing but walks close

function runIt() {
  const world = makeWorld({ habitat: h, rocks: [ROCK] });
  const brain = createCrewmate();
  const stops = [{ id: 'sortie', name: 'S1', x: S.x, z: S.z, radiusM: 5 }];
  const frames = [];
  let prevYaw = null, maxTurnRate = 0;
  world.player = { ...A };
  for (let t = -2; t < 0; t += DT) brain.update(DT, world, { present: true, phase: 'pre', path: OUT, stops, link: true });
  for (let t = 0; t <= END; t += DT) {
    const p = recorded.at(t);
    world.player = { x: p.x, z: p.z };
    const storm = t >= STORM_AT;
    const { state } = brain.update(DT, world, {
      present: true, phase: 'eva', missionSec: t, path: storm ? HOME : OUT, stops, link: true,
      storm, radiation: t >= RADIATION_AT, shelter: storm ? { type: 'habitat', x: A.x, z: A.z } : null, own: { marginSec: 20000 },
    });
    assertPartnerState(state);
    if (prevYaw !== null) maxTurnRate = Math.max(maxTurnRate, angle(state.yaw - prevYaw) / DT);
    prevYaw = state.yaw;
    frames.push({ t, x: state.x, z: state.z, yaw: state.yaw, gait: state.gait, carrying: state.carrying, player: { ...p }, mode: brain.inspect().mode });
  }
  return { frames, flips: brain.inspect().flips, maxTurnRate };
}

describe('EV2 does not go back and forth: a 3-minute first mission on a recorded walk', () => {
  const run = runIt();
  const ev2 = run.frames.map((f) => ({ t: f.t, x: f.x, z: f.z }));
  const player = run.frames.map((f) => ({ t: f.t, x: f.player.x, z: f.player.z }));
  const playerTurns = reversals(player), ev2Turns = reversals(ev2);

  it('counts the player\'s own reversals: the 135 degree turn and the 10 m backtrack', () => {
    expect(playerTurns.length).toBeGreaterThanOrEqual(3);
    expect(playerTurns.some((t) => t >= backFrom && t <= backFrom + 3)).toBe(true);
    expect(playerTurns.some((t) => t >= backTo && t <= backTo + 3)).toBe(true);
  });

  it('reverses at most once a minute when the player does not', () => {
    // a reversal of EV2 within 15 s of one of the player's is EV2 following them round; the rest it did by itself
    const unprompted = ev2Turns.filter((t) => !playerTurns.some((p) => t >= p && t <= p + 15));
    expect(unprompted.length).toBeLessThanOrEqual(Math.floor(END / 60));
    expect(ev2Turns.length).toBeLessThanOrEqual(playerTurns.length + Math.floor(END / 60));
  });

  it('does not reverse at all when the player backtracks 10 m: it waits for them', () => {
    expect(ev2Turns.filter((t) => t >= backFrom && t <= backTo + 10)).toEqual([]);
  });

  it('spends under 5 % of the run more than 15 m from the player', () => {
    const far = run.frames.filter((f) => dist(f, f.player) > 15).length;
    expect(far / run.frames.length).toBeLessThan(0.05);
  });

  it('never walks into the player, through the habitat or through a rock', () => {
    for (let i = 1; i < run.frames.length; i++) {
      const f = run.frames[i], prev = run.frames[i - 1];
      expect(canStand(h, f.x, f.z)).toBe(true);
      if (dist(f, prev) > 1e-9) expect(dist(f, f.player)).toBeGreaterThanOrEqual(0.9 - 1e-6);
      expect(dist(f, ROCK)).toBeGreaterThanOrEqual(ROCK.r + 0.3 - 1e-6);
    }
  });

  it('turns at most 120 degrees per second', () => {
    expect(run.maxTurnRate).toBeLessThanOrEqual(CREWMATE.TURN_DEG_S * Math.PI / 180 + 1e-6);
  });

  it('never changes a decision twice within 2 s', () => {
    const byName = {};
    for (const f of run.flips) (byName[f.name] ??= []).push(f.at);
    for (const times of Object.values(byName)) for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(CREWMATE.FLIP_SEC - 1e-9);
    expect(run.flips.length).toBeGreaterThan(0);
  });

  it('waits on purpose when the player stops: slows down, stops 4 to 6 m away facing them, and stands still', () => {
    const settled = run.frames.filter((f) => f.t >= PAUSE_AT + 5 && f.t <= PAUSE_AT + PAUSE_SEC - 0.2);
    expect(settled.length).toBeGreaterThan(60);
    for (const f of settled) {
      const d = dist(f, f.player);
      expect(d).toBeGreaterThanOrEqual(4);
      expect(d).toBeLessThanOrEqual(6);
      expect(f.gait).toBe('idle');
      expect(angle(Math.atan2(f.player.x - f.x, f.player.z - f.z) - f.yaw)).toBeLessThan(15 * Math.PI / 180);
    }
    // no idle pacing: it does not move at all while it waits
    const first = settled[0], last = settled[settled.length - 1];
    expect(dist(first, last)).toBeLessThan(0.02);
    // and it slowed down into the stop: no step from walking to standing
    const stopping = run.frames.filter((f) => f.t >= PAUSE_AT - 1 && f.t <= PAUSE_AT + 5);
    let maxDrop = 0;
    for (let i = 1; i < stopping.length; i++) {
      const v0 = dist(stopping[i - 1], i > 1 ? stopping[i - 2] : stopping[i - 1]) / DT, v1 = dist(stopping[i], stopping[i - 1]) / DT;
      maxDrop = Math.max(maxDrop, v0 - v1);
    }
    expect(maxDrop).toBeLessThanOrEqual(CREWMATE.DECEL_MS2 * DT + 0.02);
  });

  it('is beside the player at the sortie stop with the case down before the storm', () => {
    const atS = run.frames.filter((f) => f.t > atStop + 6 && f.t < STORM_AT);
    expect(atS.some((f) => !f.carrying)).toBe(true);
    for (const f of atS) expect(dist(f, f.player)).toBeLessThanOrEqual(2.5);
  });

  if (typeof process !== 'undefined' && process.env.CREWMATE_TRACE) {
    console.log(`player reversals ${playerTurns.map((t) => t.toFixed(1)).join(', ')}\nEV2 reversals ${ev2Turns.map((t) => t.toFixed(1)).join(', ')}`);
    console.log(`far > 15 m: ${(run.frames.filter((f) => dist(f, f.player) > 15).length / run.frames.length * 100).toFixed(2)} %; max turn ${(run.maxTurnRate * 180 / Math.PI).toFixed(0)} deg/s; flips ${run.flips.length}`);
  }
});

// Two cases the GPU browser run of the first mission turned up (docs/qa/ev2-crewmate), kept as regressions.
describe('EV2 does not go back and forth: cases from the browser run', () => {
  const STEP = 1 / 30;
  function walk(legs, seconds, sense) {
    const world = makeWorld(), brain = createCrewmate(), start = legs.start;
    const track = makeTrack(start, legs.legs), ev2 = [], player = [];
    let far = 0, n = 0;
    for (let t = 0; t <= seconds; t += STEP) {
      const p = track.at(t);
      world.player = { x: p.x, z: p.z };
      const { state } = brain.update(STEP, world, sense(t));
      ev2.push({ t, x: state.x, z: state.z }); player.push({ t, x: p.x, z: p.z });
      if (Math.hypot(state.x - p.x, state.z - p.z) > 15) far++;
      n++;
    }
    return { ev2: reversals(ev2), player: reversals(player), farShare: far / n };
  }
  const R0 = { x: 0, z: 0 }, R1 = { x: 80, z: 0 };
  const route = densePath([R0, R1]);
  const unprompted = (r) => r.ev2.filter((t) => !r.player.some((p) => t >= p && t <= p + 15));

  it('walks the player\'s trail round a turn off the route and back onto it without doubling back', () => {
    // 18 m along, 15 m off the route (past OFF_ROUTE_M), then back to the route diagonally and on
    const r = walk({ start: R0, legs: [{ to: { x: 18, z: 0 }, speed: 1 }, { to: { x: 18, z: -15 }, speed: 1 }, { to: { x: 55, z: -0.5 }, speed: 1 }, { to: R1, speed: 1 }] }, 100,
      () => ({ present: true, phase: 'eva', path: route, stops: [], link: true }));
    expect(unprompted(r)).toEqual([]);
    expect(r.farShare).toBeLessThan(0.05);
  });

  it('does not turn round for a player who walks past it once an event that had it leading ends', () => {
    // radiation: EV2 leads toward R1; the alert ends while the player is still walking; the player walks past EV2
    const r = walk({ start: R0, legs: [{ to: R1, speed: 1 }] }, 75,
      (t) => ({ present: true, phase: 'eva', path: route, stops: [], link: true, radiation: t < 40, shelter: { type: 'habitat', x: R1.x, z: R1.z } }));
    expect(r.ev2).toEqual([]);
  });

  it('does not curl sideways when the radiation lead ends with it passing on the side, in the storm', () => {
    const r = walk({ start: R0, legs: [{ to: R1, speed: 1 }] }, 75,
      (t) => ({ present: true, phase: 'eva', path: route, stops: [], link: true, storm: t < 30, radiation: t >= 8 && t < 32, shelter: { type: 'habitat', x: R1.x, z: R1.z } }));
    expect(r.ev2).toEqual([]);
  });
});

// The player's own walk from the GPU browser run of #282's first mission (src/sim/crewmate.recorded-walk.json): out of
// the airlock, a 90 degree turn 15 m off the route and back, S1, the storm and the radiation alert, home and in.
describe('EV2 does not go back and forth: replaying the walk recorded in the browser run', async () => {
  const rec = (await import('./crewmate.recorded-walk.json')).default;
  const hab = { x: rec.habitat.x, z: rec.habitat.z, yaw: Math.atan2(-rec.habitat.dir.z, rec.habitat.dir.x) };
  const at = (t) => {
    const s = rec.samples, i = Math.min(s.length - 2, Math.max(0, Math.floor(t * 10))), a = s[i], b = s[i + 1], k = Math.min(1, Math.max(0, (t - a[0]) / ((b[0] - a[0]) || 1)));
    return { x: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k, mission: a[3] + (b[3] - a[3]) * k };
  };
  const STEP = 1 / 30, END = rec.samples.at(-1)[0];
  const world = makeWorld({ habitat: hab }), brain = createCrewmate();
  const stop = { id: rec.stop.id, name: 'S1', x: rec.stop.x, z: rec.stop.z, radiusM: 5 };
  const ev2 = [], player = [];
  let homePath = null, reached = false, prev = null, intoPlayer = 0, throughWall = 0;
  world.player = { ...at(0) };
  for (let t = -2; t < 0; t += STEP) brain.update(STEP, world, { present: true, phase: 'pre', path: rec.route, stops: [stop], link: true });
  for (let t = 0; t <= END; t += STEP) {
    const p = at(t), e = rec.events;
    world.player = { x: p.x, z: p.z };
    if (dist(p, stop) <= 5) reached = true;
    const storm = p.mission >= e.stormSec && p.mission < e.stormEndSec, radiation = p.mission >= e.radiationSec && p.mission < e.radiationEndSec;
    if (storm && !homePath) homePath = [[p.x, p.z], rec.route[0]];   // the re-plan to the habitat, as a straight line here
    const { state } = brain.update(STEP, world, {
      present: true, phase: 'eva', missionSec: p.mission, path: homePath ?? rec.route, stops: [stop], link: true,
      nextStop: reached ? null : { name: 'S1', rangeM: dist(p, stop) }, storm, radiation,
      shelter: storm || radiation ? { type: 'habitat', x: rec.route[0][0], z: rec.route[0][1] } : null, own: { marginSec: 20000 },
    });
    if (prev && dist(state, prev) > 1e-9 && dist(state, p) < 0.9 - 1e-6) intoPlayer++;
    if (!canStand(hab, state.x, state.z)) throughWall++;
    prev = { x: state.x, z: state.z };
    ev2.push({ t, x: state.x, z: state.z, d: dist(state, p) }); player.push({ t, x: p.x, z: p.z });
  }
  const pr = reversals(player), er = reversals(ev2);

  it('reverses at most once a minute when the player does not', () => {
    const unprompted = er.filter((t) => !pr.some((p) => t >= p && t <= p + 15));
    expect(unprompted.length).toBeLessThanOrEqual(Math.floor(END / 60));
  });
  it('spends under 5 % of the walk more than 15 m from the player', () => {
    expect(ev2.filter((f) => f.d > 15).length / ev2.length).toBeLessThan(0.05);
  });
  it('never steps into the player or through the habitat', () => {
    expect(intoPlayer).toBe(0);
    expect(throughWall).toBe(0);
  });
  if (typeof process !== 'undefined' && process.env.CREWMATE_TRACE) console.log(`replay: player reversals ${pr.map((t) => t.toFixed(1))}, EV2 reversals ${er.map((t) => t.toFixed(1))}`);
});
