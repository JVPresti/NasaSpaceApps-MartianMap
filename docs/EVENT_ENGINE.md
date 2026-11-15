# Event engine

Data-driven events for Marswalk: one JSON definition says what starts an event,
what it changes over time, which alert it raises and what it asks the planner to
do. The engine is plain ES modules in `src/sim/eventEngine.js`; it imports no
React and no three.js.

The three real events (dust storm, radiation and low oxygen) are separate issues
(#24, #25 and #26). This document only defines the mechanism they plug into. The
real application store comes from issue #6; the engine uses the same three-method
contract as the small in-memory adapter included for tests and the demo.

The tests in `src/sim/eventEngine.test.js` are written for Vitest. They start
running when issue #57 adds the test runner; no test script is added here.

## Quick start

```js
import { createEventEngine, createMemoryStore } from './src/sim/eventEngine.js'
import demoAlarm from './src/sim/events/example-event.json'

const store = createMemoryStore()
const engine = createEventEngine({
  events: [demoAlarm],
  store,
  getMissionTime: () => clock.missionTimeSec,
  requestReplan: (request) => routePlanner.replan(request),
})

// Once per simulation tick.
engine.update(clock.missionTimeSec, { x: player.x, z: player.z })
```

`engine.update()` is idempotent: calling it twice with the same mission time and
position does not duplicate an alert, a re-plan request or a timeline write.

## Event definition

An event is parsed JSON. The engine validates every definition when it is
created and throws with a readable list of errors if one is wrong.

```json
{
  "id": "demo-alarm",
  "label": "Demo alarm (example event)",
  "trigger": { "type": "manual" },
  "timeline": [
    { "atSec": 0, "set": { "environment.dustOpacity": 0.1 } },
    { "atSec": 5, "set": { "environment.dustOpacity": 0.2 } }
  ],
  "alert": { "level": "caution", "text": "Example event. Demo alarm only, not a real hazard." },
  "planner": { "action": "replan", "target": "nearestShelter" },
  "end": { "type": "duration", "afterSec": 10 },
  "endSet": { "environment.dustOpacity": 0 }
}
```

| Field | Required | Meaning |
| --- | :--: | --- |
| `id` | yes | Unique id: letters, digits, `_` or `-`, starting with a letter or digit. It is also the alert key, so dots are not allowed. |
| `label` | yes | Text for a debug menu or the HUD. |
| `trigger` | yes | What starts the event. See below. |
| `timeline` | yes | Store changes relative to the start of the event. Use `[]` for an alert-only event. |
| `alert` | yes | `{ "level": "caution" \| "warning" \| "danger" \| "info", "text": "..." }`. |
| `planner` | no | `{ "action": "replan", "target": "nearestShelter" \| "habitat" }`. |
| `end` | no | What ends the event. Without it the event stays active until `engine.end(id)`. |
| `endSet` | no | Store paths written when the event ends, usually to revert the timeline. |

Extra keys are ignored, so a definition can carry notes or provenance for later
issues. All numeric fields are finite numbers; coordinates are metres with x east
and z south, as in `docs/marswalk-assets/README.md`. Time is seconds from the
start of the EVA.

### Triggers

| Type | Shape | Starts when |
| --- | --- | --- |
| Mission time | `{ "type": "missionTime", "atSec": 300 }` | `missionTimeSec >= atSec`. Exactly at `atSec`, not before. |
| Area | `{ "type": "area", "x": 0, "z": 0, "radius": 40 }` | The position is inside the circle, boundary included. Without a position it does not fire and does not crash. |
| Threshold | `{ "type": "threshold", "path": "suit.oxygenSec", "op": "lt", "value": 900 }` | The store value satisfies the comparison. Ops: `lt`, `lte`, `gt`, `gte`. Missing or non-numeric values do not satisfy it. |
| Manual | `{ "type": "manual" }` | Only `engine.fire(id)`, or a debug control that calls it. |

Each event runs at most once per engine instance. An event that has ended does
not start again if its trigger stays true; create a new engine for a new EVA.

#### Trigger conditions (#265)

Any trigger except `manual` can carry these optional fields. They are what lets the
first mission (`src/sim/missions.js`) meet both events at any walking pace.

| Field | Shape | Effect |
| --- | --- | --- |
| `requires` | `[{ "path": "route.nextIndex", "op": "gte", "value": 2, "forSec": 20 }]` | A store threshold that must have held for `forSec` seconds of mission time (0 when left out). The time counts from the first update it held; it restarts if the threshold stops holding. |
| `requires` | `[{ "area": { "x": 493, "z": 539, "radius": 8 }, "forSec": 90 }]` | A place reached at least `forSec` seconds ago. Reached once is reached for good: leaving it again changes nothing. |
| `requires` | `[{ "nearEndM": 10 }]` | The position within `nearEndM` metres of the event's own end area (held while it is there). Needs an `end` of type `area`. |
| `requires` | `[{ "event": "dust-storm", "afterSec": 15 }]` | Another event must have started at least `afterSec` seconds ago. An event this engine does not run (switched off at the mission table) counts as met. |
| `requires` | `[{ "anyOf": [ ... ] }]` | Any one of the listed requirements is enough. |
| `latestSec` | `240` | From this mission time the basic trigger and the other requirements no longer count; a top-level event requirement still does, so two late events keep their order. Not before `atSec`. |
| `holdInsideEnd` | `true` | The event does not start while the position is inside its own `end` area (it would end in the same update and never play); it starts on the first update outside, or at `latestSec`. Needs an `end` of type `area`. |

An `end` can carry `minSec`: the end condition is not checked until the event has run that long, so an event that
starts inside its own end area still plays.

The real storm and radiation events carry `{ "type": "manual" }` in their files: the
mission gives them their trigger (`missionEventDefinitions`), T+480 s and T+720 s in
the full EVA.

### Timeline

Entries are applied in order, relative to the event start:

- On start, every entry with `atSec <= 0` is applied immediately.
- On each `update()`, entries whose `atSec` is reached are applied once.
- Entries must be ordered by `atSec` (equal values are allowed).

`set` is an object of store paths to values. Nothing is reverted automatically
unless the definition has an `endSet`.

### End conditions

| Type | Shape | Ends when |
| --- | --- | --- |
| Duration | `{ "type": "duration", "afterSec": 180 }` | The event has been active for `afterSec`. |
| Mission time | `{ "type": "missionTime", "atSec": 900 }` | The mission clock reaches the absolute time `atSec`. |
| Area | `{ "type": "area", "x": 0, "z": 0, "radius": 40 }` | The astronaut enters the circle, for example to reach a shelter. |
| Threshold | `{ "type": "threshold", "path": "suit.oxygenSec", "op": "gte", "value": 1200 }` | The store value satisfies the comparison, for example when oxygen is replenished. |

When an event ends, `endSet` is applied (if present) and the alert is cleared.

## Store contract

The engine needs an adapter with exactly three methods:

| Method | Purpose |
| --- | --- |
| `get(path)` | Read a dot path such as `suit.oxygenSec`. Returns `undefined` when missing. |
| `set(path, value)` | Write a dot path. Creates intermediate objects. |
| `snapshot()` | Return a plain snapshot of the whole state. |

The real Zustand store from issue #6 provides these three methods; the engine
does not care how subscriptions or React rendering work. `createMemoryStore` in
`eventEngine.js` is only a test and demo adapter: it deep-clones its input and
has no subscriptions.

### Alert paths

By default the engine writes the alert to:

```text
alerts.<eventId>
```

with this shape:

```js
{
  id: 'demo-alarm',          // same as eventId
  eventId: 'demo-alarm',
  level: 'caution',
  text: 'Example event. Demo alarm only, not a real hazard.',
  startedAtSec: 300,
  active: true
}
```

On end the path is set to `null`. The store contract has no delete operation, so
`null` is the cleared value. If the host store wants a different path or an
action, pass `writeAlert(alert)` and `clearAlert(eventId, alert)` to
`createEventEngine`. Both receive the same payload the engine would have written.

### Planner request

When an event with a `planner` block starts, `requestReplan` is called exactly
once:

```js
{
  eventId: 'dust-storm',
  reason: 'Dust storm: return to the habitat',
  target: 'nearestShelter',
  missionTimeSec: 480
}
```

`reason` is the alert text of the event. The actual re-planning is issue #23 and
is not part of the engine. If `requestReplan` is omitted the request is dropped.

## Determinism

Event starts, timeline steps and end conditions are calculated only from:

- the mission time passed to `update(missionTimeSec, position)`,
- the position passed to `update()`,
- values read from the store.

The engine never calls `Date.now()`, never counts frames and never uses random
numbers. Two clients that receive the same mission time and start from the same
store see the same event start and the same timeline steps. Mission time must be
monotonic; a backwards time does not unapply already applied steps.

Store writes made during one update are visible to threshold triggers on the next
update. This keeps a single update deterministic and avoids trigger chains inside
one frame.

## Adding a fourth event

To give an event a start time, add it to each mission's `events` in
`src/sim/missions.js`; the event file says what happens, the mission says when.

No code path changes. Add a JSON file under `src/sim/events/`, then register it:

```js
import dustStorm from './events/dust-storm.json'

const engine = createEventEngine({
  events: [demoAlarm, dustStorm],
  store,
  requestReplan,
})
```

Validate it before shipping:

```js
import { validateEvent } from './src/sim/eventEngine.js'
import dustStorm from './src/sim/events/dust-storm.json'

const result = validateEvent(dustStorm)
if (!result.ok) throw new Error(result.errors.join('\n'))
```

The values of the real events come from `hazards.json` and their issues (#24,
#25, #26); do not put made-up hazard numbers in the engine or its example.

## Debug trigger

`listEvents()` returns `{ id, label, trigger }` for every registered event, so a
debug menu can be built without importing the JSON files itself:

```js
for (const event of engine.listEvents()) {
  // Render a button per event.
  button.textContent = event.label
  button.onclick = () => engine.fire(event.id)
}
```

`engine.fire(id)` starts any registered event, whatever its trigger, and
`engine.end(id)` ends it early. Both ignore events that already started or
ended; `fire` and `end` throw for an unknown id. `engine.getActive()` returns the
active events with `id`, `label`, `startedAtSec`, `elapsedSec` and `alert`.

In the demo, register only `src/sim/events/example-event.json`. It is a clearly
labelled example with no real hazard values.
