import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetStore, useMissionStore } from '../state/store.js';
import { createRouteProgress } from './minimapRoute.js';
import Hud from './Hud.jsx';

// Render the current mission snapshot in SSR (Zustand normally uses the creation-time state), as interface.test.jsx does.
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore),
  };
});

afterEach(() => resetStore());

const WAYPOINTS = [{ name: 'HAB', x: 535, z: 574 }, { name: 'S1', x: 580, z: 560 }];
const walking = () => useMissionStore.setState((s) => ({
  mode: 'walk',
  route: { ...s.route, waypoints: WAYPOINTS, path: [[535, 574], [580, 560]], nextIndex: 1, visited: ['HAB'] },
  navigation: { ...s.navigation, x: 541, z: 582, trueX: 541, trueZ: 582, headingDeg: 140 },
}));
const engine = (cabin) => ({ inHabitatCabin: () => cabin, project: () => null });
const render = (e) => renderToStaticMarkup(<Hud engine={e} minimapRoute={createRouteProgress()} />);

describe('the visor HUD and the habitat table (#244)', () => {
  it('shows the next waypoint outside the cabin', () => {
    walking();
    const html = render(engine(false));
    expect(html).toContain('hud-waypoint');
    expect(html).toContain('hud-wp-marker');
    expect(html).toContain('S1');
  });

  it('leaves the centre to the table prompt in the cabin: no next-waypoint panel or marker, the rest of the HUD stays', () => {
    walking();
    const html = render(engine(true));
    expect(html).not.toContain('hud-waypoint');
    expect(html).not.toContain('hud-wp-marker');
    for (const panel of ['hud-suit', 'hud-sampling', 'hud-env', 'hud-heading']) expect(html).toContain(panel);
  });
});
