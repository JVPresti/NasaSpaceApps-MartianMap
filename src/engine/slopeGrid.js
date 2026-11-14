// Slope grid (issue #50): in Walk mode, a grid of thin lines on the ground around the player, coloured by the slope
// underneath with the slope layer's legend (slopeGrid.shaders.js). It makes steepness readable while walking.
//   - a 48 m patch, draped on the drawn mesh, with one vertex per metre; it moves with the player in 4 m steps
//   - the slope at each vertex comes from the same terrain queries as engine.slopeAt (the 1 m DEM product, 2 m grid)
//
//   sys.slopeGrid.set(on)         switch it on or off (fades)
//   sys.slopeGrid.rebuild()       re-drape after the terrain mesh changes (tier switch)
//   sys.slopeGrid.update(dt)      once per frame
import * as THREE from 'three';
import * as SH from './slopeGrid.shaders.js';
import { GRID_SPACING_M, PATCH_M, needsRecenter, snapCenter } from './slopeGridRules.js';

const LIFT_M = 0.04;
const FADE_PER_S = 3;

export function createSlopeGrid(ctx) {
  const { scene, U, view } = ctx;
  const { meshH, queries } = ctx.terrain;
  const n = PATCH_M + 1;   // vertices per side, one per metre
  const uniforms = {
    uInscatter: U.uInscatter, uFogK: U.uFogK, uOn: { value: 0 }, uSpacing: { value: GRID_SPACING_M },
    uFadeFrom: { value: PATCH_M * 0.25 }, uFadeTo: { value: PATCH_M * 0.48 }, uPlayer: { value: new THREE.Vector2() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: SH.GRID_VERT, fragmentShader: SH.GRID_FRAG,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  });
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * n * 3), slope = new Float32Array(n * n), idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSlope', new THREE.BufferAttribute(slope, 1));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  scene.add(mesh);

  let on = false, center = null;

  function drape() {
    const x0 = center.x - PATCH_M / 2, z0 = center.z - PATCH_M / 2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = j * n + i, x = x0 + i, z = z0 + j;
      pos[v * 3] = x; pos[v * 3 + 1] = meshH(x, z) + LIFT_M; pos[v * 3 + 2] = z;
      slope[v] = queries.slopeAt(x, z);
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aSlope.needsUpdate = true;
  }

  return {
    mesh,
    /** @param {boolean} value */
    set(value) { on = !!value; },
    rebuild() { if (center) drape(); },
    /** @param {number} dt */
    update(dt) {
      const walk = view.mode === 'eye', target = on && walk ? 1 : 0, u = uniforms.uOn;
      u.value += Math.sign(target - u.value) * Math.min(Math.abs(target - u.value), dt * FADE_PER_S);
      mesh.visible = u.value > 0.001;
      if (!mesh.visible) return;
      const { x, z } = view.eye;
      uniforms.uPlayer.value.set(x, z);
      if (needsRecenter(center, x, z)) { center = snapCenter(x, z); drape(); }
    },
    dispose() { geo.dispose(); material.dispose(); scene.remove(mesh); },
  };
}
