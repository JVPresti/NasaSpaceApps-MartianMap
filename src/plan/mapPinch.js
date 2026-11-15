import { useEffect, useLayoutEffect, useRef } from 'react';
import { clampCrop } from './mapLayers.js';

// Two-finger pan and pinch zoom on the mission table's flat map (#365). MissionMap's own handlers move the map with one
// pointer (mouse or finger); this adds the second finger. The ground point under the fingers' midpoint at the start
// stays under the midpoint, and the crop scales with the distance between the fingers.

/**
 * The crop for a pinch, from the crop and the two finger positions at its start and now (client pixels).
 * @param {{ x0: number, z0: number, size: number }} start
 * @param {[{ x: number, y: number }, { x: number, y: number }]} from
 * @param {[{ x: number, y: number }, { x: number, y: number }]} to
 * @param {{ left: number, top: number, width: number }} rect the map's box (square)
 * @param {{ width: number, depth: number }} tile
 * @param {number} min smallest crop side, metres
 */
export function pinchCrop(start, from, to, rect, tile, min) {
  const mid = ([a, b]) => ({ x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
  const gap = ([a, b]) => Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  const m0 = mid(from), m1 = mid(to);
  const perPx = start.size / rect.width;
  const wx = start.x0 + m0.x * perPx, wz = start.z0 + m0.y * perPx;
  const limit = Math.min(tile.width, tile.depth);
  const size = Math.min(limit, Math.max(min, start.size * (gap(from) / gap(to))));
  const k = size / rect.width;
  return clampCrop({ x0: wx - m1.x * k, z0: wz - m1.y * k, size }, tile);
}

/**
 * Adds pinch to a map box. While two fingers are down it owns the gesture: it stops the events from reaching React's
 * one-pointer drag and clears that drag, so the two never fight.
 * @param {import('react').RefObject<HTMLElement>} boxRef
 * @param {{ crop: object, tile: object, min: number, setView: (crop: object) => void,
 *   dragRef: import('react').MutableRefObject<object | null> }} options
 */
export function useMapPinch(boxRef, { crop, tile, min, setView, dragRef }) {
  const live = useRef(null);
  // the latest crop and props for the listeners, which are attached once
  useLayoutEffect(() => { live.current = { crop, tile, min, setView, dragRef }; });
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const fingers = new Map();
    let pinch = null, next = null, frame = 0;
    const flush = () => { frame = 0; if (next) { live.current.setView(next); next = null; } };
    const points = () => [...fingers.values()].slice(0, 2);
    const down = (event) => {
      if (event.pointerType !== 'touch') return;
      // Capture every touch pointer, not only the second: a finger that lifts outside the map must still send its
      // pointerup here, or a stale entry would stay in `fingers` and skew the next pinch.
      try { box.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.size < 2) return;
      event.stopPropagation();
      const { crop: c, dragRef: drag } = live.current;
      if (drag) drag.current = null;
      pinch = { start: c, from: points(), rect: box.getBoundingClientRect() };
    };
    const move = (event) => {
      if (!fingers.has(event.pointerId)) return;
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!pinch || fingers.size < 2) return;
      event.stopPropagation();
      // one render per frame: two fingers send two moves a frame, so keep the newest crop and set it on the next frame
      const { tile: t, min: m } = live.current;
      next = pinchCrop(pinch.start, pinch.from, points(), pinch.rect, t, m);
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const up = (event) => {
      if (!fingers.delete(event.pointerId)) return;
      try { box.releasePointerCapture(event.pointerId); } catch { /* the browser released it already */ }
      if (pinch) event.stopPropagation();   // the lift that ends a pinch is not a tap on the map
      if (fingers.size === 0) pinch = null;
      else if (pinch && fingers.size < 2) pinch = { ...pinch, from: null };   // one finger left: wait for both to lift
    };
    box.addEventListener('pointerdown', down, true);
    box.addEventListener('pointermove', move, true);
    box.addEventListener('pointerup', up, true);
    box.addEventListener('pointercancel', up, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      box.removeEventListener('pointerdown', down, true);
      box.removeEventListener('pointermove', move, true);
      box.removeEventListener('pointerup', up, true);
      box.removeEventListener('pointercancel', up, true);
    };
  }, [boxRef]);
}
