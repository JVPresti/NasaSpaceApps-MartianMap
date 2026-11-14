// Route glow (issue #29): the planner's path as the visor would project it: a fine glowing dotted line draped on the
// terrain, plus chevrons floating about 0.8 m above the ground just ahead of the player, pointing the way.
// Replaces the bench's thin route line (docs/marswalk-assets/testbench-reference/main.js lines 330-349).
//
//   sys.routeGlow.setPath([[x, z], ...] | null)   draw a new route (or hide it); the walked part starts at 0
//   sys.routeGlow.rebuild()                        re-drape after the terrain mesh changes (tier switch)
//   sys.routeGlow.update(dt, position)             once per frame; tracks how far along the route the player is
//
// The line is sampled every metre on the mesh that is drawn in this tier (meshH), so it follows the ground.
// Its width grows with distance, so it stays readable from eye height and from Plan mode. Chevrons show only in Walk mode.
import * as THREE from 'three';
import * as SH from './routeGlow.shaders.js';

const STEP_M = 1;          // sampling along the path
const LIFT_M = 0.06;       // base offset above the mesh; cross-slope lift is added in the shader
const TRACK_BACK_M = 30;   // how far behind the current progress the player may be matched
const TRACK_AHEAD_M = 60;  // how far ahead (so a short cut does not skip the whole route)
const TRACK_SIDE_M = 12;   // off-route distance that still counts as walking the route
const CHEV_EVERY_M = 7;    // spacing of the floating chevrons
const CHEV_HEIGHT_M = 0.8; // height of the chevrons above the ground

/** True for [[x, z], ...] with at least two finite points. @param {unknown} path */
export function validPath(path) {
  return Array.isArray(path) && path.length >= 2 && path.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function createRouteGlow(ctx) {
  const { scene, U } = ctx;
  const { meshH } = ctx.terrain;
  const uniforms = { ...U, uWalked: { value: 0 }, uTotal: { value: 0 }, uChevOn: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: SH.ROUTE_GLOW_VERT, fragmentShader: SH.ROUTE_GLOW_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  scene.add(mesh);
  const chevMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: SH.ROUTE_CHEV_VERT, fragmentShader: SH.ROUTE_CHEV_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const chevrons = new THREE.Mesh(new THREE.BufferGeometry(), chevMaterial);
  chevrons.frustumCulled = false; chevrons.renderOrder = 3; chevrons.visible = false;
  scene.add(chevrons);

  let path = null;                        // last path given, [[x, z], ...]
  let samples = null;                     // { x, z, len } resampled every STEP_M, for progress tracking
  let walked = 0;

  function resample(p) {
    const xs = [p[0][0]], zs = [p[0][1]], ls = [0];
    let L = 0;
    for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1], [bx, bz] = p[i], d = Math.hypot(bx - ax, bz - az);
      if (d < 1e-6) continue;
      const n = Math.max(1, Math.ceil(d / STEP_M));
      for (let k = 1; k <= n; k++) { const t = k / n; xs.push(ax + (bx - ax) * t); zs.push(az + (bz - az) * t); ls.push(L + d * t); }
      L += d;
    }
    return { x: Float32Array.from(xs), z: Float32Array.from(zs), len: Float32Array.from(ls), total: L };
  }

  function build() {
    mesh.geometry.dispose(); chevrons.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry(); chevrons.geometry = new THREE.BufferGeometry();
    mesh.visible = chevrons.visible = false;
    if (!samples || samples.x.length < 2) return;
    const { x: X, z: Z, len: Ls } = samples, n = X.length;
    const pos = new Float32Array(n * 6), dir = new Float32Array(n * 6), side = new Float32Array(n * 2), len = new Float32Array(n * 2), lift = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);   // tangent over a few metres: smooth corners
      let dx = X[b] - X[a], dz = Z[b] - Z[a]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const x = X[i], z = Z[i], y = meshH(x, z) + LIFT_M;
      // cross slope: rise per metre to the side, so the ribbon edges do not sink into a side slope
      const cross = Math.abs(meshH(x - dz, z + dx) - meshH(x + dz, z - dx)) / 2;
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3, v = i * 2 + s;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; dir[o] = dx; dir[o + 2] = dz;
        side[v] = s ? 1 : -1; len[v] = Ls[i]; lift[v] = cross;
      }
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = mesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setAttribute('aLen', new THREE.BufferAttribute(len, 1));
    g.setAttribute('aLift', new THREE.BufferAttribute(lift, 1)); g.setIndex(idx);
    uniforms.uTotal.value = samples.total;
    mesh.visible = true;

    // floating chevrons: one quad every CHEV_EVERY_M; the vertex shader turns each one to face the camera
    const anchors = [];
    for (let i = 0, next = CHEV_EVERY_M; i < n; i++) if (Ls[i] >= next && Ls[i] <= samples.total - 2) { anchors.push(i); next = Ls[i] + CHEV_EVERY_M; }
    const m = anchors.length;
    if (!m) return;
    const cPos = new Float32Array(m * 12), cDir = new Float32Array(m * 12), cCorner = new Float32Array(m * 8), cLen = new Float32Array(m * 4), cIdx = [];
    const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    anchors.forEach((i, k) => {
      const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3);
      let dx = X[b] - X[a], dz = Z[b] - Z[a]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const y = meshH(X[i], Z[i]) + CHEV_HEIGHT_M;
      for (let c = 0; c < 4; c++) {
        const v = k * 4 + c;
        cPos.set([X[i], y, Z[i]], v * 3); cDir.set([dx, 0, dz], v * 3); cCorner.set(CORNERS[c], v * 2); cLen[v] = Ls[i];
      }
      cIdx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const cg = chevrons.geometry;
    cg.setAttribute('position', new THREE.BufferAttribute(cPos, 3)); cg.setAttribute('aDir', new THREE.BufferAttribute(cDir, 3));
    cg.setAttribute('aCorner', new THREE.BufferAttribute(cCorner, 2)); cg.setAttribute('aLen', new THREE.BufferAttribute(cLen, 1)); cg.setIndex(cIdx);
    chevrons.visible = true;
  }

  return {
    mesh, chevrons,
    /** @param {Array<[number, number]> | null} p route in metres, x east, z south (the planner's `path`) */
    setPath(p) {
      if (p == null) { path = null; samples = null; walked = 0; uniforms.uWalked.value = 0; build(); return; }
      if (!validPath(p)) throw new Error('setRoute: expected [[x, z], ...] with at least two finite points');
      path = p.map(([x, z]) => [x, z]);
      samples = resample(path);
      walked = 0; uniforms.uWalked.value = 0;   // a new route starts where the player stands
      build();
    },
    rebuild() { if (path) build(); },
    /** @param {number} dt @param {{ x: number, z: number } | null} position player position, or null when not walking */
    // `walked` follows the player along the route: walking back lights the route ahead again. Only the part of the
    // route near the current progress is searched, so a route that passes close to itself does not jump.
    update(dt, position) {
      uniforms.uChevOn.value += ((position ? 1 : 0) - uniforms.uChevOn.value) * Math.min(1, dt * 4);   // chevrons only in Walk mode
      if (!samples || !position) return;
      const { x: X, z: Z, len } = samples, n = X.length;
      // find the nearest point of the route near the current progress
      let best = -1, bestD = TRACK_SIDE_M * TRACK_SIDE_M;
      // samples are at most STEP_M apart, so sample i is at least (i * STEP_M) metres along: a safe place to start
      for (let i = Math.max(0, Math.floor((walked - TRACK_BACK_M) / STEP_M)); i < n; i++) {
        if (len[i] > walked + TRACK_AHEAD_M) break;
        if (len[i] < walked - TRACK_BACK_M) continue;
        const dx = X[i] - position.x, dz = Z[i] - position.z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) walked = len[best];   // off the route (more than TRACK_SIDE_M away): keep the last progress
      // ease the uniform so the walked/ahead boundary slides instead of stepping metre by metre
      const u = uniforms.uWalked;
      u.value += (walked - u.value) * Math.min(1, dt * 6);
    },
    /** Metres along the current route to the player's position. */
    get walked() { return walked; },
    dispose() { for (const o of [mesh, chevrons]) { o.geometry.dispose(); o.material.dispose(); scene.remove(o); } },
  };
}
