// The sky follows the mission clock and the dust (#73).
//   sys.sky.setTime(hours)   local solar time from the mission clock, 0..24; null goes back to the fixed presets
//   sys.sky.setStorm(t)      0..1, a storm look asked for by the store (view.skyBlend, or a dust_storm start sky)
//   sys.sky.update(dt)       once per frame, before sys.dust.update: reapplies the sky when the Sun or the dust moved
//   sys.sky.shadowsBaked()   after a full shadow bake elsewhere (tier change): the map matches the Sun again
//
// The Sun position comes from sunPosition.js, the blend of presets from skyByTime.js. The storm look follows the larger
// of setStorm and the eased dust level of dust.js (U.uDust), so it arrives as gradually as the haze.
// The terrain shadow map is a CPU ray-march, so it is not rebuilt every frame: only after the Sun has moved
// SHADOW_STEP_DEG, and then spread over frames (SHADOW_BUDGET_MS each) while the old map stays in use. At time scale 1
// that is about once a minute, about 30 maps over a 30-minute EVA. Below the horizon there is no direct sunlight to
// cast shadows, so nothing is baked.
import { applyPresetData } from './atmosphere.js';
import { skyAtSun, SUN_FADE_DEG } from './skyByTime.js';
import { TIERS } from './tiers.js';
import { angleBetweenDeg, sunPosition } from '../sim/sunPosition.js';

export const SHADOW_STEP_DEG = 0.25;
export const SHADOW_BUDGET_MS = 4;
const SUN_STEP_DEG = 0.01;     // smaller Sun moves are not worth new uniforms
const STORM_STEP = 0.004;

export function createMissionSky(ctx) {
  const { U } = ctx;
  let hours = null, sun = null, storm = 0;
  let applied = null, job = null, baked = null;

  const stormLevel = () => Math.max(storm, U.uDust.value);

  function apply(shadows) {
    const s = stormLevel();
    applyPresetData(ctx, skyAtSun(ctx.PRESETS, sun, s), `mission sky ${hours.toFixed(2)} h`, { shadows });
    applied = { dir: sun.direction, storm: s };
    if (shadows) { job = null; baked = sun.direction; }
  }

  return {
    get active() { return hours !== null; },
    /** @returns {{ hours: number, elevationDeg: number, azimuthDeg: number } | null} */
    get sun() { return sun && { hours, elevationDeg: sun.elevationDeg, azimuthDeg: sun.azimuthDeg }; },
    /** @param {number | null} h */
    setTime(h) {
      if (h === null) { hours = null; sun = null; applied = null; job = null; return; }
      if (!Number.isFinite(h)) throw new Error('setSkyTime: expected hours from 0 to 24, or null');
      const first = hours === null;
      hours = ((h % 24) + 24) % 24;
      sun = sunPosition(hours);
      if (first) apply(true);   // the first sky comes with its shadows at once
    },
    /** @param {number} t 0..1 */
    setStorm(t) { storm = Math.max(0, Math.min(1, Number(t) || 0)); },
    shadowsBaked() { job = null; if (sun) baked = sun.direction; },
    update() {
      if (hours === null) return;
      const s = stormLevel();
      if (angleBetweenDeg(sun.direction, applied.dir) > SUN_STEP_DEG || Math.abs(s - applied.storm) > STORM_STEP) apply(false);
      if (job) {
        if (job.step(SHADOW_BUDGET_MS)) { job = null; if (ctx.sys.rocks) ctx.sys.rocks.resun(); }   // the rock contact shadows turn with it
      } else if (sun.elevationDeg > SUN_FADE_DEG[0] && angleBetweenDeg(sun.direction, baked) > SHADOW_STEP_DEG) {
        job = ctx.terrain.startShadowBake(TIERS[ctx.tier].shadowRes);   // takes the Sun direction just applied
        baked = sun.direction;
      }
    },
  };
}
