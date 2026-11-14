import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import EngineView from './components/EngineView.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import ModeSwitch from './components/ModeSwitch.jsx';
import PauseMenu from './components/PauseMenu.jsx';
import StartScreen from './components/StartScreen.jsx';
import EventBanner from './events/EventBanner.jsx';
import EventDebug from './events/EventDebug.jsx';
import Hud from './hud/Hud.jsx';
import MissionClock from './plan/MissionClock.jsx';
import PlanMode from './plan/PlanMode.jsx';
import SourcesRoot from './sources/SourcesScreen.jsx';
import { WalkStopCard } from './stops/ScienceStops.jsx';
import { createRouteProgress } from './hud/minimapRoute.js';
import { openSources } from './sources/sourcesStore.js';
import { pauseMission, setMode, useMissionStore } from './state/store.js';
import { EVA_PHASE, PAUSE_VIEW, pauseEva, requestEvaLock, restartEva, resumeEva } from './state/evaSession.js';
import './App.css';
import './components/menu.css';

const HINTS = {
  walk: 'Esc to pause · WASD to walk · Shift to jog · H for controls',
  plan: 'Right-drag to pan · scroll to zoom · Esc to pause · H for controls',
};

const SITE = 'Neretva Vallis · Jezero crater · Mars';

const DEBUG_EVENTS =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1');

// Escape is a key press, not a user activation, so it cannot grant pointer lock. In the Walk pause menu it
// must explain that instead of starting a request that can only fail.
const ESC_LOCK_NOTICE = 'Press Enter or click Resume to capture the mouse.';

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
  const [loadingDone, setLoadingDone] = useState(false);
  // The minimap route tracker belongs to the app, not to the minimap: App unmounts the HUD in Plan mode,
  // so a tracker created inside the Minimap effect would lose the walked distance on every mode switch.
  // It resets only when the route content changes (Minimap calls setPath on mount and on route updates).
  const [minimapRoute] = useState(() => createRouteProgress());

  // The phase and overlay are kept in refs as well: pointer-lock and key handlers run outside React
  // events and must see the value written by the same click/key press, not the previous render.
  const [phase, setPhaseState] = useState(EVA_PHASE.START);
  const phaseRef = useRef(EVA_PHASE.START);
  const setPhase = useCallback((next) => { phaseRef.current = next; setPhaseState(next); }, []);
  const [overlay, setOverlayState] = useState(null);
  const overlayRef = useRef(null);
  const setOverlay = useCallback((next) => { overlayRef.current = next; setOverlayState(next); }, []);

  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [menuFocus, setMenuFocus] = useState(0);
  const [quality, setQuality] = useState(null);
  const [qualityBusy, setQualityBusy] = useState(false);
  const qualityBusyRef = useRef(false);
  const [qualityError, setQualityError] = useState(null);
  const [planEpoch, setPlanEpoch] = useState(0);

  const engineRef = useRef(null);
  const runtimeRef = useRef(null);

  // A pointer-lock answer belongs to the action that asked for it. These sequences are bumped by anything
  // that ends an attempt (Escape, a mode change, restart, retry), so a late grant can never resume input or
  // the mission clock behind the current screen.
  const resumeSeqRef = useRef(0);
  const resumeSeqRef = useRef(0);
  const walkLockSeqRef = useRef(0);

  const handleStatus = useCallback((text) => dispatch({ type: 'status', text }), []);
  const handleProgress = useCallback((progress) => dispatch({ type: 'progress', progress }), []);
  const handleReady = useCallback(() => dispatch({ type: 'ready' }), []);
  const handleError = useCallback((error) => {
    resumeSeqRef.current += 1;
    dispatch({ type: 'error', error });
  }, []);
  const handleGone = useCallback(() => setLoadingDone(true), []);

  const handleEngine = useCallback((instance, runtime) => {
    resumeSeqRef.current += 1;
    engineRef.current = instance;
    runtimeRef.current = runtime || null;
    setEngine(instance);
    setQuality(instance ? instance.getQuality() : null);
    if (instance) {
      // The engine and simulation are ready; the start screen is a real pause from this instant.
      instance.setInputEnabled(false);
      pauseMission();
      setPhase(EVA_PHASE.START);
      setOverlay(null);
      setNotice(null);
    }
  }, [setOverlay, setPhase]);

  const setBusyState = useCallback((value) => { busyRef.current = value; setBusy(value); }, []);

  /** Enter the paused phase through the real #59 store action and the engine's input/lock controls. */
  const pauseFor = useCallback((view, message = null) => {
    setPhase(EVA_PHASE.PAUSED);
    setOverlay(view);
    pauseEva({ engine: engineRef.current });
    setNotice(message);
    if (engineRef.current) setQuality(engineRef.current.getQuality());
  }, [setOverlay, setPhase]);

  const showOverlay = useCallback((view) => {
    if (phaseRef.current === EVA_PHASE.PLAYING) {
      pauseFor(view);
      return;
    }
    setOverlay(view);
  }, [pauseFor, setOverlay]);

  const handleLockChange = useCallback((locked) => {
    if (locked || phaseRef.current !== EVA_PHASE.PLAYING) return;
    if (useMissionStore.getState().mode !== 'walk') return;   // Plan deliberately releases the lock
    pauseFor(PAUSE_VIEW.MENU, 'The mouse was released, so the EVA is paused. Choose Resume to capture it again.');
  }, [pauseFor]);

  /** Start or Resume. In Walk nothing runs until the browser grants the lock; Plan needs no lock. */
  const handleResume = useCallback(async () => {
    const instance = engineRef.current;
    if (!instance || busyRef.current) return;
    const attempt = ++resumeSeqRef.current;
    const fromPhase = phaseRef.current;
    const resumeMode = useMissionStore.getState().mode;
    // Checked after the browser answers and before resumeEva enables input or resumes the clock.
    const isCurrent = () => attempt === resumeSeqRef.current
      && useMissionStore.getState().mode === resumeMode
      && phaseRef.current === fromPhase;
    setBusyState(true);
    setNotice(null);
    setQualityError(null);
    const result = await resumeEva({ engine: instance, mode: resumeMode, isCurrent });
    setBusyState(false);
    // A superseded attempt stays paused and silent: the action that ended it owns the menu and its message.
    if (result.stale) return;
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setOverlay(null);
    setPhase(EVA_PHASE.PLAYING);
    setNotice(null);
  }, [setBusyState, setOverlay, setPhase]);

  const handleModeChange = useCallback(async (next) => {
    if (busyRef.current) return;
    if (next === useMissionStore.getState().mode) return;
    // Any mode change ends a pending resume; setMode also makes the engine cancel a pending Walk lock.
    resumeSeqRef.current += 1;
    const attempt = ++walkLockSeqRef.current;
    setMode(next);
    if (phaseRef.current === EVA_PHASE.PLAYING && next === 'walk') {
      // The click itself is the user gesture. If the lock is refused, stay paused and explain.
      const instance = engineRef.current;
      const lock = await requestEvaLock(instance);
      // A newer mode change owns the interface; its request (or Plan) has already replaced this one.
      if (attempt !== walkLockSeqRef.current) return;
      if (useMissionStore.getState().mode !== 'walk') {
        // A late grant must never capture the mouse in Plan. Releasing is harmless when nothing is held.
        try { instance?.releasePointerLock?.(); } catch { /* nothing to release */ }
        return;
      }
      if (phaseRef.current === EVA_PHASE.PLAYING && !lock.ok) pauseFor(PAUSE_VIEW.MENU, lock.message);
    }
  }, [pauseFor]);

  const handleQuality = useCallback(async (option) => {
    const instance = engineRef.current;
    if (!instance || qualityBusyRef.current) return;
    qualityBusyRef.current = true;
    setQualityBusy(true);
    setQualityError(null);
    try {
      const result = await instance.setQuality(option);
      setQuality(result);
      if (result.error) setQualityError(result.error);
    } catch (cause) {
      setQualityError((cause && cause.message) || 'Scene quality could not be changed.');
      setQuality(instance.getQuality());
    } finally {
      qualityBusyRef.current = false;
      setQualityBusy(false);
    }
  }, []);

  const handleRestartConfirm = useCallback(() => {
    if (busyRef.current) return;
    resumeSeqRef.current += 1;
    walkLockSeqRef.current += 1;
    setBusyState(true);
    setNotice(null);
    setQualityError(null);
    const instance = engineRef.current;
    let result;
    try {
      result = restartEva({
        engine: instance,
        stopSimulation: runtimeRef.current?.stopSimulation,
        startSimulation: runtimeRef.current?.startSimulation,
      });
    } catch (cause) {
      result = { ok: false, message: (cause && cause.message) || 'The EVA could not be restarted.' };
    }
    setBusyState(false);
    setPhase(EVA_PHASE.START);
    setOverlay(null);
    setPlanEpoch((value) => value + 1);
    setNotice(result.ok ? null : result.message);
    if (instance) setQuality(instance.getQuality());
  }, [setBusyState, setOverlay, setPhase]);

  const handleRetry = useCallback(() => {
    resumeSeqRef.current += 1;
    walkLockSeqRef.current += 1;
    setLoadingDone(false);
    setPhase(EVA_PHASE.START);
    setOverlay(null);
    setNotice(null);
    setQuality(null);
    setQualityError(null);
    setBusyState(false);
    qualityBusyRef.current = false;
    setQualityBusy(false);
    dispatch({ type: 'retry' });
  }, [setBusyState, setOverlay, setPhase]);

  const handlePauseCancel = useCallback(() => {
    if (overlayRef.current !== PAUSE_VIEW.MENU) {
      setOverlay(PAUSE_VIEW.MENU);
      return;
    }
    if (useMissionStore.getState().mode === 'walk') {
      // Esc cannot grant pointer lock (a key press is not a user activation), so it must not start a
      // request that can only fail. Cancel any pending attempt, keep the real pause and point at Resume.
      resumeSeqRef.current += 1;
      try { engineRef.current?.releasePointerLock?.(); } catch { /* the pause is what matters */ }
      setBusyState(false);
      setNotice(ESC_LOCK_NOTICE);
      setMenuFocus((value) => value + 1);
      return;
    }
    // Plan resumes without a lock, so Esc can resume there.
    handleResume();
  }, [handleResume, setBusyState, setOverlay]);

  // Escape opens the pause menu while playing; H opens the controls help with a pause. Escape inside a
  // dialog is handled by its cancel event, so each view chooses whether it means back or resume.
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return;
      if (event.key === 'Escape') {
        if (phaseRef.current === EVA_PHASE.PLAYING) {
          event.preventDefault();
          pauseFor(PAUSE_VIEW.MENU);
        }
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        if (phaseRef.current === EVA_PHASE.PLAYING) {
          event.preventDefault();
          pauseFor(PAUSE_VIEW.CONTROLS);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pauseFor]);

  const showTopbar = load.status === 'ready' && phase === EVA_PHASE.PLAYING;

  return (
    <div className="app">
      <EngineView
        key={`engine-${load.attempt}`}
        onStatus={handleStatus}
        onProgress={handleProgress}
        onReady={handleReady}
        onError={handleError}
        onLockChange={handleLockChange}
        onEngine={handleEngine}
      />

      {load.status === 'ready' && (
        <PlanMode key={`plan-${load.attempt}-${planEpoch}`} engine={engine} active={mode === 'plan'} />
      )}
      {/* Plan mode places the banner in its own alert region; Walk keeps the free-floating strip. */}
      {load.status === 'ready' && mode === 'walk' && <EventBanner />}
      {load.status === 'ready' && DEBUG_EVENTS && <EventDebug />}

      <header className="topbar" inert={showTopbar ? undefined : true}>
        <h1>
          Marswalk <span>Cheyava Falls · Neretva Vallis, Jezero crater</span>
        </h1>
        {showTopbar && mode === 'plan' && <MissionClock />}
        <ModeSwitch mode={mode} onChange={handleModeChange} />
      </header>

      <LoadingScreen key={`loading-${load.attempt}`} state={load} site={SITE} onRetry={handleRetry} onGone={handleGone} />

      {load.status === 'ready' && mode === 'walk' && <Hud engine={engine} minimapRoute={minimapRoute} />}

      {load.status === 'ready' && <WalkStopCard active={mode === 'walk'} />}

      {load.status === 'ready' && <SourcesRoot />}

      {showTopbar && <p className="hint">{mode === 'walk' ? HINTS.walk : HINTS.plan}</p>}

      {load.status === 'ready' && loadingDone && phase === EVA_PHASE.START && (
        <StartScreen mode={mode} busy={busy} notice={notice} onStart={handleResume} />
      )}

      {load.status === 'ready' && phase === EVA_PHASE.PAUSED && overlay && (
        <PauseMenu
          view={overlay}
          mode={mode}
          busy={busy}
          notice={notice}
          focusToken={menuFocus}
          quality={quality}
          qualityBusy={qualityBusy}
          qualityError={qualityError || quality?.error || null}
          onResume={handleResume}
          onRestartRequest={() => showOverlay(PAUSE_VIEW.RESTART)}
          onRestartConfirm={handleRestartConfirm}
          onControls={() => showOverlay(PAUSE_VIEW.CONTROLS)}
          onSources={openSources}
          onMenu={() => setOverlay(PAUSE_VIEW.MENU)}
          onQuality={handleQuality}
          onModeChange={handleModeChange}
          onCancel={handlePauseCancel}
        />
      )}
    </div>
  );
}
