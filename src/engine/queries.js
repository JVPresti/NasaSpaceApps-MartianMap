// Terrain queries: plain functions over the decoded height data. No three.js, no renderer, so tests can call them.
// Coordinates: x east, z south, y up, metres from Cheyava Falls. Heights are relative to the lowest point of the tile
// (terrain.json base_elev_m converts them to MOLA elevation).

export function bilinear(arr, n, fx, fy) {
  const x0 = Math.max(0, Math.min(n - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(n - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0)), i = y0 * n + x0;
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + n] * (1 - tx) + arr[i + n + 1] * tx) * ty;
}

/** Decodes terrain.json into the T object the engine uses: { n, W, H, h, dens, dn, base }. */
export function decodeTerrainJson(tj, decodeU16, decodeU8) {
  const u = decodeU16(tj.heights_u16_b64), h = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) h[i] = u[i] / 65535 * tj.range_m;
  return { n: tj.n, W: tj.width_m, H: tj.depth_m, h, dens: decodeU8(tj.density_u8_b64), dn: tj.density_n, base: tj.base_elev_m };
}

/** Decodes ring.json into { n, size, h }. */
export function decodeRingJson(rj, decodeU16) {
  const u = decodeU16(rj.heights_u16_b64), h = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) h[i] = rj.min_m + u[i] / 65535 * rj.range_m;
  return { n: rj.n, size: rj.size_m, h };
}

/**
 * @param {{ n: number, W: number, H: number, h: Float32Array }} T HiRISE tile (2 m grid)
 * @param {{ n: number, size: number, h: Float32Array } | null} RING CTX background (50 m grid), optional
 */
export function createHeightQueries(T, RING = null) {
  const inTile = (x, z) => Math.abs(x) <= T.W / 2 && Math.abs(z) <= T.H / 2;
  const tileH = (x, z) => bilinear(T.h, T.n, (x / T.W + 0.5) * (T.n - 1), (z / T.H + 0.5) * (T.n - 1));
  const ringH = (x, z) => RING ? bilinear(RING.h, RING.n, (x / RING.size + 0.5) * (RING.n - 1), (z / RING.size + 0.5) * (RING.n - 1)) : tileH(x, z);
  const groundH = (x, z) => inTile(x, z) ? tileH(x, z) : ringH(x, z);

  /** Terrain height in metres: the HiRISE tile inside it, the CTX ring outside. */
  const heightAt = (x, z) => groundH(x, z);

  /** Slope in degrees, central difference over 2 m each way (same as the test bench's route.slopeDeg). */
  function slopeAt(x, z) {
    const gx = (groundH(x + 2, z) - groundH(x - 2, z)) / 4, gz = (groundH(x, z + 2) - groundH(x, z - 2)) / 4;
    return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
  }

  /**
   * Is the straight line from a to b above the terrain? Samples every `step` metres.
   * A point without y is taken at eye height: ground + 1.7 m.
   * @returns {{ clear: boolean, blockedAt: { x: number, y: number, z: number } | null }}
   */
  function lineOfSight(a, b, { step = 2, eyeHeight = 1.7 } = {}) {
    const ay = a.y ?? groundH(a.x, a.z) + eyeHeight, by = b.y ?? groundH(b.x, b.z) + eyeHeight;
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, ground = groundH(x, z);
      if (ground > ay + (by - ay) * t) return { clear: false, blockedAt: { x, y: ground, z } };
    }
    return { clear: true, blockedAt: null };
  }

  return { inTile, tileH, ringH, groundH, heightAt, slopeAt, lineOfSight };
}
