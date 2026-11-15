import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/index.js';

// The mission table during the EVA, rendered from a store snapshot each test sets (server rendering reads it once).
const mock = vi.hoisted(() => ({ state: null }));
vi.mock('../state/store.js', async () => {
  const actual = await vi.importActual('../state/store.js');
  return { ...actual, useMissionStore: (selector) => selector(mock.state) };
});

const { createInitialState } = await vi.importActual('../state/store.js');
const { default: MissionTable } = await import('./MissionTable.jsx');

const STOP = 'S1 · light-toned patch';
const waypoints = [{ name: 'HAB', x: 535, z: 574 }, { name: STOP, label: 'Light-toned patch', x: 493, z: 539, stopId: 'sortie', workSec: 120 }];
const planPath = [[535, 574], [493, 539]];
const homePath = [[500, 548], [535, 574]];   // the storm's route home, 44 m
const shelter = { id: 'HAB', name: 'HAB · habitat airlock', x: 535, z: 574 };

/** The first sortie under way: the plan approved at Begin EVA, then the route as the test says. */
function evaState(route = {}, eva = {}, navigation = {}) {
  const base = createInitialState();
  return {
    ...base,
    needs: { ...base.needs, locked: true },
    route: { ...base.route, waypoints, path: planPath, distanceM: 55, etaSec: 172, legs: [{ from: 'HAB', to: STOP, distanceM: 55, timeSec: 172 }], ...route },
    eva: { ...base.eva, phase: 'active', plan: { path: planPath, waypoints, legs: [{ from: 'HAB', to: STOP, distanceM: 55, timeSec: 172, climbM: 0, maxSlopeDeg: 13 }], totals: null }, ...eva },
    navigation: { ...base.navigation, x: 500, z: 548, errorM: 1.5, ...navigation },
  };
}
const planner = { status: 'ready', error: null, replan: () => {}, mast: null };
const render = (state, tab = 'route', evaBegun = true) => {
  mock.state = state;
  return renderToStaticMarkup(<MissionTable planner={planner} waypoints={state.route.waypoints} evaBegun={evaBegun} initialTab={tab} />);
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => setLanguage('en'));

describe('mission table during the EVA', () => {
  it('turns Re-plan off while an event route leads to a shelter (B1)', () => {
    const storm = { shelter, path: homePath, distanceM: 44, etaSec: 50, skipped: [], reason: 'x (dust-storm)' };
    expect(render(evaState(storm))).toMatch(/<button[^>]*class="table-link"[^>]*disabled=""/);
    expect(render(evaState())).not.toMatch(/<button[^>]*class="table-link"[^>]*disabled=""/);
  });

  it('shows what is left to the shelter from where the crew is (Q3)', () => {
    const t = text(render(evaState({ shelter, path: homePath, distanceM: 44, etaSec: 50, reason: 'x (dust-storm)' }, {}, { x: 518, z: 561 })));
    expect(t).toContain('Habitat airlock · shelter 21 m');   // halfway along the 44 m route home
  });

  it('back at the habitat after the storm: the stop reads reached, no stale leg, and the crew is home (A1)', () => {
    // releaseHome cleared the shelter; route.legs are the leftover route home split at the plan's waypoints (44 m)
    const home = evaState({ shelter: null, path: homePath, distanceM: 44, etaSec: 50, visited: [STOP], skipped: [], legs: [{ from: 'HAB', to: STOP, distanceM: 44, timeSec: 50 }] }, { atHabitat: true });
    const t = text(render(home));
    expect(t).toContain('Light-toned patch reached');
    expect(t).not.toContain('44 m');
    expect(t).toContain('Back at the habitat: nothing of the plan remains.');
    expect(t).not.toContain('Planned out 1 ');
  });

  it('a stop skipped for the event reads skipped, and the note says Re-plan resumes it (D12)', () => {
    const t = text(render(evaState({ shelter: null, path: homePath, visited: [], skipped: [STOP] }, { atHabitat: true })));
    expect(t).toContain('Light-toned patch skipped');
    expect(t).toContain('Skipped: Light-toned patch. Re-plan resumes them.');
    expect(t).not.toContain('nothing of the plan remains');
  });

  it('before the stop the planned leg and what remains of the plan show', () => {
    const t = text(render(evaState()));
    expect(t).toContain('Light-toned patch 55 m');
    expect(t).toContain('0.06 km');
  });

  it('labels the suit at the habitat once the crew is back (Q4)', () => {
    expect(text(render(evaState({}, { atHabitat: true }), 'suit'))).toContain('Now, in the habitat');
    expect(text(render(evaState(), 'suit'))).toContain('Now, outside');
  });

  it('says which stop is the goal and which is kept because it fits, before the EVA (D13)', () => {
    const fastest = { id: 'fastest', ok: true, path: planPath };
    const plan = evaState({
      profiles: { fastest, gentlest: { ok: false }, radio: { ok: false } }, profile: 'fastest',
      waypoints: [waypoints[0], waypoints[1], { name: 'Cheyava Falls', label: 'Cheyava Falls', x: 0, z: 0, stopId: 'cheyava-falls', workSec: 1200 }],
      stops: [{ id: 'sortie', required: false }, { id: 'cheyava-falls', required: true }],
    });
    const t = text(render(plan, 'route', false));
    expect(t).toContain('On the way, fits your time');
    expect(t).toContain('Goal · 20 min work');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const t = text(render(evaState({ shelter: null, path: homePath, visited: [STOP] }, { atHabitat: true })));
    expect(t).toContain('Zona de tono claro alcanzada');
    expect(t).toContain('De vuelta en el hábitat: no queda nada del plan.');
  });
});
