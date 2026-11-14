import { useEffect, useRef } from 'react';
import { createEngine } from '../engine/index.js';
import { useMissionStore } from '../state/store.js';
import { connectEngine } from '../state/engineBridge.js';

const ASSET_BASE = import.meta.env.BASE_URL + 'marswalk/';

/**
 * Mounts the Marswalk engine once and connects it to the mission store (src/state/engineBridge.js):
 * mode, layer, sky and route flow from the store to the engine; the player's position flows back 5 times per second.
 * The engine runs its own render loop; this component never renders per frame.
 */
export default function EngineView({ onStatus, onReady, onError }) {
  const containerRef = useRef(null);
  const callbacks = useRef({ onStatus, onReady, onError });

  useEffect(() => {
    callbacks.current = { onStatus, onReady, onError };
  });

  useEffect(() => {
    let disconnect = null, disposed = false;
    const engine = createEngine(containerRef.current, {
      assetBase: ASSET_BASE,
      mode: useMissionStore.getState().mode,
      onStatus: (text) => callbacks.current.onStatus?.(text),
      onError: (err) => callbacks.current.onError?.(err),
    });
    engine.ready.then(() => {
      if (disposed) return;
      disconnect = connectEngine(engine);
      callbacks.current.onReady?.();
    }, () => {});
    return () => {
      disposed = true;
      if (disconnect) disconnect();
      engine.dispose();
    };
  }, []);

  return <div ref={containerRef} className="engine-view" />;
}
