// Storm light (#27): as the dust thickens the sun is dimmed, shadows fade and the light turns redder. This is what a
// strong Martian dust storm looks like from the ground: in the 2018 global storm Curiosity's photos turned dark and
// cherry red and needed much longer exposures (tau above 8 at Gale), and at Opportunity (tau 10.8) day turned to night.
// The haze the scene fades into darkens too, so the view gets dimmer as the dust thickens, not milky (#142).
// The atmosphere preset (atmosphere.js) sets the light; this module scales it by the dust level on top, from a copy of
// the preset values taken each time a preset is applied, so the preset itself is never changed.
// Direct sunlight follows Beer-Lambert through the extra dust (#203): exp(-(tau - tau_clear) / mu), with mu the sine of the sun
// elevation, so the slant path through the dust counts. The preset already holds the clear-season light (tau 0.45), so only the
// dust above that dims it. At tau 5.3 with the sun 50 degrees up that leaves 0.2 % of the beam: no hard shadows, as in the
// storm photos. Shadows and the astronaut contact shadow fade with it, because every shader multiplies them into the sun term.
// The sky light falls too, but slower, exp(-0.13 (tau - tau_clear)), because the dust scatters much of the lost beam into it.
// That leaves 53 % of the sky light at tau 5.3 and 38 % at tau 8, so a full storm is dim, not black.
//   SIM: the 0.13 rate and the sky, haze and sun-disc factors below are chosen to read as a heavy storm while the scene stays
//   playable (not full darkness).
// No three.js import: it only scales the shared uniform vectors in place, and its rules test without loading three.
import { TAU_CLEAR, TAU_STORM } from '../state/dustLevel.js';

const AT_FULL = {
  disc: 0.1,         // brightness of the sun disc in the sky at dust 1 (the beam on the ground follows Beer-Lambert instead)
  sky: 0.45,         // sky brightness
  inscatter: 0.32,   // the haze everything fades into: darker, so a storm dims the view instead of washing it out (#142)
};
const RED = [1.0, 0.82, 0.66];   // red dust passes red light, not blue (JPL, PIA22330)
const SKY_LIGHT_PER_TAU = 0.13;   // sky light falls as exp(-0.13 per unit of tau above the clear season)
const MU_MIN = 0.15;              // sun about 9 degrees up: below that the flat-atmosphere path 1 / mu overstates the dust
const BLOB_AT_NO_SUN = 0.25;      // contact shadow under rocks and astronauts left in fully diffuse light: the ground under them still gets less sky

const KEYS = ['uSunColor', 'uAmbSky', 'uAmbGround', 'uInscatter'];

/**
 * Light scale for a dust level 0..1 and the sun height.
 * @param {number} level 0..1, as from dustLevelFromTau
 * @param {number} [sunY] sine of the sun elevation (uSunDir.y)
 * @returns {{ tau: number, sun: number, disc: number, ambient: number, sky: number, inscatter: number, red: number }}
 */
export function stormLightFactors(level, sunY = 0.766) {
  const t = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0)), e = t * (2 - t);   // eases in: most of the change happens early
  const lerp = (a) => 1 + (a - 1) * e;
  const extra = t * (TAU_STORM - TAU_CLEAR);   // dust optical depth above the clear season the preset was made for
  const mu = Math.max(MU_MIN, Number.isFinite(sunY) ? sunY : 1);
  return {
    tau: TAU_CLEAR + extra, sun: Math.exp(-extra / mu), disc: lerp(AT_FULL.disc),
    ambient: Math.exp(-SKY_LIGHT_PER_TAU * extra), sky: lerp(AT_FULL.sky), inscatter: lerp(AT_FULL.inscatter), red: e,
  };
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
      const f = stormLightFactors(level, U.uSunDir.value.y);
      const tint = RED.map((c) => 1 + (c - 1) * f.red);
      scaled('uSunColor', f.sun, tint);
      scaled('uAmbSky', f.ambient, tint);
      scaled('uAmbGround', f.ambient, tint);
      scaled('uInscatter', f.inscatter, tint);
      if (U.uStormSun) U.uStormSun.value = f.sun;
      U.uSkyIntensity.value = base.uSkyIntensity * f.sky;
      U.uSunDisc.value = base.uSunDisc * f.disc;
      U.uBlob.value = base.uBlob * (BLOB_AT_NO_SUN + (1 - BLOB_AT_NO_SUN) * f.sun);   // the contact shadow under astronauts softens with the sun
    },
  };
}
