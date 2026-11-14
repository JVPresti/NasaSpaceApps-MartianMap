import { useEffect, useRef } from 'react';
import { createEngine } from '../engine/index.js';
import { useMissionStore } from '../state/store.js';
import { connectEngine } from '../state/engineBridge.js';
import { connectSampling } from '../state/sampling.js';
import { startSimulation } from '../state/simulation.js';
import { connectWrist } from '../screens/wrist/controller.js';

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
 * Retrying remounts it with a new key, which disposes the previous engine before a new one boots.
 */
export default function EngineView({ onStatus, onProgress, onReady, onError, onLockChange, onEngine }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const callbacks = useRef({ onStatus, onProgress, onReady, onError, onLockChange, onEngine });

  useEffect(() => {
    callbacks.current = { onStatus, onProgress, onReady, onError, onLockChange, onEngine };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let engine;
    let live = true;
    let disconnect = null, stopSimulation = null, disconnectSampling = null, disconnectWrist = null;
    const current = () => live && (engine === undefined || engineRef.current === engine);
    try {
      engine = createEngine(container, {
        assetBase: ASSET_BASE,
        mode: useMissionStore.getState().mode,
        tier: tierFromUrl(),
        debug: import.meta.env.DEV,
        // Identity checks keep a disposed StrictMode/retry engine from writing stale progress into React.
        onStatus: (text) => { if (current()) callbacks.current.onStatus?.(text); },
        onProgress: (progress) => { if (current()) callbacks.current.onProgress?.(progress); },
        onError: (err) => { if (current()) callbacks.current.onError?.(err); },
        onLockChange: (locked) => { if (current()) callbacks.current.onLockChange?.(locked); },
      });
    } catch (err) {
      // Missing WebGL 2, or a synchronous WebGLRenderer failure.
      live = false;
      callbacks.current.onError?.(err);
      return undefined;
    }

    engineRef.current = engine;
    engine.ready.then(() => {
      if (!current()) return;
      disconnect = connectEngine(engine);
      disconnectSampling = connectSampling(engine);   // checklist, sample count and the sampling prompt (#36)
      disconnectWrist = connectWrist(engine);
      stopSimulation = startSimulation(engine, { mock: new URLSearchParams(window.location.search).get('mock') === '1' });
      callbacks.current.onEngine?.(engine);
      callbacks.current.onReady?.();
    }, () => {});
    return () => {
      live = false;
      if (engineRef.current === engine) {
        engineRef.current = null;
        callbacks.current.onEngine?.(null);
      }
      if (stopSimulation) stopSimulation();
      if (disconnect) disconnect();
      if (disconnectSampling) disconnectSampling();
      if (disconnectWrist) disconnectWrist();
      engine.dispose();
    };
  }, []);

  return <div ref={containerRef} className="engine-view" />;
}
