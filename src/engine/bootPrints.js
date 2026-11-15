// Boot prints (issue #46): the player and the partner leave prints on the ground at every step, left and right in turn.
// They stay for the whole EVA, so the astronaut's own track shows the way back when visibility drops.
//   - placement: bootPrintRules.js (one step tracker and one ring of prints per walker)
//   - drawing: one instanced mesh for everyone, a dent in the regolith (bootPrints.shaders.js). Slots [0, KEEP_PARTNER)
//     hold the partner's ring, the player's ring follows, so the partner's patrol never pushes out the player's trail.
//   - seated on the triangles the terrain mesh draws (terrain.meshTriH), and placed again on every tier change.
//
//   sys.prints.setTier(tier)   'high' | 'low': how far prints are drawn; re-seats every print on the new mesh
//   sys.prints.rebuild()       re-seat every print after the terrain mesh changes
//   sys.prints.update(dt)      once per frame
//   sys.prints.clear()         a new EVA
import * as THREE from 'three';
import * as SH from './bootPrints.shaders.js';
import { createStepTracker, createPrintStore, seatPrint, KEEP_PLAYER, KEEP_PARTNER } from './bootPrintRules.js';

const DRAW_TO_M = { high: 80, low: 45 };         // prints fade out by this distance
// The quad around one print. The Z-2 sole is 0.15 x 0.34 m (the shader divisors 0.075 and 0.17); the quad is larger so
// the dent's rim at the toe and heel fades out inside it instead of stopping at a straight edge.
const QUAD_W = 0.24, QUAD_L = 0.44;
const LIFT_M = 0.015;
const FLOATS_PER_MATRIX = 16;

export function createBootPrints(ctx) {
  const { scene, U, sys, view, gait } = ctx;
  const { meshTriH } = ctx.terrain;
  const uniforms = {
    uSunDir: U.uSunDir, uFogK: U.uFogK, uDust: U.uDust, uStormSun: U.uStormSun, uDustK: U.uDustK, uDustOff: U.uDustOff,   // uDust: haze and storm dust in the prints (#142)
    uFadeFar: { value: DRAW_TO_M.high },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: SH.PRINT_VERT, fragmentShader: SH.PRINT_FRAG,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,   // result = 2 x print x ground; 0.5 = unchanged
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });

  const walkers = {
    partner: { base: 0, store: createPrintStore(KEEP_PARTNER), tracker: createStepTracker() },
    player: { base: KEEP_PARTNER, store: createPrintStore(KEEP_PLAYER), tracker: createStepTracker() },
  };
  const total = KEEP_PARTNER + KEEP_PLAYER;
  const geometry = new THREE.PlaneGeometry(QUAD_W, QUAD_L);
  geometry.rotateX(-Math.PI / 2);   // lie flat: x across, z along (toe toward -z)
  const aSide = new THREE.InstancedBufferAttribute(new Float32Array(total), 1), aSeed = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
  geometry.setAttribute('aSide', aSide); geometry.setAttribute('aSeed', aSeed);
  const mesh = new THREE.InstancedMesh(geometry, material, total);
  const matrices = mesh.instanceMatrix;
  matrices.array.fill(0);   // an empty slot collapses to a point and draws nothing (three.js starts them as identity)
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh);

  const m = new THREE.Matrix4(), up = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), pos = new THREE.Vector3();
  const seat = { y: 0, ux: 0, uy: 1, uz: 0 };

  // a print lies on the drawn triangles, tilted with the slope, toe pointing the way the walker faced
  function place(w, s) {
    const { x, z, yaw } = w.store, px = x[s], pz = z[s], slot = w.base + s;
    seatPrint(meshTriH, px, pz, yaw[s], QUAD_W / 2, QUAD_L / 2, LIFT_M, seat);
    up.set(seat.ux, seat.uy, seat.uz);
    fwd.set(Math.sin(yaw[s]), 0, -Math.cos(yaw[s]));
    right.crossVectors(fwd, up).normalize(); fwd.crossVectors(up, right).normalize();
    pos.set(px, seat.y, pz);
    m.makeBasis(right, up, fwd.negate()).setPosition(pos);   // local -z = toe = walking direction
    m.toArray(matrices.array, slot * FLOATS_PER_MATRIX);
    return slot;
  }

  function drawCount() {
    const p = walkers.player.store.count;
    return p ? KEEP_PARTNER + p : walkers.partner.store.count;   // empty partner slots in between draw nothing
  }

  // no prints on the habitat's stairs, porch and floors
  const onGround = (x, z) => !(sys.habitat && sys.habitat.root && sys.habitat.zone(x, z));

  let added = 0;
  const emitter = (w) => (x, z, yaw, side) => {
    if (!onGround(x, z)) return;
    const s = w.store.add(x, z, yaw, side);
    if (s < 0) return;   // the walker already left a print here
    const slot = place(w, s);
    aSide.array[slot] = side;
    aSeed.array[slot] = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 * 0.5 + 0.5;
    matrices.addUpdateRange(slot * FLOATS_PER_MATRIX, FLOATS_PER_MATRIX);
    aSide.addUpdateRange(slot, 1); aSeed.addUpdateRange(slot, 1);
    added++;
  };
  const emitPlayer = emitter(walkers.player), emitPartner = emitter(walkers.partner);

  function rebuild() {
    for (const w of [walkers.partner, walkers.player]) for (let s = 0; s < w.store.count; s++) place(w, s);
    matrices.clearUpdateRanges(); matrices.needsUpdate = true;   // every matrix moved: upload the whole buffer once
  }

  return {
    mesh,
    get count() { return walkers.player.store.count + walkers.partner.store.count; },
    /** Prints per walker and memory: the CPU rings and the GPU buffers (one matrix and two floats per slot). */
    stats() {
      return {
        player: walkers.player.store.count, partner: walkers.partner.store.count, drawn: mesh.count,
        cpuBytes: walkers.player.store.bytes + walkers.partner.store.bytes + matrices.array.byteLength + aSide.array.byteLength + aSeed.array.byteLength,
        gpuBytes: matrices.array.byteLength + aSide.array.byteLength + aSeed.array.byteLength,
      };
    },
    /** @param {'high' | 'low'} tier */
    setTier(tier) {
      uniforms.uFadeFar.value = DRAW_TO_M[tier] || DRAW_TO_M.low;
      rebuild();
    },
    rebuild,
    /** @param {number} _dt */
    update(_dt) {
      added = 0;
      // the player, in Walk mode and not in the middle of a crouching sampling clip; Shift is the jog (view.js).
      // The tracker starts from the shared gait phase (#228), so a print lands on the same footfall as a bounce.
      const keys = view.keys || {};
      if (view.mode === 'eye' && !(sys.arms && sys.arms.clip)) walkers.player.tracker.track(view.eye.x, view.eye.z, view.yaw, !!(keys.ShiftLeft || keys.ShiftRight), emitPlayer, ctx.gait.phase);
      else walkers.player.tracker.reset();
      const pr = sys.partner && sys.partner.root;
      // the partner model faces +z at rotation.y = 0, which is yaw = PI in the view.yaw convention; it only walks
      if (pr && pr.visible && !sys.partner.bending) walkers.partner.tracker.track(pr.position.x, pr.position.z, Math.PI - pr.rotation.y, false, emitPartner);
      else walkers.partner.tracker.reset();
      if (added) {
        mesh.count = drawCount();
        matrices.needsUpdate = true; aSide.needsUpdate = true; aSeed.needsUpdate = true;
      }
    },
    clear() {
      for (const w of [walkers.partner, walkers.player]) { w.store.clear(); w.tracker.reset(); }
      matrices.array.fill(0); matrices.clearUpdateRanges(); matrices.needsUpdate = true;
      mesh.count = 0;
    },
    dispose() { scene.remove(mesh); geometry.dispose(); mesh.dispose(); material.dispose(); },
  };
}
