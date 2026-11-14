// Terrain data, height queries, terrain mesh, background ring and the sun shadow map.
// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 61-129, 138-163).
import * as THREE from 'three';
import * as SH from './shaders.js';

function bilinear(arr, n, fx, fy) {
  const x0 = Math.max(0, Math.min(n - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(n - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0)), i = y0 * n + x0;
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + n] * (1 - tx) + arr[i + n + 1] * tx) * ty;
}

/**
 * ctx.T = { n, W, H, h, dens, dn, base }, ctx.RING = { n, size, h } must be loaded first.
 * Coordinates: x east, z south, y up, metres from Cheyava Falls.
 */
export function createTerrain(ctx) {
  const { T, RING, U, scene } = ctx;
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

  const group = new THREE.Group(); scene.add(group);
  const api = {
    inTile, tileH, ringH, groundH, meshH, density, group,
    /** ShaderMaterial shared by all terrain chunks; set once the textures are loaded. */
    material: null,
    shadowTex: null,
    buildTerrain(tier) {
      for (const m of [...group.children]) { m.geometry.dispose(); group.remove(m); }
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
        group.add(new THREE.Mesh(g, api.material));
      }
    },
    // background ring (CTX, 12 km)
    buildRing(tRing) {
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
    },
    // sun shadow map (CPU ray-march of the real heightfield, once per preset)
    computeShadows(res) {
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
      if (api.shadowTex) api.shadowTex.dispose();
      const st = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType);
      st.magFilter = st.minFilter = THREE.LinearFilter; st.needsUpdate = true;
      api.shadowTex = st; U.tShadow.value = st;
    },
  };
  return api;
}
