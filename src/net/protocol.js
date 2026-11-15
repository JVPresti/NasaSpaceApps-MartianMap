/**
 * Online play protocol, shared by the app (src/net/) and the room (worker/).
 *
 * Plain JavaScript with no browser or Worker APIs, so both sides import the same constants, field lists and
 * validators. Wrangler bundles the relative import from worker/. Design: docs/IMPLEMENTATION_PLAN.md
 * sections 9.3 to 9.5.
 *
 * Every message is one JSON object with a `type` key. The keepalive is the bare string `ping`, answered with
 * `pong` by the room's auto-response, and never goes through `decode`.
 */

export const PROTOCOL_VERSION = 1;

/** Four letters from A to Z without I and O: 24^4 = 331,776 codes. Upper case only; see normalizeRoomCode. */
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;

/** Returns the upper-case room code, or null when the input is not a valid code in any case. */
export function normalizeRoomCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/** WebSocket path of a room. */
export const roomPath = (code) => '/api/room/' + code;

export const MSG = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  CREW: 'crew',
  POSE: 'p',
  TELEMETRY: 'tel',
  START: 'start',
  MARKER: 'mk',
  SAMPLE: 'smp',
  CASE: 'case',
  ROUTE: 'rt',
  GO: 'go',
  TIME: 't',
});

export const ROLE = Object.freeze({ SURFACE: 'surface', HABITAT: 'habitat' });
export const ROLES = Object.freeze([ROLE.SURFACE, ROLE.HABITAT]);

/** Seats per role. Surface players take one of the engine's four suit colours each. */
export const SEATS = Object.freeze({ [ROLE.SURFACE]: 4, [ROLE.HABITAT]: 2 });
export const COLOR_COUNT = 4;
/** Sockets a room accepts at once, seated or not, before it closes new ones as full. */
export const MAX_SOCKETS = 2 * (SEATS[ROLE.SURFACE] + SEATS[ROLE.HABITAT]);

export const CLOSE = Object.freeze({
  NORMAL: 1000,
  GOING_AWAY: 1001,
  POLICY: 1008,
  TOO_BIG: 1009,
  ROOM_FULL: 4001,
  REPLACED: 4002,
  HELLO_FIRST: 4003,
});

export const CLOSE_REASON = Object.freeze({
  [CLOSE.POLICY]: 'rate limit',
  [CLOSE.TOO_BIG]: 'message too big',
  [CLOSE.ROOM_FULL]: 'room full',
  [CLOSE.REPLACED]: 'replaced',
  [CLOSE.HELLO_FIRST]: 'hello first',
  [CLOSE.GOING_AWAY]: 'stale',
});

/** Close codes after which the client does not reconnect: the seat is gone or another tab took it. */
export const NO_RECONNECT_CODES = Object.freeze([CLOSE.ROOM_FULL, CLOSE.REPLACED]);

/** Largest message the room accepts, in UTF-8 bytes of the JSON text. Larger ones close the socket with 1009. */
export const MAX_MESSAGE_BYTES = 4096;

/** Client-side caps (section 9.4). M2 applies the pose and telemetry ones. */
export const CLIENT_RATE = Object.freeze({
  poseMaxHz: 10,
  poseStartHz: 5,           // section 9.10: start at 5 per second, raise to 10 only if it looks wrong
  poseMinMoveM: 0.05,
  poseMinTurnDeg: 1,        // a change of animation also sends a pose
  telemetryMs: 5000,
  actionHz: 5,              // start, mk, smp, case, rt, go
});

/** Room-side token bucket per socket, and the abuse rule that closes a socket with 1008. */
export const ROOM_RATE = Object.freeze({
  perSec: 15,
  burst: 30,
  abuseFactor: 3,           // above 45 messages per second ...
  abuseMs: 5000,            // ... for 5 s
});

export const CLOCK = Object.freeze({
  joinSamples: 5,
  resyncMs: 60_000,
  sampleTimeoutMs: 2000,
});

export const PING = 'ping';
export const PONG = 'pong';
export const PING_MS = 10_000;
/** The room closes a socket whose last ping (or, without one, its connection) is older than this. */
export const STALE_MS = 30_000;

/** Client reconnect delays. After the last entry it keeps retrying at that delay. */
export const BACKOFF_MS = Object.freeze([500, 1000, 2000, 4000, 8000]);
/** Failed reconnects before the client reports 'offline' (0.5 + 1 + 2 s of back-off, about 4 s). */
export const OFFLINE_AFTER_FAILURES = 3;
/** A connection that is not open after this long counts as failed. */
export const CONNECT_TIMEOUT_MS = 5000;

export const MAX_ID_LENGTH = 64;
export const MAX_NAME_LENGTH = 32;
export const MAX_LABEL_LENGTH = 64;
export const MAX_REASON_LENGTH = 80;
export const MAX_ROUTE_POINTS = 200;

/**
 * Marker kinds (#54). 'find': a point a surface player marked by pointing (src/state/finds.js). 'note' and 'go': a
 * note and a "go here" point, for the habitat seat (#55). The room refuses 'find' from the habitat.
 */
export const MARKER_KINDS = Object.freeze(['find', 'note', 'go']);
/** Markers a room keeps. Past this the room ignores new ones. 200 markers make a welcome of about 25 KB. */
export const MAX_MARKERS = 200;
/** How long a sample claim waits for the room before the scoop goes ahead locally and the claim is queued. */
export const SAMPLE_CLAIM_TIMEOUT_MS = 1500;

/** Byte length of a string in UTF-8, without TextEncoder so the module stays plain JS. */
export function utf8ByteLength(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

export const encode = (msg) => JSON.stringify(msg);

/** Parses one message. Returns a plain object with a string `type`, or null for anything else. */
export function decode(text) {
  if (typeof text !== 'string') return null;
  let msg;
  try { msg = JSON.parse(text); } catch { return null; }
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') return null;
  return msg;
}

// Field checks. Each returns true when the value is acceptable.
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH && ID_PATTERN.test(v);
const isColor = (v) => isInt(v, 0, COLOR_COUNT - 1);
const isRole = (v) => ROLES.includes(v);
const isUint32 = (v) => isInt(v, 0, 0xffffffff);
const isTime = (v) => isNum(v) && v >= 0;
const isOpt = (v, check) => v === undefined || check(v);
const isNullable = (v, check) => v === null || check(v);

/** Removes control characters and trims. Returns '' when nothing printable is left. */
export function cleanName(name) {
  if (typeof name !== 'string') return '';
  // oxlint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
}

export function isCrewEntry(e) {
  return e !== null && typeof e === 'object' && isId(e.id) && isStr(e.name, MAX_NAME_LENGTH) && e.name.length > 0 &&
    isNullable(e.color, isColor) && isRole(e.role) && isTime(e.joinedAt) &&
    (e.role === ROLE.SURFACE ? isColor(e.color) : e.color === null);
}

const pickCrewEntry = (e) => ({ id: e.id, name: e.name, color: e.color, role: e.role, joinedAt: e.joinedAt });
const copyOptional = (out, msg, keys) => { for (const k of keys) if (msg[k] !== undefined) out[k] = msg[k]; return out; };
const isRoutePoint = (pt) => Array.isArray(pt) && pt.length === 2 && isInt(pt[0], -1e6, 1e6) && isInt(pt[1], -1e6, 1e6);
const isPoseField = (v) => isInt(v, 0, 255) || isStr(v, 16);
const isBit = (v) => v === 0 || v === 1;
const stripType = ({ type: _type, ...rest }) => rest;

/**
 * One validator per message type, used by both sides. Each takes a decoded message and returns a copy with
 * only the known keys, or null when a field is missing or wrong. Fields the room adds (`id`, `by`, `at` ...)
 * are optional, so the same validator reads the client's message and the room's broadcast.
 */
export const VALIDATORS = Object.freeze({
  [MSG.HELLO](m) {
    if (m.v !== PROTOCOL_VERSION || !isId(m.id) || !isRole(m.role) || !isOpt(m.color, (c) => c === null || isColor(c))) return null;
    const name = cleanName(m.name);
    if (!name) return null;
    const out = { type: MSG.HELLO, v: m.v, id: m.id, name, role: m.role };
    if (isColor(m.color)) out.color = m.color;
    return out;
  },
  // welcome.route { pts, by, at } and welcome.go { go, why, by, at } (#55): the habitat seat's last route and last call,
  // stored in the room's meta table, or null. Their fields are those of the rt and go broadcasts.
  [MSG.WELCOME](m) {
    const you = m.you;
    if (!you || !isId(you.id) || !isRole(you.role) || !isNullable(you.color, isColor)) return null;
    if (!Array.isArray(m.crew) || !m.crew.every(isCrewEntry)) return null;
    if (!isNullable(m.startedAt, isTime) || !isNullable(m.seed, isUint32) || !isTime(m.now)) return null;
    if (!Array.isArray(m.markers) || !Array.isArray(m.samples)) return null;
    if (!isNullable(m.caseHolder, isId)) return null;
    // route and go (#55): the habitat seat's last route and last call, or null. A bad one is dropped, not the welcome.
    const route = m.route ? VALIDATORS[MSG.ROUTE]({ ...m.route, type: MSG.ROUTE }) : null;
    const go = m.go ? VALIDATORS[MSG.GO]({ ...m.go, type: MSG.GO }) : null;
    return {
      type: MSG.WELCOME, you: { id: you.id, color: you.color, role: you.role }, crew: m.crew.map(pickCrewEntry),
      startedAt: m.startedAt, seed: m.seed, now: m.now, markers: m.markers, samples: m.samples,
      caseHolder: m.caseHolder, route: route && route.by && route.at !== undefined ? stripType(route) : null,
      go: go && go.by && go.at !== undefined ? stripType(go) : null,
    };
  },
  [MSG.CREW](m) {
    if ((m.op !== 'join' && m.op !== 'leave') || !isCrewEntry(m.p)) return null;
    return { type: MSG.CREW, op: m.op, p: pickCrewEntry(m.p) };
  },
  // x, z: true position (cm); h: heading clockwise from north and pt: pitch, radians; a: gait; hp: hand pose;
  // ct: sender clock (ms). Optional (M2): ex, ez the sender's navigation estimate for the map, ac and at a
  // one-shot body clip and its time (s), c 0 when not carrying the case, l 0 or 1 to force the lamp.
  [MSG.POSE](m) {
    if (![m.x, m.z, m.h, m.pt, m.ct].every(isNum) || !isPoseField(m.a) || !isPoseField(m.hp) || !isOpt(m.id, isId)) return null;
    if (!isOpt(m.ex, isNum) || !isOpt(m.ez, isNum) || (m.ex === undefined) !== (m.ez === undefined)) return null;
    if (!isOpt(m.ac, (v) => isStr(v, 16) && v.length > 0) || !isOpt(m.at, isNum) || (m.ac === undefined) !== (m.at === undefined)) return null;
    if (!isOpt(m.c, isBit) || !isOpt(m.l, isBit)) return null;
    return copyOptional({ type: MSG.POSE, x: m.x, z: m.z, h: m.h, pt: m.pt, a: m.a, hp: m.hp, ct: m.ct }, m, ['ex', 'ez', 'ac', 'at', 'c', 'l', 'id']);
  },
  [MSG.TELEMETRY](m) {
    if (!isNum(m.o2) || !isNum(m.bat) || !isOpt(m.id, isId)) return null;
    return copyOptional({ type: MSG.TELEMETRY, o2: m.o2, bat: m.bat }, m, ['id']);
  },
  [MSG.START](m) {
    const fromRoom = m.startedAt !== undefined || m.seed !== undefined;
    if (!fromRoom) return { type: MSG.START };
    if (!isTime(m.startedAt) || !isUint32(m.seed)) return null;
    return { type: MSG.START, startedAt: m.startedAt, seed: m.seed };
  },
  [MSG.MARKER](m) {
    if (!isId(m.cid) || !MARKER_KINDS.includes(m.kind) || !isNum(m.x) || !isNum(m.z) || !isOpt(m.label, (l) => isStr(l, MAX_LABEL_LENGTH))) return null;
    if (!isOpt(m.id, (v) => isInt(v, 1, Number.MAX_SAFE_INTEGER)) || !isOpt(m.author, isId) || !isOpt(m.at, isTime)) return null;
    return copyOptional({ type: MSG.MARKER, cid: m.cid, kind: m.kind, x: m.x, z: m.z, label: m.label ?? '' }, m, ['id', 'author', 'at']);
  },
  [MSG.SAMPLE](m) {
    if (!isId(m.sid) || !isOpt(m.by, isId) || !isOpt(m.at, isTime) || !isOpt(m.ok, (v) => typeof v === 'boolean')) return null;
    return copyOptional({ type: MSG.SAMPLE, sid: m.sid }, m, ['by', 'at', 'ok']);
  },
  [MSG.CASE](m) {
    if (!isNullable(m.holder, isId)) return null;
    return { type: MSG.CASE, holder: m.holder };
  },
  [MSG.ROUTE](m) {
    if (!Array.isArray(m.pts) || m.pts.length > MAX_ROUTE_POINTS || !m.pts.every(isRoutePoint)) return null;
    if (!isOpt(m.by, isId) || !isOpt(m.at, isTime)) return null;
    return copyOptional({ type: MSG.ROUTE, pts: m.pts.map((p) => [p[0], p[1]]) }, m, ['by', 'at']);
  },
  [MSG.GO](m) {
    if (typeof m.go !== 'boolean' || !isOpt(m.why, (w) => isStr(w, MAX_REASON_LENGTH)) || !isOpt(m.by, isId) || !isOpt(m.at, isTime)) return null;
    return copyOptional({ type: MSG.GO, go: m.go, why: m.why ?? '' }, m, ['by', 'at']);
  },
  [MSG.TIME](m) {
    if (!isNum(m.c) || !isOpt(m.s, isNum)) return null;
    return copyOptional({ type: MSG.TIME, c: m.c }, m, ['s']);
  },
});

/** Validates any decoded message by its type. Unknown types return null. */
export function validate(msg) {
  if (!msg || !Object.hasOwn(VALIDATORS, msg.type)) return null;
  return VALIDATORS[msg.type](msg);
}
