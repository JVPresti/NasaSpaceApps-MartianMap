/**
 * Pure helpers for the Plan camera: how many metres one screen pixel covers,
 * and which round scale-bar length fits a target width.
 *
 * No three.js, no React: the engine uses the first function to answer
 * `getPlanScale()` and the Plan panel uses the second to draw its scale bar.
 */

/**
 * Metres of ground covered by one CSS pixel at the camera target, for a
 * camera looking straight down.
 * @param {number} heightM camera height above the target, metres
 * @param {number} fovDeg vertical field of view, degrees
 * @param {number} viewportHeightPx viewport height in CSS pixels
 * @returns {number} metres per CSS pixel
 */
export function metresPerPixel(heightM, fovDeg, viewportHeightPx) {
  if (!(heightM >= 0) || !(fovDeg > 0) || !(viewportHeightPx > 0)) return 0;
  const halfFov = (fovDeg * Math.PI) / 360;
  return (2 * heightM * Math.tan(halfFov)) / viewportHeightPx;
}

const ROUND_STEPS = [1, 2, 5];

/**
 * Pick a round length (1, 2 or 5 times a power of ten) that fits about
 * `targetPx` pixels at the given scale.
 * @param {number} targetPx preferred bar width in CSS pixels
 * @param {number} mPerPx metres per CSS pixel
 * @returns {{ metres: number, px: number }}
 */
export function niceScaleLength(targetPx, mPerPx) {
  if (!(targetPx > 0) || !(mPerPx > 0)) return { metres: 0, px: 0 };
  const idealM = targetPx * mPerPx;
  const power = 10 ** Math.floor(Math.log10(idealM));
  let metres = power;
  for (let k = ROUND_STEPS.length - 1; k >= 0; k -= 1) {
    const candidate = ROUND_STEPS[k] * power;
    if (candidate <= idealM) {
      metres = candidate;
      break;
    }
  }
  return { metres, px: metres / mPerPx };
}

/**
 * Format a scale-bar length with metres below 1 km and kilometres above.
 * @param {number} metres
 * @returns {string}
 */
export function formatScaleLength(metres) {
  if (!(metres > 0)) return '—';
  if (metres >= 1000) {
    const km = metres / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${Math.round(metres)} m`;
}
