# Shelters and safe points

The route planner sends the crew to a shelter when an event starts. `public/data/shelters.json` lists the places it can use. `npm run shelters` rebuilds the file from the terrain with `scripts/build-shelters.mjs`. Do not edit the file by hand.

## What counts as a shelter

| Id | Type | Events | Protection | Why |
|---|---|---|---|---|
| `HAB` | habitat | radiation, dust storm, low oxygen | full | Pressurised, with air, power and walls. The only place that ends every event. |
| `SP1` to `SP4` | natural | radiation | partial | Terrain hides 16 to 17 % of the sky, so a solar particle event gives that much less dose. No help in a dust storm or with low oxygen. |

The `HAB` entry is the foot of the airlock steps, not the `HAB` waypoint. The engine places the habitat on the flattest spot within 30 m of the waypoint and turns the airlock toward the first waypoint (`src/engine/habitat.js`). The script repeats that rule on the same height grid and adds the 9.9 m from the habitat origin to the foot of the steps (`habitat.json`, `airlock`). The result is (535.1, 574.1), 30 m from the waypoint at (520, 600).

## Why the terrain helps at all

The tile has no overhang, and a height grid cannot hold one. A natural spot therefore cannot cover the crew. It can only hide part of the sky. During a solar particle event the dose at the surface comes from the sky. The planet blocks the lower half of the sphere, so open flat ground sees the whole upper hemisphere. Terrain that rises above the horizontal hides part of it.

`src/sim/skyView.js` measures how much. For each node of the 751 x 751 grid it casts rays at 48 azimuths out to 400 m or the tile edge, finds the highest elevation angle along each ray from a point 1 m above the ground, and integrates the visible solid angle:

    sky view = mean over azimuths of (1 - sin(horizon elevation))

Open flat ground gives 1. A 20 m deep pit with a 10 m radius gives 0.12 at its centre. With an isotropic flux above the horizon, the dose scales with the sky view, so the dose reduction is `1 - sky view`.

## Limits of the estimate

- The flux at the surface is not isotropic. Particles that arrive at a low angle cross more atmosphere, so most of the dose comes from high in the sky. Hiding the low sky saves less than the isotropic estimate. Read the reduction as an upper bound.
- Secondary particles from the ground and the rock (albedo neutrons) are not counted.
- The galactic background comes from the same sky, so the same fraction applies to it, but over an event of hours it is small.
- Rays stop at the tile edge, so points near the edge get a sky view that is too high. That errs on the safe side.
- 17 % is the most this tile offers on walkable ground under the rules below. The tile median is 0.927 and the lowest 1 % of nodes sit at 0.848 or below. Steeper spots score lower but are no-go for the suit. For the September 2017 event (544 µGy measured by RAD in Gale crater) a 16 % cut saves about 90 µGy.

## How the points are chosen

1. Walkable patch: every node within 4 m is under the planner's slope limit (`COST_CONSTANTS.SLOPE_LIMIT_DEG`, read through the existing API) and not blocked in the cost grid.
2. At least 60 m inside the tile edge, because rays are cut off there.
3. Sky view 0.88 or lower, that is a dose cut of at least 12 %.
4. The first point is the lowest sky view within 80 m of the route line HAB, WP1, WP2, WP3, Cheyava Falls. It lands 97 m of walking from Cheyava Falls, the far end of the route, where the habitat is 792 m away.
5. The rest are the lowest sky view on the tile, at least 300 m from every point already chosen, up to four in total.
6. Each point must be reachable from the HAB entry with the A* planner.

## How the planner uses the file

`src/sim/shelters.js` reads the file:

- `sheltersForEvent(data, eventId)` returns the `{id, name, x, z}` list that `replanToNearestShelter` takes, HAB first.
- `replanForEvent(grid, from, data, eventId)` tries the full shelters first and falls back to the partial ones only when the habitat cannot be reached. Without that rule the cheapest route would often win, and the crew would sit in a hollow that cuts 16 % of the dose instead of walking to a habitat that cuts most of it.

Choosing between shelters by dose, time and distance is issue #23.
