/**
 * Keeps the return zone (src/sim/returnZone.js) up to date for every map that draws it: the mission table layer, the
 * helmet minimap and the wrist map. One worker, one zone, many readers.
 *
 * What it computes from the mission store:
 * - Before the EVA (Plan, eva.phase 'ready', no suit reading yet): the plan's zone from the habitat airlock with the
 *   crew's starting O2 and battery (route.budget.o2StartG, batteryStartWh) and the crew's usable time
 *   (route.budget.usableSec, the time available less the risk reserve).
 * - During the EVA: from the astronaut's true position (navigation.trueX/trueZ, as the suit runner's walkback), with
 *   suit.oxygenG and mission.elapsedSec, home being route.shelter while an event has sent the crew to one.
 * - Event modifiers from the event engine's alerts (zoneModifiers): an active storm or radiation alert snaps it tighter.
 *
 * It recomputes when the inputs move enough (5 m, 2 g of O2, 1 Wh of battery, 10 s of EVA time, any event, plan or
 * hazard change), at most once every 2 s, and at once when an event starts or ends, so the snap lands on the alert.
 * Plain JavaScript with no React.
 * The budget comes from the crew's needs (#282): route.budget's usable time, O2, battery, risk floor, and the work at
 * the stops still to do (route.waypoints workSec).
 */
import dustStorm from '../sim/events/dust-storm.json';
import lowOxygenCaution from '../sim/events/low-oxygen-caution.json';
import lowOxygenWarning from '../sim/events/low-oxygen-warning.json';
import radiation from '../sim/events/radiation.json';
import { HAZARDS_PATH } from '../data/provenance.js';
import { loadCostGrid, loadDataFile } from '../data/dataFiles.js';
import { SHELTERS_PATH } from '../sim/shelters.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { createReturnZoneClient } from '../sim/returnZoneClient.js';
import { zoneModifiers } from '../sim/returnZone.js';
import { truePosition } from '../sim/navigation.js';
import { DEFAULT_HABITAT } from '../sim/replan.js';
import { missionEventDefinitions } from '../sim/missions.js';
import { useMissionStore } from './store.js';

const EVENT_DEFINITIONS = [dustStorm, radiation, lowOxygenCaution, lowOxygenWarning];

/**
 * Recompute thresholds (our choice, SIM): metres moved, grams of O2 used, battery Wh used, seconds of EVA time, and the
 * shortest gap. 1 Wh is 0.13 % of the xEMU's 756 Wh, so a battery change at the table (1 % steps) always counts.
 */
export const ZONE_REFRESH = Object.freeze({ moveM: 5, o2G: 2, batteryWh: 1, elapsedSec: 10, minGapMs: 2000 });

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** A fresh memo for planOf. Each zone service keeps its own, so two stores never share a plan. */
const newPlanMemo = () => ({ budget: undefined, waypoints: undefined, fromIndex: -1, value: null });

/**
 * The plan's budget beyond time and O2 (route.budget, #282) and the stops still to work, for computeReturnZone's `plan`,
 * with its key. Kept while route.budget, route.waypoints and the next stop are the same objects, so the store writes
 * of a walk (several a second) build nothing. Without a memo it builds the plan every call.
 */
function planOf(s, fromIndex, planMemo = newPlanMemo()) {
  const budget = s.route?.budget, waypoints = s.route?.waypoints;
  if (planMemo.budget === budget && planMemo.waypoints === waypoints && planMemo.fromIndex === fromIndex) return planMemo.value;
  const stops = (waypoints ?? []).slice(fromIndex).filter((w) => finite(w?.x) && finite(w?.z) && w.workSec > 0)
    .map((w) => ({ x: w.x, z: w.z, workSec: w.workSec }));
  const plan = { marginFloor: budget?.marginFloor, marginFloorSec: budget?.marginFloorSec, batteryReserveWh: budget?.batteryReserveWh, stops };
  const value = { plan, key: JSON.stringify(plan) };
  Object.assign(planMemo, { budget, waypoints, fromIndex, value });
  return value;
}

/** A key of the active hazard areas: a moved, resized, added or switched off area changes it. */
function hazardKey(hazards) {
  return (hazards ?? []).map((h) => [h?.id, h?.x, h?.z, h?.radiusM, h?.active].join(',')).join(';');
}

/**
 * The zone's input for a store state, or null while it cannot be computed.
 * @param {object} s store state
 * @param {{ x: number, z: number }} habitat the HAB airlock entry of shelters.json
 * @param {object} c suit constants
 * @param {object} [memo] the caller's planOf memo, kept across calls on the same store
 */
export function zoneInput(s, habitat, c, memo) {
  const modifiers = zoneModifiers(s, missionEventDefinitions(s.needs?.objective, EVENT_DEFINITIONS));
  const budget = s.route?.budget;
  const evaLimitSec = finite(budget?.usableSec) ? budget.usableSec : undefined;
  const live = finite(s.suit?.oxygenG) && (s.mode === 'walk' || (s.eva?.phase && s.eva.phase !== 'ready'));
  if (!live) {
    const o2G = finite(budget?.o2StartG) ? budget.o2StartG : c.o2UsableG;
    const batteryWh = finite(budget?.batteryStartWh) ? budget.batteryStartWh : c.batteryWh;
    const { plan, key } = planOf(s, 1, memo);
    return {
      kind: 'plan', home: habitat, from: null, suit: { o2G, batteryWh, elapsedSec: 0 }, evaLimitSec, plan, planKey: key,
      modifiers: { hazards: modifiers.hazards, homeward: false }, hazardKey: hazardKey(modifiers.hazards), events: [], windowSec: null,
    };
  }
  const p = truePosition(s.navigation ?? {});
  const shelter = s.route?.shelter;
  const home = modifiers.homeward && finite(shelter?.x) && finite(shelter?.z) ? { x: shelter.x, z: shelter.z } : habitat;
  const from = finite(p.x) && finite(p.z) ? { x: p.x, z: p.z } : null;
  const elapsedSec = finite(s.mission?.elapsedSec) ? s.mission.elapsedSec : 0;
  const batteryWh = finite(s.suit?.batteryPct) ? (s.suit.batteryPct / 100) * c.batteryWh : undefined;
  const { plan, key } = planOf(s, Math.max(1, s.route?.nextIndex ?? 1), memo);
  return {
    kind: 'live', home, from, suit: { o2G: s.suit.oxygenG, batteryWh, elapsedSec }, evaLimitSec, plan, planKey: key,
    modifiers: { hazards: modifiers.hazards, homeward: modifiers.homeward, shelterWithinSec: modifiers.shelterWithinSec ?? undefined },
    hazardKey: hazardKey(modifiers.hazards), events: modifiers.events, windowSec: modifiers.windowSec,
  };
}

/** Whether the change from `a` to `b` is worth a new zone, and whether it is urgent (an event started or ended). */
export function zoneChange(a, b) {
  if (!b) return { needed: false, urgent: false };
  if (!a) return { needed: true, urgent: true };
  const eventKey = (x) => [x.kind, x.events.join(','), x.home.x, x.home.z, x.evaLimitSec, x.hazardKey, x.planKey].join(':');
  if (eventKey(a) !== eventKey(b)) return { needed: true, urgent: true };
  const pa = a.from ?? a.home, pb = b.from ?? b.home;
  const needed = Math.hypot(pa.x - pb.x, pa.z - pb.z) >= ZONE_REFRESH.moveM
    || Math.abs(a.suit.o2G - b.suit.o2G) >= ZONE_REFRESH.o2G
    || (finite(a.suit.batteryWh) || finite(b.suit.batteryWh)
      ? !(Math.abs(a.suit.batteryWh - b.suit.batteryWh) < ZONE_REFRESH.batteryWh) : false)
    || Math.abs(a.suit.elapsedSec - b.suit.elapsedSec) >= ZONE_REFRESH.elapsedSec
    // the shelter window closes fast (17.5 s in the first sortie): follow it every 2 s
    || (Number.isFinite(b.modifiers.shelterWithinSec) && Math.abs((a.modifiers.shelterWithinSec ?? Infinity) - b.modifiers.shelterWithinSec) >= 2);
  return { needed, urgent: false };
}

const services = new WeakMap();   // one service, one worker, per store

/**
 * The zone service of a store. `subscribe(listener)` calls the listener with the latest zone ({ ...ReturnZone, kind,
 * events }) now if there is one and on every new zone; it returns an unsubscribe function. The worker starts on the
 * first subscriber and the service stays up for the page.
 * @param {{ getState: Function, subscribe: Function }} [store] the mission store (useMissionStore by default)
 * @param {{ clientFactory?: () => object, load?: () => Promise<[object, object, object | null]> }} [deps] for tests: the
 *   worker client and the data files (cost grid, hazards.json, shelters.json)
 * @returns {{ subscribe: (listener: (zone: object) => void) => () => void, get: () => object | null }}
 */
export function returnZoneService(store = useMissionStore, { clientFactory = createReturnZoneClient, load = loadZoneData } = {}) {
  const existing = services.get(store);
  if (existing) return existing;
  const listeners = new Set();
  let zone = null, started = false, client = null, habitat = DEFAULT_HABITAT, constants = null;
  let lastInput = null, lastAt = -Infinity, timer = null, busy = false;
  const planMemo = newPlanMemo();

  async function run(input) {
    busy = true;
    lastInput = input; lastAt = Date.now();
    try {
      const next = await client.compute({ home: input.home, from: input.from, suit: input.suit, evaLimitSec: input.evaLimitSec, plan: input.plan, modifiers: input.modifiers });
      if (next) {
        zone = { ...next, kind: input.kind, events: input.events, windowSec: input.windowSec, budget: store.getState().route?.budget ?? null };
        if (import.meta.env?.DEV) globalThis.__returnZone = zone;
        for (const listener of listeners) listener(zone);
      }
    } catch (error) {
      console.warn('return zone:', error.message);
    } finally {
      busy = false;
      check();
    }
  }

  function check() {
    if (!constants || busy) return;
    const input = zoneInput(store.getState(), habitat, constants, planMemo);
    const change = zoneChange(lastInput, input);
    if (!change.needed) return;
    const wait = change.urgent ? 0 : lastAt + ZONE_REFRESH.minGapMs - Date.now();
    if (wait <= 0) { clearTimeout(timer); timer = null; run(input); return; }
    if (!timer) timer = setTimeout(() => { timer = null; check(); }, wait);
  }

  function start() {
    if (started) return;
    started = true;
    // development only: ?zone=off leaves the zone out, for a frame-rate baseline (scripts/qa-return-zone.mjs --baseline)
    if (import.meta.env?.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('zone') === 'off') return;
    load().then(([grid, hazards, shelters]) => {
      const hab = shelters?.shelters?.find((s) => s.id === 'HAB');
      if (hab && finite(hab.x) && finite(hab.z)) habitat = { x: hab.x, z: hab.z };
      constants = suitConstantsFromHazards(hazards);
      client = clientFactory();
      client.setGrid(grid, constants);
      store.subscribe(check);
      check();
    }).catch((error) => console.warn('return zone could not start:', error.message));
  }

  const service = {
    subscribe(listener) {
      listeners.add(listener);
      start();
      if (zone) listener(zone);
      return () => listeners.delete(listener);
    },
    get: () => zone,
  };
  services.set(store, service);
  return service;
}

function loadZoneData() {
  return Promise.all([loadCostGrid(), loadDataFile(HAZARDS_PATH), loadDataFile(SHELTERS_PATH).catch(() => null)]);
}
