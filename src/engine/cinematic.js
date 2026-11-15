// The presentation's hold on the engine (#291): a scripted camera, a fixed time step for frame-perfect recording,
// and three overlays drawn into the scene. Nothing here runs unless src/present/ asks for it through
// engine.cinematic(); release() hands the camera back exactly as it was.
//
//   const cine = engine.cinematic();          // null before ready
//   cine.onFrame((dt) => { ... });            // called inside the engine's frame, before the render
//   cine.setShot({ x, y, z, yaw, pitch, fov });   // metres; yaw clockwise from north, pitch up positive (radians)
//   cine.setFixedStep(1 / 60) | null;         // every frame advances exactly this much
//   cine.setLoop(false); cine.step();         // stop the engine's own loop and render one frame on demand
//   cine.addImage({ image, box, y });         // an orbital image as a flat plane under the terrain (box in metres)
//   cine.setRoute(path); cine.setRouteReveal(m);   // the route drawn in up to m metres from its start
//   cine.setZone({ cols, rows, x0, z0, dx, dz, last }); cine.setZoneFrame(f, opacity);   // the zone clip (src/present/zoneFrames.js)
//   cine.release();
import * as THREE from 'three';

const HIDDEN_LAYER = 7;

const ZONE_VERT = /* glsl */ `
varying vec2 vUv; varying vec2 vXZ;
void main() { vUv = uv; vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// The texture holds `last` (frame index, 1-based, divided by 255). Linear filtering makes last = f + 0.5 a smooth
// boundary, so the zone shrinks without blocks. Inside: thin orange fill and a bright edge; outside: dimmed ground.
const ZONE_FRAG = /* glsl */ `
uniform sampler2D tLast; uniform float uFrame, uOpacity, uDim; uniform vec3 uColor; uniform vec3 uFocus; uniform vec2 uTile;
varying vec2 vUv; varying vec2 vXZ;
void main() {
  float v = texture2D(tLast, vUv).r * 255.0 - (uFrame + 0.5);
  float w = fwidth(v) * 1.4 + 1e-4;
  float inside = smoothstep(-w, w, v);
  float edge = 1.0 - smoothstep(0.0, w * 1.6, abs(v));
  vec3 c = mix(vec3(0.0), uColor, max(inside * 0.9, edge));
  // the ground outside is dimmed only around the zone (uFocus: x, z, radius), so the tile's edge never shows as a slab
  float dim = uDim * (1.0 - smoothstep(uFocus.z * 0.55, uFocus.z, length(vXZ - uFocus.xy)));
  float a = mix(dim, 0.26, inside);
  a = max(a, edge * 0.95);
  // the tile ends 176 m from the habitat; fade there instead of cutting the zone with a straight line
  a *= smoothstep(0.0, 60.0, min(uTile.x - abs(vXZ.x), uTile.y - abs(vXZ.y)));
  gl_FragColor = vec4(c, a * uOpacity);
}`;

const ROUTE_VERT = /* glsl */ `
attribute float aAlong; varying float vAlong; varying float vSide; attribute float aSide;
void main() { vAlong = aAlong; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ROUTE_FRAG = /* glsl */ `
uniform float uReveal, uOpacity; uniform vec3 uColor; varying float vAlong; varying float vSide;
void main() {
  if (vAlong > uReveal) discard;
  float core = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
  gl_FragColor = vec4(uColor, core * uOpacity);
}`;

/**
 * @param {object} ctx engine context
 * @param {{ render: () => void, loop: (on: boolean) => void, release: () => void }} hooks
 */
export function createCinematic(ctx, hooks) {
  const { camera, scene, U, renderer } = ctx;
  const saved = { fov: camera.fov, near: camera.near, far: camera.far, fogK: U.uFogK.value, up: camera.up.clone() };
  const group = new THREE.Group();
  group.name = 'cinematic';
  scene.add(group);
  const textures = [];
  let shot = null, fixedDt = null, frameCb = null, released = false, looping = true, fogBase = U.uFogK.value, fogWritten = null;

  // The app's own route glow and map labels stay out of the presentation's frames; release() brings them back.
  const hidden = [];
  const hide = (o) => { if (o && o.layers.isEnabled(0)) { hidden.push(o); o.layers.set(HIDDEN_LAYER); } };
  const hideAppLabels = () => {
    if (ctx.sys.routeGlow) { hide(ctx.sys.routeGlow.mesh); hide(ctx.sys.routeGlow.chevrons); }
    scene.traverse((o) => { if (o.isSprite) hide(o); });   // waypoint and shelter labels, also ones added later
  };
  hideAppLabels();

  // ---------------------------------------------------------------- orbital images under the terrain
  function addImage({ image, box, y = -220, opacity = 1 }) {
    const tex = new THREE.Texture(image);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
    textures.push(tex);
    const [x0, z0, x1, z1] = box;   // west, north, east, south edges in metres
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, toneMapped: false, depthWrite: true, fog: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.renderOrder = -2; mesh.frustumCulled = false;
    group.add(mesh);
    return {
      setOpacity(a) { mat.opacity = a; mesh.visible = a > 0.001; mat.depthWrite = a > 0.98; },
      setY(h) { mesh.position.y = h; },
    };
  }

  // ---------------------------------------------------------------- the route, revealed from its start
  const routeMat = new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: new THREE.Color('#e9edf2') } },   // ink white: orange is kept for danger and the zone
    vertexShader: ROUTE_VERT, fragmentShader: ROUTE_FRAG, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
  });
  const routeMesh = new THREE.Mesh(new THREE.BufferGeometry(), routeMat);
  routeMesh.renderOrder = 4; routeMesh.frustumCulled = false; routeMesh.visible = false;
  group.add(routeMesh);
  let routeWidth = 4;
  function setRoute(path, { width = 4 } = {}) {
    routeWidth = width;
    routeMesh.geometry.dispose();
    routeMesh.visible = false;
    if (!path || path.length < 2) return 0;
    const pts = [];
    let along = 0;
    for (let k = 0; k < path.length - 1; k++) {
      const [ax, az] = path[k], [bx, bz] = path[k + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 2));
      for (let s = 0; s < n; s++) pts.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n, along + len * s / n]);
      along += len;
    }
    const lastP = path[path.length - 1]; pts.push([lastP[0], lastP[1], along]);
    const pos = [], al = [], side = [], idx = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const [x, z, d] = pts[k], nx = -dz * routeWidth / 2, nz = dx * routeWidth / 2;
      for (const sgn of [-1, 1]) {
        const px = x + nx * sgn, pz = z + nz * sgn;
        pos.push(px, ctx.terrain.meshH(px, pz) + 0.4, pz); al.push(d); side.push(sgn);
      }
      if (k) { const o = (k - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(al, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setIndex(idx);
    routeMesh.geometry = g; routeMesh.visible = true;
    return along;
  }

  // ---------------------------------------------------------------- the walkback zone
  const zoneUniforms = { tLast: { value: null }, uFrame: { value: 0 }, uOpacity: { value: 0 }, uDim: { value: 0.32 }, uFocus: { value: new THREE.Vector3(0, 0, 1e6) }, uTile: { value: new THREE.Vector2(1e6, 1e6) }, uColor: { value: new THREE.Color('#ff6a2b') } };
  const zoneMat = new THREE.ShaderMaterial({
    uniforms: zoneUniforms, vertexShader: ZONE_VERT, fragmentShader: ZONE_FRAG, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  const zoneMesh = new THREE.Mesh(new THREE.BufferGeometry(), zoneMat);
  zoneMesh.renderOrder = 3; zoneMesh.frustumCulled = false; zoneMesh.visible = false;
  group.add(zoneMesh);
  /**
   * The zone clip's grid, as src/sim/returnZone.js lays it out: cols x rows nodes from the north-west corner, node (q, r)
   * at x0 + q * dx, z0 + r * dz. Drawn on a grid draped over the tile: 3.5 m between vertices on High, 7 m on Low.
   */
  function setZone({ cols, rows, x0, z0, dx, dz, last }) {
    if (zoneUniforms.tLast.value) zoneUniforms.tLast.value.dispose();
    const tex = new THREE.DataTexture(last, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.unpackAlignment = 1; tex.needsUpdate = true;   // rows of cols bytes
    zoneUniforms.tLast.value = tex;
    zoneUniforms.uTile.value.set(ctx.T.W / 2, ctx.T.H / 2);
    const T = ctx.T, seg = ctx.tier === 'low' ? 200 : 400;
    const g = new THREE.PlaneGeometry(T.W, T.H, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, ctx.terrain.meshH(x, z) + 0.6);
      // texel centres sit on the nodes; row 0 is the north edge
      uv.setXY(i, ((x - x0) / dx + 0.5) / cols, ((z - z0) / dz + 0.5) / rows);
    }
    g.computeBoundingSphere();
    zoneMesh.geometry.dispose(); zoneMesh.geometry = g;
  }

  function apply(dt) {
    if (released) return;
    if (frameCb) frameCb(dt);
    hideAppLabels();
    if (!shot) return;
    camera.up.set(0, 1, 0);
    camera.position.set(shot.x, shot.y, shot.z);
    camera.rotation.set(shot.pitch, -shot.yaw, shot.roll || 0, 'YXZ');
    const ground = ctx.terrain.groundH(shot.x, shot.z);
    const alt = Math.max(1, shot.y - ground);
    camera.fov = shot.fov || saved.fov;
    camera.near = Math.max(0.15, alt * 0.004);
    camera.far = Math.max(saved.far, alt * 12);
    camera.updateProjectionMatrix();
    // The haze is calibrated for looking along the ground. From high up the view crosses less air per metre.
    // A sky preset change rewrites the haze; take that as the new base.
    if (fogWritten !== null && U.uFogK.value !== fogWritten) fogBase = U.uFogK.value;
    U.uFogK.value = fogWritten = fogBase * Math.min(1, 1500 / alt);
  }

  return {
    group,
    onFrame(cb) { frameCb = typeof cb === 'function' ? cb : null; },
    setShot(next) { shot = next ? { ...next } : null; },
    frameDt(ft) { return fixedDt !== null ? fixedDt : Math.min(ft / 1000, 0.1); },
    apply,
    setFixedStep(dt) { fixedDt = Number.isFinite(dt) && dt > 0 ? dt : null; },
    setLoop(on) { looping = on !== false; if (!released) hooks.loop(looping); },
    /** Render one frame now (fixed step or not). Use with setLoop(false). */
    step() { if (!released) hooks.render(); },
    addImage,
    setRoute,
    setRouteReveal(m, opacity = 1) { routeMat.uniforms.uReveal.value = m; routeMat.uniforms.uOpacity.value = opacity; },
    setZone,
    /** Dim the ground outside the zone only within radius metres of (x, z). */
    setZoneFocus(x, z, radius) { zoneUniforms.uFocus.value.set(x, z, radius); },
    setZoneFrame(f, opacity = 1, dim = 0.32) {
      zoneUniforms.uFrame.value = f; zoneUniforms.uOpacity.value = opacity; zoneUniforms.uDim.value = dim;
      zoneMesh.visible = opacity > 0.001 && !!zoneUniforms.tLast.value;
    },
    groundAt: (x, z) => ctx.terrain.groundH(x, z),
    meshAt: (x, z) => ctx.terrain.meshH(x, z),
    tier: () => ctx.tier,
    canvas: renderer.domElement,
    release() {
      if (released) return;
      released = true;
      scene.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      for (const t of textures) t.dispose();
      if (zoneUniforms.tLast.value) zoneUniforms.tLast.value.dispose();
      for (const o of hidden) o.layers.set(0);
      camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.up.copy(saved.up); camera.updateProjectionMatrix();
      if (fogWritten !== null && U.uFogK.value === fogWritten) U.uFogK.value = fogBase;
      if (!looping) hooks.loop(true);
      hooks.release();
    },
  };
}
