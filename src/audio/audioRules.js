// Suit audio rules (#72). Plain functions, no Web Audio, no React: what to hear and how loud, from the mission store.
//
// Sound on Mars: the air is under 1 % of Earth's pressure and CO2 absorbs high frequencies strongly, so outside sound is
// faint and dull (Maurice et al. 2022, Nature 605, Perseverance SuperCam microphone). What an astronaut hears is the
// suit: fans, their own breathing, the radio, and footsteps carried through the boots and the suit, not through the air.
// Every sound is made in code (src/audio/*), so there are no sound files to license.

/** Breaths per minute at rest and at the xEMU design peak (suit.effort 0 and 1). SIM: typical adult rest and hard work. */
export const BREATHS_AT_REST = 12;
export const BREATHS_AT_PEAK = 34;
/** Metres per step on Mars. SIM: a suited walk at about 1 m/s, a little longer than on Earth in 0.38 g. */
export const STRIDE_M = 0.85;
/** A step longer than this between two readings is a teleport (restart, debug place), not walking. */
export const MAX_STEP_JUMP_M = 3;

/** Alert tones, distinct per level. Each note: [frequency Hz, start s, length s]; `sweep` slides each note to that ratio. */
export const ALERT_TONES = Object.freeze({
  info: { wave: 'sine', notes: [[520, 0, 0.18]], gain: 0.35 },
  caution: { wave: 'triangle', notes: [[660, 0, 0.16], [660, 0.26, 0.16]], gain: 0.5 },
  warning: { wave: 'square', notes: [[880, 0, 0.11], [880, 0.17, 0.11], [880, 0.34, 0.11]], gain: 0.32 },
  danger: { wave: 'sawtooth', notes: [[1200, 0, 0.3], [1200, 0.36, 0.3], [1200, 0.72, 0.3]], sweep: 0.5, gain: 0.28 },
});
const LEVEL_RANK = { info: 0, caution: 1, warning: 2, danger: 3 };

const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** @param {number | null} effort suit.effort, 0 at rest to 1 at the design peak @returns {number} breaths per minute */
export function breathRate(effort) {
  return BREATHS_AT_REST + (BREATHS_AT_PEAK - BREATHS_AT_REST) * clamp01(effort);
}

/** Loudness of one breath, 0..1: deeper and louder with effort. */
export function breathDepth(effort) {
  return 0.35 + 0.65 * clamp01(effort);
}

/** Suit fan level, 0..1: the fans spin up a little as the body makes more heat. */
export function fanLevel(effort) {
  return 0.7 + 0.3 * clamp01(effort);
}

/**
 * Dosimeter clicks per second for a dose rate (environment.doseRateUgyH). Silent at the Gale background (RAD, about
 * 10 uGy/h), DOSIMETER_PEAK clicks per second at the solar particle event's peak (30 uGy/h, events/radiation.json),
 * rising with the square so the event is heard building. SIM: a listening aid, not a real counter's response.
 */
export const DOSE_QUIET_UGYH = 11;
export const DOSE_LOUD_UGYH = 30;
export const DOSIMETER_PEAK = 4;
export function dosimeterRate(doseRateUgyH) {
  const k = clamp01((doseRateUgyH - DOSE_QUIET_UGYH) / (DOSE_LOUD_UGYH - DOSE_QUIET_UGYH));
  return DOSIMETER_PEAK * k * k;
}

/**
 * Wind on the helmet, 0..1, from the wind speed (environment.windMs, MEDA) and the storm dust level. Mars wind is a few
 * m/s and seldom over 20 m/s, and the thin air makes even that faint, so it stays a low rumble (suit.js).
 */
export function windLevel(windMs, storm) {
  const w = clamp01(((Number.isFinite(windMs) ? windMs : 0) - 2) / 18);
  return clamp01(0.6 * w + 0.6 * clamp01(storm));
}

/**
 * How sheltered from the outside the player is, 0..1, from the habitat walk zone (engine.getPlayer().habitatZone):
 * the cabin and the inner hatch are closed off, the airlock half (its outer hatch opens as you near it), the rest is out.
 */
export function shelterOf(habitatZone) {
  if (habitatZone === 'main' || habitatZone === 'inner') return 1;
  if (habitatZone === 'airlock') return 0.6;
  if (habitatZone === 'hatch') return 0.3;
  return 0;
}

/** Whether the suit sounds play: in Walk, with the mission running. Alerts and the radio play in both modes. */
export function suitAudible(state) {
  return !!state && state.mode === 'walk' && !state.mission?.paused;
}

/**
 * Alerts that just started or got more severe, most severe first: each gets its tone once.
 * @param {object} prev the store's previous `alerts`
 * @param {object} next the store's `alerts`
 * @returns {Array<{ id: string, level: string }>}
 */
export function newAlerts(prev, next) {
  const out = [];
  for (const [id, a] of Object.entries(next || {})) {
    if (!a || a.active === false || !Object.hasOwn(ALERT_TONES, a.level)) continue;
    const before = prev && prev[id];
    const was = before && before.active !== false ? LEVEL_RANK[before.level] ?? -1 : -1;
    if (LEVEL_RANK[a.level] > was) out.push({ id, level: a.level });
  }
  return out.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

/**
 * Radio cues from the partner link (crew[0].link): a click when it comes back, static when it drops.
 * @returns {'lost' | 'back' | null}
 */
export function radioCue(prevCrew, nextCrew) {
  const a = prevCrew && prevCrew[0], b = nextCrew && nextCrew[0];
  if (!a || !b || typeof a.link !== 'boolean' || typeof b.link !== 'boolean' || a.link === b.link) return null;
  return b.link ? 'back' : 'lost';
}

/**
 * Footsteps from the distance walked since the last reading.
 * @param {number} carried metres left over from earlier readings
 * @param {number} moved metres since the last reading
 * @returns {{ steps: number, carried: number }}
 */
export function stepsFor(carried, moved) {
  if (!Number.isFinite(moved) || moved <= 0 || moved > MAX_STEP_JUMP_M) return { steps: 0, carried: moved > MAX_STEP_JUMP_M ? 0 : carried };
  const total = carried + moved, steps = Math.floor(total / STRIDE_M);
  return { steps, carried: total - steps * STRIDE_M };
}
