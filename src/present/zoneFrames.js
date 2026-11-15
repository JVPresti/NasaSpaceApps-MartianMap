// The walkback zone clip for the presentation's hero beat (#291), built from the app's own zone module.
//
// Each frame is one call to computeReturnZone with the astronaut's position along the planned route and the O2 left.
// Frames 0 to speFrame - 1 walk out and drain O2; from speFrame the radiation alert holds the zone to the walk home.
// The result is stored as one byte per cell, `last`: the last frame (1-based) the cell is still inside. A cell that
// leaves the zone never comes back, so the browser draws frame f as last > f with one texture.
//
// Plain JavaScript, no three.js and no DOM: scripts/present/build-plan.mjs runs it in Node.
import { metabolicPowerW, o2RateGs, walkCost } from '../sim/suitModel.js';
import * as zoneModule from './returnZonePlaceholder.js';   // becomes '../sim/returnZone.js' when feat/return-zone lands

export const ZONE_SOURCE = zoneModule.SOURCE || 'returnZone';

/**
 * Positions along a path where o grams of O2 have been spent walking it at the nominal rate.
 * @returns {(o: number) => [number, number]}
 */
export function pointAtO2(path, heightAt, c) {
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + walkCost([path[k - 1], path[k]], heightAt, c, { pad: 0 }).o2G);
  const at = (o) => {
    for (let k = 1; k < path.length; k++) if (cum[k] >= o) {
      const u = (o - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
      return [path[k - 1][0] + (path[k][0] - path[k - 1][0]) * u, path[k - 1][1] + (path[k][1] - path[k - 1][1]) * u];
    }
    return path[path.length - 1];
  };
  at.total = cum[cum.length - 1];
  return at;
}

/**
 * @param {{ grid: object, path: Array<[number, number]>, hab: {x: number, z: number}, constants: object,
 *   heightAt: (x: number, z: number) => number,
 *   scenario: { o2StartG: number, framesOut: number, framesHome: number, speFrame: number, outShare: number } }} input
 */
export function buildZoneFrames({ grid, path, hab, constants: c, heightAt, scenario: s, compute = zoneModule.computeReturnZone }) {
  const at = pointAtO2(path, heightAt, c);
  const rate = o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);
  const total = s.framesOut + s.framesHome;
  let spent = 0, along = 0, pos = [hab.x, hab.z];
  let last = null, alive = null, meta = null;
  const frames = [];
  for (let f = 0; f < total; f++) {
    const spe = f >= s.speFrame;
    if (!spe) {
      along = at.total * s.outShare * f / (s.speFrame - 1);
      spent = along; pos = at(along);
    } else if (f > s.speFrame) {
      const next = Math.max(0, along - along / (total - f)), np = at(next);
      spent += walkCost([pos, np], heightAt, c).o2G; along = next; pos = np;
    }
    const o2Left = s.o2StartG - spent;
    const z = compute(grid, { home: hab, player: { x: pos[0], z: pos[1] }, o2LeftG: o2Left, constants: c, alert: spe });
    if (!last) { last = new Uint8Array(z.n * z.n); alive = new Uint8Array(z.n * z.n).fill(1); meta = z; }
    let count = 0;
    for (let x = 0; x < last.length; x++) {
      if (z.inside[x] && alive[x]) { last[x] = f + 1; count++; } else alive[x] = 0;
    }
    frames.push({
      x: +pos[0].toFixed(1), z: +pos[1].toFixed(1), o2Left: Math.round(o2Left),
      backG: +z.backG.toFixed(1), marginMin: Math.round(z.marginSec / 60),
      areaHa: +(count * meta.cellX * meta.cellZ / 1e4).toFixed(1), spe,
    });
  }
  return {
    source: ZONE_SOURCE, scenario: { ...s, tag: 'SIM' }, n: meta.n, cellX: +meta.cellX.toFixed(3), cellZ: +meta.cellZ.toFixed(3),
    reserveG: +(rate * c.reserveSec).toFixed(1), frames, last,
  };
}
