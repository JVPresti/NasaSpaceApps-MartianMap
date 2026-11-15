// The Room Durable Object: one instance per room code (docs/IMPLEMENTATION_PLAN.md 9.3).
//
// It uses the WebSocket Hibernation API, so an idle room is evicted from memory while its sockets stay open.
// Nothing lives only in memory: the crew is each socket's attachment, and the mission start and seed are
// rows in SQLite. The rate buckets and the "leave already sent" set are in memory; losing them on a wake is
// harmless (a fresh bucket, and a socket that hibernated cannot be mid-close).
import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE, CLOSE_REASON, COLOR_COUNT, MAX_MESSAGE_BYTES, MAX_SOCKETS, MSG, PING, PONG, ROLE, ROOM_RATE, SEATS,
  STALE_MS, decode, encode, utf8ByteLength, validate,
} from '../src/net/protocol.js';
import { createTokenBucket } from '../src/net/rateLimit.js';
import { POSE_HANDLERS } from './handlers/poses.js';
import { SHARED_HANDLERS, releaseCaseOf, sharedWelcome } from './handlers/shared.js';
import { HABITAT_HANDLERS, habitatWelcome } from './handlers/habitat.js';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)',
  'CREATE TABLE IF NOT EXISTS markers (id INTEGER PRIMARY KEY, client_id TEXT UNIQUE, author TEXT, kind TEXT, x REAL, z REAL, label TEXT, at INTEGER)',
  'CREATE TABLE IF NOT EXISTS samples (sample_id TEXT PRIMARY KEY, author TEXT, at INTEGER)',
];

function randomUint32() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * Handlers for seated sockets, by message type. Each gets (room, ws, msg, me, now) where msg has passed the
 * protocol validator and me is the sender's crew entry. M2 `p` and `tel` (relay to the others with the sender's id)
 * are in handlers/poses.js, M3 `mk`, `smp` and `case` (SQLite, then broadcast) in handlers/shared.js, M4 `rt` and `go`
 * from the habitat seat in handlers/habitat.js. A type without a handler is ignored.
 */
export const HANDLERS = {
  ...POSE_HANDLERS,
  [MSG.START](room, _ws, _msg, _me, now) {
    room.broadcast({ type: MSG.START, ...room.startMission(now) });
  },
  [MSG.TIME](room, ws, msg, _me, now) {
    room.sendTo(ws, { type: MSG.TIME, c: msg.c, s: now });
  },
  ...SHARED_HANDLERS,
  ...HABITAT_HANDLERS,
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Keepalives never wake the room and are not billed as duration.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.buckets = new WeakMap();
    this.lastSeen = new WeakMap();
    this.left = new WeakSet();
    this.schemaReady = false;
  }

  get sql() {
    const sql = this.ctx.storage.sql;
    if (!this.schemaReady) {
      for (const statement of SCHEMA) sql.exec(statement);
      this.schemaReady = true;
    }
    return sql;
  }

  readMeta(key) {
    const rows = this.sql.exec('SELECT v FROM meta WHERE k = ?', key).toArray();
    return rows.length ? rows[0].v : null;
  }

  /** started_at and seed, as numbers or null before the first start. */
  mission() {
    const startedAt = this.readMeta('started_at');
    const seed = this.readMeta('seed');
    return { startedAt: startedAt === null ? null : Number(startedAt), seed: seed === null ? null : Number(seed) };
  }

  /** The first call stores the start time and a random seed; later calls return the stored pair. */
  startMission(now) {
    const current = this.mission();
    if (current.startedAt !== null) return current;
    const seed = randomUint32();
    this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?), (?, ?) ON CONFLICT (k) DO NOTHING', 'started_at', String(now), 'seed', String(seed));
    return this.mission();
  }

  async fetch(request) {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.accept(server, Date.now());
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Accepts the socket with no seat. The seat comes with hello, because hello carries the role. The socket
   * has no tag for its role for the same reason: tags are fixed at accept time, so roles are read from the
   * attachments instead.
   */
  accept(ws, now) {
    const count = this.ctx.getWebSockets().length;
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment({ connectedAt: now });
    if (count >= MAX_SOCKETS) this.closeSocket(ws, CLOSE.ROOM_FULL);
  }

  attachment(ws) {
    try { return ws.deserializeAttachment() || null; } catch { return null; }
  }

  /** Seated sockets with their crew entries, in join order. */
  seated(except = null) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || this.left.has(ws)) continue;
      const att = this.attachment(ws);
      if (att?.entry && !att.left) out.push({ ws, entry: att.entry });
    }
    return out.sort((a, b) => a.entry.joinedAt - b.entry.joinedAt);
  }

  crew() {
    return this.seated().map((s) => s.entry);
  }

  sendTo(ws, msg) {
    try { ws.send(encode(msg)); } catch { /* the socket is closing; its close handler cleans up */ }
  }

  broadcast(msg, except = null) {
    const textMsg = encode(msg);
    for (const { ws } of this.seated(except)) {
      try { ws.send(textMsg); } catch { /* as above */ }
    }
  }

  /** Marks the socket as gone and tells the others, once per socket however it ends. */
  leave(ws, { announce = true } = {}) {
    if (this.left.has(ws)) return;
    this.left.add(ws);
    const att = this.attachment(ws);
    if (!att || att.left) return;
    try { ws.serializeAttachment({ ...att, left: true }); } catch { /* already closed */ }
    if (announce && att.entry) {
      this.broadcast({ type: MSG.CREW, op: 'leave', p: att.entry }, ws);
      releaseCaseOf(this, att.entry.id);
    }
  }

  closeSocket(ws, code, options) {
    this.leave(ws, options);
    try { ws.close(code, CLOSE_REASON[code] || ''); } catch { /* already closed */ }
  }

  /** Closes sockets with no ping, no message and no connection in the last STALE_MS. */
  sweep(current, now) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === current || this.left.has(ws)) continue;
      const att = this.attachment(ws);
      if (!att || att.left) continue;
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      const last = Math.max(pinged ? pinged.getTime() : 0, att.connectedAt || 0, this.lastSeen.get(ws) || 0);
      if (now - last > STALE_MS) this.closeSocket(ws, CLOSE.GOING_AWAY);
    }
  }

  webSocketMessage(ws, data) {
    if (this.left.has(ws)) return;
    const now = Date.now();
    const size = typeof data === 'string' ? utf8ByteLength(data) : data.byteLength;
    if (size > MAX_MESSAGE_BYTES) return this.closeSocket(ws, CLOSE.TOO_BIG);

    let bucket = this.buckets.get(ws);
    if (!bucket) this.buckets.set(ws, (bucket = createTokenBucket(ROOM_RATE)));
    const verdict = bucket.take(now);
    if (verdict === 'abuse') return this.closeSocket(ws, CLOSE.POLICY);
    this.lastSeen.set(ws, now);
    if (verdict === 'drop') return;

    this.sweep(ws, now);
    const att = this.attachment(ws);
    const msg = decode(data);
    if (!att?.entry) {
      if (msg?.type !== MSG.HELLO) return this.closeSocket(ws, CLOSE.HELLO_FIRST);
      const hello = validate(msg);
      if (!hello) return this.closeSocket(ws, CLOSE.HELLO_FIRST);
      return this.hello(ws, hello, att, now);
    }
    if (!msg || msg.type === MSG.HELLO || !Object.hasOwn(HANDLERS, msg.type)) return;
    const clean = validate(msg);
    if (clean) HANDLERS[msg.type](this, ws, clean, att.entry, now);
  }

  hello(ws, hello, att, now) {
    const others = this.seated(ws);
    const previous = others.find((s) => s.entry.id === hello.id);
    const rivals = others.filter((s) => s !== previous && s.entry.role === hello.role);
    if (rivals.length >= SEATS[hello.role]) return this.closeSocket(ws, CLOSE.ROOM_FULL, { announce: false });

    let color = null;
    if (hello.role === ROLE.SURFACE) {
      const taken = new Set(rivals.map((s) => s.entry.color));
      if (previous && previous.entry.role === ROLE.SURFACE && !taken.has(previous.entry.color)) color = previous.entry.color;
      else if (hello.color !== undefined && !taken.has(hello.color)) color = hello.color;
      else for (let c = 0; c < COLOR_COUNT && color === null; c++) if (!taken.has(c)) color = c;
    }
    // The same player again (a reload whose old socket is still open): the new socket takes over the seat.
    // The others get a join with the same id, which replaces the entry, and no leave in between.
    if (previous) this.closeSocket(previous.ws, CLOSE.REPLACED, { announce: false });

    const entry = { id: hello.id, name: hello.name, color, role: hello.role, joinedAt: now };
    ws.serializeAttachment({ ...att, connectedAt: att?.connectedAt ?? now, entry });
    const { startedAt, seed } = this.mission();
    this.sendTo(ws, {
      type: MSG.WELCOME, you: { id: entry.id, color, role: entry.role }, crew: this.crew(),
      startedAt, seed, now, ...sharedWelcome(this), ...habitatWelcome(this),
    });
    this.broadcast({ type: MSG.CREW, op: 'join', p: entry }, ws);
  }

  webSocketClose(ws, code) {
    this.leave(ws);
    // Complete the closing handshake; 1005 and 1006 cannot be sent back, so answer with a normal close.
    try { ws.close(code >= 3000 && code <= 4999 ? code : CLOSE.NORMAL); } catch { /* already closed */ }
  }

  webSocketError(ws) {
    this.leave(ws);
  }
}
