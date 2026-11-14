// Boot prints (issue #46): the player and the partner leave prints on the ground at every step, left and right in turn.
// They stay for the whole EVA, so the astronaut's own track shows the way back when visibility drops.
//   - placement: bootPrintRules.js (one step tracker per walker)
//   - drawing: one instanced mesh for everyone, a dent in the regolith (bootPrints.shaders.js)
//   - bounded: one ring buffer of KEEP prints; past it, the oldest go first. The same on both tiers, so an automatic
//     switch to Low keeps every print; Low only draws them less far.
//
//   sys.prints.setTier(tier)   'high' | 'low': how far prints are drawn
//   sys.prints.update(dt)      once per frame
//   sys.prints.clear()         a new EVA
import * as THREE from 'three';
import * as SH from './bootPrints.shaders.js';
import { createStepTracker } from './bootPrintRules.js';

const KEEP = 5000;                               // about 1.2 km of walking each for player and partner
const DRAW_TO_M = { high: 80, low: 45 };         // prints fade out by this distance
const SOLE_W = 0.15, SOLE_L = 0.34;              // Z-2 boot sole, metres
const LIFT_M = 0.015;

export function createBootPrints(ctx) {
  const { scene, U, sys, view } = ctx;
  const { meshH } = ctx.terrain;
  const uniforms = { uSunDir: U.uSunDir, uFogK: U.uFogK, uDust: U.uDust, uFadeFar: { value: DRAW_TO_M.high } };   // uDust: storm (#142)
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: SH.PRINT_VERT, fragmentShader: SH.PRINT_FRAG,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,   // result = 2 x print x ground; 0.5 = unchanged
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const geo = new THREE.PlaneGeometry(SOLE_W, SOLE_L);
  geo.rotateX(-Math.PI / 2);   // lie flat: x across, z along (toe toward -z)

  let mesh = null, cap = 0, next = 0, count = 0, aSide = null, aSeed = null;
  const walkers = { player: createStepTracker(), partner: createStepTracker() };
  const m = new THREE.Matrix4(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), pos = new THREE.Vector3();

  function build(n) {
    if (mesh) { scene.remove(mesh); mesh.dispose(); }
    cap = n; next = 0; count = 0;
    const g = geo.clone();
    aSide = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); aSeed = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    g.setAttribute('aSide', aSide); g.setAttribute('aSeed', aSeed);
    mesh = new THREE.InstancedMesh(g, material, n);
    mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
  }

  // a print lies on the drawn mesh, tilted with the slope, toe pointing the way the walker went
  function place(p) {
    const { x, z, yaw, side } = p, e = 0.25;
    up.set(meshH(x - e, z) - meshH(x + e, z), 2 * e, meshH(x, z - e) - meshH(x, z + e)).normalize();
    fwd.set(Math.sin(yaw), 0, -Math.cos(yaw));
    right.crossVectors(fwd, up).normalize(); fwd.crossVectors(up, right).normalize();
    pos.set(x, meshH(x, z) + LIFT_M, z);
    m.makeBasis(right, up, fwd.negate()).setPosition(pos);   // local -z = toe = walking direction
    mesh.setMatrixAt(next, m);
    aSide.setX(next, side); aSeed.setX(next, (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 * 0.5 + 0.5);
    next = (next + 1) % cap; count = Math.min(count + 1, cap);
  }

  // no prints on the habitat's stairs, porch and floors
  const onGround = (x, z) => !(sys.habitat && sys.habitat.root && sys.habitat.zone(x, z));

  function feed(tracker, x, z, dt, facingYaw) {
    let added = 0;
    for (const p of tracker.track(x, z, dt, facingYaw)) if (onGround(p.x, p.z)) { place(p); added++; }
    return added;
  }

  return {
    get count() { return count; },
    /** @param {'high' | 'low'} tier */
    setTier(tier) {
      uniforms.uFadeFar.value = DRAW_TO_M[tier] || DRAW_TO_M.low;
      if (!mesh) build(KEEP);
    },
    /** @param {number} dt */
    update(dt) {
      if (!mesh) return;
      let added = 0;
      // the player, in Walk mode and not in the middle of a crouching sampling clip
      if (view.mode === 'eye' && !(sys.arms && sys.arms.clip)) added += feed(walkers.player, view.eye.x, view.eye.z, dt, view.yaw);
      else walkers.player.reset();
      const pr = sys.partner && sys.partner.root;
      // the partner model faces +z at rotation.y = 0, which is yaw = PI in the view.yaw convention
      if (pr && pr.visible && !sys.partner.bending) added += feed(walkers.partner, pr.position.x, pr.position.z, dt, Math.PI - pr.rotation.y);
      else walkers.partner.reset();
      if (added) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true; aSide.needsUpdate = true; aSeed.needsUpdate = true;
      }
    },
    clear() { next = 0; count = 0; if (mesh) mesh.count = 0; walkers.player.reset(); walkers.partner.reset(); },
    dispose() { if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); } geo.dispose(); material.dispose(); },
  };
}
