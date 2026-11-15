// A headless run of the first mission of #282 (docs/DEMO.md on that branch) with EV2 the crewmate, no browser.
// The player's track follows the measured demo run: at the sortie stop S1 at T+56 s, about 40 s there with the sample
// poured into EV2's case, the dust storm at T+97 s, the radiation alert at T+113 s, both re-planned to the habitat,
// back at the airlock and into the cabin. The crewmate gets the same sense src/state/crewmate.js builds from the store.
import { describe, expect, it } from 'vitest';
import { assertPartnerState, CASE_CLIP } from '../engine/partnerSource.js';
import { CREWMATE, createCrewmate, HOME_CHAIN } from './crewmate.js';
import { canStand, densePath, HAB_ENTRY, habToWorld, makeHabitat, makeTrack, makeWorld, reversals, S1, withoutSteps, worldToHab } from './crewmateFixtures.js';

const DT = 1 / 30;
const STORM_AT = 97, RADIATION_AT = 113, LEAVE_AT = 100, POUR_DONE_AT = 82, FINISH_AT = 182;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function mission() {
  const h = makeHabitat(HAB_ENTRY, S1);
  const exit = habToWorld(h, 10.6, 0);
  // the planner's route out bends around a patch of rocks; the storm re-plan walks it back to the airlock
  const bend = { x: (exit.x + S1.x) / 2 + 4, z: (exit.z + S1.z) / 2 - 3 };
  const out = densePath([exit, bend, S1]);
  const home = densePath([S1, bend, exit]);
  const rocks = [{ x: bend.x + 2.5, z: bend.z + 1.5, r: 0.6 }, { x: S1.x + 3, z: S1.z - 2, r: 0.5 }];
  const stand = { x: S1.x + 0.5, z: S1.z + 0.3 };   // the step to the sampling stand point
  const inside = [[9.9, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.6, -1.2], [0.2, -1.75]];
  const legs = [
    { to: bend, speed: 1 }, { to: S1, speed: 1 }, { waitSec: 4 }, { to: stand, speed: 0.5 }, { waitSec: LEAVE_AT - 56 - 4 - 2 },
    { to: bend, speed: 1 }, { to: exit, speed: 1 }, ...inside.map(([x, v]) => ({ to: habToWorld(h, x, v), speed: 0.8 })), { waitSec: 40 },
  ];
  const track = makeTrack(exit, legs);
  const table = habToWorld(h, 1.75, 0);
  return { h, exit, out, home, rocks, track, table };
}

function runMission({ habitatFirst }) {
  const m = mission();
  const world = makeWorld({ habitat: m.h, rocks: m.rocks });
  const brain = createCrewmate();
  const stops = [{ id: S1.id, name: S1.name, x: S1.x, z: S1.z, radiusM: CREWMATE.STOP_RADIUS_M }];
  const frames = [], said = [];
  let nextIndex = 1, toggled = null;

  // before the EVA: at the airlock in Plan (main, #282), or at the mission table inside (habitat-first flow)
  world.player = habitatFirst ? { ...m.table } : { ...m.exit };
  for (let t = -3; t < 0; t += DT) brain.update(DT, world, { present: true, phase: 'pre', path: m.out, stops, link: true });

  for (let t = 0; t <= FINISH_AT + 8; t += DT) {
    const p = m.track.at(t);
    world.player = { x: p.x, z: p.z };
    if (nextIndex === 1 && dist(p, S1) <= 5) nextIndex = 2;   // the waypoint runner's 5 m arrival
    const storm = t >= STORM_AT, radiation = t >= RADIATION_AT;
    const sense = {
      present: true, phase: t < FINISH_AT ? 'eva' : 'post', missionSec: t, paused: false,
      path: storm ? m.home : m.out, stops,
      nextStop: nextIndex === 1 ? { name: S1.name, rangeM: dist(p, S1) } : null,
      storm, radiation,
      shelter: storm ? { id: 'HAB', name: 'Habitat', type: 'habitat', x: HAB_ENTRY.x, z: HAB_ENTRY.z } : null,
      own: { marginSec: 24000 - t * 1.4 }, rangeM: null, link: true,
    };
    // the pour is done: the sampling hand-over asks EV2 to close the case and take it back (src/engine/sampling.js)
    if (toggled === null && t >= POUR_DONE_AT && !brain.inspect().carrying) toggled = { t, ok: brain.command('toggleCase', world, sense) };
    const out = brain.update(DT, world, sense);
    assertPartnerState(out.state);
    frames.push({ t, player: { ...p }, ev2: { x: out.state.x, z: out.state.z }, state: out.state, mode: brain.inspect().mode, chain: brain.inspect().chain, yielding: brain.inspect().yield });
    said.push(...out.said.map((c) => ({ ...c, t })));
  }
  return { ...m, frames, said, toggled };
}

const between = (frames, a, b) => frames.filter((f) => f.t >= a && f.t <= b);

describe.each([
  ['main and #282: the EVA starts at the airlock', false],
  ['habitat-first flow: the airlock cycle moves the crew outside', true],
])('first mission with EV2, %s', (name, habitatFirst) => {
  const run = runMission({ habitatFirst });

  it('comes out of the airlock beside the player and walks the route 4 to 10 m behind', () => {
    const f0 = run.frames[0];
    expect(dist(f0.ev2, run.exit)).toBeCloseTo(CREWMATE.SIDE_M, 0);
    for (const f of between(run.frames, 15, 50)) {
      const d = dist(f.ev2, f.player);
      expect(d).toBeGreaterThanOrEqual(3.9);
      expect(d).toBeLessThanOrEqual(CREWMATE.FAR_M);
    }
  });

  it('stands beside the player at S1 with the case down, and takes it back after the pour', () => {
    const stop = between(run.frames, 56, POUR_DONE_AT);
    expect(stop.some((f) => f.state.action && f.state.action.name === CASE_CLIP.name)).toBe(true);
    const down = stop.filter((f) => !f.state.carrying);
    expect(down.length * DT).toBeGreaterThan(10);
    for (const f of down) expect(dist(f.ev2, f.player)).toBeLessThanOrEqual(2.2);
    expect(run.toggled.ok).toBe(true);
    expect(between(run.frames, POUR_DONE_AT + 3, STORM_AT).every((f) => f.state.carrying)).toBe(true);
  });

  it('closes in to 3 m in the dust storm and follows the re-planned route home', () => {
    for (const f of between(run.frames, LEAVE_AT + 8, 150)) expect(dist(f.ev2, f.player)).toBeLessThanOrEqual(CREWMATE.STORM_M + 1.5);
    expect(between(run.frames, RADIATION_AT + 5, 150).some((f) => f.mode === 'radiation')).toBe(true);
  });

  it('comes home with the player, into the habitat, never through a wall or a rock', () => {
    for (const f of run.frames) {
      expect(canStand(run.h, f.ev2.x, f.ev2.z)).toBe(true);
      for (const r of run.rocks) expect(dist(f.ev2, r)).toBeGreaterThanOrEqual(r.r + 0.3 - 1e-6);
    }
    const end = run.frames[run.frames.length - 1];
    expect(worldToHab(run.h, end.player.x, end.player.z).x).toBeLessThan(2.2);   // the player is in the cabin
    expect(end.chain).toBeGreaterThanOrEqual(HOME_CHAIN.length - 4);              // EV2 is in the airlock or the cabin
    expect(worldToHab(run.h, end.ev2.x, end.ev2.z).x).toBeLessThan(6.85);
  });

  it('never goes back and forth: no reversal the player did not make first', () => {
    const playerTurns = reversals(run.frames.map((f) => ({ t: f.t, ...f.player })));
    const ev2Turns = reversals(withoutSteps(run.frames.map((f) => ({ t: f.t, ...f.ev2, yielding: f.yielding }))));   // steps aside left out (#377)
    expect(ev2Turns.filter((t) => !playerTurns.some((p) => t >= p && t <= p + 15)).length).toBeLessThanOrEqual(1);
  });

  it('never strays far enough for the separation alert', () => {
    for (const f of run.frames) expect(dist(f.ev2, f.player)).toBeLessThan(20);
  });

  it('says the radio check, the site, the case, the storm and the radiation alert, at most one calm line per 20 s', () => {
    const kinds = run.said.map((c) => c.kind);
    expect(kinds).toEqual(['check', 'site', 'case', 'storm', 'radiation']);
    const at = Object.fromEntries(run.said.map((c) => [c.kind, c.t]));
    expect(at.storm).toBeCloseTo(STORM_AT, 0);
    expect(at.radiation).toBeCloseTo(RADIATION_AT, 0);
    const calm = run.said.filter((c) => !c.urgent);
    for (let i = 1; i < calm.length; i++) expect(calm[i].t - calm[i - 1].t).toBeGreaterThanOrEqual(CREWMATE.CALL_GAP_SEC - 1e-6);
    const site = run.said.find((c) => c.kind === 'site');
    expect(site.params.site).toBe(S1.name);
    expect(site.params.range).toBeLessThanOrEqual(CREWMATE.SITE_CALL_M);
    expect(run.said.find((c) => c.kind === 'radiation').params.shelter).toBe('crewmate.habitat');
  });
});

/** The run as a table, for the pull request: `CREWMATE_TRACE=1 npx vitest run src/sim/crewmate.mission.test.js`. */
if (typeof process !== 'undefined' && process.env.CREWMATE_TRACE) {
  const run = runMission({ habitatFirst: false });
  const rows = run.frames.filter((f, i) => i % Math.round(5 / DT) === 0).map((f) => [f.t.toFixed(0), f.mode, dist(f.ev2, f.player).toFixed(1), f.state.carrying ? 'in hand' : 'down', f.state.gait].join(' | '));
  const flips = run.frames.filter((f, i) => i > 0 && f.state.gait !== run.frames[i - 1].state.gait).map((f) => f.t.toFixed(1) + ' ' + f.state.gait + ' ' + f.mode);
  console.log(['T+s | mode | range m | case | gait', ...rows, '', 'gait changes: ' + flips.join(', '), '', ...run.said.map((c) => `T+${c.t.toFixed(1)} ${c.kind} ${c.key} ${JSON.stringify(c.params)}`)].join('\n'));
}
