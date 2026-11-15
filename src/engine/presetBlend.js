// Blending of atmosphere presets (atmosphere_presets.json). Plain data in, plain data out: no three.js.
//   blendPresets(a, b, t)   every value of a preset, as applyPresetData in atmosphere.js expects
//   blendLook(p, storm, t)  only the look of the sky toward the dust storm (#73), see below

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
 * Moves the look of a preset toward the dust_storm preset: sky colours, the halo around the Sun, the size of the Sun's
 * disc and the colour of the haze. The brightness is left alone (Sun and sky intensity, exposure, haze thickness): the
 * storm light (stormLight.js, #224) and the storm haze (dust.js) already scale those with the dust optical depth, and
 * blending them here as well would dim a storm twice.
 * @param {object} p preset, or a blend of presets
 * @param {object} storm the dust_storm preset
 * @param {number} t 0 = p, 1 = the storm look
 * @returns {object} a new preset
 */
export function blendLook(p, storm, t) {
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  if (k === 0) return p;
  return {
    ...p,
    sky: {
      ...p.sky,
      zenith: lerpArray(p.sky.zenith, storm.sky.zenith, k),
      horizon: lerpArray(p.sky.horizon, storm.sky.horizon, k),
      halo_color: lerpArray(p.sky.halo_color, storm.sky.halo_color, k),
      halo_power: lerp(p.sky.halo_power, storm.sky.halo_power, k),
      halo_strength: lerp(p.sky.halo_strength, storm.sky.halo_strength, k),
    },
    sun: { ...p.sun, angular_diameter_deg: lerp(p.sun.angular_diameter_deg, storm.sun.angular_diameter_deg, k) },
    fog: { ...p.fog, color: lerpArray(p.fog.color, storm.fog.color, k) },
  };
}
