import { batteryDrawW, metabolicPowerW, o2RateGs } from '../sim/suitModel.js';
import { daylightLeft } from '../sim/daylight.js';

// The limits of a plan, side by side (P1: one honest decision). Each is the slack left at the end of the plan
// as minutes, so they compare and the tightest can be named:
// - time: the time the crew set, less the risk reserve, minus the walk out, the work and the walk home
//   (route.budget, src/sim/missionNeeds.js); only while the plan from the crew's needs is the route;
// - oxygen: the margin at the end of the plan over the 30 min reserve (route.totals.marginSec, src/sim/legCosts.js),
//   minus the floor the risk setting keeps (the suit's caution level for a cautious crew);
// - battery: the charge left on return above the reserve the risk setting keeps, as minutes of walking;
// - daylight (#324): the egress to sunset, less the plan, from src/sim/daylight.js; only when the caller gives the
//   time and the declination.
// Plain JavaScript over the suit constants (suitConstantsFromHazards); tested without a browser.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const STEP_MIN = 5;   // the time slider's step (NeedsPanel)

/**
 * @param {{ totals: object | null, budget?: object | null, constants: object | null,
 *   needs?: { timeMin?: number, o2Pct?: number, batteryPct?: number } | null,
 *   daylight?: { hours: number, declinationDeg?: number, latitudeDeg?: number } | null }} input
 *   daylight: the LMST the crew goes out at, hours after local midnight (the mission clock, src/state/skyTime.js),
 *   and the Sun's declination; null while the store has no mission time
 * @returns {null | {
 *   time: null | { id: 'time', ok: boolean, spareSec: number, usedSec: number, usableSec: number, availableSec: number, reservePct: number, needMin: number | null },
 *   o2: { id: 'o2', ok: boolean, spareSec: number, marginSec: number, floorSec: number, arrivalPct: number, needPct: number | null },
 *   battery: { id: 'battery', ok: boolean, spareSec: number, arrivalPct: number, reservePct: number, needPct: number | null },
 *   daylight: null | { id: 'daylight', ok: boolean, spareSec: number, toSunsetSec: number, planSec: number, sunsetHours: number, egressHours: number },
 *   failing: null | object, tightest: object, status: 'ok' | 'caution' | 'warning' }}
 *   needMin / needPct: the least time, O2 or battery at the start that lets the plan through, null when no setting can
 *   (more than the 8 h limit, or more than a full tank); failing: the limit the plan breaks with the least slack;
 *   tightest: the limit with the least slack; status: warning when one breaks, caution when one has less than the
 *   suit's caution margin (15 min) left, else ok
 */
export function planLimits({ totals, budget = null, constants: c, needs = null, daylight = null }) {
  if (!totals || !c || !finite(totals.marginSec)) return null;
  const walkW = metabolicPowerW(c.speedFlat, 0, c);
  const o2PerSec = o2RateGs(walkW, c);
  const whPerSec = batteryDrawW(walkW, c) / 3600;
  const back = (key) => (totals.roundTrip ? 0 : totals[key] ?? 0);
  const usedO2G = totals.o2G + back('returnO2G');
  const usedWh = totals.batteryWh + back('returnBatteryWh');

  let time = null;
  if (budget && finite(budget.usableSec) && finite(budget.usedSec) && finite(budget.availableSec) && budget.availableSec > 0) {
    const reserveShare = finite(budget.reserveSec) ? budget.reserveSec / budget.availableSec : 0;
    const needSec = budget.usedSec / (1 - reserveShare);
    const needMin = Math.ceil(needSec / 60 / STEP_MIN) * STEP_MIN;
    time = {
      id: 'time',
      ok: budget.usedSec <= budget.usableSec,
      spareSec: budget.usableSec - budget.usedSec,
      usedSec: budget.usedSec,
      usableSec: budget.usableSec,
      availableSec: budget.availableSec,
      reservePct: Math.round(100 * reserveShare),
      needMin: needMin * 60 <= c.evaMaxSec ? needMin : null,
    };
  }

  // The floor of the margin: the suit's caution level for a cautious crew (the margin may sit on it), else the warning
  // level, which the margin must stay above (missionNeeds.checkBudget, legCosts status).
  const floorSec = finite(budget?.marginFloorSec) ? budget.marginFloorSec : c.warningSec;
  const strict = (budget?.marginFloor ?? 'warning') !== 'caution';
  const o2Spare = totals.marginSec - floorSec;
  const o2NeedPct = Math.ceil(100 * (usedO2G + (floorSec + c.reserveSec) * o2PerSec) / c.o2UsableG);
  const o2 = {
    id: 'o2',
    ok: strict ? o2Spare > 0 : o2Spare >= 0,
    spareSec: o2Spare,
    marginSec: totals.marginSec,
    floorSec,
    arrivalPct: totals.arrivalO2Pct,
    // More O2 helps only while the margin is not the 8 h EVA cap, and only up to a full tank.
    needPct: o2NeedPct <= 100 && (!finite(needs?.o2Pct) || o2NeedPct > needs.o2Pct) ? Math.max(1, o2NeedPct) : null,
  };

  const reserveWh = finite(budget?.batteryReserveWh) ? budget.batteryReserveWh : 0;
  const batterySpareWh = totals.arrivalBatteryWh - reserveWh;
  const batteryNeedPct = Math.ceil(100 * (usedWh + reserveWh) / c.batteryWh);
  const battery = {
    id: 'battery',
    ok: batterySpareWh >= 0,
    spareSec: batterySpareWh / whPerSec,
    arrivalPct: totals.arrivalBatteryPct,
    reservePct: Math.round(100 * reserveWh / c.batteryWh),
    needPct: batteryNeedPct <= 100 ? Math.max(1, batteryNeedPct) : null,
  };

  // Daylight (#324): the egress to sunset, less the plan door to door. The walk back comes home after the walk out
  // and the work, so the whole plan has to fit before the Sun is down.
  let daylightLimit = null;
  if (daylight && finite(daylight.hours)) {
    const planSec = (finite(totals.timeSec) ? totals.timeSec : 0) + back('returnTimeSec');
    const d = daylightLeft({ hours: daylight.hours, declinationDeg: daylight.declinationDeg, latitudeDeg: daylight.latitudeDeg, planSec });
    if (d) {
      daylightLimit = {
        id: 'daylight',
        ok: d.ok,
        spareSec: d.leftSec,
        toSunsetSec: d.toSunsetSec,
        planSec: d.planSec,
        sunsetHours: d.sunsetHours,
        egressHours: d.hours,
      };
    }
  }

  const all = [time, o2, battery, daylightLimit].filter(Boolean);
  const bySlack = [...all].sort((a, b) => a.spareSec - b.spareSec);
  const failing = bySlack.find((limit) => !limit.ok) ?? null;
  const tightest = bySlack[0];
  const status = failing ? 'warning' : tightest.spareSec < c.cautionSec ? 'caution' : 'ok';
  return { time, o2, battery, daylight: daylightLimit, failing, tightest, status };
}
