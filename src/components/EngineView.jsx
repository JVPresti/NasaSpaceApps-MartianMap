import { useEffect, useRef } from 'react';
import { createEngine } from '../engine/index.js';

const ASSET_BASE = import.meta.env.BASE_URL + 'marswalk/';

/**
 * Mounts the Marswalk engine once and forwards the mode to it.
 * The engine runs its own render loop; this component renders only when its props change, never per frame.
 * Retrying remounts it with a new key, which disposes the previous engine before a new one boots.
 */
export default function EngineView({ mode, onStatus, onProgress, onReady, onError }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const modeRef = useRef(mode);
  const callbacks = useRef({ onStatus, onProgress, onReady, onError });

  useEffect(() => {
    callbacks.current = { onStatus, onProgress, onReady, onError };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let engine;
    let live = true;
    const current = () => live && (engine === undefined || engineRef.current === engine);
    try {
      engine = createEngine(container, {
        assetBase: ASSET_BASE,
        mode: modeRef.current,
        // Identity checks keep a disposed StrictMode/retry engine from writing stale progress into React.
        onStatus: (text) => { if (current()) callbacks.current.onStatus?.(text); },
        onProgress: (progress) => { if (current()) callbacks.current.onProgress?.(progress); },
        onError: (err) => { if (current()) callbacks.current.onError?.(err); },
      });
    } catch (err) {
      // Missing WebGL 2, or a synchronous WebGLRenderer failure.
      live = false;
      callbacks.current.onError?.(err);
      return undefined;
    }

    engineRef.current = engine;
    engine.ready.then(() => {
      if (current()) callbacks.current.onReady?.();
    }, () => {});
    return () => {
      live = false;
      if (engineRef.current === engine) engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    engineRef.current?.setMode(mode);
  }, [mode]);

  return <div ref={containerRef} className="engine-view" />;
}
