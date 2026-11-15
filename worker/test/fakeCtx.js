// A fake Durable Object state for testing the Room in plain Node. SQL runs on Node's built-in SQLite, so
// constraints, ON CONFLICT and rowsWritten (index writes included) behave as they do in the real storage.
import { DatabaseSync } from 'node:sqlite';

// Workers runtime globals the Room uses.
globalThis.WebSocketRequestResponsePair ??= class WebSocketRequestResponsePair {
  constructor(request, response) { this.request = request; this.response = response; }
};

function cursor(rows, rowsWritten) {
  return {
    rowsRead: rows.length,
    rowsWritten,
    toArray: () => rows.slice(),
    one() {
      if (rows.length !== 1) throw new Error('Expected exactly one result from SQL query, but got ' + rows.length);
      return rows[0];
    },
    [Symbol.iterator]: () => rows[Symbol.iterator](),
  };
}

export function createFakeStorage() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    sql: {
      exec(query, ...bindings) {
        const statement = db.prepare(query);
        if (statement.columns().length) return cursor(statement.all(...bindings).map((r) => ({ ...r })), 0);
        const changes = Number(statement.run(...bindings).changes);
        // The real storage counts index writes in rowsWritten: an insert into a table with a UNIQUE column or a TEXT
        // primary key reads 2 per row (measured with wrangler dev, docs/qa/online-m3.md). Mirror that for inserts.
        const table = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(query)?.[1];
        const indexes = table ? db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND tbl_name = ?").get(table).n : 0;
        return cursor([], changes * (1 + indexes));
      },
    },
  };
}

export class FakeSocket {
  constructor() {
    this.sent = [];
    this.closed = null;
    this.attachmentJson = null;
    this.readyState = 1;
  }
  send(text) {
    if (this.closed) throw new Error('socket closed');
    this.sent.push(text);
  }
  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = { code, reason };
    this.readyState = 2;
  }
  serializeAttachment(value) {
    const json = JSON.stringify(value);
    if (json.length > 16384) throw new Error('attachment too large');
    this.attachmentJson = json;
  }
  deserializeAttachment() {
    return this.attachmentJson === null ? null : JSON.parse(this.attachmentJson);
  }
  /** Parsed JSON messages sent to this socket. */
  messages(type) {
    const all = this.sent.filter((t) => t !== 'pong').map((t) => JSON.parse(t));
    return type ? all.filter((m) => m.type === type) : all;
  }
  last(type) {
    const list = this.messages(type);
    return list[list.length - 1];
  }
}

/**
 * ctx with the parts of DurableObjectState the Room uses. A socket stays in getWebSockets() until the test
 * says its close finished (finishClose), as in workerd, where a socket the server closed is still listed
 * until the client completes the handshake.
 */
export function createFakeCtx({ storage = createFakeStorage(), sockets = [] } = {}) {
  const autoResponse = new Map();
  const ctx = {
    storage,
    sockets,
    autoResponsePair: null,
    acceptWebSocket(ws, tags = []) {
      ws.tags = tags;
      sockets.push(ws);
    },
    getWebSockets(tag) {
      return sockets.filter((ws) => !ws.gone && (tag === undefined || ws.tags.includes(tag)));
    },
    setWebSocketAutoResponse(pair) {
      ctx.autoResponsePair = pair;
    },
    getWebSocketAutoResponseTimestamp(ws) {
      return autoResponse.get(ws) ?? null;
    },
    /** The runtime answered a ping on this socket at `ms`. */
    ping(ws, ms) {
      autoResponse.set(ws, new Date(ms));
    },
    finishClose(ws) {
      ws.gone = true;
    },
  };
  return ctx;
}
