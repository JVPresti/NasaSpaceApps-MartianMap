import { useEffect, useState } from 'react';
import { returnZoneService } from '../state/returnZone.js';

/**
 * The latest return zone (src/state/returnZone.js) for a React component, or null until the first one. `on` false
 * leaves the service alone, so a map that does not show the zone does not start the worker.
 * @param {boolean} [on]
 */
export function useReturnZone(on = true) {
  const [zone, setZone] = useState(() => (on ? returnZoneService().get() : null));
  useEffect(() => (on ? returnZoneService().subscribe(setZone) : undefined), [on]);
  return on ? zone : null;
}

/** Framing step, metres: the zone's box is rounded out to it, so a zone that shifts a few metres keeps the same view. */
export const ZONE_FRAME_STEP_M = 50;

/**
 * The part of a zone a map's fit frames, as a string that only changes when the framing should: the box of the plan's
 * zone (kind 'plan', bounded by a crew plan) rounded out to ZONE_FRAME_STEP_M. A live zone and the suit-limit
 * fallback (the whole tile) give '': the map then frames the route as before, and never zooms out to the whole tile.
 * @param {object | null} zone
 * @returns {string}
 */
export function zoneFrameKey(zone) {
  const b = zone?.stats?.bounds;
  if (!b || zone.kind !== 'plan' || !zone.inputs?.planned) return '';
  const s = ZONE_FRAME_STEP_M;
  return [Math.floor(b.minX / s) * s, Math.floor(b.minZ / s) * s, Math.ceil(b.maxX / s) * s, Math.ceil(b.maxZ / s) * s].join(',');
}

/**
 * The two corners of a zoneFrameKey, for the map's fit; none for ''.
 * @param {string} key
 * @returns {Array<{ x: number, z: number }>}
 */
export function zoneFramePoints(key) {
  if (!key) return [];
  const [x0, z0, x1, z1] = key.split(',').map(Number);
  return [{ x: x0, z: z0 }, { x: x1, z: z1 }];
}
