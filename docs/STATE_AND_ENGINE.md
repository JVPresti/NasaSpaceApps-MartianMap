# State and engine contracts

Two contracts let the interface, the simulation and the engine be built in parallel:

1. **The mission store** (`src/state/store.js`): one snapshot of everything the interface shows.
2. **The engine API** (`src/engine/index.js`): the only way other code changes what is drawn or asks the terrain a question.

```text
 simulation (src/sim)  ──writes──▶  mission store  ◀──reads── interface (React)
                                        │   ▲
                       mode, layer,     │   │  player position,
                       sky, route path  ▼   │  5 times per second
                                  engine bridge (src/state/engineBridge.js)
                                        │   ▲
                                        ▼   │
                                   engine (three.js)
```

Rules:

- **The engine imports nothing from React. The interface imports nothing from three.js.** The simulation imports neither.
- **React never renders per frame.** Components select small slices of the store, and the bridge writes the player's position only 5 times per second, and only when it changed.
- **Coordinates everywhere:** x east, z south, y up, metres from Cheyava Falls. Units are part of every field name.
- **Every number shown on screen needs a source tag** (see [CONTEXT.md](../CONTEXT.md), realism rules). The store keeps them in `sources`.

## The mission store

### Wrist screen (#67)

The wrist controller (`src/screens/wrist/controller.js`) reads this same store and paints a fixed 512 × 352 canvas. The engine owns the `CanvasTexture` on the arm's `Screen` material, while the interface owns the canvas content. No React or store imports enter the engine.

In Walk, `R` raises or lowers the wrist, `[`/`]` changes pages, `J`/`K` selects the next/previous row, and `Enter` confirms a layer through `setLayer`. Checklist and suit rows are read-only. Typing, held keys, modifier shortcuts, paused missions and reading cards/menus do not operate the wrist. Science cards retain Enter. Point indicates the selected row; confirmation briefly uses the existing pinch pose.

Opening is rejected during sampling clips. A held sample survives opening and its tool pose is restored on closing; sampling inputs are disabled while reading the wrist. Entering Plan or pausing closes the wrist. Page/selection live in the controller session, survive a Plan round trip, and reset when the engine is replaced or retried.

The map shows the entire real HiRISE tile north-up with an isotropic metre scale, route, waypoints, refuges and the store's navigation estimate and uncertainty. Missing image/position data are reported or omitted, never replaced with simulated fixes. Navigation remains subject to the existing estimate contract above.

The controller signs only the current page's displayed content and repaints/uploads the texture when that signature changes. Hidden pages and unchanged store updates do not repaint it; coalescing caps work at 10 Hz. Opening refreshes a page that changed while closed. The engine's fallback layer painter never overwrites an external canvas.

Engine methods (after `ready`): `setWristScreen(canvas|null)`, `invalidateWristScreen()`, `setWristOpen(boolean)` (returns success), `setWristPointer({x,y,pressed})` (canvas pixels), `getWristState()` and `getOrthoImage()`. Disconnect the controller before disposing the engine. Development-only `window.__marswalkWrist` exposes the canvas and a read-only snapshot for verification.

```js
import { useMissionStore, storeAdapter, setMode } from './state/store.js';

const oxygen = useMissionStore((s) => s.suit.oxygenPct);   // re-renders only when this value changes
storeAdapter.set('environment.dustOpacity', 0.4);           // anyone, including the simulation
setMode('plan');
```

### Snapshot

| Field | Unit and meaning | Written by | Issue |
|---|---|---|---|
| `mode` | `'walk'` or `'plan'`; starts as `'plan'`, the habitat's planning table | interface (mode switch) | #5, #166 |
| `mission.startedAtMs`, `elapsedSec`, `paused` | mission clock. `startedAtMs` is the first start timestamp; `elapsedSec` is the current published reading, excluding pauses and including the time scale | mission clock | #59 |
| `mission.anchorMs` | wall-clock ms of the last start, pause, resume or scale change. The matching elapsed baseline is private to the clock session; the store's current `elapsedSec` is already advanced | mission clock | #59 |
| `mission.sol`, `lmst` | sol number, local mean solar time `'HH:MM'` at 77.3053 E | mission clock | #59 |
| `mission.timeScale` | mission seconds per real second, above 0 (demo 1). Scales both `elapsedSec` and LMST; pause is separate | mission clock, `setMissionTimeScale()` | #59 |
| `mission.initialSol`, `initialLmst`, `longitudeDeg`, `sky` | demo start configuration and the starting sky preset, kept for a coherent restored session | mission clock | #59 |
| `suit.oxygenG`, `oxygenPct` | primary O2 left, grams and 0 to 100 (xEMU 771 g usable) | suit model | #19 |
| `suit.oxygenSec` | O2 time left at the current rate (smoothed over 30 s). **The event engine reads this path.** | suit model | #19 |
| `suit.batteryPct` | 0 to 100 (xEMU 756 Wh) | suit model | #19 |
| `suit.pressurePsi` | suit pressure, 4.3 psid nominal | suit model | #19 |
| `suit.metabolicW`, `effort` | metabolic power in W; effort 0 at rest, 1 at the design peak (879 W) | suit model | #19 |
| `suit.walkbackSec`, `walkbackO2G`, `walkbackTo` | time and O2 (with the 20 % pad) to walk back to the habitat entry in `public/data/shelters.json` along the route. While `route.shelter` is set the walk follows the shelter route forward to the shelter instead. `walkbackTo` is `'habitat'` or `'shelter'` | suit model | #19, #129, #195 |
| `suit.marginSec`, `o2MarginSec`, `evaMarginSec`, `marginLimit` | margin now: the smaller of the O2 margin (O2 time left minus walkback minus the 30 min reserve) and the EVA margin (`suit.eva_duration_max` minus `mission.elapsedSec` minus the walkback time). `marginLimit` names the smaller one, `'o2'` or `'eva'` | suit model | #19, #195 |
| `suit.status` | `'nominal'`, `'caution'` (margin under 15 min) or `'warning'` (margin at or under 0) | suit model | #19, used by #26 |
| `navigation.trueX`, `trueZ` | the TRUE position, rounded to cm, written by the engine bridge only; no interface reads it | engine bridge (`src/state/engineBridge.js`) | #6, #42 |
| `navigation.x`, `z` | position estimate: the true position plus the drift offset, rounded to cm. This is what the HUD, the Plan map and the minimap show; never the truth | navigation drift runner (`src/sim/navigationDrift.js`) | #21, #42 |
| `navigation.headingDeg` | heading clockwise from north, from the engine | engine bridge | #6, #21 |
| `navigation.waypointRangeM`, `waypointBearingDeg` | distance and bearing to the next unvisited waypoint, written in Walk mode **from the estimate** | waypoint runner | #61 |
| `navigation.slopeDeg` | terrain slope under the player in degrees (DERIVED from the HiRISE DTM), for the HUD | engine bridge | #20 |
| `navigation.errorM`, `fixMode`, `lastFixSec` | uncertainty radius in metres (the ring on the Plan map); `'terrain fix'`, `'dead reckoning'` or `'radio ranging'`; mission time (`mission.elapsedSec`) of the last terrain fix. Tagged `SIM` | navigation drift runner; `initNavigation` seeds a fresh fix at the airlock | #21, #42 |
| `route.waypoints` | `[{ name, x, z }]` | Plan mode, planner | #17 |
| `route.path` | `[[x, z], ...]`, the format of `route.json` and `planRoute()` | planner | #16, #23 |
| `route.nextIndex` | index of the next waypoint | waypoint tracking | #61 |
| `route.visited` | names of the waypoints already reached, in order | waypoint tracking | #61 |
| `route.distanceM`, `climbM`, `steepestSlopeDeg`, `etaSec` | from `planRoute()` (`distance`, `climb`, `steepestSlopeDeg`) | planner | #16, #41 |
| `route.reason` | why the route changed, for example after an event | re-planner | #23 |
| `route.shelter` | `{ id, name, x, z, type, protection }` from `public/data/shelters.json`: the shelter the re-planner chose, highlighted in green; `null` when no event is active | re-planner, events | #23, #24 to #26, #30 |
| `route.legs` | `[{ from, to, distanceM, climbM, descentM, maxSlopeDeg, timeSec, o2G, o2Pct, batteryWh, batteryPct }]`, one per leg between consecutive `route.waypoints`, walked out at nominal effort. `maxSlopeDeg` is the steepest grade along the walking direction. `[]` without a route | per-leg costs (`src/sim/legCosts.js`) | #41 |
| `route.totals` | the same fields summed over the legs (the maximum for `maxSlopeDeg`), plus the walk home along the same path with the 20 % pad (`returnTimeSec`, `returnO2G`, `returnBatteryWh`), what is left at the habitat (`arrivalO2G`, `arrivalO2Pct`, `arrivalBatteryWh`, `arrivalBatteryPct`), `marginSec` (margin at the end of the plan: O2 left at the habitat as time at the flat walking rate, minus the 30 min reserve, capped at `suit.eva_duration_max` minus the walk out and back) and `status` as for `suit.status`. `null` without a route | per-leg costs | #41 |
| `route.decision` | `'pending'`, `'go'` or `'no-go'`, set by the crew in Plan mode | interface | #17 |
| `route.skipped` | waypoint names the event route leaves out, for example after a dust storm | events | #24 |
| `environment.dustOpacity` | tau. **The event engine writes this path.** The bridge turns it into the engine's storm-dust level (`src/state/dustLevel.js`): tau 0.45 (clear Jezero) is 0, tau 8 (global storm, Gale 2018) is 1. | events, MEDA replay | #22, #24, #27, #31 |
| `environment.tempC`, `windMs`, `pressurePa` | weather. The environment runner (`src/sim/environmentRunner.js`) replays the stored MEDA sol at the mission LMST once per second from the first Walk. | MEDA replay | #31, #189 |
| `environment.doseRateUgyH`, `doseUgy` | radiation dose rate (µGy/h) and dose received this EVA (µGy). The environment runner writes the RAD background rate (8.75 µGy/h) outside the radiation event and sums the rate in the store over mission time into `doseUgy`; the radiation event sets only the rate. | RAD background, radiation event, environment runner | #25, #31, #189 |
| `hazards.zones` | `[{ id, x, z, radiusM, active }]`, x east / z south in metres and `radiusM` in metres: active hazard areas for the minimap. `[]` means "no zone known", **not** "the ground is safe". The minimap draws only `active === true` entries with finite `x`, `z` and `radiusM > 0`. | no writer yet; the event work (#24-#26) may fill it | #60 |
| `hazards.off` | `[eventId]`: events switched off for this run at the mission table (Hazards step). The event runner leaves them out when the EVA starts; `[]` runs every event. | `setHazardEnabled` (mission table) | #11 |
| `alerts.<eventId>` | `{ id, eventId, level, text, startedAtSec, active }`, or `null` when cleared. **The event engine writes these.** The partner runner writes `alerts.partner-separation` in the same shape, only when the separation level changes | event engine, partner runner | #22, #70 |
| `crew` | `[{ id, name, color, x, z, rangeM, bearingDeg, oxygenPct, oxygenSec, batteryPct, marginSec, status, link, lastContactSec, separation, separationLimitM, separationCautionM }]`. `crew[0]` is the partner: range and bearing from the player, its suit from the same model as `suit.*`, and `separation` (`'nominal'`, `'caution'` or `'warning'`) against the limit. `link` is the radio line of sight between the two suits; while it is `false` every field holds the last values received at `lastContactSec` (mission seconds). Empty without a partner, or until the radio first reaches it | partner runner (`src/sim/partnerRunner.js`), online play | #39, #52, #70 |
| `eva.phase`, `startedAtSec`, `endedAtSec` | `'ready'` until the astronaut first walks outside the habitat arrival area, `'active'` during the EVA, `'ended'` when they re-enter it. Start and end are mission elapsed seconds; the mission clock is paused at the end | EVA runner (`src/state/eva.js`) | #43 |
| `eva.distanceM`, `minOxygenMarginSec`, `minBatteryPct` | horizontal distance walked in Walk mode while the mission runs; lowest `suit.marginSec` (s) and `suit.batteryPct` (%) seen. The minima stay `null` until a finite reading exists | EVA runner | #43 |
| `eva.events`, `routeChanges` | event start/end entries `{ type, eventId, label, atSec }`, and real route changes `{ atSec, kind: 'initial' \| 'replan' \| 'offroute' \| 'slope' \| 'event', reason, before, after }` with `before`/`after` route snapshots. `atSec` is mission time | EVA runner; the event runner feeds `eva.events` through the event engine log | #43 |
| `eva.summary` | `null` until `phase` is `'ended'`, then a deeply frozen snapshot: `startedAtSec`, `endedAtSec`, `elapsedOutsideSec`, `distanceM`, both minima, `events`, `routeChanges`, `sampleCount`, `photos`, `samples` and the current `doseUgy`/`doseRateUgyH` | EVA runner | #43 |
| `sampling.count`, `samples` | samples secured in a container this EVA, and `[{ id, kind: 'rock' \| 'ground', site, x, z, into: 'pouch' \| 'case', photo, texture, sealed, atSec }]` (`site` is `'Cheyava Falls'`, `'Bright Angel'` or `null`) | sampling bridge | #36 |
| `sampling.checklist` | `{ photo, texture, sample, seal }` of the sample in progress, plus `photoAt`, `siteAt` and `sampleId` for the rules in [Sampling](#sampling-36) | sampling bridge | #36 |
| `sampling.photos` | helmet camera photos taken this EVA | sampling bridge | #36 |
| `sampling.status` | the engine's `getSampling()`: `{ phase, holding, target, caseState, caseInReach, actions }`, or `null` before the engine reports | sampling bridge, 5 times per second when it changes | #36 |
| `view.layer` | 0 none, 1 slope hazard, 2 elevation, 3 rock abundance, 4 outcrop | Plan mode, wrist screen | #14, #67 |
| `view.sky` | `'clear_day'`, `'dust_storm'`, `'late_afternoon'`, `'night'`. The default is `'late_afternoon'` (#59). While the mission clock runs the Sun and the sky follow its time instead (#73); then `'dust_storm'` only asks for the storm look | events, the clock's start preset | #24, #59, #73 |
| `view.skyBlend` | 0 to 1, blend from the current `view.sky` preset to `dust_storm` as the storm opacity rises | events | #24 |
| `view.slopeGrid` | `true` shows the slope grid on the ground in Walk mode; the G key toggles it (`src/state/slopeGrid.js`) | interface | #50 |
| `settings.look` | `{ sensitivity, invertY }`: mouse-look speed as a multiple of the base rate (0.5-2, step 0.1, default 1; it multiplies both pointer-locked and drag look) and inverted vertical look (default off, flips only pitch). A player preference saved in `localStorage` under `marswalk.look`, not mission state: `resetStore()` keeps it and a new page load re-reads it (a blocked or corrupt entry leaves the defaults). Written by the pause menu through `setLookSettings()` | interface | #102 |
| `sources['<path>']` | `{ tag: 'DATA' \| 'DERIVED' \| 'SIM', source, label? }` for any value above. Every path also needs an entry in `src/data/provenance.js`, which adds the mission, instrument, site, sol or date and link | whoever writes the value | #62 |

`null` means "not known yet". The interface should show a dash, not 0.

### Adapter

`storeAdapter` implements the contract in [EVENT_ENGINE.md](EVENT_ENGINE.md), so it can be passed straight to `createEventEngine({ store: storeAdapter, ... })`.

| Method | Behaviour |
|---|---|
| `get(path)` | Reads a dot path such as `suit.oxygenSec`. Returns `undefined` when it is missing. |
| `set(path, value)` | Writes a dot path and creates intermediate objects. Arrays stay arrays (`crew.0.x`). Writes are immutable, so subscribers update. |
| `snapshot()` | A detached deep copy of the whole state. |

Paths containing `__proto__`, `constructor`, `prototype` or an empty segment throw an error.

### Mock values

Open the app with `?mock=1` to fill the store with plausible values from `src/state/mock.js`, for example oxygen 78 %, tau 0.62 and the five `route.json` waypoints as a straight route. Every one is tagged `SIM` in `sources`. Use this to build the HUD before the simulation exists. The real numbers come from the hazard table (#18) and the simulation issues.

## The engine API

```js
const engine = createEngine(container, { assetBase, mode, onStatus, onError, onLockChange, inputEnabled });
await engine.ready;
```

| Call | Behaviour |
|---|---|
| `setMode('plan' \| 'walk')` | Switches the camera. Can be called before `ready`; it is applied when ready. Plan cancels any pending pointer-lock request and releases the lock, so a late Walk grant cannot capture the mouse in the map. |
| `setInputEnabled(enabled)` | Gates walk/orbit input. Disabling clears every held key and stops orbit controls, so WASD, arrows and mouse look cannot act behind a menu. It also drops a touch stick in progress and forgets gamepad button state, so releasing a menu cannot resume a deflected stick or repeat a held button. Can be called before `ready`. |
| `subscribeTouch(listener)` | Follows the Walk touch stick (#103) for the on-screen overlay: `{ visible, active, knobX, knobY, jog }`. The listener is called immediately with the current state and then on touch events only, never per frame. Returns an unsubscribe function. |
| `subscribeGamepad(listener)` | Reports whether a gamepad has been used (#103): `{ used, connected }`. Called immediately on subscribe, so a hint mounted after the first press still appears, and again on first use. Returns an unsubscribe function. |
| `requestPointerLock()` | Asks the browser to lock the pointer on the engine canvas. Supports the legacy void form and the promise form; resolves `true` only after a real grant and `false` on refusal, an unsupported browser, the 3 s watchdog, release or dispose. A browser promise that resolves while `document.pointerLockElement` is still not the canvas is not success: the change event settles the request. Concurrent calls share one request. A call before `ready` is queued until the canvas exists. |
| `releasePointerLock()` | Releases the lock now. A queued pre-ready request resolves `false`. |
| `isPointerLocked()` | `true` when `document.pointerLockElement` is the engine canvas. |
| `setQuality('auto' \| 'high' \| 'low')` | Quality choice. `auto` runs the real `detectTier` again and re-enables the existing three-slow-seconds downgrade; `high`/`low` force a tier and stop the automatic downgrade. Changes are serialised and coalesced, so rapid choices cannot interleave terrain rebuilds. Resolves with `{ tier, auto, pending, error, gpu }`; a failed texture download keeps the current scene and returns the error in `error`. |
| `getQuality()` | The same quality state without using the development-only `window.__marswalk` hook. |
| `resetSession()` | Returns the scene to the EVA spawn: input off, lock released, Walk mode, camera at `START`, route/shelter/waypoints cleared. The store, clock and simulation restart are done by `src/state/evaSession.js`. Quality is deliberately kept. Returns `false` before ready and is applied at the end of boot. |
| `setLayer(n)` | Data layer on the terrain: 0 none, 1 slope hazard, 2 elevation, 3 rock abundance, 4 outcrop. The wrist screen follows. |
| `setSky(name)` | Atmosphere preset: `clear_day`, `dust_storm`, `late_afternoon`, `night`. While `setSkyTime` drives the sky, only `dust_storm` (storm look on) or another preset (off) has an effect. |
| `setSkyTime(hours)` | Sky from the mission clock (`src/engine/missionSky.js`, #73). `hours` is the local solar time, 0 to 24. The Sun moves (`src/sim/sunPosition.js`: latitude 18.4975 N, one fixed SIM declination of 11 deg so 17:45 matches the late-afternoon preset), the sky, haze, exposure and Sun colour blend between the presets by its height (`skyByTime.js`: `night` at -12 deg and below, `late_afternoon` at 7, `clear_day` at 55 and above), and the sky's look blends toward `dust_storm` as the dust level rises (the brightness stays with `setDust`). The terrain shadow map is rebuilt over several frames after every 0.25 deg of Sun movement, about once a minute at time scale 1. `null` goes back to the last `setSky` preset. |
| `getSun()` | `{ hours, elevationDeg, azimuthDeg }` while `setSkyTime` drives the sky, else `null`. |
| `setSlopeGrid(on)` | Slope grid (`src/engine/slopeGrid.js`, #50): thin lines every 2 m on the ground around the player in Walk mode, coloured by slope with the slope layer's legend (the route planner's limits). |
| `setLookSettings({ sensitivity, invertY })` | Mouse look (`src/engine/lookSettings.js`, #102): the multiplier 0.5-2 applied to both locked and drag look, and `invertY` flips only the vertical axis. Values are clamped (never throws); a call before `ready` is applied at the end of boot; `resetSession()` keeps them. |
| `setHabitatScreens(data)` | The habitat's five wall screens and planning table (`src/engine/habitatScreens.js`, #47) draw from `data`, built from the store by `habitatScreenData()` in `src/state/habitatScreens.js` and sent at most 4 times per second by `connectHabitatScreens(engine)`: cabin (fixed values, tagged SIM), EVA team (suit and `crew[0]`), weather and alerts (`environment`, `alerts`), and the route, visited waypoints, player and shelter on the table. Missing values show as a dash. |
| `setDust(level)` | Storm dust (`src/engine/dust.js`, #27), 0 = clear (the scene as before) to 1 = global storm: thicker, drifting haze on everything (visibility about 1 km), dimmer and redder light with fading shadows, and faint wisps near the helmet. Eased, so a storm builds up. Works on top of any sky preset or blend. |
| `setRoute(path)` | Draws `[[x, z], ...]` as the route glow (`src/engine/routeGlow.js`, #29): a dotted line on the ground near the player, a thin outlined line further away, and chevrons floating ahead in Walk mode. The part already walked turns grey and follows the player, so walking back lights the route again. `null` clears it. |
| `setShelter(shelter)` | Highlights a shelter in green (`src/engine/shelterHighlight.js`, #30): a safe zone on the ground, a column of light visible from far away and in the dust storm, and a label with its distance from the player. Takes an entry of `shelters.json`; `null` fades it out. |
| `setWaypoints(list)` | Numbered sprites for `[{ x, z, name, active? }]`, shown in Plan mode; `null` clears them. |
| `setSlopeZone(cells)` | Red ground patch for `[{ x, z, slopeDeg }]` cells over the slope limit (#69); `null` clears it. |
| `setRadioShadow(cells)` | Blue-grey ground cells where the radio link to the mast is blocked (#74); `null` clears it. |
| `getHabitatMast()` | World position `{ x, y, z }` of the habitat comms mast, for the radio link. |
| `getPlanScale()` | Metres of ground per CSS pixel in Plan mode, for the scale bar. `null` when the engine is not ready or not in Plan mode. |
| `heightAt(x, z)` | Terrain height in metres, from the source grid: the HiRISE tile, or the CTX ring outside it. Relative to the lowest point of the tile; add `terrain.json` `base_elev_m` for MOLA elevation. |
| `slopeAt(x, z)` | Slope in degrees, central difference over 2 m. |
| `lineOfSight(a, b)` | `a`, `b` are `{ x, y?, z }`. A point without `y` is taken at eye height (ground + 1.7 m). Returns `{ clear, blockedAt }` and samples every 2 m. |
| `project(x, z, y?)` | World point to canvas CSS pixels: `{ x, y, visible, inFront }`. `y` defaults to ground + 2.2 m. Used by the next-waypoint HUD marker (#61). |
| `setPartnerSource(source \| null)` | Who drives the partner astronaut (see [PARTNER.md](PARTNER.md)). The scripted partner is the default; `null` hides it. |
| `partnerCommand(name)` | Scripted actions of the current source: `'toggleCase'`, `'visitHabitat'`. Returns `false` if the source ignores it. |
| `getPartner()` | `{ id, color, state }`: the current source's id and colour and the PartnerState it returned on the last frame (`state` is `null` before the first frame). `null` without a source. Read by the partner runner (#70). |
| `getSampling()` | `{ phase, holding, target, caseState, caseInReach, actions }` (see [Sampling](#sampling-36)); `null` before `ready`. Runs one aim test, so poll it, never per frame. |
| `onSampling(listener)` | Sampling events `{ type: 'photo' \| 'collect' \| 'texture' \| 'secured' \| 'sealed' \| 'input', ... }`. Returns an unsubscribe function. Available once ready. |
| `clearPrints()` | Removes every boot print (`src/engine/bootPrints.js`, #46). The bridge calls it when `mission.startedAtMs` changes, the start of a new EVA. |
| `getPlayer()` | `{ x, z, headingDeg, mode }`. This is the true position, so only the bridge reads it: it writes `navigation.trueX` / `trueZ` and the drift model turns them into the estimate the interface reads (`navigation.x` / `z`, #42). |
| `dispose()` | Stops everything and frees the GPU. |

Options: `inputEnabled: false` starts with gameplay input gated off (the app shell passes this for the start
screen). `onLockChange(locked)` fires only when the pointer lock actually changes, never per frame. The app
uses it to pause as soon as the lock is lost in Walk. `onGamepadAction(action)` reports a standard-gamepad press
(`mode`, `layer-prev`, `layer-next`) once per press; App routes it through the same handlers as the keyboard and
the mode buttons (#103). Touch and gamepad state is read through `subscribeTouch` and `subscribeGamepad`.

- **When they work:** the terrain queries throw before `ready`; `setSky`, `setRoute`, `setDust`, `setInputEnabled`, the
  pointer-lock request/quality calls and `resetSession` before `ready` are stored and applied when ready.
- **Same numbers as the simulation:** the queries are plain functions in `src/engine/queries.js`, with no three.js, and they agree with `src/sim/costGrid.js` to within 1 cm. Tests are in `src/engine/queries.test.js`.
- **Tests without a browser:** the input gate (`src/engine/input.js`), pointer-lock controller
  (`src/engine/pointerLock.js`), quality controller (`src/engine/quality.js`) and the EVA session order
  (`src/state/evaSession.js`, with the real store and a fake engine) are plain JavaScript with minimal
  DOM/EventTarget fakes. They do not test the three.js canvas itself.

### Start, pause and restart (#64)

`src/state/evaSession.js` owns the order of the real contracts. It does not add a second clock.

| Step | Real calls |
|---|---|
| App opens | `EngineView` starts the simulation, then `pauseMission()`. The start screen is a real pause: no mission seconds, no suit step and no player input advance behind it. |
| Start / Resume in Walk | `engine.requestPointerLock()` first. Only after a real `true` grant: `engine.setInputEnabled(true)` and `resumeMission()`. A refusal keeps the pause and shows a retry message. |
| Resume in Plan | `engine.setInputEnabled(true)` and `resumeMission()`; Plan uses orbit controls and needs no lock. |
| Esc in the Walk pause menu | No lock request. Esc is a key press, not a user activation for pointer lock, so it cannot capture the mouse: the menu stays paused, cancels any request already in flight, focuses Resume and shows `Press Enter or click Resume to capture the mouse.` Esc inside Controls/Restart returns to the menu; the menu itself keeps the pause. |
| Esc in the Plan pause menu | Resumes like Resume, because Plan needs no lock. |
| Esc, H, lock loss | `engine.setInputEnabled(false)`, `pauseMission()`, `engine.releasePointerLock()`. The #59 clock anchors elapsed time at the exact pause write. |
| Mode change | Every change ends a pending resume. Opening Plan releases the lock and cancels a pending Walk request; if Plan is opened while a Walk request is still pending, its answer is ignored and a late grant released. A superseded request never pauses or resumes the mission. |
| Restart | `stopSimulation()` → `clearClockSession(defaultSessionStorage())` → `resetStore()` → `engine.resetSession()` → `startSimulation()` → `pauseMission()`. The synchronous pause after start leaves the new clock at elapsed 0. Clearing before the new clock starts is what stops an old persisted EVA reappearing after a remount; the quality tier survives because the engine is not recreated. |

`resumeEva()` takes an optional `isCurrent` check. It runs after the browser answers the lock request and
before any input or clock write; when the interface paused, changed mode or restarted in the meantime, a
late grant is released and the attempt is reported as `{ ok: false, stale: true, message: null }` instead
of resuming behind the menu.

Menus are native `<dialog>` modals (`src/components/Modal.jsx`): `showModal()` makes the scene and top bar
inert, traps Tab and Shift+Tab, and returns focus when closed. The top bar's mode switch is repeated inside
the pause menu so Plan remains reachable while paused. `Sources` is disabled with a visible note until #63.

No new store fields were added. Quality belongs to the engine; pause is the existing `mission.paused` path.

## Simulation runners

`startSimulation(engine)` in `src/state/simulation.js` starts the modules that write the store once the engine is ready. Today that is the mission clock below, the suit model (`src/sim/suitModel.js`, `src/sim/suitRunner.js`, #19) and the per-leg costs (`src/sim/legCosts.js`, #41). The suit runner ticks 4 times per second, reads `navigation` and `route.path`, uses `engine.heightAt` for the gradient, and writes `suit`. All its constants come from `public/data/hazards.json`. The per-leg costs recompute `route.legs` and `route.totals` whenever `route.path` or `route.waypoints` changes, with the same `walkCost` function the walkback uses. The partner runner (`src/sim/partnerRunner.js`, #70) ticks 4 times per second: it reads the partner only through `engine.getPartner()`, steps the partner's suit with the suit model from the partner's own measured speed and gradient, writes `crew[0]`, and applies the separation rule of `src/sim/partnerStatus.js` (100 m limit, caution from 80 m, 5 m hysteresis, all SIM). It checks the radio line of sight between the suits with `engine.lineOfSight` through `radioLinkState` (`src/sim/radio.js`); without it, `crew[0]` keeps the last position and suit values received. Nothing starts with `?mock=1`, so mock values stay put; the clock is not started and writes no session.

The EVA starts at the first switch to Walk (#166). The app opens in Plan mode, where only the clock (for the top bar) and the per-leg costs run. The engine has already put the player just outside the airlock, facing WP1 (`src/engine/spawn.js`), with the partner beside them. On the first Walk, `startSimulation` starts a new clock session (EVA 0:00; the new `mission.startedAtMs` clears the boot prints), takes a terrain fix, marks the first waypoint (HAB) as visited so the next target is WP1, and starts the suit (full O2 and battery), waypoint, off-route, event and EVA statistics (#43) runners. Later switches between Plan and Walk change neither the position nor the EVA. Plan mode plans the route from the HAB airlock entry in `public/data/shelters.json` (`src/plan/routeStart.js`), so the player starts on the route and the walkback starts near zero. A reload starts a new EVA at the airlock: the player position is not persisted, so the restored clock session only shows in Plan until the first Walk.

### EVA statistics and debrief (#43)

The EVA runner starts with the other EVA runners on the first Walk, once `public/data/shelters.json` has loaded, because its HAB entry is the **position at the foot of the airlock steps** (535.1, 574.1), not the `HAB` route waypoint at 520, 600. It uses the normal 5 m arrival radius. If the shelter file fails, the runner does not start and the suit model keeps its existing `DEFAULT_HABITAT` fallback. The simulation's stop callback stops the runner, and a late shelter response never starts one after `stop()`. The player starts inside the HAB radius (the airlock spawn), so the phase stays `ready` until they walk out.

| Phase | When | What the runner does |
|---|---|---|
| `ready` | before the first Walk tick outside the HAB; includes the start screen, Plan mode, a paused mission and being inside the HAB | nothing: no distance, no minima |
| `active` | first Walk tick outside the 5 m HAB radius with the mission running | adds horizontal distance between successive position readings; records finite `suit.marginSec` and `suit.batteryPct` minima; records event and route history |
| `ended` | a Walk tick inside the HAB radius while active and not paused | counts the last step, pauses the mission clock through the `mission.paused` write (#59 anchors the final elapsed value), then stores a deeply frozen `eva.summary` |

Distance is suspended while paused and in Plan mode, and the position baseline is cleared, so a mode switch, resume or teleport cannot add a jump. Event starts and ends come from the event engine's `log` callback, so their `atSec` is mission time and pause/time-scale aware; `endEventRoute` still runs first. A route change is recorded only when the path **content** changes: `nextIndex`, `visited`, `legs`, `totals` and cost recalculations, or a new array with the same points, never add history. The summary's samples are the current `sampling.samples`, and its dose is the current `environment.doseUgy`/`doseRateUgyH`; the runner does not integrate radiation itself.

Deliberate limits: no persistence between sessions, no extra debrief warnings, and no event/route log written before the EVA starts: route changes made in Plan before the first Walk are not history, and the route planned at that moment is recorded as the `initial` one. The summary is a snapshot; later store changes are not reflected.

### Debrief screen (#43)

`src/debrief/DebriefScreen.jsx` shows the frozen snapshot. App subscribes to `eva.summary`; when it appears, the app closes the real input path with `pauseEva` (engine input off, pointer lock released), cancels any pending resume or Walk lock through the existing sequence refs, and keeps the screen in the ended state behind one native modal. The start screen and pause menu are not rendered while the summary exists, and `handleResume` refuses a final EVA, so Esc, H, the mode switch and the interface shortcuts cannot reopen the mission behind the debrief. Esc on the debrief is inert: the only ways out are **Restart EVA** and **Sources**.

The screen reads that snapshot only: time outside, horizontal distance, sample count with the real sample kinds and sites, dose in µGy (a dash when the store had no reading), the lowest oxygen margin in signed minutes (negatives included) and the lowest battery per cent. Below them is one chronological mission log with every event start and end (`label` and `eventId`) and every route change (mission time, reason, kind and the before/after route distance when known). Two notes explain that dose is the environment runner's total for the EVA copied at the end, not integrated by this screen, and that the battery is the suit model's remaining charge, not a measurement of the physical pack. Provenance entries were added for `eva.distanceM`, `eva.elapsedOutsideSec` and `eva.sampleCount`; the other metrics reuse `suit.marginSec`, `suit.batteryPct` and `environment.doseUgy`.

Restart uses the same `handleRestartConfirm` as the pause menu and therefore the same `restartEva` (#64): it stops the simulation, clears the persisted clock session, resets the store, resets the engine, starts one new paused simulation and returns to the start screen with no old statistics. The minimap progress tracker is cleared explicitly with `setPath(null)`, because it normally only resets when the route content changes. Sources uses the real `openSources`; `SourcesRoot` is mounted after the debrief, so its dialog is created above it in the top layer, and closing it returns focus to the debrief.

In development, `window.__missionStore` is the store, for the browser console: `__missionStore.getState().suit`. Production builds do not have it.

### Mission clock (#59)

`src/sim/missionClock.js` is plain JavaScript with no React, no three.js and no store import. Every reading is a function of a timestamp, never a sum of frame or tick times:

```text
elapsedSec = anchorElapsedSec + (paused ? 0 : max(0, nowMs - anchorMs) / 1000) * timeScale
```

Pause, resume and a scale change move `anchorMs` to that exact instant and freeze the elapsed value there, so irregular ticks, a suspended tab or a reload cannot drift. `startedAtMs` stays at the first start. Mission time scale multiplies both elapsed time and LMST, matching section 9.5 of [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

The formula uses the internal/persisted session's elapsed baseline. The store's `mission.elapsedSec` is the computed result at its last publication, not that baseline; do not add the anchor delta to the store reading again. Manual browser results and limitations are in [ISSUE_59_VALIDATION.md](ISSUE_59_VALIDATION.md).

| Item | Value |
|---|---|
| Sol length | 88,775 Earth seconds, or 86,400 Mars clock seconds. At scale 1, 88,775 elapsed seconds advance LMST by 24 h and add one sol |
| Site | 77.3053 E. LMST advances at `86400 / 88775` Mars seconds per elapsed second |
| Demo defaults | sol 1210, local LMST `17:45`, scale 1, sky `late_afternoon`. Tagged `SIM`: a plausible EVA, not a historical measurement or a precise ephemeris |
| Alternate start skies | `clear_day` 14:00, `dust_storm` 14:00, `late_afternoon` 17:45, `night` 22:00. Coarse demo values; an explicit `initialLmst` overrides them |
| Persistence | one sessionStorage key, `marswalk.missionClock.v1`. A running session includes the time the page was absent; a paused session does not. A denied, unavailable or malformed store is ignored |

The configuration takes the **local** LMST at the site, so no longitude term is added to it. The exported helpers are for a caller that starts from Mars24 prime-meridian mean time, where `LMST = MT + east longitude / 15` ([Mars24 notes](https://www.giss.nasa.gov/tools/mars24/help/notes.html)):

```js
longitudeOffsetHours(77.3053);                    // +5.1537 h, east positive
localMeanSolarTimeHours(6, 77.3053);              // 11.1537 h
primeMeridianMeanTimeHours(11.1537, 77.3053);     // 6 h
```

API and store actions:

```js
const clock = startMissionClock({ store: useMissionStore, config: { sky: 'late_afternoon' } });
clock.pause(); clock.resume(); clock.getSession();
clock.setTimeScale(60);          // keeps elapsed time continuous and leaves a paused session paused
clock.stop();

pauseMission(); resumeMission(); // src/state/store.js, or a direct mission.paused write
setMissionTimeScale(60);         // or a direct mission.timeScale write
```

The runner subscribes to `mission.paused` and `mission.timeScale`, so the suit runner's existing check of `mission.paused` and any direct `storeAdapter.set('mission.paused', true)` are honoured at the exact instant and are not overwritten by the clock. `view.sky` is set once at start from the chosen/restored preset and never changed by later ticks; the Sun follows the clock time through the engine bridge instead (#73). The clock tags `mission.startedAtMs`, the initial/preset fields and `timeScale` as `SIM` (demo epoch and configuration, not a historical measurement or precise ephemeris); `elapsedSec`, `anchorMs`, `sol` and `lmst` are `DERIVED`.

**Limitations.** The suit runner still keeps its own wall clock for consumables and they do not persist across reload. Changing the mission scale affects mission time only in this issue. There are no visual clock controls yet; use the store actions or a console. No online clock offset or no-pause rule is part of #59.

## Sampling (#36)

`src/engine/sampling.js` connects the ready arm clips, the scoop and the partner's case to the player in Walk mode. The rules are plain functions in `src/engine/samplingRules.js`; the checklist and the count are in `src/state/sampling.js`, which `EngineView` connects with `connectSampling(engine)`. The HUD shows them with `src/hud/SamplingPanel.jsx`.

| Input | When | What happens |
|---|---|---|
| Click | a rock or the ground under the crosshair is within `SAMPLE_REACH_M` (1.5 m from the feet) and the scoop is free | `collect_rock` for Cheyava Falls, the Bright Angel outcrop or a loose rock of at least 0.35 m (the scoop shows chips), `collect_ground` otherwise (soil). The player steps to the clip's stand point (0.70 m from the rock face, 0.47 m short of the soil) and is held there until the clip ends. Ignored while a clip plays |
| P | a rock or the ground is in view within 8 m | a helmet camera photo |
| E | holding a sample | `stow_sample`: into the sample bag; the scoop goes back on the belt |
| F | holding a sample, or with the scoop free | the hand-over of `props.json`: asks the partner to set the case down; once it is down within 2 m, `pour_sample` from 0.85 m on the side away from the partner; then the partner closes the lid and takes the case back by itself |

| Checklist item | Ticks when |
|---|---|
| Photo | P is pressed with the sample site in view, before or after the scoop, within 3 m of where the sample is taken. A photo of another place does not count |
| Texture | the scoop comes up with material the player can see (the clip's content time in `props.js`) |
| Sample | the sample is in a container: in the bag (`stow_sample` at 1.1 s) or landed in the open case. This is also when `sampling.count` rises |
| Seal | the container is closed: the stow clip ended, or the partner took the case back with the lid closed |

A sealed checklist stays ticked until the next photo or scoop starts a new one. Out of scope here: the dust puff and the mark in the soil (#50).

## The helmet HUD

`src/hud/Hud.jsx` (#20) reads only the store and shows in Walk mode once the scene is ready.
- **Values shown:** suit (`suit.*`), mission clock (`mission.elapsedSec`, `lmst`), heading and slope (`navigation.*`), the next waypoint (`route.waypoints[route.nextIndex]`, with range, bearing and an ETA at 1 m/s), the environment (`environment.*`) and the most severe active alert (`alerts`).
- **Navigation (#21, #42):** a line under the environment strip says how the position was estimated, its error and its age, for example `NAV · terrain fix · ±0.4 m · 3 min ago` (`formatNavLine` in `src/hud/format.js`). Past `NAV_FIX_LIMIT_M` (5 m, SIM) it turns amber and asks the astronaut to stop for a terrain fix. The Plan map shows the same estimate as a marker with an uncertainty ring of radius `navigation.errorM`, placed with `project()` (`src/plan/PlanPositionMarker.jsx`). The drawing is in `src/hud/positionMarker.js`, so the minimap (#60) reuses it with its own world-to-screen function.
- **The drift model (#42):** `src/sim/navigationDrift.js` writes the estimate (`navigation.x` / `z`, `errorM`, `fixMode`, `lastFixSec`) four times per second from the bridge's true position. Dead reckoning grows the error at `DRIFT_RATE_PER_M` (2 %, SIM) of the distance walked; standing still for `FIX_STILL_SEC` (5 s) with the horizon visible in clear air and daylight takes a terrain fix that snaps the estimate under 1 m; radio ranging to the habitat mast bounds the error at `RANGING_BOUND_M` (2 m, SIM) while the true position has line of sight to it, and `fixMode` then reads `radio ranging`. Simulation logic (suit effort, waypoint arrival, off-route replans, event positions, EVA distance, the slope warning) reads the true position; the interface reads only the estimate.
- **Partner (#70):** a chip under the suit panel shows the partner's suit status dot, range and a bearing arrow relative to the heading (`src/hud/PartnerPanel.jsx`). T opens the detail with O2, battery and a separation bar marked at the caution distance and the limit. The detail opens by itself while the separation or the partner's suit is in caution or warning. The minimap draws the partner as a dot in the suit colour (`src/hud/minimapPartner.js`); without radio line of sight the chip and the dot grey out and read LAST, at the last known position (plan section 4.2).
- **Unsourced values:** an environment value without an entry in `sources` shows as a dash.
- **Source tags:** each value shows its tag through the shared `SourceTag` (`src/components/SourceTag.jsx`, #62), in its tag-only, non-interactive form because the HUD never takes the pointer. The tag appears once the value's writer has put it in `sources`.

### The minimap (#60)

`src/hud/Minimap.jsx` adds the circular HUD map at the right, about 27.5 vh across with its top at 23.5 vh and its right edge at 7.8 vw. The legend sits between the circle and the environment strip at 54 vh, so they do not overlap. The map is a canvas: React mounts it with the HUD and never renders it per frame.

- **Centre and orientation:** the map is centred on `navigation.x` / `navigation.z` and is heading-up: `navigation.headingDeg` (degrees clockwise from north) points to the top, and the N/E/S/W ring rotates around the frame. With no fix the canvas says `NO FIX`; with an unknown heading it draws north-up and labels the fallback `N-UP` instead of pretending the heading is 0.
- **Background:** `public/marswalk/assets/ortho_lo.jpg` from `BASE_URL + 'marswalk/assets/ortho_lo.jpg'`. The photo covers the HiRISE tile `1422.5 m x 1500 m` as a rectangle with the same metres per pixel on x and z; it is not forced into a square. A failed load leaves the dark map with no substitute photo.
- **Visible range and scale:** a fixed 400 m radius (800 m across), so the map is a local tactical view rather than the Plan-mode map (#14). The scale bar uses a readable 1-2-5 value and updates with the circle size.
- **Route:** reads `route.path` only. It never builds a substitute route. The walked and remaining parts use different styles. Local progress follows the same rule as `src/engine/routeGlow.js`: resample every metre, search from 30 m behind to 60 m ahead of the current progress, accept at most 12 m of lateral distance, allow walking backwards, and reset when the route content changes. Progress means ground actually walked: a **new route starts at 0**, even when the astronaut is already far along it, so a spawn away from the route start shows the whole route as remaining until it is walked from the beginning. Walking back along a route that doubles back lowers the progress: that is the allowed backtracking rule, not an error. The 30 m back / 60 m ahead window avoids jumping to a distant pass of a self-crossing route, but it cannot separate a branch that comes back within the window; a position nearer such a branch is counted on it. There is **no progress field in the store**; `src/hud/minimapRoute.js` implements the tracker.
- **Tracker lifetime:** the tracker is created once by `App` (one instance per app session, `useState` lazy initialiser) and passed through `Hud` to `Minimap`. The HUD is unmounted in Plan mode, so a tracker created inside the minimap effect would lose the walked distance on every Walk -> Plan -> Walk round trip. The minimap calls `setPath` on mount and whenever `route.path` changes; `setPath` compares content, so remounting with the same points keeps the progress and only new route content resets it to 0. There is no module-level singleton, so separate app sessions or renderers cannot share progress. The effect still owns and cleans up its store subscription, `fetch`, `ResizeObserver`, window listener, image handlers and pending timer.
- **Markers:** numbered `route.waypoints` (the next one highlighted), the habitat from the `type: 'habitat'` entry of `public/data/shelters.json` (`HAB` is its airlock, 535.1, 574.1, distinct from the HAB route waypoint at 520, 600), the natural refuges (`SP1`-`SP4`), and active `hazards.zones` as circles of `radiusM`. A waypoint at the centre is drawn like any other: only #21 owns a player marker.
- **Not here:** no player marker, no uncertainty ring (#21), no Plan-mode map (#14), no crew markers, no pan or zoom.
- **Redraw budget:** store updates, the photo load, the shelter load, the canvas `ResizeObserver` and the window resize listener request a frame from `src/hud/minimapRedraw.js`, which paints at most **10 times per second**, with the first request immediate and later ones coalesced. `devicePixelRatio` is read on each paint and the canvas backing store is resized there; there is no separate DPR listener. The effect cleans up the store subscription, `fetch`, `ResizeObserver`, window listener, image handlers and pending timer, so React StrictMode double mounting cannot leave a second painter.
- **Canvas size:** the logical size and backing store come from the canvas's own CSS box (`clientWidth`), not from the surrounding wrapper, because the circular frame has a 1 px border: at 1440 high the wrapper is 396 px while the canvas is 394 px.
- **DEV metrics:** in development the canvas exposes `data-draw-count`, `data-last-draw-at-ms`, `data-last-draw-duration-ms`, `data-last-draw-reason`, `data-redraw-limit`, and the last route progress as `data-walked-m`, `data-remaining-m` and `data-off-route` (empty when there is no route). Use them to check the budget and the progress in the browser; production builds do not set them.
- **Data loading:** `shelters.json` is fetched from `BASE_URL + 'data/shelters.json'`; a failed or malformed load leaves no refuge markers. No mock or simulated hazard zone is invented.

Tests: `src/hud/minimapGeometry.test.js` (tile UV with the five real waypoints, tile size against `terrain.json`, heading-up and wrap, centring, scale, habitat vs waypoint, active-zone filter), `src/hud/minimapRoute.test.js` (real route, advance/backtrack/off-route/reset/self-cross, tracker reuse across a HUD remount, no seeding from a position far along a new route, close-branch ambiguity) and `src/hud/minimapRedraw.test.js` (bursts, coalescing, 10 per second, cleanup).

## The bridge

`connectEngine(engine)` in `src/state/engineBridge.js` is called by `EngineView` once the engine is ready. It returns a disconnect function.

- **Store to engine:** `mode`, `view.layer`, `view.sky`, `view.skyBlend`, `view.slopeGrid`, `settings.look`, the mission time (`mission.initialLmst` plus `elapsedSec`, or `lmst`, as `setSkyTime` hours, `src/state/skyTime.js`), `route.path`, `route.shelter` and `environment.dustOpacity` (as the dust level), each when it changes.
- **Engine to store:** `navigation.trueX`, `trueZ` and `headingDeg` every 200 ms, skipped while the player stands still. This is the TRUE position (#42): the navigation drift runner (`src/sim/navigationDrift.js`) reads it and writes the estimate into `navigation.x` / `z`. Only simulation logic reads `trueX` / `trueZ`; the interface reads the estimate.

## Unexpected finds (#71)

Plan section 3.4, scenario 3. In Walk, holding Q for 2 s while the centre of the view is on ground within 50 m drops a find marker there. The right arm takes the `point` pose of the first-person arms while Q is down. A card prices the detour, Y adds the find to the route and N or Esc dismisses it.

- **Store:** `finds` holds `list` (at most 3: one undecided plus accepted finds not reached yet), `seq` for the M01, M02 labels, `activeId` (the find the card shows) and `routeKey`. Actions live in `src/state/finds.js`.
- **Price:** `priceDetour(grid, request)` in `src/sim/findDetour.js`, run in the planner worker (`{ type: 'detour' }`, `client.detour(request)`). It plans the find into each of the two cheapest insertion points of the remaining route, keeps the cheaper one and returns the extra time, O2 and distance, the walkback margin before and after, and `verdict` `go`, `no-go` or `unknown`. No-go means the find is on ground over 20°, no path reaches it, or the margin after reaches the 0 min warning line.
- **Accept:** the find becomes an ordinary waypoint (`{ name: 'M01 · find', x, z, find: 'M01' }`) inserted at the priced index, and the planner re-plans the whole route from the habitat through `applyPlannedRoute`. `nextIndex` and `visited` stay as they were. `finds.routeKey` tells the Plan planner that these waypoints already have a route, so opening Plan does not start the walk over.
- **Engine:** `engine.setFinds(list)` draws the markers in Walk and Plan, `engine.aimGround(maxM)` returns where the view meets the terrain, and `engine.setPointing(on)` raises or lowers the arm. All three live in `src/engine/finds.js`.
