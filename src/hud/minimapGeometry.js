import { formatUnit } from '../i18n/index.js';
// Pure geometry for the helmet minimap (#60). No React, no three.js, no canvas.
// Coordinates: x east, z south, metres from Cheyava Falls. North is -z.
// The map is heading-up: the heading direction points to the top of the circle and north rotates around the rim.

/** HiRISE tile of public/marswalk/assets/terrain.json, in metres. */
export const TILE_WIDTH_M = 1422.506134457525;
export const TILE_DEPTH_M = 1500;

/** World radius shown from the centre of the minimap. A local tactical view, not the whole tile. */
export const MINIMAP_RANGE_M = 400;

const DEG = Math.PI / 180;

/** Wraps any angle into [0, 360). */
export const wrapDeg = (d) => ((d % 360) + 360) % 360;

/** True for a finite { x, z } point. */
export function isPoint(p) {
  return !!p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/** Tile UV of a world point: u = x / W + 0.5, v = z / H + 0.5. */
export function worldToTileUv(x, z, widthM = TILE_WIDTH_M, depthM = TILE_DEPTH_M) {
  return { u: x / widthM + 0.5, v: z / depthM + 0.5 };
}

/** World point of a tile UV. The inverse of worldToTileUv, for tests and future overlays. */
export function tileUvToWorld(u, v, widthM = TILE_WIDTH_M, depthM = TILE_DEPTH_M) {
  return { x: (u - 0.5) * widthM, z: (v - 0.5) * depthM };
}

/**
 * Screen offset of a point from the map centre, heading-up.
 * A point north of the centre (smaller z) is up, a point east is right, before the heading rotation.
 * @param {number} dx east offset, metres
 * @param {number} dz south offset, metres
 * @param {number|null} headingDeg degrees clockwise from north; null draws north-up and is reported by the caller
 * @param {number} scalePxPerM pixels per metre
 */
export function headingOffsetToScreen(dx, dz, headingDeg, scalePxPerM) {
  const rad = -((Number.isFinite(headingDeg) ? headingDeg : 0) * DEG);
  const c = Math.cos(rad), s = Math.sin(rad);
  return { x: (dx * c - dz * s) * scalePxPerM, y: (dx * s + dz * c) * scalePxPerM };
}

/**
 * Full world -> canvas projection. `cx`/`cy` are the canvas centre, `centreX`/`centreZ` the map centre.
 * @param {number} x
 * @param {number} z
 * @param {{ centreX: number, centreZ: number, headingDeg: number|null, scalePxPerM: number, cx: number, cy: number }} view
 */
export function projectToMap(x, z, view) {
  const o = headingOffsetToScreen(x - view.centreX, z - view.centreZ, view.headingDeg, view.scalePxPerM);
  return { x: view.cx + o.x, y: view.cy + o.y };
}

/**
 * Unit screen vector of a compass bearing, heading-up.
 * @param {number} bearingDeg degrees clockwise from north
 * @param {number|null} headingDeg
 */
export function bearingToScreenVector(bearingDeg, headingDeg) {
  const rel = (bearingDeg - (Number.isFinite(headingDeg) ? headingDeg : 0)) * DEG;
  return { x: Math.sin(rel), y: -Math.cos(rel) };
}

/** Positions of the N, E, S and W labels around the rim of a heading-up map. */
export function cardinalPoints(headingDeg, cx, cy, radiusPx) {
  return [
    { label: 'N', bearingDeg: 0 },
    { label: 'E', bearingDeg: 90 },
    { label: 'S', bearingDeg: 180 },
    { label: 'W', bearingDeg: 270 },
  ].map(({ label, bearingDeg }) => {
    const v = bearingToScreenVector(bearingDeg, headingDeg);
    return { label, x: cx + v.x * radiusPx, y: cy + v.y * radiusPx };
  });
}

/**
 * A readable scale bar: a 1, 2 or 5 times a power of ten metres, close to the requested pixel length.
 * @returns {{ meters: number, px: number, label: string } | null}
 */
export function niceScaleBar(rangeM, radiusPx, { targetPx = radiusPx * 0.55 } = {}) {
  if (!(rangeM > 0) || !(radiusPx > 0) || !(targetPx > 0)) return null;
  const raw = (rangeM * targetPx) / radiusPx;
  const base = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / base;
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  const meters = step * base;
  const px = (meters / rangeM) * radiusPx;
  return { meters, px, label: meters >= 1000 ? formatUnit(meters / 1000, 'km', Number.isInteger(meters / 1000) ? 0 : 1) : formatUnit(meters, 'm') };
}

/**
 * Hazard zones the minimap may draw: active entries with a finite centre and a positive radius.
 * The store starts with an empty list; #24-#26 may fill it later. An empty list means "nothing known",
 * not "the ground is safe".
 * @param {unknown} zones
 * @returns {Array<{ id?: string, x: number, z: number, radiusM: number, active: true }>}
 */
export function activeHazardZones(zones) {
  if (!Array.isArray(zones)) return [];
  return zones.filter((zone) => (
    !!zone
    && zone.active === true
    && Number.isFinite(zone.x)
    && Number.isFinite(zone.z)
    && Number.isFinite(zone.radiusM)
    && zone.radiusM > 0
  ));
}

/**
 * Split shelters.json entries into the habitat marker and the natural refuges. The HAB entry is the
 * habitat airlock (535.1, 574.1 in the shipped file), which is not the HAB route waypoint (520, 600).
 * @param {unknown} shelters
 */
export function splitShelters(shelters) {
  const valid = Array.isArray(shelters) ? shelters.filter(isPoint) : [];
  const habitat = valid.find((shelter) => shelter.type === 'habitat') ?? valid.find((shelter) => shelter.id === 'HAB') ?? null;
  return { habitat, refuges: valid.filter((shelter) => shelter !== habitat) };
}
