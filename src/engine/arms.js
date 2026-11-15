import { t, translateText } from '../i18n/index.js';
// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 505-604).
import * as THREE from 'three';
import * as SH from './shaders.js';
import { CREW } from './crew.js';
import { cloneSkinned } from './skinned.js';
import { swingPhase } from './gait.js';
import { SCREEN_CENTRE_Y_M, TAP_SECONDS, clampWristPointer, fingerHover, layerRowPointer, wristPixelToLocal } from './wrist.js';

export const LAYER_NAMES = ['VISIBLE', 'SLOPE HAZARD', 'ELEVATION', 'ROCK ABUNDANCE', 'OUTCROP'];

export function createArms(ctx) {
  const { scene, camera, U, assets, sys, view, gait } = ctx;
  const arms = {
    L: null, R: null, state: 'down', canvas: null, tex: null, uPlayer: { value: new THREE.Vector3(...CREW[0].color) },
    // wrist screen (#67): the built-in canvas is the fallback; the interface may hand in its own canvas and owns
    // every pixel drawn into it. pointer: the last pixel the app sent, null = the selected layer row of the fallback.
    screenMat: null, screenCanvas: null, screenTex: null, pointer: null,
    // camera-space placements: elbow position, arm direction, "back of hand" direction, finger pose
    P: {
      // 'body' entries are relative to the torso (yaw only), so the hands rise into view as you look down
      down:   { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.30, -0.40, -0.08], [-0.12, 0.17, -1], [-0.25, 1, 0.2], 'relaxed', 'body'] },
      screen: { L: [[-0.30, -0.10, -0.49], [0.95, 0.06, -0.14], [0.0, 0.42, 0.91], 'fist'],   R: [[0.33, -0.31, -0.13], [-0.75, 0.24, -0.63], [0.2, 1, 0.3], 'point'] },
      point:  { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.26, -0.30, -0.22], [-0.16, 0.14, -1], [0.25, 1, 0], 'point'] },
      tool:   { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.27, -0.33, -0.10], [-0.20, 0.16, -1], [1, 0.25, 0], 'fist'] },
      open:   { L: [[-0.22, -0.34, -0.30], [0.12, 0.30, -1], [0, 0.3, 1], 'open'],      R: [[0.22, -0.34, -0.30], [-0.12, 0.30, -1], [0, 0.3, 1], 'open'] },
      pinch:  { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.20, -0.30, -0.24], [-0.14, 0.18, -1], [0.5, 1, 0], 'pinch'] },
    },
    async init() {
      const gltf = await assets.glb('assets_astronaut/arm_left.glb');
      this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 352;
      this.tex = new THREE.CanvasTexture(this.canvas); this.tex.flipY = false; this.tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uPlayer: this.uPlayer }, vertexShader: SH.ARM_VERT, fragmentShader: SH.ARM_FRAG, vertexColors: true, side: THREE.DoubleSide });
      const screenMat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
      this.screenMat = screenMat; this.applyScreenCanvas();   // the app may have handed in its canvas before init
      const mk = (mirror) => {
        const inner = mirror ? cloneSkinned(gltf.scene) : gltf.scene, g = new THREE.Group(), flip = new THREE.Group();
        flip.rotation.y = Math.PI; if (mirror) flip.scale.x = -1; flip.add(inner); g.add(flip);
        inner.traverse(o => { if (o.isMesh) { o.frustumCulled = false; const scr = o.material.name === 'Screen'; o.material = scr ? screenMat : mat; if (scr && mirror) o.visible = false; if (mirror && o.name.startsWith('WristScreen')) o.visible = false; } });
        const mixer = new THREE.AnimationMixer(inner), acts = {};
        gltf.animations.forEach(a => { acts[a.name] = mixer.clipAction(a); acts[a.name].play(); acts[a.name].setEffectiveWeight(a.name === 'relaxed' ? 1 : 0); });
        camera.add(g); return { g, mixer, acts, pose: 'relaxed', pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
      };
      this.L = mk(false); this.R = mk(true); scene.add(camera);
      this.calibrateFinger();
      // whole-arm animation clips (authored in Blender on the arm skeleton, camera space, right hand)
      const cg = await assets.glb('assets_astronaut/arm_clips.glb');
      this.clips = {}; this.camRoot = new THREE.Object3D(); this.camNode = new THREE.Object3D(); this.camNode.name = 'camrig'; this.camRoot.add(this.camNode); this.camMixer = new THREE.AnimationMixer(this.camRoot); this.camActs = {};
      for (const c of cg.animations) if (this.CLIP_PITCH[c.name] !== undefined) {   // split each clip: arm bones play on the arm, the "camrig" bone drives the camera
        const armT = c.tracks.filter(t => !t.name.startsWith('camrig.')), camT = c.tracks.filter(t => t.name.startsWith('camrig.'));
        const act = this.R.mixer.clipAction(new THREE.AnimationClip(c.name, c.duration, armT)); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; this.clips[c.name] = act;
        const ca = this.camMixer.clipAction(new THREE.AnimationClip(c.name, c.duration, camT)); ca.setLoop(THREE.LoopOnce, 1); ca.clampWhenFinished = true; this.camActs[c.name] = ca;
      }
      this.R.mixer.addEventListener('finished', () => { if (!this.clip) return; this.clip.stop(); this.clip = null; this.camClip.stop(); this.camClip = null; this.cam.drop = this.cam.fwd = this.cam.pitch = 0; for (const n in this.R.acts) this.R.acts[n].setEffectiveWeight(n === 'fist' ? 1 : 0); this.set('tool', true); });
      this.set('down', true); this.draw();
    },
    tap: 0,
    // Calibrate the fingertip on the actual distal bone from the benchmark's point pose. The same bone-local
    // point then follows every blended pose, including pinch, without assuming its point offset stays fixed.
    calibrateFinger() {
      const a = this.R;
      this.finger = a.mixer.getRoot().getObjectByName('index3');
      if (!this.finger) return;
      for (const n in a.acts) a.acts[n].setEffectiveWeight(n === 'point' ? 1 : 0);
      a.mixer.update(0); a.g.updateWorldMatrix(true, true);
      this.fingerLocal = this.finger.worldToLocal(a.g.localToWorld(new THREE.Vector3(-0.051, -0.012, -0.571)));
      for (const n in a.acts) a.acts[n].setEffectiveWeight(n === a.pose ? 1 : 0);
      a.mixer.update(0);
    },
    alignFinger() {
      if (!this.finger || !this.fingerLocal) return;
      const a = this.R, L = this.L.g, p = this.pointer || layerRowPointer(U.uLayer.value | 0);
      const local = wristPixelToLocal(p.x, p.y);
      const desired = new THREE.Vector3(local.x, SCREEN_CENTRE_Y_M + fingerHover(this.tap), local.z)
        .applyQuaternion(L.quaternion).add(L.position);
      a.g.updateWorldMatrix(true, true);
      const tip = a.g.worldToLocal(this.finger.localToWorld(this.fingerLocal.clone()))
        .applyQuaternion(a.g.quaternion).add(a.g.position);
      a.g.position.add(desired.sub(tip));
    },
    /** External canvas owned by the wrist app (512 x 352), or null to show the built-in layer list. Safe before init. */
    setScreenCanvas(canvas) {
      if (canvas !== null && !(canvas && typeof canvas.width === 'number' && typeof canvas.height === 'number')) throw new TypeError('setWristScreen: expected a canvas or null');
      if (canvas === this.screenCanvas) return;
      this.screenCanvas = canvas; this.applyScreenCanvas();
    },
    /** Puts the current canvas (app or fallback) on the Screen material; the UI canvas becomes one CanvasTexture. */
    applyScreenCanvas() {
      if (!this.screenMat) return;   // init() calls this again once the material exists
      if (this.screenTex) { this.screenTex.dispose(); this.screenTex = null; }
      if (this.screenCanvas) {
        this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
        this.screenTex.flipY = false; this.screenTex.colorSpace = THREE.SRGBColorSpace;
        this.screenMat.map = this.screenTex;
      } else {
        this.screenMat.map = this.tex;
        if (this.tex) this.tex.needsUpdate = true;   // the fallback may have changed while the app owned the screen
      }
    },
    /** The app repainted its canvas: upload the new frame. The engine never uploads an external screen on its own. */
    invalidateScreen() { const tex = this.screenMat && this.screenMat.map; if (tex) tex.needsUpdate = true; },
    /**
     * Pixel on the 512 x 352 screen (x right, y down). Every call points; every call with pressed: true is one
     * confirm: the finger pinches for TAP_SECONDS and returns to point. Ignored by the arm while the wrist is down.
     * @param {{ x: number, y: number, pressed?: boolean }} pointer
     * @returns {{ x: number, y: number, pressed: boolean }} the clamped pointer
     */
    setWristPointer(pointer) {
      const p = clampWristPointer(pointer);
      if (p.pressed) this.tap = TAP_SECONDS;
      this.pointer = p; return { ...p };
    },
    // right index fingertip is solved onto the pixel the app points at (the selected layer row when it sent none),
    // approaching from above the screen plane
    tapTarget() {
      const L = this.basis(...this.P.screen.L), tap = this.tap > 0, p = this.pointer || layerRowPointer(U.uLayer.value | 0);
      const { x: lx, z: lz } = wristPixelToLocal(p.x, p.y), hover = fingerHover(this.tap);
      const n = new THREE.Vector3(0, 1, 0).applyQuaternion(L.quat), S = new THREE.Vector3(lx, SCREEN_CENTRE_Y_M + hover, lz).applyQuaternion(L.quat).add(L.pos);
      const E0 = S.clone().addScaledVector(n, 0.21).add(new THREE.Vector3(0.50, -0.12, -0.04)), d = S.clone().sub(E0).normalize();
      const R = this.basis([0, 0, 0], [d.x, d.y, d.z], [n.x, n.y, n.z], tap ? 'pinch' : 'point');
      R.pos.copy(S).sub(new THREE.Vector3(-0.051, -0.012, -0.571).applyQuaternion(R.quat)); return R;
    },
    target(side) {
      if (this.state === 'screen' && side === 'R') return this.tapTarget();
      const e = this.P[this.state][side]; if (e[4] !== 'body') return this.basis(...e);
      const pc = view.mode === 'eye' ? Math.max(-0.3, Math.min(0.45, view.pitch)) : 0, ax = new THREE.Vector3(1, 0, 0), r = v => new THREE.Vector3(...v).applyAxisAngle(ax, pc).toArray();
      const sw = Math.sin(this.swing) * 0.012 * this.walk * (side === 'L' ? 1 : -1), p = e[0]; return this.basis(r([p[0], p[1] + Math.abs(sw) * 0.5, p[2] + sw]), r(e[1]), r(e[2]), e[3]);
    },
    swing: 0, walk: 0,
    CLIP_PITCH: { collect_ground: 0.96, collect_rock: 0.61, stow_sample: 0, pour_sample: 0.70 },   // largest look-down angle of each clip's camera track (rad)
    clip: null, camClip: null, cam: { drop: 0, fwd: 0, pitch: 0 },   // cam: camera offset from the standing eye while a clip plays (m, m, rad)
    play(name) {   // the clip starts and ends exactly on the "tool" hold, so it can take over the arm without a jump
      if (this.clip || !this.clips[name]) return; this.set('tool', true);
      const R = this.R; R.g.position.set(0, 0, 0); R.g.quaternion.identity(); for (const n in R.acts) R.acts[n].setEffectiveWeight(0);
      this.clipName = name; if (name.startsWith('collect_')) sys.props.content = null;
      this.clip = this.clips[name]; this.clip.reset().setEffectiveWeight(1).play();
      this.camClip = this.camActs[name]; this.camClip.reset().play(); this.camMixer.update(0); this.camQ0 = this.camNode.quaternion.clone();
    },
    basis(p, d, u, pose) {
      const z = new THREE.Vector3(...d).normalize().negate();   // model +Z points from hand to elbow after the 180 deg flip
      const y = new THREE.Vector3(...u); y.addScaledVector(z, -y.dot(z)).normalize(); const x = new THREE.Vector3().crossVectors(y, z);
      return { pos: new THREE.Vector3(...p), quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), pose };
    },
    set(state, snap) {
      if (this.clip && state !== 'tool') { this.clip.stop(); this.clip = null; if (this.camClip) this.camClip.stop(); this.camClip = null; this.cam.drop = this.cam.fwd = this.cam.pitch = 0; }
      this.state = state;
      for (const side of ['L', 'R']) { const a = this[side], t = this.target(side); a.pos.copy(t.pos); a.quat.copy(t.quat); a.pose = t.pose; if (snap) { a.g.position.copy(t.pos); a.g.quaternion.copy(t.quat); } }
    },
    update(dt) {
      if (this.tap > 0) this.tap = Math.max(0, this.tap - dt);
      if (!this.L) return; const k = Math.min(1, dt * 5);
      if (this.state === 'screen') { const t = this.tapTarget(); this.R.pos.copy(t.pos); this.R.quat.copy(t.quat); this.R.pose = t.pose; }
      this.walk += ((view.moveSpeed > 0.1 ? 1 : 0) - this.walk) * k; this.swing = swingPhase(gait);   // one arm swing per stride, from the shared gait phase (#228)
      for (const side of ['L', 'R']) if (this.P[this.state][side][4] === 'body') { const t = this.target(side); this[side].pos.copy(t.pos); this[side].quat.copy(t.quat); }
      for (const side of ['L', 'R']) {
        const a = this[side]; if (side === 'R' && this.clip) { a.mixer.update(dt); if (this.camClip) { this.camMixer.update(dt); this.cam.drop = this.camNode.position.y; this.cam.fwd = this.camNode.position.z; this.cam.pitch = this.camQ0.angleTo(this.camNode.quaternion); } continue; }
        a.g.position.lerp(a.pos, k); a.g.quaternion.slerp(a.quat, k);
        for (const n in a.acts) { const w = a.acts[n].getEffectiveWeight(), t = n === a.pose ? 1 : 0; a.acts[n].setEffectiveWeight(w + (t - w) * k); }
        a.mixer.update(dt);
      }
      // Run after the mixers: the pinch bends the index, so its actual animated tip must be solved again.
      if (this.state === 'screen') this.alignFinger();
    },
    draw() {
      const c = this.canvas.getContext('2d'), W = 512, H = 352, cur = U.uLayer.value | 0;
      c.fillStyle = '#06181d'; c.fillRect(0, 0, W, H); c.strokeStyle = '#8fd3ee'; c.lineWidth = 3; c.strokeRect(8, 8, W - 16, H - 16);
      c.fillStyle = '#8fd3ee'; c.font = '600 22px sans-serif'; c.fillText(t('ui.vision.layer'), 28, 46);
      LAYER_NAMES.forEach((n, i) => { const y = 74 + i * 52; c.fillStyle = i === cur ? '#8fd3ee' : 'rgba(143,211,238,.14)'; c.fillRect(28, y, W - 56, 40);
        c.fillStyle = i === cur ? '#06181d' : '#cfeaf5'; c.font = '600 24px sans-serif'; c.fillText(translateText(n), 44, y + 28); });
      if (!this.screenCanvas) this.tex.needsUpdate = true;   // with an app canvas the interface owns the uploads
    },
    /** Frees the screen textures (app and fallback) once; the engine's material sweep sees map === null afterwards. */
    dispose() {
      if (this.screenMat) this.screenMat.map = null;
      for (const tex of new Set([this.tex, this.screenTex])) if (tex) tex.dispose();
      this.tex = this.screenTex = null; this.screenCanvas = null; this.screenMat = null; this.pointer = null;
    },
  };
  return arms;
}
