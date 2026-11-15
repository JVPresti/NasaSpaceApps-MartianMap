// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 612-655).
import * as THREE from 'three';
import * as SH from './shaders.js';

export function createProps(ctx) {
  const { scene, camera, U, assets, sys } = ctx;
  const { meshH } = ctx.terrain;
  const props = {
    scoop: null, tcase: null, hand: null, content: null, tmp: new THREE.Vector3(),
    async load(name) {
      const gltf = await assets.glb('assets_props/' + name + '.glb');
      const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.PROP_VERT, fragmentShader: SH.PROP_FRAG, vertexColors: true, side: THREE.DoubleSide });
      gltf.scene.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } }); return gltf.scene;
    },
    async init() {
      this.scoop = await this.load('sample_scoop'); this.tcase = await this.load('tool_case');
      // grip: handle across the palm of the right fist, scoop end on the thumb side (numbers in props.json)
      this.scoop.position.set(0.0, -0.045, -0.47); this.scoop.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)));
      sys.arms.R.g.add(this.scoop); camera.updateMatrixWorld(true); let hb = null; sys.arms.R.g.traverse(o => { if (o.isBone && o.name === 'hand') hb = o; }); hb.attach(this.scoop); this.scoop.visible = false;   // rides the hand bone so clips carry it
      scene.add(this.tcase); this.lid = this.tcase.getObjectByName('ToolCaseLid'); sys.partner.root.traverse(o => { if (o.isBone && /hand.?L/.test(o.name)) this.hand = o; });
    },
    dropCase() { const p = this.tcase.position; this.restY = meshH(p.x, p.z) + 0.29; },   // case origin is the handle; it settles to this height
    caseContent: null, spill: null, spillT: 0,
    startSpill(kind) {   // reference effect: the sample falls from the scoop under Mars gravity (3.71 m/s2)
      if (!this.spill) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
        this.spill = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.012, sizeAttenuation: true })); this.spill.frustumCulled = false; this.spill.userData.v = new Float32Array(48 * 3); scene.add(this.spill); }
      const src = this.scoop.getObjectByName(kind), bb = new THREE.Box3().setFromObject(src), c = bb.getCenter(new THREE.Vector3()), pos = this.spill.geometry.attributes.position.array, v = this.spill.userData.v;
      const rock = kind === 'ScoopRocks'; this.spill.material.size = rock ? 0.03 : 0.012; this.spill.material.color.set(rock ? 0x8a4a2c : 0x7a4526); this.spill.userData.n = rock ? 7 : 48;
      for (let i = 0; i < 48; i++) { const on = i < this.spill.userData.n; pos[i * 3] = c.x + (Math.random() - 0.5) * 0.06; pos[i * 3 + 1] = on ? c.y + (Math.random() - 0.5) * 0.04 + i * 0.004 : -1e4; pos[i * 3 + 2] = c.z + (Math.random() - 0.5) * 0.06;
        v[i * 3] = (Math.random() - 0.5) * 0.15; v[i * 3 + 1] = -Math.random() * 0.2; v[i * 3 + 2] = (Math.random() - 0.5) * 0.15; }
      this.spill.visible = true; this.spillT = 0; this.spillFloor = sys.partner.carrying ? meshH(c.x, c.z) + 0.01 : this.tcase.position.y - 0.23;
    },   // case origin is the handle; the body hangs 0.285 m below it
    update(dt) {
      if (this.spill && this.spill.visible) { const pos = this.spill.geometry.attributes.position.array, v = this.spill.userData.v; this.spillT += dt;
        for (let i = 0; i < this.spill.userData.n; i++) { v[i * 3 + 1] -= 3.71 * dt; pos[i * 3] += v[i * 3] * dt; pos[i * 3 + 1] = Math.max(this.spillFloor, pos[i * 3 + 1] + v[i * 3 + 1] * dt); pos[i * 3 + 2] += v[i * 3 + 2] * dt; }
        this.spill.geometry.attributes.position.needsUpdate = true;
        if (this.spillT > 0.55 && this.pending) { this.caseContent = this.pending; this.pending = null; }   // the sample has landed: show it in the case
        if (this.spillT > 0.9) this.spill.visible = false; }
      if (this.tcase) this.tcase.traverse(o => { if (o.name === 'CaseSoil' || o.name === 'CaseRocks') o.visible = o.name === this.caseContent; });
      if (!this.scoop) return;
      const state = sys.arms.state;
      this.scoop.visible = state === 'tool';
      // the wrist app (#67) hides the scoop while the wrist is up but keeps the sample: closing restores the tool hold
      if (state !== 'tool' && state !== 'screen') this.content = null;
      if (sys.arms.clip) { const t = sys.arms.clip.time; if (sys.arms.clipName === 'collect_ground' && t >= 2.7) this.content = 'ScoopSoil'; if (sys.arms.clipName === 'collect_rock' && t >= 1.75) this.content = 'ScoopRocks'; if (sys.arms.clipName === 'stow_sample' && t >= 1.1) this.content = null; if (sys.arms.clipName === 'pour_sample' && t >= 1.3 && this.content) { this.startSpill(this.content); if (!sys.partner.carrying) this.pending = this.content === 'ScoopSoil' ? 'CaseSoil' : 'CaseRocks'; this.content = null; } }
      this.scoop.traverse(o => { if (o.name === 'ScoopSoil' || o.name === 'ScoopRocks') o.visible = o.name === this.content; });
      this.tcase.visible = sys.partner.root.visible && !!this.hand; if (!this.tcase.visible) return;
      const open = !sys.partner.carrying && !(sys.partner.bending && sys.partner.wantCarry) ? -1.75 : 0;   // lid: rotation.x = -1.75 rad is fully open
      if (this.lid) this.lid.rotation.x += (open - this.lid.rotation.x) * 0.12;
      if (!sys.partner.carrying) { this.tcase.position.y += (this.restY - this.tcase.position.y) * 0.25; return; }   // resting on the ground where it was released
      this.hand.getWorldPosition(this.tmp); this.tcase.position.copy(this.tmp); this.tcase.position.y -= 0.10; this.tcase.rotation.y = sys.partner.root.rotation.y + Math.PI / 2;
    },
  };
  return props;
}
