// Extra partner suits (#53): one more Z-2 astronaut per extra partner source (partnerSlots.js extras()), in that
// source's colour. The first remote player drives the full partner (partner.js); the others are drawn here with
// the same model, clips and ground height, but without the tool case, the lamp's light on the terrain, the cast
// shadow slot, the hatch and collision. Each keeps a blob shadow and the helmet lamp glow.
import * as THREE from 'three';
import * as SH from './shaders.js';
import { CASE_CLIP } from './partnerSource.js';
import { cloneSkinned } from './skinned.js';

const BEND_EASE_SEC = 0.25;   // as partner.js

export function createExtraPartners(ctx) {
  const { scene, U, sys } = ctx;
  const { meshH } = ctx.terrain;
  const suits = new Map();   // source -> suit

  function build(source) {
    const base = sys.partner;
    const root = cloneSkinned(base.gltf.scene);
    const uPlayer = { value: new THREE.Vector3(...(source.color || [1, 0.32, 0.03])) };
    const materials = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.material = new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: base.map }, tAccent: { value: base.accent }, uPlayer }, vertexShader: SH.SUIT_VERT, fragmentShader: SH.SUIT_FRAG });
      materials.push(o.material);
    });
    scene.add(root);
    const mixer = new THREE.AnimationMixer(root), acts = {};
    for (const a of base.gltf.animations) if (a.name === 'walk' || a.name === 'idle' || a.name === 'walk_stoop') acts[a.name] = mixer.clipAction(a);
    acts.walk.play(); acts.idle.play(); acts.idle.setEffectiveWeight(0); acts.walk_stoop.play(); acts.walk_stoop.setEffectiveWeight(0);
    const bend = mixer.clipAction(base.gltf.animations.find((c) => c.name === CASE_CLIP.name));
    bend.setLoop(THREE.LoopOnce, 1); bend.clampWhenFinished = true;
    const blob = base.blob.clone(); blob.material = base.blob.material.clone(); scene.add(blob);
    const glow = base.glow.clone(); scene.add(glow);
    return { source, root, uPlayer, materials, mixer, acts, bend, blob, glow, nw: 1, stoop: 0, bendW: 0, state: null };
  }

  function dispose(suit) {
    suit.mixer.stopAllAction();
    scene.remove(suit.root, suit.blob, suit.glow);
    for (const m of suit.materials) m.dispose();
    suit.blob.material.dispose();
  }

  function drive(suit, dt, world) {
    const st = suit.source.update(dt, world);
    suit.state = st;
    const { root, blob, glow } = suit;
    if (!st || !st.visible) { root.visible = blob.visible = glow.visible = false; return; }
    root.visible = blob.visible = true;
    if (suit.source.color) suit.uPlayer.value.set(...suit.source.color);
    const { x, z } = st;
    const yT = sys.habitat.root ? sys.habitat.ground(x, z) : meshH(x, z);
    const y = root.position.y + (yT - root.position.y) * (Math.abs(yT - root.position.y) > 1.5 ? 1 : Math.min(1, dt * 10));
    suit.stoop += ((world.duck(x, z) > 0.15 ? 1 : 0) - suit.stoop) * Math.min(1, dt * 5);
    suit.nw += ((st.gait === 'walk' ? 1 : 0) - suit.nw) * Math.min(1, dt * 4);
    if (st.action) {
      if (!suit.bend.isRunning() && !suit.bend.paused) suit.bend.reset().play();
      suit.bend.paused = true;
      suit.bend.time = Math.min(st.action.timeSec, CASE_CLIP.seconds);
    }
    suit.bendW += ((st.action ? 1 : 0) - suit.bendW) * Math.min(1, dt / BEND_EASE_SEC);
    if (!st.action && suit.bendW < 0.005 && (suit.bend.paused || suit.bend.isRunning())) { suit.bend.stop(); suit.bend.paused = false; }
    const nw = suit.nw, bw = suit.bendW;
    suit.bend.setEffectiveWeight(bw);
    suit.acts.walk.setEffectiveWeight(nw * (1 - suit.stoop) * (1 - bw));
    suit.acts.walk_stoop.setEffectiveWeight(nw * suit.stoop * (1 - bw));
    suit.acts.idle.setEffectiveWeight((1 - nw) * (1 - bw));
    root.position.set(x, y, z); root.rotation.y = st.yaw;
    blob.position.set(x, y + 0.03, z); blob.material.uniforms.opacity.value = 0.9 * U.uBlob.value;
    suit.mixer.update(dt);
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    glow.position.set(x + fx * 0.25, y + 1.72, z + fz * 0.25);
    glow.visible = st.lampOn === undefined ? U.uLamp.value.x > 0 : st.lampOn;
  }

  return {
    suits,
    update(dt) {
      if (!sys.partner || !sys.partner.gltf) return;
      const wanted = sys.partner.slots.extras();
      for (const [source, suit] of suits) if (!wanted.includes(source)) { dispose(suit); suits.delete(source); }
      if (!wanted.length) return;
      const world = sys.partner.world();
      for (const source of wanted) {
        if (!suits.has(source)) suits.set(source, build(source));
        drive(suits.get(source), dt, world);
      }
    },
    /** { source, state } of each extra suit, in the slots' order. */
    list() { return sys.partner ? sys.partner.slots.extras().map((source) => ({ source, state: suits.get(source)?.state ?? null })) : []; },
    dispose() { for (const suit of suits.values()) dispose(suit); suits.clear(); },
  };
}
