// Marswalk engine: the Cheyava Falls scene (Neretva Vallis, Jezero crater) as a module with its own render loop.
// Ported from docs/marswalk-assets/testbench-reference/main.js. No React and no page DOM: the engine owns one
// <canvas> inside the container it is given and removes it on dispose().
//
//   const engine = createEngine(container, { assetBase, mode, onStatus, onProgress, onError });
//   await engine.ready;          // resolves after the first frame is actually rendered, rejects on failure
//   engine.setMode('plan' | 'walk');
//   engine.setLayer(0..4); engine.setSky('clear_day'); engine.setRoute([[x, z], ...]);
//   engine.heightAt(x, z); engine.slopeAt(x, z); engine.lineOfSight(a, b); engine.getPlayer();
//   engine.dispose();
// The full contract is in docs/STATE_AND_ENGINE.md.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SH from './shaders.js';
import { createAssets, b64u16, b64u8 } from './assets.js';
import { buildAssetManifest, ROCK_NAMES } from './assetManifest.js';
import { decodeTerrainJson, decodeRingJson } from './queries.js';
import { createRouteLine } from './routeLine.js';
import { createUniforms } from './uniforms.js';
import { TIERS, detectTier } from './tiers.js';
import { createTerrain } from './terrain.js';
import { buildSky, applyPreset } from './atmosphere.js';
import { createRocks, buildCheyava } from './rocks.js';
import { createRoute } from './route.js';
import { createCast } from './cast.js';
import { createPartner } from './partner.js';
import { createLegs } from './legs.js';
import { createArms } from './arms.js';
import { createProps } from './props.js';
import { createHabitat } from './habitat.js';
import { createView, createViewState } from './view.js';
import { createLoadLifecycle } from './lifecycle.js';
import { createProgressTracker } from './progress.js';
import { assertWebGL2, rendererFailure } from './webgl.js';

export const LAYERS = ['none', 'slope hazard', 'elevation', 'rock abundance', 'outcrop'];
export const SKIES = ['clear_day', 'dust_storm', 'late_afternoon', 'night'];

/**
 * @param {HTMLElement} container element the canvas fills; its size drives the render size
 * @param {{ assetBase: string, mode?: 'plan' | 'walk', tier?: 'high' | 'low' | null, debug?: boolean,
 *   onStatus?: (text: string) => void, onProgress?: (progress: { loaded: number, failed: number, total: number, ratio: number }) => void, onError?: (err: Error) => void }} options
 *   tier: force a quality tier and turn off the automatic choice (the app passes ?tier=high|low).
 *   debug: expose window.__marswalk for measuring (development builds only).
 */
export function createEngine(container, { assetBase, mode = 'walk', tier = null, debug = false, onStatus = () => {}, onProgress = () => {}, onError = () => {}, onLockChange = () => {} } = {}) {
  if (!assetBase) throw new Error('createEngine: assetBase is required');
  assertWebGL2();

  let alive = true, started = false, firstFrame = false, requestedMode = mode, viewCtl = null, routeLine = null;
  const pending = { sky: null, route: null };   // set before boot ends, applied when ready
  const ac = new AbortController(), { signal } = ac;

  // `ready` resolves only once tick() has drawn a frame; bootstrap completion alone is not enough.
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});   // consumers may only attach later or dispose during boot

  const lifecycle = createLoadLifecycle({ onStatus, onProgress, onError });
  const status = (text) => lifecycle.status(text);
  let renderer = null;
  const fail = (cause) => {
    if (!lifecycle.fail(cause)) return;
    rejectReady(lifecycle.error);
    if (renderer) renderer.setAnimationLoop(null);
  };

  // ---------------------------------------------------------------- renderer (bench lines 27-36)
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.touchAction = 'none';
  container.appendChild(canvas);
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (cause) {
    canvas.remove();
    throw rendererFailure(cause);
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.debug.onShaderError = (gl, prog, vs, fs) => { const m = (gl.getShaderInfoLog(fs) || '') + ' ' + (gl.getShaderInfoLog(vs) || '') + ' ' + (gl.getProgramInfoLog(prog) || ''); fail(new Error('shader: ' + m.slice(0, 400))); };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 30000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 5; controls.maxDistance = 9000; controls.enabled = false;

  // The quality tier decides which ortho texture belongs in the initial manifest, so detect it before
  // registering the total. Everything else is the same for both tiers.
  const detected = detectTier(renderer);
  if (tier && !TIERS[tier]) console.warn('createEngine: unknown tier "' + tier + '", using automatic choice');
  const forcedTier = tier && TIERS[tier] ? tier : null;   // a forced tier also stops the automatic downgrade
  const initialTier = forcedTier || detected.tier;
  const tracker = createProgressTracker({
    expected: buildAssetManifest(initialTier),
    onChange: (progress) => lifecycle.progress(progress),
  });

  // Shared context: every subsystem factory reads what it needs from here. Cross-references go through ctx.sys.
  const ctx = {
    renderer, scene, camera, controls,
    U: createUniforms(), assets: createAssets(assetBase, { tracker, signal }),
    view: createViewState(), sys: {},
    T: null, RING: null, PRESETS: null, terrain: null,
    tier: initialTier, tierAuto: !forcedTier, orthoCache: {}, presetName: 'clear_day', gpu: detected.gpu,
  };
  const { U, assets, sys } = ctx;

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // ---------------------------------------------------------------- tiers (bench lines 810-822)
  async function setTier(name) {
    const t = TIERS[name];
    if (!ctx.orthoCache[name]) ctx.orthoCache[name] = await assets.tex(t.ortho, { aniso: t.aniso });
    if (!alive) return;
    ctx.tier = name;
    ctx.terrain.material.uniforms.tOrtho.value = ctx.orthoCache[name];
    renderer.setPixelRatio(Math.min(devicePixelRatio, t.pixelRatio)); resize();
    U.uRockR.value.set(t.radius[0] || 1, t.radius[1], t.radius[2]);
    ctx.terrain.buildTerrain(t); ctx.terrain.computeShadows(t.shadowRes); sys.rocks.reset();
    sys.habitat.reground();   // the rebuilt mesh has slightly different heights
  }

  // ---------------------------------------------------------------- frame loop (bench lines 826-868)
  let frames = 0, acc = 0, last = 0, worst = 0, slowWindows = 0, booted = 0;
  let lastStats = { fps: 0, worstMs: 0 };
  function tick() {
    try {
      renderFrame();
    } catch (cause) {
      fail(cause);
    }
  }
  function renderFrame() {
    const now = performance.now(), ft = now - last; last = now;
    const dt = Math.min(ft / 1000, 0.1);
    viewCtl.update(dt);
    camera.getWorldDirection(U.uCamDir.value);
    const eyeMode = ctx.view.mode === 'eye';
    if (sys.arms.L) sys.arms.L.g.visible = sys.arms.R.g.visible = eyeMode;   // first-person arms only in Walk
    U.uTime.value += dt; sys.partner.update(dt); sys.arms.update(dt); sys.legs.update(dt, eyeMode ? ctx.view.moveSpeed : 0); sys.props.update(dt); sys.habitat.update(dt);
    sys.rocks.update(camera.position, TIERS[ctx.tier], false);
    sys.cast.render();
    renderer.render(scene, camera);
    if (!firstFrame) {
      firstFrame = true;
      if (!lifecycle.error) {
        status('');
        if (lifecycle.complete()) resolveReady();
      }
    }
    frames++; acc += ft; worst = Math.max(worst, ft);
    if (acc > 1000) {
      const fps = Math.round(frames * 1000 / acc);
      lastStats = { fps, worstMs: Math.round(worst) };
      // auto tier: three slow seconds in a row on High -> Low
      if (ctx.tierAuto && ctx.tier === 'high' && now - booted > 3000) {
        slowWindows = (fps < 40 && worst < 250 && !document.hidden) ? slowWindows + 1 : 0;
        if (slowWindows >= 3) {
          // A failed optional quality download must leave the current scene running.
          ctx.tierAuto = false;
          setTier('low').catch((cause) => { if (alive) console.warn('Could not change scene quality', cause); });
        }
      }
      frames = 0; acc = 0; worst = 0;
    }
  }

  // ---------------------------------------------------------------- boot (bench lines 870-935)
  const boot = (async () => {
    status('Loading terrain data…');
    const [tj, rj, pj, rocksJ] = await Promise.all([assets.json('terrain.json'), assets.json('ring.json'), assets.json('atmosphere_presets.json'), assets.json('rocks.json')]);
    if (!alive) return;
    ctx.T = decodeTerrainJson(tj, b64u16, b64u8);
    ctx.RING = decodeRingJson(rj, b64u16); U.uSize.value.set(ctx.T.W, ctx.T.H); U.uRingSize.value = ctx.RING.size;
    ctx.PRESETS = pj.presets; U.uFadeStart.value = pj.terrain_detail_fade_m.start; U.uFadeEnd.value = pj.terrain_detail_fade_m.end;

    // subsystems: created now (terrain data is known), loaded below in the bench's order
    ctx.terrain = createTerrain(ctx);
    sys.rocks = createRocks(ctx); sys.route = createRoute(ctx); sys.cast = createCast(ctx);
    sys.partner = createPartner(ctx); sys.arms = createArms(ctx); sys.legs = createLegs(ctx); sys.props = createProps(ctx); sys.habitat = createHabitat(ctx);
    viewCtl = createView(ctx, canvas, signal, { onLockChange: (locked) => { if (alive) onLockChange(locked); } });

    status('Loading textures…');
    const tr = TIERS[ctx.tier];
    const [nrm, mask, gravel, slab, ring, ortho, cCol, cNao, ...rockMaps] = await Promise.all([
      assets.tex('normal_ao.jpg'), assets.tex('outcrop_mask.jpg'), assets.tex('gravel_nl.jpg', { repeat: true, aniso: tr.aniso }), assets.tex('slab_nl.jpg', { repeat: true, aniso: tr.aniso }),
      assets.tex('ring_gray.jpg'), assets.tex(tr.ortho, { aniso: tr.aniso }), assets.tex('cheyava_color.jpg', { srgb: true }), assets.tex('cheyava_nao.jpg'),
      ...ROCK_NAMES.map((n) => assets.tex(n + '.jpg', { srgb: true })),
    ]);
    if (!alive) return;
    ctx.orthoCache[ctx.tier] = ortho; U.tRing.value = ring;
    ctx.terrain.material = new THREE.ShaderMaterial({
      uniforms: { ...U, tOrtho: { value: ortho }, tNrmAo: { value: nrm }, tMask: { value: mask }, tGravel: { value: gravel }, tSlab: { value: slab } },
      vertexShader: SH.TERRAIN_VERT, fragmentShader: SH.TERRAIN_FRAG,
    });

    status('Building the terrain…');
    applyPreset(ctx, 'clear_day');
    renderer.setPixelRatio(Math.min(devicePixelRatio, tr.pixelRatio)); resize(); U.uRockR.value.set(tr.radius[0] || 1, tr.radius[1], tr.radius[2]);
    ctx.terrain.buildTerrain(tr); ctx.terrain.buildRing(ring); buildSky(ctx);
    sys.rocks.init(rocksJ, rockMaps);
    ctx.cheyava = await buildCheyava(ctx, [cCol, cNao]); if (!alive) return;

    status('Loading the astronauts…');
    await sys.partner.init(); if (!alive) return;
    await sys.arms.init(); if (!alive) return;
    await sys.legs.init(); if (!alive) return;
    await sys.props.init(); if (!alive) return;

    status('Loading the habitat…');
    U.uRelief.value = tj.range_m; sys.route.data = await assets.json('route.json'); if (!alive) return;
    await sys.habitat.init(); if (!alive) return;

    if (!alive) return;
    routeLine = createRouteLine(ctx);
    if (pending.sky) applyPreset(ctx, pending.sky);
    routeLine.set(pending.route);
    viewCtl.setMode(requestedMode); started = true;
    booted = last = performance.now();
    renderer.setAnimationLoop(tick);
  })();
  boot.catch((cause) => {
    if (lifecycle.isClosed || lifecycle.error) return;
    console.error(cause);
    fail(cause);
  });

  /** Last one-second measurement. Plain data, safe to poll; the engine never calls back from its frame loop. */
  function stats() {
    const r = renderer.info.render;
    return { ...lastStats, tier: ctx.tier, auto: ctx.tierAuto, gpu: ctx.gpu, triangles: r.triangles, drawCalls: r.calls };
  }

  // Development hook for scripts/measure-fps.mjs: put the camera at a known spot and read stats().
  if (debug) {
    const place = (x, z, yaw, pitch = 0) => { viewCtl.setMode('walk'); requestedMode = 'walk'; ctx.view.eye.set(x, 0, z); ctx.view.yaw = yaw; ctx.view.pitch = pitch; };
    window.__marswalk = {
      stats, place,
      setMode: (m) => { requestedMode = m; viewCtl.setMode(m); },
      // the bench's 'habin' and 'hab' views (testbench main.js lines 802-803)
      insideHabitat() { const h = sys.habitat; place(h.pos.x + h.dir.x * 1.45, h.pos.z + h.dir.z * 1.45, Math.atan2(-h.dir.x, h.dir.z), 0.12); },
      outsideHabitat() {
        const h = sys.habitat, d = h.dir, x = h.pos.x + d.x * 17 - d.z * 7, z = h.pos.z + d.z * 17 + d.x * 7;
        place(x, z, Math.atan2(h.pos.x + d.x * 2 - x, -(h.pos.z + d.z * 2 - z)), -0.05);
      },
      habitatY: () => sys.habitat.pos.y,
      groundUnderHabitat: () => ctx.terrain.meshH(sys.habitat.pos.x, sys.habitat.pos.z),
      setTier: (name) => { ctx.tierAuto = false; return setTier(name); },
      walking: (on) => { ctx.view.keys.KeyW = !!on; },
      // camera and player pose, for checking speed and that the camera follows the ground smoothly
      pose: () => ({ camY: camera.position.y, x: ctx.view.eye.x, z: ctx.view.eye.z, yaw: ctx.view.yaw, pitch: ctx.view.pitch, mode: ctx.view.mode, moveSpeed: ctx.view.moveSpeed }),
    };
  }

  function terrainQueries() {
    if (!ctx.terrain) throw new Error('engine is not ready: wait for engine.ready before querying the terrain');
    return ctx.terrain.queries;
  }

  return {
    ready,
    stats,
    /** @param {'plan' | 'walk'} m */
    setMode(m) {
      if (m !== 'plan' && m !== 'walk') throw new Error('setMode: expected "plan" or "walk", got ' + m);
      requestedMode = m;
      if (started) viewCtl.setMode(m);   // before boot ends, the mode is applied when ready
    },
    /** Data layer drawn on the terrain: 0 none, 1 slope hazard, 2 elevation, 3 rock abundance, 4 outcrop. */
    setLayer(n) {
      if (!Number.isInteger(n) || n < 0 || n >= LAYERS.length) throw new Error('setLayer: expected 0-' + (LAYERS.length - 1) + ', got ' + n);
      U.uLayer.value = n;
      if (sys.arms && sys.arms.L) { sys.arms.draw(); sys.arms.tap = 0.35; }   // the wrist screen shows the active layer
    },
    /** Atmosphere preset: 'clear_day' | 'dust_storm' | 'late_afternoon' | 'night'. */
    setSky(name) {
      if (!SKIES.includes(name)) throw new Error('setSky: expected one of ' + SKIES.join(', ') + ', got ' + name);
      if (started) applyPreset(ctx, name); else pending.sky = name;
    },
    /** Route drawn on the ground, [[x, z], ...] in metres. null clears it. */
    setRoute(path) {
      if (path !== null && !(Array.isArray(path) && path.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])))) throw new Error('setRoute: expected [[x, z], ...] or null');
      if (started) routeLine.set(path); else pending.route = path;
    },
    /** Terrain height (m) at x, z. Available once ready. */
    heightAt(x, z) { return terrainQueries().heightAt(x, z); },
    /** Slope (degrees) at x, z. Available once ready. */
    slopeAt(x, z) { return terrainQueries().slopeAt(x, z); },
    /** Line of sight between two { x, y?, z } points (no y = eye height above ground). Available once ready. */
    lineOfSight(a, b, options) { return terrainQueries().lineOfSight(a, b, options); },
    /** Player position and heading (degrees clockwise from north), and the current mode. */
    getPlayer() {
      const v = ctx.view, deg = ((v.yaw * 180 / Math.PI) % 360 + 360) % 360;
      return { x: v.eye.x, z: v.eye.z, headingDeg: deg, mode: v.mode === 'eye' ? 'walk' : 'plan' };
    },
    dispose() {
      if (!alive) return;
      alive = false;
      lifecycle.close();
      if (debug && window.__marswalk && window.__marswalk.stats === stats) delete window.__marswalk;
      renderer.setAnimationLoop(null);
      ac.abort(); ro.disconnect(); controls.dispose();
      const textures = new Set(), materials = new Set();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        for (const m of [].concat(o.material || [])) materials.add(m);
      });
      for (const m of materials) {
        for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v);
        if (m.uniforms) for (const un of Object.values(m.uniforms)) if (un && un.value && un.value.isTexture) textures.add(un.value);
        m.dispose();
      }
      for (const t of Object.values(ctx.orthoCache)) textures.add(t);
      for (const t of textures) t.dispose();
      if (sys.cast) sys.cast.rt.dispose();
      if (ctx.terrain && ctx.terrain.shadowTex) ctx.terrain.shadowTex.dispose();
      for (const s of [sys.partner, sys.legs]) if (s && s.mixer) s.mixer.stopAllAction();
      renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
