// Slope-ahead zone (#69, #200) as a small mask texture for the terrain shader. Pure: no three.js, so it tests without a GPU.
// One texel per cell, texel centres on the cell centres, and at least one empty texel on every side so the shader's linear
// filter fades the edge to zero instead of clamping a lit border outward.

export const ZONE_TEXELS = 32;   // 32 x 32 cells of 3 m = 96 m, room for the 18 m radius from src/sim/slopeAhead.js

/**
 * @param {Array<{ x: number, z: number }> | null} cells cell centres on a regular grid
 * @param {number} cellM
 * @param {number} [n] texels per side
 * @returns {{ x0: number, z0: number, span: number, data: Uint8Array } | null} x0, z0 = world corner of texel (0, 0); span in metres
 */
export function zoneMask(cells, cellM, n = ZONE_TEXELS) {
  if (!Array.isArray(cells) || cells.length === 0 || !(cellM > 0)) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
  }
  // centre the cells in the texture: texel i covers [x0 + i * cellM, x0 + (i + 1) * cellM)
  const cols = Math.round((maxX - minX) / cellM) + 1, rows = Math.round((maxZ - minZ) / cellM) + 1;
  const x0 = minX - cellM / 2 - Math.floor((n - cols) / 2) * cellM;
  const z0 = minZ - cellM / 2 - Math.floor((n - rows) / 2) * cellM;
  const data = new Uint8Array(n * n);
  for (const c of cells) {
    const i = Math.floor((c.x - x0) / cellM), j = Math.floor((c.z - z0) / cellM);
    if (i < 1 || j < 1 || i > n - 2 || j > n - 2) continue;   // keep the empty border
    data[j * n + i] = 255;
  }
  return { x0, z0, span: n * cellM, data };
}
