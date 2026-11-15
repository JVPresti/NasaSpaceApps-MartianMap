// The sky for a Sun position and a storm level (#73). Plain data, no three.js: missionSky.js applies the result.
//
// The four presets of atmosphere_presets.json are drawn for one Sun height each, so the sky is blended between them by
// the Sun's elevation, with a smooth step between neighbours:
//   55 deg and up   clear_day        (the preset's own elevation)
//   7 deg           late_afternoon   (the preset's own elevation, with its blue glow around the Sun)
//   -12 deg and down night           SIM: the end of twilight. Mars has long twilights (high dust scatters light
//                                    for up to two hours after sunset), so the sky darkens over most of that range.
// The Sun direction is always the real one (sunPosition.js), never a blend. Below the horizon the direct sunlight is
// switched off over 3 deg (SUN_FADE_DEG) and only the sky light of the blend remains.
// A second blend moves the look toward dust_storm (blendLook): sky colours, halo, the soft Sun and the haze colour.
import { blendLook, blendPresets } from './presetBlend.js';

export const ELEV_CLEAR = 55;
export const ELEV_LATE = 7;
export const ELEV_NIGHT = -12;
export const SUN_FADE_DEG = [-1, 2];   // direct sunlight 0 at -1 deg (refraction and the Sun's size), full at 2 deg

const smooth = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };

/**
 * Which two presets the elevation falls between, and how far.
 * @param {number} elevationDeg
 * @returns {{ from: string, to: string, t: number }}
 */
export function presetsForElevation(elevationDeg) {
  const e = Number.isFinite(elevationDeg) ? elevationDeg : ELEV_CLEAR;
  if (e >= ELEV_LATE) return { from: 'late_afternoon', to: 'clear_day', t: smooth((e - ELEV_LATE) / (ELEV_CLEAR - ELEV_LATE)) };
  return { from: 'night', to: 'late_afternoon', t: smooth((e - ELEV_NIGHT) / (ELEV_LATE - ELEV_NIGHT)) };
}

/** Share of the direct sunlight left at this elevation, 0 to 1. */
export function sunVisibility(elevationDeg) {
  const [a, b] = SUN_FADE_DEG;
  return Math.max(0, Math.min(1, (elevationDeg - a) / (b - a)));
}

/**
 * @param {Record<string, object>} presets atmosphere_presets.json `presets`
 * @param {{ elevationDeg: number, direction: number[] }} sun from sunPosition()
 * @param {number} [storm] 0..1, how far the look moves toward dust_storm
 * @returns {object} preset data for applyPresetData
 */
export function skyAtSun(presets, sun, storm = 0) {
  const { from, to, t } = presetsForElevation(sun.elevationDeg);
  const base = blendPresets(presets[from], presets[to], t);
  base.sun.direction_threejs = [...sun.direction];
  base.sun.intensity *= sunVisibility(sun.elevationDeg);
  return blendLook(base, presets.dust_storm, storm);
}
