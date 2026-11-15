// What the habitat's wall screens and planning table show (#47), built from the mission store.
// Plain functions, no React and no three.js: habitatScreenData() turns a store snapshot into plain data, and
// connectHabitatScreens() sends it to the engine (engine.setHabitatScreens) at most SCREENS_HZ times per second.
// The engine draws it (src/engine/habitatScreens.js) and only redraws the screens while someone is near them.
//
// Every value carries its source tag (DATA, DERIVED or SIM) from the store's `sources`, like the HUD. The cabin is not
// simulated, so its values are fixed nominal numbers, tagged SIM.
import { useMissionStore } from './store.js';

export const SCREENS_HZ = 4;

// SIM: a pressurised cabin at the habitat's nominal state. Nothing in the simulation changes these yet.
export const CABIN = Object.freeze({ o2Pct: 20.9, co2Pct: 0.04, pressureKPa: 70.3, tempC: 21.5 });

const LEVEL_RANK = { info: 0, caution: 1, warning: 2, danger: 3 };

/** The source tag of a store path, or null when the store has no source for it. */
const tagOf = (sources, path) => (sources && sources[path] && sources[path].tag) || null;
const num = (v) => (Number.isFinite(v) ? v : null);

/** The most severe active alert, or null. @param {object} alerts the store's `alerts` */
export function topAlert(alerts) {
  let top = null;
  for (const a of Object.values(alerts || {})) {
    if (!a || a.active === false) continue;
    if (!top || (LEVEL_RANK[a.level] ?? 0) > (LEVEL_RANK[top.level] ?? 0)) top = a;
  }
  return top ? { id: top.eventId || top.id, level: top.level, text: top.text } : null;
}

/**
 * Plain data for the five wall screens and the planning table.
 * @param {ReturnType<typeof import('./store.js').createInitialState>} s a store snapshot
 */
export function habitatScreenData(s) {
  const src = s.sources || {}, suit = s.suit || {}, env = s.environment || {}, mate = (s.crew || [])[0] || null;
  const alert = topAlert(s.alerts);
  return {
    mission: { sol: num(s.mission?.sol), lmst: s.mission?.lmst ?? null, elapsedSec: num(s.mission?.elapsedSec), phase: s.eva?.phase ?? null },
    cabin: { ...CABIN, tag: 'SIM' },
    team: [
      {
        name: 'EV1',
        o2Pct: num(suit.oxygenPct), batteryPct: num(suit.batteryPct), metabolicW: num(suit.metabolicW),
        marginSec: num(suit.marginSec), status: suit.status ?? null,
        tag: tagOf(src, 'suit.oxygenPct'),
      },
      mate && {
        name: mate.name || mate.id || 'EV2',
        o2Pct: num(mate.oxygenPct), batteryPct: num(mate.batteryPct), rangeM: num(mate.rangeM),
        status: mate.status ?? null, separation: mate.separation ?? null,
        tag: tagOf(src, 'crew.0.oxygenPct'),
      },
    ].filter(Boolean),
    weather: {
      tau: num(env.dustOpacity), windMs: num(env.windMs), tempC: num(env.tempC), pressurePa: num(env.pressurePa),
      doseRateUgyH: num(env.doseRateUgyH),
      tags: {
        tau: tagOf(src, 'environment.dustOpacity'), windMs: tagOf(src, 'environment.windMs'), tempC: tagOf(src, 'environment.tempC'),
        pressurePa: tagOf(src, 'environment.pressurePa'), doseRateUgyH: tagOf(src, 'environment.doseRateUgyH'),
      },
      source: src['environment.tempC']?.label ?? src['environment.tempC']?.source ?? null,          // e.g. the MEDA sol replayed
      doseSource: src['environment.doseRateUgyH']?.label ?? src['environment.doseRateUgyH']?.source ?? null,   // RAD, Gale crater
    },
    alert,
    stormHold: !!(s.alerts && s.alerts['dust-storm'] && s.alerts['dust-storm'].active !== false),
    route: {
      path: s.route?.path ?? null,
      waypoints: (s.route?.waypoints || []).map((w) => ({ x: w.x, z: w.z, name: w.name })),
      visited: s.route?.visited ?? [],
      nextIndex: s.route?.nextIndex ?? 0,
      shelter: s.route?.shelter ? { x: s.route.shelter.x, z: s.route.shelter.z } : null,
      player: Number.isFinite(s.navigation?.x) && Number.isFinite(s.navigation?.z)
        ? { x: s.navigation.x, z: s.navigation.z, headingDeg: num(s.navigation.headingDeg) } : null,
    },
  };
}

/**
 * Sends the screen data to the engine, at most SCREENS_HZ times per second and only when the store changed.
 * @param {{ setHabitatScreens: (data: object) => void }} engine
 * @returns {() => void} disconnect
 */
export function connectHabitatScreens(engine, store = useMissionStore) {
  let dirty = true;
  const unsubscribe = store.subscribe(() => { dirty = true; });
  const push = () => { if (!dirty) return; dirty = false; engine.setHabitatScreens(habitatScreenData(store.getState())); };
  push();
  const timer = setInterval(push, 1000 / SCREENS_HZ);
  return () => { unsubscribe(); clearInterval(timer); };
}
