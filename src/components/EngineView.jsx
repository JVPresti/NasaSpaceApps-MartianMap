import { useEffect, useRef } from 'react';
import { createEngine } from '../engine/index.js';

const ASSET_BASE = import.meta.env.BASE_URL + 'marswalk/';

/**
 * Mounts the Marswalk engine once and forwards the mode to it.
 * The engine runs its own render loop; this component renders only when its props change, never per frame.
 */
export default function EngineView({ mode, onStatus, onReady, onError }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const modeRef = useRef(mode);
  const callbacks = useRef({ onStatus, onReady, onError });

  useEffect(() => {
    callbacks.current = { onStatus, onReady, onError };
  });

  useEffect(() => {
    const engine = createEngine(containerRef.current, {
      assetBase: ASSET_BASE,
      mode: modeRef.current,
      onStatus: (text) => callbacks.current.onStatus?.(text),
      onError: (err) => callbacks.current.onError?.(err),
    });
    engineRef.current = engine;
    engine.ready.then(() => {
      if (engineRef.current === engine) callbacks.current.onReady?.();
    }, () => {});
    return () => {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    engineRef.current?.setMode(mode);
  }, [mode]);

  return <div ref={containerRef} className="engine-view" />;
}
