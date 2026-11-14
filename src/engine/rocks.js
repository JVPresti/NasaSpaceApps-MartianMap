// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 198-289).
import * as THREE from 'three';
import * as SH from './shaders.js';
import { ROCK_NAMES } from './assetManifest.js';
import { rockBlocks, footprint, addFootprint } from './collide.js';

// rock classes: counts per m2 from the Golombek Mars rock model at ~5 % cover (x1.6 max, thinned by HiRISE brightness)
const CLASSES = [
  { name: 'pebble', dens: 5.6 * 1.6,   D: [0.04, 0.10], types: [0],       sink: 0.10 },
  { name: 'small',  dens: 0.95 * 1.6,  D: [0.10, 0.30], types: [1, 0],    sink: 0.10 },
  { name: 'medium', dens: 0.08 * 1.6,  D: [0.30, 1.00], types: [3, 2, 1], sink: 0.15 },
  { name: 'large',  dens: 0.0004 * 1.6, D: [1.0, 2.5],  types: [4, 3],    sink: 0.20 },
];
const CELL = 16, CAP = 16384;
const f1 = (v = 0) => ({ value: v });
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createRocks(ctx) {
  const { scene, U, sys, T } = ctx;
  const { meshH, density } = ctx.terrain;
  const rocks = {
    meshes: [], heights: [], feet: [], hero: null, blob: null, cache: new Map(), large: null, last: new THREE.Vector3(1e9, 0, 0), enabled: true, total: 0,
    init(data, maps) {
      ROCK_NAMES.forEach((name, ti) => {
        const mat = new THREE.ShaderMaterial({ uniforms: { ...U, tMap: { value: maps[ti] }, uRockH: f1(data[name].lods[0].height) }, vertexShader: SH.ROCK_VERT, fragmentShader: SH.ROCK_FRAG });
        this.heights[ti] = data[name].lods[0].height; this.feet[ti] = footprint(data[name].lods[0].p);   // outline from above, for collisions
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
        if (ctx.outcrop && (x - ctx.outcrop.userData.at.x) ** 2 + (z - ctx.outcrop.userData.at.z) ** 2 < OUTCROP.clear * OUTCROP.clear) continue;   // keep the layered outcrop clear
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
    // walker collision (#38): adds every rock of 0.35 m and larger whose edge is within reach of p to an obstacle list (collide.js),
    // as a capsule fitted to that rock type's outline and turned like the drawn rock (the meshes are about twice as long as wide;
    // the reference used one circle of 0.4 x size). Same deterministic rocks as the ones drawn, plus the Cheyava Falls rock.
    obstacles(p, out, reach = 1) {
      const add = c => { for (let i = 0; i < c.n; i++) { const D = c.meta[i * 4 + 2]; if (!rockBlocks(D)) continue;
        const x = c.meta[i * 4], z = c.meta[i * 4 + 1], f = this.feet[c.meta[i * 4 + 3]], R = f.ext * D + reach; if ((p.x - x) ** 2 + (p.z - z) ** 2 > R * R) continue;
        addFootprint(out, f, x, z, D, c.mat[i * 16], c.mat[i * 16 + 2]); } };   // instance matrix elements 0 and 2: where the rock's local x points
      if (this.enabled) { const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
        for (let ci = 0; ci < 3; ci++) if (rockBlocks(CLASSES[ci].D[1])) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) add(this.cell(ci, cx + i, cz + j));   // classes that never reach 0.35 m are skipped
        if (this.large) add(this.large); }
      const h = this.hero; if (h) addFootprint(out, h.f, h.x, h.z, 1, h.ax, h.az);
      return out;
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
  ctx.sys.rocks.hero = { f: footprint(d.p), x: 0, z: 0, ax: Math.cos(m.rotation.y), az: -Math.sin(m.rotation.y) };   // walker collision (#38): its outline, turned like the mesh
  return m;
}

// Layered outcrop at the Bright Angel stop (bench buildOutcrop). assets/outcrop.glb holds three detail levels
// (Outcrop_LOD0/1/2: 16k, 4k and 1.8k triangles); shader and texture layout are the same as the Cheyava Falls rock.
// It is a hand-made model in the style of the Bright Angel outcrops (docs/marswalk-assets/README.md, "Layered outcrop").
export const OUTCROP = {
  waypoint: 'WP3',                                // name prefix of the route.json waypoint it belongs to
  back: 4.2,                                      // m uphill of the waypoint, outside the 2 m arrival circle
  sink: 0.2,                                      // m into the ground: the lowest beds and the loose chips are half buried
  clear: 4.2,                                     // m around its centre kept free of scattered rocks
  lod: { high: [0, 30, 90], low: [0, 14, 60] },   // m from the camera at which each detail level takes over
};

/**
 * Where the outcrop sits. The ground at WP3 is a steady 30 degree slope, so the model is laid on that slope uphill of
 * the waypoint, tilted to the ground plane under its 6.7 x 3.4 m footprint, with its buried end uphill and its broken
 * face towards the walker. Its beds dip 24 degrees inside the model, so on this slope they end up nearly level.
 * Plain math, no three.js: `height(x, z)` is any ground height function (x east, z south, metres).
 * @returns {{ x: number, y: number, z: number, ux: number, uz: number, normal: number[], yaw: number, slopeDeg: number }}
 */
export function outcropPlacement(wp, height, back = OUTCROP.back) {
  const gx = (height(wp.x + 3, wp.z) - height(wp.x - 3, wp.z)) / 6, gz = (height(wp.x, wp.z + 3) - height(wp.x, wp.z - 3)) / 6, gl = Math.hypot(gx, gz);
  const ux = gl > 1e-6 ? gx / gl : 0, uz = gl > 1e-6 ? gz / gl : -1;   // uphill; on flat ground the buried end points north
  const px = -uz, pz = ux, x = wp.x + ux * back, z = wp.z + uz * back;
  const hu = height(x + ux * 3, z + uz * 3), hd = height(x - ux * 3, z - uz * 3), hl = height(x + px * 1.6, z + pz * 1.6), hr = height(x - px * 1.6, z - pz * 1.6);
  const along = (hu - hd) / 6, across = (hl - hr) / 3.2;
  const nx = -(along * ux + across * px), nz = -(along * uz + across * pz), nl = Math.hypot(nx, 1, nz);
  return {
    x, z, y: (height(x, z) * 2 + hu + hd + hl + hr) / 6, ux, uz,
    normal: [nx / nl, 1 / nl, nz / nl],
    yaw: Math.atan2(-uz, ux),   // turns the model's +x (its buried end) uphill
    slopeDeg: Math.atan(Math.hypot(along, across)) * 180 / Math.PI,
  };
}

export async function buildOutcrop(ctx, maps) {
  const { scene, U, assets } = ctx;
  const [gltf, route] = await Promise.all([assets.glb('assets/outcrop.glb'), assets.json('route.json')]);
  const wp = route.waypoints.find((w) => w.name.startsWith(OUTCROP.waypoint));
  if (!wp) return null;
  const mat = new THREE.ShaderMaterial({ defines: { HERO: 1 }, uniforms: { ...U, tMap: { value: maps[0] }, tNao: { value: maps[1] }, uRockH: f1(1.0) }, vertexShader: SH.ROCK_VERT, fragmentShader: SH.ROCK_FRAG });
  const lod = new THREE.LOD(), up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 3; k++) {
    const g = gltf.scene.getObjectByName('Outcrop_LOD' + k).geometry, uv = g.attributes.uv;
    if (!g.userData.vFlipped) { for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); g.userData.vFlipped = true; }   // glTF stores v flipped; these textures load the three.js way, like the Cheyava ones
    lod.addLevel(new THREE.Mesh(g, mat), 0);
  }
  // Sits on the drawn mesh, which changes a little with the quality tier: call again after the terrain is rebuilt.
  lod.userData.place = (tier) => {
    const at = outcropPlacement(wp, ctx.terrain.meshH), dist = OUTCROP.lod[tier] || OUTCROP.lod.high;
    lod.position.set(at.x, at.y - OUTCROP.sink, at.z);
    lod.quaternion.setFromUnitVectors(up, new THREE.Vector3(...at.normal)).multiply(new THREE.Quaternion().setFromAxisAngle(up, at.yaw));
    lod.levels.forEach((level, k) => { level.distance = dist[k]; });
    lod.userData.at = at;
  };
  lod.userData.place(ctx.tier); scene.add(lod);
  return lod;
}
