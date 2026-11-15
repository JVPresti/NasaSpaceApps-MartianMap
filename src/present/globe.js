// Mars from orbit for the presentation (#291): the Viking colour mosaic on a sphere, the THEMIS and CTX images of
// Jezero laid on it, a thin atmosphere rim and a fixed star field. Its own canvas and renderer, so the engine's scene
// and the globe never share state. Units are kilometres.
import * as THREE from 'three';
import { MARS_RADIUS_M, BASE_ELEV_M, viewDir } from './geo.js';

const RAD = Math.PI / 180;
export const GLOBE_R = (MARS_RADIUS_M + BASE_ELEV_M) / 1000;   // the sphere sits at the site's base height

/** A point on the sphere, matching three's SphereGeometry and an equirectangular texture (west edge at -180). */
export function spherePoint(latDeg, lonDeg, r, out = new THREE.Vector3()) {
  const phi = (lonDeg + 180) * RAD, theta = (90 - latDeg) * RAD;
  return out.set(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}
function frame(latDeg, lonDeg) {
  const phi = (lonDeg + 180) * RAD, theta = (90 - latDeg) * RAD;
  const up = spherePoint(latDeg, lonDeg, 1);
  const east = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
  const north = new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.sin(theta), -Math.sin(phi) * Math.cos(theta));
  return { up, east, north };
}

const SURFACE_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN;
void main() { vUv = uv; vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SURFACE_FRAG = /* glsl */ `
uniform sampler2D tMap; uniform vec3 uSun; uniform float uOpacity, uEdge;
varying vec2 vUv; varying vec3 vN;
void main() {
  vec3 c = texture2D(tMap, vUv).rgb;
  float d = dot(normalize(vN), uSun);
  float light = clamp(0.04 + 1.1 * smoothstep(-0.12, 0.6, d), 0.0, 1.0);
  float a = uOpacity;
  if (uEdge > 0.0) { vec2 e = min(vUv, 1.0 - vUv); a *= smoothstep(0.0, uEdge, min(e.x, e.y)); }
  gl_FragColor = vec4(c * light, a);
  #include <colorspace_fragment>
}`;
const RIM_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vView;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vView = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const RIM_FRAG = /* glsl */ `
uniform vec3 uSun; uniform float uOpacity; varying vec3 vN; varying vec3 vView;
void main() {
  float f = 1.0 - abs(dot(vN, vView));
  float glow = pow(f, 5.0) * smoothstep(-0.3, 0.4, dot(vN, uSun));
  gl_FragColor = vec4(vec3(0.85, 0.62, 0.45) * glow * 0.75 * uOpacity, 1.0);
}`;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ globe: HTMLImageElement, region: HTMLImageElement, ctx: HTMLImageElement,
 *   boxes: { region: number[], ctx: number[] }, low?: boolean }} options boxes: [west, south, east, north] degrees
 */
export function createGlobe(canvas, { globe, region, ctx, boxes, low = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 200000);
  const sun = spherePoint(8, 112, 1).normalize();
  const textures = [];
  const tex = (img) => {
    const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = low ? 2 : 8; t.needsUpdate = true;
    textures.push(t); return t;
  };

  const surface = (map, edge, opts = {}) => new THREE.ShaderMaterial({
    uniforms: { tMap: { value: tex(map) }, uSun: { value: sun }, uOpacity: { value: 1 }, uEdge: { value: edge } },
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG, ...opts,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, low ? 96 : 192, low ? 48 : 96), surface(globe, 0));
  scene.add(planet);

  function patch(img, [west, south, east, north], lift, edge, segs) {
    const g = new THREE.SphereGeometry(GLOBE_R + lift, segs, segs, (west + 180) * RAD, (east - west) * RAD, (90 - north) * RAD, (north - south) * RAD);
    const m = new THREE.Mesh(g, surface(img, edge, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.renderOrder = 1;
    scene.add(m);
    return m;
  }
  const regionMesh = patch(region, boxes.region, 0.002, 0.3, 48);
  const ctxMesh = patch(ctx, boxes.ctx, 0.003, 0.18, 24);
  ctxMesh.renderOrder = 2;

  const rim = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 1.012, 96, 48), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uOpacity: { value: 1 } }, vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  }));
  scene.add(rim);

  // A fixed star field: seeded, so every recording shows the same sky. No twinkle, no motion of its own.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const starCount = low ? 900 : 2200, sp = new Float32Array(starCount * 3), sc = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), b = Math.pow(rnd(), 3) * 0.85 + 0.12;
    sp.set([r * Math.cos(a) * 150000, u * 150000, r * Math.sin(a) * 150000], i * 3); sc.set([b, b, b * 0.96], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: low ? 1.6 : 1.3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
  scene.add(stars);

  const tmp = new THREE.Vector3();
  function placeCamera(shot) {
    const f = frame(shot.lat, shot.lon);
    const d = viewDir(shot.yaw, shot.pitch);
    const dir = new THREE.Vector3().addScaledVector(f.east, d.e).addScaledVector(f.north, d.n).addScaledVector(f.up, d.u);
    const target = spherePoint(shot.lat, shot.lon, GLOBE_R + (shot.targetH || 0) / 1000);
    const distKm = shot.dist / 1000;
    camera.position.copy(target).addScaledVector(dir, -distKm);
    const p = shot.pitch * RAD, y = shot.yaw * RAD;
    camera.up.set(0, 0, 0).addScaledVector(f.east, -Math.sin(p) * Math.sin(y)).addScaledVector(f.north, -Math.sin(p) * Math.cos(y)).addScaledVector(f.up, Math.cos(p)).normalize();
    camera.lookAt(target);
    camera.fov = shot.fov;
    const alt = Math.max(0.05, camera.position.length() - GLOBE_R);
    camera.near = Math.max(0.01, alt * 0.05);
    camera.far = 400000;
    camera.updateProjectionMatrix();
    return alt;
  }

  return {
    /** Draw one frame of a shot. Images fade by name: { region, ctx } 0 to 1. */
    render(shot, { region: ra = 1, ctx: ca = 1, stars: sa = 1 } = {}) {
      const alt = placeCamera(shot);
      regionMesh.material.uniforms.uOpacity.value = ra; regionMesh.visible = ra > 0.001;
      ctxMesh.material.uniforms.uOpacity.value = ca; ctxMesh.visible = ca > 0.001;
      stars.material.opacity = sa; stars.visible = sa > 0.001;
      rim.material.uniforms.uOpacity.value = Math.min(1, alt / 2000);
      renderer.render(scene, camera);
    },
    /** Screen position (CSS pixels) of a point on the sphere, after render() placed the camera. */
    project(lat, lon, w, h) {
      spherePoint(lat, lon, GLOBE_R + 0.5, tmp);
      const facing = tmp.clone().normalize().dot(camera.position.clone().sub(tmp).normalize()) > 0;
      tmp.project(camera);
      return { x: (tmp.x + 1) / 2 * w, y: (1 - tmp.y) / 2 * h, visible: facing && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 };
    },
    setSize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      for (const t of textures) t.dispose();
      renderer.dispose();
    },
  };
}
