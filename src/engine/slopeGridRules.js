// Rules of the slope grid (slopeGrid.js, #50). Plain JavaScript, no three.js, so it tests quickly.
// The colour classes are the slope layer's legend and the route planner's limits (COST_CONSTANTS in src/sim/costGrid.js).
import { COST_CONSTANTS } from '../sim/costGrid.js';

export const GRID_SPACING_M = 2;     // one line every 2 m: the spacing of the terrain height grid (terrain.json)
export const PATCH_M = 48;           // the grid covers this square around the player
export const RECENTER_M = 4;         // the patch moves when the player is this far from its centre

/** @param {number} deg @returns {'ok' | 'caution' | 'nogo'} */
export function slopeClass(deg) {
  if (deg > COST_CONSTANTS.SLOPE_LIMIT_DEG) return 'nogo';
  if (deg > COST_CONSTANTS.SLOPE_CAUTION_DEG) return 'caution';
  return 'ok';
}

/** The patch centre for a player position: snapped to the grid, so the lines stay put on the ground as the patch moves. */
export function snapCenter(x, z, step = RECENTER_M) {
  return { x: Math.round(x / step) * step, z: Math.round(z / step) * step };
}

/** True when the player has walked far enough from the patch centre for it to move. */
export function needsRecenter(center, x, z) {
  return !center || Math.max(Math.abs(x - center.x), Math.abs(z - center.z)) >= RECENTER_M;
}
