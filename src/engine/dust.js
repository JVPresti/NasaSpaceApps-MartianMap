// Storm dust (issue #27), driven by one value from 0 (clear: the scene as before) to 1 (full storm).
//   - Haze: the shared fog in COMMON (shaders.js) thickens toward U.uDustK and drifts in curtains with the wind, so terrain,
//     rocks, astronauts and the habitat all fade the same way. Level 1 is a global storm like Gale 2018 (tau above 8):
//     extinction 4 per km, a visibility of about 1 km (Koschmieder, V = 3.912 / extinction). That is within what Curiosity
//     measured in that storm, at least 1.1 per km and a visibility of at most 3 km (hazards.json,
//     dust.visibility.gale_global_storm_2018*): the far crater rim disappears, the middle distance hazes over and nearby
//     ground stays readable.
//   - Light: the sun dims, shadows fade, the light and the haze turn darker and red (stormLight.js).
//   - Dust in the air near the helmet (dust.shaders.js), two layers that drift with the wind (#142):
//       wisps:   large, soft, faint shapes, the body of the dust cloud
//       streaks: fine dust blowing past, stretched along the wind as it appears on screen, so the storm reads as moving
//     Martian storm dust is a few micrometres across, so neither is ever drawn as grains. Fewer on the Low tier.
//
//   sys.dust.set(level)          0..1, eased so a storm builds up instead of switching on
//   sys.dust.setTier(tier)       'high' | 'low': number of wisps and streaks
//   sys.dust.update(dt)          once per frame: wind drift, storm light
//   sys.dust.onPreset()          after an atmosphere preset is applied: the storm light starts from the new preset
import * as THREE from 'three';
import * as SH from './dust.shaders.js';
import { createStormLight } from './stormLight.js';

const COUNT = { high: { wisps: 260, streaks: 700 }, low: { wisps: 90, streaks: 250 } };
const BOX_M = 40;                 // the wisps live in a box this wide around the camera
const HEIGHT_M = 7;               // from the feet up to about 5 m above the helmet
const STREAK_BOX_M = 22;          // the streaks stay closer: they are small
const STREAK_HEIGHT_M = 4;
const WIND_FROM_DEG = 120;        // SIM: wind direction (from the south-east), until the store carries a MEDA wind direction
const WIND_MS = 7;                // SIM: visual drift speed of the wisps at full storm
const STREAK_SPEED = 1.8;         // the fine dust near the eye moves faster than the big wisps
const CURTAIN_SPEED = 0.6;        // the haze curtains drift slower than the wisps near the eye
const EASE_PER_S = 0.5;           // how fast the level follows a new value

/** @param {number} v */
export function clampDust(v) {
  if (!Number.isFinite(v)) throw new Error('setDust: expected a number from 0 to 1');
  return Math.min(1, Math.max(0, v));
}

export function createDust(ctx) {
  const { scene, camera, renderer, U } = ctx;
  const a = THREE.MathUtils.degToRad(WIND_FROM_DEG);
  const windDir = new THREE.Vector2(-Math.sin(a), Math.cos(a));   // blowing toward: x east, z south
  const shared = { uTime: U.uTime, uInscatter: U.uInscatter, uSunColor: U.uSunColor, uDust: U.uDust, uPointScale: { value: 1 } };

  function layer(vert, frag, extra, order) {
    const material = new THREE.ShaderMaterial({ uniforms: { ...shared, ...extra }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false });
    const points = new THREE.Points(new THREE.BufferGeometry(), material);
    points.frustumCulled = false; points.renderOrder = order; points.visible = false;
    scene.add(points);
    return points;
  }
  const wisps = layer(SH.DUST_VERT, SH.DUST_FRAG, { uWindOff: { value: new THREE.Vector3() }, uBox: { value: BOX_M }, uHeight: { value: HEIGHT_M } }, 4);
  const streaks = layer(SH.STREAK_VERT, SH.STREAK_FRAG, {
    uWindOff: { value: new THREE.Vector3() }, uBox: { value: STREAK_BOX_M }, uHeight: { value: STREAK_HEIGHT_M },
    uWindScreen: { value: new THREE.Vector3(1, 0, 1) },   // x, y: wind direction on screen; z: how long the streaks look
  }, 5);

  let target = 0, lightLevel = -1;
  const size = new THREE.Vector2(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), fwd = new THREE.Vector3();
  const light = createStormLight(U);
  light.capture();

  function seed(points, n, start) {
    const seeds = new Float32Array(n * 4);
    let s = start;   // deterministic, like the rocks: the same dust every run
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    points.geometry.dispose();
    points.geometry = new THREE.BufferGeometry();
    points.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    points.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // unused, three.js needs it
  }

  // the wind's direction as it appears on screen, so the streaks stretch the way the dust moves
  function windOnScreen() {
    camera.getWorldDirection(fwd);
    p0.copy(camera.position).addScaledVector(fwd, 6);
    p1.set(p0.x + windDir.x, p0.y, p0.z + windDir.y);
    p0.project(camera); p1.project(camera);
    const dx = (p1.x - p0.x) * camera.aspect, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1e-6;
    // 1 m across the view at 6 m is about 0.27 of the half-height: full length; wind toward or away from the eye: short
    streaks.material.uniforms.uWindScreen.value.set(dx / len, dy / len, Math.min(1, Math.max(0.2, len / 0.27)));
  }

  return {
    points: wisps, streaks,
    /** @param {number} level 0..1 */
    set(level) { target = clampDust(level); },
    /** @param {'high' | 'low'} tier */
    setTier(tier) { const c = COUNT[tier] || COUNT.low; seed(wisps, c.wisps, 1234567); seed(streaks, c.streaks, 7654321); },
    onPreset() { light.capture(); lightLevel = -1; },
    /** @param {number} dt */
    update(dt) {
      const u = U.uDust;
      u.value += Math.sign(target - u.value) * Math.min(Math.abs(target - u.value), dt * EASE_PER_S);
      if (u.value !== lightLevel) { light.apply(u.value); lightLevel = u.value; }
      wisps.visible = streaks.visible = u.value > 0.005;
      if (u.value <= 0.005) return;
      const step = WIND_MS * (0.3 + 0.7 * u.value) * dt;   // a stronger storm blows harder
      const w = wisps.material.uniforms.uWindOff.value, s = streaks.material.uniforms.uWindOff.value;
      w.x += windDir.x * step; w.z += windDir.y * step;
      s.x += windDir.x * step * STREAK_SPEED; s.z += windDir.y * step * STREAK_SPEED;
      U.uDustOff.value.x -= windDir.x * step * CURTAIN_SPEED; U.uDustOff.value.y -= windDir.y * step * CURTAIN_SPEED;
      // pixels per metre at 1 m: lets the dust keep a size in metres
      renderer.getDrawingBufferSize(size);
      shared.uPointScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      windOnScreen();
    },
    dispose() { for (const p of [wisps, streaks]) { p.geometry.dispose(); p.material.dispose(); scene.remove(p); } },
  };
}
