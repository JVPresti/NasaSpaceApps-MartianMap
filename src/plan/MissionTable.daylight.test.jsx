import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/index.js';

// The Suit step before the EVA, rendered from a store snapshot with a plan and the mission clock at the demo start.
// hazards.json is served straight from disk, as the browser would fetch it (the loader needs an effect).
const mock = vi.hoisted(() => ({ state: null }));
vi.mock('../state/store.js', async () => {
  const actual = await vi.importActual('../state/store.js');
  return { ...actual, useMissionStore: (selector) => selector(mock.state) };
});
const hazards = JSON.parse(readFileSync(new URL('../../public/data/hazards.json', import.meta.url), 'utf8'));
vi.mock('./useConditions.js', () => ({
  useDataFile: () => hazards,
  useDustAgainstLimit: () => null,
}));

const { createInitialState } = await vi.importActual('../state/store.js');
const { default: MissionTable } = await import('./MissionTable.jsx');

const waypoints = [{ name: 'HAB', x: 535, z: 574 }, { name: 'S1 · light-toned patch', x: 493, z: 539, workSec: 300 }];
const path = [[535, 574], [493, 539]];

/** The first sortie planned, the mission clock at the 17:45 egress. planSec is the walk out, the work and the walk back. */
function state({ timeSec = 420, returnTimeSec = 60, mission = {} } = {}) {
  const base = createInitialState();
  return {
    ...base,
    mission: { ...base.mission, initialLmst: '17:45', elapsedSec: 0, lmst: '17:45', ...mission },
    route: {
      ...base.route, waypoints, path, distanceM: 60, etaSec: timeSec, legs: [],
      totals: {
        timeSec, returnTimeSec, roundTrip: false, workSec: 300, o2G: 9, returnO2G: 2, batteryWh: 10, returnBatteryWh: 2,
        marginSec: 284 * 60, arrivalO2Pct: 96, arrivalBatteryWh: 0.98 * 1000, arrivalBatteryPct: 98, status: 'nominal',
      },
    },
  };
}
const planner = { status: 'ready', error: null, replan: () => {}, mast: null };
const render = (snapshot) => {
  mock.state = snapshot;
  return renderToStaticMarkup(<MissionTable planner={planner} waypoints={waypoints} initialTab="suit" />);
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => setLanguage('en'));

describe('the Suit step and daylight (#324)', () => {
  it('shows the minutes of daylight left against the plan, the sunset it counts to, and its DERIVED tag', () => {
    const t = text(render(state()));
    expect(t).toContain('Daylight');
    expect(t).toContain('22 min of daylight left');           // 29.9 min from 17:45 to 18:14, less the 8 min plan
    expect(t).toContain('Sunset 18:14 LMST, 30 min after the 17:45 egress; the plan takes 8 min.');
    expect(t).toContain('DERIVED');
    expect(t).toContain('Go');                               // the first sortie still fits the daylight
  });

  it('reads No-go and names the numbers when the plan would end after sunset', () => {
    const t = text(render(state({ timeSec: (19 + 35) * 60, returnTimeSec: 22 * 60 })));
    expect(t).toContain('No-go');
    expect(t).toContain('Not enough daylight: the Sun sets at 18:14 LMST, 30 min after the 17:45 egress, and the plan takes 1 h 16 min.');
    expect(t).toContain('The walk back would end 46 min after sunset.');
    expect(t).toContain('46 min past sunset');
    expect(t).toContain('DERIVED');
  });

  it('follows the mission clock: later at the table, less daylight', () => {
    // 600 Mars seconds are 584 s of LMST: the crew would go out at 17:54, with 12 min of daylight left over the plan
    const t = text(render(state({ mission: { initialLmst: '17:45', elapsedSec: 600, lmst: '17:54' } })));
    expect(t).toContain('12 min of daylight left');
    expect(t).toContain('20 min after the 17:54 egress');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const t = text(render(state()));
    expect(t).toContain('Luz del día');
    expect(t).toContain('min de luz restante');
    expect(t).toContain('Ocaso a las 18:14 LMST');
    expect(t).toContain('DERIVED');
  });
});
