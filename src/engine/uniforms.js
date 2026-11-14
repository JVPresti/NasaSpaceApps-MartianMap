// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 38-45).
import * as THREE from 'three';

// shared uniforms (same objects referenced by every material)
export function createUniforms() {
  const v3 = () => ({ value: new THREE.Vector3() }), f1 = (v = 0) => ({ value: v });
  return {
  uSunDir: v3(), uSunColor: v3(), uAmbSky: v3(), uAmbGround: v3(), uSkyZenith: v3(), uSkyHorizon: v3(), uHaloColor: v3(), uInscatter: v3(),
  uHaloPower: f1(8), uHaloStrength: f1(0.2), uSkyIntensity: f1(1), uGradEnd: f1(0.6), uFogK: f1(1e-4),
  // storm dust (dust.js, #27): uDust 0..1, uDustK extinction per metre at uDust 1, uDustOff the drift of the dust curtains (m)
  uDust: f1(0), uDustK: f1(0.004), uDustOff: { value: new THREE.Vector2() },
  uSuitDust: f1(0.6), uSize: { value: new THREE.Vector2(1, 1) }, uRingSize: f1(12000), tShadow: { value: null }, tRing: { value: null },
  uFadeStart: f1(35), uFadeEnd: f1(110), uLayer: f1(0), uRelief: f1(220), uBlob: f1(0.5), uLamp: v3(), uCamDir: v3(), uLampCone: { value: new THREE.Vector2(0.93, 0.74) }, uLampRange: { value: new THREE.Vector2(4, 30) }, uInterior: f1(1.0), uTime: f1(0), uHabInv: { value: new THREE.Matrix4() }, uHabP0: { value: new THREE.Vector3(0, -1e5, 0) }, uHabP1: { value: new THREE.Vector3(1, -1e5, 0) }, uHabGlow: v3(), tVol: { value: null }, uLamp2Pos: { value: new THREE.Vector3(0, 1e6, 0) }, uLamp2Dir: { value: new THREE.Vector3(0, -1, 0) }, tCast: { value: null }, uCastC: { value: [new THREE.Vector3(0, -1e5, 0), new THREE.Vector3(0, -1e5, 0), new THREE.Vector3(0, -1e5, 0)] }, uCastS: { value: [1.3, 1.3, 8.0] }, uCastR: v3(), uCastU: v3(), uCastOn: f1(0), uRockR: v3(), uStars: f1(0), uSunDisc: f1(1), uSunCos: f1(0.9999),
  };
}
