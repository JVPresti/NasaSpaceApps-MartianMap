import { describe, expect, it } from 'vitest';
import { assertPartnerState, CASE_CLIP, createScriptedPartner, createStaticPartner, FOLLOW_TIMEOUT_SEC, HANDOVER_M, HANDOVER_REACH_M } from './partnerSource.js';
import { CREW, PLAYER_COLORS } from './crew.js';

const DT = 1 / 60;
const world = (player = { x: 30, z: 30 }, habitat = null) => ({ player, habitat, duck: () => 0 });
function run(src, seconds, w = world(), each = () => {}) {
  let s; for (let t = 0; t < seconds; t += DT) { s = src.update(DT, w); assertPartnerState(s); each(s); } return s;
}

describe('crew', () => {
  it('uses the suggested player colours of astronaut.json: EV1 blue, EV2 orange', () => {
    expect(CREW.map((c) => c.id)).toEqual(['EV1', 'EV2']);
    expect(CREW[0].color).toEqual([0.05, 0.25, 0.9]);
    expect(CREW[1].color).toEqual([1, 0.32, 0.03]);
    expect(PLAYER_COLORS).toHaveLength(4);
  });
});

describe('scripted partner: patrol', () => {
  it('starts at A, walks toward B at the walk-cycle speed and returns valid states', () => {
    const p = createScriptedPartner();
    const s0 = p.update(DT, world());
    expect(s0.x).toBeCloseTo(14, 1); expect(s0.z).toBeCloseTo(58, 1);
    const s = run(p, 10);
    const walked = Math.hypot(s.x - 14, s.z - 58);
    expect(walked).toBeCloseTo(10 / 1.2, 0);   // one 1 m stride per 1.2 s
    expect(s.gait).toBe('walk');
    expect(s.speedMs).toBeCloseTo(1 / 1.2, 3);
  });

  it('pauses 3 s at the end of the path, then turns back', () => {
    const p = createScriptedPartner({ A: { x: 0, z: 0 }, B: { x: 0, z: 5 } });   // 5 m: arrives after 6 s
    const atEnd = run(p, 6.5);
    expect(atEnd.gait).toBe('idle');
    expect(atEnd.z).toBeCloseTo(5, 3);
    const back = run(p, 4);
    expect(back.gait).toBe('walk');
    expect(back.z).toBeLessThan(5);
  });

  it('ramps the ground speed in and out with the walk weight (#228)', () => {
    const p = createScriptedPartner();
    const first = p.update(DT, world());
    expect(first.speedMs).toBeLessThan(0.05);   // starts from rest, no full-speed first frame
    const half = run(p, 0.2);
    expect(half.speedMs).toBeLessThan(1 / 1.2);
    const full = run(p, 2);
    expect(full.speedMs).toBeCloseTo(1 / 1.2, 3);
  });
});

describe('scripted partner: case hand-over', () => {
  it('walks to 1.6 m from the player, sets the case down at 0.9 s into the clip, and picks it up again', () => {
    const p = createScriptedPartner(), player = { x: 20, z: 40 }, w = world(player);
    run(p, 1, w);
    expect(p.command('toggleCase', w)).toBe(true);
    let firstAction = null, released = null;
    run(p, 40, w, (s) => {
      if (s.action && !firstAction) firstAction = { ...s, d: Math.hypot(s.x - player.x, s.z - player.z) };
      if (s.action && !s.carrying && released === null) released = s.action.timeSec;
    });
    expect(firstAction.d).toBeCloseTo(1.6, 1);
    expect(firstAction.action.name).toBe(CASE_CLIP.name);
    expect(firstAction.action.carryingAfter).toBe(false);
    expect(released).toBeGreaterThanOrEqual(CASE_CLIP.releaseAt);
    expect(released).toBeLessThan(CASE_CLIP.releaseAt + 0.05);
    const resting = p.update(DT, w);
    expect(resting.carrying).toBe(false);
    expect(resting.action).toBeNull();
    expect(resting.gait).toBe('idle');
    // pick up: bend again, grab at 0.9 s, then walk back to the patrol
    expect(p.command('toggleCase', w)).toBe(true);
    let maxTime = 0;
    const after = run(p, 3, w, (s) => { if (s.action) maxTime = Math.max(maxTime, s.action.timeSec); });
    expect(maxTime).toBeGreaterThan(CASE_CLIP.seconds - 0.05);
    expect(after.carrying).toBe(true);
    expect(after.action).toBeNull();
    expect(after.gait).toBe('walk');
  });

  // #172: the partner used to walk to a point fixed when the case was asked for, past a player who walked up to it.
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const stepToward = (player, to, speed, stopAt) => {   // moves the player toward `to` and stops `stopAt` metres from it
    const d = dist(player, to); if (d <= stopAt) return;
    const st = Math.min(speed * DT, d - stopAt); player.x += (to.x - player.x) / d * st; player.z += (to.z - player.z) / d * st;
  };

  it('stops as soon as a player who walks up during its walk is within reach (#172)', () => {
    const p = createScriptedPartner(), player = { x: 20, z: 40 }, w = world(player);
    const start = run(p, 1, w);
    expect(p.command('toggleCase', w)).toBe(true);
    const d0 = dist(start, player);
    const fixedGoal = { x: player.x + (start.x - player.x) / d0 * HANDOVER_M, z: player.z + (start.z - player.z) / d0 * HANDOVER_M };
    let stopped = null, bend = null, moves = 0, prev = start;
    run(p, 30, w, (s) => {
      const d = dist(s, player);
      if (!stopped && s.gait === 'idle') stopped = { ...s, d };
      if (stopped && dist(s, prev) > 1e-9) moves++;
      if (s.action && !bend) bend = { ...s, d };
      prev = s;
      stepToward(player, s, 1.1, 1.2);   // the player walks to the partner at 1.1 m/s and stops 1.2 m from it
    });
    expect(stopped.d).toBeLessThanOrEqual(HANDOVER_M);   // stopped on reaching the player, not at the old point
    expect(stopped.d).toBeGreaterThan(HANDOVER_M - 0.1);
    expect(dist(stopped, fixedGoal)).toBeGreaterThan(3);
    expect(moves).toBe(0);                               // never walked on, past or around the player
    expect(bend).not.toBeNull();
    expect(bend.d).toBeLessThanOrEqual(HANDOVER_REACH_M);
    const down = p.update(DT, w);
    expect(down.carrying).toBe(false);
    // pick-up: grab, then walk back to the patrol, no longer following the player
    expect(p.command('toggleCase', w)).toBe(true);
    const back = run(p, 8, w);
    expect(back.carrying).toBe(true);
    expect(back.gait).toBe('walk');
    expect(dist(back, player)).toBeGreaterThan(4);
  });

  it('follows a player who walks away and sets the case down HANDOVER_M from where they stop (#172)', () => {
    const p = createScriptedPartner(), player = { x: 20, z: 40 }, w = world(player);
    run(p, 1, w);
    expect(p.command('toggleCase', w)).toBe(true);
    const end = { x: 30, z: 45 };   // the player wanders off sideways for about 10 s, then waits there
    let bend = null;
    run(p, 60, w, (s) => {
      if (s.action && !bend) bend = { ...s };
      stepToward(player, end, 1.1, 0);
    });
    expect(bend).not.toBeNull();
    expect(dist(bend, end)).toBeCloseTo(HANDOVER_M, 1);
  });

  it('does not back away when the player steps inside the hand-over distance (#172)', () => {
    const p = createScriptedPartner(), player = { x: 20, z: 40 }, w = world(player);
    run(p, 1, w);
    expect(p.command('toggleCase', w)).toBe(true);
    const mid = run(p, 4, w);
    expect(mid.gait).toBe('walk');
    // the player jogs right up to it: 1.0 m away
    const d = dist(mid, player); player.x = mid.x + (player.x - mid.x) / d; player.z = mid.z + (player.z - mid.z) / d;
    let bend = null;
    run(p, 5, w, (s) => { if (s.action && !bend) bend = { ...s }; });
    expect(bend).not.toBeNull();
    expect(dist(bend, mid)).toBeLessThan(0.02);   // stopped where it was (one frame of walking at most)
    expect(dist(bend, player)).toBeLessThan(1.05);
  });

  it('ignores a second command while busy', () => {
    const p = createScriptedPartner(), w = world();
    run(p, 0.5, w);
    expect(p.command('toggleCase', w)).toBe(true);
    expect(p.command('toggleCase', w)).toBe(false);
    expect(p.command('dance', w)).toBe(false);
  });
});

describe('scripted partner: turns, the bend hold and the follow limit (#226)', () => {
  it('keeps yaw wrapped and never turns faster than the turn rate while the player circles it', () => {
    const p = createScriptedPartner(), player = { x: 30, z: 30 }, w = world(player);
    run(p, 1, w);
    expect(p.command('toggleCase', w)).toBe(true);
    let angle = 0, prevYaw = null, maxTurn = 0;
    run(p, 120, w, (s) => {
      expect(Math.abs(s.yaw)).toBeLessThanOrEqual(Math.PI + 1e-9);   // wrapped every frame: yaw can never build up
      if (prevYaw !== null) {
        const d = Math.abs(Math.atan2(Math.sin(s.yaw - prevYaw), Math.cos(s.yaw - prevYaw)));   // the wrapped turn
        maxTurn = Math.max(maxTurn, d / DT);
      }
      prevYaw = s.yaw;
      angle += 0.6 * DT;   // the player circles the partner just inside the hand-over reach
      player.x = s.x + Math.sin(angle); player.z = s.z + Math.cos(angle);
    });
    expect(maxTurn).toBeLessThanOrEqual(6 * Math.PI * 1.05);   // the exponential turn peaks at |df| * turn ≤ π * 6 rad/s
  });

  it('stands still briefly after arriving, before the bend starts (#226)', () => {
    const p = createScriptedPartner(), player = { x: 30, z: 30 }, w = world(player);
    run(p, 1, w);
    expect(p.command('toggleCase', w)).toBe(true);
    let idleFor = 0, actionAt = null, idleAt = null;
    for (let t = 0; t < 60; t += DT) {
      const s = p.update(DT, w);
      if (s.action && actionAt === null) actionAt = t;
      if (s.gait === 'idle' && idleAt === null) idleAt = t;
      if (actionAt === null && s.gait === 'idle') idleFor += DT;   // standing time before the bend
    }
    expect(actionAt).not.toBeNull();
    expect(idleAt).not.toBeNull();
    expect(idleFor).toBeGreaterThanOrEqual(0.25);   // at least a quarter second of standing, then the bend eases in
    expect(actionAt - idleAt).toBeGreaterThanOrEqual(0.25);
  });

  it('gives up a follow the player outruns, so the case command works again (#226)', () => {
    const p = createScriptedPartner(), player = { x: 30, z: 30 }, w = world(player);
    run(p, 1, w);
    expect(p.command('toggleCase', w)).toBe(true);
    for (let t = 0; t < FOLLOW_TIMEOUT_SEC + 5; t += DT) {   // the player walks away the whole time, faster than the partner
      p.update(DT, w);
      player.x += 1.0 * DT;
    }
    // the follow ended: no bend ever started, and it walks back to the patrol instead of chasing forever
    let sawAction = false;
    const back = run(p, 120, w, (s) => { if (s.action) sawAction = true; });
    expect(sawAction).toBe(false);
    expect(back.action).toBeNull();
    expect(back.gait).toBe('walk');   // back on the patrol, moving
    // F works again
    const accepted = p.command('toggleCase', w);
    expect(accepted).toBe(true);
  });
});

describe('scripted partner: into the habitat and out', () => {
  it('walks the queue into the habitat, then back out to the patrol', () => {
    const habitat = { x: 40, z: 60, yaw: 0 }, w = world({ x: 0, z: 0 }, habitat), p = createScriptedPartner();
    run(p, 0.5, w);
    expect(p.command('visitHabitat', w)).toBe(true);
    const inside = run(p, 120, w);
    expect(Math.hypot(inside.x - (habitat.x + 1.25), inside.z - (habitat.z + 0.55))).toBeLessThan(0.05);   // last waypoint, main room
    expect(inside.gait).toBe('idle');
    expect(p.command('visitHabitat', w)).toBe(true);
    const out = run(p, 120, w);
    expect(Math.hypot(out.x - inside.x, out.z - inside.z)).toBeGreaterThan(10);   // left the habitat
  });

  it('does nothing without a habitat', () => {
    const p = createScriptedPartner();
    expect(p.command('visitHabitat', world())).toBe(false);
  });
});

describe('contract', () => {
  it('a static source (the shape of a network source) passes the state check', () => {
    const s = createStaticPartner({ x: 5, z: 6, yaw: 1 });
    expect(assertPartnerState(s.update(DT, world()))).toMatchObject({ x: 5, z: 6, yaw: 1, gait: 'idle' });
    s.set({ visible: false });
    expect(s.update(DT, world()).visible).toBe(false);
  });

  it('rejects malformed states', () => {
    expect(() => assertPartnerState({ visible: true, x: NaN, z: 0, yaw: 0, speedMs: 0, gait: 'idle', carrying: true, action: null })).toThrow();
    expect(() => assertPartnerState({ visible: true, x: 0, z: 0, yaw: 0, speedMs: 0, gait: 'run', carrying: true, action: null })).toThrow();
    expect(() => assertPartnerState({ visible: true, x: 0, z: 0, yaw: 0, speedMs: 0, gait: 'idle', carrying: true, action: { name: 'x' } })).toThrow();
  });
});
