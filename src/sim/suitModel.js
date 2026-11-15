/**
 * Suit model: metabolic power from walking speed and slope, oxygen and battery use, walkback time and the
 * oxygen margin with its caution and warning thresholds.
 *
 * Plain JavaScript with no React and no three.js. Every constant comes from `public/data/hazards.json`
 * (issue #18) through `suitConstantsFromHazards`; the formula is `models.walking_metabolic` in that file
 * (Minetti 2002 walking cost, scaled to Mars gravity and calibrated to NASA suited tests).
 *
 * Coordinates: x east, z south, metres from Cheyava Falls. Gradient i = rise / run, positive uphill.
 */

const BTU_H_TO_W = 0.29307107;
const LBM_TO_G = 453.59237;

const TAG_RANK = { SIM: 0, DERIVED: 1, DATA: 2 };

/**
 * hazards.json inputs of each suit value. The walk HUD (suit.*) and the Plan panel (route.totals.*) take their tags
 * from these same lists, so a margin or a walk time carries one tag in both places.
 */
const SPEED_IDS = ['mobility.speed_rule', 'mobility.speed.flat', 'mobility.speed.min', 'mobility.speed.jog', 'model:walking_metabolic'];
const O2_IDS = [...SPEED_IDS, 'metabolic.model_mass', 'suit.o2.primary_usable'];
export const SUIT_INPUTS = Object.freeze({
  speed: SPEED_IDS,
  o2: O2_IDS,
  battery: [...SPEED_IDS, 'suit.battery.primary_capacity', 'suit.battery.average_draw', 'suit.battery.effort_share', 'suit.metabolic.design_average'],
  margin: [...O2_IDS, 'suit.reserve.time', 'suit.reserve.walkback_pad', 'suit.alert.caution_margin', 'suit.alert.warning_margin', 'suit.eva_duration_max'],
});

/**
 * Tag of a value computed from several inputs: the weakest of their tags (SIM < DERIVED < DATA), and never better
 * than DERIVED because we did the computing (plan section 4.1).
 * @param {object} hazards parsed hazards.json
 * @param {string[]} ids keys of hazards.values; 'model:<name>' for hazards.models
 */
export function combinedTag(hazards, ids) {
  let rank = TAG_RANK.DERIVED;
  for (const id of ids) {
    const e = id.startsWith('model:') ? hazards.models[id.slice(6)] : hazards.values[id];
    if (!e || !(e.tag in TAG_RANK)) throw new Error('hazards.json has no tag for ' + id);
    rank = Math.min(rank, TAG_RANK[e.tag]);
  }
  return Object.keys(TAG_RANK).find((k) => TAG_RANK[k] === rank);
}

/** @param {object} hazards parsed public/data/hazards.json */
export function suitConstantsFromHazards(hazards) {
  const v = hazards.values, m = hazards.models.walking_metabolic.constants;
  const num = (id) => {
    const e = v[id];
    if (!e) throw new Error('hazards.json is missing ' + id);
    return e.value;
  };
  const mc = (k) => {
    if (!m[k]) throw new Error('hazards.json walking_metabolic is missing ' + k);
    return m[k].value;
  };
  const c = {
    g: mc('g'), gEarth: mc('g_earth'), pBaseW: mc('P_base'), cL0: mc('C_L0'), cLv: mc('C_Lv'), v0: mc('v0'),
    kGrade: mc('K_grade'), cwLevel: mc('Cw_level'), jPerL: mc('J_per_L'), rhoO2: mc('rho_O2'),
    minettiTable: num('metabolic.minetti_table'),
    massKg: num('metabolic.model_mass').total_kg,
    o2UsableG: num('suit.o2.primary_usable') * LBM_TO_G,
    batteryWh: num('suit.battery.primary_capacity'),
    batteryAvgW: num('suit.battery.average_draw'),
    batteryEffortShare: num('suit.battery.effort_share'),
    designAvgW: num('suit.metabolic.design_average') * BTU_H_TO_W,
    designPeakW: num('suit.metabolic.design_peak') * BTU_H_TO_W,
    reserveSec: num('suit.reserve.time') * 60,
    evaMaxSec: num('suit.eva_duration_max') * 3600,
    walkbackPad: num('suit.reserve.walkback_pad') / 100,
    cautionSec: num('suit.alert.caution_margin') * 60,
    warningSec: num('suit.alert.warning_margin') * 60,
    pressurePsi: num('suit.pressure.nominal'),
    speedFlat: num('mobility.speed.flat'),
    speedJog: num('mobility.speed.jog'),
    speedMin: num('mobility.speed.min'),
  };
  // where each displayed suit value comes from (tags as in hazards.json; our combinations are DERIVED). The margin
  // and the walkback take the weakest tag of their inputs, as route.totals does (src/sim/legCosts.js).
  const marginTag = combinedTag(hazards, SUIT_INPUTS.margin);
  c.sources = {
    'suit.pressurePsi': { tag: v['suit.pressure.nominal'].tag, source: v['suit.pressure.nominal'].label },
    'suit.oxygenPct': { tag: 'DERIVED', source: 'suit model (src/sim/suitModel.js) from hazards.json: xEMU O2, walking_metabolic' },
    'suit.oxygenSec': { tag: 'DERIVED', source: 'suit model: O2 left / current O2 rate' },
    'suit.batteryPct': { tag: 'DERIVED', source: 'suit model: xEMU battery, draw split is SIM' },
    'suit.walkbackSec': { tag: combinedTag(hazards, SUIT_INPUTS.speed), label: 'Suit model', source: 'suit model: walk to the habitat, or to the shelter during an event, at constant effort (SIM rule)' },
    'suit.marginSec': { tag: marginTag, label: 'Suit model', source: 'suit model: margin now, the O2 left after the padded walkback and the Apollo 30 min reserve, capped at the 8 h EVA limit minus the walkback; thresholds SIM' },
    'suit.status': { tag: marginTag, label: 'Suit model', source: 'suit model: margin now against the caution and warning thresholds (SIM)' },
    'suit.effort': { tag: 'DERIVED', source: 'suit model: metabolic power between rest and design peak' },
  };
  return c;
}

/** Minetti's 1 g cost of walking on gradient i, J per kg per m: linear interpolation of the table, i clamped to its range. */
export function minettiCost(i, table) {
  const lo = table[0][0], hi = table[table.length - 1][0], x = Math.max(lo, Math.min(hi, i));
  for (let k = 1; k < table.length; k++) {
    const [x1, y1] = table[k];
    if (x <= x1) { const [x0, y0] = table[k - 1]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return table[table.length - 1][1];
}

/** Metabolic power in W of a suited astronaut walking at v m/s on gradient i (models.walking_metabolic). */
export function metabolicPowerW(v, i, c) {
  const speed = Math.max(0, v);
  const cLevel = c.cL0 + c.cLv * Math.max(0, speed - c.v0);
  const cGrade = c.kGrade * (c.g / c.gEarth) * (minettiCost(i, c.minettiTable) - c.cwLevel);
  return c.pBaseW + Math.max(0, c.massKg * speed * (cLevel + cGrade));
}

/** O2 use in g per second at a metabolic power. */
export function o2RateGs(powerW, c) {
  return powerW / c.jPerL * c.rhoO2;
}

/** Battery draw in W: a fixed part plus a part that follows body heat (suit.battery.effort_share). */
export function batteryDrawW(powerW, c) {
  return c.batteryAvgW * ((1 - c.batteryEffortShare) + c.batteryEffortShare * powerW / c.designAvgW);
}

/** 0 at rest, 1 at the xEMU design peak. */
export function effortOf(powerW, c) {
  return Math.max(0, Math.min(1, (powerW - c.pBaseW) / (c.designPeakW - c.pBaseW)));
}

/**
 * Walking speed on gradient i under the constant-effort rule (mobility.speed_rule): keep the power of flat walking
 * at mobility.speed.flat, clamped to [speed.min, speed.jog]. Bisection: power grows with speed.
 */
export function constantEffortSpeed(i, c) {
  const target = metabolicPowerW(c.speedFlat, 0, c);
  let lo = c.speedMin, hi = c.speedJog;
  if (metabolicPowerW(lo, i, c) >= target) return lo;
  if (metabolicPowerW(hi, i, c) <= target) return hi;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (metabolicPowerW(mid, i, c) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * Time, O2 and battery to walk a path at constant effort, with the walkback pad on the metabolic rate.
 * Also returns climb, descent and the steepest gradient met along the walking direction, so per-leg costs (#41)
 * and the walkback (#19) come from this one function.
 * @param {Array<[number, number]>} path [[x, z], ...] in walking order
 * @param {(x: number, z: number) => number} heightAt terrain height in metres
 * @param {object} c constants
 * @param {{ stepM?: number, pad?: number }} [options] stepM: sampling step along the path (default 10 m)
 * @returns {{ distanceM: number, timeSec: number, o2G: number, batteryWh: number, climbM: number, descentM: number,
 *   maxSlopeDeg: number }} maxSlopeDeg: steepest sampled gradient along the path, uphill or downhill
 */
export function walkCost(path, heightAt, c, { stepM = 10, pad = c.walkbackPad } = {}) {
  let distanceM = 0, timeSec = 0, o2G = 0, batteryWh = 0, climbM = 0, descentM = 0, maxGrade = 0;
  for (let k = 0; k < path.length - 1; k++) {
    const [ax, az] = path[k], [bx, bz] = path[k + 1], len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / stepM));
    for (let s = 0; s < n; s++) {
      const x0 = ax + (bx - ax) * s / n, z0 = az + (bz - az) * s / n, x1 = ax + (bx - ax) * (s + 1) / n, z1 = az + (bz - az) * (s + 1) / n;
      const run = len / n; if (run <= 0) continue;
      const rise = heightAt(x1, z1) - heightAt(x0, z0), i = rise / run, v = constantEffortSpeed(i, c);
      const t = run / v, p = metabolicPowerW(v, i, c) * (1 + pad);
      distanceM += run; timeSec += t; o2G += o2RateGs(p, c) * t; batteryWh += batteryDrawW(p, c) * t / 3600;
      if (rise > 0) climbM += rise; else descentM -= rise;
      maxGrade = Math.max(maxGrade, Math.abs(i));
    }
  }
  return { distanceM, timeSec, o2G, batteryWh, climbM, descentM, maxSlopeDeg: Math.atan(maxGrade) * 180 / Math.PI };
}

/** Nearest point on a polyline to a position: the segment index and the foot of the perpendicular. */
function nearestOnPath(from, path) {
  let best = { d2: Infinity, seg: 0, px: path[0][0], pz: path[0][1] };
  for (let k = 0; k < path.length - 1; k++) {
    const [ax, az] = path[k], [bx, bz] = path[k + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((from.x - ax) * dx + (from.z - az) * dz) / l2)) : 0;
    const px = ax + dx * t, pz = az + dz * t, d2 = (from.x - px) ** 2 + (from.z - pz) ** 2;
    if (d2 < best.d2) best = { d2, seg: k, px, pz };
  }
  return best;
}

/**
 * The path home from a position: back along the planned route to its start (the habitat), or straight to the
 * habitat when there is no route. The route is walked from the nearest point on it.
 * @param {{ x: number, z: number }} from
 * @param {Array<[number, number]> | null} routePath planned route, starting at the habitat
 * @param {{ x: number, z: number }} habitat
 * @returns {Array<[number, number]>}
 */
export function pathHome(from, routePath, habitat) {
  if (!routePath || routePath.length < 2) return [[from.x, from.z], [habitat.x, habitat.z]];
  const best = nearestOnPath(from, routePath);
  const home = [[from.x, from.z], [best.px, best.pz]];
  for (let k = best.seg; k >= 0; k--) home.push(routePath[k]);
  return home;
}

/**
 * The path to an event shelter: forward along the shelter route to its end, from the nearest point on it, or
 * straight to the shelter when there is no route. The re-planner starts that route at the player and ends it at
 * the shelter (src/state/events.js), so walking it backwards, as pathHome does, would give a walk of 0 m.
 * @param {{ x: number, z: number }} from
 * @param {Array<[number, number]> | null} routePath shelter route, ending at the shelter
 * @param {{ x: number, z: number }} shelter
 * @returns {Array<[number, number]>}
 */
export function pathToShelter(from, routePath, shelter) {
  if (!routePath || routePath.length < 2) return [[from.x, from.z], [shelter.x, shelter.z]];
  const best = nearestOnPath(from, routePath);
  const out = [[from.x, from.z], [best.px, best.pz]];
  for (let k = best.seg + 1; k < routePath.length; k++) out.push(routePath[k]);
  return out;
}

/** Fresh suit consumables: full primary O2 and battery. */
export function createSuitState(c) {
  return { o2G: c.o2UsableG, batteryWh: c.batteryWh, powerW: c.pBaseW, o2RateSmoothGs: o2RateGs(c.pBaseW, c) };
}

/**
 * Advance the consumables by dtSec at a measured speed and gradient. Returns a new state.
 * The O2 rate used for "time left" is smoothed over about 30 s so a short sprint does not swing the HUD.
 * Speed is capped at mobility.speed.jog (1.5 m/s): the formula is only valid up to about 1.5 m/s. Walk mode moves at
 * 1.0 and 1.5 m/s (#13), so the cap is only a guard against faster input, for example a teleport or a future vehicle.
 */
export function stepSuit(state, { dtSec, speedMs, gradient }, c) {
  const powerW = metabolicPowerW(Math.min(speedMs, c.speedJog), gradient, c), rate = o2RateGs(powerW, c);
  const k = Math.min(1, dtSec / 30);
  return {
    o2G: Math.max(0, state.o2G - rate * dtSec),
    batteryWh: Math.max(0, state.batteryWh - batteryDrawW(powerW, c) * dtSec / 3600),
    powerW,
    o2RateSmoothGs: state.o2RateSmoothGs + (rate - state.o2RateSmoothGs) * k,
  };
}

/**
 * O2 margin in seconds: the O2 left as time at an O2 rate, minus the padded walkback O2 as time at that rate, minus the
 * 30 min reserve (suit.reserve.time). suitReadout and the return zone (returnZone.js) both use this one formula.
 * @param {number} o2G O2 left, grams
 * @param {number} walkbackO2G O2 of the walk home with the walkback pad, grams
 * @param {number} rateGs O2 rate that turns grams into time, g/s
 */
export function o2Margin(o2G, walkbackO2G, rateGs, c) {
  return o2G / rateGs - walkbackO2G / rateGs - c.reserveSec;
}

/**
 * EVA margin in seconds: the EVA time limit minus the EVA time so far minus the walkback time. The limit is
 * suit.eva_duration_max unless a caller passes a shorter one (the return zone passes the crew's planned time).
 */
export function evaMargin(elapsedSec, walkbackSec, c, limitSec = c.evaMaxSec) {
  return limitSec - elapsedSec - walkbackSec;
}

/** 'warning' at or under the warning margin (0 min), 'caution' under the caution margin (15 min), else 'nominal'. */
export function marginStatus(marginSec, c) {
  return marginSec <= c.warningSec ? 'warning' : marginSec < c.cautionSec ? 'caution' : 'nominal';
}

/** O2 rate of walking on the flat at mobility.speed.flat, g/s: the rate route.totals turns O2 into time with (legCosts.js). */
export function walkingO2RateGs(c) {
  return o2RateGs(metabolicPowerW(c.speedFlat, 0, c), c);
}

/**
 * Values for the store's suit section.
 * O2 margin = O2 time left - (walkback O2 with the pad, as time at the current rate) - 30 min reserve
 * (suit.alert.caution_margin note). EVA margin = suit.eva_duration_max - EVA time so far - walkback time.
 * The margin shown is the smaller of the two: at rest the O2 alone would last far past the 8 h EVA limit.
 * @param {{ elapsedSec?: number | null }} [options] elapsedSec: EVA time so far (mission.elapsedSec)
 */
export function suitReadout(state, walkback, c, { elapsedSec = 0 } = {}) {
  const rate = Math.max(state.o2RateSmoothGs, o2RateGs(c.pBaseW, c));
  const oxygenSec = state.o2G / rate;
  const o2MarginSec = o2Margin(state.o2G, walkback.o2G, rate, c);
  const elapsed = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  const evaMarginSec = evaMargin(elapsed, walkback.timeSec, c);
  const marginSec = Math.min(o2MarginSec, evaMarginSec);
  const status = marginStatus(marginSec, c);
  return {
    oxygenG: state.o2G,
    oxygenSec,
    oxygenPct: 100 * state.o2G / c.o2UsableG,
    batteryPct: 100 * state.batteryWh / c.batteryWh,
    pressurePsi: c.pressurePsi,
    metabolicW: state.powerW,
    effort: effortOf(state.powerW, c),
    walkbackSec: walkback.timeSec,
    walkbackO2G: walkback.o2G,
    marginSec,
    o2MarginSec,
    evaMarginSec,
    marginLimit: evaMarginSec < o2MarginSec ? 'eva' : 'o2',
    status,
  };
}
