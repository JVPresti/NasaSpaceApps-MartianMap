// Unexpected finds (#71, plan section 3.4 scenario 3): the store side of marking a rock by pointing.
// markFind drops a marker, priceFind asks the shared planner worker what the detour costs (src/sim/findDetour.js),
// acceptFind adds the find to route.waypoints and re-plans from the player, dismissFind removes it.
// Accepted finds are ordinary waypoints: arrival, per-leg costs, the elevation profile and the Plan map pick them up.
// The actions take the store and the planner calls as arguments, so the tests run without a worker.
import { provenance } from '../data/provenance.js';
import { waypointKey } from '../plan/routePlan.js';
import { findLabel, findSources, findWaypointName, insertFindWaypoint, MAX_FINDS } from '../sim/findDetour.js';
import { applyPlannedRoute } from '../sim/routeUpdate.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { acquirePlannerService, releasePlannerService } from './plannerService.js';
import { useMissionStore } from './store.js';

const HAZARDS_URL = import.meta.env.BASE_URL + 'data/hazards.json';

// Registry entries for the card's values (#62). The live tags come from findSources once hazards.json is read.
const suitModel = (source) => ({ tag: 'DERIVED', label: 'Suit model', source });
provenance.define({
  'finds.extraSec': suitModel('detour: planner path to the find and back to the route at constant effort, minus the leg it replaces'),
  'finds.extraO2G': suitModel('detour: walking O2 of the suit model for the same paths, minus the leg it replaces'),
  'finds.marginBeforeSec': suitModel('HUD walkback margin now'),
  'finds.marginAfterSec': suitModel('walkback margin now minus the detour O2 at the current O2 rate'),
  'finds.verdict': suitModel('no-go on ground over 20 degrees, with no path, or when the margin after reaches 0 min'),
});

let uid = 0;   // never reset: a pricing answer for a find from before a restart cannot land on a new M01

const finite = (p) => Number.isFinite(p?.x) && Number.isFinite(p?.z);
// An event re-route (dust, radiation, low O2) sets route.shelter. Other alerts, such as the partner separation, do not block a find.
const eventActive = (s) => !!s.route?.shelter;
/** The route a price was computed for. A different key means the detour has to be priced again. */
const basisKey = (route) => waypointKey(route?.waypoints) + '#' + (route?.nextIndex ?? 0);

function patchFind(store, id, patch) {
  store.setState((s) => ({
    finds: { ...s.finds, list: s.finds.list.map((f) => (f.id === id ? { ...f, ...patch } : f)) },
  }));
}

const getFind = (store, id) => store.getState().finds.list.find((f) => f.id === id) ?? null;

/**
 * Drop a marker at a ground point. One find waits for a decision at a time, and at most MAX_FINDS are on the map.
 * @param {{ x: number, z: number }} point
 * @returns {{ ok: true, find: object } | { ok: false, reason: 'undecided' | 'limit' | 'invalid', label?: string }}
 */
export function markFind(point, { store = useMissionStore } = {}) {
  if (!finite(point)) return { ok: false, reason: 'invalid' };
  const { finds } = store.getState();
  const undecided = finds.list.find((f) => f.status !== 'accepted');
  if (undecided) return { ok: false, reason: 'undecided', label: undecided.label };
  if (finds.list.length >= MAX_FINDS) return { ok: false, reason: 'limit' };
  const seq = finds.seq + 1;
  uid += 1;
  const find = {
    id: 'find-' + uid, label: findLabel(seq),
    x: Math.round(point.x * 100) / 100, z: Math.round(point.z * 100) / 100,
    status: 'pricing', detour: null, error: null, basis: null,
  };
  store.setState((s) => ({ finds: { ...s.finds, list: [...s.finds.list, find], seq, activeId: find.id } }));
  return { ok: true, find };
}

/**
 * Price the detour to a find through the planner worker.
 * @param {string} id
 * @param {{ store?: object, detour: (request: object) => Promise<object>, constants: object, sources?: object }} deps
 */
export async function priceFind(id, { store = useMissionStore, detour, constants, sources = null }) {
  const s = store.getState(), find = getFind(store, id);
  if (!find) return null;
  const nav = s.navigation;
  if (!finite(nav)) { patchFind(store, id, { status: 'error', error: 'No position fix yet.' }); return null; }
  const basis = basisKey(s.route);
  patchFind(store, id, { status: 'pricing', error: null });
  try {
    const result = await detour({
      position: { x: nav.x, z: nav.z },
      waypoints: s.route.waypoints ?? [],
      nextIndex: s.route.nextIndex ?? 0,
      find: { x: find.x, z: find.z },
      constants,
      suit: { oxygenG: s.suit.oxygenG, oxygenSec: s.suit.oxygenSec, marginSec: s.suit.marginSec },
    });
    const current = getFind(store, id);
    if (!current || current.status === 'accepted') return result;
    if (sources) store.setState((st) => ({ sources: { ...st.sources, ...sources } }));
    patchFind(store, id, { status: 'priced', detour: result, basis, error: result.ok ? null : 'No walkable path reaches this point.' });
    return result;
  } catch (cause) {
    if (getFind(store, id)) patchFind(store, id, { status: 'error', error: cause instanceof Error ? cause.message : String(cause) });
    return null;
  }
}

/**
 * Add a find to the route: insert it into route.waypoints where the detour is cheapest and re-plan the route through
 * every waypoint, keeping nextIndex. The verdict is advice; a no-go find can still be added (plan section 2).
 * @param {string} id
 * @param {{ store?: object, plan: (waypoints: Array<object>, options: object) => Promise<object>,
 *   reprice?: (id: string) => Promise<object | null> }} deps reprice: called when the route changed since pricing
 * @returns {Promise<boolean>} true when the route now includes the find
 */
export async function acceptFind(id, { store = useMissionStore, plan, reprice = null }) {
  let find = getFind(store, id);
  if (!find || find.status === 'accepted' || find.status === 'accepting') return false;
  const fail = (error) => { if (getFind(store, id)) patchFind(store, id, { status: find.detour ? 'priced' : 'error', error }); return false; };
  if (eventActive(store.getState())) return fail('An event route is active. Wait for the alert to clear.');
  if (find.basis !== basisKey(store.getState().route) && reprice) {
    await reprice(id);
    find = getFind(store, id);
    if (!find) return false;
  }
  const detour = find.detour;
  if (!detour?.ok || !Number.isInteger(detour.insertIndex)) return fail('No walkable path reaches this point.');

  const s = store.getState(), base = s.route.waypoints;
  const nextIndex = Number.isInteger(s.route.nextIndex) ? s.route.nextIndex : 0;
  const waypoint = { name: findWaypointName(find.label), x: find.x, z: find.z, find: find.label };
  const waypoints = insertFindWaypoint(base, waypoint, detour.insertIndex, nextIndex);
  patchFind(store, id, { status: 'accepting', error: null });
  let result;
  try {
    // The whole route from the habitat, as Plan plans it: the suit runner walks route.path back to its first point for
    // the walkback, and the per-leg costs split it at every waypoint. A path from the player would read "home in 0 min".
    result = await plan(waypoints, { smooth: true });
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : String(cause));
  }
  if (!getFind(store, id)) return false;   // dismissed or restarted while planning
  const now = store.getState().route;
  if (now.waypoints !== base || now.nextIndex !== s.route.nextIndex) return fail('The route changed while planning. Try again.');
  if (!result?.ok) return fail(result?.reason ?? 'The planner found no route through this find.');

  store.setState((st) => ({
    route: { ...st.route, waypoints },
    finds: {
      ...st.finds,
      list: st.finds.list.map((f) => (f.id === id ? { ...f, status: 'accepted', error: null } : f)),
      activeId: st.finds.activeId === id ? null : st.finds.activeId,
      routeKey: waypointKey(waypoints),
    },
  }));
  const minutes = Number.isFinite(detour.extraSec) ? Math.round(detour.extraSec / 60) : null;
  applyPlannedRoute(store, result, {
    reason: `Find ${find.label} added` + (minutes === null ? '' : `: +${minutes} min`),
    etaSec: result.distance,   // SIM: distance at 1 m/s, as the other Walk re-plans (routeUpdate.js)
  });
  return true;
}

/** Remove a find that is not part of the route. */
export function dismissFind(id, { store = useMissionStore } = {}) {
  const find = getFind(store, id);
  if (!find || find.status === 'accepted') return false;
  store.setState((s) => ({
    finds: { ...s.finds, list: s.finds.list.filter((f) => f.id !== id), activeId: s.finds.activeId === id ? null : s.finds.activeId },
  }));
  return true;
}

/**
 * Drop accepted finds the player has reached, or that are no longer in the route (edited in Plan), so they stop
 * counting against MAX_FINDS. The waypoint itself stays in the route.
 */
export function pruneFinds({ store = useMissionStore } = {}) {
  const { finds, route } = store.getState();
  const visited = new Set(Array.isArray(route.visited) ? route.visited : []);
  const inRoute = new Set((route.waypoints ?? []).map((w) => w.find).filter(Boolean));
  const keep = finds.list.filter((f) => f.status !== 'accepted' || (inRoute.has(f.label) && !visited.has(findWaypointName(f.label))));
  if (keep.length === finds.list.length) return false;
  store.setState((s) => ({ finds: { ...s.finds, list: keep } }));
  return true;
}

/**
 * Browser wiring: the shared planner worker (src/state/plannerService.js) and hazards.json, both loaded on the first
 * request. stop() releases the worker and makes later requests return null until start().
 * @param {{ store?: object }} [options]
 */
export function createFindService({ store = useMissionStore } = {}) {
  let stopped = false, clientPromise = null, modelPromise = null;
  const client = () => {
    if (!clientPromise) clientPromise = acquirePlannerService();
    return clientPromise;
  };
  const model = () => {
    if (!modelPromise) {
      modelPromise = fetch(HAZARDS_URL)
        .then((r) => { if (!r.ok) throw new Error('hazards.json ' + r.status); return r.json(); })
        .then((hazards) => { const constants = suitConstantsFromHazards(hazards); return { constants, sources: findSources(hazards, constants) }; });
      modelPromise.catch(() => { modelPromise = null; });   // a failed fetch can be retried by the next find
    }
    return modelPromise;
  };

  async function price(id) {
    try {
      const [planner, { constants, sources }] = await Promise.all([client(), model()]);
      if (stopped) return null;
      return await priceFind(id, { store, detour: (request) => planner.detour(request), constants, sources });
    } catch (cause) {
      if (!stopped && getFind(store, id)) patchFind(store, id, { status: 'error', error: cause instanceof Error ? cause.message : String(cause) });
      return null;
    }
  }

  async function accept(id) {
    try {
      const planner = await client();
      if (stopped) return false;
      return await acceptFind(id, { store, plan: (waypoints, options) => planner.plan(waypoints, options), reprice: price });
    } catch (cause) {
      if (!stopped && getFind(store, id)) patchFind(store, id, { status: 'error', error: cause instanceof Error ? cause.message : String(cause) });
      return false;
    }
  }

  return {
    price,
    accept,
    dismiss: (id) => dismissFind(id, { store }),
    /** Allow requests again after stop(). The planner worker is acquired again on the next request. */
    start() { stopped = false; },
    stop() {
      if (stopped) return;
      stopped = true;
      if (clientPromise) releasePlannerService();
      clientPromise = null;
    },
  };
}
