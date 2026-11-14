import { describe, expect, it } from 'vitest';
import {
  FINGER_HOVER_M, FINGER_TAP_M, canOpenWrist, clampWristPointer, fingerHover, layerRowPointer, wristIsOpen, wristPixelToLocal, wristRestoreState,
} from './wrist.js';

// The bench's arms.tapTarget() (docs/marswalk-assets/testbench-reference/main.js lines 548-557) is the ground truth
// these numbers come from: the finger rested on the centre of layer row `row`, 350 px from the left edge.
const benchLocal = (row) => ({
  x: ((74 + row * 52 + 20) / 352 - 0.5) * 0.08,
  z: -0.155 - 0.116 * (350 / 512),
});

describe('wrist screen: pixel to glass mapping', () => {
  it('covers the arms.json glass: 512 x 352 px over 0.116 m (z) by 0.08 m (x), centred on [0, 0.0806, -0.213]', () => {
    const topLeft = wristPixelToLocal(0, 0), bottomRight = wristPixelToLocal(512, 352), centre = wristPixelToLocal(256, 176);
    expect(topLeft.z).toBeCloseTo(-0.155, 6);
    expect(bottomRight.z).toBeCloseTo(-0.271, 6);
    expect(topLeft.x).toBeCloseTo(-0.04, 6);
    expect(bottomRight.x).toBeCloseTo(0.04, 6);
    expect(centre.x).toBeCloseTo(0, 6);
    expect(centre.z).toBeCloseTo(-0.213, 6);
  });

  it('reproduces the bench tap target for every layer row', () => {
    for (let row = 0; row < 5; row++) {
      const pointer = layerRowPointer(row), local = wristPixelToLocal(pointer.x, pointer.y), bench = benchLocal(row);
      expect(local.x).toBeCloseTo(bench.x, 9);
      expect(local.z).toBeCloseTo(bench.z, 9);
    }
  });

  it('maps a pointer that is not the layer column, and clamps pixels outside the canvas', () => {
    expect(wristPixelToLocal(120, 300).x).toBeCloseTo((300 / 352 - 0.5) * 0.08, 9);
    expect(wristPixelToLocal(120, 300).z).toBeCloseTo(-0.213 - (120 / 512 - 0.5) * 0.116, 9);
    expect(wristPixelToLocal(-40, 900)).toEqual(wristPixelToLocal(0, 352));
    expect(clampWristPointer({ x: -10, y: 999, pressed: true })).toEqual({ x: 0, y: 352, pressed: true });
    expect(clampWristPointer({})).toEqual({ x: 256, y: 176, pressed: false });
  });
});

describe('wrist screen: finger height', () => {
  it('hovers 14 mm above the glass and pinches down to 1 mm while confirming', () => {
    expect(fingerHover(0)).toBe(FINGER_HOVER_M);
    expect(fingerHover(0.2)).toBe(FINGER_TAP_M);
    expect(FINGER_TAP_M).toBeLessThan(FINGER_HOVER_M);
  });
});

describe('wrist screen: opening', () => {
  const ready = { ready: true, mode: 'walk', clip: null, phase: 'idle' };

  it('opens in Walk once ready, with no clip, while idle or holding a sample', () => {
    expect(canOpenWrist(ready)).toBe(true);
    expect(canOpenWrist({ ...ready, phase: 'holding' })).toBe(true);
  });

  it('refuses before ready, in Plan, while any arm clip plays and in the transient sampling phases', () => {
    expect(canOpenWrist({ ...ready, ready: false })).toBe(false);
    expect(canOpenWrist({ ...ready, mode: 'plan' })).toBe(false);
    expect(canOpenWrist({ ...ready, clip: 'collect_ground' })).toBe(false);
    expect(canOpenWrist({ ...ready, clip: 'stow_sample', phase: 'holding' })).toBe(false);
    for (const phase of ['collecting', 'stowing', 'pouring']) expect(canOpenWrist({ ...ready, phase })).toBe(false);
  });

  it('reads openness from the arm state only', () => {
    expect(wristIsOpen('screen')).toBe(true);
    for (const state of ['down', 'point', 'tool', 'open', 'pinch', undefined]) expect(wristIsOpen(state)).toBe(false);
  });
});

describe('wrist screen: closing', () => {
  it('returns to the tool hold while a sample is in the scoop or a clip owns the arm', () => {
    expect(wristRestoreState({ phase: 'holding', clip: null, previous: 'down' })).toBe('tool');
    expect(wristRestoreState({ phase: 'idle', clip: 'collect_rock', previous: 'point' })).toBe('tool');
  });

  it('returns to the pose the player had before raising it, else down', () => {
    expect(wristRestoreState({ phase: 'idle', clip: null, previous: 'point' })).toBe('point');
    expect(wristRestoreState({ phase: 'idle', clip: null, previous: 'tool' })).toBe('tool');
    expect(wristRestoreState({ phase: 'idle', clip: null, previous: 'down' })).toBe('down');
    expect(wristRestoreState({ phase: 'idle', clip: null, previous: null })).toBe('down');
    expect(wristRestoreState({ phase: 'idle', clip: null, previous: 'screen' })).toBe('down');
  });
});
