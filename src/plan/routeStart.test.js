import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startAtAirlock } from './routeStart.js';
import { distanceToPath, OFF_ROUTE_DEFAULTS } from '../sim/offRoute.js';

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const route = read('../../public/marswalk/assets/route.json');
const shelters = read('../../public/data/shelters.json');
const entry = shelters.shelters.find((s) => s.id === 'HAB');

describe('route start at the airlock (#166)', () => {
  it('moves only the HAB waypoint to the airlock entry', () => {
    const list = startAtAirlock(route.waypoints, shelters);
    expect(list[0]).toEqual({ name: 'HAB', x: entry.x, z: entry.z });
    expect(list.slice(1)).toEqual(route.waypoints.slice(1));
  });

  it('keeps the route.json list when shelters.json is missing', () => {
    expect(startAtAirlock(route.waypoints, null)).toBe(route.waypoints);
  });

  it('keeps the airlock on the first leg, inside the off-route threshold', () => {
    const [hab, wp1] = startAtAirlock(route.waypoints, shelters);
    const leg = [[hab.x, hab.z], [wp1.x, wp1.z]];
    expect(distanceToPath(entry, leg)).toBeLessThan(1);
    // the old start at the HAB waypoint left the airlock beside the first leg, not on it
    const old = [[route.waypoints[0].x, route.waypoints[0].z], [wp1.x, wp1.z]];
    expect(distanceToPath(entry, old)).toBeGreaterThan(OFF_ROUTE_DEFAULTS.thresholdM);
  });
});
