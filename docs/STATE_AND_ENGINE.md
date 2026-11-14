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

```js
import { useMissionStore, storeAdapter, setMode } from './state/store.js';

const oxygen = useMissionStore((s) => s.suit.oxygenPct);   // re-renders only when this value changes
storeAdapter.set('environment.dustOpacity', 0.4);           // anyone, including the simulation
setMode('plan');
```

### Snapshot

| Field | Unit and meaning | Written by | Issue |
|---|---|---|---|
| `mode` | `'walk'` or `'plan'` | interface (mode switch) | #5 |
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
| `suit.walkbackSec`, `walkbackO2G` | time and O2 (with the 20 % pad) to walk back to the habitat entry in `public/data/shelters.json` along the route | suit model | #19, #129 |
| `suit.marginSec` | O2 time left minus walkback minus the 30 min reserve | suit model | #19 |
| `suit.status` | `'nominal'`, `'caution'` (margin under 15 min) or `'warning'` (margin at or under 0) | suit model | #19, used by #26 |
| `navigation.x`, `z`, `headingDeg` | position estimate; heading clockwise from north | engine bridge now; navigation model later | #6, #21, #42 |
| `navigation.slopeDeg` | terrain slope under the player in degrees (DERIVED from the HiRISE DTM), for the HUD | engine bridge | #20 |
| `navigation.errorM`, `fixMode`, `lastFixSec` | uncertainty radius, `'terrain fix'` or `'dead reckoning'`, mission time of last fix | navigation model | #21, #42 |
| `route.waypoints` | `[{ name, x, z }]` | Plan mode, planner | #17 |
| `route.path` | `[[x, z], ...]`, the format of `route.json` and `planRoute()` | planner | #16, #23 |
| `route.nextIndex` | index of the next waypoint | waypoint tracking | #61 |
| `route.distanceM`, `climbM`, `steepestSlopeDeg`, `etaSec` | from `planRoute()` (`distance`, `climb`, `steepestSlopeDeg`) | planner | #16, #41 |
| `route.reason` | why the route changed, for example after an event | re-planner | #23 |
| `route.shelter` | `{ id, name, x, z, type, protection }` from `public/data/shelters.json`: the shelter the re-planner chose, highlighted in green; `null` when no event is active | re-planner, events | #23, #24 to #26, #30 |
| `route.legs` | `[{ from, to, distanceM, climbM, descentM, maxSlopeDeg, timeSec, o2G, o2Pct, batteryWh, batteryPct }]`, one per leg between consecutive `route.waypoints`, walked out at nominal effort. `maxSlopeDeg` is the steepest grade along the walking direction. `[]` without a route | per-leg costs (`src/sim/legCosts.js`) | #41 |
| `route.totals` | the same fields summed over the legs (the maximum for `maxSlopeDeg`), plus the walk home along the same path with the 20 % pad (`returnTimeSec`, `returnO2G`, `returnBatteryWh`), what is left at the habitat (`arrivalO2G`, `arrivalO2Pct`, `arrivalBatteryWh`, `arrivalBatteryPct`), `marginSec` (O2 left at the habitat as time at the flat walking rate, minus the 30 min reserve) and `status` as for `suit.status`. `null` without a route | per-leg costs | #41 |
| `route.decision` | `'pending'`, `'go'` or `'no-go'`, set by the crew in Plan mode | interface | #17 |
| `route.skipped` | waypoint names the event route leaves out, for example after a dust storm | events | #24 |
| `environment.dustOpacity` | tau. **The event engine writes this path.** The bridge turns it into the engine's storm-dust level (`src/state/dustLevel.js`): tau 0.45 (clear Jezero) is 0, tau 8 (global storm, Gale 2018) is 1. | events, MEDA replay | #22, #24, #27, #31 |
| `environment.tempC`, `windMs`, `pressurePa` | weather | MEDA replay | #31 |
| `environment.doseRateUgyH`, `doseUgy` | radiation dose rate (µGy/h) and dose received (µGy) | RAD curve, events | #25, #31 |
| `alerts.<eventId>` | `{ id, eventId, level, text, startedAtSec, active }`, or `null` when cleared. **The event engine writes these.** | event engine | #22 |
| `crew` | `[{ id, name, color, x, z, oxygenPct, batteryPct }]` | partner, online play | #39, #52 |
| `view.layer` | 0 none, 1 slope hazard, 2 elevation, 3 rock abundance, 4 outcrop | Plan mode, wrist screen | #14, #67 |
| `view.sky` | `'clear_day'`, `'dust_storm'`, `'late_afternoon'`, `'night'`. The default is `'late_afternoon'` (#59) | events, later the clock | #24, #59, #73 |
| `view.skyBlend` | 0 to 1, blend from the current `view.sky` preset to `dust_storm` as the storm opacity rises | events | #24 |
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
const engine = createEngine(container, { assetBase, mode, onStatus, onError });
await engine.ready;
```

| Call | Behaviour |
|---|---|
| `setMode('plan' \| 'walk')` | Switches the camera. Can be called before `ready`; it is applied when ready. |
| `setLayer(n)` | Data layer on the terrain: 0 none, 1 slope hazard, 2 elevation, 3 rock abundance, 4 outcrop. The wrist screen follows. |
| `setSky(name)` | Atmosphere preset: `clear_day`, `dust_storm`, `late_afternoon`, `night`. |
| `setDust(level)` | Storm dust (`src/engine/dust.js`, #27), 0 = clear (the scene as before) to 1 = global storm: thicker, drifting haze on everything (visibility about 1 km), dimmer and redder light with fading shadows, and faint wisps near the helmet. Eased, so a storm builds up. Works on top of any sky preset or blend. |
| `setRoute(path)` | Draws `[[x, z], ...]` as the route glow (`src/engine/routeGlow.js`, #29): a dotted line on the ground near the player, a thin outlined line further away, and chevrons floating ahead in Walk mode. The part already walked turns grey and follows the player, so walking back lights the route again. `null` clears it. |
| `setShelter(shelter)` | Highlights a shelter in green (`src/engine/shelterHighlight.js`, #30): a safe zone on the ground, a column of light visible from far away and in the dust storm, and a label with its distance from the player. Takes an entry of `shelters.json`; `null` fades it out. |
| `setWaypoints(list)` | Numbered sprites for `[{ x, z, name, active? }]`, shown in Plan mode; `null` clears them. |
| `getPlanScale()` | Metres of ground per CSS pixel in Plan mode, for the scale bar. `null` when the engine is not ready or not in Plan mode. |
| `heightAt(x, z)` | Terrain height in metres, from the source grid: the HiRISE tile, or the CTX ring outside it. Relative to the lowest point of the tile; add `terrain.json` `base_elev_m` for MOLA elevation. |
| `slopeAt(x, z)` | Slope in degrees, central difference over 2 m. |
| `lineOfSight(a, b)` | `a`, `b` are `{ x, y?, z }`. A point without `y` is taken at eye height (ground + 1.7 m). Returns `{ clear, blockedAt }` and samples every 2 m. |
| `setPartnerSource(source | null)` | Who drives the partner astronaut (see [PARTNER.md](PARTNER.md)). The scripted partner is the default; `null` hides it. |
| `partnerCommand(name)` | Scripted actions of the current source: `'toggleCase'`, `'visitHabitat'`. Returns `false` if the source ignores it. |
| `getPlayer()` | `{ x, z, headingDeg, mode }`. This is the true position, so only the bridge should read it; the interface reads `navigation`. |
| `dispose()` | Stops everything and frees the GPU. |

- **When they work:** the terrain queries throw before `ready`; `setSky`, `setRoute` and `setDust` before `ready` are stored and applied when ready.
- **Same numbers as the simulation:** the queries are plain functions in `src/engine/queries.js`, with no three.js, and they agree with `src/sim/costGrid.js` to within 1 cm. Tests are in `src/engine/queries.test.js`.

## Simulation runners

`startSimulation(engine)` in `src/state/simulation.js` starts the modules that write the store once the engine is ready. Today that is the mission clock below, the suit model (`src/sim/suitModel.js`, `src/sim/suitRunner.js`, #19) and the per-leg costs (`src/sim/legCosts.js`, #41). The suit runner ticks 4 times per second, reads `navigation` and `route.path`, uses `engine.heightAt` for the gradient, and writes `suit`. All its constants come from `public/data/hazards.json`. The per-leg costs recompute `route.legs` and `route.totals` whenever `route.path` or `route.waypoints` changes, with the same `walkCost` function the walkback uses. Nothing starts with `?mock=1`, so mock values stay put; the clock is not started and writes no session.

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

The runner subscribes to `mission.paused` and `mission.timeScale`, so the suit runner's existing check of `mission.paused` and any direct `storeAdapter.set('mission.paused', true)` are honoured at the exact instant and are not overwritten by the clock. `view.sky` is set once at start from the chosen/restored preset; later time never changes the sky (#73). The clock tags `mission.startedAtMs`, the initial/preset fields and `timeScale` as `SIM` (demo epoch and configuration, not a historical measurement or precise ephemeris); `elapsedSec`, `anchorMs`, `sol` and `lmst` are `DERIVED`.

**Limitations.** The suit runner still keeps its own wall clock for consumables and they do not persist across reload. Changing the mission scale affects mission time only in this issue. There are no visual clock controls yet; use the store actions or a console. No online clock offset or no-pause rule is part of #59.

## The helmet HUD

`src/hud/Hud.jsx` (#20) reads only the store and shows in Walk mode once the scene is ready.
- **Values shown:** suit (`suit.*`), mission clock (`mission.elapsedSec`, `lmst`), heading and slope (`navigation.*`), the next waypoint (`route.waypoints[route.nextIndex]`, with range, bearing and an ETA at 1 m/s), the environment (`environment.*`) and the most severe active alert (`alerts`).
- **Unsourced values:** an environment value without an entry in `sources` shows as a dash.
- **Source tags:** each value shows its tag through the shared `SourceTag` (`src/components/SourceTag.jsx`, #62), in its tag-only, non-interactive form because the HUD never takes the pointer. The tag appears once the value's writer has put it in `sources`.

## The bridge

`connectEngine(engine)` in `src/state/engineBridge.js` is called by `EngineView` once the engine is ready. It returns a disconnect function.

- **Store to engine:** `mode`, `view.layer`, `view.sky`, `view.skyBlend`, `route.path`, `route.shelter` and `environment.dustOpacity` (as the dust level), each when it changes.
- **Engine to store:** `navigation.x`, `z` and `headingDeg` every 200 ms, skipped while the player stands still. This is the true position until the navigation model (#42) writes the estimate instead; after that, move this write into the navigation module.
