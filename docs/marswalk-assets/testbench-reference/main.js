import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SH from './shaders.js';

const A = './assets/';
const $ = id => document.getElementById(id);
const status = $('status');

// ---------------------------------------------------------------- tiers
const TIERS = {
  high: { grid: 501, chunks: 4, ortho: 'ortho_hi.jpg', pixelRatio: 2, aniso: 8, shadowRes: 512,
          radius: [12, 55, 180], lod: [0.03, 0.008], blobs: true },
  low:  { grid: 189, chunks: 4, ortho: 'ortho_lo.jpg', pixelRatio: 1, aniso: 2, shadowRes: 256,
          radius: [0, 28, 110], lod: [0.05, 0.014], blobs: false },
};
// rock classes: counts per m2 from the Golombek Mars rock model at ~5 % cover (x1.6 max, thinned by HiRISE brightness)
const CLASSES = [
  { name: 'pebble', dens: 5.6 * 1.6,   D: [0.04, 0.10], types: [0],       sink: 0.10 },
  { name: 'small',  dens: 0.95 * 1.6,  D: [0.10, 0.30], types: [1, 0],    sink: 0.10 },
  { name: 'medium', dens: 0.08 * 1.6,  D: [0.30, 1.00], types: [3, 2, 1], sink: 0.15 },
  { name: 'large',  dens: 0.0004 * 1.6, D: [1.0, 2.5],  types: [4, 3],    sink: 0.20 },
];
const ROCK_NAMES = ['rock_09', 'rock_07', 'namaqualand_boulder_06', 'namaqualand_boulder_05', 'namaqualand_boulder_03'];
const CELL = 16, CAP = 16384;

// ---------------------------------------------------------------- renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.debug.onShaderError = (gl, prog, vs, fs) => { const m = (gl.getShaderInfoLog(fs) || '') + ' ' + (gl.getShaderInfoLog(vs) || '') + ' ' + (gl.getProgramInfoLog(prog) || ''); window.__err && window.__err('shader: ' + m.slice(0, 400)); };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 30000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 5; controls.maxDistance = 9000;

// shared uniforms (same objects referenced by every material)
const v3 = () => ({ value: new THREE.Vector3() }), f1 = (v = 0) => ({ value: v });
const U = {
  uSunDir: v3(), uSunColor: v3(), uAmbSky: v3(), uAmbGround: v3(), uSkyZenith: v3(), uSkyHorizon: v3(), uHaloColor: v3(), uInscatter: v3(),
  uHaloPower: f1(8), uHaloStrength: f1(0.2), uSkyIntensity: f1(1), uGradEnd: f1(0.6), uFogK: f1(1e-4),
  uSuitDust: f1(0.6), uSize: { value: new THREE.Vector2(1, 1) }, uRingSize: f1(12000), tShadow: { value: null }, tRing: { value: null },
  uFadeStart: f1(35), uFadeEnd: f1(110), uLayer: f1(0), uRelief: f1(220), uBlob: f1(0.5), uLamp: v3(), uCamDir: v3(), uLampCone: { value: new THREE.Vector2(0.93, 0.74) }, uLampRange: { value: new THREE.Vector2(4, 30) }, uInterior: f1(1.0), uTime: f1(0), uHabInv: { value: new THREE.Matrix4() }, uHabP0: { value: new THREE.Vector3(0, -1e5, 0) }, uHabP1: { value: new THREE.Vector3(1, -1e5, 0) }, uHabGlow: v3(), tVol: { value: null }, uLamp2Pos: { value: new THREE.Vector3(0, 1e6, 0) }, uLamp2Dir: { value: new THREE.Vector3(0, -1, 0) }, tCast: { value: null }, uCastC: { value: [new THREE.Vector3(0, -1e5, 0), new THREE.Vector3(0, -1e5, 0), new THREE.Vector3(0, -1e5, 0)] }, uCastS: { value: [1.3, 1.3, 8.0] }, uCastR: v3(), uCastU: v3(), uCastOn: f1(0), uRockR: v3(), uStars: f1(0), uSunDisc: f1(1), uSunCos: f1(0.9999),
};

// ---------------------------------------------------------------- loading helpers
const texLoader = new THREE.TextureLoader();
function tex(name, { srgb = false, repeat = false, aniso = 4 } = {}) {
  return new Promise((res, rej) => texLoader.load(A + name, t => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    res(t);
  }, undefined, () => rej(new Error('texture ' + name))));
}
const json = name => fetch(A + name).then(r => { if (!r.ok) throw new Error(name + ' ' + r.status); return r.json(); });
function b64u16(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Uint16Array(a.buffer); }
function b64u8(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }

// ---------------------------------------------------------------- terrain data
let T = null;   // { n, W, H, h: Float32Array, dens, dn }
let RING = null; // { n, size, h }
function bilinear(arr, n, fx, fy) {
  const x0 = Math.max(0, Math.min(n - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(n - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0)), i = y0 * n + x0;
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + n] * (1 - tx) + arr[i + n + 1] * tx) * ty;
}
const inTile = (x, z) => Math.abs(x) <= T.W / 2 && Math.abs(z) <= T.H / 2;
const tileH = (x, z) => bilinear(T.h, T.n, (x / T.W + 0.5) * (T.n - 1), (z / T.H + 0.5) * (T.n - 1));
const ringH = (x, z) => bilinear(RING.h, RING.n, (x / RING.size + 0.5) * (RING.n - 1), (z / RING.size + 0.5) * (RING.n - 1));
const groundH = (x, z) => inTile(x, z) ? tileH(x, z) : ringH(x, z);
// height on the mesh that is actually drawn in this tier (so rocks sit on the visible surface)
let meshGrid = null; // { n, h }
const meshH = (x, z) => bilinear(meshGrid.h, meshGrid.n, (x / T.W + 0.5) * (meshGrid.n - 1), (z / T.H + 0.5) * (meshGrid.n - 1));
function density(x, z) {
  const n = T.dn, c = Math.max(0, Math.min(n - 1, Math.floor((x / T.W + 0.5) * n))), r = Math.max(0, Math.min(n - 1, Math.floor((z / T.H + 0.5) * n)));
  const g = T.dens[r * n + c] / 255;
  return Math.max(0.08, Math.min(1, 0.08 + (g - 0.25) / 0.55 * 0.92));
}

// ---------------------------------------------------------------- terrain mesh
const terrainGroup = new THREE.Group(); scene.add(terrainGroup);
let terrainMat = null;
function buildTerrain(tier) {
  for (const m of [...terrainGroup.children]) { m.geometry.dispose(); terrainGroup.remove(m); }
  const N = tier.grid, h = new Float32Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) h[r * N + c] = bilinear(T.h, T.n, c / (N - 1) * (T.n - 1), r / (N - 1) * (T.n - 1));
  meshGrid = { n: N, h };
  const q = (N - 1) / tier.chunks;
  for (let cz = 0; cz < tier.chunks; cz++) for (let cx = 0; cx < tier.chunks; cx++) {
    const n = q + 1, pos = new Float32Array(n * n * 3), idx = new Uint32Array(q * q * 6);
    let p = 0, k = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const gc = cx * q + c, gr = cz * q + r;
      pos[p++] = (gc / (N - 1) - 0.5) * T.W; pos[p++] = h[gr * N + gc]; pos[p++] = (gr / (N - 1) - 0.5) * T.H;
    }
    for (let r = 0; r < q; r++) for (let c = 0; c < q; c++) {
      const a = r * n + c, b = a + 1, d = a + n, e = d + 1;
      idx[k++] = a; idx[k++] = d; idx[k++] = b; idx[k++] = b; idx[k++] = d; idx[k++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    terrainGroup.add(new THREE.Mesh(g, terrainMat));
  }
}

// ---------------------------------------------------------------- background ring (CTX, 12 km)
function buildRing(tRing) {
  const N = RING.n, S = RING.size, pos = new Float32Array(N * N * 3), idx = [];
  const hx = T.W / 2, hz = T.H / 2;
  for (let r = 0, p = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = (c / (N - 1) - 0.5) * S, z = (r / (N - 1) - 0.5) * S;
    let y = RING.h[r * N + c];
    if (Math.abs(x) < hx && Math.abs(z) < hz) y -= 4.0;            // tuck under the HiRISE tile
    pos[p++] = x; pos[p++] = y; pos[p++] = z;
  }
  for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) {
    const x = ((c + 0.5) / (N - 1) - 0.5) * S, z = ((r + 0.5) / (N - 1) - 0.5) * S;
    if (Math.abs(x) < hx - 80 && Math.abs(z) < hz - 80) continue;   // hole, with an overlap skirt
    const a = r * N + c, b = a + 1, d = a + N, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { ...U, tRing: { value: tRing } }, vertexShader: SH.RING_VERT, fragmentShader: SH.RING_FRAG }));
  m.frustumCulled = false; scene.add(m);
}

// ---------------------------------------------------------------- sky
function buildSky() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.SKY_VERT, fragmentShader: SH.SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
  m.frustumCulled = false; m.renderOrder = 10; scene.add(m);
}

// ---------------------------------------------------------------- sun shadow map (CPU ray-march of the real heightfield, once per preset)
let shadowTex = null;
function computeShadows(res) {
  const d = U.uSunDir.value, data = new Uint8Array(res * res);
  const hl = Math.hypot(d.x, d.z), maxH = 760;
  for (let j = 0; j < res; j++) {
    const z = (0.5 - j / (res - 1)) * T.H;
    for (let i = 0; i < res; i++) {
      const x = (i / (res - 1) - 0.5) * T.W, y0 = tileH(x, z) + 0.4;
      let occ = 0, t = 4;
      for (let s = 0; s < 80 && occ < 1; s++) {
        const y = y0 + d.y * t; if (y > maxH) break;
        const px = x + d.x * t, pz = z + d.z * t;
        if (Math.abs(px) > 5900 || Math.abs(pz) > 5900) break;
        const o = (groundH(px, pz) - y) / (t * 0.03 * Math.max(hl, 0.2) + 0.5);
        if (o > occ) occ = o;
        t *= 1.11; t += 1.5;
      }
      data[j * res + i] = 255 * (1 - Math.min(1, occ));
    }
  }
  if (shadowTex) shadowTex.dispose();
  shadowTex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  shadowTex.magFilter = shadowTex.minFilter = THREE.LinearFilter; shadowTex.needsUpdate = true;
  U.tShadow.value = shadowTex;
}

// ---------------------------------------------------------------- atmosphere presets
let PRESETS = null, presetName = 'clear_day';
function applyPreset(name) {
  presetName = name; const p = PRESETS[name], S = p.sun.intensity;
  const sun = new THREE.Vector3(...p.sun.direction_threejs).normalize(); U.uSunDir.value.copy(sun);
  U.uSunColor.value.set(...p.sun.color).multiplyScalar(S / Math.PI);
  const zen = new THREE.Vector3(...p.sky.zenith), hor = new THREE.Vector3(...p.sky.horizon), I = p.sky.intensity;
  U.uSkyZenith.value.copy(zen); U.uSkyHorizon.value.copy(hor); U.uHaloColor.value.set(...p.sky.halo_color);
  U.uHaloPower.value = p.sky.halo_power; U.uHaloStrength.value = p.sky.halo_strength; U.uSkyIntensity.value = I; U.uGradEnd.value = p.sky.gradient_end_elev;
  const avg = zen.clone().multiplyScalar(0.6).addScaledVector(hor, 0.4).multiplyScalar(I);
  U.uAmbSky.value.copy(avg);
  const bounce = S / Math.PI * Math.max(sun.y, 0) * 0.5;
  U.uAmbGround.value.copy(avg).multiplyScalar(0.35).add(new THREE.Vector3(0.40, 0.20, 0.10).multiplyScalar(bounce));
  const lumAvg = 0.2126 * avg.x + 0.7152 * avg.y + 0.0722 * avg.z;
  U.uFogK.value = p.fog.blender_extinction_per_m;
  U.uInscatter.value.set(...p.fog.color).multiplyScalar((S / (4 * Math.PI) + lumAvg) * 0.9);
  const soft = p.sun.angular_diameter_deg > 3;
  U.uSunDisc.value = soft ? 0.6 : 6.0;
  U.uSunCos.value = Math.cos(THREE.MathUtils.degToRad(Math.max(p.sun.angular_diameter_deg, 0.6)));
  const sunTerm = S / Math.PI * Math.max(sun.y, 0.05);
  U.uBlob.value = 0.8 * sunTerm / (sunTerm + lumAvg) * (soft ? 0.35 : 1);
  renderer.toneMappingExposure = Math.pow(2, p.exposure_stops) * 0.72; U.uInterior.value = Math.pow(2, 0.15 - p.exposure_stops);   // the cabin lights do not change with the weather: cancel the outdoor exposure change indoors
  const lp = p.lamp || { intensity: 0 };
  U.uLamp.value.set(...(lp.color || [1, 1, 1])).multiplyScalar(lp.intensity / Math.PI);
  if (lp.cone_cos_inner) U.uLampCone.value.set(lp.cone_cos_inner, lp.cone_cos_outer);
  U.uLampRange.value.set(lp.half_distance_m || 4, lp.range_m || 30);
  U.uStars.value = p.sky.stars || 0;
  if (T) { computeShadows(TIERS[tier].shadowRes); rocks.reset(); }
  document.querySelectorAll('[data-atmo]').forEach(b => b.classList.toggle('on', b.dataset.atmo === name));
}

// ---------------------------------------------------------------- rocks
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rocks = {
  meshes: [], heights: [], blob: null, cache: new Map(), large: null, last: new THREE.Vector3(1e9, 0, 0), enabled: true, total: 0,
  init(data, maps) {
    ROCK_NAMES.forEach((name, ti) => {
      const mat = new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: maps[ti] }, uRockH: f1(data[name].lods[0].height) }, vertexShader: SH.ROCK_VERT, fragmentShader: SH.ROCK_FRAG });
      this.heights[ti] = data[name].lods[0].height;
      data[name].lods.forEach((l, li) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(l.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(l.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(l.uv, 2)); g.setIndex(l.i);
        const m = new THREE.InstancedMesh(g, mat, CAP); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(m); this.meshes[ti * 3 + li] = m;
      });
    });
    const q = new THREE.PlaneGeometry(1, 1); q.rotateX(-Math.PI / 2);
    this.blob = new THREE.InstancedMesh(q, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.BLOB_VERT, fragmentShader: SH.BLOB_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), CAP);
    this.blob.count = 0; this.blob.frustumCulled = false; this.blob.renderOrder = 1; this.blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.blob);
  },
  reset() { this.cache.clear(); this.large = null; this.last.set(1e9, 0, 0); },
  // deterministic rocks for one cell (or the whole tile for the large class)
  gen(ci, x0, z0, w, d, seed) {
    const cls = CLASSES[ci], r = mulberry(seed), nExp = cls.dens * w * d, n = Math.floor(nExp) + (r() < nExp % 1 ? 1 : 0);
    const mat = [], bmat = [], meta = [];
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), Qy = new THREE.Quaternion(), Sc = new THREE.Vector3(), Nrm = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), E = new THREE.Euler();
    const sun = U.uSunDir.value, sh = Math.hypot(sun.x, sun.z) || 1e-3, sdx = -sun.x / sh, sdz = -sun.z / sh, tanE = Math.max(sun.y, 0.08) / sh;
    const X = new THREE.Vector3(), Z = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * w, z = z0 + r() * d, acc = r(), u = r(), tp = r(), yaw = r() * 6.2832, t1 = (r() - 0.5) * 0.5, t2 = (r() - 0.5) * 0.5;
      if (Math.abs(x) > T.W / 2 - 2 || Math.abs(z) > T.H / 2 - 2) continue;
      if (acc > density(x, z)) continue;
      if (x * x + z * z < (ci >= 2 ? 30 : 2.2)) continue;                         // keep Cheyava Falls clear
      if ((x - habitat.pos.x) ** 2 + (z - habitat.pos.z) ** 2 < habitat.clear * habitat.clear) continue;   // keep the habitat pad clear
      const D = cls.D[0] * Math.pow(cls.D[1] / cls.D[0], u * u), type = cls.types[Math.min(cls.types.length - 1, Math.floor(tp * cls.types.length))];
      const hgt = this.heights[type] * D, y = meshH(x, z);
      Nrm.set(meshH(x - 1, z) - meshH(x + 1, z), 2, meshH(x, z - 1) - meshH(x, z + 1)).normalize();
      Q.setFromUnitVectors(up, Nrm); Qy.setFromEuler(E.set(t1, yaw, t2, 'YXZ')); Q.multiply(Qy);
      P.set(x, y - cls.sink * hgt, z); Sc.set(D, D, D); M.compose(P, Q, Sc);
      for (let k = 0; k < 16; k++) mat.push(M.elements[k]);
      // soft contact shadow quad, stretched away from the sun, lying on the slope
      const len = Math.min(hgt / tanE, D * 5) + D * 0.9, wid = D * 1.05, off = (len - D * 0.9) * 0.5;
      X.set(sdx, 0, sdz); X.addScaledVector(Nrm, -X.dot(Nrm)).normalize(); Z.crossVectors(X, Nrm);
      const cxp = x + X.x * off, cyp = y + X.y * off + 0.02, czp = z + X.z * off;
      bmat.push(X.x * len, X.y * len, X.z * len, 0, Nrm.x, Nrm.y, Nrm.z, 0, Z.x * wid, Z.y * wid, Z.z * wid, 0, cxp, cyp, czp, 1);
      meta.push(x, z, D, type);
    }
    return { n: meta.length / 4, mat: new Float32Array(mat), bmat: new Float32Array(bmat), meta: new Float32Array(meta) };
  },
  cell(ci, cx, cz) {
    const key = ci + ':' + cx + ':' + cz; let c = this.cache.get(key);
    if (!c) { c = this.gen(ci, cx * CELL, cz * CELL, CELL, CELL, (cx * 73856093) ^ (cz * 19349663) ^ ((ci + 1) * 83492791)); this.cache.set(key, c); }
    return c;
  },
  // reference collision: pushes a walker (radius pr) out of rocks 0.35 m and larger; same deterministic rocks as the ones drawn
  collide(p, pr) {
    const hit = (x, z, rad) => { const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), m = rad + pr; if (d < m && d > 1e-4) { p.x = x + dx / d * m; p.z = z + dz / d * m; } };
    const scan = c => { for (let i = 0; i < c.n; i++) { const D = c.meta[i * 4 + 2]; if (D >= 0.35) hit(c.meta[i * 4], c.meta[i * 4 + 1], D * 0.40); } };
    if (this.enabled) { const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      for (let ci = 1; ci < 3; ci++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) scan(this.cell(ci, cx + i, cz + j));
      if (this.large) scan(this.large); }
    hit(0, 0, 0.75);   // Cheyava Falls rock
  },
  update(cam, tier, force) {
    if (!force && Math.hypot(cam.x - this.last.x, cam.z - this.last.z) < 4) return;
    this.last.copy(cam);
    const counts = new Int32Array(15); let nb = 0; const barr = this.blob.instanceMatrix.array, [l0, l1] = tier.lod;
    const put = (c, ci, R) => {
      const R2 = R * R;
      for (let i = 0; i < c.n; i++) {
        const x = c.meta[i * 4], z = c.meta[i * 4 + 1], dx = x - cam.x, dz = z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        const D = c.meta[i * 4 + 2], s = D / Math.max(Math.sqrt(d2), 0.5), mi = c.meta[i * 4 + 3] * 3 + (s > l0 ? 0 : s > l1 ? 1 : 2);
        if (counts[mi] >= CAP) continue;
        const arr = this.meshes[mi].instanceMatrix.array, o = counts[mi]++ * 16, so = i * 16;
        for (let k = 0; k < 16; k++) arr[o + k] = c.mat[so + k];
        if (tier.blobs && ci > 0 && d2 < 8100 && nb < CAP) { const bo = nb++ * 16; for (let k = 0; k < 16; k++) barr[bo + k] = c.bmat[so + k]; }
      }
    };
    if (this.enabled) {
      for (let ci = 0; ci < 3; ci++) {
        const R = tier.radius[ci]; if (!R) continue;
        const c0x = Math.floor((cam.x - R) / CELL), c1x = Math.floor((cam.x + R) / CELL), c0z = Math.floor((cam.z - R) / CELL), c1z = Math.floor((cam.z + R) / CELL);
        for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) put(this.cell(ci, cx, cz), ci, R);
      }
      if (!this.large) this.large = this.gen(3, -T.W / 2, -T.H / 2, T.W, T.H, 424242);
      put(this.large, 3, 1e6);
    }
    this.total = 0;
    this.meshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; this.total += counts[i]; });
    this.blob.count = nb; this.blob.instanceMatrix.needsUpdate = true;
    if (this.cache.size > 4000) this.cache.clear();
  },
};

// ---------------------------------------------------------------- Cheyava Falls hero rock
let cheyavaMesh = null;
async function buildCheyava(maps) {
  const d = await json('cheyava.json'), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2)); g.setIndex(d.i);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ defines: { HERO: 1 }, uniforms: { ...U, tMap: { value: maps[0] }, tNao: { value: maps[1] }, uRockH: f1(0.3) }, vertexShader: SH.ROCK_VERT, fragmentShader: SH.ROCK_FRAG }));
  m.position.set(0, tileH(0, 0) - 0.06, 0); m.rotation.y = d.rot_z_blender || 0; scene.add(m);
  return m;
}


// ---------------------------------------------------------------- route (A* on slope + rock cost) and waypoints
const route = {
  data: null, group: new THREE.Group(), els: [], pts: [],
  slopeDeg(x, z) { const gx = (tileH(x + 2, z) - tileH(x - 2, z)) / 4, gz = (tileH(x, z + 2) - tileH(x, z - 2)) / 4; return Math.atan(Math.hypot(gx, gz)) * 57.2958; },
  // placeholder planner: 4 m grid, 8 neighbours, cost grows with slope^2 and rock abundance, > 25 deg is NO-GO
  astar(a, b) {
    const G = 4, nx = Math.floor(T.W / G), nz = Math.floor(T.H / G), N = nx * nz;
    if (!this.cost) { this.cost = new Float32Array(N); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = (i + 0.5) * G - T.W / 2, z = (j + 0.5) * G - T.H / 2, s = this.slopeDeg(x, z); this.cost[j * nx + i] = s > 25 ? Infinity : 1 + (s / 9) * (s / 9) + 0.6 * density(x, z); } }
    const ci = p => Math.max(0, Math.min(nx - 1, Math.floor((p.x + T.W / 2) / G))), cj = p => Math.max(0, Math.min(nz - 1, Math.floor((p.z + T.H / 2) / G)));
    const s = cj(a) * nx + ci(a), g = cj(b) * nx + ci(b), gi = g % nx, gj = (g / nx) | 0;
    const dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = [[0, s]]; dist[s] = 0;
    const push = e => { let i = heap.push(e) - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let m = i; const a2 = 2 * i + 1, b2 = a2 + 1; if (a2 < heap.length && heap[a2][0] < heap[m][0]) m = a2; if (b2 < heap.length && heap[b2][0] < heap[m][0]) m = b2; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
    while (heap.length) {
      const [, u] = pop(); if (u === g) break; const ui = u % nx, uj = (u / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const vi = ui + di, vj = uj + dj; if (vi < 0 || vj < 0 || vi >= nx || vj >= nz) continue;
        const v = vj * nx + vi, c = this.cost[v]; if (c === Infinity && v !== g) continue;
        const nd = dist[u] + Math.hypot(di, dj) * G * (c === Infinity ? 50 : c);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd + Math.hypot(vi - gi, vj - gj) * G, v]); }
      }
    }
    if (prev[g] < 0 && g !== s) return null;
    const out = []; for (let u = g; u >= 0; u = prev[u]) out.push([(u % nx + 0.5) * G - T.W / 2, (((u / nx) | 0) + 0.5) * G - T.H / 2]);
    out.reverse(); out[0] = [a.x, a.z]; out[out.length - 1] = [b.x, b.z]; return out;
  },
  build() {
    if (!this.data || !meshGrid) return;
    if (!this.group.parent) scene.add(this.group);
    for (const m of [...this.group.children]) { m.geometry.dispose(); this.group.remove(m); }
    const W = this.data.waypoints; let path = this.data.path, planned = !!path;
    if (!path) { path = []; for (let i = 0; i < W.length - 1; i++) { const seg = this.astar(W[i], W[i + 1]) || [[W[i].x, W[i].z], [W[i + 1].x, W[i + 1].z]]; path.push(...(i ? seg.slice(1) : seg)); } }
    for (let k = 0; k < 2; k++) { const q = [path[0]]; for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } q.push(path[path.length - 1]); path = q; }
    const n = path.length, pos = new Float32Array(n * 6), dir = new Float32Array(n * 6), side = new Float32Array(n * 2), len = new Float32Array(n * 2), idx = [];
    let L = 0, up = 0, maxS = 0, py = 0;
    for (let i = 0; i < n; i++) {
      const [x, z] = path[i], y = meshH(x, z) + 0.15, a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
      if (i) { L += Math.hypot(x - path[i - 1][0], z - path[i - 1][1]); if (y > py) up += y - py; } py = y; maxS = Math.max(maxS, this.slopeDeg(x, z));
      for (let s = 0; s < 2; s++) { const o = (i * 2 + s) * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; dir[o] = dx / dl; dir[o + 2] = dz / dl; side[i * 2 + s] = s ? 1 : -1; len[i * 2 + s] = L; }
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setAttribute('aLen', new THREE.BufferAttribute(len, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.ROUTE_VERT, fragmentShader: SH.ROUTE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    m.frustumCulled = false; m.renderOrder = 2; this.group.add(m);
    const ringG = new THREE.TorusGeometry(2.2, 0.12, 6, 40); ringG.rotateX(Math.PI / 2);
    this.pts = W.map(w => { const r = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0x8fd3ee, toneMapped: false })); r.position.set(w.x, meshH(w.x, w.z) + 0.3, w.z); this.group.add(r); return r.position.clone().setY(r.position.y + 2.2); });
    if (!this.els.length) this.els = W.map(w => { const d = document.createElement('div'); d.className = 'wp'; d.textContent = w.name; document.body.appendChild(d); return d; });
    const walk = L / 1.0 / 60;   // ~1 m/s suited walking pace (assumption)
    $('routeinfo').textContent = `Route ${(L / 1000).toFixed(2)} km · +${up.toFixed(0)} m climb · max slope ${maxS.toFixed(0)}° · ~${walk.toFixed(0)} min at 1 m/s` + (planned ? '' : ' · placeholder planner');
  },
  labels() {
    const v = new THREE.Vector3();
    this.els.forEach((el, i) => { v.copy(this.pts[i]).project(camera); const on = this.group.visible && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
      el.style.display = on ? 'block' : 'none'; if (on) el.style.transform = `translate(-50%,-100%) translate(${(v.x * .5 + .5) * innerWidth}px,${(-v.y * .5 + .5) * innerHeight}px)`; });
  },
};


// ---------------------------------------------------------------- astronaut cast shadows (High tier): silhouettes rendered from the sun into a small mask
const cast = {   // slots 0 and 1 are redrawn every frame (astronauts, layer 1); slot 2 (habitat, layer 2) only when the sun moves
  rt: new THREE.WebGLRenderTarget(768, 256), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80),
  mat: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }), on: [false, false, false], sunSeen: new THREE.Vector3(), dirty: true,
  mark(root, only) { root.traverse(o => { if (o.isSkinnedMesh) { if (only) o.layers.set(1); else o.layers.enable(1); } }); },
  set(i, on, x, y, z) { this.on[i] = on; if (on) U.uCastC.value[i].set(x, y + 1.0, z); else U.uCastC.value[i].set(0, -1e5, 0); },
  render() {
    const active = tier === 'high' && U.uBlob.value > 0.02 && (this.on[0] || this.on[1] || this.on[2]); U.uCastOn.value = active ? 1 : 0; if (!active) { this.dirty = true; return; }
    const s = U.uSunDir.value, r = U.uCastR.value.set(0, 1, 0).cross(s).normalize(), u = U.uCastU.value.copy(s).cross(r).normalize();
    if (!this.sunSeen.equals(s)) { this.sunSeen.copy(s); this.dirty = true; }
    U.tCast.value = this.rt.texture; this.rt.scissorTest = true;
    const bg = scene.background; scene.background = null; scene.overrideMaterial = this.mat; renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 1);
    for (let i = 0; i < 3; i++) {
      if (i === 2 && !this.dirty) continue;
      this.rt.viewport.set(i * 256, 0, 256, 256); this.rt.scissor.set(i * 256, 0, 256, 256); renderer.setRenderTarget(this.rt); renderer.clear();
      if (!this.on[i]) continue; const c = U.uCastC.value[i], hs = U.uCastS.value[i];
      this.cam.left = -hs; this.cam.right = hs; this.cam.top = hs; this.cam.bottom = -hs; this.cam.updateProjectionMatrix(); this.cam.layers.set(i === 2 ? 2 : 1);
      this.cam.position.copy(c).addScaledVector(s, 30); this.cam.up.copy(u); this.cam.lookAt(c); this.cam.updateMatrixWorld();
      renderer.render(scene, this.cam);
    }
    this.dirty = false; scene.overrideMaterial = null; scene.background = bg; renderer.setRenderTarget(null);
  },
};

// ---------------------------------------------------------------- partner astronaut (NASA Z-2, skinned, animated)
const COLORS = [[1.0, 0.32, 0.03], [0.05, 0.25, 0.9], [0.1, 0.8, 0.3], [0.85, 0.1, 0.75]];
const partner = {
  free: null, bending: false, carrying: true, wantCarry: true,
  toggleCase() {   // reference hand-over. Down: walk to 1.6 m from the player, face them, bend and release the case (0.9 s), lid opens.
                   // Up: lid closes, bend and grab (0.9 s), walk back to the patrol path. The same bend clip serves both.
    if (this.bending || (this.free && (this.free.goal || this.free.then))) return;
    const bendNow = () => { this.bending = true; this.bend.reset().setEffectiveWeight(1).play(); };
    if (this.carrying) {
      const p = this.root.position, dx = p.x - eye.x, dz = p.z - eye.z, d = Math.hypot(dx, dz) || 1;
      this.wantCarry = false; this.free = { x: p.x, z: p.z, goal: d > 1.7 ? { x: eye.x + dx / d * 1.6, z: eye.z + dz / d * 1.6 } : null, face: { x: eye.x, z: eye.z }, then: bendNow };
    } else { this.wantCarry = true; this.free.face = { x: props.tcase.position.x + 1e-3, z: props.tcase.position.z }; this.free.face = null; bendNow(); }
  },
  // Reference: the partner walks into the habitat and back out. Waypoints are in habitat space (x toward the airlock end, v sideways);
  // the floor comes from the habitat's walk zones and the stooped walk fades in wherever habitat.duck() asks for a stoop.
  inside: false, stoop: 0,
  visitHabitat() {
    if (this.bending || !habitat.root || (this.free && (this.free.goal || this.free.then || (this.free.queue && this.free.queue.length)))) return;
    const h = habitat, t = h.root.rotation.y, c = Math.cos(t), sn = Math.sin(t), W = (x, v) => ({ x: h.pos.x + x * c + v * sn, z: h.pos.z - x * sn + v * c });
    const way = [[11.4, 0], [9.95, 0], [8.2, 0], [7.3, 0], [6.6, 0], [3.2, 0], [2.0, 0], [1.4, 0.15], [1.25, 0.55]].map(q => W(q[0], q[1])), p = this.root.position;
    if (!this.inside) { this.free = { x: p.x, z: p.z, goal: way[0], queue: way.slice(1), face: W(0, 0) }; this.inside = true; }
    else { const back = way.slice(0, -1).reverse(); this.free = { x: p.x, z: p.z, goal: back[0], queue: back.slice(1).concat([{ x: this.A.x + (this.B.x - this.A.x) * this.t, z: this.A.z + (this.B.z - this.A.z) * this.t }]), leave: true }; this.inside = false; }
  },
  root: null, mixer: null, acts: {}, uPlayer: { value: new THREE.Vector3(...COLORS[0]) }, ci: 0, t: 0, dir: 1, pause: 0, blob: null,
  A: new THREE.Vector3(14, 0, 58), B: new THREE.Vector3(5, 0, 12),
  async init() {
    const j = await fetch('./assets_astronaut/z2_astronaut.glb.json').then(r => r.json());
    const bin = Uint8Array.from(atob(j.glb), c => c.charCodeAt(0)).buffer;
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(bin, './', res, rej));
    const accent = await new Promise((res, rej) => texLoader.load('./assets_astronaut/z2_accent_mask.png', res, undefined, rej)); accent.flipY = false;
    this.root = gltf.scene;
    this.root.traverse(o => { if (o.isMesh) { const map = o.material.map; o.frustumCulled = false; this.map = map; this.accent = accent;
      o.material = new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: map }, tAccent: { value: accent }, uPlayer: this.uPlayer }, vertexShader: SH.SUIT_VERT, fragmentShader: SH.SUIT_FRAG }); } });
    this.gltf = gltf; cast.mark(this.root, false);
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
    $('partnerinfo').textContent = 'anims: ' + gltf.animations.map(a => `${a.name} ${a.duration.toFixed(1)}s`).join(', ');
  },
  update(dt) {
    if (!this.root || !this.root.visible) { cast.set(1, false); U.uLamp2Pos.value.set(0, 1e6, 0); if (this.glow) this.glow.visible = false; return; }
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
    const yT = habitat.root ? habitat.ground(x, z) : meshH(x, z), y = this.root.position.y + (yT - this.root.position.y) * (Math.abs(yT - this.root.position.y) > 1.5 ? 1 : Math.min(1, dt * 10));   // habitat floor, steps and sills
    this.stoop += ((habitat.root && habitat.duck(x, z) > 0.15 ? 1 : 0) - this.stoop) * Math.min(1, dt * 5);
    this.nw = (this.nw === undefined ? 1 : this.nw) + (w - (this.nw === undefined ? 1 : this.nw)) * Math.min(1, dt * 4); const nw = this.nw;
    this.acts.walk.setEffectiveWeight(this.bending ? 0 : nw * (1 - this.stoop)); this.acts.walk_stoop.setEffectiveWeight(this.bending ? 0 : nw * this.stoop); this.acts.idle.setEffectiveWeight(this.bending ? 0 : 1 - nw);
    if (this.bending && this.bend.time >= 0.9 && this.carrying !== this.wantCarry) { this.carrying = this.wantCarry; if (!this.carrying) props.dropCase(); }
    this.root.position.set(x, y, z); this.blob.position.set(x, y + 0.03, z); cast.set(1, true, x, y, z); this.blob.material.uniforms.opacity.value = (tier === 'high' ? 0.3 : 0.9) * U.uBlob.value;
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


// ---------------------------------------------------------------- first-person legs (same Z-2 mesh cut at the waist, same rig + walk/idle, reuses the astronaut texture)
const legs = {
  root: null, mixer: null, acts: {}, on: true,
  async init() {
    const j = await fetch('./assets_astronaut/z2_fp_legs.glb.json').then(r => r.json());
    const bin = Uint8Array.from(atob(j.glb), c => c.charCodeAt(0)).buffer;
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(bin, './', res, rej));
    this.root = gltf.scene;
    this.root.traverse(o => { if (o.isMesh) { o.frustumCulled = false;
      o.material = new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: partner.map }, tAccent: { value: partner.accent }, uPlayer: arms.uPlayer }, vertexShader: SH.SUIT_VERT, fragmentShader: SH.SUIT_FRAG }); } });
    scene.add(this.root); this.mixer = new THREE.AnimationMixer(this.root);
    gltf.animations.forEach(a => { this.acts[a.name] = this.mixer.clipAction(a); this.acts[a.name].play(); });
    this.acts.walk.setEffectiveWeight(0);
    // the player's own shadow: an invisible copy of the full astronaut that only casts
    this.body = cloneSkinned(partner.gltf.scene); const drop = [];
    this.body.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; }); cast.mark(this.body, true);   // layer 1 only: never drawn by the main camera
    drop.forEach(o => o.parent.remove(o)); scene.add(this.body);
    this.bmixer = new THREE.AnimationMixer(this.body); this.bacts = {};
    partner.gltf.animations.forEach(a => { if (a.name !== 'walk' && a.name !== 'idle') return; this.bacts[a.name] = this.bmixer.clipAction(a); this.bacts[a.name].play(); }); this.bacts.walk.setEffectiveWeight(0);
  },
  update(dt, speed) {   // speed in m/s; the head leans forward of the hips as you look down
    if (!this.root) return; this.root.visible = this.on && mode === 'eye' && arms.cam.drop > -0.15; if (this.body) this.body.visible = false; if (this.blob) this.blob.visible = false; cast.set(0, false); if (!this.root.visible) return;
    const back = 0.10 + 0.22 * Math.max(0, Math.sin(pitch)), bx = eye.x - Math.sin(yaw) * back, bz = eye.z + Math.cos(yaw) * back;
    this.root.position.set(bx, habitat.ground(bx, bz), bz); this.root.rotation.y = Math.atan2(Math.sin(yaw), -Math.cos(yaw));
    const w = this.acts.walk.getEffectiveWeight(), t = speed > 0.1 ? 1 : 0, nw = w + (t - w) * Math.min(1, dt * 6);
    this.acts.walk.setEffectiveWeight(nw); this.acts.idle.setEffectiveWeight(1 - nw);
    this.mixer.update(dt * (speed > 0.1 ? speed * 1.2 : 1));
    if (!this.blob) { this.blob = partner.blob.clone(); this.blob.material = partner.blob.material.clone(); scene.add(this.blob); }
    this.blob.visible = tier !== 'high'; this.blob.position.set(bx, meshH(bx, bz) + 0.03, bz); this.blob.material.uniforms.opacity.value = 0.9 * U.uBlob.value;
    cast.set(0, true, bx, meshH(bx, bz), bz);
    if (this.body) { this.body.visible = tier === 'high'; this.body.position.copy(this.root.position); this.body.rotation.y = this.root.rotation.y;
      this.bacts.walk.setEffectiveWeight(nw); this.bacts.idle.setEffectiveWeight(1 - nw); this.bacts.walk.time = this.acts.walk.time; this.bacts.idle.time = this.acts.idle.time; this.bmixer.update(0);
      }
  },
};

// ---------------------------------------------------------------- first-person arms (left carries the wrist screen; right = mirrored copy)
const LAYER_NAMES = ['VISIBLE', 'SLOPE HAZARD', 'ELEVATION', 'ROCK ABUNDANCE', 'OUTCROP'];
const arms = {
  L: null, R: null, state: 'down', canvas: null, tex: null, uPlayer: { value: new THREE.Vector3(0.05, 0.25, 0.9) },
  // camera-space placements: elbow position, arm direction, "back of hand" direction, finger pose
  P: {
    // 'body' entries are relative to the torso (yaw only), so the hands rise into view as you look down
    down:   { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.30, -0.40, -0.08], [-0.12, 0.17, -1], [-0.25, 1, 0.2], 'relaxed', 'body'] },
    screen: { L: [[-0.36, -0.27, -0.58], [0.95, 0.06, -0.14], [0.0, 0.42, 0.91], 'fist'],   R: [[0.33, -0.31, -0.13], [-0.75, 0.24, -0.63], [0.2, 1, 0.3], 'point'] },
    point:  { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.26, -0.30, -0.22], [-0.16, 0.14, -1], [0.25, 1, 0], 'point'] },
    tool:   { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.27, -0.33, -0.10], [-0.20, 0.16, -1], [1, 0.25, 0], 'fist'] },
    open:   { L: [[-0.22, -0.34, -0.30], [0.12, 0.30, -1], [0, 0.3, 1], 'open'],      R: [[0.22, -0.34, -0.30], [-0.12, 0.30, -1], [0, 0.3, 1], 'open'] },
    pinch:  { L: [[-0.30, -0.40, -0.08], [0.12, 0.17, -1], [0.25, 1, 0.2], 'relaxed', 'body'], R: [[0.20, -0.30, -0.24], [-0.14, 0.18, -1], [0.5, 1, 0], 'pinch'] },
  },
  async init() {
    const j = await fetch('./assets_astronaut/arm_left.glb.json').then(r => r.json());
    const bin = Uint8Array.from(atob(j.glb), c => c.charCodeAt(0)).buffer;
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(bin, './', res, rej));
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 352;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.flipY = false; this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uPlayer: this.uPlayer }, vertexShader: SH.ARM_VERT, fragmentShader: SH.ARM_FRAG, vertexColors: true, side: THREE.DoubleSide });
    const screenMat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    const mk = (mirror) => {
      const inner = mirror ? cloneSkinned(gltf.scene) : gltf.scene, g = new THREE.Group(), flip = new THREE.Group();
      flip.rotation.y = Math.PI; if (mirror) flip.scale.x = -1; flip.add(inner); g.add(flip);
      inner.traverse(o => { if (o.isMesh) { o.frustumCulled = false; const scr = o.material.name === 'Screen'; o.material = scr ? screenMat : mat; if (scr && mirror) o.visible = false; if (mirror && o.name.startsWith('WristScreen')) o.visible = false; } });
      const mixer = new THREE.AnimationMixer(inner), acts = {};
      gltf.animations.forEach(a => { acts[a.name] = mixer.clipAction(a); acts[a.name].play(); acts[a.name].setEffectiveWeight(a.name === 'relaxed' ? 1 : 0); });
      camera.add(g); return { g, mixer, acts, pose: 'relaxed', pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    };
    this.L = mk(false); this.R = mk(true); scene.add(camera);
    // whole-arm animation clips (authored in Blender on the arm skeleton, camera space, right hand)
    const cj = await fetch('./assets_astronaut/arm_clips.glb.json').then(r => r.json());
    const cg = await new Promise((res, rej) => new GLTFLoader().parse(Uint8Array.from(atob(cj.glb), c => c.charCodeAt(0)).buffer, './', res, rej));
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
  // right index fingertip is solved onto the selected row of the wrist screen, approaching from above the screen plane
  tapTarget() {
    const L = this.basis(...this.P.screen.L), row = U.uLayer.value | 0, hover = this.tap > 0 ? 0.001 : 0.014;
    const lx = ((74 + row * 52 + 20) / 352 - 0.5) * 0.08, lz = -0.155 - 0.116 * (350 / 512);
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(L.quat), S = new THREE.Vector3(lx, 0.0806 + hover, lz).applyQuaternion(L.quat).add(L.pos);
    const E0 = S.clone().addScaledVector(n, 0.21).add(new THREE.Vector3(0.50, -0.12, -0.04)), d = S.clone().sub(E0).normalize();
    const R = this.basis([0, 0, 0], [d.x, d.y, d.z], [n.x, n.y, n.z], 'point');
    R.pos.copy(S).sub(new THREE.Vector3(-0.051, -0.012, -0.571).applyQuaternion(R.quat)); return R;
  },
  target(side) {
    if (this.state === 'screen' && side === 'R') return this.tapTarget();
    const e = this.P[this.state][side]; if (e[4] !== 'body') return this.basis(...e);
    const pc = mode === 'eye' ? Math.max(-0.3, Math.min(0.45, pitch)) : 0, ax = new THREE.Vector3(1, 0, 0), r = v => new THREE.Vector3(...v).applyAxisAngle(ax, pc).toArray();
    const sw = Math.sin(this.swing) * 0.012 * this.walk * (side === 'L' ? 1 : -1), p = e[0]; return this.basis(r([p[0], p[1] + Math.abs(sw) * 0.5, p[2] + sw]), r(e[1]), r(e[2]), e[3]);
  },
  swing: 0, walk: 0,
  CLIP_PITCH: { collect_ground: 0.96, collect_rock: 0.61, stow_sample: 0, pour_sample: 0.70 },   // largest look-down angle of each clip's camera track (rad)
  clip: null, camClip: null, cam: { drop: 0, fwd: 0, pitch: 0 },   // cam: camera offset from the standing eye while a clip plays (m, m, rad)
  play(name) {   // the clip starts and ends exactly on the "tool" hold, so it can take over the arm without a jump
    if (this.clip || !this.clips[name]) return; this.set('tool', true);
    const R = this.R; R.g.position.set(0, 0, 0); R.g.quaternion.identity(); for (const n in R.acts) R.acts[n].setEffectiveWeight(0);
    this.clipName = name; if (name.startsWith('collect_')) props.content = null;
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
    document.querySelectorAll('[data-arms]').forEach(b => b.classList.toggle('on', b.dataset.arms === state));
  },
  update(dt) {
    if (!this.L) return; const k = Math.min(1, dt * 5);
    if (this.tap > 0) this.tap -= dt;
    if (this.state === 'screen') { const t = this.tapTarget(); this.R.pos.copy(t.pos); this.R.quat.copy(t.quat); }
    this.walk += ((moveSpeed > 0.1 ? 1 : 0) - this.walk) * k; this.swing += dt * 5.2;
    for (const side of ['L', 'R']) if (this.P[this.state][side][4] === 'body') { const t = this.target(side); this[side].pos.copy(t.pos); this[side].quat.copy(t.quat); }
    for (const side of ['L', 'R']) {
      const a = this[side]; if (side === 'R' && this.clip) { a.mixer.update(dt); if (this.camClip) { this.camMixer.update(dt); this.cam.drop = this.camNode.position.y; this.cam.fwd = this.camNode.position.z; this.cam.pitch = this.camQ0.angleTo(this.camNode.quaternion); } continue; }
      a.g.position.lerp(a.pos, k); a.g.quaternion.slerp(a.quat, k);
      for (const n in a.acts) { const w = a.acts[n].getEffectiveWeight(), t = n === a.pose ? 1 : 0; a.acts[n].setEffectiveWeight(w + (t - w) * k); }
      a.mixer.update(dt);
    }
  },
  draw() {
    const c = this.canvas.getContext('2d'), W = 512, H = 352, cur = U.uLayer.value | 0;
    c.fillStyle = '#06181d'; c.fillRect(0, 0, W, H); c.strokeStyle = '#8fd3ee'; c.lineWidth = 3; c.strokeRect(8, 8, W - 16, H - 16);
    c.fillStyle = '#8fd3ee'; c.font = '600 22px sans-serif'; c.fillText('VISION LAYER', 28, 46);
    LAYER_NAMES.forEach((n, i) => { const y = 74 + i * 52; c.fillStyle = i === cur ? '#8fd3ee' : 'rgba(143,211,238,.14)'; c.fillRect(28, y, W - 56, 40);
      c.fillStyle = i === cur ? '#06181d' : '#cfeaf5'; c.font = '600 24px sans-serif'; c.fillText(n, 44, y + 28); });
    this.tex.needsUpdate = true;
  },
};
function cloneSkinned(src) {   // minimal SkeletonUtils.clone
  const map = new Map(), clone = src.clone(true); const walk = (a, b) => { map.set(a, b); a.children.forEach((c, i) => walk(c, b.children[i])); }; walk(src, clone);
  clone.traverse(o => { if (o.isSkinnedMesh) { const s = [...map.entries()].find(([, v]) => v === o)[0]; o.skeleton = new THREE.Skeleton(s.skeleton.bones.map(b => map.get(b)), s.skeleton.boneInverses); o.bind(o.skeleton, s.bindMatrix); } });
  return clone;
}

// ---------------------------------------------------------------- props: sampling scoop (in the right hand) and tool case (carried by the partner)
const props = {
  scoop: null, tcase: null, hand: null, content: null, tmp: new THREE.Vector3(),
  async load(name) {
    const j = await fetch('./assets_props/' + name + '.glb.json').then(r => r.json());
    const bin = Uint8Array.from(atob(j.glb), c => c.charCodeAt(0)).buffer;
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(bin, './', res, rej));
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.PROP_VERT, fragmentShader: SH.PROP_FRAG, vertexColors: true, side: THREE.DoubleSide });
    gltf.scene.traverse(o => { if (o.isMesh) { o.material = mat; o.frustumCulled = false; } }); return gltf.scene;
  },
  async init() {
    this.scoop = await this.load('sample_scoop'); this.tcase = await this.load('tool_case');
    // grip: handle across the palm of the right fist, scoop end on the thumb side (numbers in props.json)
    this.scoop.position.set(0.0, -0.045, -0.47); this.scoop.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)));
    arms.R.g.add(this.scoop); camera.updateMatrixWorld(true); let hb = null; arms.R.g.traverse(o => { if (o.isBone && o.name === 'hand') hb = o; }); hb.attach(this.scoop); this.scoop.visible = false;   // rides the hand bone so clips carry it
    scene.add(this.tcase); this.lid = this.tcase.getObjectByName('ToolCaseLid'); partner.root.traverse(o => { if (o.isBone && /hand.?L/.test(o.name)) this.hand = o; });
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
    this.spill.visible = true; this.spillT = 0; this.spillFloor = partner.carrying ? meshH(c.x, c.z) + 0.01 : this.tcase.position.y - 0.23;
  },   // case origin is the handle; the body hangs 0.285 m below it
  update(dt) {
    if (this.spill && this.spill.visible) { const pos = this.spill.geometry.attributes.position.array, v = this.spill.userData.v; this.spillT += dt;
      for (let i = 0; i < this.spill.userData.n; i++) { v[i * 3 + 1] -= 3.71 * dt; pos[i * 3] += v[i * 3] * dt; pos[i * 3 + 1] = Math.max(this.spillFloor, pos[i * 3 + 1] + v[i * 3 + 1] * dt); pos[i * 3 + 2] += v[i * 3 + 2] * dt; }
      this.spill.geometry.attributes.position.needsUpdate = true;
      if (this.spillT > 0.55 && this.pending) { this.caseContent = this.pending; this.pending = null; }   // the sample has landed: show it in the case
      if (this.spillT > 0.9) this.spill.visible = false; }
    if (this.tcase) this.tcase.traverse(o => { if (o.name === 'CaseSoil' || o.name === 'CaseRocks') o.visible = o.name === this.caseContent; });
    if (!this.scoop) return; this.scoop.visible = arms.state === 'tool'; if (arms.state !== 'tool') this.content = null;
    if (arms.clip) { const t = arms.clip.time; if (arms.clipName === 'collect_ground' && t >= 2.7) this.content = 'ScoopSoil'; if (arms.clipName === 'collect_rock' && t >= 1.75) this.content = 'ScoopRocks'; if (arms.clipName === 'stow_sample' && t >= 1.1) this.content = null; if (arms.clipName === 'pour_sample' && t >= 1.3 && this.content) { this.startSpill(this.content); if (!partner.carrying) this.pending = this.content === 'ScoopSoil' ? 'CaseSoil' : 'CaseRocks'; this.content = null; } }
    this.scoop.traverse(o => { if (o.name === 'ScoopSoil' || o.name === 'ScoopRocks') o.visible = o.name === this.content; });
    this.tcase.visible = partner.root.visible && !!this.hand; if (!this.tcase.visible) return;
    const open = !partner.carrying && !(partner.bending && partner.wantCarry) ? -1.75 : 0;   // lid: rotation.x = -1.75 rad is fully open
    if (this.lid) this.lid.rotation.x += (open - this.lid.rotation.x) * 0.12;
    if (!partner.carrying) { this.tcase.position.y += (this.restY - this.tcase.position.y) * 0.25; return; }   // resting on the ground where it was released
    this.hand.getWorldPosition(this.tmp); this.tcase.position.copy(this.tmp); this.tcase.position.y -= 0.10; this.tcase.rotation.y = partner.root.rotation.y + Math.PI / 2;
  },
};

// ---------------------------------------------------------------- habitat (NASA HDU shell on Marswalk legs) at the HAB waypoint
const habitat = {
  // Walkable zones in habitat space (x = toward the airlock end, v = sideways, metres; floor = height above the habitat origin).
  // Everything else inside the solid boxes below is blocked. Same numbers as habitat.json.
  ZONES: [
    { n: 'stairs', x0: 8.23, x1: 9.95, v0: -0.5, v1: 0.5, floor: x => 1.02 * (9.95 - x) / 1.72 },
    { n: 'porch', x0: 7.25, x1: 8.23, v0: -0.6, v1: 0.6, floor: () => 1.02 },
    { n: 'hatch', x0: 6.85, x1: 7.25, v0: -0.36, v1: 0.36, floor: x => 1.10 + 0.15 * Math.min(1, Math.max(0, (x - 6.98) / 0.10)), door: true, duck: 0.42 },   // 15 cm hatch sill
    { n: 'airlock', x0: 2.80, x1: 6.85, v0: -0.5, v1: 0.8, floor: () => 1.10 },
    { n: 'inner', x0: 2.15, x1: 2.80, v0: -0.36, v1: 0.36, floor: x => 1.10 + 0.15 * Math.min(1, Math.max(0, Math.min(x - 2.12, 2.70 - x) / 0.10)), duck: 0.42 },   // 15 cm hatch sill: step over it
    { n: 'main', r: 2.2, floor: () => 1.10 },
  ],
  SOLIDS: [{ r: 2.75 }, { x0: 2.5, x1: 7.25, v0: -1.45, v1: 1.45 }, { x0: -4.45, x1: -2.4, v0: -1.05, v1: 1.05 }, { x0: 7.25, x1: 9.95, v0: -0.78, v1: 0.78 }],
  local(x, z, o) { const dx = x - this.pos.x, dz = z - this.pos.z, t = this.root.rotation.y, c = Math.cos(t), s = Math.sin(t); o.x = dx * c - dz * s; o.v = dx * s + dz * c; return o; },
  _l: { x: 0, v: 0 }, open: 0, BLOCKS: [],
  zone(x, z) { if (!this.root) return null; const l = this.local(x, z, this._l);
    for (const q of this.ZONES) { if (q.r ? l.x * l.x + l.v * l.v < q.r * q.r : (l.x >= q.x0 && l.x <= q.x1 && l.v >= q.v0 && l.v <= q.v1)) { if (q.door && this.open < 0.8) continue; if (q.n === 'main') { let hit = false; for (const b of this.BLOCKS) if ((l.x - b.x) ** 2 + (l.v - b.v) ** 2 < (b.radius + 0.25) ** 2) hit = true; if (hit) continue; } return q; } } return null; },
  canStand(x, z) { if (!this.root) return true; if (this.zone(x, z)) return true; const l = this.local(x, z, this._l);
    for (const q of this.SOLIDS) if (q.r ? l.x * l.x + l.v * l.v < q.r * q.r : (l.x >= q.x0 && l.x <= q.x1 && l.v >= q.v0 && l.v <= q.v1)) return false; return true; },
  ground(x, z) { const q = this.zone(x, z); return q ? Math.max(meshH(x, z), this.pos.y + q.floor(this._l.x)) : meshH(x, z); },   // floor or terrain under a walker
  duck(x, z) { if (!this.root) return 0; const l = this.local(x, z, this._l); if (Math.abs(l.v) > 0.9) return 0;   // hatches are 1.43 m tall: stoop BEFORE the frame. Full stoop within 0.55 m of a hatch, starting 1.4 m away.
    const d = Math.min(Math.abs(l.x - 7.05), Math.abs(l.x - 2.45)), t = Math.min(1, Math.max(0, (d - 0.55) / 0.85)); return 0.42 * (1 - t * t * (3 - 2 * t)); },
  update(dt) {
    if (this.lights) { const on = U.uLamp.value.x > 0; for (const l of this.lights) l.visible = on; U.uHabGlow.value.set(1.0, 0.84, 0.62).multiplyScalar(on ? 0.16 : 0); }
    if (this.screens.mat && camera.position.distanceToSquared(this.pos) < 200 && (this.screens.t += dt || 0.016) > 0.25) { this.screens.t = 0; this.screens.draw(); }   // the wall screens refresh 4 times a second, only when someone is near
    if (!this.hatch) return; const l = this.local(eye.x, eye.z, this._l), pl = partner.root ? this.local(partner.root.position.x, partner.root.position.z, { x: 0, v: 0 }) : null, near = (mode === 'eye' && l.x > 3.0 && l.x < 11.5 && Math.abs(l.v) < 3.0) || (pl && partner.root.visible && pl.x > 3.0 && pl.x < 11.6 && Math.abs(pl.v) < 2.0);   // reference: the hatch opens when a walker is near
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
      const wob = (k, a) => Math.sin(T * 0.7 + k * 2.1) * a, blink = Math.floor(T * 2) % 2 === 0, storm = /storm|dust/.test(presetName), night = /night/.test(presetName);
      // 1. life support (blue screen left of the sample cabinet)
      let [w, h] = frame(C.life, 'LIFE SUPPORT', '#8fe9ff', '#03222b');
      bar(20, 78, 300, 'O2', (20.9 + wob(1, 0.1)).toFixed(1), '%', 0.84 + wob(1, 0.01), '#8fe9ff'); bar(20, 130, 300, 'CO2', (0.04 + wob(2, 0.005)).toFixed(3), '%', 0.12 + wob(2, 0.02), '#8fe9ff');
      bar(20, 182, 300, 'PRESSURE', (70.3 + wob(3, 0.2)).toFixed(1), 'kPa', 0.70 + wob(3, 0.01), '#8fe9ff'); bar(20, 234, 300, 'CABIN', (21.5 + wob(4, 0.3)).toFixed(1), 'C', 0.55 + wob(4, 0.02), '#8fe9ff');
      g.fillStyle = '#7dff9a'; g.beginPath(); g.arc(420, 120, 44, 0, 7); g.fill(); g.fillStyle = '#03222b'; g.font = F(22, true); g.textAlign = 'center'; g.fillText('OK', 420, 121);
      g.fillStyle = '#8fe9ff'; g.font = F(17); g.fillText('SCRUBBER A', 420, 190); trace(350, 205, 140, 60, '#8fe9ff', u => Math.sin(u * 14 + T * 2) * 0.5 + Math.sin(u * 5 - T) * 0.3);
      g.textAlign = 'left'; g.font = F(17); g.fillText('WATER 82 %   POWER ' + (storm ? '61' : '94') + ' %', 20, 305); g.restore();
      // 2. EVA team (blue screen by the shelves)
      [w, h] = frame(C.eva, 'EVA TEAM', '#8fe9ff', '#03222b');
      [['EV1', 0, 91, 78], ['EV2', 1, 88, 84]].forEach(([nm, k, o2, bat]) => { const y = 70 + k * 125; g.fillStyle = '#ffffff'; g.font = F(24, true); g.textAlign = 'left'; g.fillText(nm, 20, y + 6);
        bar(90, y, 190, 'SUIT O2', o2, '%', o2 / 100, '#8fe9ff'); bar(90, y + 50, 190, 'BATTERY', bat, '%', bat / 100, '#8fe9ff');
        const bpm = 72 + k * 9 + Math.round(wob(5 + k, 3)); g.fillStyle = '#7dff9a'; g.font = F(20); g.textAlign = 'right'; g.fillText(bpm + ' bpm', 492, y);
        trace(300, y + 14, 192, 64, '#7dff9a', u => { const ph = (u * 3 + T * 0.9 + k * 0.4) % 1; return ph < 0.06 ? ph * 14 : ph < 0.12 ? 0.84 - (ph - 0.06) * 26 : ph < 0.16 ? -0.72 + (ph - 0.12) * 18 : 0; }); });
      g.fillStyle = '#8fe9ff'; g.font = F(17); g.textAlign = 'left'; const mm = Math.floor(T / 60), ss = Math.floor(T % 60); g.fillText('NERETVA VALLIS   T+' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), 20, 315); g.restore();
      // 3. weather and alerts (amber screen by the ladder)
      [w, h] = frame(C.weather, 'WEATHER  JEZERO', '#ffc56b', '#2b1a03');
      bar(20, 78, 250, 'DUST TAU', storm ? '2.8' : '0.6', '', storm ? 0.93 : 0.2, '#ffc56b', storm ? '#ff5a3c' : null); bar(20, 130, 250, 'WIND', storm ? '24' : '6', 'm/s', storm ? 0.8 : 0.2, '#ffc56b', storm ? '#ff5a3c' : null);
      bar(20, 182, 250, 'TEMP', night ? '-78' : '-23', 'C', night ? 0.15 : 0.5, '#ffc56b'); bar(20, 234, 250, 'RADIATION', '0.7', 'mSv/d', 0.3, '#ffc56b');
      g.strokeStyle = '#ffc56b'; g.lineWidth = 2; for (const r of [30, 60, 90]) { g.globalAlpha = 0.5; g.beginPath(); g.arc(395, 170, r, 0, 7); g.stroke(); } g.globalAlpha = 1;
      const sa = T * 1.2; g.beginPath(); g.moveTo(395, 170); g.lineTo(395 + Math.cos(sa) * 90, 170 + Math.sin(sa) * 90); g.stroke();
      g.fillStyle = storm ? '#ff5a3c' : '#ffc56b'; for (let k = 0; k < (storm ? 9 : 3); k++) { const a = k * 2.4 + 1, r = 25 + (k * 37 % 60); g.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.cos(sa - a)); g.beginPath(); g.arc(395 + Math.cos(a) * r, 170 + Math.sin(a) * r, storm ? 9 : 5, 0, 7); g.fill(); } g.globalAlpha = 1;
      if (storm && blink) { g.fillStyle = '#ff5a3c'; g.fillRect(14, 286, 484, 40); g.fillStyle = '#2b1a03'; } else g.fillStyle = storm ? '#ff5a3c' : '#7dff9a';
      g.font = F(22, true); g.textAlign = 'center'; g.fillText(storm ? 'DUST STORM  -  EVA HOLD' : 'EVA WINDOW OPEN', 256, 307); g.restore();
      // 4. airlock status (blue screen inside the airlock)
      [w, h] = frame(C.airlock, 'AIRLOCK', '#8fe9ff', '#03222b'); const op = habitat.open > 0.5;
      bar(20, 82, 472, 'CHAMBER', op ? '0.7' : '70.3', 'kPa', op ? 0.02 : 0.70, '#8fe9ff');
      g.font = F(24, true); g.textAlign = 'left'; g.fillStyle = op ? '#ffc56b' : '#7dff9a'; g.fillText('OUTER HATCH  ' + (op ? 'OPEN' : 'SEALED'), 20, 160); g.fillStyle = '#7dff9a'; g.fillText('INNER HATCH  OPEN', 20, 200);
      g.fillStyle = '#8fe9ff'; g.font = F(18); g.fillText(op ? 'vented to Mars ambient' : 'equalised with cabin', 20, 245); g.restore();
      // 5. hatch control panel (beside the inner hatch)
      [w, h] = frame(C.door, 'HATCH', '#8fe9ff', '#062a33');
      g.fillStyle = op ? '#ffc56b' : '#7dff9a'; g.globalAlpha = blink || !op ? 1 : 0.4; g.beginPath(); g.arc(110, 190, 62, 0, 7); g.fill(); g.globalAlpha = 1; g.fillStyle = '#062a33'; g.font = F(24, true); g.textAlign = 'center'; g.fillText(op ? 'WAIT' : 'SAFE', 110, 191);
      [['CYCLE', 80], ['OPEN', 165], ['LOCK', 250]].forEach(([t, y]) => { g.strokeStyle = '#8fe9ff'; g.lineWidth = 3; g.strokeRect(230, y, 250, 64); g.fillStyle = '#8fe9ff'; g.font = F(26, true); g.fillText(t, 355, y + 33); }); g.restore();
      this.tex.needsUpdate = true; } },
  root: null, pos: new THREE.Vector3(1e9, 0, 1e9), clear: 12,
  async init() {
    const j = await fetch('./assets_habitat/habitat.glb.json').then(r => r.json());
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(Uint8Array.from(atob(j.glb), c => c.charCodeAt(0)).buffer, './', res, rej));
    const prop = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.PROP_VERT, fragmentShader: SH.PROP_FRAG, vertexColors: true, side: THREE.DoubleSide });
    gltf.scene.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; o.layers.enable(2);
      o.material = o.material.map ? new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: o.material.map } }, vertexShader: SH.HAB_VERT, fragmentShader: SH.HAB_FRAG, side: THREE.DoubleSide }) : prop; });
    // reference placement: the flattest spot within 30 m of the HAB waypoint, airlock facing the first waypoint
    const W = route.data.waypoints, h0 = W.find(w => w.name === 'HAB') || W[0], w1 = W[1]; let best = null;
    for (let dz = -30; dz <= 30; dz += 3) for (let dx = -30; dx <= 30; dx += 3) { const x = h0.x + dx, z = h0.z + dz; let lo = 1e9, hi = -1e9;
      for (let a = 0; a < 12; a++) { const hh = meshH(x + Math.cos(a * 0.5236) * 5.5, z + Math.sin(a * 0.5236) * 5.5); lo = Math.min(lo, hh); hi = Math.max(hi, hh); }
      if (!best || hi - lo < best.r) best = { x, z, r: hi - lo, y: (lo + hi) / 2 }; }
    this.relief = best.r; this.pos.set(best.x, best.y - 0.04, best.z); this.root = gltf.scene; this.root.position.copy(this.pos);
    const d = new THREE.Vector3(w1.x - best.x, 0, w1.z - best.z).normalize(); this.root.rotation.y = Math.atan2(-d.z, d.x); this.dir = d;   // model +X = airlock end
    // interior (separate file) and the hinged outer hatch
    const ij = await fetch('./assets_habitat/habitat_interior.glb.json').then(r => r.json());
    const ig = await new Promise((res, rej) => new GLTFLoader().parse(Uint8Array.from(atob(ij.glb), c => c.charCodeAt(0)).buffer, './', res, rej));
    const lm = await new Promise((res, rej) => texLoader.load('./assets_habitat/interior_lightmap.jpg', res, undefined, rej)); lm.flipY = false; lm.colorSpace = THREE.NoColorSpace; lm.generateMipmaps = false; lm.minFilter = THREE.LinearFilter;
    const inMat = new THREE.ShaderMaterial({ uniforms: { ...U, uRoom: { value: 1 }, tLM: { value: lm } }, vertexShader: SH.INTERIOR_VERT, fragmentShader: SH.INTERIOR_FRAG, vertexColors: true, side: THREE.DoubleSide });
    const vol = await new Promise((res, rej) => texLoader.load('./assets_habitat/interior_lightvolume.png', res, undefined, rej)); vol.flipY = false; vol.colorSpace = THREE.NoColorSpace; vol.generateMipmaps = false; vol.minFilter = vol.magFilter = THREE.LinearFilter; U.tVol.value = vol;
    this.root.updateMatrixWorld(true); U.uHabInv.value.copy(this.root.matrixWorld).invert();   // world -> habitat space, for the light volume
    // furniture library: one small file per piece, placed by layout.json
    const lay = await fetch('./assets_habitat/furniture/layout.json').then(r => r.json()), lib = {}, furnMat = new THREE.ShaderMaterial({ uniforms: { ...U, uRoom: { value: 0 }, tLM: { value: lm } }, vertexShader: SH.INTERIOR_VERT, fragmentShader: SH.INTERIOR_FRAG, vertexColors: true, side: THREE.DoubleSide });
    const glassMat = new THREE.ShaderMaterial({ uniforms: { uInterior: U.uInterior, uTime: U.uTime, uHabInv: U.uHabInv, tVol: U.tVol }, vertexShader: SH.INTERIOR_VERT, fragmentShader: SH.GLASS_FRAG, vertexColors: true, side: THREE.DoubleSide, transparent: true, premultipliedAlpha: true, depthWrite: false });   // see-through panes: any mesh with 'glass' in its name
    for (const it of lay.items) {
      if (!lib[it.model]) { const fj = await fetch('./assets_habitat/furniture/' + it.model + '.glb.json').then(r => r.json());
        lib[it.model] = (await new Promise((res, rej) => new GLTFLoader().parse(Uint8Array.from(atob(fj.glb), c => c.charCodeAt(0)).buffer, './', res, rej))).scene;
        lib[it.model].traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.map ? new THREE.ShaderMaterial({ uniforms: { uInterior: U.uInterior, uHabInv: U.uHabInv, tVol: U.tVol, tMap: { value: o.material.map } }, vertexShader: SH.INTERIOR_TEX_VERT, fragmentShader: SH.INTERIOR_TEX_FRAG, side: THREE.DoubleSide }) : /glass/.test(o.name) ? glassMat : furnMat; if (/glass/.test(o.name)) o.renderOrder = 3; } }); }
      const f = lib[it.model].clone(true); f.position.set(...it.position); if (it.scale) f.scale.setScalar(it.scale); f.rotation.y = it.rotation_y_deg * Math.PI / 180; gltf.scene.add(f); if (it.blocks) this.BLOCKS.push(...[].concat(it.blocks));
    }
    this.screens.init(); ig.scene.traverse(o => { if (o.isMesh) { o.material = /Screens/.test(o.name) ? this.screens.mat : inMat; o.frustumCulled = false; } }); gltf.scene.add(ig.scene);
    this.hatch = gltf.scene.getObjectByName('HabitatHatch');
    // planning table top: the EVA map (reference). Terrain photo tinted like a display, route and waypoints from route.json.
    const mc = document.createElement('canvas'); mc.width = mc.height = 512; const g3 = mc.getContext('2d'), W2 = route.data.waypoints, src = orthoCache.low ? orthoCache.low.image : (orthoCache.high && orthoCache.high.image);
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
    scene.add(this.root); cast.on[2] = true; U.uCastC.value[2].set(best.x + d.x * 1.5, best.y + 3.5, best.z + d.z * 1.5); cast.dirty = true; rocks.reset();
  },
};

// ---------------------------------------------------------------- modes / input
const START = new THREE.Vector3(8, 0, 70);   // 70 m south of Cheyava Falls, in Neretva Vallis
let mode = 'eye', yaw = -0.11, pitch = 0.0; const eye = START.clone(), keys = {};
addEventListener('keydown', e => { keys[e.code] = true; }); addEventListener('keyup', e => { keys[e.code] = false; });
let drag = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => drag = false);
canvas.addEventListener('pointermove', e => {
  if (mode !== 'eye' || !drag) return;
  yaw += (e.clientX - lx) * 0.004; pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY;
});
function setMode(m, spot) {
  mode = m === 'eye' ? 'eye' : 'orbit'; controls.enabled = mode === 'orbit';
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'eye') { eye.copy(START); yaw = -0.11; pitch = 0.0; }
  else if (m === 'steep') { eye.set(-202, 0, -73); yaw = 3.07; pitch = 0.3; mode = 'eye'; controls.enabled = false; }
  else if (m === 'partner') { eye.set(15, 0, 39); yaw = -1.17; pitch = 0.12; mode = 'eye'; controls.enabled = false; partner.t = 0.45; partner.pause = 0; }
  else if (m === 'feet') { eye.copy(START); yaw = -0.11; pitch = 1.15; mode = 'eye'; controls.enabled = false; }
  else if (m === 'habin') { const h = habitat; eye.set(h.pos.x + h.dir.x * 1.45, 0, h.pos.z + h.dir.z * 1.45); yaw = Math.atan2(-h.dir.x, h.dir.z); pitch = 0.12; mode = 'eye'; controls.enabled = false; }
  else if (m === 'hab') { const h = habitat, s2 = new THREE.Vector3(-h.dir.z, 0, h.dir.x); eye.set(h.pos.x + h.dir.x * 17 + s2.x * 7, 0, h.pos.z + h.dir.z * 17 + s2.z * 7); yaw = Math.atan2(h.pos.x + h.dir.x * 2 - eye.x, -(h.pos.z + h.dir.z * 2 - eye.z)); pitch = -0.05; mode = 'eye'; controls.enabled = false; }
  else if (m === 'rock') { eye.set(1.6, 0, 4.2); yaw = -0.36; pitch = 0.33; mode = 'eye'; controls.enabled = false; }
  else if (m === 'drone') { camera.position.set(520, tileH(0, 0) + 330, 620); controls.target.set(0, tileH(0, 0), 0); controls.update(); }
  else if (m === 'far') { camera.position.set(2600, 2300, 3900); controls.target.set(-600, 100, -300); controls.update(); }
  $('hint').textContent = mode === 'eye' ? 'Drag to look · WASD to walk · Shift to jog' : 'Drag to orbit · scroll to zoom · right-drag to pan';
}

// ---------------------------------------------------------------- tiers
let tier = 'high', tierAuto = true; const orthoCache = {};
async function setTier(name, manual) {
  if (manual) tierAuto = false;
  tier = name; const t = TIERS[name];
  if (!orthoCache[name]) orthoCache[name] = await tex(t.ortho, { aniso: t.aniso });
  terrainMat.uniforms.tOrtho.value = orthoCache[name];
  renderer.setPixelRatio(Math.min(devicePixelRatio, t.pixelRatio)); resize();
  U.uRockR.value.set(t.radius[0] || 1, t.radius[1], t.radius[2]);
  buildTerrain(t); computeShadows(t.shadowRes); rocks.reset(); route.build();
  document.querySelectorAll('[data-tier]').forEach(b => b.classList.toggle('on', b.dataset.tier === name));
  $('tiernote').textContent = tierAuto ? 'auto' : 'manual';
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ---------------------------------------------------------------- frame loop
const clock = new THREE.Clock(); let frames = 0, acc = 0, last = performance.now(), worst = 0, slowWindows = 0, booted = 0;
const fwd = new THREE.Vector3(), right = new THREE.Vector3(); let moveSpeed = 0, bobAmp = 0, bobPhase = 0, camGround = 0, camDuck = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (mode === 'eye') {
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 4.5 : 1.4) * dt, ex = eye.x, ez = eye.z;
    fwd.set(Math.sin(yaw), 0, -Math.cos(yaw)); right.set(-fwd.z, 0, fwd.x);
    if (keys.KeyW || keys.ArrowUp) eye.addScaledVector(fwd, sp); if (keys.KeyS || keys.ArrowDown) eye.addScaledVector(fwd, -sp);
    if (keys.KeyD || keys.ArrowRight) eye.addScaledVector(right, sp); if (keys.KeyA || keys.ArrowLeft) eye.addScaledVector(right, -sp);
    if (!arms.clip) { rocks.collide(eye, 0.3); if (partner.root && partner.root.visible) { const dx = eye.x - partner.root.position.x, dz = eye.z - partner.root.position.z, d = Math.hypot(dx, dz); if (d < 0.9 && d > 1e-4) { eye.x = partner.root.position.x + dx / d * 0.9; eye.z = partner.root.position.z + dz / d * 0.9; } } }
    if (!habitat.canStand(eye.x, eye.z)) { if (habitat.canStand(eye.x, ez)) eye.z = ez; else if (habitat.canStand(ex, eye.z)) eye.x = ex; else { eye.x = ex; eye.z = ez; } }   // habitat walls: slide along them
    eye.x = Math.max(-T.W / 2 + 3, Math.min(T.W / 2 - 3, eye.x)); eye.z = Math.max(-T.H / 2 + 3, Math.min(T.H / 2 - 3, eye.z));
    const cc = arms.cam, cs = Math.min(1, cc.pitch / (arms.CLIP_PITCH[arms.clipName] || 1)), cx = eye.x + Math.sin(yaw) * cc.fwd, cz = eye.z - Math.cos(yaw) * cc.fwd;   // interaction clips can crouch the camera
    const dig = (arms.clipName === 'collect_ground' ? Math.min(1, -cc.drop / 0.86) : 0) * (meshH(eye.x + Math.sin(yaw) * 0.47, eye.z - Math.cos(yaw) * 0.47) - meshH(eye.x, eye.z));   // follow the ground at the dig point on slopes
    const gT = habitat.ground(eye.x, eye.z), dT = habitat.duck(eye.x, eye.z); camGround = Math.abs(gT - camGround) > 1.5 ? gT : camGround + (gT - camGround) * Math.min(1, dt * 12); camDuck += (dT - camDuck) * Math.min(1, dt * 10);
    camera.position.set(cx, camGround + 1.7 - camDuck + cc.drop + dig, cz); camera.rotation.set(-(pitch * (1 - cs) + cc.pitch * cs), -yaw, 0, 'YXZ');
    moveSpeed = Math.hypot(eye.x - ex, eye.z - ez) / Math.max(dt, 1e-4);
    // reference head bob: one bounce per step; jogging on Mars is a slow lope (long 2 m strides, bigger bounce). Camera only, no asset involved.
    const jog = moveSpeed > 3, bt = arms.clip ? 0 : moveSpeed > 0.1 ? (jog ? 0.045 : 0.012) : 0; bobAmp += (bt - bobAmp) * Math.min(1, dt * 6); bobPhase += moveSpeed * dt * Math.PI * 2 / (jog ? 1.0 : 0.5);
    camera.position.y += Math.abs(Math.sin(bobPhase * 0.5)) * bobAmp * 2 - bobAmp; camera.position.addScaledVector(right, Math.sin(bobPhase * 0.5) * bobAmp * 0.4);
  } else {
    controls.update();
    const g = groundH(camera.position.x, camera.position.z) + 2; if (camera.position.y < g) camera.position.y = g;
  }
  camera.getWorldDirection(U.uCamDir.value);
  U.uTime.value += dt; partner.update(dt); arms.update(dt); legs.update(dt, mode === 'eye' ? moveSpeed : 0); props.update(dt); habitat.update(dt);
  rocks.update(camera.position, TIERS[tier], false);
  cast.render();
  renderer.render(scene, camera);
  route.labels();
  const now = performance.now(), ft = now - last; last = now; frames++; acc += ft; worst = Math.max(worst, ft);
  if (acc > 1000) {
    const fps = Math.round(frames * 1000 / acc), el = $('fps');
    el.textContent = fps + ' fps'; el.className = fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'bad';
    const i = renderer.info.render;
    $('info').textContent = `${(i.triangles / 1000).toFixed(0)}k tris · ${i.calls} draw calls · ${rocks.total} rocks · worst ${worst.toFixed(0)} ms`;
    // auto tier: three slow seconds in a row on High -> Low
    if (tierAuto && tier === 'high' && now - booted > 3000) { slowWindows = (fps < 40 && worst < 250 && !document.hidden) ? slowWindows + 1 : 0; if (slowWindows >= 3) { setTier('low'); $('tiernote').textContent = 'auto: switched to Low'; } }
    frames = 0; acc = 0; worst = 0;
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- boot
(async () => {
  try {
    status.textContent = 'Loading terrain data…';
    const [tj, rj, pj, rocksJ] = await Promise.all([json('terrain.json'), json('ring.json'), json('atmosphere_presets.json'), json('rocks.json')]);
    const u = b64u16(tj.heights_u16_b64), h = new Float32Array(u.length); for (let i = 0; i < u.length; i++) h[i] = u[i] / 65535 * tj.range_m;
    T = { n: tj.n, W: tj.width_m, H: tj.depth_m, h, dens: b64u8(tj.density_u8_b64), dn: tj.density_n, base: tj.base_elev_m };
    const ru = b64u16(rj.heights_u16_b64), rh = new Float32Array(ru.length); for (let i = 0; i < ru.length; i++) rh[i] = rj.min_m + ru[i] / 65535 * rj.range_m;
    RING = { n: rj.n, size: rj.size_m, h: rh }; U.uSize.value.set(T.W, T.H); U.uRingSize.value = RING.size;
    PRESETS = pj.presets; U.uFadeStart.value = pj.terrain_detail_fade_m.start; U.uFadeEnd.value = pj.terrain_detail_fade_m.end;

    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'), gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    $('gpu').textContent = gpu || 'GPU: unknown';
    const weak = /Intel|SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Apple GPU|Microsoft Basic/i.test(gpu) && !/Arc|Iris Xe/i.test(gpu);
    tier = weak ? 'low' : 'high';

    status.textContent = 'Loading textures…';
    const tr = TIERS[tier];
    const [nrm, mask, gravel, slab, ring, ortho, cCol, cNao, ...rockMaps] = await Promise.all([
      tex('normal_ao.jpg'), tex('outcrop_mask.jpg'), tex('gravel_nl.jpg', { repeat: true, aniso: tr.aniso }), tex('slab_nl.jpg', { repeat: true, aniso: tr.aniso }),
      tex('ring_gray.jpg'), tex(tr.ortho, { aniso: tr.aniso }), tex('cheyava_color.jpg', { srgb: true }), tex('cheyava_nao.jpg'),
      ...ROCK_NAMES.map(n => tex(n + '.jpg', { srgb: true })),
    ]);
    orthoCache[tier] = ortho; U.tRing.value = ring;
    terrainMat = new THREE.ShaderMaterial({
      uniforms: { ...U, tOrtho: { value: ortho }, tNrmAo: { value: nrm }, tMask: { value: mask }, tGravel: { value: gravel }, tSlab: { value: slab } },
      vertexShader: SH.TERRAIN_VERT, fragmentShader: SH.TERRAIN_FRAG,
    });
    status.textContent = 'Building scene…';
    applyPreset('clear_day');
    renderer.setPixelRatio(Math.min(devicePixelRatio, tr.pixelRatio)); resize(); U.uRockR.value.set(tr.radius[0] || 1, tr.radius[1], tr.radius[2]);
    buildTerrain(tr); buildRing(ring); buildSky();
    rocks.init(rocksJ, rockMaps); cheyavaMesh = await buildCheyava([cCol, cNao]);
    await partner.init(); await arms.init(); await legs.init(); await props.init();
    document.querySelectorAll('[data-arms]').forEach(b => b.onclick = () => arms.set(b.dataset.arms));
    $('partnerbtn').onclick = () => { partner.root.visible = partner.blob.visible = !partner.root.visible; $('partnerbtn').classList.toggle('on', partner.root.visible); };
    $('legsbtn').onclick = () => { legs.on = !legs.on; $('legsbtn').classList.toggle('on', legs.on); };
    $('collectbtn').onclick = () => arms.play('collect_ground'); $('collectrockbtn').onclick = () => {   // reference: stand 0.70 m from the rock face (0.20 m camera lean + 0.50 m scoop reach), facing it; the scoop tip meets the rock about 0.3 m above the ground
      setMode('rock'); cheyavaMesh.updateMatrixWorld(true);
      const d = new THREE.Vector3(-eye.x, 0, -eye.z).normalize(), g = tileH(0, 0);
      for (const h of [0.30, 0.20, 0.12]) {
        const hit = new THREE.Raycaster(new THREE.Vector3(-d.x * 6, g + h, -d.z * 6), d, 0, 12).intersectObject(cheyavaMesh)[0];
        if (hit) { eye.x = hit.point.x - d.x * 0.70; eye.z = hit.point.z - d.z * 0.70; yaw = Math.atan2(d.x, -d.z); pitch = 0.3; break; }
      }
      arms.play('collect_rock');
    };
    $('stowbtn').onclick = () => arms.play('stow_sample');
    $('pourbtn').onclick = () => {   // reference: if the case is on the ground, stand 0.85 m from it on the side away from the partner, facing it, so the scoop tips over the open case
      if (!partner.carrying) { const c = props.tcase.position, q = partner.root.position, d = new THREE.Vector3(q.x - c.x, 0, q.z - c.z).normalize(); eye.x = c.x - d.x * 0.85; eye.z = c.z - d.z * 0.85; yaw = Math.atan2(d.x, -d.z); mode = 'eye'; controls.enabled = false; }   // opposite the partner, case between you
      arms.play('pour_sample');
    };
    $('casebtn').onclick = () => partner.toggleCase(); $('visitbtn').onclick = () => partner.visitHabitat();
    $('colorbtn').onclick = () => { partner.ci = (partner.ci + 1) % COLORS.length; partner.uPlayer.value.set(...COLORS[partner.ci]); };
    U.uRelief.value = tj.range_m; route.data = await json('route.json'); route.build(); await habitat.init();

    document.querySelectorAll('[data-tier]').forEach(b => { b.onclick = () => setTier(b.dataset.tier, true); b.classList.toggle('on', b.dataset.tier === tier); });
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
    document.querySelectorAll('[data-atmo]').forEach(b => b.onclick = () => applyPreset(b.dataset.atmo));
    document.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => { U.uLayer.value = +b.dataset.layer; arms.draw(); arms.tap = 0.35; document.querySelectorAll('[data-layer]').forEach(x => x.classList.toggle('on', x === b)); });
    $('routebtn').onclick = () => { route.group.visible = !route.group.visible; $('routebtn').classList.toggle('on', route.group.visible); };
    $('rocksbtn').onclick = () => { rocks.enabled = !rocks.enabled; $('rocksbtn').classList.toggle('on', rocks.enabled); rocks.update(camera.position, TIERS[tier], true); };
    $('tiernote').textContent = 'auto';
    window.__mw = { partner, arms, legs, props, habitat, keys, setPitch(p) { pitch = p; }, look(px, pz, tx, ty, tz, h) { mode = 'eye'; controls.enabled = false; eye.set(px, 0, pz); const y = meshH(px, pz) + (h || 1.7); yaw = Math.atan2(tx - px, -(tz - pz)); pitch = -Math.atan2(ty - y, Math.hypot(tx - px, tz - pz)); } };
    setMode('eye'); status.textContent = ''; booted = performance.now(); tick();
  } catch (e) { window.__err && window.__err(e.message || String(e)); console.error(e); }
})();
