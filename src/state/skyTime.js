// Local solar time for the sky (#73), from the mission clock fields of the store. Plain function, no React, no three.js.
// The clock publishes `lmst` as 'HH:MM', which would move the Sun in one-minute steps. While the clock runs, the time is
// rebuilt to the second from the start time and the elapsed EVA time, as the clock itself does (missionClock.js).
import { MARS_SEC_PER_EARTH_SEC, parseLmst } from '../sim/missionClock.js';

const LMST = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * @param {{ initialLmst?: string | null, elapsedSec?: number, lmst?: string | null }} mission the store's `mission`
 * @returns {number | null} hours after local midnight, 0 to 24, or null when the store has no mission time
 */
export function missionSolarHours(mission) {
  if (!mission) return null;
  if (typeof mission.initialLmst === 'string' && LMST.test(mission.initialLmst) && Number.isFinite(mission.elapsedSec)) {
    const sec = parseLmst(mission.initialLmst) + mission.elapsedSec * MARS_SEC_PER_EARTH_SEC;
    return ((sec / 3600) % 24 + 24) % 24;
  }
  if (typeof mission.lmst === 'string' && LMST.test(mission.lmst)) return parseLmst(mission.lmst) / 3600;   // mock data: a fixed time
  return null;
}
