# Marswalk

**On Mars, the question isn't where you can go. It's where you can go and still get home.**

![The Marswalk mission table: the fastest route from the habitat to Cheyava Falls drawn on the HiRISE image of Neretva Vallis, Perseverance's drives in white, and the fastest, gentlest and radio-contact routes compared in kilometres, degrees, minutes and grams of oxygen](docs/img/readme-mission-table.jpg)

**Live:** https://martian-map.fernando-haro-c.workers.dev. It runs in the browser with no login and no install.

- Marswalk turns NASA's HiRISE terrain model of Jezero crater, made to land Perseverance, into a slope map that blocks ground steeper than NASA's 20° suited walking limit. It plans routes across 1.4 by 1.5 km of Neretva Vallis to Cheyava Falls, the rock where Perseverance found a potential biosignature.
- It costs every route in minutes and grams of oxygen, using the 771 g tank of NASA's xEMU suit design, burn rates from NASA suited walking tests and Apollo's 30-minute reserve. Then you walk it in first person with the oxygen margin on your visor.
- It replays real Mars data on the walk. The weather is sol 1187 from Perseverance's MEDA station. The solar storm is September 2017, from NASA's DONKI and Curiosity's RAD. Perseverance's 47 drives across the site are on the map.

NASA Space Apps Challenge 2026, Interplanetary Survival Guide: Martian Map, Ensenada local event.

## For judges

### Try it in 2 minutes

1. Open the live link and click **Open the mission table**.
2. Go to **Route**. The table compares three routes to Cheyava Falls: fastest, gentlest and in radio contact with the habitat. Switch the map layer to **Slope** to see the ground the planner refuses to cross.
3. Press **Begin EVA**. Walk with W A S D or the arrow keys, look with the mouse, jog with Shift. Your visor shows oxygen, the margin before you must turn back, the next waypoint and how far your position estimate may be off. Mars has no GPS.
4. Press **M** to go back to the map at any time, **R** for the wrist screen, **C** for every source, **H** for all controls.
5. Stay outside to see the hazards. The dust storm arrives 8 minutes into the EVA and the radiation alert at 12 minutes. Each one re-plans your route to the habitat.

Touch and gamepad work too. [docs/CONTROLS.md](docs/CONTROLS.md) lists every input.

### What is measured and what is simulated

Every number on screen carries one of three tags. Hover it to see the mission, instrument, sol and reference.

| Tag | Meaning | Examples |
|---|---|---|
| DATA | A NASA mission measured it, or a NASA document states it | Terrain heights, MEDA temperature and pressure, the RAD dose rate, the 20° slope limit, the 771 g oxygen tank |
| DERIVED | We calculated it from data | Slope, route distance and climb, the walking time and oxygen of a route |
| SIM | Our model, our assumption or a scripted event | The 15° caution slope, the storm's 90-second build-up, the 12-minute radiation event, your position drift |

We checked all 106 numbers against their primary sources: 81 match, 13 are our stated assumptions, and 11 had the wrong value, tag or wording. Each of those has an issue. The table is [docs/VALIDITY.md](docs/VALIDITY.md).

Three limits apply everywhere:

- The weather and the solar storm are replays of past days, never live data.
- Radiation was measured by Curiosity in Gale crater. No instrument has measured it at Jezero, and the visor says so.
- The terrain comes from a 1 m HiRISE model resampled to a 2 m grid. It does not see small rocks, so a route is advice, not a safety certificate.

### Sources

The terrain is the USGS HiRISE and CTX products for Mars 2020 terrain-relative navigation. Our tile matches the HiRISE model on NASA Mars Trek to 0.14 m RMS ([docs/data/mars-trek-check](docs/data/mars-trek-check/README.md)). The suit numbers come from NASA technical reports on NTRS, the weather and radiation from the PDS archives, the solar flare from DONKI, the rover drives from the Mars 2020 MMGIS map. [docs/credits.md](docs/credits.md) lists every dataset, paper, model and library with its credit and licence. Press **C** in the app for the same list.

### Team

| Area | GitHub |
|---|---|
| 3D models in Blender | `tessarivas` |
| Blender export and graphics effects | `andreagori` |
| Route planner, event engine, Plan mode | `JVPresti` |
| App shell, engine, Walk mode, HUD, suit and navigation | `keiwv` |
| Data, science content, shelters | `Scalaptia` |
| Interface and tooling | `Anrago` |

### Use of SI and prior work

We built Marswalk with SI tools (the 2026 rules' word for AI). AI coding agents wrote most of the code from our issues, and every change went through a reviewed pull request. AI research agents found the NASA reports and papers, and we checked each number by hand. The start screen video and the three hazard illustrations were generated with Higgsfield. They are artwork, not mission images. No SI model runs inside the app: the planner is A* and the suit model is a formula. Our 3D assets were prepared on 12 and 13 November, before the event started. The full disclosure, the prior-work statement and our reading of the NASA insignia rules are in [docs/RULES.md](docs/RULES.md).

## For developers

[![CI](https://github.com/JVPresti/NasaSpaceApps-MartianMap/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JVPresti/NasaSpaceApps-MartianMap/actions/workflows/ci.yml)

Demo: https://martian-map.fernando-haro-c.workers.dev

Every pull request gets its own preview link, posted as a comment on the pull request. See [docs/deploy.md](docs/deploy.md) for hosting, access and redeploys.

## Contributing

All changes go through an issue and a reviewed pull request. Nobody pushes directly to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and the naming conventions.

## Testing

Use Node.js `^22.12.0`, `^24`, or `>=26`, as required by Vitest 5.

Run the suite once with `npm test` (`vitest run`, no watch mode). Vitest reuses `vite.config.js`, so there is no separate test config.

Tests are required for critical logic: the engine and simulation (cost grid, route planner, re-planning and event engine), models (suit, oxygen and time), and computed animation or timing. Test behaviour and results, such as a route avoiding blocked cells or an event firing at the right mission time.

Tests are not needed for static text, labels, copy, sizes, styling, layout values, trivial getters or pass-through code.

When a module needs tests, put plain JavaScript unit tests next to it (`name.js` and `name.test.js`), with no browser, visual or React rendering tests. For example, `src/sim/heightGrid.js` is tested by `src/sim/heightGrid.test.js`.
