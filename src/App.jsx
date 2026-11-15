import { t, translateText } from './i18n/index.js';
import PresentGate from './present/PresentGate.jsx';   // ?present=1, the pitch inside the app (#291)
import { useLanguage } from './i18n/useLanguage.js';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import EngineView from './components/EngineView.jsx';
import GamepadHint from './components/GamepadHint.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import PauseMenu from './components/PauseMenu.jsx';
import StartScreen from './components/StartScreen.jsx';
import TouchStick from './components/TouchStick.jsx';
import VisorFrame from './components/VisorFrame.jsx';
import { cycleLayer } from './components/shortcuts.js';
import { modeSwitchAllowed } from './components/modeGuard.js';
import { useShortcuts } from './components/useShortcuts.js';
import DebriefScreen from './debrief/DebriefScreen.jsx';
import EventBanner from './events/EventBanner.jsx';
import EventDebug from './events/EventDebug.jsx';
import { StopBanner, WalkBeat } from './mission/MissionBeat.jsx';
import { chooseMission } from './mission/chooseMission.js';
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
import { FIRST_OBJECTIVE, FULL_OBJECTIVE } from './sim/missions.js';
import { EVA_PHASE, PAUSE_VIEW, pauseEva, requestEvaLock, restartEva, resumeEva } from './state/evaSession.js';
import { continueEva } from './state/eva.js';
import { STAGE, beginEgress, canSwitchMode, completeEgress, continueFromDebrief, runAirlockCycle, showDebrief } from './state/flow.js';
import { preloadAppAssets } from './preload.js';
import './App.css';
import './components/menu.css';

// The wrist screen keeps a key strip while it is up (#231); the walk keys show once, on the card at the start of the EVA.
const WRIST_HINT = 'menu.hint.wrist';

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
  const [wristOpen, setWristOpen] = useState(false);
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
  // Planning costs no mission time (#11): the clock, suit and events wait in the habitat until the airlock cycle after
  // Begin EVA ends. After that the clock also runs at the table, because the EVA is under way.
  // Where the astronaut is in the flow (src/state/flow.js): habitat, egress, eva or debrief (habitat-first flow, #260).
  // The EVA has begun once the stage leaves 'habitat': Begin EVA starts the airlock cycle, and the cycle's end starts
  // the EVA. evaBegun is read from the stage, so the table, the beats and the pause menu all follow the same value.
  const stage = useMissionStore((s) => s.stage);
  const evaBegun = stage !== STAGE.HABITAT;
  const evaBegunRef = useMemo(() => ({ get current() { return useMissionStore.getState().stage !== STAGE.HABITAT; } }), []);

  const engineRef = useRef(null);
  const runtimeRef = useRef(null);
  const preloadStartedRef = useRef(false);

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
    // The open menu says it all; a refused capture or another failure still explains itself here.
    pauseFor(PAUSE_VIEW.MENU);
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
    // Planning costs no mission time (#11): in the habitat and during the airlock cycle the clock waits for the end of
    // the cycle after Begin EVA, which starts the new EVA clock (src/state/flow.js).
    const holdClock = useMissionStore.getState().stage !== STAGE.EVA;
    try {
      const result = await resumeEva({ engine: instance, mode: resumeMode, isCurrent, capture: !freeLookRef.current, holdClock });
      // A superseded attempt stays paused and silent: the action that ended it owns the menu and its message.
      if (result.stale) return;
      if (!result.ok) {
        if (result.lockFailed) setLockFailed(true);
        // The start view has no room for the explanation or the drag-to-look fallback: the menu has both.
        if (overlayRef.current === PAUSE_VIEW.KEYS) setOverlay(PAUSE_VIEW.MENU);
        setNotice(result.message);
        return;
      }
      setLockFailed(false);
      setOverlay(null);
      setPhase(EVA_PHASE.PLAYING);
      setNotice(null);
      // Resuming in the middle of the airlock cycle: the cycle carries on, but nobody walks until the hatch opens.
      if (useMissionStore.getState().stage === STAGE.EGRESS) instance.setInputEnabled(false);
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
    // The airlock cycle owns the screen (#260): M, the pad's Start and the menus change nothing until the hatch opens.
    if (!canSwitchMode(useMissionStore.getState())) return;
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
        return;
      }
    }
  }, [pauseFor]);

  /**
   * Begin EVA on the mission table's Suit tab. The first time (habitat-first flow, #260), it closes the table and starts
   * the airlock cycle (beginEgress), which waits behind the key reminder (PAUSE_VIEW.KEYS) with the clock still held.
   * Its Start walking button is the click that captures the mouse (handleResume); the cycle (effect below) moves the
   * player outside while the screen is dark, and its end starts the EVA clock. Once the EVA is under way, Continue the
   * EVA goes straight back to the walk.
   */
  const handleBeginEva = useCallback(() => {
    if (busyRef.current) return;
    if (evaBegunRef.current || phaseRef.current !== EVA_PHASE.PLAYING) {
      handleModeChange('walk');
      return;
    }
    resumeSeqRef.current += 1;
    walkLockSeqRef.current += 1;
    beginEgress();
    pauseFor(PAUSE_VIEW.KEYS);
  }, [evaBegunRef, handleModeChange, pauseFor]);

  // Gamepad buttons reach the same actions as the keyboard (#101, #103). The engine reports them only while
  // gameplay input is enabled, so a press behind the pause menu cannot act; the phase check is a second guard.
  const handleGamepadAction = useCallback((action) => {
    if (phaseRef.current !== EVA_PHASE.PLAYING || busyRef.current) return;
    if (action === 'mode') {
      const next = useMissionStore.getState().mode === 'walk' ? 'plan' : 'walk';
      // As M: before Begin EVA, Start only opens the table (#282, modeGuard.js). Back to the habitat closes it (#260).
      if (!modeSwitchAllowed(next, evaBegunRef.current)) return;
      handleModeChange(next, { capture: false });
    } else if (action === 'layer-prev') cycleLayer(-1);
    else if (action === 'layer-next') cycleLayer(1);
  }, [evaBegunRef, handleModeChange]);

  // The habitat table's Open plan (src/state/tableActions.js: E or gamepad A in the cabin) opens the mission table on its
  // Route step; M, Start and the menus still open it on the default step. False when it cannot open now.
  const [planTab, setPlanTab] = useState(undefined);
  useEffect(() => useMissionStore.subscribe((s, prev) => { if (prev.mode === 'plan' && s.mode !== 'plan') setPlanTab(undefined); }), []);
  const handleOpenPlan = useCallback(() => {
    if (phaseRef.current !== EVA_PHASE.PLAYING || busyRef.current || useMissionStore.getState().mode !== 'walk') return false;
    setPlanTab('route');
    handleModeChange('plan');
    return true;
  }, [handleModeChange]);

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

  /** Pause menu (End EVA, Restart EVA) and debrief (Restart): a new EVA at the mission table (#244). A restart (new
   *  clock, full suit) that skips the start screen, whose video is only for opening the app; the table needs no
   *  pointer lock, so it opens at once. */
  const handleEndConfirm = useCallback(() => {
    handleRestartConfirm();
    setMode('plan');
    handleResume();
  }, [handleRestartConfirm, handleResume]);

  /** Debrief: back to the EVA (#244). The summary goes, the statistics keep counting, and the walk resumes. */
  const handleContinue = useCallback(() => {
    if (busyRef.current || !continueEva(useMissionStore)) return;
    continueFromDebrief();   // back on the surface: the stage follows the EVA runner
    handleResume();
  }, [handleResume]);

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
    if (state.stage === STAGE.EVA) showDebrief();
  }), [setBusyState, setOverlay, setPhase]);

  // The airlock cycle after Begin EVA (#260). It stands still behind the key reminder and the pause menu, moves the
  // player outside while the screen is dark, and at its end starts the EVA (the simulation starts its runners on the
  // 'eva' stage) with the new clock running from 0:00.
  useEffect(() => {
    if (stage !== STAGE.EGRESS) return undefined;
    const cycle = runAirlockCycle({
      running: () => phaseRef.current === EVA_PHASE.PLAYING,
      onDark: () => {
        const instance = engineRef.current;
        if (!instance) return;
        instance.exitAirlock();
        instance.setInputEnabled(false);
      },
      onDone: () => {
        completeEgress();
        if (phaseRef.current === EVA_PHASE.PLAYING) {
          engineRef.current?.setInputEnabled(true);
          resumeMission();
        }
      },
    });
    return () => cycle.stop();
  }, [stage]);

  // The wrist key strip follows the wrist screen (#231): it shows only while the wrist screen is up.
  useEffect(() => {
    if (!engine || typeof engine.subscribeWrist !== 'function') return undefined;
    return engine.subscribeWrist((state) => setWristOpen(state?.open === true));
  }, [engine]);

  // The start screen is the first screen (#266): while it is open, fetch the hazard art, visor art, every font face
  // and the science stop photos that would otherwise wait for the table, the cards or the EVA. Once per page, even
  // with StrictMode's double mount; a failure is silent because each screen still reports its own.
  useEffect(() => {
    if (preloadStartedRef.current) return;
    preloadStartedRef.current = true;
    preloadAppAssets();
  }, []);

  const playing = load.status === 'ready' && !evaSummary && phase === EVA_PHASE.PLAYING;
  // Only while playing: off while loading, on the start screen and in the pause menu. M goes through the mode handler,
  // so it also captures the mouse in Walk (#174). Before Begin EVA, M only opens the table (#282, modeGuard.js), and
  // the table's Back to the habitat button is the way back to walking indoors (#260). handleModeChange also refuses every
  // switch during the airlock cycle.
  const handleShortcutMode = useCallback((next) => {
    if (!modeSwitchAllowed(next, evaBegunRef.current)) return;
    handleModeChange(next);
  }, [evaBegunRef, handleModeChange]);
  useShortcuts(playing, handleShortcutMode);

  // The start screen puts the astronaut on foot in the habitat, on the mission the player chose (#265, #260): the main
  // action starts the first sortie, the secondary button the full EVA. The objective defines the mission and stays
  // editable at the table until Begin EVA. Walking needs the mouse, so the click asks for it; a refusal offers
  // drag-to-look on the start screen. Both actions are disabled until the scene is ready; this guard keeps a stale
  // click harmless.
  const startMission = (objective) => {
    if (load.status !== 'ready') return;
    chooseMission(objective);
    handleResume();
  };

  // The start screen is up from the first frame: the scene loads behind it, and the screen also owns the failure
  // panel. The class hides the top bar and the table behind it, as it did once the scene was ready.
  const atStart = phase === EVA_PHASE.START && !evaSummary && load.status !== 'error';

  return (
    <div className={atStart ? 'app at-start' : 'app'}>
      <EngineView
        key={`engine-${load.attempt}`}
        onStatus={handleStatus}
        onProgress={handleProgress}
        onReady={handleReady}
        onError={handleError}
        onLockChange={handleLockChange}
        onEngine={handleEngine}
        onGamepadAction={handleGamepadAction}
        onOpenPlan={handleOpenPlan}
      />

      {/* Helmet bezel and alert ring (#28): over the 3D view, under every interface layer, so HUD text stays on top. */}
      {load.status === 'ready' && mode === 'walk' && stage === STAGE.EVA && <VisorFrame />}

      {load.status === 'ready' && (
        <PlanMode
          key={`plan-${load.attempt}-${planEpoch}`}
          engine={engine}
          active={mode === 'plan' && stage !== STAGE.EGRESS}
          evaBegun={evaBegun}
          onBeginEva={handleBeginEva}
          onClose={evaBegun ? undefined : () => handleModeChange('walk')}
          onControls={() => openControls(false)}
          // During the EVA the table opens on its Route step, where an event's re-plan to the habitat shows on the map
          // (#265: the storm and radiation beats say "M: open plan"); before Begin EVA it starts at the Site step.
          initialTab={planTab ?? (evaBegun ? 'route' : undefined)}
        />
      )}
      {/* Plan mode places the banner in its own alert region; Walk puts it under the heading box, the HUD's only alert. */}
      {load.status === 'ready' && mode === 'walk' && stage === STAGE.EVA && <EventBanner className="event-banner-walk" />}
      {/* The first mission's science stop (D10): why it is worth the walk, in the banner's place before any alert. */}
      {playing && mode === 'walk' && <StopBanner evaBegun={evaBegun} />}
      {load.status === 'ready' && DEBUG_EVENTS && <EventDebug />}

      <LoadingScreen key={`loading-${load.attempt}`} state={load} site={translateText(SITE)} onRetry={handleRetry} />

      {/* The suit HUD belongs to the EVA; inside the habitat before it, only where you are and the local time (#260). */}
      {load.status === 'ready' && mode === 'walk' && stage === STAGE.EVA && <Hud engine={engine} minimapRoute={minimapRoute} />}
      {load.status === 'ready' && mode === 'walk' && stage === STAGE.HABITAT && !evaSummary && phase !== EVA_PHASE.START && <HabitatHud />}
      {/* Inputs appear only after they are used (#103): the stick on the first touch, the pad hint on the first press. */}
      {load.status === 'ready' && mode === 'walk' && !evaSummary && <TouchStick engine={engine} />}
      {load.status === 'ready' && mode === 'walk' && !evaSummary && <GamepadHint engine={engine} />}
      {load.status === 'ready' && <Finds engine={engine} mode={mode} />}

      {load.status === 'ready' && <WalkStopCard active={mode === 'walk' && stage === STAGE.EVA} />}

      {load.status === 'ready' && stage === STAGE.EGRESS && <AirlockCycle running={phase === EVA_PHASE.PLAYING} />}

      {playing && mode === 'walk' && wristOpen && <p className="hint">{t(WRIST_HINT)}</p>}
      {/* The first mission's beat line (#265) takes the key strip's place while the wrist screen is down. */}
      {playing && mode === 'walk' && !wristOpen && <WalkBeat evaBegun={evaBegun} />}

      {atStart && (
        <StartScreen
          busy={busy}
          notice={notice}
          freeLook={freeLook}
          scene={load}
          lockFailed={lockFailed}
          onStart={() => startMission(FIRST_OBJECTIVE)}
          onStartWithoutCapture={handleResumeWithoutCapture}
          onFullEva={() => startMission(FULL_OBJECTIVE)}
          onSources={openSources}
        />
      )}

      {load.status === 'ready' && !evaSummary && phase === EVA_PHASE.PAUSED && overlay && (
        <PauseMenu
          view={overlay}
          mode={mode}
          evaBegun={evaBegun}
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
          onRestartConfirm={handleEndConfirm}
          controlsToMenu={controlsFromMenu || mode !== 'plan'}
          onControls={() => openControls(true)}
          onSettings={() => setOverlay(PAUSE_VIEW.SETTINGS)}
          onControlsClose={closeControls}
          onSources={openSources}
          onMenu={() => setOverlay(PAUSE_VIEW.MENU)}
          onQuality={handleQuality}
          onEndRequest={() => showOverlay(PAUSE_VIEW.END)}
          onEndConfirm={handleEndConfirm}
          onCancel={handlePauseCancel}
        />
      )}

      {load.status === 'ready' && evaSummary && stage === STAGE.DEBRIEF && (
        <DebriefScreen
          summary={evaSummary}
          busy={busy}
          notice={notice}
          onContinue={handleContinue}
          onRestart={handleEndConfirm}
          onSources={openSources}
        />
      )}

      {/* Last, so its native dialog is created after the debrief and its top layer sits above it. Mounted from the
          first frame (#266): Sources is usable on the start screen while the scene still loads. */}
      <SourcesRoot />
      <PresentGate engine={engine} />
    </div>
  );
}
