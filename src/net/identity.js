/**
 * Player identity for online play.
 *
 * - Player id: sessionStorage, so it is per tab and survives a reload. A reload reconnects as the same
 *   player (the room replaces the old socket); two tabs are two crew members.
 * - Preferred colour: sessionStorage too, so a reload asks for the colour it had.
 * - Display name: localStorage, shared by every tab of the browser. Default "Crew 1234".
 *
 * Storage can be missing or throw (private windows, blocked site data); every access falls back to a value
 * kept for this page only.
 */
import { COLOR_COUNT, cleanName } from './protocol.js';

export const PLAYER_ID_KEY = 'marswalk.online.playerId';
export const PLAYER_COLOR_KEY = 'marswalk.online.color';
export const PLAYER_NAME_KEY = 'marswalk.online.name';

const memory = new Map();

function storageOf(kind) {
  try { return globalThis[kind] || null; } catch { return null; }
}

function read(kind, key) {
  try { const v = storageOf(kind)?.getItem(key); if (v !== null && v !== undefined) return v; } catch { /* fall back */ }
  return memory.has(kind + key) ? memory.get(kind + key) : null;
}

function write(kind, key, value) {
  memory.set(kind + key, value);
  try { storageOf(kind)?.setItem(key, value); } catch { /* kept in memory */ }
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getPlayerId() {
  let id = read('sessionStorage', PLAYER_ID_KEY);
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) { id = randomId(); write('sessionStorage', PLAYER_ID_KEY, id); }
  return id;
}

/** A new player id for this tab, for "Join as a new player" after another tab took the seat (4002). */
export function newPlayerId() {
  const id = randomId();
  write('sessionStorage', PLAYER_ID_KEY, id);
  return id;
}

export function getPlayerName() {
  let name = cleanName(read('localStorage', PLAYER_NAME_KEY) || '');
  if (!name) { name = 'Crew ' + String(1000 + Math.floor(Math.random() * 9000)); write('localStorage', PLAYER_NAME_KEY, name); }
  return name;
}

/** Stores a new display name; returns the cleaned name, or null when nothing printable is left. */
export function setPlayerName(name) {
  const clean = cleanName(name);
  if (!clean) return null;
  write('localStorage', PLAYER_NAME_KEY, clean);
  return clean;
}

export function getPreferredColor() {
  const v = Number(read('sessionStorage', PLAYER_COLOR_KEY));
  return Number.isInteger(v) && v >= 0 && v < COLOR_COUNT && read('sessionStorage', PLAYER_COLOR_KEY) !== null ? v : undefined;
}

export function setPreferredColor(color) {
  if (Number.isInteger(color) && color >= 0 && color < COLOR_COUNT) write('sessionStorage', PLAYER_COLOR_KEY, String(color));
}

/** Test helper: forget the in-memory fallback. */
export function resetIdentityMemory() {
  memory.clear();
}
