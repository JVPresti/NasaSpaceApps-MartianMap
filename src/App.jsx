import { useCallback, useReducer, useState } from 'react';
import EngineView from './components/EngineView.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import ModeSwitch from './components/ModeSwitch.jsx';
import RouteLegsPanel from './components/RouteLegsPanel.jsx';
import PlanMode from './plan/PlanMode.jsx';
import { useMissionStore, setMode } from './state/store.js';
import './App.css';

const HINTS = {
  walk: 'Click to look around · WASD to walk · Shift to jog',
  walkLocked: 'Esc to release the mouse · WASD to walk · Shift to jog',
  plan: 'Right-drag to pan · scroll to zoom',
};

const SITE = 'Neretva Vallis · Jezero crater · Mars';

const INITIAL_LOAD = {
  status: 'loading',
  stage: 'Starting the engine…',
  progress: 0,
  loaded: 0,
  total: 0,
  error: null,
  attempt: 0,
};

function loadReducer(state, action) {
  switch (action.type) {
    case 'status':
      if (state.status !== 'loading' || !action.text || action.text === state.stage) return state;
      return { ...state, stage: action.text };
    case 'progress': {
      if (state.status !== 'loading') return state;
      const ratio = Math.min(1, Math.max(0, Number(action.progress?.ratio) || 0));
      if (ratio <= state.progress && action.progress?.loaded === state.loaded && action.progress?.total === state.total) return state;
      return {
        ...state,
        progress: Math.max(state.progress, ratio),
        loaded: action.progress?.loaded ?? state.loaded,
        total: action.progress?.total ?? state.total,
      };
    }
    case 'ready':
      if (state.status === 'error') return state;
      return { ...state, status: 'ready', progress: 1 };
    case 'error':
      // The first error is final: a late status/progress/ready event must not hide it.
      if (state.status === 'error') return state;
      return { ...state, status: 'error', error: action.error };
    case 'retry':
      return { ...INITIAL_LOAD, attempt: state.attempt + 1 };
    default:
      return state;
  }
}

export default function App() {
  const mode = useMissionStore((s) => s.mode);
  const [engine, setEngine] = useState(null);
  const [load, dispatch] = useReducer(loadReducer, undefined, () => INITIAL_LOAD);
  const [mouseLocked, setMouseLocked] = useState(false);   // changes only when the pointer lock does, never per frame

  const handleStatus = useCallback((text) => dispatch({ type: 'status', text }), []);
  const handleProgress = useCallback((progress) => dispatch({ type: 'progress', progress }), []);
  const handleReady = useCallback(() => dispatch({ type: 'ready' }), []);
  const handleError = useCallback((error) => dispatch({ type: 'error', error }), []);
  const handleRetry = useCallback(() => dispatch({ type: 'retry' }), []);

  return (
    <div className="app">
      <EngineView
        key={`engine-${load.attempt}`}
        onStatus={handleStatus}
        onProgress={handleProgress}
        onReady={handleReady}
        onError={handleError}
        onLockChange={setMouseLocked}
        onEngine={setEngine}
      />

      {load.status === 'ready' && <PlanMode engine={engine} active={mode === 'plan'} />}

      <header className="topbar" inert={load.status !== 'ready' ? true : undefined}>
        <h1>
          Marswalk <span>Cheyava Falls · Neretva Vallis, Jezero crater</span>
        </h1>
        <ModeSwitch mode={mode} onChange={setMode} />
      </header>

      <LoadingScreen key={`loading-${load.attempt}`} state={load} site={SITE} onRetry={handleRetry} />

      {load.status === 'ready' && mode === 'plan' && <RouteLegsPanel />}

      {load.status === 'ready' && <p className="hint">{mode === 'walk' && mouseLocked ? HINTS.walkLocked : HINTS[mode]}</p>}
    </div>
  );
}
