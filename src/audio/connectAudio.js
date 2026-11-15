// Connects the suit audio (#72) to the mission store, the engine and the page.
//   - The audio starts on the first click, tap or key press anywhere on the page (browsers block sound before one).
//   - Alerts that start or get worse play their tone, then a habitat radio call. The partner link dropping or coming
//     back plays radio static or a click.
//   - UPDATE_MS: suit levels follow the store (effort, wind, storm, dose rate) and the engine (footsteps from the distance
//     walked, the habitat zone for the cabin sound), from engine.getPlayer. Never per frame.
//   - Mute and volume come from settings.js; the tab being hidden suspends the audio.
import { useMissionStore } from '../state/store.js';
import { dustLevelFromTau } from '../state/dustLevel.js';
import { createAudioEngine } from './audioEngine.js';
import { newAlerts, radioCue, shelterOf, stepsFor, suitAudible } from './audioRules.js';
import { getAudioSettings, subscribeAudioSettings } from './settings.js';

export const UPDATE_MS = 50;
/** The events that can carry a user activation for audio: a key, a click, and a finger lifting on a phone. */
export const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
const CALL_AFTER_ALERT_S = 0.9;   // the habitat call follows the suit's own alert tone

/**
 * @param {{ getPlayer: () => { x: number, z: number, habitatZone?: string | null } }} engine
 * @returns {() => void} disconnect
 */
export function connectAudio(engine, store = useMissionStore, { win = globalThis.window, doc = globalThis.document, audio = createAudioEngine() } = {}) {
  audio.setSettings(getAudioSettings());
  const unsubscribeSettings = subscribeAudioSettings((s) => audio.setSettings(s));

  // A phone only unlocks audio when a finger lifts (pointerup, touchend), not when it goes down (#365), so the page
  // listens to both and stops once the context runs. A muted player keeps it suspended; the listeners then go too.
  const start = () => {
    audio.start();
    audio.setSettings(getAudioSettings());
    if (audio.running || getAudioSettings().muted) unlisten();
  };
  const unlisten = () => { for (const type of GESTURES) win.removeEventListener(type, start, true); };
  for (const type of GESTURES) win.addEventListener(type, start, true);

  const onVisibility = () => audio.setHidden(doc.visibilityState === 'hidden');
  doc.addEventListener('visibilitychange', onVisibility);

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.alerts !== prev.alerts) {
      const fresh = newAlerts(prev.alerts, s.alerts);
      if (fresh.length) { audio.alert(fresh[0].level); audio.radio('call', CALL_AFTER_ALERT_S); }
    }
    if (s.crew !== prev.crew) {
      const cue = radioCue(prev.crew, s.crew);
      if (cue) audio.radio(cue);
    }
  });

  let last = null, carried = 0;
  const timer = setInterval(() => {
    if (!audio.running) return;
    const s = store.getState(), audible = suitAudible(s), p = engine.getPlayer(), env = s.environment;
    audio.update({
      effort: s.suit.effort, storm: dustLevelFromTau(env.dustOpacity), windMs: env.windMs, doseRateUgyH: env.doseRateUgyH,
      shelter: shelterOf(p.habitatZone), audible,
    });
    if (last && audible) {
      const r = stepsFor(carried, Math.hypot(p.x - last.x, p.z - last.z));
      carried = r.carried;
      if (r.steps > 0) audio.step();   // at most one per tick: a long tick does not stack steps on top of each other
    }
    last = { x: p.x, z: p.z };
  }, UPDATE_MS);

  return () => {
    clearInterval(timer); unsubscribe(); unsubscribeSettings();
    unlisten();
    doc.removeEventListener('visibilitychange', onVisibility);
    audio.dispose();
  };
}
