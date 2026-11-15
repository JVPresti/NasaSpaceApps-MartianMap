/**
 * Whether a shortcut may switch the mode (M on the keyboard, Start on a gamepad). Before the EVA has begun, nothing but
 * Begin EVA leaves the mission table, behind the Go / No-go check; the table can always be opened.
 * @param {'walk' | 'plan'} next
 * @param {boolean} evaBegun
 * @returns {boolean}
 */
export function modeSwitchAllowed(next, evaBegun) {
  return next !== 'walk' || evaBegun === true;
}
