# Mode and data layer shortcuts

Implemented for #101. Include these entries in the controls help from #64:

| Key | Action |
| --- | --- |
| M | Switch between Plan and Walk. Entering Plan releases pointer lock. |
| L | Next data layer. |
| Shift+L | Previous data layer. |
| 0 (top row or numeric keypad) | Turn off the data layer. |
| V | Walk only: hide or show the visor frame and alert ring, for screenshots (#28). |

Layers wrap in this order: None, Slope hazard, Elevation, Rock abundance,
Outcrop, then None again. Reverse cycling wraps from None to Outcrop.
The wrist screen follows the selected layer through the existing store/engine bridge.

Shortcuts use physical key codes, matching WASD. They run only when the engine is
ready and ignore held-key repeats, text inputs, selects, editable content, modal
dialogs, composition, and Ctrl/Alt/Meta combinations. Shift is allowed for reverse
layer cycling. Plan/Walk and layer button tooltips list the keys.

## Habitat table (#244)

| Key | Action |
| --- | --- |
| E | In the habitat cabin: open the mission table on its Route step. Reads "Make a plan" while there is no route yet. |
| X | In the habitat cabin: finish the EVA and open the debrief. Dimmed, "No EVA in progress", while no EVA runs. |

Both show in the prompt over the cabin's planning table and act only in the cabin (the main room and the inner
hatch), never on the steps, the porch, in the airlock or outside. They use physical key codes (`KeyE`, `KeyX`),
only in Walk with the mission running, and ignore held-key repeats, text inputs, selects, editable content and
Ctrl/Alt/Meta combinations. The wrist screen owns both while it is up (#231). While a sample is in the scoop, E
stows it instead, and Open plan stays dimmed until the scoop is empty. Gamepad A and X do the same
(src/state/tableActions.js).

Every input, including touch and gamepad, is listed in [docs/CONTROLS.md](CONTROLS.md).
