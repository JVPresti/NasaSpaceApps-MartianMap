import { describe, expect, it } from 'vitest';
import hazards from '../../../public/data/hazards.json';
import { validateEvent } from '../eventEngine.js';
import dustStorm from './dust-storm.json';

describe('dust storm event data', () => {
  it('is a valid event definition', () => {
    expect(validateEvent(dustStorm)).toEqual({ ok: true, errors: [] });
  });

  it('goes from a clear Jezero sky to a global storm, both from hazards.json', () => {
    const timeline = dustStorm.timeline;
    expect(timeline[0].set['environment.dustOpacity']).toBe(
      hazards.values['dust.tau.clear_season'].value,
    );
    expect(timeline[timeline.length - 1].set['environment.dustOpacity']).toBe(
      hazards.values['dust.tau.gale_global_storm_2018'].value,
    );
  });

  it('keeps getting worse: every step adds more dust than the one before', () => {
    const tau = dustStorm.timeline.map((step) => step.set['environment.dustOpacity']);
    for (let index = 2; index < tau.length; index += 1) {
      expect(tau[index] - tau[index - 1]).toBeGreaterThan(tau[index - 1] - tau[index - 2]);
    }
  });

  it('ramps opacity and sky blend together over the SIM ramp duration', () => {
    const timeline = dustStorm.timeline;
    expect(timeline[timeline.length - 1].atSec).toBe(
      hazards.values['dust.event.ramp_duration'].value,
    );
    for (let index = 1; index < timeline.length; index += 1) {
      expect(timeline[index].set['environment.dustOpacity']).toBeGreaterThan(
        timeline[index - 1].set['environment.dustOpacity'],
      );
      expect(timeline[index].set['view.skyBlend']).toBeGreaterThan(
        timeline[index - 1].set['view.skyBlend'],
      );
    }
  });

  it('goes home to the habitat and marks the science stops skipped', () => {
    expect(dustStorm.planner).toEqual({ action: 'replan', target: 'habitat' });
    expect(dustStorm.end.type).toBe('area');
    expect(dustStorm.end.x).toBe(535.1);
    expect(dustStorm.end.z).toBe(574.1);
  });
});
