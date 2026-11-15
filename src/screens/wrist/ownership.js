// One key, one consumer (#231). The wrist screen owns the keyboard while it is up: every other
// listener asks this module before acting, so a key cannot do two things at once and the wrist
// takes precedence over a science card, the finds gesture, the partner panel or the shortcuts.
//
// Plain JavaScript, no DOM: the controller sets the flag from its own open state and the tests
// cover each consumer's guard.

let open = false;

/** Record that the wrist screen is up (true) or down (false). */
export function setWristKeyOwner(value) {
  open = value === true;
}

/** True while the wrist screen is up and owns the keyboard. */
export function wristOwnsKeys() {
  return open;
}
