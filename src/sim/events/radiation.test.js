import { afterEach, describe, expect, it } from 'vitest';
import hazards from '../../../public/data/hazards.json';
import { setLanguage, translateText } from '../../i18n/index.js';
import { validateEvent } from '../eventEngine.js';
import radiation from './radiation.json';
import { eventStartSec, missionEventDefinitions } from '../missions.js';

afterEach(() => setLanguage('en'));

describe('radiation alert event data', () => {
  it('is a valid event definition', () => {
    expect(validateEvent(radiation)).toEqual({ ok: true, errors: [] });
  });

  it('uses the RAD background and peak rates from hazards.json', () => {
    const points = hazards.models.sep_2017_profile.points;
    const background = points[0].rate / 24;
    const peak = Math.max(...points.map((point) => point.rate)) / 24;
    const rates = radiation.timeline.map((entry) => entry.set['environment.doseRateUgyH']);
    expect(rates[0]).toBeCloseTo(background, 1);
    expect(Math.max(...rates)).toBeCloseTo(peak, 1);
  });

  it('sets only the rate, so the environment runner owns the dose total (#189)', () => {
    for (const entry of radiation.timeline) expect(entry.set).not.toHaveProperty(['environment.doseUgy']);
    expect(radiation.endSet).not.toHaveProperty(['environment.doseUgy']);
    // The rates held between timeline steps add up to about 4.8 µGy over the 12-minute event.
    let dose = 0;
    for (let index = 1; index < radiation.timeline.length; index += 1) {
      const previous = radiation.timeline[index - 1];
      dose += (previous.set['environment.doseRateUgyH'] * (radiation.timeline[index].atSec - previous.atSec)) / 3600;
    }
    expect(dose).toBeCloseTo(4.84, 2);
  });

  it('ends at the habitat', () => {
    expect(radiation.planner).toEqual({ action: 'replan', target: 'habitat' });
    expect(radiation.end).toEqual({ type: 'area', x: 535.1, z: 574.1, radius: 25 });
  });

  it('labels the event as an early warning, not danger (#250)', () => {
    expect(radiation.alert.level).toBe('warning');
    expect(radiation.alert.text).toMatch(/elevated dose rate/i);
    expect(radiation.alert.text).toMatch(/ALARA/);
    expect(radiation.alert.text).not.toMatch(/danger|Enter the habitat now/i);
  });

  it('keeps the alert translated in Spanish', () => {
    setLanguage('es');
    expect(translateText(radiation.alert.text)).toMatch(/tasa de dosis elevada/);
    expect(translateText(radiation.alert.text)).toMatch(/ALARA/);
  });

  it('leaves its start time to the mission: T+720 s and the 12-minute profile in the full EVA (#265)', () => {
    expect(radiation.trigger).toEqual({ type: 'manual' });
    expect(eventStartSec('bright-angel', 'radiation')).toBe(720);
    expect(missionEventDefinitions('bright-angel', [radiation])[0].timeline).toEqual(radiation.timeline);
    const [first] = missionEventDefinitions('sortie', [radiation]);
    expect(first.timeline.at(-1).atSec).toBe(60);
    expect(first.timeline.map((entry) => entry.set)).toEqual(radiation.timeline.map((entry) => entry.set));
  });
});
