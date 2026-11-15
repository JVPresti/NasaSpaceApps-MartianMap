// Numbers and places for the presentation (#291): templates like '{legs.0.distanceM} m' read public/present/plan.json.
// Plain JavaScript, so the beat tests can check every template against the real file.
import { PLACES } from './beats.js';

/** Value at a dotted path ('legs.0.distanceM'), or undefined. */
export function lookup(data, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
}

/** Replace every {path} in text. A missing value shows as a dash, never as "undefined". */
export function fill(text, data, lang = 'en') {
  if (text == null) return '';
  return String(text).replace(/\{([\w.]+)\}/g, (_, path) => {
    const v = lookup(data, path);
    if (v == null) return '–';
    return typeof v === 'number' ? formatNumber(v, lang) : String(v);
  });
}

export function formatNumber(v, lang = 'en') {
  const digits = Number.isInteger(v) ? 0 : Math.abs(v) < 1 ? 2 : Math.abs(v) < 100 ? 1 : 0;
  return v.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** A track end that may name a plan.json value ('totals.distanceM'). */
export function trackNumber(value, data) {
  return typeof value === 'string' ? Number(lookup(data, value)) : value;
}

/**
 * Where a label or a shot points: { x, z } in engine metres or { lat, lon }, or null when unknown.
 * @param {string | object} at a PLACES name, 'leg:N', 'bend', 'astronaut', or a point
 * @param {object} plan plan.json
 * @param {number} [zoneFrame] the zone clip frame, for 'astronaut'
 */
export function resolvePlace(at, plan, zoneFrame = 0) {
  if (at && typeof at === 'object') return at;
  if (at === 'astronaut') return astronautAt(plan, zoneFrame);
  if (at === 'bend') return plan.bend ? { x: plan.bend.steepX, z: plan.bend.steepZ } : null;
  if (typeof at === 'string' && at.startsWith('leg:')) {
    const leg = plan.legs[Number(at.slice(4))];
    return leg ? { x: leg.mid[0], z: leg.mid[1] } : null;
  }
  const p = PLACES[at];
  return p && typeof p === 'object' ? p : null;
}

/** The astronaut's position in the zone clip at a fractional frame. */
export function astronautAt(plan, f) {
  const frames = plan.zone.frames;
  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(f))), j = Math.min(frames.length - 1, i + 1), u = Math.max(0, Math.min(1, f - i));
  return { x: frames[i].x + (frames[j].x - frames[i].x) * u, z: frames[i].z + (frames[j].z - frames[i].z) * u };
}

/** The walkback margin in minutes at a fractional frame of the zone clip. */
export function marginAt(plan, f) {
  const frames = plan.zone.frames;
  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(f))), j = Math.min(frames.length - 1, i + 1), u = Math.max(0, Math.min(1, f - i));
  return Math.round(frames[i].marginMin + (frames[j].marginMin - frames[i].marginMin) * u);
}

/** Decode the zone's `last` bytes (base64) into a Uint8Array. Works in the browser and in Node. */
export function decodeLast(b64) {
  if (typeof atob === 'function') {
    const s = atob(b64), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** The mission clock in the zone clip at a fractional frame, as 'm:ss'. */
export function clockAt(plan, f) {
  const frames = plan.zone.frames;
  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(f))), j = Math.min(frames.length - 1, i + 1), u = Math.max(0, Math.min(1, f - i));
  const sec = Math.round(frames[i].elapsedSec + (frames[j].elapsedSec - frames[i].elapsedSec) * u);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** The zone's area in hectares at a fractional frame of the clip. */
export function areaAt(plan, f) {
  const frames = plan.zone.frames;
  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(f))), j = Math.min(frames.length - 1, i + 1), u = Math.max(0, Math.min(1, f - i));
  return frames[i].areaHa + (frames[j].areaHa - frames[i].areaHa) * u;
}
