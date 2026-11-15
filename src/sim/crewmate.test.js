import { describe, expect, it } from 'vitest';
import { assertPartnerState, CASE_CLIP } from '../engine/partnerSource.js';
import { CREWMATE, createCrewmate, createCrewmatePartner, HOME_CHAIN, makePath, sayMinutes } from './crewmate.js';
import { canStand, densePath, habToWorld, makeHabitat, makeTrack, makeWorld, reversals, worldToHab } from './crewmateFixtures.js';

const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Runs the crewmate against a player track. `sense(t)` gives the sense for each frame; `each(t, state, said)` sees
 * every frame. Returns the last state and every callout.
 */
function run(brain, world, track, seconds, sense, each = () => {}) {
  const said = [];
  let state = null;
  for (let t = 0; t <= seconds; t += DT) {
    const p = track.at(t);
    world.player.x = p.x; world.player.z = p.z;
    const out = brain.update(DT, world, sense(t));
    state = assertPartnerState(out.state);
    said.push(...out.said.map((c) => ({ ...c, t })));
    each(t, state, out.said);
  }
  return { state, said };
}

const eva = (extra = {}) => () => ({ present: true, phase: 'eva', stops: [], link: true, ...extra });

// a 120 m route with one bend, as the planner writes it
const A = { x: 0, z: 0 }, B = { x: 60, z: 0 }, C = { x: 60, z: 60 };
const PATH = densePath([A, B, C]);

describe('makePath', () => {
  it('projects a point on the route and reads the point at an arc length', () => {
    const p = makePath(PATH);
    expect(p.length).toBeCloseTo(120, 6);
    const q = p.project(30, 4);
    expect(q.s).toBeCloseTo(30, 6); expect(q.d).toBeCloseTo(4, 6);
    expect(p.at(90)).toMatchObject({ x: 60, z: 30 });
    expect(makePath([[0, 0]])).toBeNull();
  });
  it('says minutes the way the radio does', () => {
    expect(sayMinutes(40 * 60)).toBe('40 min');
    expect(sayMinutes(412 * 60)).toBe('6 h 52 min');
  });
});

describe('crewmate: buddy walk', () => {
  it('walks the route 4 to 10 m behind a walking player, on the route', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: B, speed: 1 }, { to: C, speed: 1 }]);
    run(brain, world, track, 115, eva({ path: PATH }), (t, s) => {
      if (t < 20) return;   // it sets off once the player is START_M (10 m) out, then closes to FOLLOW_M
      const d = dist(s, world.player);
      expect(d).toBeGreaterThanOrEqual(CREWMATE.STOP_M - 2);
      expect(d).toBeLessThanOrEqual(CREWMATE.START_M + 0.5);
      expect(makePath(PATH).project(s.x, s.z).d).toBeLessThan(1);      // on the route, not cutting the corner
      expect(makePath(PATH).project(s.x, s.z).s).toBeLessThan(makePath(PATH).project(world.player.x, world.player.z).s);   // behind
    });
  });

  it('catches up at a brisk walk when it falls behind', () => {
    // the player runs ahead at 2.2 m/s for 20 s, faster than EV2's brisk walk, then walks on at 1.0 m/s
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 44, z: 0 }, speed: 2.2 }, { to: B, speed: 1 }, { to: C, speed: 1 }]);
    let fastest = 0, fellBehind = 0;
    const { state } = run(brain, world, track, 75, eva({ path: PATH }), (t, s) => {
      fastest = Math.max(fastest, s.speedMs);
      fellBehind = Math.max(fellBehind, dist(s, world.player));
    });
    expect(fellBehind).toBeGreaterThan(CREWMATE.FAR_M);
    expect(fastest).toBeGreaterThan(1.4);
    expect(fastest).toBeLessThanOrEqual(CREWMATE.BRISK_MS + 1e-6);
    expect(dist(state, world.player)).toBeLessThanOrEqual(CREWMATE.FAR_M);
  });

  it('waits idle, facing the player, when they stop', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 40, z: 0 }, speed: 1 }, { waitSec: 30 }]);
    const { state } = run(brain, world, track, 60, eva({ path: PATH }));
    expect(state.gait).toBe('idle');
    const face = Math.atan2(world.player.x - state.x, world.player.z - state.z);
    expect(Math.abs(Math.atan2(Math.sin(face - state.yaw), Math.cos(face - state.yaw)))).toBeLessThan(0.1);
    expect(dist(state, world.player)).toBeLessThanOrEqual(CREWMATE.FAR_M);
    expect(dist(state, world.player)).toBeGreaterThanOrEqual(3);
  });

  it('goes round a rock dead ahead on the route without stalling or turning back', () => {
    const rock = { x: 30, z: 0, r: 0.8 };
    const brain = createCrewmate(), world = makeWorld({ rocks: [rock] });
    const track = makeTrack(A, [{ to: B, speed: 1 }, { to: C, speed: 1 }]);
    const frames = [];
    let idleWhileFollowing = 0;
    run(brain, world, track, 110, eva({ path: PATH }), (t, s) => {
      frames.push({ t, x: s.x, z: s.z });
      expect(dist(s, rock)).toBeGreaterThanOrEqual(rock.r + 0.3 - 1e-6);
      if (t > 15 && s.x > 26 && s.x < 34 && s.gait === 'idle') idleWhileFollowing += DT;
    });
    expect(frames.some((f) => f.x > 32)).toBe(true);
    expect(idleWhileFollowing).toBeLessThan(0.3);
    expect(reversals(frames)).toEqual([]);
  });

  it('never walks through a rock on the route: it goes around', () => {
    const rock = { x: 30, z: 0, r: 0.8 };
    const brain = createCrewmate(), world = makeWorld({ rocks: [rock] });
    const track = makeTrack(A, [{ to: { x: 26, z: 3 }, speed: 1 }, { to: { x: 34, z: 3 }, speed: 1 }, { to: B, speed: 1 }, { to: C, speed: 1 }]);
    let passed = false;
    run(brain, world, track, 110, eva({ path: PATH }), (t, s) => {
      expect(dist(s, rock)).toBeGreaterThanOrEqual(rock.r + 0.3 - 1e-6);
      if (s.x > 32) passed = true;
    });
    expect(passed).toBe(true);
  });

  it('never steps closer than 0.9 m to the player, even when the player walks back into it', () => {
    // the player's own push-out (view.js) keeps the player off EV2; EV2's step must never close the gap itself
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 30, z: 0 }, speed: 1 }, { waitSec: 3 }, { to: A, speed: 1.5 }]);
    let prev = null;
    run(brain, world, track, 60, eva({ path: PATH }), (t, s) => {
      if (prev && Math.hypot(s.x - prev.x, s.z - prev.z) > 1e-9) expect(dist(s, world.player)).toBeGreaterThanOrEqual(0.9 - 1e-6);
      prev = { x: s.x, z: s.z };
    });
  });

  it('stays in range of a jogging player, so the separation alert stays off', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: B, speed: 1.5 }, { to: C, speed: 1.5 }]);
    run(brain, world, track, 80, eva({ path: PATH }), (t, s) => { if (t > 5) expect(dist(s, world.player)).toBeLessThan(15); });
  });

  it('falls behind only when the player really runs off, faster than a jog', () => {
    const brain = createCrewmate(), world = makeWorld();
    const far = { x: 300, z: 0 };
    const track = makeTrack(A, [{ to: far, speed: 3 }]);
    const { state } = run(brain, world, track, 60, eva({ path: densePath([A, far]) }));
    expect(dist(state, world.player)).toBeGreaterThan(80);
  });

  it('follows the player straight when they leave the route', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 20, z: 0 }, speed: 1 }, { to: { x: 20, z: -40 }, speed: 1 }]);
    const { state } = run(brain, world, track, 62, eva({ path: PATH }));
    expect(dist(state, world.player)).toBeLessThanOrEqual(CREWMATE.START_M + 0.5);
    expect(state.z).toBeLessThan(-25);
  });

  it('is hidden with a crew of one', () => {
    const brain = createCrewmate(), world = makeWorld();
    const { state } = run(brain, world, makeTrack(A, [{ waitSec: 2 }]), 1, eva({ present: false }));
    expect(state.visible).toBe(false);
  });
});

describe('crewmate: the EVA flow', () => {
  const h = makeHabitat({ x: 0, z: 0 }, { x: 60, z: 0 });
  const exit = habToWorld(h, 10.6, 0);
  const cabin = habToWorld(h, -1.6, -1.2);

  it('stands beside the player at the airlock before the EVA, and again after the engine moves the crew there', () => {
    const brain = createCrewmate(), world = makeWorld({ habitat: h });
    const table = habToWorld(h, 1.75, 0);
    world.player = { ...table };
    brain.update(DT, world, { present: true, phase: 'pre' });
    world.player = { ...exit };   // the airlock cycle moved the player outside (habitat-first flow)
    const { state } = brain.update(DT, world, { present: true, phase: 'pre' });
    expect(dist(state, exit)).toBeCloseTo(CREWMATE.SIDE_M, 1);
    expect(canStand(h, state.x, state.z)).toBe(true);
    expect(worldToHab(h, state.x, state.z).x).toBeGreaterThan(9.95);   // outside, not in the habitat
  });

  it('comes home with the player: up the steps behind them and into the cabin, never through a wall', () => {
    const brain = createCrewmate(), world = makeWorld({ habitat: h });
    const path = densePath([{ x: 60, z: 0 }, exit]);
    const steps = [[9.9, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.6, -1.2], [0, -1.8], [-1.6, -1.2]];
    const legs = [{ to: exit, speed: 1 }, ...steps.map(([x, v]) => ({ to: habToWorld(h, x, v), speed: 0.8 })), { waitSec: 30 }];
    const track = makeTrack({ x: 60, z: 0 }, legs);
    let maxDepth = 99;
    const { state } = run(brain, world, track, track.endSec, eva({ path }), (t, s) => {
      expect(canStand(h, s.x, s.z)).toBe(true);
      expect(dist(s, world.player)).toBeGreaterThanOrEqual(0.9 - 1e-6);
      maxDepth = Math.min(maxDepth, worldToHab(h, s.x, s.z).x);
    });
    expect(dist(world.player, cabin)).toBeLessThan(0.01);
    expect(brain.inspect().chain).toBe(HOME_CHAIN.length - 1);
    expect(maxDepth).toBeLessThan(0);   // it reached the far side of the cabin table
    expect(state.gait).toBe('idle');
  });

  it('walks back out behind the player and steps aside from the stairs', () => {
    const brain = createCrewmate(), world = makeWorld({ habitat: h });
    const inside = [[9.9, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.6, -1.2], [0, -1.8], [-1.6, -1.2]];
    const legs = [{ to: exit, speed: 1 }, ...inside.map(([x, v]) => ({ to: habToWorld(h, x, v), speed: 0.8 })), { waitSec: 25 },
      ...inside.slice().reverse().slice(1).map(([x, v]) => ({ to: habToWorld(h, x, v), speed: 0.8 })), { to: exit, speed: 0.8 }, { to: habToWorld(h, 16, 0), speed: 1 }, { waitSec: 20 }];
    const track = makeTrack({ x: 40, z: 0 }, legs);
    const { state } = run(brain, world, track, track.endSec, eva({ path: densePath([{ x: 40, z: 0 }, exit]) }), (t, s) => {
      expect(canStand(h, s.x, s.z)).toBe(true);
    });
    expect(brain.inspect().chain).toBe(-1);
    expect(worldToHab(h, state.x, state.z).x).toBeGreaterThan(9.95);
  });
});

describe('crewmate: science stop', () => {
  const stop = { id: 'bright-angel', name: 'Bright Angel', x: 40, z: 0, radiusM: 5 };
  const sense = (extra) => eva({ path: PATH, stops: [stop], ...extra });

  it('takes position beside the player, sets the case down, and picks it up when the player leaves', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 39, z: 0 }, speed: 1 }, { waitSec: 25 }, { to: B, speed: 1 }, { to: C, speed: 1 }]);
    const seen = { down: null, up: null, besideAtDown: null, clip: false };
    run(brain, world, track, 100, sense(), (t, s) => {
      if (s.action && s.action.name === CASE_CLIP.name) seen.clip = true;
      if (!s.carrying && seen.down === null) { seen.down = t; seen.besideAtDown = dist(s, world.player); }
      if (seen.down !== null && s.carrying && seen.up === null) seen.up = t;
    });
    expect(seen.clip).toBe(true);
    expect(seen.down).toBeGreaterThan(39);
    expect(seen.down).toBeLessThan(39 + 12);
    expect(seen.besideAtDown).toBeLessThanOrEqual(1.8);
    expect(seen.up).toBeGreaterThan(39 + 25);   // picked up only after the player walked off
    expect(brain.inspect().carrying).toBe(true);
  });

  it('picks the case up at once when the sampling hand-over asks (after the pour), and does not set it down again', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 39, z: 0 }, speed: 1 }, { waitSec: 60 }]);
    run(brain, world, track, 55, sense());
    expect(brain.inspect().carrying).toBe(false);
    expect(brain.command('toggleCase', world, sense()())).toBe(true);
    const later = run(brain, world, { at: () => ({ x: 39, z: 0 }) }, 20, sense());
    expect(later.state.carrying).toBe(true);
    expect(brain.inspect().done).toContain('bright-angel');
  });

  it('brings the case to the player on F (the hand-over) away from a stop', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 20, z: 0 }, speed: 1 }, { waitSec: 40 }]);
    run(brain, world, track, 30, eva({ path: PATH }));
    expect(brain.command('toggleCase', world, eva({ path: PATH })())).toBe(true);
    const { state } = run(brain, world, { at: () => ({ x: 20, z: 0 }) }, 20, eva({ path: PATH }));
    expect(state.carrying).toBe(false);
    expect(dist(state, world.player)).toBeLessThanOrEqual(2.0);   // the case lands within CASE_REACH_M (2 m) of the player
  });
});

describe('crewmate: events', () => {
  it('dust storm: closes in to 3 m and follows the re-planned route', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: B, speed: 1 }, { to: C, speed: 1 }]);
    const gaps = [];
    run(brain, world, track, 115, eva({ path: PATH, storm: true }), (t, s) => {
      if (t > 15 && t < 110) { gaps.push(dist(s, world.player)); expect(gaps[gaps.length - 1]).toBeLessThanOrEqual(CREWMATE.STORM_START_M + 0.5); }
    });
    gaps.sort((a, b) => a - b);
    expect(gaps[Math.floor(gaps.length / 2)]).toBeCloseTo(CREWMATE.STORM_M, 0);   // the median gap is 3 m
  });

  it('radiation: heads for the shelter the sim picked, ahead of the player', () => {
    const brain = createCrewmate(), world = makeWorld();
    const shelter = { id: 'SP1', name: 'SP1', type: 'natural', x: 60, z: 60 };
    const track = makeTrack(A, [{ to: B, speed: 1 }, { to: C, speed: 1 }]);
    let leadSeen = false;
    const { said } = run(brain, world, track, 110, eva({ path: PATH, radiation: true, shelter }), (t, s) => {
      const p = makePath(PATH);
      if (t > 25 && p.project(s.x, s.z).s > p.project(world.player.x, world.player.z).s + 2) leadSeen = true;
      if (t > 25) expect(dist(s, world.player)).toBeLessThanOrEqual(CREWMATE.FAR_M + 0.5);
    });
    expect(leadSeen).toBe(true);
    expect(said.find((c) => c.kind === 'radiation').params.shelter).toBe('SP1');
  });

  it('low margin on its own suit: says so with the number and turns for home', () => {
    const h = makeHabitat({ x: 0, z: 0 }, { x: 60, z: 0 });
    const foot = habToWorld(h, 10.6, 0);
    const path = densePath([foot, { x: 60, z: 0 }]);
    const brain = createCrewmate(), world = makeWorld({ habitat: h });
    const track = makeTrack(foot, [{ to: { x: 60, z: 0 }, speed: 1 }, { waitSec: 60 }]);
    let margin = 3000;
    const sense = () => ({ present: true, phase: 'eva', stops: [], link: true, path, own: { marginSec: margin } });
    run(brain, world, track, 70, sense);
    margin = 840;
    const before = dist(brain.inspect(), foot);
    const { said, state } = run(brain, world, { at: () => ({ x: 60, z: 0 }) }, 20, sense);
    const low = said.find((c) => c.kind === 'low');
    expect(low).toMatchObject({ key: 'crewmate.say.low', urgent: true, params: { margin: '14 min' }, sources: { margin: 'crew.0.marginSec' } });
    expect(dist(brain.inspect(), foot)).toBeLessThan(before - 2);   // turned for home, ahead of the player ...
    expect(dist(state, world.player)).toBeLessThanOrEqual(CREWMATE.FAR_M);   // ... and waits for them there
    expect(brain.inspect().lowOwn).toBe(true);
  });
});

describe('crewmate: callouts', () => {
  it('says at most one line every 20 s, except urgent ones, each number with its source path', () => {
    const brain = createCrewmate({ slopeAt: (x) => (x > 30 && x < 36 ? 18 : 4) });
    const world = makeWorld();
    const track = makeTrack(A, [{ to: B, speed: 1 }, { waitSec: 20 }, { to: C, speed: 1 }]);
    let storm = false;
    const { said } = run(brain, world, track, 140, (t) => {
      storm = t > 90;
      return { present: true, phase: 'eva', path: PATH, stops: [], link: true, storm, own: { marginSec: 24000 }, rangeM: 8.6 };
    });
    const calm = said.filter((c) => !c.urgent);
    for (let i = 1; i < calm.length; i++) expect(calm[i].t - calm[i - 1].t).toBeGreaterThanOrEqual(CREWMATE.CALL_GAP_SEC - 1e-6);
    const kinds = said.map((c) => c.kind);
    expect(kinds).toContain('check');
    expect(kinds).toContain('slope');
    expect(kinds).toContain('storm');
    const slope = said.find((c) => c.kind === 'slope');
    expect(slope.params).toEqual({ deg: 18, side: expect.stringMatching(/^crewmate\.side\.(left|right)$/) });
    expect(slope.sources).toEqual({ deg: 'crewmate.slopeAheadDeg' });
    expect(said.find((c) => c.kind === 'check').params.margin).toBe('6 h 40 min');
    const wait = said.find((c) => c.kind === 'wait');
    if (wait) expect(wait).toMatchObject({ params: { range: 9 }, sources: { range: 'crew.0.rangeM' } });
    expect(said.filter((c) => c.kind === 'storm')).toHaveLength(1);
  });

  it('takes the side with the gentler slope on a steep stretch', () => {
    // slope rises to the south (+z) of the east-going route: the gentler side is north, the walker's left
    const brain = createCrewmate({ slopeAt: (x, z) => (x > 30 && x < 40 ? 18 + z : 3) });
    const world = makeWorld();
    const track = makeTrack(A, [{ to: B, speed: 1 }]);
    let minZ = 0;
    const { said } = run(brain, world, track, 60, eva({ path: PATH }), (t, s) => { if (s.x > 31 && s.x < 39) minZ = Math.min(minZ, s.z); });
    expect(said.find((c) => c.kind === 'slope').params.side).toBe('crewmate.side.left');
    expect(minZ).toBeLessThan(-1);   // north of the line
  });

  it('says "waiting" with the range from the store when the player stops a way off', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 30, z: 0 }, speed: 1 }, { waitSec: 30 }]);
    const { said } = run(brain, world, track, 60, eva({ path: PATH, rangeM: 9.2 }));
    const wait = said.find((c) => c.kind === 'wait');
    expect(wait).toMatchObject({ key: 'crewmate.say.wait', params: { range: 9 }, sources: { range: 'crew.0.rangeM' } });
  });

  it('points out the sample site once, with the range to the next waypoint', () => {
    const brain = createCrewmate(), world = makeWorld();
    const track = makeTrack(A, [{ to: { x: 39, z: 0 }, speed: 1 }]);
    const { said } = run(brain, world, track, 45, () => ({
      present: true, phase: 'eva', path: PATH, link: true, stops: [],
      nextStop: { name: 'Cheyava Falls', rangeM: 40 - world.player.x },
    }));
    const site = said.filter((c) => c.kind === 'site');
    expect(site).toHaveLength(1);
    expect(site[0]).toMatchObject({ key: 'crewmate.say.site', params: { site: 'Cheyava Falls' }, sources: { range: 'navigation.waypointRangeM' } });
    expect(site[0].params.range).toBeLessThanOrEqual(CREWMATE.SITE_CALL_M);
  });

  it('says nothing while the radio has no line of sight, and the urgent line once it is back', () => {
    const brain = createCrewmate(), world = makeWorld();
    let link = false;
    const sense = () => ({ present: true, phase: 'eva', path: PATH, stops: [], link, storm: true });
    const first = run(brain, world, makeTrack(A, [{ to: B, speed: 1 }]), 10, sense);
    expect(first.said).toHaveLength(0);
    link = true;
    const second = run(brain, world, makeTrack({ x: 10, z: 0 }, [{ to: B, speed: 1 }]), 2, sense);
    expect(second.said.map((c) => c.kind)).toEqual(['storm']);
  });
});

describe('createCrewmatePartner', () => {
  it('is a partner source: valid states, callouts to onCallout, toggleCase as a command', () => {
    const lines = [];
    const src = createCrewmatePartner({ sense: () => ({ present: true, phase: 'eva', path: PATH, stops: [], link: true, storm: true }), onCallout: (c) => lines.push(c) });
    expect(src.id).toBe('EV2');
    const world = makeWorld();
    for (let i = 0; i < 30; i++) assertPartnerState(src.update(DT, world));
    expect(lines.map((c) => c.kind)).toEqual(['storm']);
    expect(src.command('visitHabitat', world)).toBe(false);
    expect(src.command('toggleCase', world)).toBe(false);   // no hand-over during the storm
  });
});
