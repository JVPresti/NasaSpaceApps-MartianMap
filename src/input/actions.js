// Every player action Marswalk binds to a key, in one list (#365). Each entry names its key codes (KeyboardEvent.code,
// so the bindings do not depend on the keyboard layout) and how a touch player does the same thing. The key handlers
// read their codes from here, the touch action bar (src/components/TouchActions.jsx) draws a button for every entry
// whose touch kind is 'button', and actions.test.js fails when a key bound anywhere in src has no entry here, or when
// an entry has no touch control. Plain JavaScript: no DOM, no React, no three.js.

/**
 * How a touch player does an action. Every kind names the control that does it, and actions.test.js checks that the
 * control exists:
 * - 'button': a button on the touch action bar (src/components/TouchActions.jsx) sends the action's first key, or runs
 *   it directly (Sample, which has no key);
 * - 'stick': the on-screen stick (src/engine/touchInput.js);
 * - 'gesture': a finger drag or pinch on the scene or the map;
 * - 'dialog': a button that the screen with the key draws itself, e.g. the find card's Add and Dismiss.
 * Non-button kinds carry `control: { file, has }`: the file that draws the control and a string it must contain.
 * @typedef {'button' | 'stick' | 'gesture' | 'dialog'} TouchKind
 */

/**
 * When a bar button shows. Read by touchBarActions().
 * - 'walk': walking, inside or outside;
 * - 'surface': walking on the surface after the airlock (the EVA);
 * - 'cabin': walking in the habitat cabin, where the table prompt shows;
 * - 'wrist': the wrist screen is up;
 * - 'always': whenever the bar shows.
 * @typedef {'walk' | 'surface' | 'cabin' | 'wrist' | 'always'} ActionContext
 */

/**
 * @typedef {{
 *   id: string,
 *   codes: string[],
 *   keys?: string[],
 *   files: string[],
 *   touch: TouchKind,
 *   control?: { file: string, has: string },
 *   when?: ActionContext,
 *   hold?: boolean,
 *   more?: boolean,
 *   label: string,
 * }} Action
 * `codes` are KeyboardEvent.code values and `keys` KeyboardEvent.key values, for handlers that read the key (Esc, H, the
 * presentation). `files` are the source files whose handlers listen for these keys: the coverage test pairs each key it
 * finds in a file with an action of that file, so one screen's Escape cannot pass for another's. `hold` sends keydown on
 * press and keyup on release (Q is held for 2 s). `more` puts the button behind the bar's More toggle. `label` is an
 * i18n key.
 */

const BAR = 'src/components/TouchActions.jsx';
const WALK_KEYS = ['src/components/shortcuts.js'];

/** @type {readonly Action[]} */
export const ACTIONS = Object.freeze([
  // Walk and look
  { id: 'walk', codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], files: ['src/engine/walkInput.js'],
    touch: 'stick', control: { file: 'src/engine/view.js', has: 'touchstart' }, label: 'touch.walk' },
  { id: 'jog', codes: ['ShiftLeft', 'ShiftRight'], files: ['src/engine/view.js'],
    touch: 'stick', control: { file: 'src/engine/touchInput.js', has: 'STICK_JOG_FROM' }, label: 'touch.jog' },
  { id: 'look', codes: [], files: [], touch: 'gesture', control: { file: 'src/engine/touchInput.js', has: 'consumeLook' }, label: 'touch.look' },

  // Both views
  { id: 'pause', codes: ['Escape'], keys: ['Escape'], files: ['src/App.jsx'], touch: 'button', when: 'always', label: 'touch.pause' },
  { id: 'mode', codes: ['KeyM'], files: WALK_KEYS, touch: 'button', when: 'walk', label: 'touch.map' },
  { id: 'help', codes: ['KeyH'], keys: ['h', 'H'], files: ['src/App.jsx'], touch: 'dialog', control: { file: 'src/components/PauseMenu.jsx', has: 'onControls' }, label: 'touch.help' },
  { id: 'layer-next', codes: ['KeyL'], files: WALK_KEYS, touch: 'button', when: 'walk', more: true, label: 'touch.layer' },
  { id: 'layer-off', codes: ['Digit0', 'Numpad0'], files: WALK_KEYS, touch: 'button', when: 'walk', more: true, label: 'touch.layer.off' },
  { id: 'visor-frame', codes: ['KeyV'], files: WALK_KEYS, touch: 'button', when: 'surface', more: true, label: 'touch.visor' },

  // Habitat cabin (the table prompt, #244)
  { id: 'open-plan', codes: ['KeyE'], files: ['src/state/tableActions.js'], touch: 'button', when: 'cabin', label: 'touch.open.plan' },
  { id: 'end-eva', codes: ['KeyX'], files: ['src/state/tableActions.js'], touch: 'button', when: 'cabin', label: 'touch.end.eva' },

  // Surface: sampling (#36) and the EVA's tools
  { id: 'sample', codes: [], files: [], touch: 'button', when: 'surface', label: 'touch.sample' },
  { id: 'photo', codes: ['KeyP'], files: ['src/engine/sampling.js'], touch: 'button', when: 'surface', label: 'touch.photo' },
  { id: 'stow', codes: ['KeyE'], files: ['src/engine/sampling.js'], touch: 'button', when: 'surface', label: 'touch.stow' },
  { id: 'case', codes: ['KeyF'], files: ['src/engine/sampling.js'], touch: 'button', when: 'surface', label: 'touch.case' },
  { id: 'find', codes: ['KeyQ'], files: ['src/finds/Finds.jsx', 'src/screens/wrist/controller.js'], touch: 'button', when: 'surface', hold: true, more: true, label: 'touch.find' },
  // Esc while Q is held cancels the find: on touch, the finger sliding off the Hold button cancels it
  { id: 'find-cancel', codes: ['Escape'], files: ['src/finds/Finds.jsx'], touch: 'gesture', control: { file: BAR, has: 'onPointerLeave' }, label: 'touch.find' },
  { id: 'find-accept', codes: ['KeyY'], files: ['src/finds/Finds.jsx'], touch: 'dialog', control: { file: 'src/finds/Finds.jsx', has: 'service.accept(f.id)' }, label: 'touch.find.accept' },
  { id: 'find-dismiss', codes: ['KeyN', 'Escape'], files: ['src/finds/Finds.jsx'], touch: 'dialog', control: { file: 'src/finds/Finds.jsx', has: 'service.dismiss(f.id)' }, label: 'touch.find.dismiss' },
  { id: 'partner', codes: ['KeyT'], files: ['src/hud/PartnerPanel.jsx'], touch: 'button', when: 'surface', more: true, label: 'touch.partner' },
  { id: 'slope-grid', codes: ['KeyG'], files: ['src/state/slopeGrid.js'], touch: 'button', when: 'surface', more: true, label: 'touch.slope' },
  { id: 'visor-detail', codes: ['KeyI'], files: ['src/hud/visorMode.js'], touch: 'button', when: 'surface', more: true, label: 'touch.detail' },
  { id: 'sources', codes: ['KeyC'], files: ['src/sources/SourcesScreen.jsx', 'src/sources/sourcesStore.js'], touch: 'button', when: 'walk', more: true, label: 'touch.sources' },

  // Wrist screen (#231)
  { id: 'wrist', codes: ['KeyR'], files: ['src/screens/wrist/keys.js'], touch: 'button', when: 'surface', label: 'touch.wrist' },
  { id: 'wrist-previous-page', codes: ['BracketLeft'], files: ['src/screens/wrist/keys.js'], touch: 'button', when: 'wrist', label: 'touch.wrist.page.previous' },
  { id: 'wrist-next-page', codes: ['BracketRight'], files: ['src/screens/wrist/keys.js'], touch: 'button', when: 'wrist', label: 'touch.wrist.page.next' },
  { id: 'wrist-previous-row', codes: ['KeyK'], files: ['src/screens/wrist/keys.js'], touch: 'button', when: 'wrist', label: 'touch.wrist.row.previous' },
  { id: 'wrist-next-row', codes: ['KeyJ'], files: ['src/screens/wrist/keys.js'], touch: 'button', when: 'wrist', label: 'touch.wrist.row.next' },
  { id: 'wrist-confirm', codes: ['Enter', 'NumpadEnter'], keys: ['Enter'], files: ['src/screens/wrist/keys.js'], touch: 'button', when: 'wrist', label: 'touch.wrist.select' },

  // Screens that draw their own buttons for their keys
  { id: 'dialog-keys', codes: ['Tab', 'Enter', 'Escape'], keys: ['Tab', 'Enter', 'Escape'], files: ['src/components/Modal.jsx'],
    touch: 'dialog', control: { file: 'src/components/Modal.jsx', has: 'so the dialog is never left without a button to press' }, label: 'touch.dialog.focus' },
  { id: 'sources-close', codes: ['Escape', 'Tab'], keys: ['Escape', 'Tab'], files: ['src/sources/SourcesScreen.jsx'],
    touch: 'dialog', control: { file: 'src/sources/SourcesScreen.jsx', has: 'className="sources-close" onClick={onClose}' }, label: 'touch.dialog.focus' },
  { id: 'card-close', codes: ['Enter', 'NumpadEnter', 'Escape'], files: ['src/stops/closeKeys.js'],
    touch: 'dialog', control: { file: 'src/stops/StopCard.jsx', has: 'className="stop-close" onClick={onClose}' }, label: 'touch.dialog.focus' },
  { id: 'map-popup-close', codes: ['Escape'], keys: ['Escape'], files: ['src/plan/MissionMap.jsx', 'src/plan/TraverseLayer.jsx'],
    touch: 'dialog', control: { file: 'src/plan/MissionMap.jsx', has: 'className="map-pop-close"' }, label: 'touch.dialog.focus' },
  { id: 'tooltip-close', codes: ['Escape'], keys: ['Escape'], files: ['src/components/SourceTag.jsx'],
    touch: 'gesture', control: { file: 'src/components/SourceTag.jsx', has: 'a tap opens and closes the details' }, label: 'touch.dialog.focus' },
  // A waypoint's x or z field: Enter commits, Esc restores. The on-screen keyboard's Done key and a tap outside both blur
  // the field, which commits it; restoring is retyping the old value.
  { id: 'waypoint-field', codes: ['Enter', 'Escape'], keys: ['Enter', 'Escape'], files: ['src/plan/RoutePanel.jsx'],
    touch: 'gesture', control: { file: 'src/plan/RoutePanel.jsx', has: 'onBlur' }, label: 'touch.dialog.focus' },
  { id: 'table-step', codes: ['ArrowLeft', 'ArrowRight'], keys: ['ArrowLeft', 'ArrowRight'], files: ['src/plan/MissionTable.jsx'],
    touch: 'dialog', control: { file: 'src/plan/MissionTable.jsx', has: 'table-tab-' }, label: 'touch.table.step' },

  // The presentation (?present=1, src/present/control.js). Its touch controls arrive with #373 (swipe) and the on-screen
  // Back, Exit and Language buttons after it; until then actions.test.js lists them as pending, by name.
  { id: 'present-next', codes: ['ArrowRight', 'PageDown', 'Space', 'Enter'], keys: ['ArrowRight', 'PageDown', ' ', 'Enter', 'Spacebar'], files: ['src/present/control.js'],
    touch: 'dialog', control: { file: 'src/present/Present.jsx', has: 'data-present-action="next"' }, label: 'touch.present.next' },
  { id: 'present-back', codes: ['ArrowLeft', 'PageUp'], keys: ['ArrowLeft', 'PageUp'], files: ['src/present/control.js'],
    touch: 'dialog', control: { file: 'src/present/Present.jsx', has: 'data-present-action="back"' }, label: 'touch.present.back' },
  { id: 'present-exit', codes: ['Escape'], keys: ['Escape'], files: ['src/present/control.js'],
    touch: 'dialog', control: { file: 'src/present/Present.jsx', has: 'data-present-action="exit"' }, label: 'touch.present.exit' },
  { id: 'present-language', codes: ['KeyL'], keys: ['l', 'L'], files: ['src/present/control.js'],
    touch: 'dialog', control: { file: 'src/present/Present.jsx', has: 'data-present-action="language"' }, label: 'touch.present.language' },
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
