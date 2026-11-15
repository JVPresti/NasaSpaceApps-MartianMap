import { subscribeLanguage } from '../i18n/index.js';
// Marswalk engine: the Cheyava Falls scene (Neretva Vallis, Jezero crater) as a module with its own render loop.
// Ported from docs/marswalk-assets/testbench-reference/main.js. No React and no page DOM: the engine owns one
// <canvas> inside the container it is given and removes it on dispose().
//
//   const engine = createEngine(container, { assetBase, mode, onStatus, onProgress, onError });
//   await engine.ready;          // resolves after the first frame is actually rendered, rejects on failure
//   engine.setMode('plan' | 'walk');
//   engine.setLayer(0..5); engine.setSky('clear_day'); engine.setRoute([[x, z], ...]);
//   engine.setSkyTime(17.75 | null); engine.getSun();   // sky and Sun from the mission clock (#73), missionSky.js
//   engine.habitatZoneAt(x, z); engine.setHabitatPrompt({ rows } | null); engine.inHabitatCabin();   // the habitat and its table prompt (#244)
//   engine.requestPointerLock(); engine.releasePointerLock(); engine.setInputEnabled(false);
//   engine.setQuality('auto' | 'high' | 'low'); engine.getQuality(); engine.resetSession();
//   engine.subscribeTouch(listener); engine.subscribeGamepad(listener);   // UI hints for touch and gamepad (#103)
//   engine.subscribeWrist(listener);   // the wrist screen went up or down (#231)
//   engine.heightAt(x, z); engine.slopeAt(x, z); engine.lineOfSight(a, b); engine.getPlayer();
//   // wrist screen app (#67), wrist.js: the interface draws the canvas, the engine shows it on the arm
//   engine.setWristScreen(canvas | null); engine.invalidateWristScreen(); engine.setWristOpen(true | false);
//   engine.setWristPointer({ x, y, pressed }); engine.getWristState(); engine.getOrthoImage();
//   engine.dispose();
// The full contract is in docs/STATE_AND_ENGINE.md.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SH from './shaders.js';
import { createCinematic } from './cinematic.js';   // the presentation's camera and overlays (#291)
import { createAssets, b64u16, b64u8 } from './assets.js';
import { buildAssetManifest, ROCK_NAMES } from './assetManifest.js';
import { decodeTerrainJson, decodeRingJson } from './queries.js';
import { createRouteGlow, validPath } from './routeGlow.js';
import { createBootPrints } from './bootPrints.js';
import { createDust, clampDust } from './dust.js';
import { hiddenFrame } from './hiddenFrame.js';
import { createMissionSky } from './missionSky.js';
import { createShelterHighlight } from './shelterHighlight.js';
import { validShelter } from './shelterRules.js';
import { createSlopeZone } from './slopeZone.js';
import { createRadioShadow } from './radioShadow.js';
import { createWaypointMarkers } from './waypoints.js';
import { createFindsApi } from './finds.js';
import { metresPerPixel } from './planView.js';
import { createUniforms } from './uniforms.js';
import { TIERS, detectTier } from './tiers.js';
import { createQualityController, QUALITY_OPTIONS } from './quality.js';
import { createTerrain } from './terrain.js';
import { buildSky, applyPreset, applySkyBlend } from './atmosphere.js';
import { createRocks, buildCheyava, buildOutcrop } from './rocks.js';
import { createRoute } from './route.js';
import { createCast } from './cast.js';
import { createPartner } from './partner.js';
import { createScriptedPartner } from './partnerSource.js';
import { CREW } from './crew.js';
import { createLegs } from './legs.js';
import { createArms } from './arms.js';
import { createProps } from './props.js';
import { createSampling } from './sampling.js';
import { createSampleDust } from './sampleDust.js';
import { createSlopeGrid } from './slopeGrid.js';
import { createHabitat } from './habitat.js';
import { createView, createViewState, CHEYAVA_VIEW } from './view.js';
import { createGait } from './gait.js';
import { planTouches } from './planTouch.js';
import { LOOK_DEFAULTS, clampLookSettings } from './lookSettings.js';
import { airlockExit, partnerPatrol, tableSpawn } from './spawn.js';
import { canOpenWrist, wristRestoreState } from './wrist.js';
import { createLoadLifecycle } from './lifecycle.js';
import { createProgressTracker } from './progress.js';
import { assertWebGL2, rendererFailure } from './webgl.js';

// The layers of src/plan/layers.js, in `view.layer` order. The ground draws 1 to 3; radio shadow and exposure are drawn
// on the mission table only, so the ground stays plain for them (TERRAIN_FRAG in shaders.js), as for the return zone.
export const LAYERS = ['none', 'terrain', 'rock abundance', 'outcrop', 'radio shadow', 'exposure', 'return zone'];
export const SKIES = ['clear_day', 'dust_storm', 'late_afternoon', 'night'];

/**
 * @param {HTMLElement} container element the canvas fills; its size drives the render size
 * @param {{ assetBase: string, mode?: 'plan' | 'walk', tier?: 'high' | 'low' | null, inputEnabled?: boolean,
 *   debug?: boolean,
 *   onStatus?: (text: string) => void, onProgress?: (progress: { loaded: number, failed: number, total: number, ratio: number }) => void,
 *   onError?: (err: Error) => void, onLockChange?: (locked: boolean) => void,
 *   onGamepadAction?: (action: 'mode' | 'layer-prev' | 'layer-next' | 'open-plan' | 'end-eva') => void }} options
 *   tier: force a quality tier and turn off the automatic choice (the app passes ?tier=high|low).
 *   inputEnabled: false starts with gameplay input gated off, for a start screen or a menu.
 *   onGamepadAction: a gamepad button press, once per press. The app routes it through the same mode and layer
 *   actions as the keyboard (#103, #174), and the habitat table's actions through src/state/tableActions.js.
 *   debug: expose window.__marswalk for measuring (development builds only).
 */
export function createEngine(container, { assetBase, mode = 'plan', tier = null, inputEnabled: inputEnabledOption = true, debug = false, onStatus = () => {}, onProgress = () => {}, onError = () => {}, onLockChange = () => {}, onGamepadAction = () => {} } = {}) {
  if (!assetBase) throw new Error('createEngine: assetBase is required');
  assertWebGL2();

  let alive = true, started = false, firstFrame = false, requestedMode = mode, viewCtl = null, waypoints = null, wristPose = null;
  let inputEnabled = inputEnabledOption !== false;
  let pendingLock = null, pendingLockResolve = null;
  let pendingReset = false;
  // UI subscriptions for the inputs that appear only after use (#103). Touch and gamepad states are also pushed
  // to a listener added later, so a component mounted after the first use still shows its hint.
  const touchListeners = new Set(), gamepadListeners = new Set(), wristListeners = new Set();
  // A UI listener is a hint overlay: if it throws, the scene must keep rendering.
  const emitTouch = (state) => { for (const listener of touchListeners) { try { listener(state); } catch { /* keep the frame */ } } };
  const emitGamepad = (state) => { for (const listener of gamepadListeners) { try { listener(state); } catch { /* keep the frame */ } } };
  const wristState = () => ({ open: !!(sys.arms && sys.arms.L && sys.arms.state === 'screen') });
  const emitWrist = (state) => { for (const listener of wristListeners) { try { listener(state); } catch { /* keep the frame */ } } };
  const pending = { sky: null, skyBlend: null, skyTime: null, habitatPrompt: null, route: null, shelter: null, waypoints: null, dust: 0, slopeZone: null, radioShadow: null, slopeGrid: false, wristScreen: null, habitatScreens: null, lookSettings: null };   // set before boot ends, applied when ready
  const ac = new AbortController(), { signal } = ac;

  // `ready` resolves only once tick() has drawn a frame; bootstrap completion alone is not enough.
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});   // consumers may only attach later or dispose during boot
  let resolveDisposed;
  const disposed = new Promise((resolve) => { resolveDisposed = resolve; });

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
  // Plan is a north-up map (#135, #213): one finger pans and two pan and pinch-zoom, never orbit. Walk uses its
  // own touch controller (view.js), and OrbitControls stays disabled there.
  controls.touches = planTouches(THREE.TOUCH);

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
    tier: initialTier, orthoCache: {}, presetName: 'clear_day', gpu: detected.gpu,
    gait: createGait(),   // one gait phase for legs, head bob, arm swing and boot prints (#228)
  };
  const { U, assets, sys } = ctx;
  const unsubscribeLanguage = subscribeLanguage(() => {
    if (started && alive) { sys.arms.draw(); sys.habitat.screens.draw(); }
  });
  signal.addEventListener('abort', unsubscribeLanguage, { once: true });

  // Serialises UI and automatic quality changes. The actual work is applyTier below.
  const quality = createQualityController({
    apply: (name) => applyTier(name),
    detect: () => detectTier(renderer).tier,
    initialTier,
    initialAuto: !forcedTier,
    onError: (cause) => { if (alive) console.warn('Could not change scene quality', cause); },
  });

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // ---------------------------------------------------------------- tiers (bench lines 810-822)
  async function applyTier(name) {
    const t = TIERS[name];
    if (!ctx.orthoCache[name]) ctx.orthoCache[name] = await assets.tex(t.ortho, { aniso: t.aniso });
    if (!alive) return;
    ctx.tier = name;
    ctx.terrain.material.uniforms.tOrtho.value = ctx.orthoCache[name];
    renderer.setPixelRatio(Math.min(devicePixelRatio, t.pixelRatio)); resize();
    U.uRockR.value.set(t.radius[0] || 1, t.radius[1], t.radius[2]);
    ctx.terrain.buildTerrain(t); ctx.terrain.computeShadows(t.shadowRes); sys.rocks.reset();
    if (sys.sky) sys.sky.shadowsBaked();
    sys.habitat.reground();   // the rebuilt mesh has slightly different heights
    if (ctx.outcrop) ctx.outcrop.userData.place(name);
    if (sys.routeGlow) sys.routeGlow.rebuild();  // re-drape the route on the new mesh
    if (sys.shelter) sys.shelter.rebuild();
    if (sys.prints) sys.prints.setTier(name);
    if (sys.slopeGrid) sys.slopeGrid.rebuild();
    if (sys.dust) sys.dust.setTier(name);
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
    const dt = sys.cine ? sys.cine.frameDt(ft) : Math.min(ft / 1000, 0.1);   // the presentation can fix the step (#291)
    viewCtl.update(dt);
    if (sys.cine) sys.cine.apply(dt);
    camera.getWorldDirection(U.uCamDir.value);
    const eyeMode = ctx.view.mode === 'eye';
    if (sys.arms.L) sys.arms.L.g.visible = sys.arms.R.g.visible = eyeMode;   // first-person arms only in Walk
    U.uTime.value += dt; sys.partner.update(dt); sys.arms.update(dt); sys.legs.update(dt); sys.props.update(dt); sys.habitat.update(dt);
    sys.sampling.update(dt);   // after props: follows the clip and the scoop content (#36)
    sys.sampleDust.update(dt);   // after sampling: the puff and the scrape when the scoop reaches the ground (#50)
    sys.slopeGrid.update(dt);
    sys.routeGlow.update(dt, eyeMode ? ctx.view.eye : null);
    sys.shelter.update(dt, ctx.view.eye, camera);
    sys.prints.update(dt);
    sys.sky.update(dt);   // before the dust: a new sky is then scaled by the storm light in the same frame
    sys.dust.update(dt);
    // No draw while App.css hides the canvas under the opaque mission table (hiddenFrame.js, #304)
    const hidden = hiddenFrame(renderer.domElement, firstFrame);
    if (hidden) { ({ frames, acc, worst, slowWindows } = hidden); lastStats = hidden.stats; return; }
    sys.rocks.update(camera.position, TIERS[ctx.tier], false);
    sys.cast.render();
    if (waypoints?.group.visible) waypoints.update(camera, container.clientHeight);   // fixed-size labels (#198)
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
      // auto tier: three slow seconds in a row on High -> Low. The controller serialises this with a
      // user choice made from the pause menu, so the two can never interleave.
      const q = quality.get();
      if (sys.cine) slowWindows = 0;   // never rebuild the terrain under the presentation's meshes (#291)
      else if (q.auto && !q.pending && ctx.tier === 'high' && now - booted > 3000) {
        slowWindows = (fps < 40 && worst < 250 && !document.hidden) ? slowWindows + 1 : 0;
        if (slowWindows >= 3) {
          slowWindows = 0;
          // A failed optional quality download leaves the current scene running and reports through the controller.
          quality.degrade('low');
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
    sys.arms.setScreenCanvas(pending.wristScreen);   // the app's canvas may have arrived before boot reached the arms
    viewCtl = createView(ctx, canvas, signal, {
      inputEnabled,
      onLockChange: (locked) => { if (alive) onLockChange(locked); },
      onTouch: (state) => { if (alive) emitTouch(state); },
      onGamepad: (state) => { if (alive) emitGamepad(state); },
      onGamepadAction: (action) => { if (alive) onGamepadAction(action); },
    });
    viewCtl.setLookSettings(pending.lookSettings ?? LOOK_DEFAULTS);   // a call made before ready must not be lost
    if (pendingLockResolve) {
      // A request made before ready has no live user gesture left by now; report the browser's real outcome.
      const resolvePending = pendingLockResolve;
      pendingLockResolve = null;
      pendingLock = null;
      viewCtl.requestPointerLock().then(resolvePending);
    }

    status('Loading textures…');
    const tr = TIERS[ctx.tier];
    const oc = ctx.tier === 'low' ? '_lo' : '';   // the layered outcrop has half-size textures for the Low tier
    const [nrm, mask, gravel, slab, ring, ortho, cCol, cNao, oCol, oNao, ...rockMaps] = await Promise.all([
      assets.tex('normal_ao.jpg'), assets.tex('outcrop_mask.jpg'), assets.tex('gravel_nl.jpg', { repeat: true, aniso: tr.aniso }), assets.tex('slab_nl.jpg', { repeat: true, aniso: tr.aniso }),
      assets.tex('ring_gray.jpg'), assets.tex(tr.ortho, { aniso: tr.aniso }), assets.tex('cheyava_color.jpg', { srgb: true }), assets.tex('cheyava_nao.jpg'),
      assets.tex('outcrop_color' + oc + '.jpg', { srgb: true, aniso: tr.aniso }), assets.tex('outcrop_nao' + oc + '.jpg'),
      ...ROCK_NAMES.map((n) => assets.tex(n + '.jpg', { srgb: true })),
    ]);
    if (!alive) return;
    ctx.orthoCache[ctx.tier] = ortho; U.tRing.value = ring;
    // the rock abundance layer reads the density grid of terrain.json, the one the route planner prices (costGrid.rockAbundanceAt)
    const density = new THREE.DataTexture(ctx.T.dens, ctx.T.dn, ctx.T.dn, THREE.RedFormat, THREE.UnsignedByteType); density.needsUpdate = true;
    ctx.terrain.material = new THREE.ShaderMaterial({
      uniforms: { ...U, tOrtho: { value: ortho }, tNrmAo: { value: nrm }, tMask: { value: mask }, tGravel: { value: gravel }, tSlab: { value: slab }, tDensity: { value: density } },
      vertexShader: SH.TERRAIN_VERT, fragmentShader: SH.TERRAIN_FRAG,
    });

    status('Building the terrain…');
    applyPreset(ctx, 'clear_day');
    renderer.setPixelRatio(Math.min(devicePixelRatio, tr.pixelRatio)); resize(); U.uRockR.value.set(tr.radius[0] || 1, tr.radius[1], tr.radius[2]);
    ctx.terrain.buildTerrain(tr); ctx.terrain.buildRing(ring); buildSky(ctx);
    ctx.outcrop = await buildOutcrop(ctx, [oCol, oNao]); if (!alive) return;   // before the rocks, which keep clear of it
    sys.rocks.init(rocksJ, rockMaps);
    ctx.cheyava = await buildCheyava(ctx, [cCol, cNao]); if (!alive) return;

    status('Loading the astronauts…');
    await sys.partner.init(); if (!alive) return;
    await sys.arms.init(); if (!alive) return;
    await sys.legs.init(); if (!alive) return;
    await sys.props.init(); if (!alive) return;
    sys.sampling = createSampling(ctx, canvas, signal);
    sys.sampleDust = createSampleDust(ctx);
    sys.slopeGrid = createSlopeGrid(ctx); sys.slopeGrid.set(pending.slopeGrid);

    status('Loading the habitat…');
    U.uRelief.value = tj.range_m; sys.route.data = await assets.json('route.json'); if (!alive) return;
    await sys.habitat.init(); if (!alive) return;
    if (pending.habitatScreens) sys.habitat.screens.setData(pending.habitatScreens);
    sys.habitat.prompt.set(pending.habitatPrompt);
    placeInHabitat();   // the astronaut starts inside, at the mission table (habitat-first flow)

    if (!alive) return;
    sys.routeGlow = createRouteGlow(ctx);
    waypoints = createWaypointMarkers(ctx);
    if (pending.sky) applyPreset(ctx, pending.sky);
    sys.routeGlow.setPath(pending.route);
    sys.shelter = createShelterHighlight(ctx);
    sys.shelter.set(pending.shelter);
    sys.prints = createBootPrints(ctx); sys.prints.setTier(ctx.tier);
    sys.dust = createDust(ctx); sys.dust.setTier(ctx.tier); sys.dust.set(pending.dust);
    sys.slopeZone = createSlopeZone(ctx);
    sys.slopeZone.set(pending.slopeZone);
    sys.radioShadow = createRadioShadow(ctx);
    sys.radioShadow.set(pending.radioShadow);
    if (pending.skyBlend) applySkyBlend(ctx, pending.skyBlend.from, pending.skyBlend.to, pending.skyBlend.t);
    sys.sky = createMissionSky(ctx);
    sys.sky.setStorm(pending.sky === 'dust_storm' ? 1 : pending.skyBlend && pending.skyBlend.to === 'dust_storm' ? pending.skyBlend.t : 0);
    if (pending.skyTime !== null) sys.sky.setTime(pending.skyTime);
    waypoints.set(pending.waypoints);
    waypoints.group.visible = requestedMode === 'plan';
    ctx.onSurface = false;
    viewCtl.setMode(requestedMode); started = true;
    if (pendingReset) {
      pendingReset = false;
      resetToHabitat();
    }
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
    const r = lastStats.hidden ? { triangles: 0, calls: 0 } : renderer.info.render;   // a hidden canvas draws nothing (#304)
    return { ...lastStats, tier: ctx.tier, auto: quality.get().auto, gpu: ctx.gpu, triangles: r.triangles, drawCalls: r.calls };
  }

  function setPose(x, z, yaw, pitch = 0) { ctx.view.eye.set(x, 0, z); ctx.view.yaw = yaw; ctx.view.pitch = pitch; }
  // The EVA start (#166): outside the airlock facing the first waypoint (spawn.js), the partner beside the player.
  // The outer hatch works again and sampling is allowed: the astronaut is on the surface.
  function placeAtAirlock() {
    const exit = airlockExit(sys.habitat.pos, sys.habitat.dir, sys.route.data.waypoints[1]);
    setPose(exit.x, exit.z, exit.yaw);
    sys.habitat.sealed = false; ctx.onSurface = true;
    sys.partner.parked = false; sys.arms.setScreenOff(false);
    sys.partner.setSource(createScriptedPartner({ id: CREW[1].id, color: CREW[1].color, ...partnerPatrol(exit) }));
    return exit;
  }
  // Inside, before the EVA or after it (habitat-first flow): at the mission table, outer hatch shut so nobody walks
  // out before Begin EVA, the partner out of sight until the airlock cycle, and no sampling indoors.
  function placeInHabitat() {
    const spot = tableSpawn(sys.habitat.pos, sys.habitat.dir);
    setPose(spot.x, spot.z, spot.yaw, spot.pitch);
    sys.habitat.sealed = true; sys.habitat.open = 0; ctx.onSurface = false;
    sys.partner.parked = true; sys.arms.setScreenOff(true);   // the suit is on standby: no wrist screen indoors
    return spot;
  }
  // Restart (#64): back inside at the table, on foot; Begin EVA at the table starts the next EVA.
  function resetToHabitat() {
    requestedMode = 'walk';
    const spot = placeInHabitat();
    viewCtl.reset(spot, 'walk');
    ctx.view.pitch = spot.pitch;
    if (waypoints) waypoints.group.visible = false;
  }

  // Development hook for scripts/measure-fps.mjs: put the camera at a known spot and read stats().
  if (debug) {
    const place = (x, z, yaw, pitch = 0) => { viewCtl.setMode('walk'); requestedMode = 'walk'; setPose(x, z, yaw, pitch); };
    window.__marswalk = {
      stats, place,
      // the EVA start (spawn.js) and the test bench's old start near Cheyava Falls
      airlock() { const e = placeAtAirlock(); place(e.x, e.z, e.yaw); },
      table() { const e = placeInHabitat(); place(e.x, e.z, e.yaw, e.pitch); },
      cheyavaView() { place(CHEYAVA_VIEW.x, CHEYAVA_VIEW.z, CHEYAVA_VIEW.yaw); },
      setMode: (m) => { requestedMode = m; viewCtl.setMode(m); },
      // the bench's 'habin' and 'hab' views (testbench main.js lines 802-803)
      insideHabitat() { const h = sys.habitat; place(h.pos.x + h.dir.x * 1.45, h.pos.z + h.dir.z * 1.45, Math.atan2(-h.dir.x, h.dir.z), 0.12); },
      outsideHabitat() {
        const h = sys.habitat, d = h.dir, x = h.pos.x + d.x * 17 - d.z * 7, z = h.pos.z + d.z * 17 + d.x * 7;
        place(x, z, Math.atan2(h.pos.x + d.x * 2 - x, -(h.pos.z + d.z * 2 - z)), -0.05);
      },
      sun: () => sys.sky.sun,   // the Sun while the mission clock drives the sky (#73), else null
      habitatY: () => sys.habitat.pos.y,
      // the habitat origin and the unit vector toward its airlock end, so scripts/measure-demo.mjs can walk back into the cabin
      habitat: () => ({ x: sys.habitat.pos.x, z: sys.habitat.pos.z, dirX: sys.habitat.dir.x, dirZ: sys.habitat.dir.z }),
      groundUnderHabitat: () => ctx.terrain.meshH(sys.habitat.pos.x, sys.habitat.pos.z),
      setTier: (name) => quality.request(name),
      walking: (on) => { ctx.view.keys.KeyW = !!on; },
      partnerCommand: (name) => sys.partner.command(name),
      setPartnerSource: (source) => sys.partner.setSource(source, { chosen: true }),
      partnerState: () => sys.partner.state,
      prints: () => sys.prints.stats(),
      // camera and player pose, for checking speed and that the camera follows the ground smoothly
      pose: () => ({ camY: camera.position.y, x: ctx.view.eye.x, z: ctx.view.eye.z, yaw: ctx.view.yaw, pitch: ctx.view.pitch, mode: ctx.view.mode, moveSpeed: ctx.view.moveSpeed }),
    };
  }

  // unexpected finds (#71): setFinds, aimGround and setPointing in the API below
  const finds = createFindsApi(ctx, { isStarted: () => started && alive });

  function terrainQueries() {
    if (!ctx.terrain) throw new Error('engine is not ready: wait for engine.ready before querying the terrain');
    return ctx.terrain.queries;
  }

  // ---------------------------------------------------------------- wrist screen app (#67, wrist.js)
  const wristPhase = () => (sys.sampling ? sys.sampling.phase() : 'idle');

  /**
   * Raise or lower the wrist screen. Lowering always succeeds and hands the arm back: the tool hold while a sample
   * is in the scoop, else the pose the player had before raising it (or 'down').
   * @param {boolean} open
   * @returns {boolean} true when the wrist is now in the asked state. Opening fails (false) when the engine is not
   *   ready, in Plan mode, while an arm clip plays, or in a sampling phase other than idle or holding.
   */
  function setWrist(open) {
    const arms = sys.arms;
    const wasOpen = !!(arms && arms.L && arms.state === 'screen');
    if (!open) {
      if (!wasOpen) return true;
      arms.set(wristRestoreState({ phase: wristPhase(), clip: !!arms.clip, previous: wristPose }));
      wristPose = null;
      emitWrist({ open: false });
      return true;
    }
    if (!arms || !arms.L) return false;
    if (wasOpen) return true;
    const mode = ctx.view.mode === 'eye' ? 'walk' : 'plan';
    if (!canOpenWrist({ ready: started, mode, clip: !!arms.clip, phase: wristPhase() })) return false;
    wristPose = arms.state;
    arms.set('screen');
    emitWrist({ open: true });
    return true;
  }

  return {
    ready,
    stats,
    setFinds: finds.setFinds,
    aimGround: finds.aimGround,
    setPointing: finds.setPointing,
    /** @param {'plan' | 'walk'} m */
    setMode(m) {
      if (m !== 'plan' && m !== 'walk') throw new Error('setMode: expected "plan" or "walk", got ' + m);
      requestedMode = m;
      if (m === 'plan') setWrist(false);   // the wrist screen cannot stay up in Plan (#67)
      if (started) {
        // Plan is the mission table; walking keeps the position and heading the player had when it opened.
        viewCtl.setMode(m);   // before boot ends, the mode is applied when ready
        if (waypoints) waypoints.group.visible = m === 'plan';
      }
    },
    /**
     * Freeze or allow gameplay input. Menus disable it so WASD, arrows and mouse look cannot act behind them;
     * disabling also clears every held key, so no key stays stuck while paused.
     */
    setInputEnabled(enabled) {
      inputEnabled = enabled === true;
      if (viewCtl) viewCtl.setInputEnabled(inputEnabled);
    },
    /**
     * Follow the Walk touch stick for the on-screen overlay (#103). The listener receives the current state as
     * soon as it subscribes and then on every touch event, never per frame.
     * @param {(state: { visible: boolean, active: boolean, knobX: number, knobY: number, jog: boolean }) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribeTouch(listener) {
      if (typeof listener !== 'function') return () => {};
      touchListeners.add(listener);
      if (viewCtl) listener(viewCtl.touchState());
      return () => touchListeners.delete(listener);
    },
    /**
     * Follow whether a gamepad has been used (#103). The listener is told immediately, so a hint mounted after
     * the first press still appears, and again when the pad is used for the first time.
     * @param {(state: { used: boolean, connected: boolean }) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribeGamepad(listener) {
      if (typeof listener !== 'function') return () => {};
      gamepadListeners.add(listener);
      if (viewCtl) listener(viewCtl.gamepadState());
      return () => gamepadListeners.delete(listener);
    },
    /**
     * Follow the wrist screen (#67, #231). The listener is told immediately and again whenever the arm goes up
     * to or back from the screen, so the Walk hint can show the wrist keys while it is up.
     * @param {(state: { open: boolean }) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribeWrist(listener) {
      if (typeof listener !== 'function') return () => {};
      wristListeners.add(listener);
      listener(wristState());
      return () => wristListeners.delete(listener);
    },
    /**
     * Ask the browser for pointer lock on the engine canvas. Supports the legacy void form and the promise
     * form, and resolves false on refusal, on an unsupported browser, on the watchdog timeout, on release
     * or on dispose. Concurrent calls share one request. A call before `ready` is queued and reported when
     * the canvas exists.
     * @returns {Promise<boolean>}
     */
    requestPointerLock() {
      if (viewCtl) return viewCtl.requestPointerLock();
      if (pendingLock) return pendingLock;
      pendingLock = new Promise((resolve) => { pendingLockResolve = resolve; });
      return pendingLock;
    },
    /** Release the pointer lock now, if any. A queued pre-ready request resolves false. */
    releasePointerLock() {
      if (pendingLockResolve) {
        const resolvePending = pendingLockResolve;
        pendingLockResolve = null;
        pendingLock = null;
        resolvePending(false);
      }
      if (viewCtl) viewCtl.releasePointerLock();
    },
    isPointerLocked() { return viewCtl ? viewCtl.isPointerLocked() : false; },
    /**
     * Quality choice: 'auto' uses the tier detected from the GPU and re-enables the slow-frame downgrade;
     * 'high' and 'low' force a tier and turn the automatic downgrade off. Changes are serialised, so rapid
     * clicks cannot interleave two terrain rebuilds.
     * @param {'auto' | 'high' | 'low'} option
     * @returns {Promise<{ tier: string, auto: boolean, pending: boolean, error: string | null, gpu: string }>}
     */
    setQuality(option) {
      if (!QUALITY_OPTIONS.includes(option)) throw new Error('setQuality: expected one of ' + QUALITY_OPTIONS.join(', ') + ', got ' + option);
      const finish = (result) => ({ ...result, gpu: detected.gpu });
      if (started) return quality.request(option).then(finish);
      if (!alive) return Promise.resolve(finish({ ...quality.get(), pending: false, error: 'engine disposed' }));
      return Promise.race([
        ready.then(
          () => quality.request(option).then(finish),
          (cause) => finish({ ...quality.get(), pending: false, error: (cause && cause.message) || 'engine not ready' }),
        ),
        disposed.then(() => finish({ ...quality.get(), pending: false, error: 'engine disposed' })),
      ]);
    },
    /** Current real quality state, without going through the development-only window hook. */
    getQuality() { return { ...quality.get(), gpu: detected.gpu }; },
    /**
     * Go out through the airlock (habitat-first flow): the player stands at the foot of the airlock steps facing WP1,
     * the outer hatch works and the partner comes out beside them. The app calls this while the airlock cycle has the
     * screen dark. The EVA itself (clock, suit, events) is the simulation's job.
     * @returns {boolean} false before ready
     */
    exitAirlock() {
      if (!started || !alive) return false;
      setWrist(false);
      viewCtl.reset(placeAtAirlock(), 'walk', { keepLock: true });
      viewCtl.setInputEnabled(inputEnabled);
      requestedMode = 'walk';
      return true;
    },
    /**
     * Return the scene to the start of a new EVA: clear input, release the lock, drop the route/shelter markers and
     * put the player back inside the habitat at the mission table, on foot. The store reset and simulation restart are
     * the caller's job (src/state/evaSession.js) because the engine owns no simulation. Quality and the look settings
     * (#102) are deliberately untouched: they are player preferences, not session state.
     * @returns {boolean} false when called before ready (the reset is applied at the end of boot)
     */
    resetSession() {
      if (!alive) return false;
      requestedMode = 'walk';   // a new EVA starts on foot in the habitat, like the reset store
      if (!started) { pendingReset = true; return false; }
      viewCtl.setInputEnabled(false);
      resetToHabitat();
      if (sys.routeGlow) sys.routeGlow.setPath(null);
      if (sys.shelter) sys.shelter.set(null);
      if (waypoints) waypoints.set(null);
      return true;
    },
    /** Data layer drawn on the terrain: 0 none, 1 terrain (slope and contours), 2 rock abundance, 3 outcrop; 4 and 5 are table-only (plain ground). */
    /**
     * Data for the habitat's wall screens and planning table (habitatScreens.js, #47): the plain object built by
     * habitatScreenData() in src/state/habitatScreens.js. The screens redraw from it while someone is near them.
     */
    setHabitatScreens(data) {
      if (sys.habitat && sys.habitat.screens && sys.habitat.root) sys.habitat.screens.setData(data); else pending.habitatScreens = data;
    },
    /**
     * Prompt floating over the habitat's planning table (habitatPrompt.js, #244), shown only while the player is in the
     * cabin: `{ rows: [{ key: 'E', text: 'Open plan' }, { key: 'X', text: 'Finish EVA', dim: false }] }` (up to two rows;
     * a `dim` row does not apply now), `{ key, text }` for a single row, or null to hide it.
     */
    setHabitatPrompt(prompt) {
      pending.habitatPrompt = prompt || null;
      if (sys.habitat && sys.habitat.prompt) sys.habitat.prompt.set(pending.habitatPrompt);
    },
    /** True while the player walks in the habitat's cabin ('main' or 'inner' zone): where the table prompt shows and its keys act. */
    inHabitatCabin() {
      return !!(sys.habitat && sys.habitat.root && sys.habitat.inCabin());
    },
    /** The habitat walk zone at (x, z): 'stairs', 'porch', 'hatch', 'airlock', 'inner' or 'main' (collide.js), or null. */
    habitatZoneAt(x, z) {
      const zone = sys.habitat && sys.habitat.zone(x, z);
      return zone ? zone.n : null;
    },
    setLayer(n) {
      if (!Number.isInteger(n) || n < 0 || n >= LAYERS.length) throw new Error('setLayer: expected 0-' + (LAYERS.length - 1) + ', got ' + n);
      U.uLayer.value = n;
      if (sys.arms && sys.arms.L) { sys.arms.draw(); sys.arms.tap = 0.35; }   // the wrist screen shows the active layer
    },
    /**
     * Hands the wrist screen to the app (#67, wrist.js). `canvas` is the 512 x 352 canvas the interface draws its
     * pages into; it becomes the Screen texture of the left arm. The engine never paints or uploads it: the app calls
     * invalidateWristScreen() after each repaint. `null` puts the built-in layer list back, and keeps working for
     * consumers that have no wrist app.
     * @param {HTMLCanvasElement | null} canvas
     */
    setWristScreen(canvas) {
      if (canvas !== null && !(canvas && typeof canvas.width === 'number' && typeof canvas.height === 'number')) throw new TypeError('setWristScreen: expected a canvas or null');
      pending.wristScreen = canvas;
      if (sys.arms) sys.arms.setScreenCanvas(canvas);   // before the arms exist, boot applies it
    },
    /** Uploads the app's canvas after it repainted. Only the app calls this; nothing else uploads an external screen. */
    invalidateWristScreen() { if (sys.arms) sys.arms.invalidateScreen(); },
    /** Raise (true) or lower (false) the wrist screen. @returns {boolean} false when opening is not possible now. */
    setWristOpen(open) { return setWrist(open === true); },
    /**
     * Where the finger points on the wrist screen, in canvas pixels (x 0..512 right, y 0..352 down). Every call points;
     * every call with pressed: true is one confirm, which pinches for about 0.25 s and returns to point. Only moves the
     * arm while the wrist is up.
     * @param {{ x: number, y: number, pressed?: boolean }} pointer
     * @returns {{ x: number, y: number, pressed: boolean } | null} the clamped pointer, or null before the scene is ready
     */
    setWristPointer(pointer) {
      if (!sys.arms || !sys.arms.L) return null;
      return sys.arms.setWristPointer(pointer);
    },
    /** @returns {{ open: boolean, clip: string | null }} the wrist app state and the arm clip that owns the arm, if any. */
    getWristState() {
      const arms = sys.arms;
      return { open: !!(arms && arms.L && arms.state === 'screen'), clip: arms && arms.clip ? arms.clipName : null };
    },
    /**
     * An ortho image already downloaded (ctx.orthoCache) for the app's map page: the smaller Low-tier texture when it
     * is loaded, else the current tier's. No new download; null until one exists.
     * @returns {CanvasImageSource | null}
     */
    getOrthoImage() {
      const tex = ctx.orthoCache.low || ctx.orthoCache[ctx.tier];
      return tex ? tex.image : null;
    },
    /** Atmosphere preset: 'clear_day' | 'dust_storm' | 'late_afternoon' | 'night'. */
    // While the mission clock drives the sky (setSkyTime) a preset only says whether to show the storm look.
    setSky(name) {
      if (!SKIES.includes(name)) throw new Error('setSky: expected one of ' + SKIES.join(', ') + ', got ' + name);
      pending.sky = name;
      if (!started) return;
      if (sys.sky.active) sys.sky.setStorm(name === 'dust_storm' ? 1 : 0); else applyPreset(ctx, name);
    },
    /**
     * Sky from the mission clock (#73): the Sun moves with the local solar time at the site and the sky blends between
     * the presets by its height, toward the storm look as the dust rises. null goes back to the last setSky preset.
     * @param {number | null} hours local solar time, 0 to 24
     */
    setSkyTime(hours) {
      if (hours !== null && !Number.isFinite(hours)) throw new Error('setSkyTime: expected hours from 0 to 24, or null');
      if (!started) { pending.skyTime = hours; return; }
      const was = sys.sky.active;
      sys.sky.setTime(hours);
      if (was && hours === null) applyPreset(ctx, pending.sky || 'clear_day');
    },
    /** @returns {{ hours: number, elevationDeg: number, azimuthDeg: number } | null} the Sun while the clock drives the sky */
    getSun() { return started ? sys.sky.sun : null; },
    /**
    /**
     * Blend two atmosphere presets without changing the scene geometry.
     * Used by the dust storm to raise opacity gradually.
     * @param {string} from preset name
     * @param {string} to preset name
     * @param {number} t 0 = from, 1 = to
     */
    setSkyBlend(from, to, t) {
      if (!SKIES.includes(from) || !SKIES.includes(to)) throw new Error('setSkyBlend: expected two known presets');
      if (!Number.isFinite(t)) throw new Error('setSkyBlend: t must be a number');
      const clamped = Math.max(0, Math.min(1, t));
      if (started && sys.sky.active && to === 'dust_storm') sys.sky.setStorm(clamped);
      else if (started) applySkyBlend(ctx, from, to, clamped);
      else pending.skyBlend = { from, to, t: clamped };
    },
    /** Slope grid in Walk mode (slopeGrid.js, #50): lines on the ground around the player coloured by slope. */
    setSlopeGrid(on) {
      if (started) sys.slopeGrid.set(!!on); else pending.slopeGrid = !!on;
    },
    /**
     * Mouse look (#102): `sensitivity` multiplies the base rate of both pointer-locked and drag look (0.5-2,
     * default 1, rounded to 0.1), and `invertY` flips only the vertical axis (default false). Values are
     * clamped, never thrown, and a call before `ready` is applied at the end of boot. A restart keeps them.
     * @param {{ sensitivity?: number, invertY?: boolean }} settings
     */
    setLookSettings(settings) {
      const next = clampLookSettings(settings);
      pending.lookSettings = next;
      if (viewCtl) viewCtl.setLookSettings(next);
    },
    /**
     * Storm dust (dust.js, #27), 0 = clear (the scene as before) to 1 = global storm: thicker, drifting haze on everything
     * (visibility about 1 km), dimmer and redder light with fading shadows, and faint wisps near the helmet. Eased, so a
     * storm builds up. Works on top of any sky preset or blend.
     */
    setDust(level) {
      const v = clampDust(level);
      if (started) sys.dust.set(v); else pending.dust = v;
    },
    /**
     * Route drawn on the ground as the route glow (routeGlow.js), [[x, z], ...] in metres. null clears it.
     * Call it again after every re-plan; the walked part then follows the player along the new route.
     */
    setRoute(path) {
      if (path !== null && !validPath(path)) throw new Error('setRoute: expected [[x, z], ...] with at least two points, or null');
      if (started) sys.routeGlow.setPath(path); else pending.route = path;
    },
    /**
     * Shelter highlighted in green (shelterHighlight.js): safe zone on the ground, a column of light and a distance label.
     * Takes an entry of public/data/shelters.json ({ id, name, x, z, type, protection }); null fades it out.
     */
    setShelter(shelter) {
      if (shelter !== null && !validShelter(shelter)) throw new Error('setShelter: expected { x, z } in metres, or null');
      if (started) sys.shelter.set(shelter); else pending.shelter = shelter;
    },
    /**
     * Numbered markers for the plan map. Each waypoint is { x, z, name?, active? }.
     * The markers are only shown in Plan mode.
     * @param {Array<{ x: number, z: number, name?: string, active?: boolean }>} list
     */
    setWaypoints(list) {
      if (list !== null && !(Array.isArray(list) && list.every((w) => w && Number.isFinite(w.x) && Number.isFinite(w.z)))) throw new Error('setWaypoints: expected [{ x, z, name }] or null');
      if (started) waypoints.set(list); else pending.waypoints = list;
    },
    /**
     * Red ground patch for the no-go cells from the slope look-ahead (#69).
     * @param {Array<{ x: number, z: number }> | null} cells
     */
    setSlopeZone(cells) {
      if (cells !== null && !(Array.isArray(cells) && cells.every((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z)))) throw new Error('setSlopeZone: expected [{ x, z }] or null');
      if (started) sys.slopeZone.set(cells); else pending.slopeZone = cells;
    },
    /**
     * Blue-grey radio-shadow cells in Plan mode (#74).
     * @param {Array<{ x: number, z: number }> | null} cells
     */
    setRadioShadow(cells) {
      if (cells !== null && !(Array.isArray(cells) && cells.every((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z)))) throw new Error('setRadioShadow: expected [{ x, z }] or null');
      if (started) sys.radioShadow.set(cells); else pending.radioShadow = cells;
    },
    /** Metres of ground per CSS pixel in Plan mode, or null when the engine is not ready. */
    getPlanScale() {
      if (!started || ctx.view.mode !== 'orbit') return null;
      const height = Math.abs(camera.position.y - controls.target.y);
      return metresPerPixel(height, camera.fov, container.clientHeight);
    },
    /** World position of the habitat comms mast, for the radio link (#74). */
    getHabitatMast() {
      if (!started || !sys.habitat?.root) return null;
      const root = sys.habitat.root;
      root.updateWorldMatrix(true, false);
      const point = new THREE.Vector3(-1.9, 4.35, 3.4);
      root.localToWorld(point);
      return { x: point.x, y: point.y, z: point.z };
    },
    /** Terrain height (m) at x, z. Available once ready. */
    heightAt(x, z) { return terrainQueries().heightAt(x, z); },
    /** Slope (degrees) at x, z. Available once ready. */
    slopeAt(x, z) { return terrainQueries().slopeAt(x, z); },
    /** Line of sight between two { x, y?, z } points (no y = eye height above ground). Available once ready. */
    lineOfSight(a, b, options) { return terrainQueries().lineOfSight(a, b, options); },
    /**
     * Project a world point to CSS pixels in the canvas. `visible` means it is
     * inside the viewport and in front of the camera; `inFront` separates the
     * two cases for the edge arrow. Available once ready.
     * @param {number} x east, metres
     * @param {number} z south, metres
     * @param {number} [y] height, defaults to ground + 2.2 m
     */
    project(x, z, y) {
      if (!started) return null;
      const worldY = Number.isFinite(y) ? y : ctx.terrain.meshH(x, z) + 2.2;
      const p = new THREE.Vector3(x, worldY, z).project(camera);
      const inFront = p.z < 1;
      return {
        x: (p.x + 1) / 2 * container.clientWidth,
        y: (1 - p.y) / 2 * container.clientHeight,
        inFront,
        visible: inFront && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1,
      };
    },
    /** The presentation's camera and scene overlays (cinematic.js, #291), until its release(). Null before ready. */
    cinematic() {
      if (!started) return null;
      return (sys.cine ||= createCinematic(ctx, { render: renderFrame, loop: (on) => renderer.setAnimationLoop(on ? tick : null), release: () => { sys.cine = null; viewCtl.setMode(requestedMode); } }));
    },
    /** Removes every boot print (bootPrints.js): the start of a new EVA. */
    clearPrints() { if (sys.prints) sys.prints.clear(); },
    /** Player position and heading (degrees clockwise from north), and the current mode. */
    /**
     * Who drives the partner astronaut: a partner source (src/engine/partnerSource.js, docs/PARTNER.md).
     * The scripted partner is the default; null hides the partner. Available once ready.
     */
    setPartnerSource(source) {
      if (source !== null && !(source && typeof source.update === 'function')) throw new Error('setPartnerSource: expected a partner source with update(dt, world), or null');
      if (!sys.partner) throw new Error('engine is not ready: wait for engine.ready');
      sys.partner.setSource(source, { chosen: true });   // it comes back when the engine places the crew again (#288)
    },
    /** Scripted actions of the current source: 'toggleCase', 'visitHabitat'. Returns false if the source ignores it. */
    partnerCommand(name) { return sys.partner ? sys.partner.command(name) : false; },
    /**
     * The partner as its source reported it on the last frame: { id, color, state } with the PartnerState
     * (docs/PARTNER.md), or null without a source. state is null until the first frame. Read by the partner runner (#70).
     */
    getPartner() {
      const p = sys.partner;
      return p && p.source ? { id: p.source.id, color: p.source.color, state: p.state } : null;
    },
    /**
     * Sampling (sampling.js, #36): what the crosshair is on, the clip phase, the partner's case and what each input does now.
     * Plain data for the store bridge; null before the scene is ready.
     */
    getSampling() { return sys.sampling ? sys.sampling.status() : null; },
    /** Sampling events ({ type: 'photo' | 'collect' | 'texture' | 'secured' | 'sealed' | 'input', ... }). Returns an unsubscribe function. Available once ready. */
    onSampling(listener) {
      if (!sys.sampling) throw new Error('engine is not ready: wait for engine.ready');
      return sys.sampling.subscribe(listener);
    },
    getPlayer() {
      const v = ctx.view, deg = ((v.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const zone = sys.habitat && sys.habitat.zone(v.eye.x, v.eye.z);   // habitat walk zone under the player (collide.js), for the suit audio (#72)
      return { x: v.eye.x, z: v.eye.z, headingDeg: deg, mode: v.mode === 'eye' ? 'walk' : 'plan', habitatZone: zone ? zone.n : null };
    },
    dispose() {
      if (!alive) return;
      alive = false;
      lifecycle.close();
      if (debug && window.__marswalk && window.__marswalk.stats === stats) delete window.__marswalk;
      renderer.setAnimationLoop(null);
      if (pendingLockResolve) {
        const resolvePending = pendingLockResolve;
        pendingLockResolve = null;
        pendingLock = null;
        resolvePending(false);
      }
      resolveDisposed();
      if (viewCtl) viewCtl.dispose();
      touchListeners.clear(); gamepadListeners.clear(); wristListeners.clear();
      quality.dispose();
      ac.abort(); ro.disconnect(); controls.dispose();
      if (sys.prints) sys.prints.dispose();
      if (sys.arms) sys.arms.dispose();   // wrist screen textures once: the material sweep below no longer sees them (#67)
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
      if (waypoints) waypoints.dispose();
      finds.dispose();
      if (sys.slopeZone) sys.slopeZone.dispose();
      if (sys.radioShadow) sys.radioShadow.dispose();
      if (ctx.terrain && ctx.terrain.shadowTex) ctx.terrain.shadowTex.dispose();
      for (const s of [sys.partner, sys.legs]) if (s && s.mixer) s.mixer.stopAllAction();
      renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
