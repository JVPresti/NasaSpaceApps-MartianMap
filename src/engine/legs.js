// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 468-501).
import * as THREE from 'three';
import * as SH from './shaders.js';
import { cloneSkinned } from './skinned.js';
import { clipTime } from './gait.js';

export function createLegs(ctx) {
  const { scene, U, assets, sys, view, gait } = ctx;
  const { meshH } = ctx.terrain;
  const legs = {
    root: null, mixer: null, acts: {}, on: true,
    async init() {
      const gltf = await assets.glb('assets_astronaut/z2_fp_legs.glb');
      this.root = gltf.scene;
      this.root.traverse(o => { if (o.isMesh) { o.frustumCulled = false;
        o.material = new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: sys.partner.map }, tAccent: { value: sys.partner.accent }, uPlayer: sys.arms.uPlayer }, vertexShader: SH.SUIT_VERT, fragmentShader: SH.SUIT_FRAG }); } });
      scene.add(this.root); this.mixer = new THREE.AnimationMixer(this.root);
      gltf.animations.forEach(a => { this.acts[a.name] = this.mixer.clipAction(a); this.acts[a.name].play(); });
      this.acts.walk.setEffectiveWeight(0);
      // the player's own shadow: an invisible copy of the full astronaut that only casts
      this.body = cloneSkinned(sys.partner.gltf.scene); const drop = [];
      this.body.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; }); sys.cast.mark(this.body, true);   // layer 1 only: never drawn by the main camera
      drop.forEach(o => o.parent.remove(o)); scene.add(this.body);
      this.bmixer = new THREE.AnimationMixer(this.body); this.bacts = {};
      sys.partner.gltf.animations.forEach(a => { if (a.name !== 'walk' && a.name !== 'idle') return; this.bacts[a.name] = this.bmixer.clipAction(a); this.bacts[a.name].play(); }); this.bacts.walk.setEffectiveWeight(0);
    },
    update(dt) {   // the clip time comes from the shared gait phase (#228): distance-driven, signed, so the feet match the ground
      if (!this.root) return; this.root.visible = this.on && view.mode === 'eye' && sys.arms.cam.drop > -0.15; if (this.body) this.body.visible = false; if (this.blob) this.blob.visible = false; sys.cast.set(0, false); if (!this.root.visible) return;
      const back = 0.10 + 0.22 * Math.max(0, Math.sin(view.pitch)), bx = view.eye.x - Math.sin(view.yaw) * back, bz = view.eye.z + Math.cos(view.yaw) * back;
      this.root.position.set(bx, sys.habitat.ground(bx, bz), bz); this.root.rotation.y = Math.atan2(Math.sin(view.yaw), -Math.cos(view.yaw));
      const forward = Number.isFinite(view.forwardSpeed) ? view.forwardSpeed : 0;
      const w = this.acts.walk.getEffectiveWeight(), t = Math.abs(forward) > 0.1 ? 1 : 0, nw = w + (t - w) * Math.min(1, dt * 6);
      this.acts.walk.setEffectiveWeight(nw); this.acts.idle.setEffectiveWeight(1 - nw);
      // The walk clip is scrubbed from the gait phase (never from its own mixer clock): walking backward runs it
      // backward, strafing leaves it still, and the feet never glide or walk in place (#228).
      this.acts.walk.timeScale = 0;
      this.acts.walk.time = clipTime(gait);
      this.mixer.update(dt);   // the idle action keeps its own sway; the walk is scrubbed
      if (!this.blob) { this.blob = sys.partner.blob.clone(); this.blob.material = sys.partner.blob.material.clone(); scene.add(this.blob); }
      this.blob.visible = ctx.tier !== 'high'; this.blob.position.set(bx, meshH(bx, bz) + 0.03, bz); this.blob.material.uniforms.opacity.value = 0.9 * U.uBlob.value;
      sys.cast.set(0, true, bx, meshH(bx, bz), bz);
      if (this.body) { this.body.visible = ctx.tier === 'high'; this.body.position.copy(this.root.position); this.body.rotation.y = this.root.rotation.y;
        this.bacts.walk.setEffectiveWeight(nw); this.bacts.idle.setEffectiveWeight(1 - nw); this.bacts.walk.time = this.acts.walk.time; this.bacts.idle.time = this.acts.idle.time; this.bmixer.update(0);
        }
    },
  };
  return legs;
}
