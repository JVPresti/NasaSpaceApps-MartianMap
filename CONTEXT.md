# Project context

Start here. This page tells you, human or agent, what Marswalk is, the rules every change must respect, and where each part lives. It points to the detailed documents rather than repeating them.

## What we are building

**Marswalk** is our entry for the NASA Space Apps Challenge 2026 Mars track. The track asks for a layered, integrated view of a place on Mars, built from data from several NASA missions, that helps an astronaut plan and carry out a marswalk safely while doing science.

Our answer is a first-person EVA simulator. The player is an astronaut walking from the habitat to the **Cheyava Falls** rock in Neretva Vallis, on real HiRISE terrain. **The map is the product**; the simulator is the test bench that shows the map working where it matters: in the helmet, while walking, with limited oxygen.

The reasoning, and the track requirements one by one, are in [section 2 of the plan](docs/IMPLEMENTATION_PLAN.md#2-why-this-idea-fits-the-track).

## Scope

- **Jezero crater only** (site code JEZ in the USGS products). Do not add other Mars locations.
- **The site** is a 1422.5 m (east-west) × 1500 m (north-south) tile centred on Cheyava Falls (18.4975 N, 77.3053 E, Perseverance waypoint of sol 1210), plus a 12 km CTX ring for the horizon.
- **The science goal** is to sample Cheyava Falls and the Bright Angel outcrop, where Perseverance reported a potential biosignature in 2025.

## The product

| Mode | What it is |
|---|---|
| **Plan** | The site from above: data layers, the planned route and its cost, go or no-go. |
| **Walk** | First person: helmet HUD (visor), wrist screen, the partner astronaut, the habitat. |

- **Must-have events**: dust storm, radiation alert and low oxygen. Each raises an alert and re-plans the route to the nearest shelter. The habitat is the main shelter.
- **Other scenarios**: arrival and sampling at Cheyava Falls, a dangerous slope, an unexpected find, walking in a pair and a support rover. They come later, in the priority order of [plan section 3.4](docs/IMPLEMENTATION_PLAN.md#34-scenarios).
- **Design rule**: the visor carries only what is needed while walking. Anything that takes reading goes to the wrist or to Plan mode.

The full set of HUD mockups lives with the design team, outside the repository. Five are copied into `docs/img/`. The Figma pass is scheduled last (#11).

## Realism rules

These apply to every feature. Reviewers check them.

1. **Every number on screen says where it comes from** with one of three tags:
   - **DATA**: measured by a NASA mission. Shown with mission, site and sol or date.
   - **DERIVED**: computed by us from data, for example slope or a route.
   - **SIM**: our model or a scripted event, for example oxygen use or the storm timing.
2. **Observations are historical.** MEDA weather is a replay of a real sol, labelled with its sol number. Never present it as live.
3. **RAD radiation was measured by Curiosity in Gale crater,** not in Jezero. Say so wherever it is shown.
4. **There is no GPS on Mars and no usable compass.** Position is an estimate with an error ring:
   - Dead reckoning makes the error grow with distance walked.
   - A terrain fix (helmet cameras matched to the orbital map, the method Perseverance uses since February 2026) resets it.
   - Never write "GPS" in the interface. Details are in [plan section 4.2](docs/IMPLEMENTATION_PLAN.md#42-navigation-without-gps).
5. **A 1 m elevation model does not see small rocks.** A route is advice, not a safety certificate.
6. **What is real and what is not** in the 3D scene is listed in the [assets README](docs/marswalk-assets/README.md):
   - Real: terrain shape and photo.
   - Artistic: the Mars colour, which is a tint because HiRISE is grayscale.
   - Modelled: rocks follow a statistical model, and the Cheyava Falls rock is hand-made.

## Coordinates and units

- Metres, true ground scale. **x east, y up, z south.** Origin at Cheyava Falls.
- Heights in `terrain.json` are relative to the lowest point of the tile. Add `base_elev_m` (-2393.37 m) for MOLA elevation.
- Height grid: 751 × 751 at 2 m spacing. Row 0 is north, column 0 is west.
- Time: one sol is 24 h 39 min 35 s. Derive mission time from a start timestamp, never by adding up frame times.

## Architecture

**Stack**: Vite + React 19 (plain JavaScript, oxlint), three.js for the 3D scene, a small store between them, and static data files. There is no backend; players online (Supabase Realtime) is a stretch goal.

Each layer depends only on the layers below it:

| Layer | Folder | Rule |
|---|---|---|
| Interface (React) | `src/App.jsx`, `src/components/`, later `src/hud/`, `src/plan/` | Reads the store. Never renders per frame. |
| State store | `src/state/` (#6) | One snapshot that the interface reads. |
| Simulation | `src/sim/` | Plain JavaScript, **no React and no three.js imports**, so it runs in Web Workers and in tests. |
| Engine | `src/engine/` (#5, PR #82) | three.js. Owns its canvas and render loop. No React. |
| Data | `public/marswalk/`, `public/data/` | Static files, loaded once. |

What exists today:

- **`src/sim/costGrid.js`**: walkability grid from slope and rock density; cells over 25° are blocked.
- **`src/sim/routePlanner.js`**, `routePlanner.worker.js`, `routePlannerClient.js`: A* in a Web Worker. Output is the `path` format of `route.json`: `[[x, z], ...]`.
- **`src/sim/eventEngine.js`**: data-driven events (trigger, timeline, alert, planner request). The contract is in [docs/EVENT_ENGINE.md](docs/EVENT_ENGINE.md).
- **`src/engine/`** (PR #82): the test bench ported to a module. `createEngine(container, { assetBase, mode, onStatus, onError })` returns `{ ready, setMode('plan' | 'walk'), dispose() }`. Subsystems share one context object and reach each other through `ctx.sys`. Each file names the test bench lines it came from.
- **Reference only**: `docs/marswalk-assets/testbench-reference/` is the original single-file test bench. It is not the app; do not import from it.

**Map and models come from Blender.** One scene (`marswalk_jezero_real.blend`, kept in Git LFS, #7) exports both the visible terrain mesh and the height grid, so the two always agree. Models are served as binary `.glb`; never use the `.glb.json` copies that the old preview host needed. Code finds objects by their Blender names (for example `HabitatHatch`); do not rename them without telling App. Export script: #8.

## Data

| Kind | Source | Status |
|---|---|---|
| Optical (orbit) | HiRISE orthomosaic 25 cm, CTX mosaic 6 m (USGS, Mars 2020 TRN) | In `public/marswalk/assets/` |
| Topographic | HiRISE DTM 1 m, CTX DEM 20 m | In `public/marswalk/assets/` |
| Atmospheric | MEDA, Perseverance (PDS) | #31 |
| Radiation | RAD, Curiosity (PDS) | #31 |
| Hazard numbers with sources | storm, radiation, suit oxygen use | #18 |
| Surface images | Mastcam-Z of Bright Angel, sols 1187 to 1217 | #37 |

Raw NASA downloads (several GB) never go into the browser or into Git. Process them offline and ship small files.

## Working here

- **Every change goes Issue → Branch → Pull Request → Review → Squash merge.** Never commit to `main`. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
- Issue titles start with `[Feature]`, `[Task]` or `[Bug]`. Pull request titles use `type(scope): description`. One pull request closes one issue.
- `npm run lint` and `npm run build` must pass; CI runs both on every pull request. Tests use Vitest (#78) and live next to the module as `name.test.js`.
- Issues are grouped into milestones by phase. Priority labels P0 to P3 map to the task list's Imprescindible, Importante and Si da tiempo, plus a stretch level.

## Team areas

| Area | Owner (GitHub) |
|---|---|
| 3D model design (Blender) | `tessarivas` |
| Other Blender and graphics work: export, effects | `andreagori` |
| Route planner, event engine, Plan mode | `JVPresti` |
| App shell, engine, Walk mode, HUD, suit and navigation | `keiwv` |
| Data, science content, shelters | `Scalaptia` |
| Interface and tooling issues | `Anrago` |

Figma, the rules check, the demo video and the submission form are left for the end and are unassigned on purpose.

## Read more

- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): the full plan, with phases, backlog, demo script, risks and open questions. The Spanish version is `docs/Marswalk_Plan_de_Implementacion.docx`.
- [docs/marswalk-assets/README.md](docs/marswalk-assets/README.md): every asset file, the coordinates, credits, and what is real.
- [docs/EVENT_ENGINE.md](docs/EVENT_ENGINE.md): how to define an event.
- [docs/STATE_AND_ENGINE.md](docs/STATE_AND_ENGINE.md): the mission store snapshot and the engine API.
- [Issues](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues) and [milestones](https://github.com/JVPresti/NasaSpaceApps-MartianMap/milestones): what is being worked on now.

## Glossary

| Term | Meaning |
|---|---|
| EVA | Extravehicular activity: the walk outside. |
| Walkback | Time needed to walk back to the habitat from where you are. If walkback plus a reserve exceeds the oxygen left, turn back. |
| Sol | A Mars day, 24 h 39 min 35 s. |
| LMST | Local mean solar time at the site. |
| Tau (τ) | Dust opacity of the atmosphere; it rises in a dust storm. |
| HiRISE, CTX | Cameras on Mars Reconnaissance Orbiter (high-resolution and context). |
| DTM / DEM | Digital terrain / elevation model: the height grid. |
| TRN | Terrain Relative Navigation: Mars 2020 matched camera images to an orbital map to land. The terrain products we use were made for it. |
| MEDA | Perseverance's weather station. |
| RAD | Curiosity's radiation detector, in Gale crater. |
| Tier | Rendering quality, High or Low, chosen automatically from the GPU. |
