/**
 * Environment runner (#189): writes the weather and the radiation dose of the EVA into the mission store.
 *
 * Once per second it replays the stored MEDA sol (public/data/meda_sol.json) at the mission's local mean solar
 * time and adds the current dose rate to the dose of this EVA, both on mission time, so a pause or a time scale
 * applies here too. Outside the radiation event the rate is the RAD background (public/data/rad.json); during the
 * event the event writes the rate and this runner only sums it. Every value it writes gets its entry in `sources`,
 * which the HUD needs before it shows the number.
 *
 * Plain JavaScript: the store is any object with getState / setState. No React, no three.js.
 */
import { medaAt, radBackground } from '../data/medaRad.js';
import { MARS_SEC_PER_EARTH_SEC, parseLmst } from './missionClock.js';
import { TAU_CLEAR } from '../state/dustLevel.js';

export const ENVIRONMENT_TICK_MS = 1000;

/** The alert id the radiation event publishes while it runs (src/sim/events/radiation.json). */
export const RADIATION_EVENT_ID = 'radiation';

// The dose this EVA is the held rates over mission time: during the radiation event, its rates over the minutes the event
// plays, not the 544 µGy the 57 h event of 2017 delivered (#295; the registry entry's note gives that figure).
export const DOSE_SOURCE = Object.freeze({
  tag: 'DERIVED',
  source: 'dose this EVA: the dose rate in the store summed over mission time (the RAD background, or the radiation event\'s rates over the minutes the event plays in this EVA)',
});

export const CLEAR_TAU_SOURCE = Object.freeze({
  tag: 'DATA',
  label: 'MEDA · Perseverance',
  source: 'clear-season tau in Jezero, hazards.json dust.tau.clear_season',
});

/**
 * Seconds after local mean midnight at a mission time, from the clock's start LMST and the elapsed Earth seconds.
 * null when the clock has not started.
 * @param {{ initialLmst?: string | null, elapsedSec?: number }} mission
 */
export function missionLmstSec(mission) {
  if (typeof mission?.initialLmst !== 'string') return null;
  let start;
  try { start = parseLmst(mission.initialLmst); } catch { return null; }
  const elapsed = Number.isFinite(mission.elapsedSec) && mission.elapsedSec > 0 ? mission.elapsedSec : 0;
  return start + elapsed * MARS_SEC_PER_EARTH_SEC;
}

/**
 * @param {{ store: { getState: Function, setState: Function },
 *   meda?: ReturnType<typeof import('../data/medaRad.js').parseMedaSol> | null,
 *   rad?: ReturnType<typeof import('../data/medaRad.js').parseRad> | null,
 *   setInterval?: Function, clearInterval?: Function }} options
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startEnvironmentRunner({ store, meda = null, rad = null, setInterval: si = setInterval, clearInterval: ci = clearInterval }) {
  const background = rad ? radBackground(rad) : null;
  const backgroundSource = background ? { tag: background.tag, label: background.label, source: background.source } : null;
  let doseUgy = 0;
  let lastElapsed = 0;   // the EVA clock starts at 0 when this runner starts
  let stopped = false;

  // The clear-season tau until the dust storm moves it. The store's starting 0 is not a measurement.
  store.setState((s) => {
    if (s.sources['environment.dustOpacity']) return {};
    return {
      environment: { ...s.environment, dustOpacity: TAU_CLEAR },
      sources: { ...s.sources, 'environment.dustOpacity': CLEAR_TAU_SOURCE },
    };
  });

  function tick() {
    if (stopped) return;
    const s = store.getState();
    const environment = {};
    const sources = {};

    if (meda) {
      const lmstSec = missionLmstSec(s.mission);
      if (lmstSec !== null) {
        const weather = medaAt(meda, lmstSec);
        Object.assign(environment, weather.values);
        for (const [key, source] of Object.entries(weather.sources)) sources['environment.' + key] = source;
      }
    }

    const eventActive = s.alerts?.[RADIATION_EVENT_ID]?.active === true;
    if (background || eventActive) {
      const elapsed = Number.isFinite(s.mission?.elapsedSec) ? s.mission.elapsedSec : lastElapsed;
      const dt = Math.max(0, elapsed - lastElapsed);
      lastElapsed = Math.max(lastElapsed, elapsed);
      // The rate held since the last tick: the one in the store, or the background before anything wrote one.
      const held = Number.isFinite(s.environment.doseRateUgyH) ? s.environment.doseRateUgyH : background?.doseRateUgyH;
      if (Number.isFinite(held)) doseUgy += (held * dt) / 3600;
      environment.doseUgy = doseUgy;
      sources['environment.doseUgy'] = DOSE_SOURCE;
      if (!eventActive && background) {
        environment.doseRateUgyH = background.doseRateUgyH;
        sources['environment.doseRateUgyH'] = backgroundSource;
      }
    }

    if (Object.keys(environment).length === 0) return;
    store.setState((st) => ({
      environment: { ...st.environment, ...environment },
      sources: { ...st.sources, ...sources },
    }));
  }

  const timer = si(tick, ENVIRONMENT_TICK_MS);
  tick();

  return {
    tick,
    stop() {
      if (stopped) return;
      stopped = true;
      ci(timer);
    },
  };
}
