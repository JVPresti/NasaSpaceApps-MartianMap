// Per-frame pose for the HUD elements that move while the player turns or walks (heading tape, minimap, partner
// arrow). The store keeps the 5 Hz copy for everything else (src/state/engineBridge.js). These elements read the
// engine in a requestAnimationFrame loop and write transforms or text straight to DOM refs, so React still never
// renders per frame.
import { useEffect, useRef, useSyncExternalStore } from 'react';

let engine = null;
const listeners = new Set();

/** The Hud hands its engine over once (Hud.jsx); live elements pick it up from here. */
export function setLiveEngine(next) {
  if (next === engine) return;
  engine = next;
  for (const l of listeners) l();
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const current = () => engine;

/** The engine the live elements read, or null before the scene is ready. */
export function useLiveEngine() {
  return useSyncExternalStore(subscribe, current, current);
}

/**
 * Call `onFrame(player)` once per animation frame with engine.getPlayer(), while mounted and the engine exists.
 * `onFrame` may change between renders; the loop always calls the latest one.
 */
export function usePoseFrame(onFrame) {
  const eng = useLiveEngine();
  const cb = useRef(onFrame);
  useEffect(() => { cb.current = onFrame; });
  useEffect(() => {
    if (!eng || typeof eng.getPlayer !== 'function') return undefined;
    let id = 0;
    const loop = () => {
      try { cb.current(eng.getPlayer()); } catch { /* a HUD element must never stop the loop */ }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [eng]);
}
