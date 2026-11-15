# The partner astronaut

## Decision (issue #39)

The partner is a **scripted character for the MVP**, so the demo never depends on a network. **Real second players are the stretch goal** (#52, #53).

Both go through **one interface, the partner source**. The engine draws the partner only from what the source returns each frame, so swapping the scripted partner for a network-driven one needs no change in engine or HUD code.

## The interface

A partner source is any object with:

```js
{
  id: 'EV2',
  color: [1, 0.32, 0.03],                  // suit accent colour, linear RGB (src/engine/crew.js)
  update(dtSec, world) { return state; },  // called once per frame
  command(name, world) { return true; },   // optional: scripted actions, returns false if ignored
}
```

`world` is what the engine tells the source about the scene:

| Field | Meaning |
|---|---|
| `player` | `{ x, z }`: the player's position |
| `habitat` | `{ x, z, yaw }` of the habitat, or `null` before it is placed |
| `duck(x, z)` | how much a walker stoops at that spot (metres; above 0.15 means "stooping"), from the habitat's hatches |
| `zone(x, z)` | optional: the habitat walk zone at that spot (`'stairs'`, `'porch'`, `'hatch'`, `'airlock'`, `'inner'`, `'main'`, `collide.js`), or `null` |
| `collide(x0, z0, p)` | optional: one step from (x0, z0) to `p` (`{ x, z }`, changed in place) with the walker's collisions: rocks of 0.35 m and larger, the player (0.9 m apart) and the habitat walls. The same solve `view.js` runs for the player |

`update` returns a **PartnerState**:

| Field | Meaning |
|---|---|
| `visible` | `false` hides the partner |
| `x`, `z` | position in metres (x east, z south, from Cheyava Falls). The engine finds the height: habitat floor, steps, or terrain. |
| `yaw` | rotation about y in radians. 0 faces south (+z); `Math.atan2(dx, dz)` faces a point. Turn smoothing is the source's job. |
| `gait` | `'walk'` or `'idle'`. The engine blends the clips and switches to the stooped walk near the hatches by itself. |
| `speedMs` | walking speed. Today the clip plays at its own rate, so this field is informational. |
| `action` | `null`, or a one-shot clip `{ name: 'case_set_down', timeSec, carryingAfter }`. The engine scrubs the clip to `timeSec`; `carryingAfter` is what `carrying` becomes at the release point. |
| `carrying` | the tool case is in the hand. When it turns `false`, the engine sets the case on the ground and opens the lid. |
| `lampOn` | `undefined` follows the sky preset (lit at night); `true` or `false` forces it |

`assertPartnerState(state)` in `src/engine/partnerSource.js` checks a state against this table. Use it in a new source's tests.

## Sources today

| Source | File | What it does |
|---|---|---|
| `createCrewmatePartner()` | `src/sim/crewmate.js`, connected by `src/state/crewmate.js` | **The default EV2 in the app (#288).** A crewmate that walks the approved route with the player, waits for them, works the science stop with the tool case and reacts to the events. See [EV2 the crewmate](#ev2-the-crewmate). |
| `createScriptedPartner()` | `src/engine/partnerSource.js` | **The test bench's partner**, and the engine's own default when the app sets no source (`?mock=1`, `scripts/measure-fps.mjs`). It patrols between (14, 58) and (5, 12) with 3 s pauses. The commands `'toggleCase'` and `'visitHabitat'` run the hand-over and the walk into the habitat and back. The case clip is timed from its data: 2.07 s, release or grab at 0.9 s (`astronaut.json`). For `'toggleCase'` it walks toward where the player is now, re-aimed every frame, and stops 1.6 m from them (`HANDOVER_M`), or at once if the player walks up closer. |
| `createStaticPartner()` | `src/engine/partnerSource.js` | Holds one pose; `set(patch)` changes it. It is the shape of a network source: the latest received state. |

**Who wins.** The engine places the crew again at the EVA start and on a restart, and sets its scripted partner then. A source the app chose through `engine.setPartnerSource` comes back instead, so the crewmate (or a network source) survives both. `setPartnerSource(null)` hides the partner until that next placement; #282 uses it for a crew of one.

## Using it

```js
engine.setPartnerSource(createStaticPartner({ x: 8, z: 64 }));   // or null to hide the partner
engine.partnerCommand('toggleCase');                              // forwarded to source.command, if any
```

**Writing a network source (#53):**
- **`update`:** return the latest pose received, interpolated over about 150 ms.
- **`gait` and `action`:** take them from the remote player's state.
- **`color`:** take it from the player's slot in `PLAYER_COLORS` (`src/engine/crew.js`).
- **Height:** never send it, because each client reads it from its own terrain.

## EV2 the crewmate

`EngineView` calls `startCrewmate(engine)` once the scene is ready, so a restart keeps it. `src/state/crewmate.js` builds what the crewmate knows from one store snapshot (`crewmateSense`) and installs `createCrewmatePartner()` with `engine.setPartnerSource`. The decisions are a plain state machine in `src/sim/crewmate.js`, with no React, three.js or store. Every distance and time is in `CREWMATE` there, all SIM.

### How it walks: no back and forth

The playtest of the scripted partner found it "not following and just going back and forth". The crewmate rules that out by construction, and `src/sim/crewmate.oscillation.test.js` measures it.

- **Pure pursuit.** It steers at a point 3 m (`LOOKAHEAD_M`) ahead of its own place on the route, never at the player's live position. A player who turns round does not turn it round. Off the route (more than 8 m from it, back within 4 m) it pursues the player's own trail the same way.
- **Heading first.** It walks along its heading, which turns at most 120° per second. A target more than 90° off the heading makes it stop and turn on the spot. It never steps backwards. Speed changes are limited to 1.0 m/s² up and 1.2 m/s² down.
- **Hysteresis.** It starts following once the player is more than 10 m away (`START_M`) and stops once a stopped player is closer than 6 m (`STOP_M`). Between the two it keeps doing what it did. Every decision (wait or follow, the way along the route, route or trail, lead or wait) holds 2 s at least (`FLIP_SEC`). The gap is measured along the route, so a corner does not stop it.
- **Round rocks, not into them.** It probes 0.8 m ahead along its heading. When a rock (or the player) blocks it, it turns to the clearer side at the same 120° per second and keeps that side for 1 s, so it walks round instead of pushing into the rock.
- **Never past the player.** Its speed comes from the gap along the route and the player's progress along it, so a player who walks sideways off the route is not overtaken. Level with their place or ahead of it, it stands and lets them lead.
- **Waiting.** A walking player is followed at 7 m. A stopped player is approached at a falling speed until 5 m, then it stands still and turns to face them.

### Behaviours, in priority order

| Situation | What EV2 does |
|---|---|
| Crew of one (#282 `needs.crew` is 1) | Hidden. Without `needs`, as on main, it is present |
| Before the EVA | Stands 2 m to the player's right at the airlock, facing the route. When the engine moves the player more than 4 m in one frame (the airlock cycle of the habitat-first flow, a restart) it stands beside them again |
| Home | Once the player is at the foot of the steps or inside, it climbs after them along the steps, porch, hatches and airlock, 1.5 m behind in habitat x, and goes on to the far side of the cabin table once the player is clear of the inner hatch. It never passes the player and never steps back out to start the climb. Leading the way home, it goes in first |
| Case down | Stays with the case and picks it up when the player leaves the stop, an event starts or the EVA ends |
| Radiation alert | Leads the way to `route.shelter` (or the habitat) along the re-planned route, 5 m ahead of the player (3 m in the storm), passing them 1.8 m to the left. It waits for them past 10 m and falls in behind for the last 10 m |
| Its own margin under 15 min (`crew[0].marginSec`) | Says so and turns for home, up to 9 m ahead, then waits |
| Dust storm | Closes in to 3 m behind on the re-planned route (stops under 2.5 m, starts over 4.5 m) |
| Hand-over (F, `'toggleCase'`) | Brings the case to 1.6 m from the player and sets it down; with the case down, picks it up (the sampling hand-over asks for this after the pour) |
| Science stop | Within 5 m of a stop on the route (`stops.json` `stops` and #282's `route_stops`, matched to `route.waypoints` by name), stands 1.6 m beside the player and sets the case down (`case_set_down`). A finished stop opens again 25 m away |
| Otherwise | The buddy walk above. On a slope of 15° or more ahead it steps 1.5 m to the gentler side |

### Radio callouts

Short lines in `comms.partner`, shown under the partner chip for 8 s (`src/hud/CrewmateRadio.jsx`), in English and Spanish (`crewmate.*` keys). At most one every 20 s; storm, radiation and its own low margin are urgent and skip the wait. Nothing is said while `crew[0].link` is false: the radio needs line of sight. Each number comes from the sim and shows the tag of its path.

| Line | When | Number and its source |
|---|---|---|
| Radio check, suit nominal, margin | 15 s into the EVA | `crew.0.marginSec`, DERIVED, suit model |
| There's the site, N m ahead | the next waypoint is a science stop within 25 m (the judge-visible touch: S1 in the first mission, Cheyava Falls in the full EVA) | `navigation.waypointRangeM`, SIM |
| Case is down and open | at a science stop | none |
| Slope N° ahead, I'm taking the left/right side | a slope of 15° or more within 15 m ahead | `crewmate.slopeAheadDeg`, DERIVED, HiRISE DTM (`engine.slopeAt`) |
| I'm at N m, waiting | the player stopped 6 s with EV2 waiting 5 m or more away | `crew.0.rangeM`, SIM |
| Storm front, closing in | the dust storm starts | none |
| Radiation alert, heading for the shelter | the radiation alert starts | the shelter's name |
| My margin is N, turning for home | its own margin under 15 min | `crew.0.marginSec` |

### Tests

- `src/sim/crewmate.test.js`: each behaviour on its own.
- `src/sim/crewmate.mission.test.js`: #282's first mission, run twice (EVA start at the airlock, and the habitat-first airlock cycle).
- `src/sim/crewmate.oscillation.test.js`: 3 minutes on a recorded player walk with two stops, a 90° and a 135° turn and a 10 m backtrack. It counts EV2's reversals over 90° (one, following the player round the 135° turn), time more than 15 m away (none), turn rate, decision flips 2 s apart, and how it waits.
- `src/state/crewmate.test.js`: the store adapter on main's and #282's shapes.
- `CREWMATE_TRACE=1 npx vitest run src/sim/crewmate.mission.test.js src/sim/crewmate.oscillation.test.js` prints the runs as tables.

## Partner status on the HUD (#70)

`engine.getPartner()` returns `{ id, color, state }`, the source's id and colour and the PartnerState it returned on the last frame. The partner runner (`src/sim/partnerRunner.js`) reads only that, so a network source feeds the HUD chip, the partner's suit and the separation alert with no other change. The partner's O2 and battery come from the suit model, fed by the movement between its reported positions.

## Crew colours

`src/engine/crew.js` holds the four suggested player colours of `astronaut.json`:

| Slot | Colour | Used for |
|---|---|---|
| player1 | blue | EV1, the player: arms and legs |
| player2 | orange | EV2, the crewmate (the scripted partner on the test bench) |
| player3, player4 | green, magenta | online play |
