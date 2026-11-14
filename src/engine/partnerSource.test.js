import { describe, expect, it } from 'vitest';
import { assertPartnerState, CASE_CLIP, createScriptedPartner, createStaticPartner } from './partnerSource.js';
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

  it('ignores a second command while busy', () => {
    const p = createScriptedPartner(), w = world();
    run(p, 0.5, w);
    expect(p.command('toggleCase', w)).toBe(true);
    expect(p.command('toggleCase', w)).toBe(false);
    expect(p.command('dance', w)).toBe(false);
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
