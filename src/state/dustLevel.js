// Turns the dust opacity in the store (environment.dustOpacity, tau) into the engine's storm-dust level (0..1, #27).
//   tau 0.45 -> 0, the scene as before: a clear Jezero season (hazards.json, dust.tau.clear_season, Perseverance)
//   tau 8    -> 1, a global storm: Gale crater in June 2018, where tau rose above 8 (Curiosity; JPL news release
//               "Martian Dust Storm Grows Global; Curiosity Captures Photos of Thickening Haze", 20 June 2018)
// Linear in between, so the 2022 Jezero regional storm (tau 2.0, dust.tau.storm_2022_peak) is about 0.2: a light haze,
// which matches the 31 km visibility Perseverance measured in it. The dust storm event (#24) only moves
// environment.dustOpacity and chooses which storm it plays.
export const TAU_CLEAR = 0.45;
export const TAU_STORM = 8.0;

/** @param {number | null | undefined} tau @returns {number} 0..1 */
export function dustLevelFromTau(tau) {
  if (!Number.isFinite(tau)) return 0;
  return Math.min(1, Math.max(0, (tau - TAU_CLEAR) / (TAU_STORM - TAU_CLEAR)));
}
