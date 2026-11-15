import { medaAt } from '../data/medaRad.js';
import { demoStartLmstForSky, formatLmst, MARS_SEC_PER_EARTH_SEC, parseLmst } from '../sim/missionClock.js';

// The conditions outlook on the mission table (#248): what the replayed MEDA sol gives over the planned walk, the dust
// opacity against the terrain-fix limit, and the space-weather warning. Numbers only; OutlookStrip.jsx words them.
// Plain JavaScript (no React, no DOM), tested without a browser.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/** Spacing of the MEDA samples over the walk window. Mission (Earth) seconds. */
export const OUTLOOK_STEP_SEC = 60;
/** The weather channels the outlook reads, keyed like the store's environment slice (medaAt). */
export const OUTLOOK_CHANNELS = Object.freeze(['pressurePa', 'tempC', 'windMs']);

/**
 * The planned length of the EVA: the crew's budget when the plan comes from their needs, else the walk out (with the
 * work at the stops) and the walk home of route.totals. Mission seconds; null before a route is planned.
 * @param {{ budget?: { usedSec?: number } | null, totals?: { timeSec: number, returnTimeSec: number, roundTrip?: boolean } | null }} plan
 */
export function plannedWalkSec({ budget = null, totals = null } = {}) {
  if (finite(budget?.usedSec) && budget.usedSec > 0) return budget.usedSec;
  if (!totals || !finite(totals.timeSec)) return null;
  return totals.timeSec + (totals.roundTrip ? 0 : totals.returnTimeSec ?? 0);
}

/**
 * Local time the walk starts, seconds after local mean midnight: the mission clock's start once the EVA has begun,
 * else the time the clock will start from for this sky (missionClock.demoStartLmstForSky).
 * @param {{ initialLmst?: string | null } | null} mission the store's mission slice
 * @param {string} [sky] the store's view.sky
 */
export function walkStartLmstSec(mission, sky) {
  if (typeof mission?.initialLmst === 'string') {
    try { return parseLmst(mission.initialLmst); } catch { /* fall through to the demo start */ }
  }
  return parseLmst(demoStartLmstForSky(sky));
}

/**
 * The MEDA weather over the walk window, replayed from the stored sol at the local times the walk will cover. For each
 * channel the lowest and highest value, and the source entry: DATA when every sample is a recorded minute, DERIVED when
 * one falls across a gap in the record (medaAt).
 * @param {ReturnType<typeof import('../data/medaRad.js').parseMedaSol>} meda
 * @param {number} startLmstSec
 * @param {number} durationSec mission seconds
 * @param {number} [stepSec]
 * @returns {{ fromLmst: string, toLmst: string, channels: Record<string, { min: number, max: number,
 *   source: { tag: string, label: string, source: string } }> }}
 */
export function medaOverWindow(meda, startLmstSec, durationSec, stepSec = OUTLOOK_STEP_SEC) {
  const duration = finite(durationSec) && durationSec > 0 ? durationSec : 0;
  const samples = Math.max(1, Math.ceil(duration / stepSec)) + 1;
  const channels = {};
  for (let k = 0; k < samples; k += 1) {
    const elapsed = Math.min(duration, k * stepSec);
    const { values, sources } = medaAt(meda, startLmstSec + elapsed * MARS_SEC_PER_EARTH_SEC);
    for (const key of OUTLOOK_CHANNELS) {
      const value = values[key];
      if (!finite(value)) continue;
      const entry = channels[key] ?? { min: value, max: value, source: { ...sources[key] } };
      entry.min = Math.min(entry.min, value);
      entry.max = Math.max(entry.max, value);
      if (sources[key]?.tag === 'DERIVED') entry.source = { ...entry.source, tag: 'DERIVED' };
      channels[key] = entry;
    }
  }
  for (const entry of Object.values(channels)) delete entry.source.interpolated;
  return { fromLmst: formatLmst(startLmstSec), toLmst: formatLmst(startLmstSec + duration * MARS_SEC_PER_EARTH_SEC), channels };
}

/**
 * Dust opacity against the terrain-fix limit: above it the helmet cameras cannot match the orbital map, so the
 * position estimate only drifts (hazards.json dust.event.nav_fix_tau_max).
 * @param {number | null | undefined} tau
 * @param {number | null | undefined} limit
 * @returns {{ tau: number, limit: number, over: boolean } | null}
 */
export function dustAgainstLimit(tau, limit) {
  if (!finite(tau) || !finite(limit)) return null;
  return { tau, limit, over: tau > limit };
}

/**
 * The space-weather line: the radiation alert under way, switched off for this run, or scheduled at a mission time,
 * always with the lead time a flare alert gave in September 2017.
 * @param {{ leadMin?: number | null, atSec?: number | null, off?: boolean, active?: boolean }} input
 * @returns {{ state: 'active' | 'off' | 'scheduled' | 'watch', leadMin: number | null, atSec: number | null }}
 */
export function spaceWeather({ leadMin = null, atSec = null, off = false, active = false } = {}) {
  const lead = finite(leadMin) ? leadMin : null;
  if (active) return { state: 'active', leadMin: lead, atSec: finite(atSec) ? atSec : null };
  if (off) return { state: 'off', leadMin: lead, atSec: null };
  if (finite(atSec)) return { state: 'scheduled', leadMin: lead, atSec };
  return { state: 'watch', leadMin: lead, atSec: null };
}
