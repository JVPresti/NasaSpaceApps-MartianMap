/**
 * Online play entry. The app loads this module only through the dynamic import() in src/onlineLink.js, and
 * only when the link has a valid ?room= code, so the offline build never contains it.
 *
 * startOnline({ code, store }) creates the player identity, connects to the room, runs the clock and writes
 * the `online` slice of the mission store (docs/STATE_AND_ENGINE.md). sharedState.js writes the `shared` slice. It returns
 * { send, on, addMarker, stop, ... }.
 */
import { createClock } from './clock.js';
import { getPlayerId, getPlayerName, getPreferredColor, setPreferredColor } from './identity.js';
import { MSG, PROTOCOL_VERSION, ROLE, ROLES, normalizeRoomCode } from './protocol.js';
import { connectRoom } from './room.js';
import { createSharedState } from './sharedState.js';
import { installSharedHooks } from '../state/sharedHooks.js';

export { getPlayerName, newPlayerId, setPlayerName } from './identity.js';

/** The store slice that means "offline". Keep in sync with createInitialState() in src/state/store.js. */
export const OFFLINE_STATE = Object.freeze({
  code: null, status: 'off', me: null, crew: [], offsetMs: 0, rttMs: null, startedAtMs: null, seed: null, closeCode: null,
});

export function startOnline({ code, store, role = ROLE.SURFACE, color, connect = connectRoom, ...connectOptions }) {
  const roomCode = normalizeRoomCode(code);
  if (!roomCode) throw new Error('startOnline: bad room code ' + code);
  if (!ROLES.includes(role)) throw new Error('startOnline: role must be surface or habitat');
  if (color !== undefined) setPreferredColor(color);
  const id = getPlayerId();

  const patch = (fields) => store.setState((s) => ({ online: { ...(s.online || OFFLINE_STATE), ...fields } }));
  patch({ ...OFFLINE_STATE, code: roomCode, status: 'connecting' });

  const room = connect({
    code: roomCode,
    ...connectOptions,
    hello: () => {
      const msg = { type: MSG.HELLO, v: PROTOCOL_VERSION, id, name: getPlayerName(), role };
      const preferred = getPreferredColor();
      if (role === ROLE.SURFACE && preferred !== undefined) msg.color = preferred;
      return msg;
    },
  });
  const clock = createClock({ send: (msg) => room.send(msg), ...(connectOptions.timers ? { timers: connectOptions.timers } : {}), ...(connectOptions.now ? { now: connectOptions.now } : {}) });

  const offs = [
    room.onStatus((status, info) => patch({ status, closeCode: info.code ?? null })),
    room.on(MSG.WELCOME, (m) => {
      if (m.you.color !== null) setPreferredColor(m.you.color);
      const me = m.crew.find((e) => e.id === m.you.id) || { ...m.you, name: getPlayerName(), joinedAt: m.now };
      patch({ status: 'open', closeCode: null, me, crew: m.crew, startedAtMs: m.startedAt, seed: m.seed });
      clock.start();
    }),
    room.on(MSG.CREW, (m) => {
      const crew = (store.getState().online?.crew || []).filter((e) => e.id !== m.p.id);
      if (m.op === 'join') crew.push(m.p);
      patch({ crew });
    }),
    room.on(MSG.START, (m) => patch({ startedAtMs: m.startedAt, seed: m.seed })),
    room.on(MSG.TIME, (m) => clock.handle(m)),
    clock.onChange(({ offsetMs, rttMs }) => patch({ offsetMs, rttMs })),
  ];
  // Markers, samples and the tool case (#54). The engine reaches claimSample and mayCallCase through src/state/sharedHooks.js.
  const shared = createSharedState({ store, room, playerId: id, ...(connectOptions.timers ? { timers: connectOptions.timers } : {}), ...(connectOptions.now ? { now: connectOptions.now } : {}) });
  const uninstall = installSharedHooks({ claimSample: shared.claimSample, mayCallCase: shared.mayCallCase });

  return {
    code: roomCode,
    id,
    room,
    clock,
    send: (msg) => room.send(msg),
    on: (type, fn) => room.on(type, fn),
    serverNow: () => clock.serverNow(),
    /** Asks the room to start the mission; every player gets the same start time and seed back. */
    start: () => room.send({ type: MSG.START }),
    shared,
    /** Places a shared marker: { kind: 'find' | 'note' | 'go', x, z, label }. Returns its client id. */
    addMarker: (marker) => shared.addMarker(marker),
    stop() {
      for (const off of offs) off();
      uninstall();
      shared.stop();
      clock.stop();
      room.close();
      store.setState({ online: { ...OFFLINE_STATE } });
    },
  };
}
