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
| `mission.startedAtMs`, `elapsedSec`, `paused` | mission clock, from a start timestamp | mission clock | #59 |
| `mission.sol`, `lmst` | sol number, local mean solar time `'HH:MM'` | mission clock | #59 |
| `suit.oxygenG`, `oxygenPct` | primary O2 left, grams and 0 to 100 (xEMU 771 g usable) | suit model | #19 |
| `suit.oxygenSec` | O2 time left at the current rate (smoothed over 30 s). **The event engine reads this path.** | suit model | #19 |
| `suit.batteryPct` | 0 to 100 (xEMU 756 Wh) | suit model | #19 |
| `suit.pressurePsi` | suit pressure, 4.3 psid nominal | suit model | #19 |
| `suit.metabolicW`, `effort` | metabolic power in W; effort 0 at rest, 1 at the design peak (879 W) | suit model | #19 |
| `suit.walkbackSec`, `walkbackO2G` | time and O2 (with the 20 % pad) to walk back to the habitat along the route | suit model | #19 |
| `suit.marginSec` | O2 time left minus walkback minus the 30 min reserve | suit model | #19 |
| `suit.status` | `'nominal'`, `'caution'` (margin under 15 min) or `'warning'` (margin at or under 0) | suit model | #19, used by #26 |
| `navigation.x`, `z`, `headingDeg` | position estimate; heading clockwise from north | engine bridge now; navigation model later | #6, #21, #42 |
| `navigation.errorM`, `fixMode`, `lastFixSec` | uncertainty radius, `'terrain fix'` or `'dead reckoning'`, mission time of last fix | navigation model | #21, #42 |
| `route.waypoints` | `[{ name, x, z }]` | Plan mode, planner | #17 |
| `route.path` | `[[x, z], ...]`, the format of `route.json` and `planRoute()` | planner | #16, #23 |
| `route.nextIndex` | index of the next waypoint | waypoint tracking | #61 |
| `route.distanceM`, `climbM`, `steepestSlopeDeg`, `etaSec` | from `planRoute()` (`distance`, `climb`, `steepestSlopeDeg`) | planner | #16, #41 |
| `route.reason` | why the route changed, for example after an event | re-planner | #23 |
| `route.shelter` | `{ id, name, x, z, type, protection }` from `public/data/shelters.json`: the shelter the re-planner chose, highlighted in green; `null` when no event is active | re-planner, events | #23, #24 to #26, #30 |
| `route.legs` | `[{ from, to, distanceM, climbM, descentM, maxSlopeDeg, timeSec, o2G, o2Pct, batteryWh, batteryPct }]`, one per leg between consecutive `route.waypoints`, walked out at nominal effort. `maxSlopeDeg` is the steepest grade along the walking direction. `[]` without a route | per-leg costs (`src/sim/legCosts.js`) | #41 |
| `route.totals` | the same fields summed over the legs (the maximum for `maxSlopeDeg`), plus the walk home along the same path with the 20 % pad (`returnTimeSec`, `returnO2G`, `returnBatteryWh`), what is left at the habitat (`arrivalO2G`, `arrivalO2Pct`, `arrivalBatteryWh`, `arrivalBatteryPct`), `marginSec` (O2 left at the habitat as time at the flat walking rate, minus the 30 min reserve) and `status` as for `suit.status`. `null` without a route | per-leg costs | #41 |
| `environment.dustOpacity` | tau. **The event engine writes this path.** | events, MEDA replay | #22, #24, #31 |
| `environment.tempC`, `windMs`, `pressurePa` | weather | MEDA replay | #31 |
| `environment.doseRateUgyH`, `doseUgy` | radiation dose rate (µGy/h) and dose received (µGy) | RAD curve, events | #25, #31 |
| `alerts.<eventId>` | `{ id, eventId, level, text, startedAtSec, active }`, or `null` when cleared. **The event engine writes these.** | event engine | #22 |
| `crew` | `[{ id, name, color, x, z, oxygenPct, batteryPct }]` | partner, online play | #39, #52 |
| `view.layer` | 0 none, 1 slope hazard, 2 elevation, 3 rock abundance, 4 outcrop | Plan mode, wrist screen | #14, #67 |
| `view.sky` | `'clear_day'`, `'dust_storm'`, `'late_afternoon'`, `'night'` | events, later the clock | #24, #73 |
| `sources['<path>']` | `{ tag: 'DATA' \| 'DERIVED' \| 'SIM', source }` for any value above | whoever writes the value | #62 |

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

- **When they work:** the terrain queries throw before `ready`; `setSky` and `setRoute` before `ready` are stored and applied when ready.
- **Same numbers as the simulation:** the queries are plain functions in `src/engine/queries.js`, with no three.js, and they agree with `src/sim/costGrid.js` to within 1 cm. Tests are in `src/engine/queries.test.js`.

## Simulation runners

`startSimulation(engine)` in `src/state/simulation.js` starts the modules that write the store once the engine is ready. Today that is the suit model (`src/sim/suitModel.js`, `src/sim/suitRunner.js`, #19). It ticks 4 times per second, reads `navigation` and `route.path`, uses `engine.heightAt` for the gradient, and writes `suit`. All its constants come from `public/data/hazards.json`. The per-leg costs (`src/sim/legCosts.js`, #41) recompute `route.legs` and `route.totals` whenever `route.path` or `route.waypoints` changes, with the same `walkCost` function the walkback uses. Nothing starts with `?mock=1`, so mock values stay put.

In development, `window.__missionStore` is the store, for the browser console: `__missionStore.getState().suit`. Production builds do not have it.

## The bridge

`connectEngine(engine)` in `src/state/engineBridge.js` is called by `EngineView` once the engine is ready. It returns a disconnect function.

- **Store to engine:** `mode`, `view.layer`, `view.sky`, `route.path` and `route.shelter`, each when it changes.
- **Engine to store:** `navigation.x`, `z` and `headingDeg` every 200 ms, skipped while the player stands still. This is the true position until the navigation model (#42) writes the estimate instead; after that, move this write into the navigation module.
