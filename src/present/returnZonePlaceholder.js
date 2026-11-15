// PLACEHOLDER for src/sim/returnZone.js (feat/return-zone, #291 waits for it). Same call shape, not the same numbers:
// straight-line distances at the flat walking rate instead of Dijkstra over the cost grid. zoneFrames.js switches to the
// real module when it lands, and the presentation shows a "placeholder" tag while this file is in use.
import { metabolicPowerW, o2RateGs } from '../sim/suitModel.js';

export const SOURCE = 'placeholder';

const COARSE = 3;   // one zone cell per 3 x 3 grid nodes, about 5.7 m

/**
 * @param {object} grid buildCostGrid() result
 * @param {{ home: {x: number, z: number}, player: {x: number, z: number}, o2LeftG: number, constants: object,
 *   alert?: boolean, homeAllowance?: number }} options
 * @returns {{ n: number, cellX: number, cellZ: number, inside: Uint8Array, backG: number, marginSec: number }}
 */
export function computeReturnZone(grid, { home, player, o2LeftG, constants: c, alert = false, homeAllowance = 1.1 }) {
  const n = Math.floor((grid.n - 1) / COARSE) + 1;
  const cellX = grid.width / (n - 1), cellZ = grid.depth / (n - 1);
  const rate = o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);
  const gPerM = rate / c.speedFlat, padG = gPerM * (1 + c.walkbackPad), reserveG = rate * c.reserveSec;
  const inside = new Uint8Array(n * n);
  const playerHome = Math.hypot(player.x - home.x, player.z - home.z);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gi = Math.min(grid.n - 1, i * COARSE), gj = Math.min(grid.n - 1, j * COARSE);
    if (grid.blocked[gj * grid.n + gi]) continue;
    const x = -grid.width / 2 + i * cellX, z = -grid.depth / 2 + j * cellZ;
    const out = Math.hypot(x - player.x, z - player.z), back = Math.hypot(x - home.x, z - home.z);
    inside[j * n + i] = alert
      ? (out + back <= playerHome * homeAllowance ? 1 : 0)
      : (out * gPerM + back * padG + reserveG <= o2LeftG ? 1 : 0);
  }
  const backG = playerHome * padG;
  return { n, cellX, cellZ, inside, backG, marginSec: (o2LeftG - backG - reserveG) / rate };
}
