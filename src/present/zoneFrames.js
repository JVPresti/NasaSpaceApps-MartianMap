// The walkback zone clip for the presentation's hero beat (#291), computed by the app's own module,
// src/sim/returnZone.js (#335), so the presentation and the mission table draw the same zone.
//
// Only scripts/present/build-plan.mjs imports this file, offline; the browser reads the result from plan.json. The
// script loads src/sim/returnZone.js (#335) itself and passes it in as `zoneModule`, so this file imports nothing
// that may be missing: without #335 the script stops with a message naming it, and the committed plan.json stays.
//
// The scenario is the first mission (#282): the first sortie plans 30 min, and 25.5 min is usable after the standard
// 15 % reserve (route.budget.usableSec). That planned time, not the 8 h suit limit, bounds the zone. The crew walks
// 55 m to the sortie stop and works there while the clock runs; then the radiation alert sends them home. From then on
// the modifiers are the ones zoneModifiers builds for the alert: homeward, and the shelter window (the time to the
// event's dose peak, shelterWindowSec) shrinking as the alert runs. Frame times are our scenario (SIM): the clock is
// compressed so the zone visibly tightens.
//
// Each frame is one computeReturnZone call. The clip is stored as one byte per zone node, `last`: the last frame
// (1-based) the node is inside or on the edge. A node that leaves never comes back, so the browser draws frame f as
// last > f with one texture.
//
// Plain JavaScript, no three.js and no DOM: scripts/present/build-plan.mjs runs it in Node.
export const ZONE_SOURCE = 'returnZone';

/** The first sortie (#282): planned minutes, the standard reserve share and its stop (stops.json route_stops "sortie"). */
export const SORTIE = Object.freeze({ timeMin: 30, reserveShare: 0.15, stop: Object.freeze({ x: 493, z: 539, name: 'S1 · light-toned patch' }) });

/**
 * @param {{ grid: object, hab: {x: number, z: number}, constants: object,
 *   scenario: { framesOut: number, framesHome: number, speFrame: number, arriveFrame: number, alertAtSec: number,
 *     o2G: number, windowSec: number | null } }} input
 *   windowSec: the radiation event's shelter window, shelterWindowSec(src/sim/events/radiation.json)
 *   zoneModule: src/sim/returnZone.js, or a stand-in with computeReturnZone, zoneMarginAt and ZONE_STATE
 */
export function buildZoneFrames({ grid, hab, constants: c, scenario: s, zoneModule }) {
  const { computeReturnZone: compute, zoneMarginAt, ZONE_STATE } = zoneModule;
  const usableSec = SORTIE.timeMin * 60 * (1 - SORTIE.reserveShare);
  const stop = SORTIE.stop;
  const total = s.framesOut + s.framesHome;
  const walkSec = Math.hypot(stop.x - hab.x, stop.z - hab.z) / c.speedFlat;
  let last = null, alive = null, shape = null;
  const frames = [];
  for (let f = 0; f < total; f++) {
    const spe = f >= s.speFrame;
    let elapsedSec, pos;
    if (!spe) {
      elapsedSec = s.alertAtSec * f / (s.speFrame - 1);
      const u = Math.min(1, f / s.arriveFrame);
      pos = { x: hab.x + (stop.x - hab.x) * u, z: hab.z + (stop.z - hab.z) * u };
    } else {
      const u = Math.min(1, (f - s.speFrame) / (s.framesHome - 1));
      elapsedSec = s.alertAtSec + walkSec * u;
      pos = { x: stop.x + (hab.x - stop.x) * u, z: stop.z + (hab.z - stop.z) * u };
    }
    const modifiers = spe
      ? { homeward: true, shelterWithinSec: Number.isFinite(s.windowSec) ? Math.max(0, s.windowSec - (elapsedSec - s.alertAtSec)) : undefined }
      : {};
    const z = compute({ grid, home: hab, from: pos, suit: { o2G: s.o2G, elapsedSec }, constants: c, evaLimitSec: usableSec, modifiers });
    if (!last) { last = new Uint8Array(z.cols * z.rows); alive = new Uint8Array(z.cols * z.rows).fill(1); shape = z; }
    let count = 0;
    for (let x = 0; x < last.length; x++) {
      if (z.state[x] !== ZONE_STATE.OUTSIDE && alive[x]) { last[x] = f + 1; count++; } else alive[x] = 0;
    }
    const margin = zoneMarginAt(z, pos.x, pos.z);
    frames.push({
      x: +pos.x.toFixed(1), z: +pos.z.toFixed(1), elapsedSec: Math.round(elapsedSec),
      marginMin: Number.isFinite(margin) ? Math.max(0, Math.round(margin / 60)) : 0,
      areaHa: +(count * z.dx * z.dz / 1e4).toFixed(1), reachM: Math.round(z.stats.reachM), limit: z.stats.limit, spe,
    });
  }
  return {
    source: ZONE_SOURCE, scenario: { ...s, plannedMin: SORTIE.timeMin, usableMin: +(usableSec / 60).toFixed(1), stop, tag: 'SIM' },
    cols: shape.cols, rows: shape.rows, x0: shape.x0, z0: shape.z0, dx: +shape.dx.toFixed(4), dz: +shape.dz.toFixed(4),
    frames, last,
  };
}
