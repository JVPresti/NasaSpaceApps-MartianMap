import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/index.js';

// The mission table before the EVA, rendered from a store snapshot each test sets. The Route step is where the crew
// decides, so it carries the verdict and the whole EVA time, and the Suit step's time head uses the same total (#341).
const mock = vi.hoisted(() => ({ state: null }));
vi.mock('../state/store.js', async () => {
  const actual = await vi.importActual('../state/store.js');
  return { ...actual, useMissionStore: (selector) => selector(mock.state) };
});

const { createInitialState } = await vi.importActual('../state/store.js');
const { default: MissionTable } = await import('./MissionTable.jsx');

const STOP = 'S1 · light-toned patch';
const waypoints = [
  { name: 'HAB', x: 535, z: 574 },
  { name: STOP, label: 'Light-toned patch', x: 493, z: 539, stopId: 'sortie', workSec: 120 },
];
const planPath = [[535, 574], [493, 539]];
// The first sortie: 3 min out with 2 min of work at the stop, 1 min back, so the whole EVA is 4 min.
const TOTALS = {
  distanceM: 55, climbM: 6, descentM: 4, maxSlopeDeg: 13, timeSec: 172, workSec: 120,
  o2G: 12, o2Pct: 1.6, batteryWh: 9, batteryPct: 1.2,
  roundTrip: false, returnTimeSec: 50, returnO2G: 4,
  arrivalO2Pct: 96, arrivalBatteryPct: 97, marginSec: 14568, status: 'nominal',
};

/** The plan on the table: the first sortie, with the totals the test overrides. */
function planState(totals = {}) {
  const base = createInitialState();
  return {
    ...base,
    route: {
      ...base.route,
      waypoints, path: planPath, distanceM: 55, etaSec: 172,
      legs: [{ from: 'HAB', to: STOP, distanceM: 55, timeSec: 172, climbM: 6, maxSlopeDeg: 13 }],
      totals: { ...TOTALS, ...totals },
    },
  };
}

const planner = { status: 'ready', error: null, replan: () => {}, mast: null };
const render = (state, tab) => {
  mock.state = state;
  return renderToStaticMarkup(<MissionTable planner={planner} waypoints={waypoints} initialTab={tab} />);
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

afterEach(() => setLanguage('en'));

describe('the Route step before the EVA (#341)', () => {
  it('says the verdict in its head, as the Suit step does', () => {
    expect(text(render(planState(), 'route'))).toContain('Route Go');
  });

  it('names the whole EVA, not just the walk out, and splits it under the numbers', () => {
    const route = text(render(planState(), 'route'));
    expect(route).toContain('4 min EVA total');
    expect(route).not.toContain('Planned out');
    expect(route).toContain('3 out, 2 min of it work');
    expect(route).toContain('1 back');
  });

  it('shows the same EVA total on the Route step and on the Suit step', () => {
    const route = text(render(planState(), 'route')).match(/(\d+) min EVA total/);
    const suit = text(render(planState(), 'suit')).match(/Time (\d+) min EVA total/);
    expect(route?.[1]).toBe('4');
    expect(suit?.[1]).toBe(route?.[1]);
  });

  it('says no-go in the same head when the plan uses the oxygen reserve', () => {
    const route = text(render(planState({ status: 'warning', marginSec: 900 }), 'route'));
    expect(route).toContain('Route No-go');
    expect(route).toContain('The route uses the oxygen reserve');
  });

  it('names the plan margin, its binding limit and the other limit beside it (#323)', () => {
    const suit = text(render(planState({ marginSec: 239 * 60, o2MarginSec: 239 * 60, evaMarginSec: 426 * 60, marginLimit: 'o2' }), 'suit'));
    expect(suit).toContain('+239 min');
    expect(suit).toContain('Margin at the end of the plan · O2');
    expect(suit).toContain('The other limit: EVA clock +426 min');
  });

  it('says the EVA clock sets the plan margin when that limit is tighter (#323)', () => {
    const suit = text(render(planState({ marginSec: 120 * 60, o2MarginSec: 300 * 60, evaMarginSec: 120 * 60, marginLimit: 'eva' }), 'suit'));
    expect(suit).toContain('+120 min');
    expect(suit).toContain('Margin at the end of the plan · EVA clock');
    expect(suit).toContain('The other limit: O2 +300 min');
  });

  it('leaves the step as it was once the EVA has begun', () => {
    const state = planState();
    state.eva = {
      ...state.eva,
      phase: 'active',
      plan: { path: planPath, waypoints, legs: [{ from: 'HAB', to: STOP, distanceM: 55, timeSec: 172, climbM: 6, maxSlopeDeg: 13 }], totals: null },
    };
    mock.state = state;
    const eva = text(renderToStaticMarkup(<MissionTable planner={planner} waypoints={waypoints} initialTab="route" evaBegun />));
    expect(eva).not.toContain('EVA total');
    expect(eva).not.toContain('Route Go');
  });
});
