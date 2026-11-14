import { describe, expect, it } from 'vitest';
import hazards from '../../../public/data/hazards.json';
import { validateEvent } from '../eventEngine.js';
import lowOxygenCaution from './low-oxygen-caution.json';
import lowOxygenWarning from './low-oxygen-warning.json';

describe('low-oxygen event data', () => {
  it('accepts both levels as valid events', () => {
    expect(validateEvent(lowOxygenCaution)).toEqual({ ok: true, errors: [] });
    expect(validateEvent(lowOxygenWarning)).toEqual({ ok: true, errors: [] });
  });

  it('fires caution before warning on the suit margin', () => {
    expect(lowOxygenCaution.trigger).toEqual({
      type: 'threshold',
      path: 'suit.marginSec',
      op: 'lt',
      value: 900,
    });
    expect(lowOxygenWarning.trigger).toEqual({
      type: 'threshold',
      path: 'suit.marginSec',
      op: 'lte',
      value: 0,
    });
    expect(lowOxygenCaution.alert.level).toBe('caution');
    expect(lowOxygenWarning.alert.level).toBe('warning');
  });

  it('keeps the caution alert alert-only and sends the warning home', () => {
    expect(lowOxygenCaution.planner).toBeUndefined();
    expect(lowOxygenCaution.timeline).toEqual([]);
    expect(lowOxygenWarning.planner).toEqual({ action: 'replan', target: 'habitat' });
    expect(lowOxygenWarning.end.type).toBe('area');
  });

  it('uses the 30 minute reserve from hazards.json', () => {
    expect(hazards.values['suit.reserve.time'].value).toBe(30);
    expect(hazards.values['suit.reserve.time'].unit).toMatch(/min/);
    expect(lowOxygenCaution.notes).toMatch(/30 min reserve/);
    expect(lowOxygenWarning.notes).toMatch(/30 min reserve/);
  });
});
