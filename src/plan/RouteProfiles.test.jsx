import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/index.js';

// Server rendering reads the store's initial state, so the mock store starts with three planned profiles, the
// gentlest in use.
vi.mock('../state/store.js', async () => {
  const { create } = await import('zustand');
  const { createInitialState } = await vi.importActual('../state/store.js');
  const base = createInitialState();
  const profile = (id, d, t, o2, steep, over, shadow) => ({
    id, ok: true, path: [[0, 0], [d, 0]], distanceM: d, climbM: 30, steepestSlopeDeg: steep, overCautionM: over,
    timeSec: t, o2G: o2, shadowShare: shadow,
  });
  const profiles = {
    fastest: profile('fastest', 913, 1110, 44.8, 19.8, 151, 0.491),
    gentlest: profile('gentlest', 938, 1128, 45.4, 19.8, 104, 0.53),
    radio: { id: 'radio', ok: false, reason: 'no-mast' },
  };
  const terrain = { tag: 'DERIVED', source: 'HiRISE' };
  const suit = { tag: 'SIM', source: 'suit model' };
  const state = {
    ...base,
    route: { ...base.route, profiles, profile: 'gentlest', path: profiles.gentlest.path },
    sources: {
      'route.profiles.distanceM': terrain, 'route.profiles.timeSec': suit, 'route.profiles.weights': { tag: 'SIM', source: 'ours' },
    },
  };
  return { useMissionStore: create(() => state), chooseRouteProfile: vi.fn() };
});

const { default: RouteProfiles } = await import('./RouteProfiles.jsx');
const render = (props) => renderToStaticMarkup(<RouteProfiles {...props} />);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => setLanguage('en'));

describe('route profiles panel (#245)', () => {
  it('shows one column per profile, the one in use pressed', () => {
    const html = render();
    expect(html.match(/class="profiles-pick/g)).toHaveLength(3);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Gentlest/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*?Fastest/);
    expect(html).toContain('profile-swatch profile-gentlest');
  });

  it('compares distance, steepest slope, steep ground, radio shadow, time and oxygen', () => {
    const t = text(render());
    for (const label of ['Distance', 'Steepest', 'Over 15°', 'No radio', 'Walk out', 'Oxygen']) expect(t).toContain(label);
    expect(t).toContain('0.91');
    expect(t).toContain('0.94');
    expect(t).toContain('151');
    expect(t).toContain('104');
    expect(t).toContain('49');   // 49 % of the fastest route out of contact
    expect(t).toContain('19');   // 1110 s, rounded up to the minute like the route panel
  });

  it('carries source tags for the terrain and suit-model rows and the profile weights', () => {
    const html = render();
    expect(html.match(/src-tag-derived/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html.match(/src-tag-sim/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('says why the radio profile has no route yet and does not offer it', () => {
    const html = render();
    expect(text(html)).toContain('Waiting for the habitat');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Radio/);
  });

  it('locks the choice once the EVA has begun', () => {
    const html = render({ locked: true });
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(text(html)).toContain('chosen before the EVA began');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const t = text(render());
    for (const label of ['Rápida', 'Suave', 'Sin radio', 'Ida a pie', 'Esperando al hábitat']) expect(t).toContain(label);
  });
});
