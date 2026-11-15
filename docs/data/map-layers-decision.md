# Map layers decision

Decision for issue #242 (track review, weakness 1: the layers inform nothing) and section B of the 8-minute plan. Done 2026-11-15.

**Every layer now drives one decision, or it is gone.** Elevation is merged into Slope as **Terrain**. **Radio shadow** and **Exposure** (sky view) are new layers, drawn on the mission table only. **Rocks** now draws the grid the route planner prices. **Outcrop** shows the candidate stops the plan kept or dropped. **Image** stays as the base map. The Perseverance drives overlay says what it decides in its key. Each layer states its decision in one line under the table legend (`decides` in `src/plan/layers.js`, English and Spanish).

## The layers

| Index | Layer (id) | Decision it drives | What changed | Data | Table | Walk |
|---:|---|---|---|---|:-:|:-:|
| 0 | Image (`none`) | None: the base map under every layer | Unchanged; its legend says it decides nothing by itself | DATA · HiRISE orthomosaic | yes | yes |
| 1 | Terrain (`slope`) | Where the route bends: the cells the "why this route" line names (over 20°, or steep ground it went around) | Slope bands plus Elevation's 5 m contours. On the table the caution band follows the crew's risk setting | DERIVED · HiRISE DTM, limits in hazards.json | yes | yes |
| 2 | Rocks (`rock`) | What the route costs, most of all at cautious risk | Drawn from the density grid of `terrain.json` that the planner prices (`costGrid.rockAbundanceAt`), on the table and on the ground. It used to remap the orthomosaic's brightness, a different source | DERIVED · HiRISE, Golombek model | yes | yes |
| 3 | Outcrop (`outcrop`) | Where the crew stops: light-toned rock is the science target | The candidate stops of `public/data/stops.json` are marked: the ones the route visits by their numbered markers, the others with why (dropped for time, O2, battery or no route, or part of another objective) | DERIVED · HiRISE outcrop mask; SIM stop choice | yes | yes (mask only) |
| 4 | Radio shadow (`radio`) | The route of a solo crew, or of the radio-contact profile | New layer: the ground the habitat mast cannot see, on the planner's own 10 m mask (`radio.radioShadowMask`) | DERIVED · HiRISE DTM line of sight | yes | no |
| 5 | Exposure (`exposure`) | Radiation risk and the shelter choice, not the path | New layer: sky view of the tile, the natural shelters of `shelters.json` with their dose cut, and a route readout | DERIVED · HiRISE DTM sky view | yes | no |
| – | Perseverance drives (overlay, Rover button) | A cautious route prefers ground the rover crossed | Its key now says so | DATA · Mars 2020 traverse | yes | no |

`view.layer` in the store is the index. One list in `src/plan/layers.js` feeds the table buttons and legend, the 3D ground (`uLayer` in `src/engine/shaders.js`, the engine's `LAYERS`), the wrist layers page, the Walk layer chip and the L / Shift+L / 0 keys.

## What each layer decides

**Terrain.** The planner's slope cost is `(slope / k)²`, with `k` set by the risk setting (`RISK_SETTINGS` in `src/sim/missionNeeds.js`: 7° cautious, 9° standard, 12° bold). The table's caution band starts where the planner charges what it charges the suit's 15° caution limit at standard risk: `15 × k / 9`, so 12° cautious, 15° standard and 20° bold, where the band disappears because bold prices everything up to the 20° no-go limit as walkable. The no-go band never moves (#242 measured that 17° leaves no route). The legend names the risk the band is drawn for. The 3D ground in Walk keeps the suit's own 15° and 20° limits, and the Walk layer chip says so.

**Rocks.** Rock cover adds `w × rock` to the cost of a cell, with `w` 1 cautious, 0.6 standard, 0.3 bold. The layer now reads the same 256 × 256 density grid, so what is yellow on the map is what the planner pays for. On this tile rock cover changes the route much less than slope (the track review found a mean of 0.46 to 0.47 on every route variant), and the legend line says the cost matters most at cautious risk.

**Outcrop.** No resource or ice data exists in the repository, and the thermal and geology layers were dropped with written decisions (`thermal-view-decision.md`, `geology-layer-decision.md`). We did not invent any. The science value of a stop is the light-toned rock the outcrop mask shows, so "resources change where the crew stops" is delivered here: the candidate stops sit on that rock, and the map says which ones the plan kept and why it dropped the others.

**Radio shadow.** A solo crew must keep radio contact, so `missionNeeds.js` forces the radio-contact profile, which prices shadow cells three times. The layer draws the same mask the planner prices, from the habitat mast the engine places. Until the map is given the mast, the caption says the radio shadow is not computed yet (see Follow-ups).

**Exposure.** See the caveat below.

**Perseverance drives.** Cautious risk makes ground the rover drove cost 0.8 of other ground (`traverseDiscount`), so a cautious route bends toward the drives. The key says it in a second line.

## Why Elevation was merged

- It drove no decision of its own. Climb already reaches the plan through the suit model: the route's oxygen, time and margin include it, and the route panel shows the climb.
- Height above the lowest point of the tile is not a hazard. Slope, its derivative, is the one the suit limits and the planner prices.
- Its colour bands covered the slope bands, so the two could not be read together. The 5 m contours are the part that reads: they show the shape of the ground, so Terrain keeps them over the slope bands.
- One button fewer leaves room for the two layers that do drive a decision.

## Why Image stays

It is the base map under every layer: the HiRISE photo is what the crew will see on the ground, and every other layer is drawn on top of it. It drives no decision by itself, and its legend says so rather than pretending otherwise.

## The Exposure caveat

The sky view factor is the share of the upper hemisphere a crouching astronaut sees (`src/sim/skyView.js`, method and limits in `docs/route/shelters.md`). During a solar particle event the dose scales with it if the flux is isotropic above the horizon.

- **The range on this tile is narrow, about 0.81 to 1.0.** The terrain never hides more than about 19 % of the sky (0.807 at the lowest node of the full grid, `shelters.json`), and the tile median is 0.927. The legend states this range, and the colour ramp spans it, so the colours exaggerate small differences on purpose.
- **It informs a risk readout and the shelter choice, not the path.** A 5 % difference in sky view along a route is too small to justify a longer walk, so no route profile prices it. What the layer shows is where the natural shelters are (SP1 to SP4, 15 to 16 % less dose) and how exposed the planned route is.
- **The saving is an upper bound.** Particles from low in the sky cross more atmosphere, so hiding the low sky saves less than the isotropic estimate.

The readout is `skyViewAlongPath(sky, path)` in `src/sim/skyView.js`: the mean, minimum and maximum sky view along `route.path`, sampled every 5 m and weighted by length like `radioShadowAlongPath`, and where the sky is most hidden. `src/plan/routeExposure.js` gives `useRouteExposure(route.path)`, the words (`exposureText`) and the provenance entry `map.exposure` (DERIVED). On the real routes:

| Route | Length | Mean sky view | Most hidden |
|---|---:|---:|---|
| First sortie, airlock to S1 | 55 m | 0.955 | 0.946 |
| Full EVA, airlock to Bright Angel and Cheyava Falls | 934 m | 0.911 | 0.868, at Bright Angel |

So an SEP during the full EVA would give the crew at most about 91 % of the open-ground dose.

### How sky view is computed

`computeSkyView` on the full 751 × 751 grid takes about 15 s in Node (14.4 to 14.8 s measured), far too long for the interface or even a worker. `npm run skyview` (`scripts/build-sky-view.mjs`) computes it once on every third node, with the same rays as `shelters.json` (48 azimuths, to 400 m), in about 1.7 s, and writes `public/data/sky_view.json`: 251 × 251 nodes 6 m apart, one byte each, 84 KB. Checked against the exact value at 400 random nodes of the full grid, the coarse grid read bilinearly is off by 0.0007 on average and 0.015 at worst; at the four natural shelters it is within 0.03 (`skyView.test.js`). The app loads the file once, when the Exposure layer or the readout first needs it; sampling a route takes about 0.1 ms.

## Walk mode

The layer index is shared, so Walk had to stay right when the list changed:

- The ground draws Terrain, Rocks and Outcrop. For Radio shadow and Exposure it stays plain: the engine's `LAYERS` lists all six, so `setLayer` accepts every index, and the shader draws only 1 to 3.
- The Walk layer chip hides for a table-only layer, and for Terrain shows the suit's limits and the contours, which is what the ground draws.
- The wrist layers page lists the four layers the ground draws, and shows None as active while a table-only layer is chosen.
- L and Shift+L step through all six layers at the table and through the four ground layers in Walk; from a table-only layer they move on to a ground layer. 0 turns any layer off.
- The engine's built-in wrist list, for a consumer without the wrist app, names the same four.

A table-only layer chosen at the table stays chosen in the store and is back when the crew returns to the table.

## Interface changes

Every change reuses the existing layer buttons, legend (`.table-map-legend`), marker tags (`.map-marker-tag`), colour ramps and source tags.

| Element | Change | Why |
|---|---|---|
| Layer buttons | Elevation gone; Terrain replaces Slope; Radio and Exposure added | The approved layer table |
| Table legend | One "decides" line per layer; Terrain's caution row names the risk; Outcrop and Exposure list their markers | Each layer must say what it decides |
| Terrain on the map and the ground | 5 m contours over the slope bands | Merged from Elevation |
| Candidate stop markers (Outcrop) | Grey dot with the stop's tag and why it is not on the route | Shows where else the crew could stop and why the plan left it out |
| Shelter markers (Exposure) | Small square, as the habitat's marker, with "SP1 · −16 % dose" | Shows where shelter is |
| Map framing on Outcrop and Exposure | The fit also frames the candidate stops or the shelters | A marked place the map does not show informs nothing |
| Rover key | Second line: "A cautious route prefers this ground" | What the drives decide |
| Map caption on Radio shadow | "radio shadow not computed yet" until the mask exists | No silent empty layer |
| Layer previews | Re-rendered with the table's map painter, two added, Elevation's removed | The previews sit beside the table buttons; the two new layers have no 3D look |

## Follow-ups

- **The habitat mast for the Radio shadow layer.** `MissionMap` takes a `mast` prop; the engine gives it (`engine.getHabitatMast()`) and `useRoutePlanner` already polls it for the radio-contact profile. The table has to pass it down (the planner hook returning `mast`, and the table's map passing `mast={planner.mast}`). Until then the layer draws nothing and says so.
- The Exposure readout is ready to place on the table (`useRouteExposure`, `exposureText`, `SourceTag path="map.exposure"`).
- The ground in Walk keeps the suit's 15° caution band. Making it follow the risk the EVA started with needs the store-to-engine bridge to pass a caution angle to the shader.
- Place markers near the map edge can sit under the legend or the rover key, like the route's own markers.
