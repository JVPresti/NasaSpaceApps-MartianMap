// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 658-782).
import * as THREE from 'three';
import * as SH from './shaders.js';
import { HAB_ZONES, HAB_SOLIDS, habZone, habCanStand, habSlideWorld } from './collide.js';

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
      if (this.screens.mat && camera.position.distanceToSquared(this.pos) < 200 && (this.screens.t += dt || 0.016) > 0.25) { this.screens.t = 0; this.screens.draw(); }   // the wall screens refresh 4 times a second, only when someone is near
      if (!this.hatch) return; const l = this.local(view.eye.x, view.eye.z, this._l), pl = sys.partner.root ? this.local(sys.partner.root.position.x, sys.partner.root.position.z, { x: 0, v: 0 }) : null, near = (view.mode === 'eye' && l.x > 3.0 && l.x < 11.5 && Math.abs(l.v) < 3.0) || (pl && sys.partner.root.visible && pl.x > 3.0 && pl.x < 11.6 && Math.abs(pl.v) < 2.0);   // reference: the hatch opens when a walker is near
      this.open += ((near ? 1 : 0) - this.open) * Math.min(1, (dt || 0.016) * 3); this.hatch.rotation.y = 1.65 * this.open;
    },
    // Wall screens (reference content). The five screen faces are one mesh, 'HabitatScreens', whose UVs point into a 1024 px
    // canvas; each screen has its own cell (same numbers as habitat.json "screens"). Draw anything into the cell and it shows up.
    screens: { t: 1, mat: null, clock: 0,
      CELLS: { life: [0, 0, 512, 341], eva: [512, 0, 512, 341], weather: [0, 341, 512, 341], airlock: [512, 341, 512, 282], door: [0, 682, 512, 341] },
      init() { this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 1024; this.g = this.canvas.getContext('2d');
        this.tex = new THREE.CanvasTexture(this.canvas); this.tex.flipY = false; this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.generateMipmaps = false; this.tex.minFilter = THREE.LinearFilter;
        this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, side: THREE.DoubleSide }); },
      draw() { const g = this.g, T = (this.clock += 0.25), C = this.CELLS, F = (px, b) => (b ? 'bold ' : '') + px + 'px ui-monospace, Menlo, Consolas, monospace';
        const frame = (c, title, fg, bg) => { const [x, y, w, h] = c; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); g.fillStyle = bg; g.fillRect(0, 0, w, h);
          g.fillStyle = fg; g.globalAlpha = 0.16; g.fillRect(0, 0, w, 46); g.globalAlpha = 1; g.font = F(26, true); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(title, 16, 24);
          g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10); g.globalAlpha = 1; return [w, h]; };
        const bar = (x, y, w, label, val, unit, frac, fg, warn) => { g.font = F(20); g.fillStyle = fg; g.textAlign = 'left'; g.fillText(label, x, y); g.textAlign = 'right'; g.fillText(val + ' ' + unit, x + w, y);
          g.globalAlpha = 0.22; g.fillRect(x, y + 14, w, 12); g.globalAlpha = 1; g.fillStyle = warn || fg; g.fillRect(x, y + 14, w * Math.min(1, Math.max(0, frac)), 12); };
        const trace = (x, y, w, h, fg, fn) => { g.strokeStyle = fg; g.lineWidth = 2.5; g.beginPath(); for (let i = 0; i <= w; i += 4) { const yy = y + h / 2 - fn(i / w) * h / 2; if (i) g.lineTo(x + i, yy); else g.moveTo(x + i, yy); } g.stroke(); };
        const wob = (k, a) => Math.sin(T * 0.7 + k * 2.1) * a, blink = Math.floor(T * 2) % 2 === 0, storm = /storm|dust/.test(ctx.presetName), night = /night/.test(ctx.presetName);
        // 1. life support (blue screen left of the sample cabinet)
        frame(C.life, 'LIFE SUPPORT', '#8fe9ff', '#03222b');
        bar(20, 78, 300, 'O2', (20.9 + wob(1, 0.1)).toFixed(1), '%', 0.84 + wob(1, 0.01), '#8fe9ff'); bar(20, 130, 300, 'CO2', (0.04 + wob(2, 0.005)).toFixed(3), '%', 0.12 + wob(2, 0.02), '#8fe9ff');
        bar(20, 182, 300, 'PRESSURE', (70.3 + wob(3, 0.2)).toFixed(1), 'kPa', 0.70 + wob(3, 0.01), '#8fe9ff'); bar(20, 234, 300, 'CABIN', (21.5 + wob(4, 0.3)).toFixed(1), 'C', 0.55 + wob(4, 0.02), '#8fe9ff');
        g.fillStyle = '#7dff9a'; g.beginPath(); g.arc(420, 120, 44, 0, 7); g.fill(); g.fillStyle = '#03222b'; g.font = F(22, true); g.textAlign = 'center'; g.fillText('OK', 420, 121);
        g.fillStyle = '#8fe9ff'; g.font = F(17); g.fillText('SCRUBBER A', 420, 190); trace(350, 205, 140, 60, '#8fe9ff', u => Math.sin(u * 14 + T * 2) * 0.5 + Math.sin(u * 5 - T) * 0.3);
        g.textAlign = 'left'; g.font = F(17); g.fillText('WATER 82 %   POWER ' + (storm ? '61' : '94') + ' %', 20, 305); g.restore();
        // 2. EVA team (blue screen by the shelves)
        frame(C.eva, 'EVA TEAM', '#8fe9ff', '#03222b');
        [['EV1', 0, 91, 78], ['EV2', 1, 88, 84]].forEach(([nm, k, o2, bat]) => { const y = 70 + k * 125; g.fillStyle = '#ffffff'; g.font = F(24, true); g.textAlign = 'left'; g.fillText(nm, 20, y + 6);
          bar(90, y, 190, 'SUIT O2', o2, '%', o2 / 100, '#8fe9ff'); bar(90, y + 50, 190, 'BATTERY', bat, '%', bat / 100, '#8fe9ff');
          const bpm = 72 + k * 9 + Math.round(wob(5 + k, 3)); g.fillStyle = '#7dff9a'; g.font = F(20); g.textAlign = 'right'; g.fillText(bpm + ' bpm', 492, y);
          trace(300, y + 14, 192, 64, '#7dff9a', u => { const ph = (u * 3 + T * 0.9 + k * 0.4) % 1; return ph < 0.06 ? ph * 14 : ph < 0.12 ? 0.84 - (ph - 0.06) * 26 : ph < 0.16 ? -0.72 + (ph - 0.12) * 18 : 0; }); });
        g.fillStyle = '#8fe9ff'; g.font = F(17); g.textAlign = 'left'; const mm = Math.floor(T / 60), ss = Math.floor(T % 60); g.fillText('NERETVA VALLIS   T+' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), 20, 315); g.restore();
        // 3. weather and alerts (amber screen by the ladder)
        frame(C.weather, 'WEATHER  JEZERO', '#ffc56b', '#2b1a03');
        bar(20, 78, 250, 'DUST TAU', storm ? '2.8' : '0.6', '', storm ? 0.93 : 0.2, '#ffc56b', storm ? '#ff5a3c' : null); bar(20, 130, 250, 'WIND', storm ? '24' : '6', 'm/s', storm ? 0.8 : 0.2, '#ffc56b', storm ? '#ff5a3c' : null);
        bar(20, 182, 250, 'TEMP', night ? '-78' : '-23', 'C', night ? 0.15 : 0.5, '#ffc56b'); bar(20, 234, 250, 'RADIATION', '0.7', 'mSv/d', 0.3, '#ffc56b');
        g.strokeStyle = '#ffc56b'; g.lineWidth = 2; for (const r of [30, 60, 90]) { g.globalAlpha = 0.5; g.beginPath(); g.arc(395, 170, r, 0, 7); g.stroke(); } g.globalAlpha = 1;
        const sa = T * 1.2; g.beginPath(); g.moveTo(395, 170); g.lineTo(395 + Math.cos(sa) * 90, 170 + Math.sin(sa) * 90); g.stroke();
        g.fillStyle = storm ? '#ff5a3c' : '#ffc56b'; for (let k = 0; k < (storm ? 9 : 3); k++) { const a = k * 2.4 + 1, r = 25 + (k * 37 % 60); g.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.cos(sa - a)); g.beginPath(); g.arc(395 + Math.cos(a) * r, 170 + Math.sin(a) * r, storm ? 9 : 5, 0, 7); g.fill(); } g.globalAlpha = 1;
        if (storm && blink) { g.fillStyle = '#ff5a3c'; g.fillRect(14, 286, 484, 40); g.fillStyle = '#2b1a03'; } else g.fillStyle = storm ? '#ff5a3c' : '#7dff9a';
        g.font = F(22, true); g.textAlign = 'center'; g.fillText(storm ? 'DUST STORM  -  EVA HOLD' : 'EVA WINDOW OPEN', 256, 307); g.restore();
        // 4. airlock status (blue screen inside the airlock)
        frame(C.airlock, 'AIRLOCK', '#8fe9ff', '#03222b'); const op = sys.habitat.open > 0.5;
        bar(20, 82, 472, 'CHAMBER', op ? '0.7' : '70.3', 'kPa', op ? 0.02 : 0.70, '#8fe9ff');
        g.font = F(24, true); g.textAlign = 'left'; g.fillStyle = op ? '#ffc56b' : '#7dff9a'; g.fillText('OUTER HATCH  ' + (op ? 'OPEN' : 'SEALED'), 20, 160); g.fillStyle = '#7dff9a'; g.fillText('INNER HATCH  OPEN', 20, 200);
        g.fillStyle = '#8fe9ff'; g.font = F(18); g.fillText(op ? 'vented to Mars ambient' : 'equalised with cabin', 20, 245); g.restore();
        // 5. hatch control panel (beside the inner hatch)
        frame(C.door, 'HATCH', '#8fe9ff', '#062a33');
        g.fillStyle = op ? '#ffc56b' : '#7dff9a'; g.globalAlpha = blink || !op ? 1 : 0.4; g.beginPath(); g.arc(110, 190, 62, 0, 7); g.fill(); g.globalAlpha = 1; g.fillStyle = '#062a33'; g.font = F(24, true); g.textAlign = 'center'; g.fillText(op ? 'WAIT' : 'SAFE', 110, 191);
        [['CYCLE', 80], ['OPEN', 165], ['LOCK', 250]].forEach(([t, y]) => { g.strokeStyle = '#8fe9ff'; g.lineWidth = 3; g.strokeRect(230, y, 250, 64); g.fillStyle = '#8fe9ff'; g.font = F(26, true); g.fillText(t, 355, y + 33); }); g.restore();
        this.tex.needsUpdate = true; } },
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
      this.screens.init(); ig.scene.traverse(o => { if (o.isMesh) { o.material = /Screens/.test(o.name) ? this.screens.mat : inMat; o.frustumCulled = false; } }); gltf.scene.add(ig.scene);
      this.hatch = gltf.scene.getObjectByName('HabitatHatch');
      // planning table top: the EVA map (reference). Terrain photo tinted like a display, route and waypoints from route.json.
      const mc = document.createElement('canvas'); mc.width = mc.height = 512; const g3 = mc.getContext('2d'), W2 = sys.route.data.waypoints, src = ctx.orthoCache.low ? ctx.orthoCache.low.image : (ctx.orthoCache.high && ctx.orthoCache.high.image);
      g3.fillStyle = '#04161b'; g3.fillRect(0, 0, 512, 512); if (src) { g3.globalAlpha = 0.85; g3.drawImage(src, 0, 0, 512, 512); g3.globalAlpha = 1; g3.globalCompositeOperation = 'multiply'; g3.fillStyle = '#39c4d8'; g3.fillRect(0, 0, 512, 512); g3.globalCompositeOperation = 'source-over'; }
      g3.strokeStyle = 'rgba(120,230,255,.25)'; g3.lineWidth = 1; for (let k = 1; k < 8; k++) { g3.beginPath(); g3.moveTo(k * 64, 0); g3.lineTo(k * 64, 512); g3.moveTo(0, k * 64); g3.lineTo(512, k * 64); g3.stroke(); }
      const mp = w => [(w.x / T.W + 0.5) * 512, (w.z / T.H + 0.5) * 512]; g3.strokeStyle = '#ffd24a'; g3.lineWidth = 4; g3.setLineDash([10, 6]); g3.beginPath(); W2.forEach((w, i) => { const [px, py] = mp(w); if (i) g3.lineTo(px, py); else g3.moveTo(px, py); }); g3.stroke(); g3.setLineDash([]);
      W2.forEach((w, i) => { const [px, py] = mp(w); g3.fillStyle = i === 0 ? '#7dff9a' : '#ffffff'; g3.beginPath(); g3.arc(px, py, i === 0 ? 9 : 6, 0, 7); g3.fill(); });
      const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace; const disc = new THREE.Mesh(new THREE.CircleGeometry(0.535, 48), new THREE.MeshBasicMaterial({ map: mt, toneMapped: false })); disc.rotation.x = -Math.PI / 2; disc.position.set(0, 1.10 + 0.966, 0); gltf.scene.add(disc);
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
  return habitat;
}
