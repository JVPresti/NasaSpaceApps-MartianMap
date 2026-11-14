// Storm dust (issue #27), driven by one value from 0 (clear: the scene as before) to 1 (full storm).
//   - Haze: the shared fog in COMMON (shaders.js) thickens toward U.uDustK and drifts in curtains with the wind, so terrain,
//     rocks, astronauts and the habitat all fade the same way. Level 1 is a global storm like Gale 2018 (tau above 8):
//     extinction 4 per km, a visibility of about 1 km (Koschmieder, V = 3.912 / extinction). That is within what Curiosity
//     measured in that storm, at least 1.1 per km and a visibility of at most 3 km (hazards.json,
//     dust.visibility.gale_global_storm_2018*): the far crater rim disappears, the middle distance hazes over and nearby
//     ground stays readable.
//   - Light: the sun dims, shadows fade and the light turns red (stormLight.js).
//   - Wisps: faint, soft, drifting shapes near the helmet (dust.shaders.js). Martian storm dust is a few micrometres
//     across, so it shows as moving haze, never as grains. Fewer and smaller on the Low tier.
//
//   sys.dust.set(level)          0..1, eased so a storm builds up instead of switching on
//   sys.dust.setTier(tier)       'high' | 'low': number of wisps
//   sys.dust.update(dt)          once per frame: wind drift, storm light
//   sys.dust.onPreset()          after an atmosphere preset is applied: the storm light starts from the new preset
import * as THREE from 'three';
import * as SH from './dust.shaders.js';
import { createStormLight } from './stormLight.js';

const WISPS = { high: 220, low: 70 };
const BOX_M = 40;                 // the wisps live in a box this wide around the camera
const HEIGHT_M = 7;               // from the feet up to about 5 m above the helmet
const WIND_FROM_DEG = 120;        // SIM: wind direction (from the south-east), until the store carries a MEDA wind direction
const WIND_MS = 7;                // SIM: visual drift speed of the wisps at full storm
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
  const uniforms = {
    uTime: U.uTime, uInscatter: U.uInscatter, uSunColor: U.uSunColor, uDust: U.uDust,
    uWindOff: { value: new THREE.Vector3() }, uBox: { value: BOX_M }, uHeight: { value: HEIGHT_M }, uPointScale: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: SH.DUST_VERT, fragmentShader: SH.DUST_FRAG,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(new THREE.BufferGeometry(), material);
  points.frustumCulled = false; points.renderOrder = 4; points.visible = false;
  scene.add(points);

  let target = 0, lightLevel = -1;
  const size = new THREE.Vector2();
  const light = createStormLight(U);
  light.capture();

  function build(n) {
    const seeds = new Float32Array(n * 4);
    let s = 1234567;   // deterministic, like the rocks: the same dust every run
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    points.geometry.dispose();
    points.geometry = new THREE.BufferGeometry();
    points.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    points.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));   // unused, three.js needs it
  }

  return {
    points,
    /** @param {number} level 0..1 */
    set(level) { target = clampDust(level); },
    /** @param {'high' | 'low'} tier */
    setTier(tier) { build(WISPS[tier] || WISPS.low); },
    onPreset() { light.capture(); lightLevel = -1; },
    /** @param {number} dt */
    update(dt) {
      const u = U.uDust;
      u.value += Math.sign(target - u.value) * Math.min(Math.abs(target - u.value), dt * EASE_PER_S);
      if (u.value !== lightLevel) { light.apply(u.value); lightLevel = u.value; }
      points.visible = u.value > 0.005;
      if (u.value <= 0.005) return;
      const step = WIND_MS * (0.3 + 0.7 * u.value) * dt;   // a stronger storm blows harder
      uniforms.uWindOff.value.x += windDir.x * step; uniforms.uWindOff.value.z += windDir.y * step;
      U.uDustOff.value.x -= windDir.x * step * CURTAIN_SPEED; U.uDustOff.value.y -= windDir.y * step * CURTAIN_SPEED;
      // pixels per metre at 1 m: lets the wisps keep a size in metres
      renderer.getDrawingBufferSize(size);
      uniforms.uPointScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
    dispose() { points.geometry.dispose(); material.dispose(); scene.remove(points); },
  };
}
