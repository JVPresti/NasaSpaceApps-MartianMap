// M4 (#55): the habitat seat's route and go or no-go call (docs/IMPLEMENTATION_PLAN.md 9.1 and 9.4).
//
// rt   a route of up to 200 points [x, z] in integer decimetres. Only a habitat seat may send one. The room keeps the
//      last one in `meta` as JSON { pts, by, at } and broadcasts { type: 'rt', pts, by, at } to everyone, the sender
//      included, so the sender's echo is the confirmation. `welcome.route` carries it to a player who joins later.
// go   a go or no-go call with an optional reason of up to 80 characters, from a habitat seat only. Stored the same way
//      under its own key and broadcast as { type: 'go', go, why, by, at }; `welcome.go` carries the last one.
//
// The protocol validator has already checked the shape (at most MAX_ROUTE_POINTS integer pairs, a boolean and a short
// string). The 4 KB incoming cap in worker/room.js runs before any handler; a 200-point route is about 2.6 KB.
// Each handler writes and replies in the same synchronous turn, as in handlers/shared.js.
import { MSG, ROLE } from '../../src/net/protocol.js';

export const ROUTE_KEY = 'route';
export const GO_KEY = 'go_call';

function writeMeta(room, key, value) {
  room.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', key, JSON.stringify(value));
}

function readJson(room, key) {
  const text = room.readMeta(key);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** The habitat part of `welcome`: the last route { pts, by, at } and the last call { go, why, by, at }, or null each. */
export function habitatWelcome(room) {
  return { route: readJson(room, ROUTE_KEY), go: readJson(room, GO_KEY) };
}

export const HABITAT_HANDLERS = {
  [MSG.ROUTE](room, _ws, msg, me, now) {
    if (me.role !== ROLE.HABITAT || msg.pts.length < 2) return;
    const route = { pts: msg.pts, by: me.id, at: now };
    writeMeta(room, ROUTE_KEY, route);
    room.broadcast({ type: MSG.ROUTE, ...route });
  },

  [MSG.GO](room, _ws, msg, me, now) {
    if (me.role !== ROLE.HABITAT) return;
    const call = { go: msg.go, why: msg.why, by: me.id, at: now };
    writeMeta(room, GO_KEY, call);
    room.broadcast({ type: MSG.GO, ...call });
  },
};
