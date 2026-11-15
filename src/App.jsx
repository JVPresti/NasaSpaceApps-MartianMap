import { t, translateText } from './i18n/index.js';
import { useLanguage } from './i18n/useLanguage.js';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import EngineView from './components/EngineView.jsx';
import GamepadHint from './components/GamepadHint.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import PauseMenu from './components/PauseMenu.jsx';
import StartScreen from './components/StartScreen.jsx';
import TouchStick from './components/TouchStick.jsx';
import { cycleLayer } from './components/shortcuts.js';
import { useShortcuts } from './components/useShortcuts.js';
import DebriefScreen from './debrief/DebriefScreen.jsx';
import EventBanner from './events/EventBanner.jsx';
import EventDebug from './events/EventDebug.jsx';
import Finds from './finds/Finds.jsx';
import Hud from './hud/Hud.jsx';
import AirlockCycle from './habitat/AirlockCycle.jsx';
import HabitatHud from './habitat/HabitatHud.jsx';
import PlanMode from './plan/PlanMode.jsx';
import SourcesRoot from './sources/SourcesScreen.jsx';
import { WalkStopCard } from './stops/ScienceStops.jsx';
import { createRouteProgress } from './hud/minimapRoute.js';
import { openSources } from './sources/sourcesStore.js';
import { pauseMission, resumeMission, setMode, useMissionStore } from './state/store.js';
import { EVA_PHASE, PAUSE_VIEW, pauseEva, requestEvaLock, restartEva, resumeEva } from './state/evaSession.js';
import { STAGE, beginEgress, beginIngress, completeEgress, completeIngress, runAirlockCycle } from './state/flow.js';
import './App.css';
import './components/menu.css';

const HINTS = {
  get walk() { return t('menu.esc.to.pause.wasd.to.walk.shift.to'); },
  get drag() { return t('menu.esc.to.pause.drag.to.look'); },
  get habitat() { return t('habitat.hint'); },
  get habitatDrag() { return t('habitat.hint.drag'); },
};

// A click opens the mission table only when it is a click, not the end of a drag-to-look (#216).
const CLICK_SLOP_PX = 6;

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
  // Where the astronaut is in the flow (src/state/flow.js): habitat, egress, eva, ingress or debrief. It replaces the
  // old evaBegun flag: the EVA has begun once the stage leaves 'habitat', and the table only opens in the habitat.
  const stage = useMissionStore((s) => s.stage);
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
    // Planning costs no mission time (#11): in the habitat, on foot or at the mission table, the clock waits for the
    // end of the airlock cycle after Begin EVA.
    const holdClock = useMissionStore.getState().stage !== STAGE.EVA;
    try {
      const result = await resumeEva({ engine: instance, mode: resumeMode, isCurrent, capture: !freeLookRef.current, holdClock });
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
      // Resuming in the middle of the airlock cycle: the cycle carries on, but nobody walks until the hatch opens.
      const now = useMissionStore.getState().stage;
      if (now === STAGE.EGRESS || now === STAGE.INGRESS) instance.setInputEnabled(false);
    } catch (cause) {
      // Resume must never stay disabled: the menu is the only way back into the EVA.
      setNotice((cause && cause.message) || 'menu.the.eva.could.not.be.resumed');
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

  const handleModeChange = useCallback(async (next, { capture = true } = {}) => {
    if (busyRef.current) return;
    if (next === useMissionStore.getState().mode) return;
    // Any mode change ends a pending resume; setMode also makes the engine cancel a pending Walk lock.
    resumeSeqRef.current += 1;
    const attempt = ++walkLockSeqRef.current;
    setMode(next);
    // A gamepad press is not a user gesture, so the browser can only refuse a lock request (#103). The pad
    // switch keeps drag-to-look, the same fallback as #197, instead of pausing behind a failed capture.
    if (!capture && next === 'walk' && !freeLookRef.current) {
      freeLookRef.current = true;
      setFreeLookState(true);
    }
    if (phaseRef.current === EVA_PHASE.PLAYING && next === 'walk' && capture && !freeLookRef.current) {
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
      if (phaseRef.current !== EVA_PHASE.PLAYING) return;
      if (!lock.ok) {
        pauseFor(PAUSE_VIEW.MENU, lock.message);
        setLockFailed(true);
      }
    }
  }, [pauseFor]);

  /** E or a click at the table in the habitat: open the mission table. The table needs no pointer lock. */
  const openTable = useCallback(() => {
    const state = useMissionStore.getState();
    if (busyRef.current || phaseRef.current !== EVA_PHASE.PLAYING) return;
    if (state.stage !== STAGE.HABITAT || state.mode !== 'walk' || !state.habitat?.nearTable) return;
    handleModeChange('plan');
  }, [handleModeChange]);

  /** "Back to the habitat" on the mission table: walk again by the table. The click captures the mouse. */
  const closeTable = useCallback((options) => {
    if (useMissionStore.getState().mode !== 'plan') return;
    handleModeChange('walk', options);
  }, [handleModeChange]);

  /**
   * Begin EVA on the mission table: the route is fixed and the astronaut goes out through the airlock. The click is
   * the user gesture for the pointer lock the surface needs, so it is asked for here; the cycle (effect below) moves
   * the player outside while the screen is dark and starts the EVA at its end. A refused capture waits behind the
   * pause menu, which offers drag-to-look (#197); the cycle stands still until Resume.
   */
  const handleBeginEva = useCallback(async () => {
    const instance = engineRef.current;
    if (!instance || busyRef.current || phaseRef.current !== EVA_PHASE.PLAYING) return;
    if (useMissionStore.getState().stage !== STAGE.HABITAT) return;
    resumeSeqRef.current += 1;
    const attempt = ++walkLockSeqRef.current;
    beginEgress();   // stage 'egress' and mode 'walk' in one write: the table closes as the cycle starts
    instance.setInputEnabled(false);   // nobody walks inside the airlock while it cycles
    if (freeLookRef.current) return;
    const lock = await requestEvaLock(instance);
    if (attempt !== walkLockSeqRef.current) {
      if (lock.ok) { try { instance.releasePointerLock?.(); } catch { /* the newer screen stays in charge */ } }
      return;
    }
    if (!lock.ok && phaseRef.current === EVA_PHASE.PLAYING) {
      pauseFor(PAUSE_VIEW.MENU, lock.message);
      setLockFailed(true);
    }
  }, [pauseFor]);

  // Gamepad buttons reach the same actions as the keyboard (#101, #103). The engine reports them only while
  // gameplay input is enabled, so a press behind the pause menu cannot act; the phase check is a second guard.
  const handleGamepadAction = useCallback((action) => {
    if (phaseRef.current !== EVA_PHASE.PLAYING || busyRef.current) return;
    if (action === 'mode') {
      // The pad's view button opens the mission table at the table and closes it again; outside it does nothing.
      if (useMissionStore.getState().mode === 'plan') closeTable({ capture: false });
      else openTable();
    } else if (action === 'layer-prev') cycleLayer(-1);
    else if (action === 'layer-next') cycleLayer(1);
  }, [closeTable, openTable]);

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

  /**
   * Restart the EVA and land in the habitat instead of on the start screen: at the mission table ('table': the pause
   * menu's "End the EVA" and the debrief's "Plan the next EVA") or on foot by the table ('habitat'). The click that
   * called this is the user gesture for the pointer lock walking needs; the table needs none.
   * @param {'table' | 'habitat'} target
   */
  const restartInto = useCallback((target) => {
    handleRestartConfirm();
    if (target === 'table') setMode('plan');
    handleResume();
  }, [handleRestartConfirm, handleResume]);

  // Controls opened from the mission table close back to the table; opened from the pause menu, back to the menu.
  // The ref serves the handlers; the state labels the dialog's close button.
  const controlsFromMenuRef = useRef(false);
  const [controlsFromMenu, setControlsFromMenuState] = useState(false);
  const setControlsFromMenu = useCallback((value) => { controlsFromMenuRef.current = value; setControlsFromMenuState(value); }, []);
  const openControls = useCallback((fromMenu) => {
    setControlsFromMenu(fromMenu);
    showOverlay(PAUSE_VIEW.CONTROLS);
  }, [setControlsFromMenu, showOverlay]);
  const closeControls = useCallback(() => {
    if (controlsFromMenuRef.current || useMissionStore.getState().mode !== 'plan') setOverlay(PAUSE_VIEW.MENU);
    else handleResume();
  }, [handleResume, setOverlay]);

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
          setControlsFromMenu(false);
          pauseFor(PAUSE_VIEW.CONTROLS);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pauseFor, setControlsFromMenu]);

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
    // Back at the airlock: cycle in, then the debrief (the cycle effect below).
    if (state.stage === STAGE.EVA) beginIngress();
  }), [setBusyState, setOverlay, setPhase]);

  // The airlock cycle, out after Begin EVA and in after the EVA ended. The player is moved while the screen is dark.
  // Going out, the cycle stands still behind the pause menu; at its end the EVA starts (the simulation starts its
  // runners on the 'eva' stage) and the new clock runs from 0:00. Coming in, nothing can pause it: the EVA is over.
  useEffect(() => {
    if (stage !== STAGE.EGRESS && stage !== STAGE.INGRESS) return undefined;
    const out = stage === STAGE.EGRESS;
    const cycle = runAirlockCycle({
      running: () => !out || phaseRef.current === EVA_PHASE.PLAYING,
      onDark: () => {
        const instance = engineRef.current;
        if (!instance) return;
        if (out) instance.exitAirlock(); else instance.enterHabitat();
        instance.setInputEnabled(false);
      },
      onDone: () => {
        if (!out) { completeIngress(); return; }
        completeEgress();
        if (phaseRef.current === EVA_PHASE.PLAYING) {
          engineRef.current?.setInputEnabled(true);
          resumeMission();
        }
      },
    });
    return () => cycle.stop();
  }, [stage]);

  // In the habitat, E or a click at the mission table opens it. Keys typed into a field or a dialog never do.
  useEffect(() => {
    let down = null;
    const onKey = (event) => {
      if (event.code !== 'KeyE' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target?.isContentEditable || target?.closest?.('input, textarea, select, dialog[open], [aria-modal="true"]')) return;
      openTable();
    };
    const onDown = (event) => { down = event.button === 0 && event.target?.tagName === 'CANVAS' ? { x: event.clientX, y: event.clientY } : null; };
    const onUp = (event) => {
      if (!down || event.button !== 0) return;
      const moved = Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y);
      down = null;
      // With the pointer locked the cursor does not move, so any click counts.
      if (moved <= CLICK_SLOP_PX) openTable();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [openTable]);

  const ready = load.status === 'ready';
  const playing = ready && !evaSummary && phase === EVA_PHASE.PLAYING;
  const onSurface = stage === STAGE.EVA;
  const inHabitat = stage === STAGE.HABITAT;
  // The surface top bar and the EVA HUD belong outside. In the habitat the suit is on standby: only the habitat HUD.
  const showTopbar = playing && onSurface;
  // Data layer keys (L, Shift+L, 0) work where a layer shows: on the surface and at the mission table.
  useShortcuts(playing && (onSurface || mode === 'plan'));

  return (
    <div className={load.status === 'ready' && phase === EVA_PHASE.START ? 'app at-start' : 'app'}>
      <EngineView
        key={`engine-${load.attempt}`}
        onStatus={handleStatus}
        onProgress={handleProgress}
        onReady={handleReady}
        onError={handleError}
        onLockChange={handleLockChange}
        onEngine={handleEngine}
        onGamepadAction={handleGamepadAction}
      />

      {ready && (
        <PlanMode
          key={`plan-${load.attempt}-${planEpoch}`}
          engine={engine}
          active={mode === 'plan' && inHabitat}
          onBeginEva={handleBeginEva}
          onClose={() => closeTable()}
          onControls={() => openControls(false)}
        />
      )}
      {/* Plan mode places the banner in its own alert region; Walk puts it under the heading box, the HUD's only alert. */}
      {ready && mode === 'walk' && onSurface && <EventBanner className="event-banner-walk" />}
      {ready && DEBUG_EVENTS && <EventDebug />}

      {/* The mission table has its own top bar and the habitat its own HUD; this one is for the surface. */}
      {mode === 'walk' && onSurface && (
        <header className="topbar" inert={showTopbar ? undefined : true}>
          <h1>{t('app.brandSpaced')}<span>{t('ui.cheyava.falls.neretva.vallis.jezero.crater')}</span>
          </h1>
        </header>
      )}

      <LoadingScreen key={`loading-${load.attempt}`} state={load} site={translateText(SITE)} onRetry={handleRetry} onGone={handleGone} />

      {ready && mode === 'walk' && onSurface && <Hud engine={engine} minimapRoute={minimapRoute} />}
      {ready && mode === 'walk' && inHabitat && !evaSummary && phase !== EVA_PHASE.START && <HabitatHud />}
      {/* Inputs appear only after they are used (#103): the stick on the first touch, the pad hint on the first press. */}
      {load.status === 'ready' && mode === 'walk' && !evaSummary && <TouchStick engine={engine} />}
      {load.status === 'ready' && mode === 'walk' && !evaSummary && <GamepadHint engine={engine} />}
      {ready && <Finds engine={engine} mode={onSurface ? mode : 'plan'} />}

      {ready && <WalkStopCard active={mode === 'walk' && onSurface} />}

      {playing && mode === 'walk' && (onSurface || inHabitat) && (
        <p className="hint">{onSurface ? (freeLook ? HINTS.drag : HINTS.walk) : (freeLook ? HINTS.habitatDrag : HINTS.habitat)}</p>
      )}

      {ready && (stage === STAGE.EGRESS || stage === STAGE.INGRESS) && (
        <AirlockCycle direction={stage === STAGE.EGRESS ? 'out' : 'in'} running={stage === STAGE.INGRESS || phase === EVA_PHASE.PLAYING} />
      )}

      {load.status === 'ready' && !evaSummary && loadingDone && phase === EVA_PHASE.START && (
        <StartScreen
          busy={busy}
          notice={notice}
          freeLook={freeLook}
          lockFailed={lockFailed}
          // Start puts the astronaut on foot in the habitat, next to the mission table; the click captures the mouse.
          onStart={handleResume}
          onStartWithoutCapture={handleResumeWithoutCapture}
          onSources={openSources}
        />
      )}

      {load.status === 'ready' && !evaSummary && phase === EVA_PHASE.PAUSED && overlay && (
        <PauseMenu
          view={overlay}
          mode={mode}
          evaBegun={onSurface}
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
          controlsToMenu={controlsFromMenu || mode !== 'plan'}
          onControls={() => openControls(true)}
          onControlsClose={closeControls}
          onSources={openSources}
          onMenu={() => setOverlay(PAUSE_VIEW.MENU)}
          onQuality={handleQuality}
          onEndRequest={() => showOverlay(PAUSE_VIEW.END)}
          onEndConfirm={() => restartInto('table')}
          onCancel={handlePauseCancel}
        />
      )}

      {ready && evaSummary && stage === STAGE.DEBRIEF && (
        <DebriefScreen
          summary={evaSummary}
          busy={busy}
          notice={notice}
          onPlanNext={() => restartInto('table')}
          onBackToHabitat={() => restartInto('habitat')}
          onSources={openSources}
        />
      )}

      {/* Last, so its native dialog is created after the debrief and its top layer sits above it. */}
      {load.status === 'ready' && <SourcesRoot />}
    </div>
  );
}
