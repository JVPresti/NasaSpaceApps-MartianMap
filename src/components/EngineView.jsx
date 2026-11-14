import { useEffect, useRef } from 'react';
import { createEngine } from '../engine/index.js';
import { useMissionStore } from '../state/store.js';
import { connectEngine } from '../state/engineBridge.js';
import { startSimulation } from '../state/simulation.js';

const ASSET_BASE = import.meta.env.BASE_URL + 'marswalk/';

// Manual quality override: ?tier=high or ?tier=low forces a tier and turns off the automatic choice.
function tierFromUrl() {
  const t = new URLSearchParams(window.location.search).get('tier');
  return t || null;   // the engine checks the value and warns about an unknown one
}

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
    let disconnect = null, stopSimulation = null, disposed = false;
    const engine = createEngine(containerRef.current, {
      assetBase: ASSET_BASE,
      mode: useMissionStore.getState().mode,
      tier: tierFromUrl(),
      debug: import.meta.env.DEV,
      onStatus: (text) => callbacks.current.onStatus?.(text),
      onError: (err) => callbacks.current.onError?.(err),
    });
    engine.ready.then(() => {
      if (disposed) return;
      disconnect = connectEngine(engine);
      stopSimulation = startSimulation(engine, { mock: new URLSearchParams(window.location.search).get('mock') === '1' });
      callbacks.current.onReady?.();
    }, () => {});
    return () => {
      disposed = true;
      if (stopSimulation) stopSimulation();
      if (disconnect) disconnect();
      engine.dispose();
    };
  }, []);

  return <div ref={containerRef} className="engine-view" />;
}
