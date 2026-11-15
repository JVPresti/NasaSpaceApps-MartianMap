import { describe, expect, it } from 'vitest';
import { waypointKey } from '../plan/routePlan.js';
import { HABITAT_END_NAME, HABITAT_ROUTE_REASON, adoptHabitatRoute } from './habitatRoute.js';
import { createInitialState } from './store.js';

const base = () => ({
  ...createInitialState().route,
  waypoints: [
    { name: 'HAB', x: 0, z: 0 },
    { name: 'WP1 · channel floor', x: 100, z: 0 },
    { name: 'WP2 · Bright Angel', x: 200, z: 0 },
    { name: 'Cheyava Falls', x: 300, z: 0 },
  ],
  path: [[0, 0], [300, 0]],
  nextIndex: 1,
  visited: ['HAB'],
});
const straight = [[0, 0], [100, 0], [200, 0], [300, 0]];

describe('adoptHabitatRoute', () => {
  it('replaces the path, keeps the stops on it and records where it came from', () => {
    const { route, routeKey } = adoptHabitatRoute(base(), straight, { by: 'h1', at: 42 });
    expect(route.path).toEqual(straight);
    expect(route.waypoints.map((w) => w.name)).toEqual(['HAB', 'WP1 · channel floor', 'WP2 · Bright Angel', 'Cheyava Falls']);
    expect(route.origin).toEqual({ kind: 'habitat', by: 'h1', at: 42 });
    expect(route.reason).toBe(HABITAT_ROUTE_REASON);
    expect(route.distanceM).toBe(300);
    expect(route.nextIndex).toBe(1);
    expect(route.visited).toEqual(['HAB']);
    expect(routeKey).toBe(waypointKey(route.waypoints));
  });

  it('drops the stops the new path leaves out and ends at the path when no stop is there', () => {
    const detour = [[0, 0], [100, 2], [150, 120], [180, 200]];
    const { route } = adoptHabitatRoute(base(), detour, { by: 'h1', at: 1 });
    expect(route.waypoints).toEqual([{ name: 'HAB', x: 0, z: 0 }, { name: 'WP1 · channel floor', x: 100, z: 0 }, { name: HABITAT_END_NAME, x: 180, z: 200 }]);
  });

  it('orders the stops as the path passes them, not as they were listed', () => {
    const back = [[300, 0], [200, 0], [100, 0], [0, 0]];
    const { route } = adoptHabitatRoute(base(), back, { by: 'h1', at: 1 });
    expect(route.waypoints.map((w) => w.name)).toEqual(['Cheyava Falls', 'WP2 · Bright Angel', 'WP1 · channel floor', 'HAB']);
  });

  it('points ahead of the player: stops the path passes before the point nearest the player count as visited', () => {
    const fine = Array.from({ length: 31 }, (_, i) => [i * 10, 0]);
    const { route } = adoptHabitatRoute(base(), fine, { position: { x: 152, z: 4 }, by: 'h1', at: 1 });
    expect(route.waypoints[route.nextIndex].name).toBe('WP2 · Bright Angel');
    expect(route.visited).toEqual(['HAB', 'WP1 · channel floor']);
  });

  it('at the end of the path the target is the last stop', () => {
    const { route } = adoptHabitatRoute(base(), straight, { position: { x: 300, z: 0 }, by: 'h1', at: 1 });
    expect(route.nextIndex).toBe(3);
  });

  it('with no stops at all, the route is the path to its end', () => {
    const { route } = adoptHabitatRoute({ ...base(), waypoints: [] }, straight, { by: 'h1', at: 1 });
    expect(route.waypoints).toEqual([{ name: HABITAT_END_NAME, x: 300, z: 0 }]);
    expect(route.nextIndex).toBe(0);
  });
});
