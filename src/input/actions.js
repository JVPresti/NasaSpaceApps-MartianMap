// Every player action Marswalk binds to a key, in one list (#365). Each entry names its key codes (KeyboardEvent.code,
// so the bindings do not depend on the keyboard layout) and how a touch player does the same thing. The key handlers
// read their codes from here, the touch action bar (src/components/TouchActions.jsx) draws a button for every entry
// whose touch kind is 'button', and actions.test.js fails when a key bound anywhere in src has no entry here, or when
// an entry has no touch control. Plain JavaScript: no DOM, no React, no three.js.

/**
 * How a touch player does an action:
 * - 'button': a button on the touch action bar sends the action's first key (or runs it directly, see `run`);
 * - 'stick': the on-screen stick (src/engine/touchInput.js);
 * - 'gesture': a finger drag or pinch on the scene or the map;
 * - 'dialog': a button inside the dialog that the key works in (the dialog draws it, e.g. the pause menu's Resume);
 * - 'browser': the browser or the system provides it (full screen, reload), nothing to draw.
 * @typedef {'button' | 'stick' | 'gesture' | 'dialog' | 'browser'} TouchKind
 */

/**
 * When a bar button shows. Read by touchBarActions().
 * - 'walk': walking, inside or outside;
 * - 'surface': walking on the surface after the airlock (the EVA);
 * - 'cabin': walking in the habitat cabin, where the table prompt shows;
 * - 'wrist': the wrist screen is up;
 * - 'find': a find card waits for an answer (it has its own buttons, so the bar does not repeat them);
 * - 'always': whenever the bar shows.
 * @typedef {'walk' | 'surface' | 'cabin' | 'wrist' | 'always'} ActionContext
 */

/**
 * @typedef {{
 *   id: string,
 *   codes: string[],
 *   keys?: string[],
 *   touch: TouchKind,
 *   when?: ActionContext,
 *   hold?: boolean,
 *   more?: boolean,
 *   label: string,
 *   note?: string,
 * }} Action
 * `keys` lists KeyboardEvent.key values for handlers that read the key instead of the code (Esc, H, the presentation).
 * `hold` sends keydown on press and keyup on release (Q is held for 2 s). `more` puts the button behind the bar's
 * More toggle instead of the always-visible row. `label` is an i18n key.
 */

/** @type {readonly Action[]} */
export const ACTIONS = Object.freeze([
  // Walk and look
  { id: 'walk', codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], touch: 'stick', label: 'touch.walk' },
  { id: 'jog', codes: ['ShiftLeft', 'ShiftRight'], touch: 'stick', label: 'touch.jog', note: 'push the stick past 85 %' },
  { id: 'look', codes: [], touch: 'gesture', label: 'touch.look', note: 'drag any other finger on the scene' },

  // Both views
  { id: 'pause', codes: ['Escape'], keys: ['Escape'], touch: 'button', when: 'always', label: 'touch.pause' },
  { id: 'mode', codes: ['KeyM'], touch: 'button', when: 'walk', label: 'touch.map' },
  { id: 'help', codes: ['KeyH'], keys: ['h', 'H'], touch: 'dialog', label: 'touch.help', note: 'Controls in the pause menu' },
  { id: 'layer-next', codes: ['KeyL'], touch: 'button', when: 'walk', more: true, label: 'touch.layer', note: 'Shift+L: the table has a button per layer' },
  { id: 'layer-off', codes: ['Digit0', 'Numpad0'], touch: 'button', when: 'walk', more: true, label: 'touch.layer.off' },

  // Habitat cabin (the table prompt, #244)
  { id: 'open-plan', codes: ['KeyE'], touch: 'button', when: 'cabin', label: 'touch.open.plan', note: 'E also stows a sample on the surface' },
  { id: 'end-eva', codes: ['KeyX'], touch: 'button', when: 'cabin', label: 'touch.end.eva' },

  // Surface: sampling (#36) and the EVA's tools
  { id: 'sample', codes: [], touch: 'button', when: 'surface', label: 'touch.sample', note: 'mouse click; a tap on the scene works too' },
  { id: 'photo', codes: ['KeyP'], touch: 'button', when: 'surface', label: 'touch.photo' },
  { id: 'stow', codes: ['KeyE'], touch: 'button', when: 'surface', label: 'touch.stow' },
  { id: 'case', codes: ['KeyF'], touch: 'button', when: 'surface', label: 'touch.case' },
  { id: 'find', codes: ['KeyQ'], touch: 'button', when: 'surface', hold: true, more: true, label: 'touch.find', note: 'hold 2 s while pointing at the ground' },
  { id: 'find-accept', codes: ['KeyY'], touch: 'dialog', label: 'touch.find.accept', note: 'Add button on the find card' },
  { id: 'find-dismiss', codes: ['KeyN'], touch: 'dialog', label: 'touch.find.dismiss', note: 'Dismiss button on the find card' },
  { id: 'partner', codes: ['KeyT'], touch: 'button', when: 'surface', more: true, label: 'touch.partner' },
  { id: 'slope-grid', codes: ['KeyG'], touch: 'button', when: 'surface', more: true, label: 'touch.slope' },
  { id: 'visor-detail', codes: ['KeyI'], touch: 'button', when: 'surface', more: true, label: 'touch.detail' },
  { id: 'visor-frame', codes: ['KeyV'], touch: 'button', when: 'surface', more: true, label: 'touch.visor' },
  { id: 'sources', codes: ['KeyC'], touch: 'button', when: 'walk', more: true, label: 'touch.sources' },

  // Wrist screen (#231)
  { id: 'wrist', codes: ['KeyR'], touch: 'button', when: 'surface', label: 'touch.wrist' },
  { id: 'wrist-previous-page', codes: ['BracketLeft'], touch: 'button', when: 'wrist', label: 'touch.wrist.page.previous' },
  { id: 'wrist-next-page', codes: ['BracketRight'], touch: 'button', when: 'wrist', label: 'touch.wrist.page.next' },
  { id: 'wrist-previous-row', codes: ['KeyK'], touch: 'button', when: 'wrist', label: 'touch.wrist.row.previous' },
  { id: 'wrist-next-row', codes: ['KeyJ'], touch: 'button', when: 'wrist', label: 'touch.wrist.row.next' },
  { id: 'wrist-confirm', codes: ['Enter', 'NumpadEnter'], keys: ['Enter'], touch: 'button', when: 'wrist', label: 'touch.wrist.select' },

  // Dialogs and the presentation: the keys work inside a dialog that draws its own buttons
  { id: 'dialog-focus', codes: ['Tab'], keys: ['Tab'], touch: 'dialog', label: 'touch.dialog.focus', note: 'focus moves by tapping; Tab only wraps keyboard focus' },
  { id: 'present-next', codes: ['ArrowRight', 'PageDown', 'Space', 'Enter'], keys: ['ArrowRight', 'PageDown', ' ', 'Enter', 'Spacebar'], touch: 'dialog', label: 'touch.present.next', note: 'tap, swipe left or the Next button' },
  { id: 'present-back', codes: ['ArrowLeft', 'PageUp'], keys: ['ArrowLeft', 'PageUp'], touch: 'dialog', label: 'touch.present.back', note: 'swipe right or the Back button' },
  { id: 'present-language', codes: ['KeyL'], keys: ['l', 'L'], touch: 'dialog', label: 'touch.present.language', note: 'Language button' },
  { id: 'table-step', codes: ['ArrowLeft', 'ArrowRight'], keys: ['ArrowLeft', 'ArrowRight'], touch: 'dialog', label: 'touch.table.step', note: 'tap a step tab' },

  // Browser keys the app leaves alone
  { id: 'browser', codes: ['F5', 'F11', 'F12'], keys: ['F5', 'F11', 'F12'], touch: 'browser', label: 'touch.browser', note: 'reload, full screen and devtools belong to the browser; the pause menu has a Full screen button' },
]);

/** Bar action ids that follow a sampling input, and the input's name in the engine's sampling status. */
const SAMPLING_INPUT = { sample: 'click', photo: 'photo', stow: 'stow', case: 'case' };

const byId = new Map(ACTIONS.map((a) => [a.id, a]));

/** @param {string} id @returns {Action} */
export function action(id) {
  const a = byId.get(id);
  if (!a) throw new Error(`unknown action ${id}`);
  return a;
}

/** The first key code of an action, for handlers that bind one key. */
export function codeOf(id) {
  return action(id).codes[0];
}

/** Every key code of an action, as a Set. */
export function codesOf(id) {
  return new Set(action(id).codes);
}

/** Every key code bound anywhere, for the coverage test. */
export function boundCodes() {
  return new Set(ACTIONS.flatMap((a) => a.codes));
}

/**
 * The bar's buttons for what the player is doing now, in list order.
 * @param {{ mode?: string, stage?: string, inCabin?: boolean, wristOpen?: boolean, sampling?: { actions?: Record<string, unknown> } | null }} now
 * @returns {{ main: Action[], more: Action[] }}
 */
export function touchBarActions(now) {
  const walk = now?.mode === 'walk';
  const surface = walk && now?.stage === 'eva';
  const cabin = walk && !!now?.inCabin;
  const wrist = surface && !!now?.wristOpen;
  const show = (a) => {
    if (a.touch !== 'button') return false;
    switch (a.when) {
      case 'always': return true;
      case 'walk': return walk;
      case 'cabin': return cabin && !wrist;
      case 'wrist': return wrist;
      case 'surface':
        if (!surface) return false;
        if (wrist) return a.id === 'wrist';   // the wrist owns the keys while up (#231): only its own buttons
        if (cabin && a.id === 'stow') return false;   // in the cabin E opens the plan
        // the sampling buttons show only when their input does something now (samplingRules.js inputActions)
        if (a.id in SAMPLING_INPUT) return !!now?.sampling?.actions?.[SAMPLING_INPUT[a.id]];
        return true;
      default: return false;
    }
  };
  const list = ACTIONS.filter(show);
  return { main: list.filter((a) => !a.more), more: list.filter((a) => a.more) };
}

/** The KeyboardEvent.key value that matches a code, for handlers that read event.key. */
export function keyForCode(code) {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Numpad0') return '0';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Space') return ' ';
  return code;
}
