# Controls

Every input Marswalk accepts, for the four devices the simulator supports: keyboard, mouse, touch and gamepad
(#103). The interface never draws a hint for an input the player has not used yet, so a touch player is not shown
gamepad keys and a keyboard player is not shown the on-screen stick.

## Keyboard and mouse

The astronaut starts inside the habitat, next to the mission table. Walking works the same inside and outside;
sampling, finds, the wrist screen and the slope grid only work on the surface, after Begin EVA and the airlock cycle.

### Walk

| Input | Action |
| --- | --- |
| W A S D or arrow keys | Walk forward, back and sideways |
| Shift | Jog at 1.5 m/s instead of 1.0 m/s |
| Mouse | Look around while the pointer is captured |
| Drag on the scene | Look around when the mouse was not captured |
| Click | In the habitat, facing the table: open the mission table. Outside: sample the target in reach; the HUD prompt names the step that applies now |
| P | Photograph the target |
| E | In the habitat, facing the table: open the mission table. Outside: stow the sample in the bag |
| F | Call, fill or return the case |
| Q (hold 2 s) | Mark a find while pointing at the ground |
| Y / N | Add the marked find to the route or dismiss it |
| T | Partner detail |
| G | Slope grid |
| R | Wrist screen |
| C | Sources |
| Esc | Release the pointer and pause |

### Mission table

| Input | Action |
| --- | --- |
| Drag on the map | Move the map |
| Scroll | Zoom in and out |
| Double-click | Fit the route |
| Back to the habitat | Close the table and walk again; the click captures the mouse |
| Begin EVA | Fix the route and go out through the airlock |
| Esc | Pause and open the menu |

There is no key that switches between the table and walking. The table opens only at the table in the habitat,
before the EVA. On the surface, the pause menu's "End the EVA and go back to the mission table" restarts the EVA
at the table.

### Data layers and help

| Input | Action |
| --- | --- |
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

### Mission table

| Input | Action |
| --- | --- |
| One finger on the map | Move the map |
| Tap a button | The same as a click |

The engine's old top-down Plan camera keeps its touch mapping (`planTouches` in
[src/engine/planTouch.js](../src/engine/planTouch.js): one finger pans, two fingers pan and pinch-zoom, rotation
off, #135, #213), but the mission table covers it, so players no longer see it.

## Gamepad

Standard mapping, polled from the browser Gamepad API.

| Input | Action |
| --- | --- |
| Left stick | Walk |
| L3 (click the left stick) | Jog, up to 1.5 m/s |
| Right stick | Look around |
| Start | Facing the table in the habitat: open the mission table; at the table: close it again |
| LB / RB | Previous / next data layer |

A gamepad press is not a user gesture, so the browser may not grant pointer lock. Walk then uses drag-to-look,
the same fallback as iOS. To capture the mouse, resume from the pause menu with a click or Enter. The first
gamepad press also raises a one-line reminder of this mapping; it hides after ten seconds and does not come back.

## Speed model

Analogue input feeds the same `view.moveSpeed` that the suit model reads (src/engine/view.js). Every source is
capped at `JOG_SPEED = 1.5 m/s` (SIM: `mobility.speed.jog` in `public/data/hazards.json`), so touch and gamepad
never move faster than Shift on the keyboard; walking is `WALK_SPEED = 1.0 m/s` (SIM: `mobility.speed.flat`).
The same hazard entry notes that 1.5 m/s on the flat is close to the fastest suited speed tested at Mars gravity,
so the cap also keeps the suit model inside its validated range.

## Source of truth

These tables follow the code paths: src/engine/view.js (Walk keys, look, jog, Plan pan and zoom, rotation off),
src/engine/touchInput.js (virtual stick and touch look), src/engine/gamepadInput.js (gamepad polling and first-use
state), src/components/shortcuts.js (L, Shift+L, 0), src/engine/planTouch.js (Plan touches),
src/plan/MissionMap.jsx (the table's map) and src/App.jsx (Esc, H, E or a click at the table, and the menus). The in-game help is src/components/ControlsHelp.jsx.
