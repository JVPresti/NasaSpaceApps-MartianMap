/**
 * The habitat seat (#55, docs/IMPLEMENTATION_PLAN.md 9.1 and 9.4): the route and the go or no-go call from the
 * habitat, and the crew on the habitat's map. Writes the store's `habitat` slice (docs/STATE_AND_ENGINE.md).
 *
 * Both sides:
 *   - `habitat.route` and `habitat.go` hold the room's last route and last call. Every welcome rebuilds them, so a
 *     player who reconnects or reloads gets them back; the `rt` and `go` broadcasts keep them current.
 *
 * Habitat seat (online.me.role === 'habitat'):
 *   - sendRoute(path) sends the planned path (metres) decimated to at most 200 points in integer decimetres, about
 *     2.6 KB at the most. `habitat.sent.route` is 'pending' until the room's echo, then 'confirmed'. sendGo the same.
 *   - addNote(x, z, label, kind) places a 'note' or 'go' marker through the shared `mk` (src/net/sharedState.js).
 *   - `habitat.crew`, four times per second: each surface player's estimated position (the ex, ez of their poses,
 *     from the pose buffers of src/net/poseSync.js) while the habitat mast has radio line of sight to where they
 *     really are (src/sim/radio.js, as the partner runner does). Out of sight, the entry keeps the last position and
 *     suit values heard and reads lastKnown: true. O2 and battery come from their `tel`, also only while in sight.
 *
 * Surface player:
 *   - A route from the habitat becomes the active route (src/state/habitatRoute.js) with a visor notice "New route
 *     from <name>", live or from the welcome. The same route (same `at`) is not adopted twice in one session, so a
 *     reconnect does not reset the walk; a reload adopts it again.
 *   - A go or no-go call shows as a visor banner (habitat.notice) the first time this session sees it.
 *
 * The UI reaches sendRoute, sendGo and addNote through src/state/habitatHooks.js, never by importing this module.
 */
import { MSG, MAX_LABEL_LENGTH, MAX_REASON_LENGTH, ROLE } from './protocol.js';
import { routeToDecimetres, routeToMetres } from './routePoints.js';
import { radioLinkState } from '../sim/radio.js';
import { adoptHabitatRoute } from '../state/habitatRoute.js';

export { routeToDecimetres, routeToMetres };

/** The store slice that means "no habitat state" (offline). Keep in sync with createInitialState() in src/state/store.js. */
export const HABITAT_OFFLINE = Object.freeze({ route: null, go: null, notice: null, sent: { route: null, go: null }, crew: [] });

/** How long the visor shows "New route from ..." and the go or no-go banner. */
export const ROUTE_NOTICE_MS = 8000;
export const GO_NOTICE_MS = 15000;
/** How often the habitat seat refreshes `habitat.crew`. */
export const CREW_MS = 250;

// ---- crew on the habitat map --------------------------------------------------------------------------------

/**
 * One refresh of the habitat's crew list. Pure: the caller keeps `heard` (id -> last values received) between calls.
 * @param {{ players: Array<{ id, name, color }>, sample: (id: string) => object | null,
 *   telemetry: (id: string) => ({ oxygenPct, batteryPct } | null), mast: { x, y?, z } | null,
 *   lineOfSight: ((a, b) => { clear: boolean }) | null, heard: Map<string, object>, nowMs: number }} input
 * @returns {Array<{ id, name, color, x, z, link, lastKnown, heardAtMs, rangeM, oxygenPct, batteryPct }>}
 *   only players heard at least once
 */
export function crewView({ players, sample, telemetry, mast, lineOfSight, heard, nowMs }) {
  const out = [];
  for (const e of players) {
    const s = sample(e.id);
    let link = false, rangeM = null;
    if (s && Number.isFinite(s.x) && Number.isFinite(s.z)) {
      // The signal travels from where the suit really is. Without the terrain query (no engine yet) the link is unknown,
      // and the map shows what it receives.
      if (mast && typeof lineOfSight === 'function') {
        const r = radioLinkState({ point: { x: s.x, z: s.z }, mast, lineOfSight });
        link = r.clear; rangeM = r.rangeM;
      } else link = true;
    }
    if (link) {
      const tel = telemetry(e.id);
      const prev = heard.get(e.id);
      heard.set(e.id, {
        x: Number.isFinite(s.ex) ? s.ex : s.x,
        z: Number.isFinite(s.ez) ? s.ez : s.z,
        heardAtMs: nowMs,
        rangeM,
        oxygenPct: Number.isFinite(tel?.oxygenPct) ? tel.oxygenPct : prev?.oxygenPct ?? null,
        batteryPct: Number.isFinite(tel?.batteryPct) ? tel.batteryPct : prev?.batteryPct ?? null,
      });
    }
    const h = heard.get(e.id);
    if (!h) continue;   // never heard from: nothing to draw yet
    out.push({ id: e.id, name: e.name, color: e.color, x: h.x, z: h.z, link, lastKnown: !link, heardAtMs: h.heardAtMs, rangeM: h.rangeM, oxygenPct: h.oxygenPct, batteryPct: h.batteryPct });
  }
  return out;
}

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : v);
/** Compare crew lists at the precision the map draws, so a still crew does not re-render the table. */
const crewKey = (list) => list.map((c) => [c.id, c.name, c.color, round1(c.x), round1(c.z), c.link, c.heardAtMs && c.lastKnown ? c.heardAtMs : 0, round1(c.oxygenPct), round1(c.batteryPct)].join(':')).join('|');

// ---- the state machine --------------------------------------------------------------------------------------

/**
 * @param {{ store: object, room: { send(msg): boolean, on(type, fn): () => void, status: string },
 *   playerId: string, shared?: { addMarker: Function }, poses?: { buffers: Map, telemetry: Map },
 *   getEngine?: () => object | null, timers?: object, now?: () => number }} options
 */
export function createHabitatState({ store, room, playerId, shared = null, poses = null, getEngine = () => null, timers = globalThis, now = () => Date.now() }) {
  let route = null, go = null, notice = null, noticeSeq = 0, noticeTimer = null;
  let sent = { route: null, go: null };
  let crew = [], crewSig = '';
  let adoptedAt = null, seenGoAt = null;
  let written = null, stopped = false;
  const heard = new Map();

  const online = () => store.getState().online;
  const me = () => online()?.me?.id ?? playerId;
  const role = () => online()?.me?.role ?? null;
  const nameOf = (id) => (online()?.crew || []).find((e) => e.id === id)?.name ?? null;

  function write() {
    if (stopped) return;
    written = { route, go, notice, sent: { ...sent }, crew };
    store.setState({ habitat: written });
  }

  function showNotice(key, by, ms) {
    noticeSeq += 1;
    notice = { key, by: by ?? null, name: nameOf(by), seq: noticeSeq, atMs: now() };
    if (noticeTimer !== null) timers.clearTimeout(noticeTimer);
    const seq = noticeSeq;
    noticeTimer = timers.setTimeout(() => { noticeTimer = null; if (notice?.seq === seq) { notice = null; write(); } }, ms);
  }

  /** A surface player makes a habitat route the active route, once per route. */
  function adopt() {
    if (!route || role() !== ROLE.SURFACE || route.at === adoptedAt) return;
    const s = store.getState();
    // After a reload the mission table loads route.json a moment later and would replace the waypoints, and the planner
    // would then plan over the habitat's path. Wait for those waypoints, then adopt.
    if (!s.route?.waypoints?.length) return;
    adoptedAt = route.at;
    const nav = s.navigation || {};
    const position = Number.isFinite(nav.x) && Number.isFinite(nav.z) ? { x: nav.x, z: nav.z } : null;
    const next = adoptHabitatRoute(s.route, route.path, { position, by: route.by, at: route.at });
    store.setState((st) => ({ route: next.route, finds: { ...st.finds, routeKey: next.routeKey } }));
    showNotice('route', route.by, ROUTE_NOTICE_MS);
    write();
  }

  function announceGo() {
    if (!go || role() !== ROLE.SURFACE || go.at === seenGoAt) return;
    seenGoAt = go.at;
    showNotice(go.go ? 'go' : 'no-go', go.by, GO_NOTICE_MS);
  }

  const routeFrom = (m) => ({ path: routeToMetres(m.pts), by: m.by, at: m.at });

  function onWelcome(m) {
    route = m.route ? routeFrom(m.route) : null;
    go = m.go ? { go: m.go.go, why: m.go.why ?? '', by: m.go.by, at: m.go.at } : null;
    if (sent.route === 'pending' && route?.by !== me()) sent.route = null;   // lost while the socket was down
    if (sent.go === 'pending' && go?.by !== me()) sent.go = null;
    if (sent.route === 'pending') sent.route = 'confirmed';
    if (sent.go === 'pending') sent.go = 'confirmed';
    adopt();
    announceGo();
    write();
  }

  function onRoute(m) {
    if (m.by === undefined || m.at === undefined) return;
    route = routeFrom(m);
    if (m.by === me()) sent.route = 'confirmed';
    adopt();
    write();
  }

  function onGo(m) {
    if (m.by === undefined || m.at === undefined) return;
    go = { go: m.go, why: m.why ?? '', by: m.by, at: m.at };
    if (m.by === me()) sent.go = 'confirmed';
    announceGo();
    write();
  }

  /** Sends the planned path. Returns the number of points sent, or 0 when nothing went out. */
  function sendRoute(path) {
    if (stopped || role() !== ROLE.HABITAT) return 0;
    const pts = routeToDecimetres(path);
    if (!pts || !room.send({ type: MSG.ROUTE, pts })) return 0;
    sent = { ...sent, route: 'pending' };
    write();
    return pts.length;
  }

  function sendGo(isGo, why = '') {
    if (stopped || role() !== ROLE.HABITAT || typeof isGo !== 'boolean') return false;
    const reason = String(why ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH);
    if (!room.send({ type: MSG.GO, go: isGo, why: reason })) return false;
    sent = { ...sent, go: 'pending' };
    write();
    return true;
  }

  /** A note ('note') or a "go here" point ('go') on the map, for everyone. Returns the marker's cid, or null. */
  function addNote(x, z, label = '', kind = 'note') {
    if (stopped || !shared || !Number.isFinite(x) || !Number.isFinite(z) || (kind !== 'note' && kind !== 'go')) return null;
    return shared.addMarker({ kind, x, z, label: String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH) });
  }

  /** The habitat seat's crew list, from the pose buffers. Surface players skip this: their team panel has it. */
  function refreshCrew() {
    if (stopped) return;
    const state = online();
    if (state?.me?.role !== ROLE.HABITAT || !poses) {
      if (crew.length) { crew = []; crewSig = ''; write(); }
      return;
    }
    const players = (state.crew || []).filter((e) => e.role === ROLE.SURFACE && e.id !== state.me.id);
    const ids = new Set(players.map((e) => e.id));
    for (const id of [...heard.keys()]) if (!ids.has(id)) heard.delete(id);
    const engine = getEngine();
    const mast = engine && typeof engine.getHabitatMast === 'function' ? engine.getHabitatMast() : null;
    const t = now();
    const next = crewView({
      players,
      sample: (id) => poses.buffers.get(id)?.sample(t) ?? null,
      telemetry: (id) => poses.telemetry?.get(id) ?? null,
      mast,
      lineOfSight: engine?.lineOfSight ?? null,
      heard,
      nowMs: t,
    });
    const sig = crewKey(next);
    if (sig === crewSig) return;
    crew = next; crewSig = sig;
    write();
  }

  const offs = [
    room.on(MSG.WELCOME, onWelcome),
    room.on(MSG.ROUTE, onRoute),
    room.on(MSG.GO, onGo),
    // A route that waited for the waypoints; resetStore() putting the offline defaults back, while the room's state holds
    store.subscribe((s, prev) => {
      if (stopped) return;
      if (s.route?.waypoints !== prev?.route?.waypoints) adopt();
      if (store.getState().habitat !== written) write();
    }),
  ];
  const crewTimer = timers.setInterval(refreshCrew, CREW_MS);
  write();

  return {
    sendRoute,
    sendGo,
    addNote,
    refreshCrew,
    stop() {
      if (stopped) return;
      for (const off of offs) off();
      timers.clearInterval(crewTimer);
      if (noticeTimer !== null) timers.clearTimeout(noticeTimer);
      stopped = true;
      store.setState({ habitat: { ...HABITAT_OFFLINE, sent: { route: null, go: null } } });
    },
  };
}
