// Shared state handlers for the Room (#54, docs/IMPLEMENTATION_PLAN.md 9.3 and 9.4): markers, the sample log and the
// tool case. Each handler writes SQLite and replies in the same synchronous turn, with no await between the write and
// the reply, so no other message can run in between and the write commits atomically.
import { MARKER_KINDS, MAX_MARKERS, MSG, ROLE } from '../../src/net/protocol.js';

const CASE_KEY = 'case_holder';

const markerOut = (r) => ({ type: MSG.MARKER, id: r.id, cid: r.client_id, author: r.author, kind: r.kind, x: r.x, z: r.z, label: r.label, at: r.at });

function markerByCid(room, cid) {
  const rows = room.sql.exec('SELECT * FROM markers WHERE client_id = ?', cid).toArray();
  return rows.length ? rows[0] : null;
}

/** Who holds the tool case, or null. */
export function caseHolder(room) {
  return room.readMeta(CASE_KEY);
}

function setCaseHolder(room, holder) {
  if (holder === null) room.sql.exec('DELETE FROM meta WHERE k = ?', CASE_KEY);
  else room.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', CASE_KEY, holder);
}

/** The shared part of `welcome`: every marker in id order, every sample taken and the case holder. */
export function sharedWelcome(room) {
  const markers = room.sql.exec('SELECT * FROM markers ORDER BY id').toArray().map((r) => {
    const { type: _type, ...m } = markerOut(r);
    return m;
  });
  const samples = room.sql.exec('SELECT sample_id, author, at FROM samples ORDER BY at, sample_id').toArray()
    .map((r) => ({ sid: r.sample_id, by: r.author, at: r.at }));
  return { markers, samples, caseHolder: caseHolder(room) };
}

/**
 * Called when a seated player really leaves (not when a reload replaces the socket). The case follows the holder's
 * own scene, which starts again with the partner carrying it, so a holder who leaves releases it.
 */
export function releaseCaseOf(room, id) {
  if (caseHolder(room) !== id) return;
  setCaseHolder(room, null);
  room.broadcast({ type: MSG.CASE, holder: null });
}

export const SHARED_HANDLERS = {
  /**
   * mk: one row per client id. A resend of a known cid writes nothing and broadcasts nothing; the sender alone gets
   * the stored row back, so it can confirm a marker it queued. 'find' comes from surface players only.
   */
  [MSG.MARKER](room, ws, msg, me, now) {
    if (!MARKER_KINDS.includes(msg.kind)) return;
    if (msg.kind === 'find' && me.role !== ROLE.SURFACE) return;
    const cursor = room.sql.exec(
      'INSERT INTO markers (client_id, author, kind, x, z, label, at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM markers) < ? ON CONFLICT (client_id) DO NOTHING',
      msg.cid, me.id, msg.kind, msg.x, msg.z, msg.label, now, MAX_MARKERS,
    );
    const row = markerByCid(room, msg.cid);
    if (!row) return;   // the room is at MAX_MARKERS
    if (cursor.rowsWritten === 1) room.broadcast(markerOut(row));
    else room.sendTo(ws, markerOut(row));
  },

  /**
   * smp: the first insert of a sample id wins. rowsWritten on the insert's own cursor decides: 1 broadcasts the winner
   * to everyone; 0 tells only the sender who has it. A resend by the winner (an offline claim sent again) gets ok:true
   * back, to the sender only.
   */
  [MSG.SAMPLE](room, ws, msg, me, now) {
    if (me.role !== ROLE.SURFACE) return;
    const cursor = room.sql.exec('INSERT INTO samples (sample_id, author, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', msg.sid, me.id, now);
    if (cursor.rowsWritten === 1) {
      room.broadcast({ type: MSG.SAMPLE, sid: msg.sid, by: me.id, at: now, ok: true });
      return;
    }
    const held = room.sql.exec('SELECT author, at FROM samples WHERE sample_id = ?', msg.sid).toArray()[0];
    room.sendTo(ws, { type: MSG.SAMPLE, sid: msg.sid, by: held.author, at: held.at, ok: held.author === me.id });
  },

  /**
   * case: nobody holds it, and a surface player takes it for themselves; or the holder puts it back (null) or hands it to
   * another seated surface player. Anything else is refused, and the sender gets the current holder back.
   */
  [MSG.CASE](room, ws, msg, me) {
    const current = caseHolder(room);
    const surface = (id) => room.seated().some((s) => s.entry.id === id && s.entry.role === ROLE.SURFACE);
    let allowed = false;
    if (msg.holder === current) allowed = false;
    else if (current === null) allowed = msg.holder === me.id && me.role === ROLE.SURFACE;
    else if (current === me.id) allowed = msg.holder === null || surface(msg.holder);
    if (!allowed) {
      room.sendTo(ws, { type: MSG.CASE, holder: current });
      return;
    }
    setCaseHolder(room, msg.holder);
    room.broadcast({ type: MSG.CASE, holder: msg.holder });
  },
};
