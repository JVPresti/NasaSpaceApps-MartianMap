/**
 * Radio link to the habitat mast (#74).
 *
 * No relay network exists at walking scale, so the link is direct line of
 * sight through the terrain. The engine's `lineOfSight(a, b)` is the input;
 * this module is plain JavaScript so the mask and link state can be tested.
 *
 * The planner works without the engine, so it uses {@link gridLineOfSight}: the same test on the planner's height
 * grid (route profiles, #245).
 */

import { heightAt } from './costGrid.js';

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

/** Height of the suit antenna above the ground: the engine's eye height for `lineOfSight`. Metres. */
export const RADIO_EYE_HEIGHT_M = 1.7;
/** Spacing of the terrain samples along a line of sight, as in the engine. Metres. */
export const RADIO_SIGHT_STEP_M = 2;
/** Cell size of the radio-shadow mask the planner prices. Metres. */
export const RADIO_MASK_STEP_M = 10;
/** Spacing of the samples along a route when measuring its share in radio shadow. Metres. */
export const RADIO_PATH_STEP_M = 5;

const finiteMast = (mast) => Boolean(mast) && Number.isFinite(mast.x) && Number.isFinite(mast.z);

/**
 * Line of sight over the planner's height grid: the engine's `lineOfSight` (src/engine/queries.js) inside the
 * HiRISE tile, where both use the same bilinear height. A point without y is taken at the antenna height above
 * the ground. Both points must be inside the tile.
 * @param {{ n: number, width: number, depth: number, heights: Float32Array }} grid
 * @param {{ x: number, y?: number, z: number }} a
 * @param {{ x: number, y?: number, z: number }} b
 * @param {{ step?: number, eyeHeight?: number }} [options]
 * @returns {boolean} true when nothing blocks the line
 */
export function gridLineOfSight(grid, a, b, { step = RADIO_SIGHT_STEP_M, eyeHeight = RADIO_EYE_HEIGHT_M } = {}) {
  const ay = Number.isFinite(a.y) ? a.y : heightAt(grid, a.x, a.z) + eyeHeight;
  const by = Number.isFinite(b.y) ? b.y : heightAt(grid, b.x, b.z) + eyeHeight;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(length / step));
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    if (heightAt(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > ay + (by - ay) * t) return false;
  }
  return true;
}

/**
 * Where the link to the mast is lost, as a coarse mask over the tile for the planner to price.
 * @param {object} grid the planner's grid
 * @param {{ x: number, y?: number, z: number }} mast
 * @param {number} [stepM]
 * @returns {{ stepM: number, cols: number, rows: number, x0: number, z0: number, shadow: Uint8Array } | null}
 *   shadow[row * cols + col] is 1 where the mast cannot be seen; null without a mast
 */
export function radioShadowMask(grid, mast, stepM = RADIO_MASK_STEP_M) {
  if (!finiteMast(mast)) return null;
  const cols = Math.floor(grid.width / stepM) + 1;
  const rows = Math.floor(grid.depth / stepM) + 1;
  const x0 = -grid.width / 2;
  const z0 = -grid.depth / 2;
  const shadow = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      shadow[r * cols + c] = gridLineOfSight(grid, { x: x0 + c * stepM, z: z0 + r * stepM }, mast) ? 0 : 1;
    }
  }
  return { stepM, cols, rows, x0, z0, shadow };
}

/**
 * Whether a world position falls in a radio-shadow cell (nearest cell of the mask).
 * @param {{ stepM: number, cols: number, rows: number, x0: number, z0: number, shadow: Uint8Array }} mask
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function inRadioShadow(mask, x, z) {
  const c = Math.max(0, Math.min(mask.cols - 1, Math.round((x - mask.x0) / mask.stepM)));
  const r = Math.max(0, Math.min(mask.rows - 1, Math.round((z - mask.z0) / mask.stepM)));
  return mask.shadow[r * mask.cols + c] === 1;
}

/**
 * How much of a route is out of sight of the mast, tested every few metres with the exact line of sight (not the
 * mask), as the HUD's radio link would see it on the walk.
 * @param {object} grid
 * @param {Array<[number, number]>} path
 * @param {{ x: number, y?: number, z: number }} mast
 * @param {number} [stepM]
 * @returns {{ lengthM: number, shadowM: number, share: number, longestM: number } | null}
 *   longestM: the longest stretch walked without contact; null without a mast or a path
 */
export function radioShadowAlongPath(grid, path, mast, stepM = RADIO_PATH_STEP_M) {
  if (!finiteMast(mast) || !Array.isArray(path) || path.length < 2) return null;
  let lengthM = 0;
  let shadowM = 0;
  let run = 0;
  let longestM = 0;
  for (let k = 0; k < path.length - 1; k += 1) {
    const [ax, az] = path[k];
    const [bx, bz] = path[k + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(length / stepM));
    for (let s = 0; s < n; s += 1) {
      const t = (s + 0.5) / n;
      const piece = length / n;
      lengthM += piece;
      if (gridLineOfSight(grid, { x: ax + (bx - ax) * t, z: az + (bz - az) * t }, mast)) {
        run = 0;
      } else {
        shadowM += piece;
        run += piece;
        longestM = Math.max(longestM, run);
      }
    }
  }
  return { lengthM, shadowM, share: lengthM > 0 ? shadowM / lengthM : 0, longestM };
}
