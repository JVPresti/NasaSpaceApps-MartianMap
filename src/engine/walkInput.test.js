import { describe, expect, it } from 'vitest';
import { moveAxes, walkStep } from './walkInput.js';

const W = 1.0, DT = 1 / 60, YAW = 0;   // facing north: forward is -z, right is +x
const down = (codes) => (code) => codes.includes(code);

describe('moveAxes', () => {
  it('maps the keys to one axis pair, opposite keys cancelling', () => {
    expect(moveAxes(down(['KeyW']))).toEqual({ dx: 0, dz: -1 });
    expect(moveAxes(down(['KeyS']))).toEqual({ dx: 0, dz: 1 });
    expect(moveAxes(down(['KeyD']))).toEqual({ dx: 1, dz: 0 });
    expect(moveAxes(down(['KeyA']))).toEqual({ dx: -1, dz: 0 });
    expect(moveAxes(down(['KeyW', 'KeyS']))).toEqual({ dx: 0, dz: 0 });
    expect(moveAxes(down(['KeyD', 'KeyA']))).toEqual({ dx: 0, dz: 0 });
    expect(moveAxes(down(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']))).toEqual({ dx: 0, dz: 0 });
  });
});

describe('walkStep', () => {
  const mag = (s) => Math.hypot(s.x, s.z);

  it('moves a single key at exactly the walk speed', () => {
    const s = walkStep(down(['KeyW']), YAW, W, DT);
    expect(s.x).toBeCloseTo(0, 12);
    expect(s.z).toBeCloseTo(-W * DT, 12);
    expect(mag(s)).toBeCloseTo(W * DT, 12);
    expect(s.forward).toBeCloseTo(W, 12);
  });

  it('is never faster on a diagonal than on a single key (#227)', () => {
    const single = mag(walkStep(down(['KeyW']), YAW, W, DT));
    for (const keys of [['KeyW', 'KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD'], ['KeyS', 'KeyA']]) {
      expect(mag(walkStep(down(keys), YAW, W, DT))).toBeCloseTo(single, 12);
    }
  });

  it('keeps every key combination at or below speed * dt for any yaw', () => {
    const combos = [
      ['KeyW'], ['KeyS'], ['KeyD'], ['KeyA'],
      ['KeyW', 'KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD'], ['KeyS', 'KeyA'],
      ['KeyW', 'KeyD', 'KeyA'], ['KeyW', 'KeyS', 'KeyD'], ['KeyS', 'KeyD', 'KeyA'],
      ['ArrowUp', 'ArrowRight'], ['ArrowDown', 'ArrowLeft', 'ArrowRight'],
    ];
    for (let i = 0; i < 24; i++) {
      const yaw = (i / 24) * Math.PI * 2;
      for (const keys of combos) {
        const s = walkStep(down(keys), yaw, W, DT);
        expect(mag(s)).toBeLessThanOrEqual(W * DT + 1e-12);
      }
    }
  });

  it('returns a signed forward component: negative backward, zero strafing', () => {
    expect(walkStep(down(['KeyW']), YAW, W, DT).forward).toBeCloseTo(W, 9);
    expect(walkStep(down(['KeyS']), YAW, W, DT).forward).toBeCloseTo(-W, 9);
    expect(walkStep(down(['KeyD']), YAW, W, DT).forward).toBeCloseTo(0, 9);
    expect(walkStep(down(['KeyA']), YAW, W, DT).forward).toBeCloseTo(0, 9);
    expect(walkStep(down(['KeyW', 'KeyD']), YAW, W, DT).forward).toBeCloseTo(W / Math.SQRT2, 9);
  });

  it('moves backward opposite to forward, and strafes along the right axis', () => {
    const fwd = walkStep(down(['KeyW']), YAW, W, DT), back = walkStep(down(['KeyS']), YAW, W, DT), right = walkStep(down(['KeyD']), YAW, W, DT);
    expect(back.x).toBeCloseTo(-fwd.x, 12);
    expect(back.z).toBeCloseTo(-fwd.z, 12);
    expect(right.x).toBeCloseTo(W * DT, 12);
    expect(right.z).toBeCloseTo(0, 12);
  });

  it('does not move without keys, speed or time', () => {
    expect(walkStep(down([]), YAW, W, DT)).toEqual({ x: 0, z: 0, forward: 0 });
    expect(walkStep(down(['KeyW']), YAW, 0, DT)).toEqual({ x: 0, z: 0, forward: 0 });
    expect(walkStep(down(['KeyW']), YAW, W, 0)).toEqual({ x: 0, z: 0, forward: 0 });
  });

  it('turns with the yaw: facing east, forward is +x', () => {
    const s = walkStep(down(['KeyW']), Math.PI / 2, W, DT);
    expect(s.x).toBeCloseTo(W * DT, 9);
    expect(s.z).toBeCloseTo(0, 9);
  });
});
