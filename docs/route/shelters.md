# Shelters and safe points

The route planner sends the crew to a shelter when an event starts. `public/data/shelters.json` lists the places it can use. `npm run shelters` rebuilds the file from the terrain with `scripts/build-shelters.mjs`. Do not edit the file by hand.

## What counts as a shelter

| Id | Type | Events | Protection | Why |
|---|---|---|---|---|
| `HAB` | habitat | radiation, dust storm, low oxygen | full | Pressurised, with air, power and walls. The only place that ends every event. |
| `SP1` to `SP4` | natural | radiation | partial | Terrain hides 15 to 16 % of the sky. In a solar particle event that cuts the dose by at most as much (SIM upper bound); RAD measured a cut about a fifth of the hidden share (see the limits below). No help in a dust storm or with low oxygen. |

The `HAB` entry is the foot of the airlock steps, not the `HAB` waypoint. The engine places the habitat on the flattest spot within 30 m of the waypoint and turns the airlock toward the first waypoint (`src/engine/habitat.js`). The script repeats that rule on the same height grid and adds the 9.9 m from the habitat origin to the foot of the steps (`habitat.json`, `airlock`). The result is (535.1, 574.1), 30 m from the waypoint at (520, 600).

## Why the terrain helps at all

The tile has no overhang, and a height grid cannot hold one. A natural spot therefore cannot cover the crew. It can only hide part of the sky. During a solar particle event the dose at the surface comes from the sky. The planet blocks the lower half of the sphere, so open flat ground sees the whole upper hemisphere. Terrain that rises above the horizontal hides part of it.

`src/sim/skyView.js` measures how much. For each node of the 751 x 751 grid it casts rays at 48 azimuths out to 400 m or the tile edge, finds the highest elevation angle along each ray from a point 1 m above the ground, and integrates the visible solid angle:

    sky view = mean over azimuths of (1 - sin(horizon elevation))

Open flat ground gives 1. A 20 m deep pit with a 10 m radius gives 0.12 at its centre. The sky view is DERIVED: geometry computed from the HiRISE terrain.

The next step is our assumption. With an isotropic flux above the horizon the dose would scale with the sky view, so `shelters.json` sets the dose reduction to `1 - sky view`. That step, blocked sky equals dose cut, is tagged SIM. It is an upper bound from geometry, not a measurement, and the one measurement on Mars puts the real cut at about a fifth of it.

## Limits of the estimate

- **The one measurement on Mars found about a fifth of the blocked share.** Curiosity's RAD, parked beside Butte M12 in Gale crater with 19 % of the sky blocked, measured about 4 % less dose, and 7.5 % fewer neutral particles (Ehresmann et al. 2021, JGR Planets 126, [doi 10.1029/2021JE006851](https://doi.org/10.1029/2021JE006851)). That is 4 / 19 = 0.21 of the blocked share, measured for galactic cosmic rays; for a solar event the cut is likely smaller. Albedo particles from the ground make up 18 to 24 % of the surface dose (Guo et al. 2026, JGR Planets 131, [doi 10.1029/2026JE009704](https://doi.org/10.1029/2026JE009704)), and a hollow does not hide the ground under the crew.
- The flux at the surface is not isotropic. Particles that arrive at a low angle cross more atmosphere, so most of the dose comes from high in the sky. Hiding the low sky saves less than the isotropic estimate. Read the reduction as an upper bound.
- Secondary particles from the ground and the rock (albedo neutrons) are not counted.
- The galactic background comes from the same sky, so the same fraction applies to it, but over an event of hours it is small.
- Rays stop at the tile edge, so points near the edge get a sky view that is too high. That errs on the safe side.
- 16 % is the most this tile offers on walkable ground under the rules below (best sky view 0.845). The tile median is 0.927 and the lowest 1 % of nodes sit at 0.848 or below. Steeper spots score lower but are no-go for the suit, whose limit is 20 deg. For the September 2017 event (544 µGy measured by RAD in Gale crater) a 15.5 % cut would save at most 84 µGy, the isotropic upper bound. At the ratio RAD measured it is a 3.3 % cut, about 18 µGy, and likely less for a solar event.

## How the points are chosen

1. Walkable patch: every node within 4 m is under the planner's slope limit (`COST_CONSTANTS.SLOPE_LIMIT_DEG`, read through the existing API) and not blocked in the cost grid.
2. At least 60 m inside the tile edge, because rays are cut off there.
3. Sky view 0.88 or lower, that is at least 12 % of the sky hidden (`minDoseReduction`). The file reads it as a dose cut of at least 12 %, the SIM upper bound, not a measured cut.
4. The first point is the lowest sky view within 80 m of the route line HAB, WP1, WP2, WP3, Cheyava Falls. It lands 108 m of walking from Cheyava Falls, the far end of the route, where the habitat is 824 m away.
5. The rest are the lowest sky view on the tile, at least 300 m from every point already chosen, up to four in total.
6. Each point must be reachable from the HAB entry with the A* planner.

## How the planner uses the file

`src/sim/shelters.js` reads the file:

- `sheltersForEvent(data, eventId)` returns the `{id, name, x, z}` list that `replanToNearestShelter` takes, HAB first.
- `replanForEvent(grid, from, data, eventId)` tries the full shelters first and falls back to the partial ones only when the habitat cannot be reached. Without that rule the cheapest route would often win, and the crew would sit in a hollow that cuts at most 15 % of the dose, and nearer 3 % by RAD's measurement, instead of walking to a habitat that cuts most of it.

No event uses the partial fallback today. The radiation alert, the dust storm and the low oxygen warning all re-plan to the habitat (`"target": "habitat"` in `src/sim/events/*.json`). On screen the natural points appear as the shelter markers of the Exposure layer on the mission table, labelled with the share of sky they hide, and as refuges on the HUD minimap.

Choosing between shelters by dose, time and distance is issue #23.

## After the hackathon

Scaling the reduction by the ratio RAD measured (4 / 19) is the honest fix ([#296](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/296)). It leaves no natural point above the 12 % minimum:

| Point | Sky hidden, the upper bound | Scaled by 4 / 19 | September 2017 event, saved at most | Scaled |
|---|---:|---:|---:|---:|
| SP1 | 15.0 % | 3.2 % | 82 µGy | 17 µGy |
| SP2 | 15.6 % | 3.3 % | 85 µGy | 18 µGy |
| SP3 | 15.5 % | 3.3 % | 84 µGy | 18 µGy |
| SP4 | 15.4 % | 3.2 % | 84 µGy | 18 µGy |

In round numbers, 15 % and 16 % become 3.2 % and 3.4 %. To pass the minimum after scaling, a point would have to hide 57 % of the sky (sky view 0.43). The lowest node on the whole tile, walkable or not, hides 19 % (sky view 0.807), which scales to 4.1 %. So on this tile only the habitat shelters from radiation.

We kept the upper bound for the hackathon, tagged SIM, because dropping the natural points on submission day would change the Exposure layer, the minimap refuges and the tests that pin SP1 to SP4. When someone makes the change: scale `dose_reduction` in `scripts/build-shelters.mjs` by the measured ratio and cite Ehresmann et al. 2021, decide whether the natural points stay as places with a known sky view and no radiation claim or go, remove the script's "no safe point near the route" error if they go, then rerun `npm run shelters` and `npm run credits` and update the tests.
