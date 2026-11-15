// Partner astronaut renderer (NASA Z-2, skinned, animated). Ported from docs/marswalk-assets/testbench-reference/main.js
// (lines 388-464). Where the partner goes and what it does comes only from a partner source (src/engine/partnerSource.js,
// docs/PARTNER.md): the scripted partner by default, a network-driven one later (#53). This file only draws the state.
import * as THREE from 'three';
import * as SH from './shaders.js';
import { CASE_CLIP } from './partnerSource.js';

export function createPartner(ctx) {
  const { scene, U, assets, sys, view } = ctx;
  const { meshH } = ctx.terrain;

  // what a source sees of the world: the player, the habitat and where it makes a walker stoop
  const world = {
    player: { x: 0, z: 0 },
    habitat: null,
    duck: (x, z) => (sys.habitat.root ? sys.habitat.duck(x, z) : 0),
  };
  function refreshWorld() {
    world.player.x = view.eye.x; world.player.z = view.eye.z;
    const h = sys.habitat;
    world.habitat = h.root ? { x: h.pos.x, z: h.pos.z, yaw: h.root.rotation.y } : null;
    return world;
  }

  const partner = {
    source: null, state: null,
    // read by props (case in hand, lid), habitat (hatch opens for a walker), legs (shared model) and view (collision)
    root: null, carrying: true, bending: false, wantCarry: true, blob: null, gltf: null, map: null, accent: null,
    mixer: null, acts: {}, bend: null, glow: null, stoop: 0, nw: 1,
    uPlayer: { value: new THREE.Vector3(1, 0.32, 0.03) },

    /** @param {object | null} source a partner source; null hides the partner */
    setSource(source) {
      this.source = source;
      if (source && source.color) this.uPlayer.value.set(...source.color);
    },
    /** Forwards a scripted command ('toggleCase', 'visitHabitat') to the source, if it supports commands. */
    command(name) {
      return !!(this.source && typeof this.source.command === 'function' && this.source.command(name, refreshWorld()));
    },

    async init() {
      const gltf = await assets.glb('assets_astronaut/z2_astronaut.glb');
      const accent = await assets.texAt('assets_astronaut/z2_accent_mask.png'); accent.flipY = false;
      this.root = gltf.scene;
      this.root.traverse(o => { if (o.isMesh) { const map = o.material.map; o.frustumCulled = false; this.map = map; this.accent = accent;
        o.material = new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: map }, tAccent: { value: accent }, uPlayer: this.uPlayer }, vertexShader: SH.SUIT_VERT, fragmentShader: SH.SUIT_FRAG }); } });
      this.gltf = gltf; sys.cast.mark(this.root, false);
      scene.add(this.root); this.mixer = new THREE.AnimationMixer(this.root);
      gltf.animations.forEach(a => { if (a.name === 'walk' || a.name === 'idle' || a.name === 'walk_stoop') this.acts[a.name] = this.mixer.clipAction(a); });
      this.acts.walk.play(); this.acts.idle.play(); this.acts.idle.setEffectiveWeight(0); this.acts.walk_stoop.play(); this.acts.walk_stoop.setEffectiveWeight(0);   // walk and walk_stoop run in step (same 1.2 s loop) so they can cross-fade
      // the case clip is scrubbed to the time the source reports, so it is played paused
      const bend = gltf.animations.find(c => c.name === CASE_CLIP.name); this.bend = this.mixer.clipAction(bend); this.bend.setLoop(THREE.LoopOnce, 1); this.bend.clampWhenFinished = true;
      const q = new THREE.CircleGeometry(0.8, 24); q.rotateX(-Math.PI / 2);
      this.blob = new THREE.Mesh(q, new THREE.ShaderMaterial({ uniforms: { opacity: { value: 0.4 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'uniform float opacity; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; gl_FragColor = vec4(0.03,0.012,0.006,(1.0-smoothstep(0.1,1.0,r))*opacity); }' })); scene.add(this.blob);
      const gc = document.createElement('canvas'); gc.width = gc.height = 64; const g2 = gc.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,246,225,1)'); gr.addColorStop(0.25, 'rgba(255,240,210,.55)'); gr.addColorStop(1, 'rgba(255,235,200,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
      this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); this.glow.scale.setScalar(0.45); scene.add(this.glow);
    },

    update(dt) {
      if (!this.root) return;
      const st = this.source ? this.source.update(dt, refreshWorld()) : null;
      this.state = st;
      if (!st || !st.visible || this.parked) {   // parked: inside the habitat before the EVA, out of sight (habitat-first flow)
        this.root.visible = this.blob.visible = false; this.glow.visible = false;
        sys.cast.set(1, false); U.uLamp2Pos.value.set(0, 1e6, 0); return;
      }
      this.root.visible = this.blob.visible = true;
      const { x, z } = st;
      const yT = sys.habitat.root ? sys.habitat.ground(x, z) : meshH(x, z), y = this.root.position.y + (yT - this.root.position.y) * (Math.abs(yT - this.root.position.y) > 1.5 ? 1 : Math.min(1, dt * 10));   // habitat floor, steps and sills
      this.stoop += ((world.duck(x, z) > 0.15 ? 1 : 0) - this.stoop) * Math.min(1, dt * 5);
      this.nw += ((st.gait === 'walk' ? 1 : 0) - this.nw) * Math.min(1, dt * 4); const nw = this.nw;

      // one-shot action (the case clip), scrubbed to the source's time
      this.bending = !!st.action;
      this.wantCarry = st.action ? st.action.carryingAfter : st.carrying;
      if (st.action) {
        if (!this.bend.isRunning() && !this.bend.paused) this.bend.reset().play();
        this.bend.paused = true; this.bend.setEffectiveWeight(1); this.bend.time = Math.min(st.action.timeSec, CASE_CLIP.seconds);
      } else if (this.bend.paused || this.bend.isRunning()) { this.bend.stop(); this.bend.paused = false; }
      this.acts.walk.setEffectiveWeight(this.bending ? 0 : nw * (1 - this.stoop)); this.acts.walk_stoop.setEffectiveWeight(this.bending ? 0 : nw * this.stoop); this.acts.idle.setEffectiveWeight(this.bending ? 0 : 1 - nw);
      if (this.carrying && !st.carrying) sys.props.dropCase();   // the case was just released: it settles on the ground
      this.carrying = st.carrying;

      this.root.position.set(x, y, z); this.root.rotation.y = st.yaw;
      this.blob.position.set(x, y + 0.03, z); sys.cast.set(1, true, x, y, z); this.blob.material.uniforms.opacity.value = (ctx.tier === 'high' ? 0.3 : 0.9) * U.uBlob.value;
      this.mixer.update(dt);
      // partner helmet lamp: follows the sky preset unless the source says otherwise
      const ry = st.yaw, fx = Math.sin(ry), fz = Math.cos(ry);
      U.uLamp2Pos.value.set(x + fx * 0.25, y + 1.72, z + fz * 0.25); U.uLamp2Dir.value.set(fx, -0.28, fz).normalize();
      this.glow.position.copy(U.uLamp2Pos.value); this.glow.visible = st.lampOn === undefined ? U.uLamp.value.x > 0 : st.lampOn;
    },
  };
  return partner;
}
