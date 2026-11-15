// The habitat table's two actions (#244). In the cabin (the habitat's 'main' or 'inner' walk zone, where the engine draws
// the prompt: engine.inHabitatCabin), a prompt floats over the planning table with one row per action
// (engine.setHabitatPrompt, src/engine/habitatPrompt.js):
//   [E] Open plan    opens the mission table on its Route step (onOpenPlan; the app passes initialTab 'route'). It reads
//                    "Make a plan" while there is no route yet (route.path null) and opens the same table.
//   [X] Finish EVA   ends the EVA, which opens the debrief (requestEvaEnd, src/state/eva.js). Coming back never ends it
//                    by itself. Dimmed, reading "No EVA in progress", while no EVA runs (eva.phase is not 'active'); X then
//                    does nothing.
// The pause menu's "End the EVA" is another action (it discards the EVA) and keeps its words.
// The keys act only in the cabin, never on the steps, porch, airlock or the 5 m circle outside, where no prompt is drawn.
// Like the other walk keys they ignore repeats, Ctrl/Alt/Meta, text fields and the wrist screen while it is up (#231); a
// paused mission or Plan shows no prompt and takes no key. E belongs to the sample while the scoop is busy (sampling.js
// stows on E), so Open plan is dimmed and waits until then. The gamepad's A and X (gamepadInput.js) do the same as E and X.
import { subscribeLanguage, t } from '../i18n/index.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';
import { requestEvaEnd } from './eva.js';
import { STAGE } from './flow.js';
import { useMissionStore } from './store.js';
import { codeOf, keyForCode } from '../input/actions.js';

export const OPEN_PLAN_KEY = keyForCode(codeOf('open-plan')).toUpperCase();
export const END_EVA_KEY = keyForCode(codeOf('end-eva')).toUpperCase();
const CODES = { [codeOf('open-plan')]: 'open-plan', [codeOf('end-eva')]: 'end-eva' };
/** The gamepad actions (gamepadInput.js) that belong to the table; they never reach the app's own gamepad handler. */
export const TABLE_PAD_ACTIONS = Object.freeze(['open-plan', 'end-eva']);

// In the habitat before the EVA the mission clock is held (mission.paused with mission.held) while the astronaut walks
// (#260), so that counts as walking. A pause menu clears `held`, so the prompt goes and the keys do nothing behind it.
// The airlock cycle also holds the clock, and it owns the screen, so a held clock counts as walking only in the habitat.
const walking = (state) => !!state && state.mode === 'walk'
  && (!state.mission?.paused || (state.mission?.held === true && state.stage === STAGE.HABITAT));

/**
 * The player walks in the habitat's cabin (engine.inHabitatCabin): where the table prompt shows and its keys act. There
 * the walk's centred HUD items (the find card, the next-waypoint panel and marker) give way to the prompt, so nothing
 * covers it or points the crew back outside (src/hud/useInCabin.js). False without an engine or the engine call.
 */
export const inCabin = (engine) => !!engine && typeof engine.inHabitatCabin === 'function' && engine.inHabitatCabin() === true;

/** Whether the end prompt applies now: during the EVA, back at the habitat, walking with the mission running. */
export function canEndEva(state) {
  return walking(state) && state.eva?.phase === 'active' && state.eva.atHabitat === true;
}

/** A route exists (route.path); without one the first row reads "Make a plan". */
export const hasPlan = (state) => Array.isArray(state?.route?.path) && state.route.path.length > 0;

/** Whether Open plan applies now: walking with the mission running, and E is not the sample's (an idle scoop). */
export function canOpenPlan(state) {
  const sampling = state?.sampling?.status;
  return walking(state) && (!sampling || !sampling.phase || sampling.phase === 'idle');
}

/**
 * What the prompt over the table says now, or null while it has nothing to offer (Plan, or a paused mission). The engine
 * draws it only while the player is in the cabin.
 * @returns {{ rows: { key: string, text: string, dim: boolean }[] } | null}
 */
export function tablePrompt(state) {
  if (!walking(state)) return null;
  return {
    rows: [
      { key: OPEN_PLAN_KEY, text: t(hasPlan(state) ? 'tableprompt.open.plan' : 'tableprompt.make.plan'), dim: !canOpenPlan(state) },
      { key: END_EVA_KEY, text: t(state.eva?.phase === 'active' ? 'tableprompt.finish.eva' : 'tableprompt.no.eva'), dim: !canEndEva(state) },
    ],
  };
}

const typing = (e) => {
  const el = e.target;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

/**
 * @param {{ setHabitatPrompt: (p: object | null) => void, inHabitatCabin?: () => boolean }} engine
 * @param {{ onOpenPlan?: () => (boolean | void), store?: typeof useMissionStore, target?: EventTarget }} [options]
 *   onOpenPlan: opens the mission table on its Route step; false when the app could not (busy, or not playing)
 * @returns {{ disconnect: () => void, padAction: (action: string) => boolean }} padAction: true when the gamepad action
 *   belongs to the table (whether or not it applied), so the caller does not pass it on
 */
export function connectTableActions(engine, { onOpenPlan = () => false, store = useMissionStore, target = globalThis.window } = {}) {
  let shown = '';
  const show = (force = false) => {
    const prompt = tablePrompt(store.getState()), key = JSON.stringify(prompt);
    if (key === shown && !force) return;
    shown = key;
    engine.setHabitatPrompt(prompt);
  };
  show(true);
  const unsubscribe = store.subscribe(() => show());
  const unsubscribeLanguage = subscribeLanguage(() => show(true));

  /** @returns {boolean} the action ran */
  function act(action) {
    if (!inCabin(engine) || wristOwnsKeys()) return false;   // the wrist owns the keyboard while up (#231)
    const state = store.getState();
    if (action === 'open-plan') return canOpenPlan(state) && onOpenPlan() !== false;
    if (action === 'end-eva') return canEndEva(state) && requestEvaEnd(store);
    return false;
  }

  const onKey = (e) => {
    const action = CODES[e.code];
    if (!action || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    if (act(action)) e.preventDefault();
  };
  target.addEventListener('keydown', onKey);

  return {
    disconnect() { unsubscribe(); unsubscribeLanguage(); target.removeEventListener('keydown', onKey); engine.setHabitatPrompt(null); },
    padAction(action) {
      if (!TABLE_PAD_ACTIONS.includes(action)) return false;
      act(action);
      return true;
    },
  };
}
