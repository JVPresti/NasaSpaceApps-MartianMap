import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { decisionFor } from './decision.js';

afterEach(() => setLanguage('en'));

const ready = { status: 'ready', error: null };
const nominal = { status: 'nominal' };

describe('go / no-go', () => {
  it('goes with a nominal margin, a plan that fits and clear air', () => {
    const d = decisionFor({ planner: ready, totals: nominal, budget: { fits: true }, dust: { tau: 0.45, limit: 1 } });
    expect(d).toMatchObject({ go: true, tone: 'ok', reason: 'go' });
  });

  it('waits while there is no route cost yet', () => {
    expect(decisionFor({ planner: { status: 'planning' }, totals: null })).toMatchObject({ go: false, reason: 'planning', tone: null });
  });

  it('is a no-go when the planner failed or the route uses the reserve', () => {
    expect(decisionFor({ planner: { status: 'error', error: null }, totals: null })).toMatchObject({ go: false, reason: 'error' });
    expect(decisionFor({ planner: ready, totals: { status: 'warning' } })).toMatchObject({ go: false, reason: 'reserve' });
  });

  it('is a no-go when the plan is over the crew\'s time, oxygen or battery, with the reason', () => {
    const time = decisionFor({ planner: ready, totals: nominal, budget: { fits: false, limit: 'time', usedSec: 4560, usableSec: 3060 } });
    expect(time).toMatchObject({ go: false, reason: 'budget', tone: 'warning' });
    expect(time.text).toContain('1 h 16 min of the 51 min you can use');
    expect(decisionFor({ planner: ready, totals: nominal, budget: { fits: false, limit: 'o2' } }).text).toMatch(/oxygen margin/);
    expect(decisionFor({ planner: ready, totals: nominal, budget: { fits: false, limit: 'battery' } }).text).toMatch(/battery/);
  });

  it('is a no-go when the dust opacity is above the terrain-fix limit (#248)', () => {
    const d = decisionFor({ planner: ready, totals: nominal, budget: { fits: true }, dust: { tau: 1.4, limit: 1 } });
    expect(d).toMatchObject({ go: false, reason: 'dust', tone: 'warning' });
    expect(d.text).toContain('τ 1.4');
    expect(d.text).toContain('τ 1.0');
    expect(decisionFor({ planner: ready, totals: nominal, dust: { tau: 1, limit: 1 } }).go).toBe(true);
  });

  it('goes with care on a small margin', () => {
    expect(decisionFor({ planner: ready, totals: { status: 'caution' } })).toMatchObject({ go: true, tone: 'caution' });
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const d = decisionFor({ planner: ready, totals: nominal, dust: { tau: 2, limit: 1 } });
    expect(d.title).toBe('No salir');
    expect(d.text).toContain('τ 2,0');
  });
});
