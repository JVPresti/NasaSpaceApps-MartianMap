import { describe, expect, it } from 'vitest';
import { shallow } from 'zustand/shallow';
import { selectWaypoint, waypointPosition } from './waypointSelection.js';

const waypoints = [
  { name: 'WP1 · channel floor', x: 40, z: 0 },
  { name: 'Cheyava Falls', x: 0, z: 0 },
];

function state(overrides = {}) {
  return {
    route: { path: [[0, 0], [40, 0]], waypoints, nextIndex: 0, ...overrides.route },
    navigation: {
      x: 10.25,
      z: -3.5,
      slopeDeg: 4.2,
      waypointRangeM: null,
      waypointBearingDeg: null,
      ...overrides.navigation,
    },
  };
}

describe('next-waypoint selector', () => {
  it('returns plain values, so two reads of the same state are shallow equal', () => {
    const s = state();
    const a = selectWaypoint(s);
    const b = selectWaypoint(s);
    expect(a).not.toHaveProperty('position');
    expect(typeof a.px).toBe('number');
    expect(typeof a.pz).toBe('number');
    // This is the check that failed before #153: the nested position object made
    // useShallow treat every read as a change and re-rendered until React unmounted.
    expect(shallow(a, b)).toBe(true);
  });

  it('keeps the stable store references for the path and the waypoints', () => {
    const s = state();
    const a = selectWaypoint(s);
    expect(a.path).toBe(s.route.path);
    expect(a.waypoints).toBe(s.route.waypoints);
  });

  it('builds the marker position outside the selector', () => {
    const a = selectWaypoint(state());
    expect(waypointPosition(a)).toEqual({ x: 10.25, z: -3.5 });
    expect(waypointPosition(null)).toBeNull();
  });

  it('returns null without a route or a navigation fix', () => {
    expect(selectWaypoint({ route: { waypoints: [] }, navigation: { x: null, z: null } })).toBeNull();
    expect(selectWaypoint(state({ route: { waypoints: [] } }))).toBeNull();
    expect(selectWaypoint(state({ navigation: { x: null } }))).toBeNull();
  });
});
