// Marswalk engine: the Cheyava Falls scene (Neretva Vallis, Jezero crater) as a module with its own render loop.
// Ported from docs/marswalk-assets/testbench-reference/main.js. No React and no page DOM: the engine owns one
// <canvas> inside the container it is given and removes it on dispose().
//
//   const engine = createEngine(container, { assetBase, mode, onStatus, onError });
//   await engine.ready;          // rejects if loading fails
//   engine.setMode('plan' | 'walk');
//   engine.dispose();
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SH from './shaders.js';
import { createAssets, b64u16, b64u8 } from './assets.js';
import { createUniforms } from './uniforms.js';
import { TIERS, detectTier } from './tiers.js';
import { createTerrain } from './terrain.js';
import { buildSky, applyPreset } from './atmosphere.js';
import { createRocks, buildCheyava, ROCK_NAMES } from './rocks.js';
import { createRoute } from './route.js';
import { createCast } from './cast.js';
import { createPartner } from './partner.js';
import { createLegs } from './legs.js';
import { createArms } from './arms.js';
import { createProps } from './props.js';
import { createHabitat } from './habitat.js';
import { createView, createViewState } from './view.js';

/**
 * @param {HTMLElement} container element the canvas fills; its size drives the render size
 * @param {{ assetBase: string, mode?: 'plan' | 'walk', tier?: 'high' | 'low' | null, debug?: boolean,
 *   onStatus?: (text: string) => void, onError?: (err: Error) => void }} options
 *   tier: force a quality tier and turn off the automatic choice (the app passes ?tier=high|low).
 *   debug: expose window.__marswalk for measuring (development builds only).
 */
export function createEngine(container, { assetBase, mode = 'walk', tier = null, debug = false, onStatus = () => {}, onError = () => {} } = {}) {
  if (!assetBase) throw new Error('createEngine: assetBase is required');
  let alive = true, started = false, requestedMode = mode, viewCtl = null;
  const ac = new AbortController(), { signal } = ac;
  const status = (t) => { if (alive) onStatus(t); };
  const fail = (e) => { if (alive) onError(e instanceof Error ? e : new Error(String(e))); };

  // ---------------------------------------------------------------- renderer (bench lines 27-36)
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.touchAction = 'none';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.debug.onShaderError = (gl, prog, vs, fs) => { const m = (gl.getShaderInfoLog(fs) || '') + ' ' + (gl.getShaderInfoLog(vs) || '') + ' ' + (gl.getProgramInfoLog(prog) || ''); fail(new Error('shader: ' + m.slice(0, 400))); };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 30000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 5; controls.maxDistance = 9000; controls.enabled = false;

  // Shared context: every subsystem factory reads what it needs from here. Cross-references go through ctx.sys.
  const ctx = {
    renderer, scene, camera, controls,
    U: createUniforms(), assets: createAssets(assetBase),
    view: createViewState(), sys: {},
    T: null, RING: null, PRESETS: null, terrain: null,
    tier: 'high', tierAuto: true, orthoCache: {}, presetName: 'clear_day', gpu: '',
  };
  const { U, assets, sys } = ctx;

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // ---------------------------------------------------------------- tiers (bench lines 810-822)
  async function setTier(name) {
    ctx.tier = name; const t = TIERS[name];
    if (!ctx.orthoCache[name]) ctx.orthoCache[name] = await assets.tex(t.ortho, { aniso: t.aniso });
    if (!alive) return;
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
    frames++; acc += ft; worst = Math.max(worst, ft);
    if (acc > 1000) {
      const fps = Math.round(frames * 1000 / acc);
      lastStats = { fps, worstMs: Math.round(worst) };
      // auto tier: three slow seconds in a row on High -> Low
      if (ctx.tierAuto && ctx.tier === 'high' && now - booted > 3000) {
        slowWindows = (fps < 40 && worst < 250 && !document.hidden) ? slowWindows + 1 : 0;
        if (slowWindows >= 3) setTier('low').catch(fail);
      }
      frames = 0; acc = 0; worst = 0;
    }
  }

  // ---------------------------------------------------------------- boot (bench lines 870-935)
  const ready = (async () => {
    status('Loading terrain data…');
    const [tj, rj, pj, rocksJ] = await Promise.all([assets.json('terrain.json'), assets.json('ring.json'), assets.json('atmosphere_presets.json'), assets.json('rocks.json')]);
    if (!alive) return;
    const u = b64u16(tj.heights_u16_b64), h = new Float32Array(u.length); for (let i = 0; i < u.length; i++) h[i] = u[i] / 65535 * tj.range_m;
    ctx.T = { n: tj.n, W: tj.width_m, H: tj.depth_m, h, dens: b64u8(tj.density_u8_b64), dn: tj.density_n, base: tj.base_elev_m };
    const ru = b64u16(rj.heights_u16_b64), rh = new Float32Array(ru.length); for (let i = 0; i < ru.length; i++) rh[i] = rj.min_m + ru[i] / 65535 * rj.range_m;
    ctx.RING = { n: rj.n, size: rj.size_m, h: rh }; U.uSize.value.set(ctx.T.W, ctx.T.H); U.uRingSize.value = ctx.RING.size;
    ctx.PRESETS = pj.presets; U.uFadeStart.value = pj.terrain_detail_fade_m.start; U.uFadeEnd.value = pj.terrain_detail_fade_m.end;

    // subsystems: created now (terrain data is known), loaded below in the bench's order
    ctx.terrain = createTerrain(ctx);
    sys.rocks = createRocks(ctx); sys.route = createRoute(ctx); sys.cast = createCast(ctx);
    sys.partner = createPartner(ctx); sys.arms = createArms(ctx); sys.legs = createLegs(ctx); sys.props = createProps(ctx); sys.habitat = createHabitat(ctx);
    viewCtl = createView(ctx, canvas, signal);

    const detected = detectTier(renderer); ctx.gpu = detected.gpu;
    if (tier && !TIERS[tier]) console.warn('createEngine: unknown tier "' + tier + '", using automatic choice');
    if (tier && TIERS[tier]) { ctx.tier = tier; ctx.tierAuto = false; } else ctx.tier = detected.tier;   // a forced tier also stops the automatic downgrade

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

    viewCtl.setMode(requestedMode); started = true;
    status('');
    booted = last = performance.now();
    renderer.setAnimationLoop(tick);
  })();
  ready.catch((e) => { console.error(e); fail(e); });

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
    };
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
    dispose() {
      if (!alive) return;
      alive = false;
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
