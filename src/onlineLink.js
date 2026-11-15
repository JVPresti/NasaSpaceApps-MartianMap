/**
 * Online play from the app side (#52, #55): the room link, the join state and the only way into src/net/.
 *
 * Without ?room= nothing under src/net/ loads: the dynamic import() below is the one way in, so Vite keeps
 * src/net/ in its own chunk. With a valid code the page loads src/net/ but does not connect. The start screen
 * shows the join panel, and the socket opens only when the player presses "Join the room".
 *
 * This module must not import anything from src/net/. ROOM_CODE_PATTERN, ROLE, SEATS and the close codes are
 * copies of the values in src/net/protocol.js; src/onlineLink.test.js checks that they stay equal.
 */
import { create } from 'zustand';
import { startClockSync } from './online/clockSync.js';

export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;
/** The 24 letters a room code uses: A to Z without I and O. */
export const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROLE = Object.freeze({ SURFACE: 'surface', HABITAT: 'habitat' });
export const SEATS = Object.freeze({ surface: 4, habitat: 2 });
export const CLOSE_ROOM_FULL = 4001;
export const CLOSE_REPLACED = 4002;
/** The last seat the player chose, in localStorage. */
export const ROLE_KEY = 'marswalk.online.role';

/** Upper-case room code, or null when the text is not a valid code. */
export function normalizeCode(text) {
  if (typeof text !== 'string') return null;
  const code = text.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/** Reads ?room= from a query string: { code } for a valid code, { invalid } for a bad one, null without it. */
export function readRoomCode(search) {
  const raw = new URLSearchParams(search || '').get('room');
  if (raw === null) return null;
  const code = normalizeCode(raw);
  return code ? { code } : { invalid: raw };
}

/** A new random room code. `random` returns numbers in [0, 1), like Math.random. */
export function randomRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += ROOM_LETTERS[Math.min(ROOM_LETTERS.length - 1, Math.floor(random() * ROOM_LETTERS.length))];
  return code;
}

export function readRolePreference(storage = safeStorage()) {
  try { const v = storage?.getItem(ROLE_KEY); if (v === ROLE.SURFACE || v === ROLE.HABITAT) return v; } catch { /* default */ }
  return ROLE.SURFACE;
}

function saveRolePreference(role, storage = safeStorage()) {
  try { storage?.setItem(ROLE_KEY, role); } catch { /* remembered for this page only */ }
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * Seats left per role from the crew list, not counting this player. null for a role the client knows nothing about.
 * @param {Array<{ id: string, role: string }>} crew
 * @param {string | null} myId
 */
export function seatsLeft(crew, myId = null) {
  const others = (crew || []).filter((e) => e.id !== myId);
  const count = (role) => others.filter((e) => e.role === role).length;
  return { surface: Math.max(0, SEATS.surface - count(ROLE.SURFACE)), habitat: Math.max(0, SEATS.habitat - count(ROLE.HABITAT)) };
}

const loadNet = () => import('./net/index.js');

/**
 * The join state the online components read. `view`: 'none' (offline, no link), 'pick' (typing or creating a code),
 * 'bad' (the link had a bad code) or 'join' (a valid code: the join panel, then the room). `handle` is the object
 * startOnline returned, or null before Join and after leaving.
 */
export function initialSession(storage) {
  return {
    view: 'none', code: null, badCode: null, net: null, loadError: false, role: readRolePreference(storage), name: '',
    joining: false, joined: false, full: null, seats: { surface: null, habitat: null }, handle: null,
  };
}

/**
 * Creates the controller: the join actions and the store subscription that follows the connection.
 * Every dependency is injectable for tests.
 */
export function createOnlineController({
  store, load = loadNet, storage = safeStorage(), location = globalThis.location, history = globalThis.history,
  onHandle = () => {}, warn = console.warn,
}) {
  const session = create(() => initialSession(storage));
  let netPromise = null;
  let startSent = false;
  let stopSync = null;

  function ensureNet() {
    if (!netPromise) {
      netPromise = load().then((net) => {
        session.setState((s) => ({ net, name: s.name || net.getPlayerName() }));
        return net;
      }, (err) => {
        warn('online: could not load online play', err);
        session.setState({ loadError: true });
        netPromise = null;
        return null;
      });
    }
    return netPromise;
  }

  function setLink(code) {
    if (!location || !history?.replaceState) return;
    try {
      const url = new URL(location.href);
      if (code) url.searchParams.set('room', code); else url.searchParams.delete('room');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch { /* the room still works, the link just does not show it */ }
  }

  function stopHandle() {
    const { handle } = session.getState();
    if (!handle) return;
    session.setState({ handle: null });
    startSent = false;
    try { handle.stop(); } catch { /* already stopped */ }
  }

  // Follows the connection while a handle exists: the join outcome, the seats and the mission start.
  store.subscribe((state) => {
    const s = session.getState();
    if (!s.handle) return;
    const online = state.online || {};
    if (online.status === 'open' && online.crew?.length) {
      const seats = seatsLeft(online.crew, online.me?.id ?? null);
      if (seats.surface !== s.seats.surface || seats.habitat !== s.seats.habitat) session.setState({ seats });
    }
    if (s.joining) {
      if (online.status === 'open' || online.status === 'offline') {
        session.setState({ joining: false, joined: true, full: null });
      } else if (online.status === 'closed' && online.closeCode === CLOSE_ROOM_FULL) {
        session.setState((cur) => ({ joining: false, full: cur.role, seats: { ...cur.seats, [cur.role]: 0 } }));
        stopHandle();
        return;
      } else if (online.status === 'closed') {
        session.setState({ joining: false });
      }
    }
    // The first surface player to step outside starts the room's mission clock (9.5). The room keeps the first start.
    if (online.status !== 'open' || online.startedAtMs !== null) startSent = false;
    else if (state.mode === 'walk' && s.role === ROLE.SURFACE && !startSent) {
      startSent = true;
      s.handle.start();
    }
  });

  const api = {
    session,
    store,
    ensureNet,
    /** Opens the join panel for a room code, loads src/net/ and puts the code in the link. */
    openRoom(code) {
      const clean = normalizeCode(code);
      if (!clean) return false;
      stopHandle();
      session.setState({ view: 'join', code: clean, badCode: null, joining: false, joined: false, full: null, seats: { surface: null, habitat: null } });
      setLink(clean);
      ensureNet();
      return true;
    },
    showBadCode(raw) { session.setState({ view: 'bad', badCode: raw, code: null }); },
    openPicker() { session.setState({ view: 'pick' }); },
    closePicker() { session.setState((s) => ({ view: s.badCode !== null ? 'bad' : 'none' })); },
    setRole(role) { if (role === ROLE.SURFACE || role === ROLE.HABITAT) session.setState({ role }); },
    setName(name) { session.setState({ name: String(name ?? '').slice(0, 32) }); },
    /** Connects with the chosen seat and name. The start screen continues once the room answers or gives up. */
    async join() {
      const s = session.getState();
      if (!s.code || s.joining) return null;
      const net = s.net || await ensureNet();
      if (!net) return null;
      const { role, name, code } = session.getState();
      saveRolePreference(role, storage);
      const clean = net.setPlayerName(name);
      session.setState({ name: clean || net.getPlayerName() });
      stopHandle();
      // The shared mission clock follows the room from the first join on (src/online/clockSync.js).
      if (!stopSync) stopSync = startClockSync(store);
      session.setState({ joining: true, joined: false, full: null });
      const handle = net.startOnline({ code, store, role });
      session.setState({ handle });
      onHandle(handle);
      // A welcome that arrived synchronously (tests) has no store change left to report.
      const status = store.getState().online?.status;
      if (status === 'open') session.setState({ joining: false, joined: true });
      return handle;
    },
    /** After 4002: a fresh player id for this tab, then the same seat again. */
    async joinAsNewPlayer() {
      const net = session.getState().net || await ensureNet();
      if (!net) return null;
      stopHandle();
      net.newPlayerId();
      session.setState({ joining: false });
      return api.join();
    },
    /** After 4001: the other seat, at once. */
    switchRole(role) {
      api.setRole(role);
      return api.join();
    },
    /** Leaves the room and keeps playing solo. The link loses its ?room=. */
    leave() {
      stopHandle();
      setLink(null);
      session.setState({ view: 'none', code: null, badCode: null, joining: false, joined: false, full: null });
    },
  };
  return api;
}

let controller = null;
const noSession = create(() => initialSession(null));

/** The app's controller, or null before bootOnline. */
export const getOnlineController = () => controller;

/** React hook on the join state. Before bootOnline it reads a fixed offline state. */
export function useOnlineSession(selector) {
  return (controller ? controller.session : noSession)(selector);
}

/** True while this tab holds or asks for a habitat seat: it stays at the mission table and never walks. */
export function isHabitatSeat() {
  if (!controller) return false;
  if (controller.store.getState().online?.me?.role === ROLE.HABITAT) return true;
  const s = controller.session.getState();
  return s.handle !== null && s.role === ROLE.HABITAT;
}

/**
 * Sets up online play from the link. Without ?room= it creates the controller (for "Play online") and loads
 * nothing. With a bad code it shows the message on the start screen. With a valid code it loads src/net/ and
 * shows the join panel; it never connects by itself. Returns the controller.
 */
export function bootOnline({ search = globalThis.location?.search, store, load = loadNet, warn = console.warn, ...options } = {}) {
  controller = createOnlineController({ store, load, warn, ...options });
  const link = readRoomCode(search);
  if (link?.code) controller.openRoom(link.code);
  else if (link) {
    warn('online: ignoring ?room=' + link.invalid + ': a room code is four letters A to Z without I and O');
    controller.showBadCode(link.invalid);
  }
  return controller;
}

/** Test helper: forget the app's controller. */
export function resetOnlineController() {
  controller = null;
}
