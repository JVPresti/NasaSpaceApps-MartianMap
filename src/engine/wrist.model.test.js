import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { createArms } from './arms.js';
import { SCREEN_CENTRE_Y_M, FINGER_TAP_M, wristPixelToLocal } from './wrist.js';

it('keeps the real GLB fingertip above the selected pixel through the point-to-pinch blend', async () => {
  const bytes = readFileSync(new URL('../../public/marswalk/assets_astronaut/arm_left.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(8, 1.7, 70); camera.rotation.y = 0.8;
  const arms = createArms({ scene: new THREE.Scene(), camera, U: { uLayer: { value: 0 } }, assets: {}, sys: {}, view: { mode: 'eye', pitch: 0 } });
  const g = new THREE.Group(), flip = new THREE.Group();
  flip.rotation.y = Math.PI; flip.scale.x = -1; flip.add(gltf.scene); g.add(flip); camera.add(g);
  const mixer = new THREE.AnimationMixer(gltf.scene), acts = {};
  for (const clip of gltf.animations) { const act = mixer.clipAction(clip).play(); act.setEffectiveWeight(clip.name === 'point' ? 1 : 0); acts[clip.name] = act; }
  arms.R = { g, mixer, acts, pose: 'point' };
  const left = new THREE.Group(), basis = arms.basis(...arms.P.screen.L);
  left.position.copy(basis.pos); left.quaternion.copy(basis.quat); camera.add(left);
  arms.L = { g: left };
  arms.calibrateFinger(); arms.state = 'screen';
  arms.setWristPointer({ x: 484, y: 242, pressed: true });
  const pixel = wristPixelToLocal(484, 242);
  const expected = left.localToWorld(new THREE.Vector3(pixel.x, SCREEN_CENTRE_Y_M + FINGER_TAP_M, pixel.z));
  for (const weight of [0, 0.25, 0.5, 0.75, 1, 0.5, 0]) {
    for (const [name, act] of Object.entries(acts)) act.setEffectiveWeight(name === 'pinch' ? weight : name === 'point' ? 1 - weight : 0);
    mixer.update(0);
    const target = arms.tapTarget(); g.position.copy(target.pos); g.quaternion.copy(target.quat);
    arms.alignFinger();
    g.updateWorldMatrix(true, true);
    const actual = arms.finger.localToWorld(arms.fingerLocal.clone());
    expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
  }
});
