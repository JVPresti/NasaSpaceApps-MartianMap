/**
 * Mission clock: elapsed EVA time and local mean solar time, derived from one start timestamp.
 *
 * The clock never adds up frame times or tick intervals. Every reading is a pure function of a stored
 * timestamp anchor and `now`:
 *
 *   elapsed = elapsedSec + (paused ? 0 : max(0, now - anchorMs) / 1000) * timeScale
 *
 * `pause`, `resume` and a time-scale change move the anchor to the exact instant of the change and store
 * the elapsed value at that instant. A long tab suspension, a reload or an irregular tick therefore cannot
 * drift: the next reading simply asks the wall clock how much time has passed.
 *
 * Local mean solar time (LMST) advances at the Mars rate: 86,400 Mars clock seconds per 88,775 Earth
 * seconds (one sol). Time scale multiplies both values, so a scale of 1 and 88,775 elapsed seconds move
 * LMST by exactly 24 Mars hours and roll the sol over by one.
 *
 * The site is at 77.3053 E. The configuration takes the *local* LMST at the site (for example 17:45),
 * not prime-meridian time, so no longitude correction is applied to it. The exported longitude helpers
 * are only for a caller that starts from Mars24's prime-meridian mean time:
 *
 *   LMST = MT + east longitude / 15        (NASA Mars24, https://www.giss.nasa.gov/tools/mars24/help/notes.html)
 *
 * The demo sol number and start times are SIM values: a plausible EVA, not a historical measurement and
 * not a precise ephemeris. The clock itself never changes the sky: the engine bridge turns its time into
 * the Sun's position (src/state/skyTime.js, #73). The starting sky preset is recorded so the restored
 * session opens in the same light, and a dust_storm start keeps the storm look.
 *
 * Plain JavaScript. No React, no three.js, no store import: pass any object with getState / setState /
 * subscribe, as `src/state/store.js` provides.
 */

/** One sol, Earth seconds. From the issue: 24 h 39 min 35 s. */
export const SOL_LENGTH_EARTH_SEC = 88775;
/** Mars clock seconds in one sol. */
export const MARS_SEC_PER_SOL = 86400;
/** Mars clock seconds per Earth second at mission time scale 1. */
export const MARS_SEC_PER_EARTH_SEC = MARS_SEC_PER_SOL / SOL_LENGTH_EARTH_SEC;
/** East longitude of Cheyava Falls, degrees. */
export const SITE_LONGITUDE_DEG = 77.3053;
/** sessionStorage key for the one persisted clock session. */
export const CLOCK_STORAGE_KEY = 'marswalk.missionClock.v1';
/** Stored session schema version. */
export const CLOCK_VERSION = 1;
/** Default publish interval. The store is timestamp-derived, so this only sets display freshness. */
export const CLOCK_TICK_MS = 1000;

/** Sky presets the engine draws (`src/engine/index.js`). */
export const SKY_PRESETS = Object.freeze(['clear_day', 'dust_storm', 'late_afternoon', 'night']);

/**
 * Coarse demo start times for the alternate sky presets. These are selectable starting configurations,
 * not sun-position calculations (the Sun follows the clock time instead, #73). A caller-provided `initialLmst`
 * overrides the preset.
 */
export const DEMO_START_LMST_BY_SKY = Object.freeze({
  clear_day: '14:00',
  dust_storm: '14:00',
  late_afternoon: '17:45',
  night: '22:00',
});

/** Default demo session: sol 1210 at 17:45 local LMST, real time, late-afternoon light. */
export const DEMO_MISSION_CLOCK = Object.freeze({
  initialSol: 1210,
  initialLmst: '17:45',
  timeScale: 1,
  sky: 'late_afternoon',
  longitudeDeg: SITE_LONGITUDE_DEG,
});

const LMST_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fail(field, expectation) {
  throw new Error('mission clock: ' + field + ' ' + expectation);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateNow(nowMs) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < 0) fail('now', 'must be a finite timestamp in ms');
}

function validateTimeScale(scale) {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    fail('timeScale', 'must be a finite number greater than 0 (use pause for stopping time)');
  }
}

function validateInitialSol(sol) {
  if (!Number.isSafeInteger(sol) || sol < 0) fail('initialSol', 'must be a non-negative integer');
}

function validateLongitude(longitudeDeg) {
  if (typeof longitudeDeg !== 'number' || !Number.isFinite(longitudeDeg) || longitudeDeg < -180 || longitudeDeg > 180) {
    fail('longitudeDeg', 'must be a finite number from -180 to 180 (east positive)');
  }
}

function validateSky(sky) {
  if (!SKY_PRESETS.includes(sky)) fail('sky', 'must be one of ' + SKY_PRESETS.join(', '));
}

/**
 * Parse a 24-hour `'HH:MM'` local time.
 * @param {string} value
 * @returns {number} seconds after local midnight, 0 to 86399
 */
export function parseLmst(value) {
  if (typeof value !== 'string') fail('lmst', "must be a string in 24-hour 'HH:MM' form");
  const match = LMST_PATTERN.exec(value);
  if (!match) fail('lmst', "must be a 24-hour 'HH:MM' time from 00:00 to 23:59");
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

/**
 * Format seconds after local midnight as `'HH:MM'`. The seconds are floored, as a clock display does.
 * @param {number} seconds
 * @returns {string}
 */
export function formatLmst(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) fail('lmst seconds', 'must be a finite number');
  const wrapped = ((seconds % MARS_SEC_PER_SOL) + MARS_SEC_PER_SOL) % MARS_SEC_PER_SOL;
  const totalMinutes = Math.floor(wrapped / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

/** Coarse demo start time for a sky preset; unknown presets fall back to the demo default. */
export function demoStartLmstForSky(sky) {
  return Object.hasOwn(DEMO_START_LMST_BY_SKY, sky) ? DEMO_START_LMST_BY_SKY[sky] : DEMO_MISSION_CLOCK.initialLmst;
}

/**
 * Longitude term of Mars24's local mean solar time, in hours. East is positive.
 * @param {number} longitudeDeg
 * @returns {number} hours, positive east
 */
export function longitudeOffsetHours(longitudeDeg) {
  validateLongitude(longitudeDeg);
  return longitudeDeg / 15;
}

function normalizeHours(hours) {
  return ((hours % 24) + 24) % 24;
}

/**
 * Mars24 local mean solar time from prime-meridian mean time: `MT + east longitude / 15`.
 * Do not use this on a value that is already local time, or the longitude is applied twice.
 * @param {number} primeMeridianMeanTimeHours 0 to 24, or any number that wraps
 * @param {number} longitudeDeg east positive
 * @returns {number} local mean solar time in hours, 0 to 24
 */
export function localMeanSolarTimeHours(primeMeridianMeanTimeHours, longitudeDeg) {
  if (typeof primeMeridianMeanTimeHours !== 'number' || !Number.isFinite(primeMeridianMeanTimeHours)) {
    fail('primeMeridianMeanTimeHours', 'must be a finite number');
  }
  return normalizeHours(primeMeridianMeanTimeHours + longitudeOffsetHours(longitudeDeg));
}

/**
 * Inverse of {@link localMeanSolarTimeHours}: local time back to prime-meridian mean time.
 * @param {number} localHours 0 to 24, or any number that wraps
 * @param {number} longitudeDeg east positive
 * @returns {number} prime-meridian mean time in hours, 0 to 24
 */
export function primeMeridianMeanTimeHours(localHours, longitudeDeg) {
  if (typeof localHours !== 'number' || !Number.isFinite(localHours)) fail('localHours', 'must be a finite number');
  return normalizeHours(localHours - longitudeOffsetHours(longitudeDeg));
}

/**
 * Merge and validate a start configuration. Missing values take the demo defaults. If `initialLmst` is
 * absent, it follows the chosen sky preset; an explicit value always wins.
 * @param {object} [config]
 * @returns {{initialSol: number, initialLmst: string, initialLmstSec: number, timeScale: number,
 *   longitudeDeg: number, sky: string}}
 */
export function resolveClockConfig(config = {}) {
  if (!isRecord(config)) fail('config', 'must be an object');
  const sky = config.sky === undefined ? DEMO_MISSION_CLOCK.sky : config.sky;
  validateSky(sky);
  const initialLmst = config.initialLmst === undefined ? demoStartLmstForSky(sky) : config.initialLmst;
  const initialLmstSec = parseLmst(initialLmst);
  const initialSol = config.initialSol === undefined ? DEMO_MISSION_CLOCK.initialSol : config.initialSol;
  validateInitialSol(initialSol);
  const timeScale = config.timeScale === undefined ? DEMO_MISSION_CLOCK.timeScale : config.timeScale;
  validateTimeScale(timeScale);
  const longitudeDeg = config.longitudeDeg === undefined ? DEMO_MISSION_CLOCK.longitudeDeg : config.longitudeDeg;
  validateLongitude(longitudeDeg);
  return { initialSol, initialLmst, initialLmstSec, timeScale, longitudeDeg, sky };
}

/**
 * New clock session. `startedAtMs` is the wall-clock instant of the first start; `anchorMs` is the
 * instant at which `elapsedSec` was last frozen (start, pause, resume or time-scale change).
 * @param {object} [config]
 * @param {number} [nowMs]
 */
export function createClockSession(config = {}, nowMs = Date.now()) {
  validateNow(nowMs);
  const resolved = resolveClockConfig(config);
  return {
    version: CLOCK_VERSION,
    startedAtMs: nowMs,
    anchorMs: nowMs,
    elapsedSec: 0,
    paused: false,
    timeScale: resolved.timeScale,
    initialSol: resolved.initialSol,
    initialLmst: resolved.initialLmst,
    initialLmstSec: resolved.initialLmstSec,
    longitudeDeg: resolved.longitudeDeg,
    sky: resolved.sky,
  };
}

function assertSession(session) {
  if (!isRecord(session)) fail('session', 'must be an object');
  validateNow(session.startedAtMs);
  validateNow(session.anchorMs);
  if (typeof session.elapsedSec !== 'number' || !Number.isFinite(session.elapsedSec) || session.elapsedSec < 0) {
    fail('session.elapsedSec', 'must be a finite number of seconds at or above 0');
  }
  if (typeof session.paused !== 'boolean') fail('session.paused', 'must be a boolean');
  validateTimeScale(session.timeScale);
  validateInitialSol(session.initialSol);
  parseLmst(session.initialLmst);
  validateLongitude(session.longitudeDeg);
  validateSky(session.sky);
}

/**
 * Elapsed EVA seconds at a timestamp. Paused sessions ignore `now` entirely.
 * @param {object} session
 * @param {number} nowMs
 */
export function elapsedSecAt(session, nowMs) {
  assertSession(session);
  validateNow(nowMs);
  if (session.paused) return session.elapsedSec;
  const deltaMs = Math.max(0, nowMs - session.anchorMs);
  return session.elapsedSec + (deltaMs / 1000) * session.timeScale;
}

/**
 * Everything the store shows, computed at one timestamp.
 * @param {object} session
 * @param {number} nowMs
 */
export function clockReading(session, nowMs) {
  const elapsedSec = elapsedSecAt(session, nowMs);
  const lmstTotalSec = parseLmst(session.initialLmst) + elapsedSec * MARS_SEC_PER_EARTH_SEC;
  const solOffset = Math.floor(lmstTotalSec / MARS_SEC_PER_SOL);
  const lmstSec = lmstTotalSec - solOffset * MARS_SEC_PER_SOL;
  return {
    startedAtMs: session.startedAtMs,
    anchorMs: session.anchorMs,
    elapsedSec,
    paused: session.paused,
    timeScale: session.timeScale,
    sol: session.initialSol + solOffset,
    lmst: formatLmst(lmstSec),
    lmstSec,
    initialSol: session.initialSol,
    initialLmst: session.initialLmst,
    longitudeDeg: session.longitudeDeg,
    sky: session.sky,
  };
}

/**
 * Freeze elapsed time at `nowMs`. Pausing twice keeps the first pause instant.
 * @param {object} session
 * @param {number} nowMs
 */
export function pauseClockSession(session, nowMs) {
  if (session.paused) return { ...session };
  return { ...session, elapsedSec: elapsedSecAt(session, nowMs), anchorMs: nowMs, paused: true };
}

/**
 * Continue from a paused session, anchoring at the exact resume instant. Resuming twice is a no-op.
 * @param {object} session
 * @param {number} nowMs
 */
export function resumeClockSession(session, nowMs) {
  if (!session.paused) return { ...session };
  return { ...session, elapsedSec: elapsedSecAt(session, nowMs), anchorMs: nowMs, paused: false };
}

/**
 * Change time scale while keeping elapsed time and paused status continuous.
 * @param {object} session
 * @param {number} timeScale
 * @param {number} nowMs
 */
export function setClockTimeScale(session, timeScale, nowMs) {
  validateTimeScale(timeScale);
  return { ...session, elapsedSec: elapsedSecAt(session, nowMs), anchorMs: nowMs, timeScale };
}

/** Serializable form of a session. Only these fields go to sessionStorage. */
export function toStoredClockSession(session) {
  assertSession(session);
  return {
    version: CLOCK_VERSION,
    startedAtMs: session.startedAtMs,
    anchorMs: session.anchorMs,
    elapsedSec: session.elapsedSec,
    paused: session.paused,
    timeScale: session.timeScale,
    initialSol: session.initialSol,
    initialLmst: session.initialLmst,
    longitudeDeg: session.longitudeDeg,
    sky: session.sky,
  };
}

/** A stored session is valid only if every field is present and plausible. Malformed data returns null. */
function sessionFromStored(value) {
  try {
    if (!isRecord(value) || value.version !== CLOCK_VERSION) return null;
    validateNow(value.startedAtMs);
    validateNow(value.anchorMs);
    if (typeof value.elapsedSec !== 'number' || !Number.isFinite(value.elapsedSec) || value.elapsedSec < 0) return null;
    if (typeof value.paused !== 'boolean') return null;
    validateTimeScale(value.timeScale);
    validateInitialSol(value.initialSol);
    validateLongitude(value.longitudeDeg);
    validateSky(value.sky);
    return {
      version: CLOCK_VERSION,
      startedAtMs: value.startedAtMs,
      anchorMs: value.anchorMs,
      elapsedSec: value.elapsedSec,
      paused: value.paused,
      timeScale: value.timeScale,
      initialSol: value.initialSol,
      initialLmst: value.initialLmst,
      initialLmstSec: parseLmst(value.initialLmst),
      longitudeDeg: value.longitudeDeg,
      sky: value.sky,
    };
  } catch {
    return null;
  }
}

/**
 * Read the persisted clock session. A missing, unavailable, denied or malformed store returns null;
 * the caller then starts a fresh session.
 * @param {{getItem?: Function}} [storage]
 */
export function readClockSession(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  let raw;
  try {
    raw = storage.getItem(CLOCK_STORAGE_KEY);
  } catch {
    return null;
  }
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return sessionFromStored(parsed);
}

/**
 * Persist the clock session. Never throws when the storage is denied, full or unavailable.
 * @param {{setItem?: Function}} [storage]
 * @param {object} session
 * @returns {boolean} true when it was written
 */
export function writeClockSession(storage, session) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(CLOCK_STORAGE_KEY, JSON.stringify(toStoredClockSession(session)));
    return true;
  } catch {
    return false;
  }
}

/** Remove the persisted session. Never throws. */
export function clearClockSession(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return false;
  try {
    storage.removeItem(CLOCK_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The tab's sessionStorage, or null when the browser denies it. Accessing the property itself can throw.
 * sessionStorage is the right scope: it survives a reload of this tab, and a new tab starts a new demo.
 */
export function defaultSessionStorage() {
  try {
    const storage = globalThis.sessionStorage;
    return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : null;
  } catch {
    return null;
  }
}

const SIM_EPOCH_SOURCE = Object.freeze({
  tag: 'SIM',
  source: 'SIM mission epoch and demo starting sol/time (src/sim/missionClock.js); not a historical measurement and not a precise ephemeris',
});
const DERIVED_TIME_SOURCE = Object.freeze({
  tag: 'DERIVED',
  source: 'derived from the mission start timestamp: one sol = 88,775 Earth s, LMST at 77.3053 E by mean solar rate; not a precise ephemeris',
});
const SIM_SCALE_SOURCE = Object.freeze({
  tag: 'SIM',
  source: 'SIM demo time-scale factor (src/sim/missionClock.js); pause is separate',
});

/** Source tags for every mission field the clock owns. Copied into `sources` once at start. */
export const MISSION_CLOCK_SOURCES = Object.freeze({
  'mission.startedAtMs': SIM_EPOCH_SOURCE,
  'mission.initialSol': SIM_EPOCH_SOURCE,
  'mission.initialLmst': SIM_EPOCH_SOURCE,
  'mission.sky': SIM_EPOCH_SOURCE,
  'mission.anchorMs': DERIVED_TIME_SOURCE,
  'mission.elapsedSec': DERIVED_TIME_SOURCE,
  'mission.timeScale': SIM_SCALE_SOURCE,
  'mission.sol': DERIVED_TIME_SOURCE,
  'mission.lmst': DERIVED_TIME_SOURCE,
});

function readoutFields(reading) {
  return {
    startedAtMs: reading.startedAtMs,
    anchorMs: reading.anchorMs,
    elapsedSec: reading.elapsedSec,
    paused: reading.paused,
    timeScale: reading.timeScale,
    sol: reading.sol,
    lmst: reading.lmst,
    initialSol: reading.initialSol,
    initialLmst: reading.initialLmst,
    longitudeDeg: reading.longitudeDeg,
    sky: reading.sky,
  };
}

function sameReadout(a, b) {
  return a !== null
    && a.startedAtMs === b.startedAtMs
    && a.anchorMs === b.anchorMs
    && Object.is(a.elapsedSec, b.elapsedSec)
    && a.paused === b.paused
    && a.timeScale === b.timeScale
    && a.sol === b.sol
    && a.lmst === b.lmst;
}

/**
 * Start the clock against a store. The clock publishes mission fields, persists one session in
 * sessionStorage, and listens for `mission.paused` / `mission.timeScale` writes from other code (the
 * suit runner reads `mission.paused`) so a direct write is anchored at its exact instant and is not
 * overwritten by the next tick.
 *
 * A restored running session includes the time the page was absent. A restored paused session excludes it.
 *
 * @param {{
 *   store: {getState: Function, setState: Function, subscribe: Function},
 *   config?: object,
 *   now?: () => number,
 *   storage?: object | null,
 *   intervalMs?: number,
 *   setInterval?: Function,
 *   clearInterval?: Function,
 *   restore?: boolean,
 * }} options
 * @returns {{
 *   tick: () => void,
 *   pause: () => object,
 *   resume: () => object,
 *   setPaused: (paused: boolean) => object,
 *   setTimeScale: (scale: number) => object,
 *   getSession: () => object,
 *   stop: () => void,
 * }}
 */
export function startMissionClock({
  store,
  config = {},
  now = () => Date.now(),
  storage = defaultSessionStorage(),
  intervalMs = CLOCK_TICK_MS,
  setInterval: si = setInterval,
  clearInterval: ci = clearInterval,
  restore = true,
} = {}) {
  if (!store || typeof store.getState !== 'function' || typeof store.setState !== 'function' || typeof store.subscribe !== 'function') {
    fail('store', 'must provide getState, setState and subscribe');
  }
  if (typeof now !== 'function') fail('now', 'must be a function returning a timestamp in ms');
  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    fail('intervalMs', 'must be a finite number greater than 0');
  }

  const restored = restore ? readClockSession(storage) : null;
  let session = restored || createClockSession(config, now());
  let published = null;
  let stopped = false;

  const persist = () => writeClockSession(storage, session);

  function publishAt(nowMs, { force = false } = {}) {
    const reading = clockReading(session, nowMs);
    const fields = readoutFields(reading);
    if (!force && published && sameReadout(published, fields)) return reading;
    published = fields;
    store.setState((state) => ({ mission: { ...state.mission, ...fields } }));
    return reading;
  }

  // Initial publication also applies the starting sky and source tags. Later ticks never touch view.sky:
  // the Sun follows the published time through the engine bridge (#73), not through view.sky.
  const first = clockReading(session, now());
  published = readoutFields(first);
  store.setState((state) => ({
    mission: { ...state.mission, ...published },
    view: { ...state.view, sky: session.sky },
    sources: { ...state.sources, ...MISSION_CLOCK_SOURCES },
  }));
  persist();

  const unsubscribe = store.subscribe((state) => {
    const mission = state.mission;
    if (!mission || stopped) return;
    if (mission.paused !== published.paused) {
      const at = now();
      session = mission.paused === true ? pauseClockSession(session, at) : resumeClockSession(session, at);
      published = { ...published, paused: session.paused, anchorMs: session.anchorMs, elapsedSec: session.elapsedSec };
      persist();
      // Publish the exact pause/resume boundary now, not at the next tick. Our own write is recognised
      // because `published` was updated first, so it cannot loop.
      publishAt(at, { force: true });
    }
    if (mission.timeScale !== published.timeScale) {
      // A raw invalid write is ignored; the next tick restores the last valid scale.
      try {
        const at = now();
        session = setClockTimeScale(session, mission.timeScale, at);
        published = { ...published, timeScale: session.timeScale, anchorMs: session.anchorMs, elapsedSec: session.elapsedSec };
        persist();
        publishAt(at, { force: true });
      } catch {
        // invalid external value: leave the clock on its validated scale
      }
    }
  });

  const timer = typeof si === 'function' ? si(() => { if (!stopped) publishAt(now()); }, intervalMs) : null;

  function applyPaused(paused, at) {
    if (stopped) return session;
    if (typeof paused !== 'boolean') fail('paused', 'must be a boolean');
    session = paused ? pauseClockSession(session, at) : resumeClockSession(session, at);
    persist();
    publishAt(at, { force: true });
    return session;
  }

  return {
    tick() { if (!stopped) publishAt(now()); },
    pause() { return applyPaused(true, now()); },
    resume() { return applyPaused(false, now()); },
    setPaused(paused) { return applyPaused(paused, now()); },
    setTimeScale(scale) {
      if (stopped) return session;
      validateTimeScale(scale);
      const at = now();
      session = setClockTimeScale(session, scale, at);
      persist();
      publishAt(at, { force: true });
      return session;
    },
    getSession() { return { ...session }; },
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) ci(timer);
      unsubscribe();
      persist();
    },
  };
}
