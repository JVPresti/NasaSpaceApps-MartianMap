// Route line on the ground. Ported from docs/marswalk-assets/testbench-reference/main.js (route.build, lines 335-347):
// the ribbon only. No planner (src/sim/routePlanner.js plans), no labels. Issue #29 restyles it as the route glow.
import * as THREE from 'three';
import * as SH from './shaders.js';

export function createRouteLine(ctx) {
  const { scene, U } = ctx;
  const { meshH } = ctx.terrain;
  const group = new THREE.Group(); scene.add(group);
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.ROUTE_VERT, fragmentShader: SH.ROUTE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });

  function clear() { for (const m of [...group.children]) { m.geometry.dispose(); group.remove(m); } }

  /** @param {Array<[number, number]> | null} input path as [[x, z], ...] in metres; null or fewer than 2 points clears the line */
  function set(input) {
    clear();
    if (!input || input.length < 2) return;
    let path = input.map(([x, z]) => [x, z]);
    // two rounds of corner cutting so the ribbon bends smoothly (bench line 335)
    for (let k = 0; k < 2; k++) { const q = [path[0]]; for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } q.push(path[path.length - 1]); path = q; }
    const n = path.length, pos = new Float32Array(n * 6), dir = new Float32Array(n * 6), side = new Float32Array(n * 2), len = new Float32Array(n * 2), idx = [];
    let L = 0;
    for (let i = 0; i < n; i++) {
      const [x, z] = path[i], y = meshH(x, z) + 0.15, a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
      if (i) L += Math.hypot(x - path[i - 1][0], z - path[i - 1][1]);
      for (let s = 0; s < 2; s++) { const o = (i * 2 + s) * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; dir[o] = dx / dl; dir[o + 2] = dz / dl; side[i * 2 + s] = s ? 1 : -1; len[i * 2 + s] = L; }
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setAttribute('aLen', new THREE.BufferAttribute(len, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2; group.add(m);
  }

  return { group, set, clear };
}
