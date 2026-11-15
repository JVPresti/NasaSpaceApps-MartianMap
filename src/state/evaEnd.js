// Ending the EVA at the habitat (#244). Coming back into the habitat never ends the EVA by itself: while the astronaut
// is at the habitat during the EVA (eva.atHabitat, written by eva.js), a prompt floats over the cabin's planning table
// (engine.setHabitatPrompt, src/engine/habitatPrompt.js) and END_EVA_KEY ends it, which opens the debrief.
import { subscribeLanguage, t } from '../i18n/index.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';
import { requestEvaEnd } from './eva.js';
import { useMissionStore } from './store.js';

export const END_EVA_KEY = 'X';
const END_EVA_CODE = 'KeyX';

/** Whether the end prompt applies now: during the EVA, back at the habitat, walking with the mission running. */
export function canEndEva(state) {
  return !!state && state.mode === 'walk' && !state.mission?.paused && state.eva?.phase === 'active' && state.eva.atHabitat === true;
}

const typing = (e) => {
  const el = e.target;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

/**
 * @param {{ setHabitatPrompt: (p: { key: string, text: string } | null) => void }} engine
 * @returns {() => void} disconnect
 */
export function connectEvaEnd(engine, store = useMissionStore, target = globalThis.window) {
  let shown = null;
  const show = (force = false) => {
    const on = canEndEva(store.getState());
    if (on === shown && !force) return;
    shown = on;
    engine.setHabitatPrompt(on ? { key: END_EVA_KEY, text: t('eva.end.prompt') } : null);
  };
  show(true);
  const unsubscribe = store.subscribe(() => show());
  const unsubscribeLanguage = subscribeLanguage(() => show(true));

  const onKey = (e) => {
    if (e.code !== END_EVA_CODE || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e) || wristOwnsKeys()) return;   // the wrist owns the keyboard while up (#231)
    if (canEndEva(store.getState()) && requestEvaEnd(store)) e.preventDefault();
  };
  target.addEventListener('keydown', onKey);

  return () => { unsubscribe(); unsubscribeLanguage(); target.removeEventListener('keydown', onKey); engine.setHabitatPrompt(null); };
}
