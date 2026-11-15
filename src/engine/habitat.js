// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 658-782).
import * as THREE from 'three';
import * as SH from './shaders.js';
import { HAB_ZONES, HAB_SOLIDS, habZone, habCanStand, habSlideWorld } from './collide.js';
import { createHabitatScreens } from './habitatScreens.js';
import { createHabitatPrompt } from './habitatPrompt.js';

export function createHabitat(ctx) {
  const { scene, camera, U, assets, sys, view, T } = ctx;
  const { meshH } = ctx.terrain;
  const habitat = {
    // Walkable zones and solid boxes in habitat space (x = toward the airlock end, v = sideways, metres; floor = height above the habitat origin).
    // A walker stands inside a zone or outside every solid. The numbers and the rules live in collide.js (same numbers as habitat.json).
    ZONES: HAB_ZONES, SOLIDS: HAB_SOLIDS,
    local(x, z, o) { const dx = x - this.pos.x, dz = z - this.pos.z, t = this.root.rotation.y, c = Math.cos(t), s = Math.sin(t); o.x = dx * c - dz * s; o.v = dx * s + dz * c; return o; },
    _l: { x: 0, v: 0 }, open: 0, BLOCKS: [],
    zone(x, z) { if (!this.root) return null; const l = this.local(x, z, this._l); return habZone(l.x, l.v, this.open, this.BLOCKS); },
    canStand(x, z) { if (!this.root) return true; const l = this.local(x, z, this._l); return habCanStand(l.x, l.v, this.open, this.BLOCKS); },
    // walker collision (#38): one step from (x0, z0) to p ({ x, z }, changed in place). A blocked step slides along the wall it hit
    // (collide.js habSlide, in habitat space, where every wall is an axis-aligned box side or a circle). Far from the habitat: no-op.
    slide(x0, z0, p) { if (!this.root) return p; const R = 12, px = this.pos.x, pz = this.pos.z;
      if ((p.x - px) ** 2 + (p.z - pz) ** 2 > R * R && (x0 - px) ** 2 + (z0 - pz) ** 2 > R * R) return p;   // every solid is within 10 m of the origin
      return habSlideWorld(px, pz, this.root.rotation.y, this.open, this.BLOCKS, x0, z0, p); },
    ground(x, z) { const q = this.zone(x, z); return q ? Math.max(meshH(x, z), this.pos.y + q.floor(this._l.x)) : meshH(x, z); },   // floor or terrain under a walker
    duck(x, z) { if (!this.root) return 0; const l = this.local(x, z, this._l); if (Math.abs(l.v) > 0.9) return 0;   // hatches are 1.43 m tall: stoop BEFORE the frame. Full stoop within 0.55 m of a hatch, starting 1.4 m away.
      const d = Math.min(Math.abs(l.x - 7.05), Math.abs(l.x - 2.45)), t = Math.min(1, Math.max(0, (d - 0.55) / 0.85)); return 0.42 * (1 - t * t * (3 - 2 * t)); },
    update(dt) {
      if (this.lights) { const on = U.uLamp.value.x > 0; for (const l of this.lights) l.visible = on; U.uHabGlow.value.set(1.0, 0.84, 0.62).multiplyScalar(on ? 0.16 : 0); }
      this.screens.update(dt || 0.016, camera.position.distanceToSquared(this.pos) < 200);   // the wall screens refresh 4 times a second, only when someone is near (habitatScreens.js)
      const z = view.mode === 'eye' && this.zone(view.eye.x, view.eye.z); this.prompt.update(dt, !!z && (z.n === 'main' || z.n === 'inner'));   // end-of-EVA prompt over the table, in the cabin only (#244)
      if (!this.hatch) return; const l = this.local(view.eye.x, view.eye.z, this._l), pl = sys.partner.root ? this.local(sys.partner.root.position.x, sys.partner.root.position.z, { x: 0, v: 0 }) : null, near = (view.mode === 'eye' && l.x > 3.0 && l.x < 11.5 && Math.abs(l.v) < 3.0) || (pl && sys.partner.root.visible && pl.x > 3.0 && pl.x < 11.6 && Math.abs(pl.v) < 2.0);   // reference: the hatch opens when a walker is near
      this.open += ((near ? 1 : 0) - this.open) * Math.min(1, (dt || 0.016) * 3); this.hatch.rotation.y = 1.65 * this.open;
    },
    // Wall screens and planning table: drawn from mission data by habitatScreens.js (#47); created in createHabitat below.
    screens: null,
    root: null, pos: new THREE.Vector3(1e9, 0, 1e9), clear: 12,
    // Sit the habitat back on the terrain after a tier change rebuilt the mesh (meshH changes with the grid).
    // Same height rule as init; the spot and heading do not change. Not in the bench, which left it floating.
    reground() {
      if (!this.root) return;
      const x = this.pos.x, z = this.pos.z, d = this.dir; let lo = 1e9, hi = -1e9;
      for (let a = 0; a < 12; a++) { const hh = meshH(x + Math.cos(a * 0.5236) * 5.5, z + Math.sin(a * 0.5236) * 5.5); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
      const y = (lo + hi) / 2; this.relief = hi - lo; this.pos.y = y - 0.04; this.root.position.y = this.pos.y;
      this.root.updateMatrixWorld(true); U.uHabInv.value.copy(this.root.matrixWorld).invert();
      U.uHabP0.value.y = U.uHabP1.value.y = this.pos.y;
      U.uCastC.value[2].set(x + d.x * 1.5, y + 3.5, z + d.z * 1.5); sys.cast.dirty = true;
    },
    async init() {
      const gltf = await assets.glb('assets_habitat/habitat.glb');
      const prop = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.PROP_VERT, fragmentShader: SH.PROP_FRAG, vertexColors: true, side: THREE.DoubleSide });
      gltf.scene.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.layers.enable(2);
        o.material = o.material.map ? new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: o.material.map } }, vertexShader: SH.HAB_VERT, fragmentShader: SH.HAB_FRAG, side: THREE.DoubleSide }) : prop; });
      // reference placement: the flattest spot within 30 m of the HAB waypoint, airlock facing the first waypoint
      const W = sys.route.data.waypoints, h0 = W.find(w => w.name === 'HAB') || W[0], w1 = W[1]; let best = null;
      for (let dz = -30; dz <= 30; dz += 3) for (let dx = -30; dx <= 30; dx += 3) { const x = h0.x + dx, z = h0.z + dz; let lo = 1e9, hi = -1e9;
        for (let a = 0; a < 12; a++) { const hh = meshH(x + Math.cos(a * 0.5236) * 5.5, z + Math.sin(a * 0.5236) * 5.5); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
        if (!best || hi - lo < best.r) best = { x, z, r: hi - lo, y: (lo + hi) / 2 }; }
      this.relief = best.r; this.pos.set(best.x, best.y - 0.04, best.z); this.root = gltf.scene; this.root.position.copy(this.pos);
      const d = new THREE.Vector3(w1.x - best.x, 0, w1.z - best.z).normalize(); this.root.rotation.y = Math.atan2(-d.z, d.x); this.dir = d;   // model +X = airlock end
      // interior (separate file) and the hinged outer hatch
      const ig = await assets.glb('assets_habitat/habitat_interior.glb');
      const lm = await assets.texAt('assets_habitat/interior_lightmap.jpg'); lm.flipY = false; lm.colorSpace = THREE.NoColorSpace; lm.generateMipmaps = false; lm.minFilter = THREE.LinearFilter;
      const inMat = new THREE.ShaderMaterial({ uniforms: { ...U, uRoom: { value: 1 }, tLM: { value: lm } }, vertexShader: SH.INTERIOR_VERT, fragmentShader: SH.INTERIOR_FRAG, vertexColors: true, side: THREE.DoubleSide });
      const vol = await assets.texAt('assets_habitat/interior_lightvolume.png'); vol.flipY = false; vol.colorSpace = THREE.NoColorSpace; vol.generateMipmaps = false; vol.minFilter = vol.magFilter = THREE.LinearFilter; U.tVol.value = vol;
      this.root.updateMatrixWorld(true); U.uHabInv.value.copy(this.root.matrixWorld).invert();   // world -> habitat space, for the light volume
      // furniture library: one small file per piece, placed by layout.json
      const lay = await assets.jsonAt('assets_habitat/furniture/layout.json'), lib = {}, furnMat = new THREE.ShaderMaterial({ uniforms: { ...U, uRoom: { value: 0 }, tLM: { value: lm } }, vertexShader: SH.INTERIOR_VERT, fragmentShader: SH.INTERIOR_FRAG, vertexColors: true, side: THREE.DoubleSide });
      const glassMat = new THREE.ShaderMaterial({ uniforms: { uInterior: U.uInterior, uTime: U.uTime, uHabInv: U.uHabInv, tVol: U.tVol }, vertexShader: SH.INTERIOR_VERT, fragmentShader: SH.GLASS_FRAG, vertexColors: true, side: THREE.DoubleSide, transparent: true, premultipliedAlpha: true, depthWrite: false });   // see-through panes: any mesh with 'glass' in its name
      for (const it of lay.items) {
        if (!lib[it.model]) { lib[it.model] = (await assets.glb('assets_habitat/furniture/' + it.model + '.glb')).scene;
          lib[it.model].traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.map ? new THREE.ShaderMaterial({ uniforms: { uInterior: U.uInterior, uHabInv: U.uHabInv, tVol: U.tVol, tMap: { value: o.material.map } }, vertexShader: SH.INTERIOR_TEX_VERT, fragmentShader: SH.INTERIOR_TEX_FRAG, side: THREE.DoubleSide }) : /glass/.test(o.name) ? glassMat : furnMat; if (/glass/.test(o.name)) o.renderOrder = 3; } }); }
        const f = lib[it.model].clone(true); f.position.set(...it.position); if (it.scale) f.scale.setScalar(it.scale); f.rotation.y = it.rotation_y_deg * Math.PI / 180; gltf.scene.add(f); if (it.blocks) this.BLOCKS.push(...[].concat(it.blocks));
      }
      ig.scene.traverse(o => { if (o.isMesh) { o.material = /Screens/.test(o.name) ? this.screens.mat : inMat; o.frustumCulled = false; } }); gltf.scene.add(ig.scene);
      this.hatch = gltf.scene.getObjectByName('HabitatHatch');
      // planning table top: the EVA map, drawn from the store's route by habitatScreens.js (#47); route.json's waypoints until data arrives
      const disc = this.screens.table.mesh; disc.position.set(0, 1.10 + 0.966, 0); gltf.scene.add(disc); this.screens.table.drawPlaceholder();
      gltf.scene.add(this.prompt.sprite);   // floats over the table (habitatPrompt.js, #244)
      // night lights (reference): a warm work light over the outer hatch and a red beacon on the comms mast
      const gc = document.createElement('canvas'); gc.width = gc.height = 64; const g2 = gc.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
      const gt = new THREE.CanvasTexture(gc), mk = (col, x, y, z, sc2) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: col, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sp.position.set(x, y, z); sp.scale.setScalar(sc2); gltf.scene.add(sp); return sp; };
      this.lights = [mk(0xffe2b0, 7.33, 2.95, 0, 1.3), mk(0xff3020, -1.9, 4.35, 3.4, 0.7)];
      // floodlights modelled on the shell (HabitatExterior): four under the loft flange, two on the tunnel, one over each side hatch, one over the rear hatch
      for (const q of [[1.966, 3.128, -1.966], [-1.966, 3.128, -1.966], [-1.966, 3.128, 1.966], [1.966, 3.128, 1.966], [4.85, 2.327, -1.454], [4.85, 2.327, 1.474], [0, 2.88, -2.66], [0, 2.88, 2.66], [-3.45, 2.838, 1.121]]) this.lights.push(mk(0xffe2b0, q[0], q[1], q[2], 0.9));
      const hw = (x) => new THREE.Vector3(best.x + d.x * x, this.pos.y, best.z + d.z * x); U.uHabP0.value.copy(hw(-3.5)); U.uHabP1.value.copy(hw(8.5));   // the pool of light on the ground and on the shell (lamp() in COMMON)
      scene.add(this.root); sys.cast.on[2] = true; U.uCastC.value[2].set(best.x + d.x * 1.5, best.y + 3.5, best.z + d.z * 1.5); sys.cast.dirty = true; sys.rocks.reset();
    },
  };
  habitat.screens = createHabitatScreens(ctx);
  habitat.prompt = createHabitatPrompt();
  return habitat;
}
