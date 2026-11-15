// Mouse-look preferences: the pointer sensitivity multiplier and the inverted-Y switch (#102).
// Pure JavaScript with no imports and no browser access, so the engine (view, index) and the mission store
// can share one contract: the store owns the UI value, the engine reads it every frame.
// The preference is saved as JSON under 'marswalk.look': { sensitivity: 1, invertY: false } by default.
// sensitivity stays in the 0.5-2 range (step 0.1) so the view can never spin out of control.
export const LOOK_STORAGE_KEY = 'marswalk.look';
export const LOOK_SENSITIVITY_MIN = 0.5;
export const LOOK_SENSITIVITY_MAX = 2;
export const LOOK_SENSITIVITY_STEP = 0.1;
export const LOOK_DEFAULTS = Object.freeze({ sensitivity: 1, invertY: false });

/** A finite number clamped to the supported range, then rounded to the displayed step. */
function clampSensitivity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return LOOK_DEFAULTS.sensitivity;
  const clamped = Math.min(LOOK_SENSITIVITY_MAX, Math.max(LOOK_SENSITIVITY_MIN, value));
  return Math.round(clamped * 10) / 10;
}

/**
 * The single normaliser for look preferences. It accepts anything (missing fields, strings, arrays, null)
 * and always returns a fresh `{ sensitivity, invertY }`, so callers can assign it without guarding.
 * @param {unknown} value
 * @returns {{ sensitivity: number, invertY: boolean }}
 */
export function clampLookSettings(value) {
  return {
    sensitivity: clampSensitivity(value?.sensitivity),
    // Only the boolean true inverts: a truthy 1 or "yes" from hand-edited storage must not flip the view.
    invertY: value?.invertY === true,
  };
}

/**
 * Restores the saved preference. Missing, blocked or corrupt storage all fall back to the defaults,
 * because a private window or a cleared site must not stop the simulation from starting.
 * @param {{ getItem: (key: string) => string | null } | null | undefined} [storage]
 * @returns {{ sensitivity: number, invertY: boolean }}
 */
export function readLookSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(LOOK_STORAGE_KEY);
    if (typeof raw !== 'string') return { ...LOOK_DEFAULTS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...LOOK_DEFAULTS };
    return clampLookSettings(parsed);
  } catch { /* Storage may be disabled or hold stale JSON; the defaults still work for this session. */ }
  return { ...LOOK_DEFAULTS };
}

/**
 * Saves the preference after clamping, so storage can never hold a value the engine would reject.
 * @param {{ sensitivity?: unknown, invertY?: unknown } | null | undefined} settings
 * @param {{ setItem: (key: string, value: string) => void } | null | undefined} [storage]
 * @returns {boolean} true when the value was stored
 */
export function writeLookSettings(settings, storage = globalThis.localStorage) {
  try {
    storage.setItem(LOOK_STORAGE_KEY, JSON.stringify(clampLookSettings(settings)));
    return true;
  } catch { /* Quota or blocked site data: the choice still applies for this session. */ }
  return false;
}
