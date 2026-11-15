# Controls

Every input Marswalk accepts, for the four devices the simulator supports: keyboard, mouse, touch and gamepad
(#103). The interface never draws a hint for an input the player has not used yet, so a touch player is not shown
gamepad keys and a keyboard player is not shown the on-screen stick.

## Keyboard and mouse

### Walk

| Input | Action |
| --- | --- |
| W A S D or arrow keys | Walk forward, back and sideways |
| Shift | Jog at 1.5 m/s instead of 1.0 m/s |
| Mouse | Look around while the pointer is captured |
| Drag on the scene | Look around when the mouse was not captured |
| Click | Sample the target in reach; the HUD prompt names the step that applies now |
| P | Photograph the target |
| E | Stow the sample in the bag |
| E (in the habitat cabin) | Open plan: the mission table on its Route step. Reads "Make a plan" while there is no route yet and opens the same table |
| X (in the habitat cabin) | Finish EVA: end it and open the debrief. Dimmed, reading "No EVA in progress", while no EVA runs; X then does nothing |
| F | Call, fill or return the case |
| Q (hold 2 s) | Mark a find while pointing at the ground |
| Y / N | Add the marked find to the route or dismiss it |
| T | Partner detail |
| G | Slope grid |
| V | Hide or show the visor frame and alert ring, for screenshots (#28) |
| R | Wrist screen: open or close |
| [ / ] | Wrist screen up: previous / next page |
| J / K | Wrist screen up: next / previous row |
| Enter | Wrist screen up: select the highlighted layer |
| C | Sources |
| Esc | Release the pointer and pause |

While the wrist screen is up it owns the keyboard (#231): Q, Y/N, T, G, C, E, X, L, Shift+L, 0 and M do nothing, and Enter selects the wrist row instead of closing a science card. Esc still pauses and lowers the wrist. R does not raise the wrist while Q is held.

**The habitat table (#244).** In the cabin (the main room and the inner hatch) a prompt floats over the planning table
with both actions, `[E] Open plan` and `[X] Finish EVA`; a row that does not apply now is dimmed. The keys act only
there, where the prompt shows: not on the steps, the porch, in the airlock or near the habitat outside. While a sample
is in the scoop, E stows it and Open plan stays dimmed until the scoop is empty. Closing the table (Continue the EVA)
returns to Walk. The pause menu's End the EVA is a different action: it discards the EVA instead of opening the debrief.

### Plan

| Input | Action |
| --- | --- |
| Right-drag | Pan the map |
| Scroll | Zoom in and out |
| Esc | Pause and open the menu |

### Both views

| Input | Action |
| --- | --- |
| M | Switch between Walk and Plan. Entering Plan releases the pointer lock. |
| L | Next data layer |
| Shift+L | Previous data layer |
| 0 (top row or numeric keypad) | Turn the data layer off |
| H | Open this controls help; the EVA pauses |

Layers wrap in this order: None, Slope hazard, Elevation, Rock abundance, Outcrop, then None again. The shortcut
rules are in [docs/KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md): physical key codes, no held-key repeats, and no
action inside text inputs, selects, editable content or open dialogs.

## Touch

The canvas uses `touch-action: none` (src/App.css), so a touch on the scene never scrolls or zooms the page.

### Walk

| Input | Action |
| --- | --- |
| First touch anywhere | The virtual stick appears bottom left |
| Touch inside the stick, drag | Walk in that direction; the further you push, the faster |
| Push the stick past 85 % | Jog, up to 1.5 m/s |
| Any other finger, drag | Look around |

Touch is read from Touch Events, not Pointer Events: while the mouse pointer is locked, Chrome reports
`clientX/clientY` as 0 on touch Pointer Events, while Touch Events keep the real coordinates. So a touchscreen
laptop that started with the mouse can switch to the stick without releasing the capture, and iOS works the
same way even though it never grants a pointer lock (drag-to-look, #197). Opening any menu pauses the EVA and
drops the stick and the look finger until the menu closes.

### Plan

| Input | Action |
| --- | --- |
| One finger | Pan the map |
| Two fingers | Pan and pinch-zoom together |

Plan is a north-up map: rotation is disabled on purpose (#135, #213). `planTouches` in
[src/engine/planTouch.js](../src/engine/planTouch.js) maps one finger to `THREE.TOUCH.PAN` and two fingers to
`THREE.TOUCH.DOLLY_PAN`, and `controls.enableRotate` stays `false`, so no gesture can turn the map.

## Gamepad

Standard mapping, polled from the browser Gamepad API.

| Input | Action |
| --- | --- |
| Left stick | Walk |
| L3 (click the left stick) | Jog, up to 1.5 m/s |
| Right stick | Look around |
| Start | Switch between Walk and Plan |
| LB / RB | Previous / next data layer |
| A (in the habitat cabin) | Open plan, as E |
| X (in the habitat cabin) | Finish EVA, as X |

A gamepad press is not a user gesture, so the browser may not grant pointer lock. Walk then uses drag-to-look,
the same fallback as iOS. To capture the mouse, resume from the pause menu with a click or Enter. The first
gamepad press also raises a one-line reminder of this mapping; it hides after ten seconds and does not come back.
The table prompt keeps its E and X key caps for a gamepad too: the app records that a pad was used, not which
input is active now. A and X are the standard mapping's buttons 0 and 2 (Cross and Square on a PlayStation pad).

Touch has no interact control yet, so a touch player cannot open the plan or finish the EVA from the habitat table
(a follow-up covers sampling, finds and these two actions).

## Speed model

Analogue input feeds the same `view.moveSpeed` that the suit model reads (src/engine/view.js). Every source is
capped at `JOG_SPEED = 1.5 m/s` (SIM: `mobility.speed.jog` in `public/data/hazards.json`), so touch and gamepad
never move faster than Shift on the keyboard; walking is `WALK_SPEED = 1.0 m/s` (SIM: `mobility.speed.flat`).
The same hazard entry notes that 1.5 m/s on the flat is close to the fastest suited speed tested at Mars gravity,
so the cap also keeps the suit model inside its validated range.

## Source of truth

These tables follow the code paths: src/engine/view.js (Walk keys, look, jog, Plan pan and zoom, rotation off),
src/engine/touchInput.js (virtual stick and touch look), src/engine/gamepadInput.js (gamepad polling and first-use
state), src/components/shortcuts.js (M, L, Shift+L, 0), src/state/tableActions.js (E and X, gamepad A and X, at
the habitat table), src/engine/planTouch.js (Plan touches) and src/App.jsx (Esc, H and the menus). The in-game help
is src/components/ControlsHelp.jsx.
