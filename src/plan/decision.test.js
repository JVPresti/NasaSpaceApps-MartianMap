import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { decisionFor, liveSuitStatus, startSuitStatus } from './decision.js';

afterEach(() => setLanguage('en'));

const ready = { status: 'ready', error: null };
const nominal = { status: 'nominal' };
const ok = (id, spareSec, extra = {}) => ({ id, ok: true, spareSec, ...extra });
const limitsOf = ({ time = ok('time', 1080), o2 = ok('o2', 17040, { marginSec: 17040, floorSec: 0 }), battery = ok('battery', 20000) } = {}) => {
  const all = [time, o2, battery].filter(Boolean).sort((a, b) => a.spareSec - b.spareSec);
  const failing = all.find((limit) => !limit.ok) ?? null;
  return { time, o2, battery, failing, tightest: all[0], status: failing ? 'warning' : all[0].spareSec < 900 ? 'caution' : 'ok' };
};

describe('go / no-go (P1)', () => {
  it('goes, naming the tightest limit with its figure', () => {
    const d = decisionFor({ planner: ready, totals: nominal, limits: limitsOf(), dust: { tau: 0.45, limit: 1 } });
    expect(d).toMatchObject({ go: true, tone: 'ok', reason: 'go', limit: 'time' });
    expect(d.text).toContain('Tightest limit: time, 18 min to spare.');
    expect(d.text).not.toMatch(/wide margin/);
  });

  it('goes with care when the tightest limit has little left, whichever it is', () => {
    const d = decisionFor({ planner: ready, totals: nominal, limits: limitsOf({ time: ok('time', 120) }) });
    expect(d).toMatchObject({ go: true, tone: 'caution', limit: 'time' });
    expect(d.text).toContain('time, 2 min to spare');
  });

  it('waits while there is no route cost yet, and says the planner failed', () => {
    expect(decisionFor({ planner: { status: 'planning' }, totals: null })).toMatchObject({ go: false, reason: 'planning', tone: null });
    expect(decisionFor({ planner: { status: 'error', error: null }, totals: null })).toMatchObject({ go: false, reason: 'error' });
  });

  it('is a time no-go with the shortfall and the way out (P10)', () => {
    const time = { id: 'time', ok: false, spareSec: -1500, usedSec: 3960, usableSec: 2250, availableSec: 3000, reservePct: 25, needMin: 90 };
    const d = decisionFor({ planner: ready, totals: nominal, limits: limitsOf({ time }), objective: 'cheyava' });
    expect(d).toMatchObject({ go: false, tone: 'warning', reason: 'time', limit: 'time' });
    expect(d.text).toContain('the plan needs 1 h 6 min, and you can use 38 min (50 min less the 25 % reserve)');
    expect(d.text).toContain('Set the time to at least 1 h 30 min, or choose the First sortie.');
  });

  it('is an oxygen no-go into the reserve, with the O2 at the start that fits, never "shorten it"', () => {
    const o2 = { id: 'o2', ok: false, spareSec: -300, marginSec: -300, floorSec: 0, arrivalPct: -6, needPct: 37 };
    const d = decisionFor({ planner: ready, totals: { status: 'warning' }, limits: limitsOf({ o2 }), objective: 'sortie' });
    expect(d).toMatchObject({ go: false, reason: 'o2' });
    expect(d.text).toBe('Not enough oxygen: the plan ends 5 min into the 30 min reserve. Start with at least 37 % oxygen.');
    expect(d.text).not.toMatch(/Shorten/);
  });

  it('is a battery no-go that gives the reserve and the charge that fits', () => {
    const battery = { id: 'battery', ok: false, spareSec: -600, arrivalPct: 10, reservePct: 15, needPct: 22 };
    const d = decisionFor({ planner: ready, totals: nominal, limits: limitsOf({ battery }), objective: 'sortie' });
    expect(d.text).toBe('Not enough battery: it ends the plan at 10 %, under the 15 % reserve your risk setting keeps. Start with at least 22 % battery.');
  });

  it('offers the First sortie when no setting gets a longer goal through', () => {
    const o2 = { id: 'o2', ok: false, spareSec: -300, marginSec: -300, floorSec: 0, needPct: null };
    expect(decisionFor({ planner: ready, totals: nominal, limits: limitsOf({ o2 }), objective: 'cheyava' }).text).toMatch(/Choose the First sortie\.$/);
  });

  it('is a no-go when the dust opacity is above the terrain-fix limit (#248)', () => {
    const d = decisionFor({ planner: ready, totals: nominal, limits: limitsOf(), dust: { tau: 1.4, limit: 1 } });
    expect(d).toMatchObject({ go: false, reason: 'dust', tone: 'warning' });
    expect(d.text).toContain('τ 1.4');
    expect(decisionFor({ planner: ready, totals: nominal, limits: limitsOf(), dust: { tau: 1, limit: 1 } }).go).toBe(true);
  });

  it('adds one sentence for a forecast radiation alert and stays a go (D6)', () => {
    const d = decisionFor({ planner: ready, totals: nominal, limits: limitsOf(), radiationExpected: true });
    expect(d).toMatchObject({ go: true, tone: 'ok' });
    expect(d.text).toContain('A radiation alert is expected during the walk: shelter early when it comes (ALARA).');
    expect(decisionFor({ planner: ready, totals: nominal, limits: limitsOf() }).text).not.toContain('radiation');
  });

  it('falls back to the O2 margin status without limits', () => {
    expect(decisionFor({ planner: ready, totals: { status: 'warning' } })).toMatchObject({ go: false, reason: 'reserve' });
    expect(decisionFor({ planner: ready, totals: { status: 'caution' } })).toMatchObject({ go: true, tone: 'caution' });
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const d = decisionFor({ planner: ready, totals: nominal, dust: { tau: 2, limit: 1 } });
    expect(d.title).toBe('No salir');
    expect(d.text).toContain('τ 2,0');
    expect(decisionFor({ planner: ready, totals: nominal, limits: limitsOf() }).text).toContain('Límite más justo: el tiempo, sobran 18 min.');
  });
});

describe('suit status on the Suit step (P1, P2)', () => {
  const constants = { cautionSec: 900 };
  it('follows the O2 and battery at the start against the plan', () => {
    expect(startSuitStatus(limitsOf(), constants)).toEqual({ label: 'Nominal', tone: 'ok' });
    expect(startSuitStatus(limitsOf({ o2: ok('o2', 300) }), constants)).toMatchObject({ tone: 'caution', label: 'Low for this plan' });
    expect(startSuitStatus(limitsOf({ battery: { id: 'battery', ok: false, spareSec: -10 } }), constants)).toMatchObject({ tone: 'warning', label: 'Not enough for this plan' });
  });

  it('follows the suit model during the EVA', () => {
    expect(liveSuitStatus('warning').tone).toBe('warning');
    expect(liveSuitStatus('caution').tone).toBe('caution');
    expect(liveSuitStatus(null)).toEqual({ label: 'Nominal', tone: 'ok' });
  });
});
