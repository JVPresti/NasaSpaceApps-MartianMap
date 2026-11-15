import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The store is mocked: the panel reads the saved list and calls the three actions.
vi.mock('../state/store.js', async () => {
  const { create } = await import('zustand');
  const list = [
    {
      id: 'route-1', name: 'Ridge', savedAtMs: 1000,
      waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'S1', x: 120, z: 40 }],
      path: [[0, 0], [30, 10], [120, 40]],
      distanceM: 628.4, climbM: 12.7,
      risk: { maxSlopeDeg: 16.2, climbM: 12.7, level: 'caution' },
      record: { attempts: 2, completed: 1, samples: 3, distanceM: 1200, doseUgy: 5, lastRunAtMs: 9000 },
    },
    {
      id: 'route-2', name: 'Valley', savedAtMs: 2000,
      waypoints: [{ name: 'HAB', x: 0, z: 0 }, { name: 'S2', x: 10, z: 10 }],
      path: [[0, 0], [5, 5], [10, 10]],
      distanceM: 14.1, climbM: 1.2,
      risk: { maxSlopeDeg: 21, climbM: 1.2, level: 'high' },
      record: { attempts: 0, completed: 0, samples: 0, distanceM: 0, doseUgy: null, lastRunAtMs: null },
    },
  ];
  return {
    useMissionStore: create(() => ({ routeLibrary: { list }, route: { path: [[0, 0], [1, 1]], manual: true }, sources: {} })),
    saveCurrentRoute: vi.fn(() => true),
    deleteSavedRoute: vi.fn(() => true),
    applySavedRoute: vi.fn(() => true),
  };
});

const { default: SavedRoutes } = await import('./SavedRoutes.jsx');

const html = renderToStaticMarkup(<SavedRoutes />);
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('saved routes panel (#357)', () => {
  it('shows each saved route with its plan, its risk band and its success record', () => {
    expect(text).toContain('Ridge');
    expect(text).toContain('caution');
    expect(text).toContain('2 stops · 0.63 km · +13 m · 16° steepest');
    expect(text).toContain('2 runs · 1 done · 3 samples · 1.20 km walked');
    expect(text).toContain('Valley');
    expect(text).toContain('high risk');
    expect(text).toContain('Not walked yet');
  });

  it('offers the name field with save, and load and delete on each route', () => {
    expect(html).toContain('Name this route');
    expect(html).toContain('Save route');
    expect(text.match(/Load/g)).toHaveLength(2);
    expect(text.match(/Delete/g)).toHaveLength(2);
  });

  it('says the plan follows the loaded route', () => {
    expect(text).toContain('changing a need below plans from the crew');
  });
});
