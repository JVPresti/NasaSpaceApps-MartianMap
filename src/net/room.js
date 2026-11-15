/**
 * Client connection to one room, with reconnect (docs/IMPLEMENTATION_PLAN.md 9.6 and 9.7).
 *
 * connectRoom({ code, hello }) opens wss://<host>/api/room/CODE (ws: on an http page), sends hello on every
 * open and keeps the socket alive with `ping` every 10 s. Status moves through:
 *
 *   'connecting'  trying, or open but no welcome yet
 *   'open'        welcome received: the player has a seat
 *   'offline'     OFFLINE_AFTER_FAILURES reconnects failed in a row; still retrying every 8 s at most
 *   'closed'      stopped for good: close() was called, or the room answered 4001 (room full) or 4002
 *                 (another tab or a reload took this player's seat)
 *
 * Reconnect delays are BACKOFF_MS (0.5, 1, 2, 4, 8 s), then 8 s, and reset after a welcome. A socket that
 * receives nothing (not even pong) for 3 ping periods is treated as dropped.
 *
 * WebSocketImpl, timers and location are injectable for tests.
 */
import {
  BACKOFF_MS, CLIENT_RATE, CONNECT_TIMEOUT_MS, MSG, NO_RECONNECT_CODES, OFFLINE_AFTER_FAILURES, PING, PING_MS, PONG,
  decode, encode, roomPath, validate,
} from './protocol.js';
import { createTokenBucket } from './rateLimit.js';

const OPEN = 1;
const ACTIONS = new Set([MSG.START, MSG.MARKER, MSG.SAMPLE, MSG.CASE, MSG.ROUTE, MSG.GO]);

/** Same-origin room URL: wss: on an https page, ws: otherwise. */
export function roomUrl(code, location = globalThis.location) {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return scheme + '//' + location.host + roomPath(code);
}

export function connectRoom({
  code, hello, url, WebSocketImpl = globalThis.WebSocket, timers = globalThis, location = globalThis.location,
  now = () => Date.now(),
}) {
  const target = url || roomUrl(code, location);
  const listeners = new Map();
  const statusListeners = new Set();
  const actions = createTokenBucket({ perSec: CLIENT_RATE.actionHz, burst: CLIENT_RATE.actionHz });
  let status = 'connecting';
  let info = { code: null, reason: '' };
  let ws = null;
  let stopped = false;
  let attempt = 0;         // index into BACKOFF_MS for the next retry
  let failures = 0;        // connections that failed or dropped since the last welcome
  let retryTimer = null;
  let pingTimer = null;
  let connectTimer = null;
  let lastHeard = 0;

  function setStatus(next, extra = {}) {
    info = { ...info, ...extra };
    if (next === status && !Object.keys(extra).length) return;
    status = next;
    for (const fn of [...statusListeners]) fn(status, { ...info, failures });
  }

  function emit(type, msg) {
    for (const fn of [...(listeners.get(type) || [])]) fn(msg);
    for (const fn of [...(listeners.get('*') || [])]) fn(msg);
  }

  function clearSocketTimers() {
    if (pingTimer !== null) timers.clearInterval(pingTimer);
    if (connectTimer !== null) timers.clearTimeout(connectTimer);
    pingTimer = connectTimer = null;
  }

  function detach(socket) {
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
  }

  function scheduleRetry() {
    failures++;
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    // The first failure is the dropped or refused connection itself; count the reconnects after it.
    setStatus(failures > OFFLINE_AFTER_FAILURES ? 'offline' : 'connecting');
    retryTimer = timers.setTimeout(() => { retryTimer = null; open(); }, delay);
  }

  function dropped(socket, code, reason) {
    if (socket !== ws) return;
    clearSocketTimers();
    detach(socket);
    ws = null;
    if (stopped) return;
    if (NO_RECONNECT_CODES.includes(code)) {
      stopped = true;
      setStatus('closed', { code, reason: reason || '' });
      return;
    }
    info = { ...info, code: code ?? null, reason: reason || '' };
    scheduleRetry();
  }

  function open() {
    if (stopped) return;
    let socket;
    try { socket = new WebSocketImpl(target); } catch { ws = null; scheduleRetry(); return; }
    ws = socket;
    connectTimer = timers.setTimeout(() => {
      connectTimer = null;
      if (socket.readyState !== OPEN) { try { socket.close(); } catch { /* ignore */ } dropped(socket, null, 'timeout'); }
    }, CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      if (connectTimer !== null) { timers.clearTimeout(connectTimer); connectTimer = null; }
      lastHeard = now();
      socket.send(encode(typeof hello === 'function' ? hello() : hello));
      pingTimer = timers.setInterval(() => {
        if (now() - lastHeard > 3 * PING_MS) { try { socket.close(); } catch { /* ignore */ } dropped(socket, null, 'silent'); return; }
        try { socket.send(PING); } catch { /* close follows */ }
      }, PING_MS);
    };
    socket.onmessage = (event) => {
      lastHeard = now();
      if (event.data === PONG) return;
      const msg = validate(decode(event.data));
      if (!msg) return;
      if (msg.type === MSG.WELCOME) {
        attempt = 0;
        failures = 0;
        setStatus('open', { code: null, reason: '' });
      }
      emit(msg.type, msg);
    };
    socket.onclose = (event) => dropped(socket, event?.code, event?.reason);
    socket.onerror = () => { /* onclose follows and decides */ };
  }

  open();

  return {
    get status() { return status; },
    get info() { return { ...info, failures }; },
    /** Sends one message when the socket is open. Actions over CLIENT_RATE.actionHz are dropped. */
    send(msg) {
      if (!ws || ws.readyState !== OPEN) return false;
      if (ACTIONS.has(msg.type) && actions.take(now()) !== 'ok') return false;
      ws.send(encode(msg));
      return true;
    },
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    close() {
      if (stopped && status === 'closed') return;
      stopped = true;
      if (retryTimer !== null) timers.clearTimeout(retryTimer);
      retryTimer = null;
      clearSocketTimers();
      if (ws) { const socket = ws; ws = null; detach(socket); try { socket.close(1000); } catch { /* ignore */ } }
      setStatus('closed', { code: 1000, reason: 'closed' });
    },
  };
}
