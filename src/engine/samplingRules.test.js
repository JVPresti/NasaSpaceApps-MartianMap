import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CASE_STAND_M, CHEYAVA_FALLS, GROUND_STAND_M, PHOTO_RANGE_M, ROCK_STAND_M, SAMPLE_REACH_M,
  angleDelta, caseState, classifyTarget, inReach, inputActions, marchGround, pickRock, pourStand, rayCylinder, raySphere, sampleIdFor, standPoint,
} from './samplingRules.js';
import { validate } from '../net/protocol.js';

const asset = (p) => JSON.parse(readFileSync(fileURLToPath(new URL('../../public/marswalk/' + p, import.meta.url)), 'utf8'));
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const forward = (yaw) => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });   // view.yaw convention

describe('reach', () => {
  it('is a horizontal distance from the feet', () => {
    expect(inReach({ x: 0, z: 0 }, { x: 0, y: -1.7, z: -SAMPLE_REACH_M })).toBe(true);
    expect(inReach({ x: 0, z: 0 }, { x: 1.2, z: -1.0 })).toBe(false);   // 1.56 m
  });
  it('needs a look well down at the ground: about 49 degrees from 1.7 m', () => {
    const minPitch = Math.atan2(1.7, SAMPLE_REACH_M) * 180 / Math.PI;
    expect(minPitch).toBeGreaterThan(40);
    expect(minPitch).toBeLessThan(60);
  });
});

describe('stand points match the clip data', () => {
  it('uses the distances of arms.json and props.json', () => {
    const arms = asset('assets_astronaut/arms.json'), props = asset('assets_props/props.json');
    expect(arms.clips.collect_rock.stand).toContain(ROCK_STAND_M.toFixed(2) + ' m');
    expect(arms.clips.collect_ground.slope).toContain(GROUND_STAND_M + ' m ahead');
    expect(props.tool_case.hand_over).toContain(CASE_STAND_M + ' m from the case');
  });
});

describe('marchGround', () => {
  const flat = () => 0;
  it('finds where the line of sight meets flat ground', () => {
    const hit = marchGround({ x: 0, y: 1.7, z: 0 }, norm({ x: 0, y: -1, z: -1 }), flat, PHOTO_RANGE_M);
    expect(hit.point.y).toBeCloseTo(0, 6);
    expect(hit.point.z).toBeCloseTo(-1.7, 6);
    expect(hit.distance).toBeCloseTo(1.7 * Math.SQRT2, 6);
  });
  it('follows a slope', () => {
    const ramp = (x) => x * 0.5;   // rises toward +x
    const hit = marchGround({ x: 0, y: 1.7, z: 0 }, { x: 1, y: 0, z: 0 }, ramp, PHOTO_RANGE_M);
    expect(hit.point.x).toBeCloseTo(3.4, 6);
  });
  it('returns null when the ground is out of range or the ray starts underground', () => {
    expect(marchGround({ x: 0, y: 1.7, z: 0 }, norm({ x: 0, y: -0.1, z: -1 }), flat, PHOTO_RANGE_M)).toBeNull();   // meets it at 17 m
    expect(marchGround({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 1, z: 0 }, flat, PHOTO_RANGE_M)).toBeNull();
    expect(marchGround({ x: 0, y: -1, z: 0 }, { x: 0, y: -1, z: 0 }, flat, PHOTO_RANGE_M)).toBeNull();
  });
});

describe('rocks along the line of sight', () => {
  it('hits a sphere in front and misses one behind or beside', () => {
    const o = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 0, z: -1 };
    expect(raySphere(o, d, { x: 0, y: 0, z: -3 }, 0.5)).toBeCloseTo(2.5, 9);
    expect(raySphere(o, d, { x: 0, y: 0, z: 3 }, 0.5)).toBeNull();
    expect(raySphere(o, d, { x: 1, y: 0, z: -3 }, 0.5)).toBeNull();
    expect(raySphere(o, d, { x: 0, y: 0, z: 0 }, 0.5)).toBeCloseTo(0.5, 9);   // from inside: the far side
  });
  it('hits the side of an upright cylinder (the partner) between its base and top', () => {
    const o = { x: 0, y: 1.7, z: 0 };
    expect(rayCylinder(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -2 }, 0.35, 1.9)).toBeCloseTo(1.65, 9);
    expect(rayCylinder(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 2, z: -2 }, 0.35, 1.9)).toBeNull();   // standing higher: the ray passes under
    expect(rayCylinder(o, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, 0.35, 1.9)).toBeNull();    // straight down
    expect(rayCylinder(o, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -2 }, 0.35, 1.9)).toBeNull();    // behind
  });
  it('picks the nearest rock within range', () => {
    const o = { x: 0, y: 1, z: 0 }, d = { x: 0, y: 0, z: -1 };
    const rocks = [{ x: 0, y: 1, z: -5, r: 0.4, id: 'far' }, { x: 0.1, y: 1, z: -2, r: 0.3, id: 'near' }, { x: 0, y: 1, z: -20, r: 1, id: 'out' }];
    expect(pickRock(o, d, rocks, PHOTO_RANGE_M).rock.id).toBe('near');
    expect(pickRock(o, d, [rocks[2]], PHOTO_RANGE_M)).toBeNull();
  });
});

describe('classifyTarget', () => {
  const feet = { x: 0, z: 0 };
  it('keeps the nearest hit along the line of sight', () => {
    const t = classifyTarget([
      { kind: 'ground', site: null, distance: 2.4, point: { x: 0, y: 0, z: -1.6 } },
      { kind: 'rock', site: CHEYAVA_FALLS, distance: 1.9, point: { x: 0, y: 0.3, z: -1.1 } },
    ], feet);
    expect(t).toMatchObject({ kind: 'rock', site: CHEYAVA_FALLS, inReach: true });
    expect(t.distanceM).toBeCloseTo(1.1, 9);
  });
  it('marks a target out of reach but still in the camera range', () => {
    const t = classifyTarget([{ kind: 'rock', site: CHEYAVA_FALLS, distance: 5, point: { x: 3, y: 0.2, z: -3 } }], feet);
    expect(t.inReach).toBe(false);
  });
  it('hides what is behind the partner or the case', () => {
    const ground = { kind: 'ground', site: null, distance: 2.2, point: { x: 0, y: 0, z: -1.4 } };
    expect(classifyTarget([ground, { kind: 'case', distance: 1.9 }], feet)).toBeNull();
    expect(classifyTarget([ground, { kind: 'partner', distance: 3 }], feet).kind).toBe('ground');
  });
  it('returns null with nothing within the camera range', () => {
    expect(classifyTarget([], feet)).toBeNull();
    expect(classifyTarget([{ kind: 'ground', distance: PHOTO_RANGE_M + 1, point: { x: 0, y: 0, z: -9 } }], feet)).toBeNull();
  });
  it('passes the sphere of a loose rock through', () => {
    const rock = { x: 0, y: 0.2, z: -1, r: 0.3 };
    expect(classifyTarget([{ kind: 'rock', site: null, distance: 1.5, point: { x: 0, y: 0.3, z: -0.8 }, rock }], feet).rock).toBe(rock);
  });
});

describe('standPoint and pourStand', () => {
  it('stands the offset short of the point, facing it', () => {
    const s = standPoint({ x: 0, z: 0 }, { x: 0, z: -2 }, ROCK_STAND_M);
    expect(s.x).toBeCloseTo(0, 9); expect(s.z).toBeCloseTo(-1.3, 9);
    const f = forward(s.yaw); expect(f.x).toBeCloseTo(0, 9); expect(f.z).toBeCloseTo(-1, 9);
    const e = standPoint({ x: 0, z: 0 }, { x: 1, z: 0 }, GROUND_STAND_M);
    expect(forward(e.yaw).x).toBeCloseTo(1, 9);
    expect(e.x).toBeCloseTo(1 - GROUND_STAND_M, 9);
  });
  it('keeps the heading for a point right underfoot', () => {
    expect(standPoint({ x: 2, z: 3 }, { x: 2, z: 3 }, 0.5)).toEqual({ x: 2, z: 3, yaw: null });
  });
  it('puts the case between the player and the partner', () => {
    const s = pourStand({ x: 10, z: 10 }, { x: 10.4, z: 10 }, CASE_STAND_M);
    expect(s.x).toBeCloseTo(10 - CASE_STAND_M, 9); expect(s.z).toBeCloseTo(10, 9);
    expect(forward(s.yaw).x).toBeCloseTo(1, 9);   // facing the case, the partner behind it
    expect(pourStand({ x: 0, z: 0 }, { x: 0, z: 0 }, 0.85, { x: 0, z: 2 }).z).toBeCloseTo(0.85, 9);   // no partner offset: from where the player is
  });
});

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2, 9);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    expect(angleDelta(0, 4 * Math.PI + 0.5)).toBeCloseTo(0.5, 9);
  });
});

describe('caseState', () => {
  const p = { present: true, carrying: true, bending: false, wantCarry: true, requested: false };
  it('follows the hand-over', () => {
    expect(caseState({ ...p, present: false })).toBe('none');
    expect(caseState(p)).toBe('carried');
    expect(caseState({ ...p, requested: true })).toBe('coming');
    expect(caseState({ ...p, bending: true, wantCarry: false })).toBe('setting-down');
    expect(caseState({ ...p, carrying: false })).toBe('down');
    expect(caseState({ ...p, carrying: false, bending: true, wantCarry: true })).toBe('picking-up');
  });
});

describe('inputActions', () => {
  const rock = { kind: 'rock', site: CHEYAVA_FALLS, inReach: true }, far = { ...rock, inReach: false };
  const base = { walk: true, phase: 'idle', target: rock, caseState: 'carried', caseInReach: false };
  it('collects a target within reach when the scoop is free', () => {
    expect(inputActions(base)).toEqual({ click: 'collect', photo: 'photo', stow: null, case: 'call-case' });
    expect(inputActions({ ...base, target: far }).click).toBeNull();
    expect(inputActions({ ...base, target: null })).toMatchObject({ click: null, photo: null });
  });
  it('ignores every input while a clip plays', () => {
    for (const phase of ['collecting', 'stowing', 'pouring']) {
      expect(inputActions({ ...base, phase })).toEqual({ click: null, photo: null, stow: null, case: null });
    }
  });
  it('does not scoop again while the scoop is full; offers stow and the case', () => {
    const holding = { ...base, phase: 'holding' };
    expect(inputActions(holding)).toEqual({ click: null, photo: 'photo', stow: 'stow', case: 'call-case' });
    expect(inputActions({ ...holding, caseState: 'down', caseInReach: true }).case).toBe('pour');
    expect(inputActions({ ...holding, caseState: 'down', caseInReach: false }).case).toBeNull();
    expect(inputActions({ ...holding, caseState: 'coming' }).case).toBeNull();
  });
  it('lets the partner take the case back when it is down and the scoop is free', () => {
    expect(inputActions({ ...base, caseState: 'down' }).case).toBe('pick-up-case');
    expect(inputActions({ ...base, caseState: 'none' }).case).toBeNull();
  });
  it('does nothing outside Walk mode', () => {
    expect(inputActions({ ...base, walk: false })).toEqual({ click: null, photo: null, stow: null, case: null });
  });
});

describe('sampleIdFor (#54)', () => {
  it('names a named rock, a loose rock by its centre and the ground by its 2 m square', () => {
    expect(sampleIdFor({ kind: 'rock', site: CHEYAVA_FALLS, point: { x: 1, z: 2 } })).toBe('site-cheyava-falls');
    expect(sampleIdFor({ kind: 'rock', site: 'Bright Angel', point: { x: 1, z: 2 } })).toBe('site-bright-angel');
    expect(sampleIdFor({ kind: 'rock', site: null, point: { x: 9, z: 9 }, rock: { x: 12.34, z: -5.66 } })).toBe('rock_123_-57');
    expect(sampleIdFor({ kind: 'ground', site: null, point: { x: 3.9, z: -0.1 } })).toBe('soil_1_-1');
    expect(sampleIdFor({ kind: 'ground', site: null, point: { x: 2.1, z: -1.9 } })).toBe('soil_1_-1');
    expect(sampleIdFor(null)).toBe(null);
  });

  it('every id passes the protocol', () => {
    for (const t of [{ kind: 'rock', site: CHEYAVA_FALLS, point: { x: 0, z: 0 } }, { kind: 'rock', rock: { x: -1e4, z: 1e4 }, point: { x: 0, z: 0 } }, { kind: 'ground', point: { x: -1234.5, z: 999.9 } }]) {
      expect(validate({ type: 'smp', sid: sampleIdFor(t) })).not.toBe(null);
    }
  });
});
