/**
 * Connects EV2, the crewmate (src/sim/crewmate.js, #288), to the mission store and the engine.
 *
 * - Builds the crewmate's `sense` from the store, once per store change: crew size, EVA phase, route path, the science
 *   stops on the route, the active alerts, the shelter, EV2's suit readout (crew[0]) and the radio link.
 * - Installs the crewmate as the engine's partner source (engine.setPartnerSource), once per engine: EngineView calls
 *   startCrewmate when the scene is ready, so a restart keeps it. A network player who takes the EV2 seat replaces it
 *   through the same call.
 * - Writes each callout to `comms.partner` for the HUD radio line (src/hud/CrewmateRadio.jsx).
 *
 * Adapter for the branches in flight. Each field reads the newer shape first and falls back to what main has today:
 * - crew size: `needs.crew` from the crew's needs (#282); without `needs` EV2 is present, as on main.
 * - EVA phase: `stage` of the habitat-first flow ('habitat' | 'egress' | 'eva' | 'ingress' | 'debrief'), else
 *   `eva.phase` ('ready' | 'active' | 'ended').
 * - science stops: every stops.json entry, `stops` and the `route_stops` that #282 adds, matched to `route.waypoints`
 *   by waypoint name, the way the planner names them.
 *
 * Plain JavaScript: no React and no three.js.
 */
import { useMissionStore } from './store.js';
import { loadDataFile } from '../data/dataFiles.js';
import { provenance as appRegistry } from '../data/provenance.js';
import { STOPS_PATH } from '../data/stops.js';
import { CREW } from '../engine/crew.js';
import { CREWMATE, createCrewmatePartner } from '../sim/crewmate.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Registry entries for the numbers the callouts say that no other writer declares (src/data/provenance.js define). */
export const CREWMATE_SOURCES = Object.freeze({
  'crewmate.slopeAheadDeg': {
    tag: 'DERIVED', label: 'HiRISE DTM', short: 'HiRISE DTM',
    source: 'steepest slope of the HiRISE height map on the route ahead of EV2 (engine.slopeAt), sampled every metre over 15 m',
    from: { credits: 'hirise-dtm-jezero' },
  },
  'crew.0.marginSec': {
    tag: 'DERIVED', label: 'Suit model', short: 'Suit model',
    source: 'EV2\'s margin from the suit model fed by its own movement: O2 time left minus the walkback minus the 30 min reserve, or the EVA time left',
    from: { hazards: ['suit.o2.primary_usable', 'suit.reserve.time', 'suit.reserve.walkback_pad', 'suit.eva_duration_max'] },
  },
});

/** EV2 exists only with a crew of two or more (#282 needs.crew). Without the field, as on main, it is present. */
export function crewmatePresent(state) {
  const crew = state?.needs?.crew;
  return !finite(crew) || crew >= 2;
}

/** 'pre' before the EVA, 'eva' on the surface, 'post' after it. */
export function crewmatePhase(state) {
  const stage = state?.stage;
  if (typeof stage === 'string') return stage === 'eva' ? 'eva' : stage === 'ingress' || stage === 'debrief' ? 'post' : 'pre';
  const phase = state?.eva?.phase;
  return phase === 'active' ? 'eva' : phase === 'ended' ? 'post' : 'pre';
}

/**
 * The stops EV2 knows, from the parsed stops.json: { waypoint, name, radiusM } per entry with a waypoint name.
 * @param {object | null} data
 */
export function stopCatalogue(data) {
  const list = [...(Array.isArray(data?.stops) ? data.stops : []), ...(Array.isArray(data?.route_stops) ? data.route_stops : [])];
  return list
    .filter((s) => s && typeof s.waypoint === 'string')
    .map((s) => ({ id: s.id ?? s.waypoint, waypoint: s.waypoint, name: s.name ?? s.waypoint, radiusM: Math.max(CREWMATE.STOP_RADIUS_M, finite(s.arrival_radius?.value) ? s.arrival_radius.value : 0) }));
}

/**
 * What the crewmate knows this frame, from one store snapshot.
 * @param {object} state the mission store state
 * @param {Array<{ id: string, waypoint: string, name: string, radiusM: number }>} catalogue from stopCatalogue
 */
export function crewmateSense(state, catalogue = []) {
  const route = state.route ?? {}, alerts = state.alerts ?? {}, partner = Array.isArray(state.crew) ? state.crew[0] : null;
  const byWaypoint = new Map(catalogue.map((s) => [s.waypoint, s]));
  const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
  const stops = [];
  waypoints.forEach((w) => {
    const c = w && byWaypoint.get(w.name);
    if (c && finite(w.x) && finite(w.z)) stops.push({ id: c.id, name: c.name, x: w.x, z: w.z, radiusM: c.radiusM });
  });
  const next = waypoints[route.nextIndex];
  const nextCat = next && byWaypoint.get(next.name);
  return {
    present: crewmatePresent(state),
    phase: crewmatePhase(state),
    paused: state.mission?.paused === true,
    missionSec: state.mission?.elapsedSec ?? null,
    path: Array.isArray(route.path) && route.path.length >= 2 ? route.path : null,
    stops,
    nextStop: nextCat ? { name: nextCat.name, rangeM: state.navigation?.waypointRangeM ?? null } : null,
    storm: alerts['dust-storm']?.active === true,
    radiation: alerts.radiation?.active === true,
    shelter: route.shelter && finite(route.shelter.x) && finite(route.shelter.z) ? route.shelter : null,
    own: partner ? { marginSec: partner.marginSec, status: partner.status } : null,
    rangeM: partner?.rangeM ?? null,
    link: partner ? partner.link !== false : true,
  };
}

/**
 * Start EV2 the crewmate.
 * @param {{ setPartnerSource: Function, slopeAt?: Function }} engine
 * @param {{ store?: typeof useMissionStore, loadStops?: () => Promise<object>, registry?: object, now?: () => number }} [options]
 * @returns {{ stop: () => void, source: object | null }}
 */
export function startCrewmate(engine, { store = useMissionStore, loadStops = () => loadDataFile(STOPS_PATH), registry = appRegistry, now = () => Date.now() } = {}) {
  if (!engine || typeof engine.setPartnerSource !== 'function') return { stop() {}, source: null };
  let stopped = false, catalogue = [], seen = null, cached = null;
  registry.define(CREWMATE_SOURCES);
  Promise.resolve().then(loadStops).then((data) => { catalogue = stopCatalogue(data); seen = null; }, (e) => console.warn('stops.json not loaded, EV2 knows no science stop:', e));

  const sense = () => {
    const s = store.getState();
    if (s !== seen) { seen = s; cached = crewmateSense(s, catalogue); }
    return cached;
  };
  const slopeAt = typeof engine.slopeAt === 'function' ? (x, z) => { try { return engine.slopeAt(x, z); } catch { return null; } } : null;
  const source = createCrewmatePartner({
    id: CREW[1].id, color: CREW[1].color, sense, slopeAt,
    onCallout: (c) => { if (!stopped) store.setState((s) => ({ comms: { ...(s.comms ?? {}), partner: { ...c, from: CREW[1].id, atMs: now() } } })); },
  });
  try { engine.setPartnerSource(source); } catch (e) { console.error('EV2 crewmate not started:', e); return { stop() {}, source: null }; }
  return { stop() { stopped = true; }, source };
}
