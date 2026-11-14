# Mode and data layer shortcuts

Implemented for #101. Include these entries in the controls help from #64:

| Key | Action |
| --- | --- |
| M | Switch between Plan and Walk. Entering Plan releases pointer lock. |
| L | Next data layer. |
| Shift+L | Previous data layer. |
| 0 (top row or numeric keypad) | Turn off the data layer. |

Layers wrap in this order: None, Slope hazard, Elevation, Rock abundance,
Outcrop, then None again. Reverse cycling wraps from None to Outcrop.
The wrist screen follows the selected layer through the existing store/engine bridge.

Shortcuts use physical key codes, matching WASD. They run only when the engine is
ready and ignore held-key repeats, text inputs, selects, editable content, modal
dialogs, composition, and Ctrl/Alt/Meta combinations. Shift is allowed for reverse
layer cycling. Plan/Walk and layer button tooltips list the keys.
