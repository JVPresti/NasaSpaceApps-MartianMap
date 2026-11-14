import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Server rendering reads the store's initial state, so the mock store starts with a planned route.
vi.mock('../state/store.js', async () => {
  const { create } = await import('zustand');
  const { createInitialState } = await vi.importActual('../state/store.js');
  const leg = (from, to, d) => ({
    from, to, distanceM: d, climbM: 4, descentM: 33, maxSlopeDeg: 13.2, timeSec: 378,
    o2G: 15, o2Pct: 2.0, batteryWh: 12, batteryPct: 1.6,
  });
  const base = createInitialState();
  const terrain = { tag: 'DERIVED', source: 'planner path on the HiRISE height map' };
  const suit = { tag: 'SIM', source: 'suit model' };
  const state = {
    ...base,
    route: {
      ...base.route,
      path: [[520, 600], [0, 0]],
      distanceM: 955, climbM: 25, steepestSlopeDeg: 20, etaSec: 1170,
      legs: [leg('HAB', 'WP1 · channel floor', 377), leg('WP1 · channel floor', 'Cheyava Falls', 578)],
      totals: {
        distanceM: 955, climbM: 35, descentM: 58, maxSlopeDeg: 16.8, timeSec: 1164,
        o2G: 47, o2Pct: 6.1, batteryWh: 37, batteryPct: 4.9,
        roundTrip: false, returnTimeSec: 1338, returnO2G: 65,
        arrivalO2Pct: 86, arrivalBatteryPct: 89, marginSec: 14568, status: 'nominal',
      },
      skipped: ['WP2 · dune field edge'],
    },
    sources: {
      'route.distanceM': terrain, 'route.climbM': terrain, 'route.steepestSlopeDeg': terrain, 'route.etaSec': terrain,
      'route.totals.o2G': suit, 'route.totals.batteryWh': suit, 'route.totals.marginSec': suit,
      'route.legs.distanceM': terrain, 'route.legs.climbM': terrain, 'route.legs.maxSlopeDeg': terrain,
      'route.legs.timeSec': suit, 'route.legs.o2G': suit, 'route.legs.batteryWh': suit,
    },
  };
  return { useMissionStore: create(() => state), setRouteDecision: vi.fn() };
});

const { default: RoutePanel } = await import('./RoutePanel.jsx');

const planner = { status: 'ready', error: null, replan: () => {} };
const waypoints = [{ name: 'HAB', x: 520, z: 600 }, { name: 'Cheyava Falls', x: 0, z: 0 }];
const html = renderToStaticMarkup(<RoutePanel planner={planner} waypoints={waypoints} onWaypointsChange={() => {}} />);
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('merged route panel', () => {
  it('shows the summary before the per-leg table', () => {
    expect(html.indexOf('route-metrics')).toBeLessThan(html.indexOf('legs-table'));
    for (const label of ['Distance', 'Climb', 'Steepest', 'Walk out', 'O2 out', 'Battery out']) expect(text).toContain(label);
    expect(text).toContain('0.95 km');
    expect(text).toContain('47 g 6.1 %');
  });

  it('gives go / no-go its reason from the oxygen margin', () => {
    expect(text).toContain('Margin 242.8 min over the 30 min reserve');
    expect(text).toContain('Walk home 22.3 min');
    expect(text).toContain('Skipped: WP2 · dune field edge');
    expect(html).toContain('margin-nominal');
  });

  it('keeps one row per leg plus the total, with units and source tags', () => {
    expect(html.match(/<tr/g)).toHaveLength(2 + 2 + 1);   // two header rows, two legs, total
    expect(text).toContain('Total out');
    expect(text).toContain('+35 / −58');
    expect(html.match(/src-tag-derived/g).length).toBeGreaterThanOrEqual(5);
    expect(html.match(/src-tag-sim/g).length).toBeGreaterThanOrEqual(4);
    for (const unit of ['km', 'min', 'Wh']) expect(html).toContain(`class="unit">${unit}<`);
  });

  it('folds the waypoint editor away by default and leaves the leg table open', () => {
    expect(html).toMatch(/<details class="plan-disclosure" open="">\s*<summary>Cost per leg/);
    expect(html).toMatch(/<details class="plan-disclosure"><summary>Waypoints/);
  });
});
