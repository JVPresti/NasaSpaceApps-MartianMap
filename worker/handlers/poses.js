// M2 (#53): poses and suit telemetry. The room relays them to every other seated socket with the sender's id
// added and keeps nothing: no SQL, no memory. Only surface players walk, so `p` and `tel` from a habitat
// seat are dropped. Room-side rate limits (15/s, 1008, 1009) apply before a handler runs (worker/room.js).
import { MSG, ROLE } from '../../src/net/protocol.js';

function relay(room, ws, msg, me) {
  if (me.role !== ROLE.SURFACE) return;
  room.broadcast({ ...msg, id: me.id }, ws);
}

export const POSE_HANDLERS = {
  [MSG.POSE]: relay,
  [MSG.TELEMETRY]: relay,
};
