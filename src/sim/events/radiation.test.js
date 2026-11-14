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

  it('accumulates dose monotonically and ends at the habitat', () => {
    const doses = radiation.timeline.map((entry) => entry.set['environment.doseUgy']);
    for (let index = 1; index < doses.length; index += 1) {
      expect(doses[index]).toBeGreaterThan(doses[index - 1]);
    }
    expect(radiation.planner).toEqual({ action: 'replan', target: 'habitat' });
    expect(radiation.end).toEqual({ type: 'area', x: 535.1, z: 574.1, radius: 25 });
  });
});
