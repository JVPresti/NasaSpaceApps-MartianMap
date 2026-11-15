// Mission store: one snapshot of everything the interface shows. The simulation writes it a few times per second;
// React components subscribe to the slices they need. Contract and field list: docs/STATE_AND_ENGINE.md.
// No React and no three.js here: the hook comes from Zustand, and the simulation can use the store without React.
import { create } from 'zustand';
import { createInitialEvaState } from './eva.js';
import { LOOK_DEFAULTS, clampLookSettings, readLookSettings, writeLookSettings } from '../engine/lookSettings.js';
import { checkNeeds, DEFAULT_NEEDS, OBJECTIVE_DEFAULTS } from '../sim/missionNeeds.js';
import { deleteRoute, readRouteLibrary, recordRouteRun, routeSignature, saveRoute, writeRouteLibrary } from '../plan/routeLibrary.js';

/** Plain data only. Units are in the field names. Coordinates: x east, z south, metres from Cheyava Falls. */
export function createInitialState() {
  return {
    // 'walk' (first person) or 'plan' (the mission table is open). The astronaut starts inside the habitat on foot.
    mode: 'walk',
    // Where the astronaut is in the flow: 'habitat' | 'egress' | 'eva' | 'debrief' (src/state/flow.js).
    stage: 'habitat',
    // Inside the habitat, written by the engine bridge 5 times per second while the stage is 'habitat': the walk
    // zone the astronaut stands in ('main', 'airlock', ...), or null outside. The habitat HUD reads it.
    habitat: { zone: null },
    // Clock fields: docs/STATE_AND_ENGINE.md. anchorMs is the wall timestamp elapsedSec is measured from;
    // startedAtMs is the first start. The mission clock fills anchorMs and the fields after it when it starts.
    mission: {
      // held: the clock is stopped because the astronaut is in the habitat before the EVA, not because a menu is open
      // (#260). Walking and the table's prompt go on while held; a pause menu clears it.
      startedAtMs: null, elapsedSec: 0, paused: false, held: false, sol: null, lmst: null,
      anchorMs: null, timeScale: 1, initialSol: null, initialLmst: null, longitudeDeg: null, sky: null,
    },
    suit: { oxygenG: null, oxygenSec: null, oxygenPct: null, batteryPct: null, pressurePsi: null, metabolicW: null, effort: null, walkbackSec: null, walkbackO2G: null, marginSec: null, status: null },
    navigation: { x: null, z: null, trueX: null, trueZ: null, headingDeg: null, slopeDeg: null, waypointRangeM: null, waypointBearingDeg: null, errorM: null, fixMode: null, lastFixSec: null },   // x/z: the estimate the HUD shows (#42); trueX/trueZ: the true position, engine bridge only
    // stops, dropped, planReasons, budget, weights: the plan from the crew's needs (src/sim/missionNeeds.js, written by
    // src/plan/useRoutePlanner.js): stops chosen in walking order, stops dropped and why, the plan's reason codes, the
    // budget and the risk weights; explain: why each leg bends (#246, src/sim/routeExplain.js), one entry per route.legs
    // entry. Codes and numbers only: the table writes the sentences.
    route: { waypoints: [], path: null, nextIndex: 0, visited: [], distanceM: null, climbM: null, steepestSlopeDeg: null, etaSec: null, reason: null, shelter: null, legs: [], totals: null, decision: 'pending', skipped: [], profiles: null, profile: 'fastest', stops: [], dropped: [], planReasons: [], budget: null, weights: null, explain: [], manual: false },   // shelter: the entry of shelters.json the re-planner chose, while an event is active; legs and totals: src/sim/legCosts.js; profiles and profile: the routes the table compares and the one chosen (#245, src/sim/routeProfiles.js); manual: a saved route was loaded (#357), so Plan mode plans its waypoints instead of the crew's needs
    // The crew's needs at the mission table (#265, goal 2). setNeeds changes them until Begin EVA (locked: beginEgress in
    // src/state/flow.js, at the start of the airlock cycle); the route re-plans from them in Plan mode.
    needs: { ...DEFAULT_NEEDS, locked: false },
    // #357, written by the saved-route actions below: routes the crew saved at the mission table, each with its risk
    // and success record. Persisted in localStorage ('marswalk.routes'), read once at load like the look settings;
    // a reset keeps the library (routes are crew property, not mission state).
    routeLibrary: { list: [] },
    environment: { dustOpacity: 0, tempC: null, windMs: null, pressurePa: null, doseRateUgyH: null, doseUgy: null },
    // Active hazard areas for the minimap (#60): [{ id, x, z, radiusM, active }], metres. Empty means
    // "no zone known", not "safe". No writer yet; the event work (#24-#26) fills it. The minimap draws
    // only active === true entries with a finite centre and radiusM > 0.
    // off: ids of events switched off at the mission table before the EVA (#11). The event runner leaves them out.
    hazards: { zones: [], off: [] },
    alerts: {},                                     // { [eventId]: { id, eventId, level, text, startedAtSec, active } | null }
    crew: [],                                       // [{ id, name, color, x, z, oxygenPct, batteryPct }]
    // #36, written by src/state/sampling.js: samples secured this EVA, the checklist of the sample in progress, and the engine's
    // sampling status (what the crosshair is on, the clip phase, the partner's case and what each input does), 5 times per second
    sampling: { count: 0, photos: 0, samples: [], checklist: { photo: false, texture: false, sample: false, seal: false, photoAt: null, siteAt: null, sampleId: null }, status: null },
    // #43, written by src/state/eva.js: statistics and history for the debrief. `phase` is 'ready' until the astronaut
    // first walks outside the habitat arrival area, 'active' during the EVA and 'ended' when they re-enter the HAB;
    // `summary` is then a frozen snapshot with the outside time, distance, minima, events, route changes, samples and
    // current radiation reading. The HAB entry is the one in shelters.json, not the HAB route waypoint.
    eva: createInitialEvaState(),
    // #71, written by src/state/finds.js: points the player marked by pointing, at most MAX_FINDS (src/sim/findDetour.js).
    // list: [{ id, label, x, z, status: 'pricing' | 'priced' | 'error' | 'accepted', detour, error }]; activeId: the find
    // the decision card shows; routeKey: waypointKey of the waypoints a Walk re-plan already routed, so Plan does not start over.
    finds: { list: [], seq: 0, activeId: null, routeKey: null },
    view: { layer: 0, sky: 'late_afternoon', skyBlend: 0, slopeGrid: false },   // what the engine draws; #59 demo starts in late-afternoon light
    // Player preferences, not mission state: the look settings (#102) are remembered per browser and survive
    // a reset; sensitivity multiplies the base look rate (0.5-2, step 0.1) and invertY flips only the pitch.
    // visorFrame (#28): the helmet bezel and alert ring over the Walk view; V turns it off for screenshots.
    settings: { look: { ...LOOK_DEFAULTS }, visorFrame: true },
    sources: {},                                    // { 'environment.tempC': { tag: 'DATA' | 'DERIVED' | 'SIM', source } }
  };
}

// Read once at load, like the saved language in src/i18n/index.js: a missing, blocked or corrupt entry leaves the defaults.
const savedLook = readLookSettings();
const savedRoutes = readRouteLibrary();

/** React hook and store. Select slices: useMissionStore((s) => s.suit.oxygenPct). */
export const useMissionStore = create(() => {
  const initial = createInitialState();
  return {
    ...initial,
    settings: { ...initial.settings, look: savedLook },
    routeLibrary: { list: savedRoutes },
  };
});

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
function splitPath(path) {
  if (typeof path !== 'string' || !path) throw new Error('store path must be a non-empty string');
  const parts = path.split('.');
  for (const p of parts) if (!p || FORBIDDEN.has(p)) throw new Error('invalid store path: ' + path);
  return parts;
}

function getIn(obj, parts) {
  let o = obj;
  for (const p of parts) { if (o === null || typeof o !== 'object' || !Object.hasOwn(o, p)) return undefined; o = o[p]; }
  return o;
}

// Immutable write: copies every object on the path, so selectors on any parent see a new reference.
function setIn(obj, parts, value) {
  const [head, ...rest] = parts;
  const base = obj !== null && typeof obj === 'object' ? obj : {};
  const copy = Array.isArray(base) ? [...base] : { ...base };   // crew.0.x keeps crew an array
  copy[head] = rest.length ? setIn(base[head], rest, value) : value;
  return copy;
}

/**
 * Adapter with the contract of docs/EVENT_ENGINE.md: get(path), set(path, value), snapshot().
 * Pass it as the store of createEventEngine. Writes go through Zustand, so subscribed components update.
 */
export function createStoreAdapter(store = useMissionStore) {
  return {
    get: (path) => getIn(store.getState(), splitPath(path)),
    set: (path, value) => { const parts = splitPath(path); store.setState((s) => setIn(s, parts, value), true); },
    snapshot: () => structuredClone(store.getState()),
  };
}

export const storeAdapter = createStoreAdapter();

// Small actions for the interface.
// Walking no longer begins the EVA: the astronaut walks in the habitat first (habitat-first flow, #260). Begin EVA
// (beginEgress in src/state/flow.js) locks the crew's needs.
// During the airlock cycle (stage 'egress') the mode stays 'walk' and every switch is refused: the engine moves the
// player outside at the dark point, so a table opened now would leave store and engine disagreeing.
// Returns false when the switch was refused.
export const setMode = (mode) => {
  if (mode !== 'walk' && mode !== 'plan') throw new Error('mode must be walk or plan');
  if (useMissionStore.getState().stage === 'egress') return false;
  useMissionStore.setState({ mode });
  return true;
};

/**
 * Change the crew's needs at the mission table (src/sim/missionNeeds.js): objective ('sortie' | 'cheyava' |
 * 'bright-angel'), crew (1 | 2), timeMin, o2Pct, batteryPct and risk ('cautious' | 'standard' | 'bold'). Numbers are
 * clamped to their range; an unknown key or value throws. A new objective without a timeMin in the same update takes
 * that objective's default time (OBJECTIVE_DEFAULTS: 30 min for the sortie, 2 h for the full EVA). Once the EVA has
 * begun the needs are locked and nothing changes. The terrain preference is the route profile (chooseRouteProfile),
 * not a need.
 * @param {object} partial
 * @returns {boolean} true when the needs changed
 */
export const setNeeds = (partial) => {
  const checked = checkNeeds(partial);
  let changed = false;
  useMissionStore.setState((s) => {
    const newObjective = checked.objective !== undefined && checked.objective !== s.needs.objective;
    const update = newObjective && checked.timeMin === undefined ? { ...checked, ...OBJECTIVE_DEFAULTS[checked.objective] } : checked;
    if (s.needs.locked || Object.entries(update).every(([k, v]) => s.needs[k] === v)) return s;
    changed = true;
    // A change of needs takes the plan back from a saved route (#357): the route comes from the crew's needs again.
    return { needs: { ...s.needs, ...update }, route: { ...s.route, manual: false } };
  });
  return changed;
};
export const setLayer = (layer) => storeAdapter.set('view.layer', layer);
export const setSky = (sky) => storeAdapter.set('view.sky', sky);
export const setRoutePath = (path) => storeAdapter.set('route.path', path);
/** @param {'pending' | 'go' | 'no-go'} decision */
export const setRouteDecision = (decision) => {
  if (!['pending', 'go', 'no-go'].includes(decision)) throw new Error('route decision must be pending, go or no-go');
  storeAdapter.set('route.decision', decision);
};
/**
 * The route with one of its planned profiles (#245) as the route to walk: the path and the planner's numbers. Walk,
 * the per-leg costs (src/sim/legCosts.js) and go / no-go all follow route.path. Null when that profile has no route.
 * @param {object} route the store's route
 * @param {string} id profile id (src/sim/routeProfiles.js)
 * @returns {object | null}
 */
export function withRouteProfile(route, id) {
  const profile = route?.profiles?.[id];
  if (!profile?.ok || !Array.isArray(profile.path) || profile.path.length < 2) return null;
  return {
    ...route,
    profile: id,
    path: profile.path,
    distanceM: profile.distanceM,
    climbM: profile.climbM,
    steepestSlopeDeg: profile.steepestSlopeDeg,
    etaSec: profile.timeSec,
    explain: Array.isArray(profile.explain) ? profile.explain : [],
    reason: 'Planned route',
    nextIndex: 0,
    visited: [],
  };
}
/**
 * Choose a route profile at the mission table (#245). Does nothing when that profile has no route, or while a solo crew
 * walks the radio-contact route (src/sim/missionNeeds.js holds it there): route.profile then keeps the choice made for a
 * pair, which is the route again when the crew goes back to two (round 1 review, P22).
 */
export const chooseRouteProfile = (id) => {
  useMissionStore.setState((state) => {
    if (state.needs?.crew === 1 && state.route.profiles?.radio?.ok) return state;
    if (state.route.profile === id && state.route.path === state.route.profiles?.[id]?.path) return state;
    const route = withRouteProfile(state.route, id);
    return route ? { route } : state;
  });
};
/** Switch an event on or off for this run (mission table, #11). Read once, when the EVA's event runner starts. */
export const setHazardEnabled = (eventId, enabled) => {
  useMissionStore.setState((state) => {
    const off = (state.hazards.off ?? []).filter((id) => id !== eventId);
    return { hazards: { ...state.hazards, off: enabled ? off : [...off, eventId] } };
  });
};

/**
 * Save the currently planned route under a name (#357). Needs a planned path and at least one waypoint; the route
 * snapshot keeps its waypoints, path, distance, climb and risk, and starts an empty success record.
 * @param {string} name
 * @returns {object | null} the saved entry, or null when there was nothing to save (no name, no plan)
 */
export const saveCurrentRoute = (name) => {
  const state = useMissionStore.getState();
  const list = saveRoute(state.routeLibrary.list, { name, route: state.route, nowMs: Date.now() });
  if (list === state.routeLibrary.list) return null;
  writeRouteLibrary(list);
  useMissionStore.setState((s) => ({ routeLibrary: { ...s.routeLibrary, list } }));
  return list[0];
};

/**
 * Save the route an EVA just ended on, from the debrief (#364): the plan as it stands, with the finds added during the
 * walk, joins the library under a name, and this EVA becomes its first run — attempt, completion when every waypoint
 * was reached, samples, distance and dose. @param {string} name @param {object | null} summary the frozen EVA summary
 * @returns {object | null} the saved entry, or null when there was nothing to save
 */
export const saveEvaRoute = (name, summary) => {
  const state = useMissionStore.getState();
  const list = saveRoute(state.routeLibrary.list, { name, route: state.route, nowMs: Date.now() });
  if (list === state.routeLibrary.list) return null;
  const entry = list[0];
  writeRouteLibrary(list);
  useMissionStore.setState((s) => ({ routeLibrary: { ...s.routeLibrary, list } }));
  const waypoints = state.route?.waypoints;
  const completed = Array.isArray(waypoints) && waypoints.length > 0
    && (state.route?.visited?.length ?? 0) >= waypoints.length;
  // The new entry is the newest, so recordRouteRun finds it by signature before any older route with the same stops.
  recordRouteRun(useMissionStore, routeSignature(entry), summary, { completed });
  return entry;
};

/** Delete one saved route (#357). @returns {boolean} true when it was deleted */
export const deleteSavedRoute = (id) => {
  const state = useMissionStore.getState();
  const list = deleteRoute(state.routeLibrary.list, id);
  if (list === state.routeLibrary.list) return false;
  writeRouteLibrary(list);
  useMissionStore.setState((s) => ({ routeLibrary: { ...s.routeLibrary, list } }));
  return true;
};

/**
 * Put a saved route back on the table (#357): its waypoints and path become the current plan (the planner re-plans
 * from the waypoints) and the decision goes back to pending. @returns {boolean} true when the route was applied
 */
export const applySavedRoute = (id) => {
  const state = useMissionStore.getState();
  const entry = state.routeLibrary.list.find((item) => item.id === id);
  if (!entry) return false;
  useMissionStore.setState((s) => ({
    route: {
      ...s.route,
      // manual: the planner keeps these waypoints (src/plan/useRoutePlanner.js); a change of needs takes the plan back.
      manual: true,
      waypoints: entry.waypoints.map((w) => ({ ...w })),
      path: entry.path.map((point) => [...point]),
      distanceM: entry.distanceM,
      climbM: entry.climbM,
      steepestSlopeDeg: entry.risk?.maxSlopeDeg ?? null,
      etaSec: null,
      reason: null,
      decision: 'pending',
      nextIndex: 0,
      visited: [],
      skipped: [],
      shelter: null,
    },
  }));
  return true;
};
// A restart must not lose the player's look settings (#102): the preference survives resetStore, and a new
// page load re-reads it from 'marswalk.look'.
/**
 * Back to a fresh mission state. The look settings always survive. With keepNeeds (the debrief's Restart and the pause
 * menu's End the EVA, product decision D9) the crew's six needs and the route profile chosen at the table survive too,
 * unlocked for the next EVA; everything else, the hazard switches included, starts over. A page load starts from the
 * defaults (the first sortie).
 * @param {{ keepNeeds?: boolean }} [options]
 */
export const resetStore = ({ keepNeeds = false } = {}) => useMissionStore.setState((s) => {
  const fresh = createInitialState();
  const kept = { settings: s.settings, routeLibrary: s.routeLibrary };
  if (!keepNeeds) return { ...fresh, ...kept };
  return {
    ...fresh,
    ...kept,
    needs: { ...s.needs, locked: false },
    route: { ...fresh.route, profile: s.route.profile },
  };
}, true);

/**
 * Partial update of the look preference (#102): clamps, writes the store and saves it in this browser.
 * Storage failures are silent; the value still applies for the session.
 * @param {{ sensitivity?: number, invertY?: boolean }} patch
 * @returns {{ sensitivity: number, invertY: boolean }} the stored value
 */
export const setLookSettings = (patch) => {
  const current = useMissionStore.getState().settings.look;
  const next = clampLookSettings({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
  useMissionStore.setState((s) => ({ settings: { ...s.settings, look: next } }));
  writeLookSettings(next);
  return next;
};

/**
 * Show or hide the visor frame and its alert ring (#28), for example for screenshots. Session only; it survives a
 * restart like the other settings.
 * @param {boolean} [on] omit to toggle
 * @returns {boolean} the new value
 */
export const setVisorFrame = (on) => {
  const next = typeof on === 'boolean' ? on : !useMissionStore.getState().settings.visorFrame;
  useMissionStore.setState((s) => ({ settings: { ...s.settings, visorFrame: next } }));
  return next;
};

// Mission clock controls. The clock runner subscribes to `mission.paused` and `mission.timeScale`, so these
// actions (and a direct storeAdapter.set / setState with the same paths) are anchored at the exact moment they
// happen. The clock never overwrites a pause with its own value.
export const setMissionPaused = (paused) => {
  if (typeof paused !== 'boolean') throw new Error('mission.paused must be a boolean');
  useMissionStore.setState((s) => ({ mission: { ...s.mission, paused, held: false } }));
};
export const pauseMission = () => setMissionPaused(true);
export const resumeMission = () => setMissionPaused(false);
/** The habitat before the EVA (#260): the clock stays stopped while the astronaut walks and plans. */
export const holdMission = () => useMissionStore.setState((s) => ({ mission: { ...s.mission, paused: true, held: true } }));
export const setMissionTimeScale = (scale) => {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) throw new Error('mission.timeScale must be a finite number greater than 0');
  storeAdapter.set('mission.timeScale', scale);
};
