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
| `suit.oxygenSec` | oxygen left, seconds. **The event engine reads this path.** | suit model | #19 |
| `suit.oxygenPct`, `batteryPct` | 0 to 100 | suit model | #19 |
| `suit.pressurePsi` | suit pressure | suit model | #19 |
| `suit.walkbackSec` | time to walk back to the habitat | suit model | #19 |
| `suit.effort` | 0 to 1, from speed and slope | suit model | #19 |
| `navigation.x`, `z`, `headingDeg` | position estimate; heading clockwise from north | engine bridge now; navigation model later | #6, #21, #42 |
| `navigation.errorM`, `fixMode`, `lastFixSec` | uncertainty radius, `'terrain fix'` or `'dead reckoning'`, mission time of last fix | navigation model | #21, #42 |
| `route.waypoints` | `[{ name, x, z }]` | Plan mode, planner | #17 |
| `route.path` | `[[x, z], ...]`, the format of `route.json` and `planRoute()` | planner | #16, #23 |
| `route.nextIndex` | index of the next waypoint | waypoint tracking | #61 |
| `route.distanceM`, `climbM`, `steepestSlopeDeg`, `etaSec` | from `planRoute()` (`distance`, `climb`, `steepestSlopeDeg`) | planner | #16, #41 |
| `route.reason` | why the route changed, for example after an event | re-planner | #23 |
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
| `setRoute(path)` | Draws `[[x, z], ...]` as a ribbon on the ground; `null` clears it. This is the test bench's route line; #29 restyles it. |
| `heightAt(x, z)` | Terrain height in metres, from the source grid: the HiRISE tile, or the CTX ring outside it. Relative to the lowest point of the tile; add `terrain.json` `base_elev_m` for MOLA elevation. |
| `slopeAt(x, z)` | Slope in degrees, central difference over 2 m. |
| `lineOfSight(a, b)` | `a`, `b` are `{ x, y?, z }`. A point without `y` is taken at eye height (ground + 1.7 m). Returns `{ clear, blockedAt }` and samples every 2 m. |
| `getPlayer()` | `{ x, z, headingDeg, mode }`. This is the true position, so only the bridge should read it; the interface reads `navigation`. |
| `dispose()` | Stops everything and frees the GPU. |

- **When they work:** the terrain queries throw before `ready`; `setSky` and `setRoute` before `ready` are stored and applied when ready.
- **Same numbers as the simulation:** the queries are plain functions in `src/engine/queries.js`, with no three.js, and they agree with `src/sim/costGrid.js` to within 1 cm. Tests are in `src/engine/queries.test.js`.

## The bridge

`connectEngine(engine)` in `src/state/engineBridge.js` is called by `EngineView` once the engine is ready. It returns a disconnect function.

- **Store to engine:** `mode`, `view.layer`, `view.sky` and `route.path`, each when it changes.
- **Engine to store:** `navigation.x`, `z` and `headingDeg` every 200 ms, skipped while the player stands still. This is the true position until the navigation model (#42) writes the estimate instead; after that, move this write into the navigation module.
