// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 388-464).
import * as THREE from 'three';
import * as SH from './shaders.js';

export const COLORS = [[1.0, 0.32, 0.03], [0.05, 0.25, 0.9], [0.1, 0.8, 0.3], [0.85, 0.1, 0.75]];

export function createPartner(ctx) {
  const { scene, U, assets, sys, view } = ctx;
  const { meshH } = ctx.terrain;
  const partner = {
    free: null, bending: false, carrying: true, wantCarry: true,
    toggleCase() {   // reference hand-over. Down: walk to 1.6 m from the player, face them, bend and release the case (0.9 s), lid opens.
                     // Up: lid closes, bend and grab (0.9 s), walk back to the patrol path. The same bend clip serves both.
      if (this.bending || (this.free && (this.free.goal || this.free.then))) return;
      const bendNow = () => { this.bending = true; this.bend.reset().setEffectiveWeight(1).play(); };
      if (this.carrying) {
        const p = this.root.position, dx = p.x - view.eye.x, dz = p.z - view.eye.z, d = Math.hypot(dx, dz) || 1;
        this.wantCarry = false; this.free = { x: p.x, z: p.z, goal: d > 1.7 ? { x: view.eye.x + dx / d * 1.6, z: view.eye.z + dz / d * 1.6 } : null, face: { x: view.eye.x, z: view.eye.z }, then: bendNow };
      } else { this.wantCarry = true; this.free.face = { x: sys.props.tcase.position.x + 1e-3, z: sys.props.tcase.position.z }; this.free.face = null; bendNow(); }
    },
    // Reference: the partner walks into the habitat and back out. Waypoints are in habitat space (x toward the airlock end, v sideways);
    // the floor comes from the habitat's walk zones and the stooped walk fades in wherever habitat.duck() asks for a stoop.
    inside: false, stoop: 0,
    visitHabitat() {
      if (this.bending || !sys.habitat.root || (this.free && (this.free.goal || this.free.then || (this.free.queue && this.free.queue.length)))) return;
      const h = sys.habitat, t = h.root.rotation.y, c = Math.cos(t), sn = Math.sin(t), W = (x, v) => ({ x: h.pos.x + x * c + v * sn, z: h.pos.z - x * sn + v * c });
      const way = [[11.4, 0], [9.95, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.4, 0.15], [1.25, 0.55]].map(q => W(q[0], q[1])), p = this.root.position;
      if (!this.inside) { this.free = { x: p.x, z: p.z, goal: way[0], queue: way.slice(1), face: W(0, 0) }; this.inside = true; }
      else { const back = way.slice(0, -1).reverse(); this.free = { x: p.x, z: p.z, goal: back[0], queue: back.slice(1).concat([{ x: this.A.x + (this.B.x - this.A.x) * this.t, z: this.A.z + (this.B.z - this.A.z) * this.t }]), leave: true }; this.inside = false; }
    },
    root: null, mixer: null, acts: {}, uPlayer: { value: new THREE.Vector3(...COLORS[0]) }, ci: 0, t: 0, dir: 1, pause: 0, blob: null,
    A: new THREE.Vector3(14, 0, 58), B: new THREE.Vector3(5, 0, 12),
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
      // bending down to set the case on the ground (clip inside z2_astronaut.glb)
      const bend = gltf.animations.find(c => c.name === 'case_set_down'); this.bend = this.mixer.clipAction(bend); this.bend.setLoop(THREE.LoopOnce, 1); this.bend.clampWhenFinished = true;
      this.mixer.addEventListener('finished', () => { this.bend.stop(); this.bending = false; if (this.carrying && this.free) { this.free.face = null; this.free.goal = { x: this.A.x + (this.B.x - this.A.x) * this.t, z: this.A.z + (this.B.z - this.A.z) * this.t }; this.free.then = () => { this.free = null; }; } });
      const q = new THREE.CircleGeometry(0.8, 24); q.rotateX(-Math.PI / 2);
      this.blob = new THREE.Mesh(q, new THREE.ShaderMaterial({ uniforms: { opacity: { value: 0.4 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'uniform float opacity; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; gl_FragColor = vec4(0.03,0.012,0.006,(1.0-smoothstep(0.1,1.0,r))*opacity); }' })); scene.add(this.blob);
      const gc = document.createElement('canvas'); gc.width = gc.height = 64; const g2 = gc.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,246,225,1)'); gr.addColorStop(0.25, 'rgba(255,240,210,.55)'); gr.addColorStop(1, 'rgba(255,235,200,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
      this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); this.glow.scale.setScalar(0.45); scene.add(this.glow);
    },
    update(dt) {
      if (!this.root || !this.root.visible) { sys.cast.set(1, false); U.uLamp2Pos.value.set(0, 1e6, 0); if (this.glow) this.glow.visible = false; return; }
      const len = this.A.distanceTo(this.B), speed = (1.0 / 1.2) * (1 - 0.45 * this.stoop);   // one 1 m stride cycle per 1.2 s walk loop; slower when stooped
      let w = 1, x, z, target = null, turn = 6;
      if (this.free) {   // hand-over: off the patrol path. Walk to a goal, then face a point, then act.
        const f = this.free;
        if (f.goal) { const gx = f.goal.x - f.x, gz = f.goal.z - f.z, gd = Math.hypot(gx, gz), st = speed * dt;
          if (gd <= st) { f.x = f.goal.x; f.z = f.goal.z; f.goal = f.queue && f.queue.length ? f.queue.shift() : null; if (!f.goal && f.leave) { this.free = null; return; } } else { f.x += gx / gd * st; f.z += gz / gd * st; target = Math.atan2(gx, gz); } }
        else { w = 0; if (f.face) { target = Math.atan2(f.face.x - f.x, f.face.z - f.z); turn = 4; } }
        x = f.x; z = f.z;
      } else {
        if (this.pause > 0) { this.pause -= dt; w = 0; if (this.pause <= 0) this.dir *= -1; }
        else { this.t += this.dir * speed * dt / len; if (this.t >= 1 || this.t <= 0) { this.t = Math.max(0, Math.min(1, this.t)); this.pause = 3; } }
        x = this.A.x + (this.B.x - this.A.x) * this.t; z = this.A.z + (this.B.z - this.A.z) * this.t;
        const d = this.pause > 0 ? -this.dir : this.dir; target = Math.atan2((this.B.x - this.A.x) * d, (this.B.z - this.A.z) * d); if (this.pause > 0) turn = 1.2;
      }
      const yT = sys.habitat.root ? sys.habitat.ground(x, z) : meshH(x, z), y = this.root.position.y + (yT - this.root.position.y) * (Math.abs(yT - this.root.position.y) > 1.5 ? 1 : Math.min(1, dt * 10));   // habitat floor, steps and sills
      this.stoop += ((sys.habitat.root && sys.habitat.duck(x, z) > 0.15 ? 1 : 0) - this.stoop) * Math.min(1, dt * 5);
      this.nw = (this.nw === undefined ? 1 : this.nw) + (w - (this.nw === undefined ? 1 : this.nw)) * Math.min(1, dt * 4); const nw = this.nw;
      this.acts.walk.setEffectiveWeight(this.bending ? 0 : nw * (1 - this.stoop)); this.acts.walk_stoop.setEffectiveWeight(this.bending ? 0 : nw * this.stoop); this.acts.idle.setEffectiveWeight(this.bending ? 0 : 1 - nw);
      if (this.bending && this.bend.time >= 0.9 && this.carrying !== this.wantCarry) { this.carrying = this.wantCarry; if (!this.carrying) sys.props.dropCase(); }
      this.root.position.set(x, y, z); this.blob.position.set(x, y + 0.03, z); sys.cast.set(1, true, x, y, z); this.blob.material.uniforms.opacity.value = (ctx.tier === 'high' ? 0.3 : 0.9) * U.uBlob.value;
      let aligned = true;
      if (target !== null && !this.bending) { const cur = this.root.rotation.y, df = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI; this.root.rotation.y = cur + df * Math.min(1, dt * turn); aligned = Math.abs(df) < 0.12; }
      if (this.free && !this.free.goal && aligned && this.free.then) { const fn = this.free.then; this.free.then = null; fn(); }
      this.mixer.update(dt);
      // partner helmet lamp (only lit when the preset has a lamp)
      const ry = this.root.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
      U.uLamp2Pos.value.set(x + fx * 0.25, y + 1.72, z + fz * 0.25); U.uLamp2Dir.value.set(fx, -0.28, fz).normalize();
      this.glow.position.copy(U.uLamp2Pos.value); this.glow.visible = U.uLamp.value.x > 0;
    },
  };
  return partner;
}
