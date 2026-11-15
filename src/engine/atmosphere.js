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

// blendPresets lives in presetBlend.js (no three.js, so the sky rules test without it); re-exported here for callers.
export { blendPresets } from './presetBlend.js';

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
  // 0 for a sharp Sun (0.35 deg, clear air) to 1 for the storm's soft glow (6 deg). Continuous, so a gradual storm blend
  // (#73) does not pop; the four presets get the same values as before (6 / 0.6, and 1 / 0.35 for the contact shadow).
  const soft = THREE.MathUtils.clamp((p.sun.angular_diameter_deg - 0.35) / (6 - 0.35), 0, 1);
  U.uSunDisc.value = 6.0 + (0.6 - 6.0) * soft;
  U.uSunCos.value = Math.cos(THREE.MathUtils.degToRad(Math.max(p.sun.angular_diameter_deg, 0.6)));
  const sunTerm = S / Math.PI * Math.max(sun.y, 0.05);
  U.uBlob.value = 0.8 * sunTerm / (sunTerm + lumAvg) * (1 + (0.35 - 1) * soft);
  renderer.toneMappingExposure = Math.pow(2, p.exposure_stops) * 0.72; U.uInterior.value = Math.pow(2, 0.15 - p.exposure_stops);   // the cabin lights do not change with the weather: cancel the outdoor exposure change indoors
  const lp = p.lamp || { intensity: 0 };
  U.uLamp.value.set(...(lp.color || [1, 1, 1])).multiplyScalar(lp.intensity / Math.PI);
  if (lp.cone_cos_inner) U.uLampCone.value.set(lp.cone_cos_inner, lp.cone_cos_outer);
  U.uLampRange.value.set(lp.half_distance_m || 4, lp.range_m || 30);
  U.uStars.value = p.sky.stars || 0;
  if (ctx.sys.dust) ctx.sys.dust.onPreset();   // storm dust scales this light, blended or not (stormLight.js, #27)
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
