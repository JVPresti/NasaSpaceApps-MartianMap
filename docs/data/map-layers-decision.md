# Map layers decision

Decision for issue #242 (track review, weakness 1: the layers inform nothing) and section B of the 8-minute plan. Done 2026-11-15.

**Every layer now drives one decision, or it is gone.** Elevation is merged into Slope as **Terrain**. **Radio shadow** and **Exposure** (sky view) are new layers, drawn on the mission table only. **Rocks** now draws the grid the route planner prices. **Outcrop** shows the candidate stops the plan kept or dropped. **Image** stays as the base map. The Perseverance drives overlay says what it decides in its key. Each layer states its decision in one short line under the table legend (`decides` in `src/plan/layers.js`, English and Spanish, at most 40 characters), and its legend carries its source tag (`layerProvenancePath`, `map.layer.<id>` in the provenance registry).

## The layers

| Index | Layer (id) | Decision it drives | What changed | Data | Table | Walk |
|---:|---|---|---|---|:-:|:-:|
| 0 | Image (`none`) | None: the base map under every layer | Unchanged; its legend says it decides nothing by itself | DATA · HiRISE orthomosaic | yes | yes |
| 1 | Terrain (`slope`) | Where the route bends: the cells the "why this route" line names (over 20°, or steep ground it went around) | Slope bands plus Elevation's 5 m contours. On the table the caution band follows the crew's risk setting | DERIVED · HiRISE DTM, limits in hazards.json | yes | yes |
| 2 | Rocks (`rock`) | What the route costs, most of all at cautious risk | Drawn from the density grid of `terrain.json` that the planner prices (`costGrid.rockAbundanceAt`), on the table and on the ground. It used to remap the orthomosaic's brightness, a different source. The legend reads "Rocks · brightness proxy" | SIM · brightness proxy for rock cover (Golombek size model) | yes | yes |
| 3 | Outcrop (`outcrop`) | Where the crew stops: light-toned rock is the science target | The candidate stops of `public/data/stops.json` are marked: the ones the route visits by their numbered markers, the others with why (dropped for time, O2, battery or no route, or part of another objective). The legend reads "Outcrop · brightness mask" | SIM · HiRISE brightness mask; SIM stop choice | yes | yes (mask only) |
| 4 | Radio shadow (`radio`) | The route of a solo crew, or of the radio-contact profile | New layer: the ground the habitat mast cannot see, on the planner's own 10 m mask (`radio.radioShadowMask`) | DERIVED · HiRISE DTM line of sight | yes | no |
| 5 | Exposure (`exposure`) | Radiation risk and the shelter choice, not the path | New layer: sky view of the tile, the natural shelters of `shelters.json` with the share of sky they hide, and a route readout | DERIVED · HiRISE DTM sky view; the dose cut built on it is SIM, an upper bound | yes | no |
| – | Perseverance drives (overlay, Rover button) | A cautious route prefers ground the rover crossed | Its key now says so | DATA · Mars 2020 traverse | yes | no |

`view.layer` in the store is the index. One list in `src/plan/layers.js` feeds the table buttons and legend, the 3D ground (`uLayer` in `src/engine/shaders.js`, the engine's `LAYERS`), the wrist layers page, the Walk layer chip and the L / Shift+L / 0 keys.

## What each layer decides

**Terrain.** The planner's slope cost is `(slope / k)²`, with `k` set by the risk setting (`RISK_SETTINGS` in `src/sim/missionNeeds.js`: 7° cautious, 9° standard, 12° bold). No source sets `k`: it is our choice, SIM (#311). The table's caution band starts where the planner charges what it charges the suit's 15° caution limit at standard risk: `15 × k / 9`, so 12° cautious, 15° standard and 20° bold, where the band disappears because bold prices everything up to the 20° no-go limit as walkable. The no-go band never moves (#242 measured that 17° leaves no route). The legend names the risk the band is drawn for. The 3D ground in Walk keeps the suit's own 15° and 20° limits, and the Walk layer chip says so.

**Rocks.** Rock cover adds `w × rock` to the cost of a cell, with `w` 1 cautious, 0.6 standard, 0.3 bold, our choice (SIM). The grid is HiRISE brightness remapped to rock cover by our own step, and brightness also follows lithology, dust and sunlit slopes, so the layer is tagged SIM, a brightness proxy for rock cover (#311). Golombek et al. 2003 gives the rock sizes for a known cover; it does not turn brightness into one. The layer now reads the same 256 × 256 density grid, so what is yellow on the map is what the planner pays for. Bare ground is left almost clear and rocky ground is tinted strongly (on the table and on the ground), so the image still reads under the layer; the ramp's ends say "bare" and "rocky". The grid keeps its 5.6 m cells, which are what the planner prices. On this tile rock cover changes the route much less than slope (the track review found a mean of 0.46 to 0.47 on every route variant), and the legend line says the cost matters most at cautious risk.

**Outcrop.** No resource or ice data exists in the repository, and the thermal and geology layers were dropped with written decisions (`thermal-view-decision.md`, `geology-layer-decision.md`). We did not invent any. The science value of a stop is the light-toned rock the outcrop mask shows, so "resources change where the crew stops" is delivered here: the candidate stops sit on that rock, and the map says which ones the plan kept and why it dropped the others. The mask is a brightness threshold on the HiRISE image, so bright dust, sand and sunlit slopes pass it too, and the layer is tagged SIM (#311).

**Radio shadow.** A solo crew must keep radio contact, so `missionNeeds.js` forces the radio-contact profile, which prices shadow cells three times. The layer draws the same mask the planner prices, from the habitat mast the engine places (the planner hook returns it and the table passes it to the map). Until the mask exists, the caption says the radio shadow is not computed yet. The legend has a clear row, "In sight of the mast", so the image left unpainted there is not read as the shadow; the shadow is painted in the swatch's colour, strong enough to read blue over the orange image.

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

The sky view factor is the share of the upper hemisphere a crouching astronaut sees (`src/sim/skyView.js`, method and limits in `docs/route/shelters.md`). It is DERIVED geometry. During a solar particle event the dose would scale with it if the flux were isotropic above the horizon; that step is our assumption (SIM), and the one measurement on Mars puts the real saving at about a fifth of it (below).

- **The range on this tile is narrow.** On the 6 m grid the app reads (`sky_view.json`) it runs from 0.82 to 1.00; the full 2 m grid reaches 0.807 at its lowest node (`shelters.json`), so the terrain never hides more than about 19 % of the sky, and the tile median is 0.927. The legend reads the range from the loaded grid and the colour ramp spans it, so the colours exaggerate small differences on purpose.
- **It informs a risk readout and the shelter choice, not the path.** A 5 % difference in sky view along a route is too small to justify a longer walk, so no route profile prices it. What the layer shows is where the natural shelters are (SP1 to SP4, 15 to 16 % of the sky hidden, so at most 15 to 16 % less dose) and how exposed the planned route is.
- **The saving is an upper bound, tagged SIM.** Particles from low in the sky cross more atmosphere, so hiding the low sky saves less than the isotropic estimate. Curiosity's RAD, beside Butte M12 with 19 % of the sky blocked, measured about 4 % less dose (Ehresmann et al. 2021, JGR Planets 126, [doi 10.1029/2021JE006851](https://doi.org/10.1029/2021JE006851)), about a fifth of the blocked share. Scaled that way the natural shelters cut 3.2 to 3.3 %, under the 12 % minimum for a safe point; `docs/route/shelters.md` ("After the hackathon") has the numbers. The shelter marker's tooltip and the route readout say so on screen.

The readout is `skyViewAlongPath(sky, path)` in `src/sim/skyView.js`: the mean, minimum and maximum sky view along `route.path`, sampled every 5 m and weighted by length like `radioShadowAlongPath`, and where the sky is most hidden. `src/plan/routeExposure.js` gives `useRouteExposure(route.path)`, the words (`exposureText`) and the provenance entry `map.exposure` (DERIVED). On the real routes:

| Route | Length | Mean sky view | Most hidden |
|---|---:|---:|---|
| First sortie, airlock to S1 | 55 m | 0.955 | 0.946 |
| Full EVA, airlock to Bright Angel and Cheyava Falls | 934 m | 0.911 | 0.868, at Bright Angel |

So an SEP during the full EVA would give the crew at least about 91 % of the open-ground dose, the isotropic upper bound on the saving. At the ratio RAD measured the saving is under 2 %, so about 98 %.

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

## Framing and markers on the table map

- The default framing fits the planned route (its stops, the alternatives, a walked track and the crew's position) with a margin, never tighter than 150 m (`minSpanM`, `MAP_MIN_SPAN_M`). The 55 m first sortie fills about a third of the map instead of a tenth of a 500 m one, so a layer or a profile changes something the eye can see. The candidate stops and the shelters never move the framing: they draw where the view is, and scrolling out shows the others.
- Zoomed in that far, the photo, the outcrop mask and the slope are read bilinearly, so the map stays smooth; the rock grid and the radio mask keep their cells.
- A marker's tag opens to the left near the right edge of the map, and the rover pin's tag to the right near the left edge, so the edge never cuts a tag. The place markers sit above the rover pin, so the pin no longer hides a shelter. Each stop on the map shows its number (its place in the planned waypoints, the habitat airlock 0) and its one name, the planned waypoint's label, in the interface language as the Stops list words it; the waypoint code ("WP3 · …", "S1 · …") is only a link key and is never shown.
- During an event the table passes `position` (the store's navigation estimate, drawn with the HUD's position marker) and `eventRoute`: the route to the shelter is drawn in the caution colour and its end says SHELTER, as the HUD's waypoint panel does; `planPath` can keep the approved plan thin under it.

## Interface changes

Every change reuses the existing layer buttons, legend (`.table-map-legend`), marker tags (`.map-marker-tag`), colour ramps and source tags.

| Element | Change | Why |
|---|---|---|
| Layer buttons | Elevation gone; Terrain replaces Slope; Radio and Exposure added | The approved layer table |
| Table legend | One short "decides" line per layer; Terrain's caution row names the risk; Radio has an "In sight of the mast" row; Outcrop and Exposure list their markers; Exposure's range comes from the loaded grid | Each layer must say what it decides, and what it leaves unpainted |
| Terrain on the map and the ground | 5 m contours over the slope bands | Merged from Elevation |
| Candidate stop markers (Outcrop) | Grey dot with the stop's tag and why it is not on the route | Shows where else the crew could stop and why the plan left it out |
| Shelter markers (Exposure) | Small square, as the habitat's marker, with "SP1 · 15 % sky hidden"; the tooltip gives the dose cut as a SIM upper bound beside RAD's measurement (#296) | Shows where shelter is |
| Map framing | Fits the route down to a 150 m span; the candidate stops and shelters no longer widen it | A 55 m sortie was a stub on a 500 m map; framing on the shelters pushed the route off the map |
| Tags near the map edge | Open to the other side of their symbol | The edge cut "habitat airlock" and the rover pin |
| Crew position and event route | The HUD's position marker; the event route in the caution colour with SHELTER at its end | #265: each event shows its re-plan on the table |
| Layer preview | Opens above the hovered button instead of beside it | Beside it, it covered the map's legend |
| Rover key | Second line: "A cautious route prefers this ground" | What the drives decide |
| Map caption on Radio shadow | "radio shadow not computed yet" until the mask exists | No silent empty layer |
| Layer previews | Re-rendered with the table's map painter, two added, Elevation's removed | The previews sit beside the table buttons; the two new layers have no 3D look |

## Follow-ups

- Done since the first round: the planner hook returns the habitat mast and the table passes it to the map, so the Radio shadow layer draws; the Exposure readout sits on the Suit step beside go / no-go.
- The ground in Walk keeps the suit's 15° caution band. Making it follow the risk the EVA started with needs the store-to-engine bridge to pass a caution angle to the shader.
- Place markers near the map edge can sit under the legend or the rover key, like the route's own markers.
