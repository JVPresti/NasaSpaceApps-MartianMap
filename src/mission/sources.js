// Provenance of the missions' event times (#265), registered once for every screen that shows them: the SIM notes of
// src/sim/missions.js, and the first mission's storm opacity, whose ramp is shortened and so is tagged SIM (P19).
import { provenance } from '../data/provenance.js';
import { MISSION_SOURCES, missionSourcePath } from '../sim/missions.js';

/** Registry path of the storm opacity while the first mission plays it: the event banner's tag and caption. */
export const FIRST_STORM_TAU_PATH = missionSourcePath('first', 'dust-storm') + '.tau';

const tau = provenance.lookup('environment.dustOpacity');

provenance.define({
  ...MISSION_SOURCES,
  [FIRST_STORM_TAU_PATH]: {
    tag: 'SIM',
    label: 'Dust storm model · first mission',
    short: 'Dust storm model',
    source: `${tau?.source ?? 'dust storm event'}; first mission: the ramp compressed from 90 s to 30 s`,
    caption: tau?.caption ?? null,
  },
});

/**
 * The registry path for the storm opacity on the event banner: the first mission's SIM entry, else the event's own.
 * @param {'first' | 'full'} missionId
 * @param {string} fullPath the event's usual registry path
 */
export const stormTauPath = (missionId, fullPath) => (missionId === 'first' ? FIRST_STORM_TAU_PATH : fullPath);
