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
| `createScriptedPartner()` | `src/engine/partnerSource.js` | **The test bench's partner, now the default.** It patrols between (14, 58) and (5, 12) with 3 s pauses. The commands `'toggleCase'` and `'visitHabitat'` run the hand-over and the walk into the habitat and back. The case clip is timed from its data: 2.07 s, release or grab at 0.9 s (`astronaut.json`). For `'toggleCase'` it walks toward where the player is now, re-aimed every frame, and stops 1.6 m from them (`HANDOVER_M`), or at once if the player walks up closer. |
| `createStaticPartner()` | `src/engine/partnerSource.js` | Holds one pose; `set(patch)` changes it. It is the shape of a network source: the latest received state. |

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

## Partner status on the HUD (#70)

`engine.getPartner()` returns `{ id, color, state }`, the source's id and colour and the PartnerState it returned on the last frame. The partner runner (`src/sim/partnerRunner.js`) reads only that, so a network source feeds the HUD chip, the partner's suit and the separation alert with no other change. The partner's O2 and battery come from the suit model, fed by the movement between its reported positions.

## Crew colours

`src/engine/crew.js` holds the four suggested player colours of `astronaut.json`:

| Slot | Colour | Used for |
|---|---|---|
| player1 | blue | EV1, the player: arms and legs |
| player2 | orange | EV2, the scripted partner |
| player3, player4 | green, magenta | online play |
