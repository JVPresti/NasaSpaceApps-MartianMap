import { t, translateText } from './i18n/index.js';
import { useLanguage } from './i18n/useLanguage.js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import EngineView from './components/EngineView.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import ModeSwitch from './components/ModeSwitch.jsx';
import PauseMenu from './components/PauseMenu.jsx';
import StartScreen from './components/StartScreen.jsx';
import { useShortcuts } from './components/useShortcuts.js';
import DebriefScreen from './debrief/DebriefScreen.jsx';
import EventBanner from './events/EventBanner.jsx';
import EventDebug from './events/EventDebug.jsx';
import Finds from './finds/Finds.jsx';
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
  get walk() { return t('menu.esc.to.pause.wasd.to.walk.shift.to'); },
  get drag() { return t('menu.esc.to.pause.drag.to.look'); },
  get plan() { return t('menu.right.drag.to.pan.scroll.to.zoom.esc'); },
};

const SITE = 'ui.neretva.vallis.jezero.crater.mars';

const DEBUG_EVENTS =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1');

// Escape is a key press, not a user activation, so it cannot grant pointer lock. In the Walk pause menu it
// must explain that instead of starting a request that can only fail.
const ESC_LOCK_NOTICE = 'menu.press.enter.or.click.resume.to.capture.the';

const INITIAL_LOAD = {
  status: 'loading',
  stage: 'ui.starting.the.engine',
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
  useLanguage();
  const mode = useMissionStore((s) => s.mode);
  // The EVA runner freezes this once the astronaut re-enters the habitat. Non-null means the EVA is over:
  // the debrief owns the screen and no menu behind it can resume the mission.
  const evaSummary = useMissionStore((s) => s.eva.summary);
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
  // #197: a refused capture offers drag-to-look. `lockFailed` shows that offer after one failed attempt;
  // `freeLook` records the player's choice and stays on for the session, so later resumes, restarts and
  // Plan-to-Walk switches never ask the browser again for a lock it already refused.
  const [lockFailed, setLockFailed] = useState(false);
  const [freeLook, setFreeLookState] = useState(false);
  const freeLookRef = useRef(false);
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
    setLockFailed(false);
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
    pauseFor(PAUSE_VIEW.MENU, 'menu.the.mouse.was.released.so.the.eva.is');
  }, [pauseFor]);

  /**
   * Start or Resume. In Walk nothing runs until the browser grants the lock, unless the player chose
   * drag-to-look; Plan needs no lock.
   */
  const handleResume = useCallback(async () => {
    const instance = engineRef.current;
    // The EVA is final once the summary exists: no key, mode change or stale request may resume it behind the debrief.
    if (!instance || busyRef.current || useMissionStore.getState().eva?.summary) return;
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
    try {
      const result = await resumeEva({ engine: instance, mode: resumeMode, isCurrent, capture: !freeLookRef.current });
      // A superseded attempt stays paused and silent: the action that ended it owns the menu and its message.
      if (result.stale) return;
      if (!result.ok) {
        if (result.lockFailed) setLockFailed(true);
        setNotice(result.message);
        return;
      }
      setLockFailed(false);
      setOverlay(null);
      setPhase(EVA_PHASE.PLAYING);
      setNotice(null);
    } catch (cause) {
      // Resume must never stay disabled: the menu is the only way back into the EVA.
      setNotice((cause && cause.message) || 'The EVA could not be resumed.');
    } finally {
      setBusyState(false);
    }
  }, [setBusyState, setOverlay, setPhase]);

  /** The fallback button: switch to drag-to-look for the rest of the session and resume now. */
  const handleResumeWithoutCapture = useCallback(() => {
    if (busyRef.current) return;
    freeLookRef.current = true;
    setFreeLookState(true);
    handleResume();
  }, [handleResume]);

  const handleModeChange = useCallback(async (next) => {
    if (busyRef.current) return;
    if (next === useMissionStore.getState().mode) return;
    // Any mode change ends a pending resume; setMode also makes the engine cancel a pending Walk lock.
    resumeSeqRef.current += 1;
    const attempt = ++walkLockSeqRef.current;
    setMode(next);
    if (phaseRef.current === EVA_PHASE.PLAYING && next === 'walk' && !freeLookRef.current) {
      // The click itself is the user gesture. If the lock is refused, stay paused and explain.
      const instance = engineRef.current;
      const lock = await requestEvaLock(instance);
      // A newer action (mode change, pause, restart, the end of the EVA) owns the interface. If this late
      // answer still holds the mouse, release it instead of leaving the pointer captured behind that screen.
      if (attempt !== walkLockSeqRef.current) {
        if (lock.ok) {
          try { instance?.releasePointerLock?.(); } catch { /* the newer screen stays in charge */ }
        }
        return;
      }
      if (useMissionStore.getState().mode !== 'walk') {
        // A late grant must never capture the mouse in Plan. Releasing is harmless when nothing is held.
        try { instance?.releasePointerLock?.(); } catch { /* nothing to release */ }
        return;
      }
      if (phaseRef.current === EVA_PHASE.PLAYING && !lock.ok) {
        pauseFor(PAUSE_VIEW.MENU, lock.message);
        setLockFailed(true);
      }
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
      setQualityError((cause && cause.message) || 'menu.scene.quality.could.not.be.changed');
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
      result = { ok: false, message: (cause && cause.message) || 'menu.the.eva.could.not.be.restarted' };
    }
    setBusyState(false);
    setPhase(EVA_PHASE.START);
    setOverlay(null);
    setPlanEpoch((value) => value + 1);
    // A new EVA starts at the spawn: forget the walked progress of the old route. The tracker only resets on a
    // content change, so an empty path here is explicit rather than relying on the minimap remounting.
    minimapRoute.setPath(null);
    setNotice(result.ok ? null : result.message);
    setLockFailed(false);
    if (instance) setQuality(instance.getQuality());
  }, [minimapRoute, setBusyState, setOverlay, setPhase]);

  const handleRetry = useCallback(() => {
    resumeSeqRef.current += 1;
    walkLockSeqRef.current += 1;
    setLoadingDone(false);
    setPhase(EVA_PHASE.START);
    setOverlay(null);
    setNotice(null);
    setLockFailed(false);
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
    if (useMissionStore.getState().mode === 'walk' && !freeLookRef.current) {
      // Esc cannot grant pointer lock (a key press is not a user activation), so it must not start a
      // request that can only fail. Cancel any pending attempt, keep the real pause and point at Resume.
      resumeSeqRef.current += 1;
      try { engineRef.current?.releasePointerLock?.(); } catch { /* the pause is what matters */ }
      setBusyState(false);
      setNotice(ESC_LOCK_NOTICE);
      setMenuFocus((value) => value + 1);
      return;
    }
    // Plan and drag-to-look resume without a lock, so Esc can resume there.
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

  // The EVA runner pauses the mission clock at the instant the summary is frozen. Close the interactive EVA here as
  // well: disable engine input and release the pointer before a lock-change handler can open the pause menu, and
  // invalidate a resume or Walk lock that was still in flight so it cannot land behind the debrief.
  useEffect(() => useMissionStore.subscribe((state, previous) => {
    if (!state.eva.summary || state.eva.summary === previous.eva.summary) return;
    resumeSeqRef.current += 1;
    walkLockSeqRef.current += 1;
    // phaseRef changes synchronously, so a late pointerlockchange sees PAUSED and does not open the menu.
    setPhase(EVA_PHASE.PAUSED);
    setOverlay(null);
    setBusyState(false);
    pauseEva({ engine: engineRef.current });
  }), [setBusyState, setOverlay, setPhase]);

  const showTopbar = load.status === 'ready' && !evaSummary && phase === EVA_PHASE.PLAYING;
  // Like the topbar: off while loading, on the start screen and in the pause menu. M goes through the mode
  // button's handler, so it also captures the mouse in Walk (#174).
  useShortcuts(showTopbar, handleModeChange);

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
      {/* Plan mode places the banner in its own alert region; Walk puts it under the heading box, the HUD's only alert. */}
      {load.status === 'ready' && mode === 'walk' && <EventBanner className="event-banner-walk" />}
      {load.status === 'ready' && DEBUG_EVENTS && <EventDebug />}

      <header className="topbar" inert={showTopbar ? undefined : true}>
        <h1>{t('app.brandSpaced')}<span>{t('ui.cheyava.falls.neretva.vallis.jezero.crater')}</span>
        </h1>
        {showTopbar && mode === 'plan' && <MissionClock />}
        <ModeSwitch mode={mode} onChange={handleModeChange} />
      </header>

      <LoadingScreen key={`loading-${load.attempt}`} state={load} site={translateText(SITE)} onRetry={handleRetry} onGone={handleGone} />

      {load.status === 'ready' && mode === 'walk' && <Hud engine={engine} minimapRoute={minimapRoute} />}
      {load.status === 'ready' && <Finds engine={engine} mode={mode} />}

      {load.status === 'ready' && <WalkStopCard active={mode === 'walk'} />}

      {showTopbar && <p className="hint">{mode === 'walk' ? (freeLook ? HINTS.drag : HINTS.walk) : HINTS.plan}</p>}

      {load.status === 'ready' && !evaSummary && loadingDone && phase === EVA_PHASE.START && (
        <StartScreen
          mode={mode}
          busy={busy}
          notice={notice}
          freeLook={freeLook}
          lockFailed={lockFailed}
          onStart={handleResume}
          onStartWithoutCapture={handleResumeWithoutCapture}
        />
      )}

      {load.status === 'ready' && !evaSummary && phase === EVA_PHASE.PAUSED && overlay && (
        <PauseMenu
          view={overlay}
          mode={mode}
          busy={busy}
          notice={notice}
          freeLook={freeLook}
          lockFailed={lockFailed}
          focusToken={menuFocus}
          quality={quality}
          qualityBusy={qualityBusy}
          qualityError={qualityError || quality?.error || null}
          onResume={handleResume}
          onResumeWithoutCapture={handleResumeWithoutCapture}
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

      {load.status === 'ready' && evaSummary && (
        <DebriefScreen
          summary={evaSummary}
          busy={busy}
          notice={notice}
          onRestart={handleRestartConfirm}
          onSources={openSources}
        />
      )}

      {/* Last, so its native dialog is created after the debrief and its top layer sits above it. */}
      {load.status === 'ready' && <SourcesRoot />}
    </div>
  );
}
