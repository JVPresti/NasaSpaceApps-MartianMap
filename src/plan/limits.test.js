import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { planLimits } from './limits.js';

const c = suitConstantsFromHazards(JSON.parse(readFileSync(new URL('../../public/data/hazards.json', import.meta.url), 'utf8')));

// A plan's totals as legCosts writes them, and a budget as missionNeeds writes it (30 min, standard risk).
const totals = (fields = {}) => ({
  timeSec: 420, returnTimeSec: 60, roundTrip: false, o2G: 9, returnO2G: 2, batteryWh: 10, returnBatteryWh: 2,
  marginSec: 284 * 60, arrivalO2Pct: 98, arrivalBatteryWh: 0.98 * c.batteryWh, arrivalBatteryPct: 98, status: 'nominal', ...fields,
});
const budget = (fields = {}) => ({
  availableSec: 1800, reserveSec: 270, usableSec: 1530, usedSec: 480, marginFloor: 'warning', marginFloorSec: c.warningSec,
  batteryReserveWh: 0.15 * c.batteryWh, ...fields,
});

describe('plan limits (P1)', () => {
  it('gives each limit as minutes of slack and names the tightest', () => {
    const limits = planLimits({ totals: totals(), budget: budget(), constants: c });
    expect(limits.time.spareSec).toBe(1050);
    expect(limits.o2.spareSec).toBe(284 * 60 - c.warningSec);
    expect(limits.battery.spareSec).toBeGreaterThan(0);
    expect(limits.tightest.id).toBe('time');
    expect(limits.failing).toBeNull();
    expect(limits.status).toBe('ok');
  });

  it('is a time no-go with the least time setting that fits, in slider steps', () => {
    const limits = planLimits({ totals: totals(), budget: budget({ availableSec: 3000, reserveSec: 750, usableSec: 2250, usedSec: 3960 }), constants: c });
    expect(limits.failing.id).toBe('time');
    expect(limits.status).toBe('warning');
    // 3960 s / (1 - 0.25) = 88 min, up to the 5 min step
    expect(limits.time.needMin).toBe(90);
  });

  it('is an oxygen no-go when the margin reaches the floor, with the O2 at the start that fits', () => {
    const limits = planLimits({ totals: totals({ marginSec: -120, arrivalO2Pct: -6 }), budget: budget(), constants: c, needs: { o2Pct: 1 } });
    expect(limits.failing.id).toBe('o2');
    expect(limits.o2.needPct).toBeGreaterThan(1);
    expect(limits.o2.needPct).toBeLessThanOrEqual(100);
  });

  it('keeps the cautious floor: on it is still a go, under it is not', () => {
    const cautious = budget({ marginFloor: 'caution', marginFloorSec: c.cautionSec });
    expect(planLimits({ totals: totals({ marginSec: c.cautionSec }), budget: cautious, constants: c }).o2.ok).toBe(true);
    expect(planLimits({ totals: totals({ marginSec: c.cautionSec - 1 }), budget: cautious, constants: c }).o2.ok).toBe(false);
  });

  it('is a battery no-go under the risk reserve, and says the reserve and the charge that fits', () => {
    const limits = planLimits({ totals: totals({ arrivalBatteryWh: 0.1 * c.batteryWh, arrivalBatteryPct: 10 }), budget: budget(), constants: c });
    expect(limits.failing.id).toBe('battery');
    expect(limits.battery.reservePct).toBe(15);
    expect(limits.battery.needPct).toBeGreaterThan(0);
  });

  it('is in caution when a limit has less than the suit caution margin left', () => {
    const limits = planLimits({ totals: totals(), budget: budget({ usedSec: 1530 - 120 }), constants: c });
    expect(limits.status).toBe('caution');
    expect(limits.tightest.id).toBe('time');
  });

  it('has no time limit without the crew budget (an event route), and nothing without totals or constants', () => {
    expect(planLimits({ totals: totals(), budget: null, constants: c }).time).toBeNull();
    expect(planLimits({ totals: null, constants: c })).toBeNull();
    expect(planLimits({ totals: totals(), constants: null })).toBeNull();
  });

  it('checks the egress to sunset against the whole plan, and is a no-go when the plan outlasts the Sun (#324)', () => {
    // the demo: the site latitude and the 11 deg declination of sunPosition.js, out at 17:45 with ~30 min of daylight
    const daylight = { hours: 17.75, declinationDeg: 11, latitudeDeg: 18.4975 };
    const light = planLimits({ totals: totals(), budget: budget(), constants: c, daylight });
    expect(light.daylight).toMatchObject({ id: 'daylight', ok: true });
    expect(light.daylight.planSec).toBe(480);                    // 420 s out + 60 s back
    expect(light.daylight.toSunsetSec / 60).toBeCloseTo(29.9, 1);
    expect(light.daylight.spareSec / 60).toBeCloseTo(21.9, 1);   // ~30 min of daylight less the 8 min plan
    expect(light.failing).toBeNull();

    // the full EVA to Cheyava Falls: 19 min out, 35 min of work, 22 min home
    const full = planLimits({
      totals: totals({ timeSec: (19 + 35) * 60, returnTimeSec: 22 * 60 }), budget: budget(), constants: c, daylight,
    });
    expect(full.daylight.ok).toBe(false);
    expect(full.failing.id).toBe('daylight');
    expect(full.status).toBe('warning');
    expect(full.daylight.spareSec / 60).toBeCloseTo(-46, 0);
  });

  it('leaves daylight out when there is no mission time, and reports the egress already past sunset', () => {
    expect(planLimits({ totals: totals(), budget: budget(), constants: c }).daylight).toBeNull();
    expect(planLimits({ totals: totals(), budget: budget(), constants: c, daylight: { hours: null } }).daylight).toBeNull();
    const dark = planLimits({ totals: totals(), budget: budget(), constants: c, daylight: { hours: 17.75, declinationDeg: -23 } });
    expect(dark.daylight.ok).toBe(false);
    expect(dark.daylight.toSunsetSec).toBeLessThan(0);
  });
});
