// Storm light (#27): as the dust thickens the sun is dimmed, shadows fade and the light turns redder. This is what a
// strong Martian dust storm looks like from the ground: in the 2018 global storm Curiosity's photos turned dark and
// cherry red and needed much longer exposures (tau above 8 at Gale), and at Opportunity (tau 10.8) day turned to night.
// The atmosphere preset (atmosphere.js) sets the light; this module scales it by the dust level on top, from a copy of
// the preset values taken each time a preset is applied, so the preset itself is never changed.
//   SIM: the factors below are chosen to read as a heavy storm while the scene stays playable (not full darkness).
// No three.js import: it only scales the shared uniform vectors in place, and its rules test without loading three.

const AT_FULL = {
  sun: 0.1,          // direct sunlight left at dust 1: shadows almost gone
  ambient: 0.6,      // sky light left (dust scatters light, so the shade gets relatively brighter)
  sky: 0.6,          // sky brightness
  inscatter: 0.7,    // colour of the haze
};
const RED = [1.0, 0.82, 0.66];   // red dust passes red light, not blue (JPL, PIA22330)

const KEYS = ['uSunColor', 'uAmbSky', 'uAmbGround', 'uInscatter'];

/** Light scale for a dust level 0..1. @returns {{ sun: number, ambient: number, sky: number, inscatter: number, red: number }} */
export function stormLightFactors(level) {
  const t = Math.min(1, Math.max(0, level)), e = t * (2 - t);   // eases in: most of the change happens early
  const lerp = (a) => 1 + (a - 1) * e;
  return { sun: lerp(AT_FULL.sun), ambient: lerp(AT_FULL.ambient), sky: lerp(AT_FULL.sky), inscatter: lerp(AT_FULL.inscatter), red: e };
}

export function createStormLight(U) {
  const base = { uSkyIntensity: 1, uSunDisc: 1, uBlob: 0.5 };
  for (const k of KEYS) base[k] = [0, 0, 0];
  const scaled = (k, s, t) => U[k].value.set(base[k][0] * s * t[0], base[k][1] * s * t[1], base[k][2] * s * t[2]);

  return {
    /** Call after every applyPreset: remembers the preset's light. */
    capture() {
      for (const k of KEYS) { const v = U[k].value; base[k] = [v.x, v.y, v.z]; }
      base.uSkyIntensity = U.uSkyIntensity.value; base.uSunDisc = U.uSunDisc.value; base.uBlob = U.uBlob.value;
    },
    /** @param {number} level 0..1 */
    apply(level) {
      const f = stormLightFactors(level);
      const tint = RED.map((c) => 1 + (c - 1) * f.red);
      scaled('uSunColor', f.sun, tint);
      scaled('uAmbSky', f.ambient, tint);
      scaled('uAmbGround', f.ambient, tint);
      scaled('uInscatter', f.inscatter, tint);
      U.uSkyIntensity.value = base.uSkyIntensity * f.sky;
      U.uSunDisc.value = base.uSunDisc * f.sun;
      U.uBlob.value = base.uBlob * f.sun;   // the soft contact shadow under astronauts fades with the sun
    },
  };
}
