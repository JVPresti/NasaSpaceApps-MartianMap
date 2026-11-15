// Provenance of the missions' event times (#265), registered once for every screen that shows them: the SIM notes of
// src/sim/missions.js, and the first mission's storm opacity, whose ramp is shortened and so is tagged SIM (P19).
// Also which radiation event rates are our steps between RAD's measurements, tagged SIM in the event file (#295).
import { provenance } from '../data/provenance.js';
import { MISSION_SOURCES, missionSourcePath } from '../sim/missions.js';
import radiation from '../sim/events/radiation.json';

/** Registry path of the storm opacity while the first mission plays it: the event banner's tag and caption. */
export const FIRST_STORM_TAU_PATH = missionSourcePath('first', 'dust-storm') + '.tau';
/** Registry path of the sortie stop's reason line at the stop (stops.json route_stops[].reason). */
export const FIRST_STOP_REASON_PATH = 'missions.first.stop.reason';

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
  [FIRST_STOP_REASON_PATH]: {
    tag: 'SIM',
    label: 'SIM · first sortie stop',
    short: 'SIM',
    source: 'why the sortie stop: light-toned ground on the HiRISE outcrop mask, the kind of rock Bright Angel is made of; no rover has looked here, so the science is our assumption (public/data/stops.json route_stops)',
  },
});

/**
 * The registry path for the storm opacity on the event banner: the first mission's SIM entry, else the event's own.
 * @param {'first' | 'full'} missionId
 * @param {string} fullPath the event's usual registry path
 */
export const stormTauPath = (missionId, fullPath) => (missionId === 'first' ? FIRST_STORM_TAU_PATH : fullPath);

/** Registry path of a radiation event rate the event file tags SIM (src/data/provenance.js). */
export const RADIATION_STEP_PATH = 'events.radiation.doseRateUgyH.step';

// The rates the radiation event file tags SIM: the steps we put between the two rates RAD measured (#295).
const RADIATION_STEPS = new Set(radiation.timeline.filter((step) => step.tag === 'SIM').map((step) => step.set['environment.doseRateUgyH']));

/** Whether a radiation event rate is one of our steps (SIM) rather than a RAD measurement. */
export const isRadiationStep = (rate) => RADIATION_STEPS.has(rate);

/**
 * The registry path for the radiation rate on the event banner: the SIM step entry while a step shows, else the
 * event's own DATA entry.
 * @param {number | null} rate environment.doseRateUgyH
 * @param {string} measuredPath the event's usual registry path
 */
export const radiationRatePath = (rate, measuredPath) => (isRadiationStep(rate) ? RADIATION_STEP_PATH : measuredPath);
