import { useEffect, useRef } from 'react';
import { createEngine } from '../engine/index.js';
import { pauseMission, useMissionStore } from '../state/store.js';
import { connectEngine } from '../state/engineBridge.js';
import { clearCurrentEngine, setCurrentEngine } from '../state/currentEngine.js';
import { connectSampling } from '../state/sampling.js';
import { connectSlopeGridKey } from '../state/slopeGrid.js';
import { connectHabitatScreens } from '../state/habitatScreens.js';
import { startSimulation } from '../state/simulation.js';
import { connectWrist } from '../screens/wrist/controller.js';
import { connectAudio } from '../audio/connectAudio.js';

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
 *
 * The engine starts with gameplay input disabled and the simulation paused, so the start screen is a real
 * stop: no mission clock, suit consumption or walking happens behind it. `onEngine` also receives the
 * simulation controls used by the restart flow in src/state/evaSession.js.
 */
export default function EngineView({ onStatus, onProgress, onReady, onError, onLockChange, onEngine, onGamepadAction }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const callbacks = useRef({ onStatus, onProgress, onReady, onError, onLockChange, onEngine, onGamepadAction });

  useEffect(() => {
    callbacks.current = { onStatus, onProgress, onReady, onError, onLockChange, onEngine, onGamepadAction };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let engine;
    let live = true;
    let disconnect = null, stopSimulation = null, disconnectSampling = null, disconnectSlopeGridKey = null, disconnectWrist = null, disconnectHabitatScreens = null, disconnectAudio = null;
    const mock = new URLSearchParams(window.location.search).get('mock') === '1';
    const current = () => live && (engine === undefined || engineRef.current === engine);

    const stopCurrentSimulation = () => {
      if (!stopSimulation) return;
      const stop = stopSimulation;
      stopSimulation = null;
      stop();
    };
    const startCurrentSimulation = () => {
      if (!live) return null;
      stopCurrentSimulation();
      stopSimulation = startSimulation(engine, { mock });
      return stopSimulation;
    };

    try {
      engine = createEngine(container, {
        assetBase: ASSET_BASE,
        mode: useMissionStore.getState().mode,
        tier: tierFromUrl(),
        inputEnabled: false,
        debug: import.meta.env.DEV,
        // Identity checks keep a disposed StrictMode/retry engine from writing stale progress into React.
        onStatus: (text) => { if (current()) callbacks.current.onStatus?.(text); },
        onProgress: (progress) => { if (current()) callbacks.current.onProgress?.(progress); },
        onError: (err) => { if (current()) callbacks.current.onError?.(err); },
        onLockChange: (locked) => { if (current()) callbacks.current.onLockChange?.(locked); },
        onGamepadAction: (action) => { if (current()) callbacks.current.onGamepadAction?.(action); },
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
      try {
        disconnect = connectEngine(engine);
        disconnectSampling = connectSampling(engine);   // checklist, sample count and the sampling prompt (#36)
        disconnectSlopeGridKey = connectSlopeGridKey();   // G: slope grid on the ground in Walk mode (#50)
        disconnectWrist = connectWrist(engine);   // wrist screen app (#67)
        disconnectHabitatScreens = connectHabitatScreens(engine);   // the habitat's wall screens and planning table (#47)
        disconnectAudio = connectAudio(engine);   // suit audio (#72): starts on the first click or key press
        startCurrentSimulation();
        setCurrentEngine(engine);   // online play reads the pose and draws remote suits through it (#53)
        pauseMission();   // the start screen is a real pause, including ?mock=1 where nothing starts
        callbacks.current.onEngine?.(engine, {
          stopSimulation: stopCurrentSimulation,
          startSimulation: startCurrentSimulation,
        });
        callbacks.current.onReady?.();
      } catch (err) {
        // A partly wired scene must surface as a loading error, not as a silent stuck loader.
        if (current()) callbacks.current.onError?.(err);
      }
    }, () => {});
    return () => {
      live = false;
      if (engineRef.current === engine) {
        engineRef.current = null;
        callbacks.current.onEngine?.(null);
      }
      clearCurrentEngine(engine);
      stopCurrentSimulation();
      if (disconnect) disconnect();
      if (disconnectSampling) disconnectSampling();
      if (disconnectSlopeGridKey) disconnectSlopeGridKey();
      if (disconnectWrist) disconnectWrist();
      if (disconnectHabitatScreens) disconnectHabitatScreens();
      if (disconnectAudio) disconnectAudio();
      engine.dispose();
    };
  }, []);

  return <div ref={containerRef} className="engine-view" />;
}
