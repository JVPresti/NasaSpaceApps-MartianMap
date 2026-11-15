import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createArms } from './arms.js';
import { FINGER_HOVER_M, SCREEN_CENTRE_Y_M, TAP_SECONDS, layerRowPointer, wristPixelToLocal } from './wrist.js';

// Real arms.js geometry, no renderer: the finger solver only needs the arm placements and the screen mapping.
function makeArms(layer = 0) {
  return createArms({
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), U: { uLayer: { value: layer } },
    assets: {}, sys: {}, view: { mode: 'eye', pitch: 0 },
  });
}

const fingertip = (target) => new THREE.Vector3(-0.051, -0.012, -0.571).applyQuaternion(target.quat).add(target.pos);

function glassSurface(arms, x, y) {
  const L = arms.basis(...arms.P.screen.L), local = wristPixelToLocal(x, y);
  return {
    point: new THREE.Vector3(local.x, SCREEN_CENTRE_Y_M, local.z).applyQuaternion(L.quat).add(L.pos),
    normal: new THREE.Vector3(0, 1, 0).applyQuaternion(L.quat),
  };
}

describe('wrist screen: the right index finger on the app pixel', () => {
  it('lands the fingertip on the pixel the app points at, 14 mm above the glass', () => {
    const arms = makeArms();
    arms.state = 'screen';
    arms.setWristPointer({ x: 120, y: 300 });
    const target = arms.tapTarget(), glass = glassSurface(arms, 120, 300);
    expect(target.pose).toBe('point');
    expect(fingertip(target).sub(glass.point).dot(glass.normal)).toBeCloseTo(FINGER_HOVER_M, 9);
    const along = fingertip(target).sub(glass.point);
    expect(along.clone().addScaledVector(glass.normal, -FINGER_HOVER_M).length()).toBeLessThan(1e-9);
  });

  it('rests on the selected layer row of the built-in list until the app sends a pointer', () => {
    const row = 3, arms = makeArms(row), pointer = layerRowPointer(row);
    arms.state = 'screen';
    const glass = glassSurface(arms, pointer.x, pointer.y);
    expect(fingertip(arms.tapTarget()).sub(glass.point).dot(glass.normal)).toBeCloseTo(FINGER_HOVER_M, 9);
  });

  it('clamps a pointer outside the canvas to the glass edge', () => {
    const arms = makeArms();
    arms.state = 'screen';
    expect(arms.setWristPointer({ x: -50, y: 9999 })).toEqual({ x: 0, y: 352, pressed: false });
    const glass = glassSurface(arms, 0, 352);
    expect(fingertip(arms.tapTarget()).sub(glass.point).dot(glass.normal)).toBeCloseTo(FINGER_HOVER_M, 9);
  });

  it('pinches for TAP_SECONDS on each confirm and returns to point', () => {
    const arms = makeArms();
    arms.state = 'screen';
    arms.setWristPointer({ x: 200, y: 150, pressed: true });
    expect(arms.tapTarget().pose).toBe('pinch');
    arms.update(TAP_SECONDS * 0.6);
    expect(arms.tapTarget().pose).toBe('pinch');
    arms.setWristPointer({ x: 202, y: 150, pressed: false });   // a hover does not pinch
    expect(arms.tapTarget().pose).toBe('pinch');
    arms.update(TAP_SECONDS * 0.5);
    expect(arms.tapTarget().pose).toBe('point');
    arms.setWristPointer({ x: 202, y: 150, pressed: true });   // a second Enter confirms again
    expect(arms.tapTarget().pose).toBe('pinch');
    arms.update(TAP_SECONDS + 0.01);
    expect(arms.tapTarget().pose).toBe('point');
  });
});
