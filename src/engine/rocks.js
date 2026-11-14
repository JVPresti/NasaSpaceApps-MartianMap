// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 198-289).
import * as THREE from 'three';
import * as SH from './shaders.js';

// rock classes: counts per m2 from the Golombek Mars rock model at ~5 % cover (x1.6 max, thinned by HiRISE brightness)
const CLASSES = [
  { name: 'pebble', dens: 5.6 * 1.6,   D: [0.04, 0.10], types: [0],       sink: 0.10 },
  { name: 'small',  dens: 0.95 * 1.6,  D: [0.10, 0.30], types: [1, 0],    sink: 0.10 },
  { name: 'medium', dens: 0.08 * 1.6,  D: [0.30, 1.00], types: [3, 2, 1], sink: 0.15 },
  { name: 'large',  dens: 0.0004 * 1.6, D: [1.0, 2.5],  types: [4, 3],    sink: 0.20 },
];
export const ROCK_NAMES = ['rock_09', 'rock_07', 'namaqualand_boulder_06', 'namaqualand_boulder_05', 'namaqualand_boulder_03'];
const CELL = 16, CAP = 16384;
const f1 = (v = 0) => ({ value: v });
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createRocks(ctx) {
  const { scene, U, sys, T } = ctx;
  const { meshH, density } = ctx.terrain;
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
        if ((x - sys.habitat.pos.x) ** 2 + (z - sys.habitat.pos.z) ** 2 < sys.habitat.clear * sys.habitat.clear) continue;   // keep the habitat pad clear
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
  return rocks;
}
// Cheyava Falls hero rock (bench lines 293-300)
export async function buildCheyava(ctx, maps) {
  const { scene, U, assets } = ctx;
  const { tileH } = ctx.terrain;
  const d = await assets.json('cheyava.json'), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2)); g.setIndex(d.i);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ defines: { HERO: 1 }, uniforms: { ...U, tMap: { value: maps[0] }, tNao: { value: maps[1] }, uRockH: f1(0.3) }, vertexShader: SH.ROCK_VERT, fragmentShader: SH.ROCK_FRAG }));
  m.position.set(0, tileH(0, 0) - 0.06, 0); m.rotation.y = d.rot_z_blender || 0; scene.add(m);
  return m;
}
