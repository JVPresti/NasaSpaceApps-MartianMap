import { describe, expect, it } from 'vitest';
import hazards from '../../../public/data/hazards.json';
import { validateEvent } from '../eventEngine.js';
import radiation from './radiation.json';

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
});
