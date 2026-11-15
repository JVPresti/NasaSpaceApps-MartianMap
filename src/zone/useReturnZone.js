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

/**
 * The corners of the zone's box (inside and edge), for a map's fit to frame the whole zone; none without a zone.
 * @param {object | null} zone
 * @returns {Array<{ x: number, z: number }>}
 */
export function zoneFramePoints(zone) {
  const b = zone?.stats?.bounds;
  return b ? [{ x: b.minX, z: b.minZ }, { x: b.maxX, z: b.maxZ }] : [];
}
