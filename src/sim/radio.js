/**
 * Radio link to the habitat mast (#74).
 *
 * No relay network exists at walking scale, so the link is direct line of
 * sight through the terrain. The engine's `lineOfSight(a, b)` is the input;
 * this module is plain JavaScript so the mask and link state can be tested.
 */

export const RADIO_STEP_M = 20;
export const RADIO_WEAK_RANGE_M = 800;
export const TILE_WIDTH_M = 1422.506134457525;
export const TILE_DEPTH_M = 1500;

/**
 * @param {{ point: { x: number, z: number }, mast: { x: number, y?: number, z: number },
 *   lineOfSight: (a: object, b: object) => { clear: boolean },
 *   weakRangeM?: number }} input
 * @returns {{ state: 'linked' | 'weak' | 'lost', rangeM: number, clear: boolean }}
 */
export function radioLinkState({ point, mast, lineOfSight, weakRangeM = RADIO_WEAK_RANGE_M }) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)
    || !mast || !Number.isFinite(mast.x) || !Number.isFinite(mast.z)) {
    return { state: 'lost', rangeM: 0, clear: false };
  }
  const rangeM = Math.hypot(mast.x - point.x, mast.z - point.z);
  const los = lineOfSight(point, mast);
  if (!los?.clear) return { state: 'lost', rangeM, clear: false };
  return { state: rangeM > weakRangeM ? 'weak' : 'linked', rangeM, clear: true };
}

/**
 * Coarse cells where the link to the mast would be lost. Used as a Plan-mode
 * overlay; 20 m is enough to read the ridges without thousands of expensive
 * rays.
 * @param {{ mast: { x: number, y?: number, z: number },
 *   lineOfSight: (a: object, b: object) => { clear: boolean },
 *   stepM?: number, widthM?: number, depthM?: number }} input
 * @returns {Array<{ x: number, z: number }>}
 */
export function radioShadowCells({ mast, lineOfSight, stepM = RADIO_STEP_M, widthM = TILE_WIDTH_M, depthM = TILE_DEPTH_M }) {
  if (!mast || !Number.isFinite(mast.x) || !Number.isFinite(mast.z)) return [];
  const cells = [];
  for (let z = -depthM / 2; z <= depthM / 2; z += stepM) {
    for (let x = -widthM / 2; x <= widthM / 2; x += stepM) {
      const los = lineOfSight({ x, z }, mast);
      if (!los?.clear) cells.push({ x, z });
    }
  }
  return cells;
}
