# Data layer shortcuts

Implemented for #101. The controls help (#64) lists these entries:

| Key | Action |
| --- | --- |
| L | Next data layer. |
| Shift+L | Previous data layer. |
| 0 (top row or numeric keypad) | Turn off the data layer. |

There is no Plan / Walk key any more. M used to switch between them; the habitat-first flow replaced that with a
place: E or a click while facing the mission table in the habitat opens the table, "Back to the habitat" closes it,
and Begin EVA goes out through the airlock. On the surface the pause menu offers "End the EVA and go back to the
mission table".

The layer keys work where a layer shows: on the surface and at the mission table. Walking around inside the habitat
they do nothing.

Layers wrap in this order: None, Slope hazard, Elevation, Rock abundance,
Outcrop, then None again. Reverse cycling wraps from None to Outcrop.
The wrist screen follows the selected layer through the existing store/engine bridge.

Shortcuts use physical key codes, matching WASD. They run only when the engine is
ready and ignore held-key repeats, text inputs, selects, editable content, modal
dialogs, composition, and Ctrl/Alt/Meta combinations. Shift is allowed for reverse
layer cycling. The layer buttons' tooltips list the keys.

Every input, including touch and gamepad, is listed in [docs/CONTROLS.md](CONTROLS.md).
