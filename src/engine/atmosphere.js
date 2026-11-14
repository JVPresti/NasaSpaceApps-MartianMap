// Sky dome and atmosphere presets (clear_day, dust_storm, late_afternoon, night).
// Ported from docs/marswalk-assets/testbench-reference/main.js (lines 131-136, 165-194).
import * as THREE from 'three';
import * as SH from './shaders.js';
import { TIERS } from './tiers.js';

export function buildSky(ctx) {
  const { scene, U } = ctx;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({ uniforms: U, vertexShader: SH.SKY_VERT, fragmentShader: SH.SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
  m.frustumCulled = false; m.renderOrder = 10; scene.add(m);
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpArray = (a, b, t) => a.map((value, index) => lerp(value, b[index] ?? value, t));

/**
 * Blend two atmosphere presets into the same shape `applyPreset` expects.
 * Vectors and colours are interpolated; the sun direction is renormalised.
 * The result is a plain object, so this can be tested without a renderer.
 *
 * @param {object} a preset from atmosphere_presets.json
 * @param {object} b preset from atmosphere_presets.json
 * @param {number} t 0 = a, 1 = b
 * @returns {object}
 */
export function blendPresets(a, b, t) {
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  const sun = lerpArray(a.sun.direction_threejs, b.sun.direction_threejs, k);
  const length = Math.hypot(...sun) || 1;
  const lampA = a.lamp || { intensity: 0 };
  const lampB = b.lamp || { intensity: 0 };
  return {
    sky: {
      zenith: lerpArray(a.sky.zenith, b.sky.zenith, k),
      horizon: lerpArray(a.sky.horizon, b.sky.horizon, k),
      halo_color: lerpArray(a.sky.halo_color, b.sky.halo_color, k),
      gradient_end_elev: lerp(a.sky.gradient_end_elev, b.sky.gradient_end_elev, k),
      halo_power: lerp(a.sky.halo_power, b.sky.halo_power, k),
      halo_strength: lerp(a.sky.halo_strength, b.sky.halo_strength, k),
      intensity: lerp(a.sky.intensity, b.sky.intensity, k),
      stars: lerp(a.sky.stars || 0, b.sky.stars || 0, k),
    },
    sun: {
      direction_threejs: sun.map((value) => value / length),
      color: lerpArray(a.sun.color, b.sun.color, k),
      intensity: lerp(a.sun.intensity, b.sun.intensity, k),
      angular_diameter_deg: lerp(a.sun.angular_diameter_deg, b.sun.angular_diameter_deg, k),
    },
    fog: {
      color: lerpArray(a.fog.color, b.fog.color, k),
      blender_extinction_per_m: lerp(a.fog.blender_extinction_per_m, b.fog.blender_extinction_per_m, k),
    },
    exposure_stops: lerp(a.exposure_stops, b.exposure_stops, k),
    lamp: {
      intensity: lerp(lampA.intensity || 0, lampB.intensity || 0, k),
      color: lerpArray(lampA.color || [1, 1, 1], lampB.color || [1, 1, 1], k),
      half_distance_m: lerp(lampA.half_distance_m || 4, lampB.half_distance_m || 4, k),
      range_m: lerp(lampA.range_m || 30, lampB.range_m || 30, k),
      cone_cos_inner: lerp(lampA.cone_cos_inner || 0.93, lampB.cone_cos_inner || 0.93, k),
      cone_cos_outer: lerp(lampA.cone_cos_outer || 0.74, lampB.cone_cos_outer || 0.74, k),
    },
  };
}

/**
 * Write one preset (or a blended one) into the shared uniforms.
 * @param {object} ctx engine context
 * @param {object} p preset data
 * @param {string} name label for ctx.presetName
 * @param {{ shadows?: boolean }} [options] skip the CPU shadow bake for a blend that updates often
 */
export function applyPresetData(ctx, p, name, { shadows = true } = {}) {
  const { U, renderer } = ctx;
  ctx.presetName = name;
  const S = p.sun.intensity;
  const sun = new THREE.Vector3(...p.sun.direction_threejs).normalize(); U.uSunDir.value.copy(sun);
  U.uSunColor.value.set(...p.sun.color).multiplyScalar(S / Math.PI);
  const zen = new THREE.Vector3(...p.sky.zenith), hor = new THREE.Vector3(...p.sky.horizon), I = p.sky.intensity;
  U.uSkyZenith.value.copy(zen); U.uSkyHorizon.value.copy(hor); U.uHaloColor.value.set(...p.sky.halo_color);
  U.uHaloPower.value = p.sky.halo_power; U.uHaloStrength.value = p.sky.halo_strength; U.uSkyIntensity.value = I; U.uGradEnd.value = p.sky.gradient_end_elev;
  const avg = zen.clone().multiplyScalar(0.6).addScaledVector(hor, 0.4).multiplyScalar(I);
  U.uAmbSky.value.copy(avg);
  const bounce = S / Math.PI * Math.max(sun.y, 0) * 0.5;
  U.uAmbGround.value.copy(avg).multiplyScalar(0.35).add(new THREE.Vector3(0.40, 0.20, 0.10).multiplyScalar(bounce));
  const lumAvg = 0.2126 * avg.x + 0.7152 * avg.y + 0.0722 * avg.z;
  U.uFogK.value = p.fog.blender_extinction_per_m;
  U.uInscatter.value.set(...p.fog.color).multiplyScalar((S / (4 * Math.PI) + lumAvg) * 0.9);
  const soft = p.sun.angular_diameter_deg > 3;
  U.uSunDisc.value = soft ? 0.6 : 6.0;
  U.uSunCos.value = Math.cos(THREE.MathUtils.degToRad(Math.max(p.sun.angular_diameter_deg, 0.6)));
  const sunTerm = S / Math.PI * Math.max(sun.y, 0.05);
  U.uBlob.value = 0.8 * sunTerm / (sunTerm + lumAvg) * (soft ? 0.35 : 1);
  renderer.toneMappingExposure = Math.pow(2, p.exposure_stops) * 0.72; U.uInterior.value = Math.pow(2, 0.15 - p.exposure_stops);   // the cabin lights do not change with the weather: cancel the outdoor exposure change indoors
  const lp = p.lamp || { intensity: 0 };
  U.uLamp.value.set(...(lp.color || [1, 1, 1])).multiplyScalar(lp.intensity / Math.PI);
  if (lp.cone_cos_inner) U.uLampCone.value.set(lp.cone_cos_inner, lp.cone_cos_outer);
  U.uLampRange.value.set(lp.half_distance_m || 4, lp.range_m || 30);
  U.uStars.value = p.sky.stars || 0;
  if (shadows) {
    ctx.terrain.computeShadows(TIERS[ctx.tier].shadowRes);
    if (ctx.sys.rocks) ctx.sys.rocks.reset();
  }
}

/** Applies one preset from atmosphere_presets.json to the shared uniforms. */
export function applyPreset(ctx, name) {
  applyPresetData(ctx, ctx.PRESETS[name], name);
}

/**
 * Blend two presets, used by the dust storm to raise opacity gradually.
 * @param {object} ctx
 * @param {string} from preset name
 * @param {string} to preset name
 * @param {number} t 0 to 1
 */
export function applySkyBlend(ctx, from, to, t) {
  const a = ctx.PRESETS[from];
  const b = ctx.PRESETS[to];
  if (!a || !b) throw new Error(`unknown atmosphere preset: ${!a ? from : to}`);
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  const label = k <= 0 ? from : k >= 1 ? to : `${from} → ${to}`;
  applyPresetData(ctx, blendPresets(a, b, k), label, { shadows: false });
}
