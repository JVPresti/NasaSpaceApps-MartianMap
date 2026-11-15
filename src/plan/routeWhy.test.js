import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { droppedWhy, legWhy, planReasonLines, stopLine } from './routeWhy.js';
import { eventWhen, shortDuration } from './tableFormat.js';

afterEach(() => setLanguage('en'));

const leg = (fields) => ({ clear: false, block: null, straightM: 100, routeM: 100, extraM: 0, extraSec: 0, ...fields });

describe('why each leg runs where it does (#246)', () => {
  it('says a clear straight line is clear', () => {
    expect(legWhy(leg({ clear: true }))).toBe('straight line clear');
  });

  it('names a slope block with the 20 degree limit and the detour\'s metres and time', () => {
    expect(legWhy(leg({ block: 'slope', extraM: 62.4, extraSec: 75 }))).toBe('goes around ground over 20°: +62 m, +75 s');
    expect(legWhy(leg({ block: 'slope', extraM: 140, extraSec: 190 }))).toBe('goes around ground over 20°: +140 m, +3 min');
  });

  it('names a rock detour, and words a detour that saves climbing', () => {
    expect(legWhy(leg({ block: 'rock', extraM: 9, extraSec: 12 }))).toBe('goes around rockier ground: +9 m, +12 s');
    expect(legWhy(leg({ block: 'steep', extraM: 14, extraSec: -20 }))).toBe('goes around steeper ground: +14 m, 20 s less climbing');
  });

  it('says what the radio and rover-ground profiles keep to', () => {
    expect(legWhy(leg({ block: 'radio', extraM: 30, extraSec: 31 }))).toMatch(/^keeps the habitat mast in sight/);
    expect(legWhy(leg({ block: 'traverse', extraM: 6, extraSec: null }))).toBe('keeps to ground Perseverance drove: +6 m');
  });

  it('gives nothing without an explanation', () => {
    expect(legWhy(null)).toBeNull();
  });
});

describe('stop line (#247 work time, #246 leg)', () => {
  it('puts the planned work before the leg\'s reason, capitalised', () => {
    expect(stopLine({ workSec: 300, explain: leg({ clear: true }) })).toBe('5 min work · straight line clear');
    expect(stopLine({ workSec: 1080, explain: null })).toBe('18 min work');
    expect(stopLine({ workSec: 0, explain: leg({ clear: true }) })).toBe('Straight line clear');
    expect(stopLine({})).toBeNull();
  });
});

describe('stops left out and plan reasons', () => {
  it('says why an optional stop was left out', () => {
    expect(droppedWhy({ limit: 'time', overSec: 840 })).toBe('14 min over your time');
    expect(droppedWhy({ limit: 'o2', marginShortSec: 300 })).toBe('Oxygen margin 5 min short');
    expect(droppedWhy({ limit: 'battery', batteryShortWh: 12.2 })).toBe('13 Wh short of the battery reserve');
    expect(droppedWhy({ limit: 'unreachable' })).toBe('No walkable route to it');
  });

  it('words the crew rules, the risk and the budget, and leaves the stops to the list', () => {
    const lines = planReasonLines([
      { code: 'solo-radio', requested: 'fastest' },
      { code: 'solo-work', factor: 1.5 },
      { code: 'risk', risk: 'cautious', reserveShare: 0.25 },
      { code: 'stop-dropped', stop: 'bright-angel', limit: 'time' },
      { code: 'fits', spareSec: 1260 },
    ]);
    expect(lines).toEqual([
      'Solo: held to the Radio route, not Fastest.',
      'Work takes 1.5 × as long alone.',
      'Cautious: slope and rock cost more, rover tracks preferred, 25 % of the time in reserve.',
      'Fits, 21 min to spare.',
    ]);
  });

  it('says by how much a plan is over the crew\'s budget', () => {
    expect(planReasonLines([{ code: 'required-over', limit: 'time', overSec: 600 }])).toEqual(['10 min over your time.']);
    expect(planReasonLines([{ code: 'risk', risk: 'standard', reserveShare: 0.15 }])).toEqual([]);
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    expect(stopLine({ workSec: 300, explain: leg({ block: 'slope', extraM: 62, extraSec: 75 }) })).toBe('5 min de trabajo · rodea terreno de más de 20°: +62 m, +75 s');
    expect(planReasonLines([{ code: 'fits', spareSec: 1260 }, { code: 'solo-work', factor: 1.5 }])).toEqual(['Cabe, sobran 21 min.', 'El trabajo lleva 1,5 × más en solitario.']);
  });
});

describe('table durations', () => {
  it('uses seconds under 90 s, then minutes, then hours', () => {
    expect(shortDuration(42)).toBe('42 s');
    expect(shortDuration(-42)).toBe('42 s');
    expect(shortDuration(600)).toBe('10 min');
    expect(shortDuration(6000)).toBe('1 h 40 min');
    expect(shortDuration(null)).toBe('–');
  });

  it('prints an event time in seconds under two minutes (#265 first sortie)', () => {
    expect(eventWhen(75)).toBe('75 s into the EVA');
    expect(eventWhen(480)).toBe('8 min into the EVA');
    expect(eventWhen(null)).toBeNull();
  });
});
