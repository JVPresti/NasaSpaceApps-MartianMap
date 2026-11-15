# Marswalk

**On Mars, the question isn't where you can go. It's where you can go and still get home.**

![The Marswalk mission table: the fastest route from the habitat to Cheyava Falls drawn on the HiRISE image of Neretva Vallis, Perseverance's drives in white, and the fastest, gentlest and radio-contact routes compared in kilometres, degrees, minutes and grams of oxygen](docs/img/readme-mission-table.jpg)

*The mission table. The gentlest route spends 104 m on slopes over 15°, the fastest 151 m, for the same 19 minutes and 45 g of oxygen. White lines are Perseverance's real drives.*

**Live:** https://martian-map.fernando-haro-c.workers.dev. Open it in a desktop browser. There is no account, and the first load pulls about 20 MB of terrain and models.

- Marswalk turns NASA's HiRISE terrain model of Jezero crater, made to land Perseverance, into a slope map that blocks ground steeper than NASA's 20° suited walking limit. It plans routes across 1.4 by 1.5 km of Neretva Vallis to Cheyava Falls, the rock where Perseverance found a potential biosignature.
- It costs every route in minutes and grams of oxygen, using the 771 g tank of NASA's xEMU suit design, burn rates from NASA suited walking tests and Apollo's 30-minute reserve. Then you walk it in first person with the oxygen margin on your visor.
- It replays real Mars data on the walk. The weather is sol 1187 from Perseverance's MEDA station. The solar storm is September 2017, from NASA's DONKI and Curiosity's RAD. Perseverance's 47 drives across the site are on the map.

NASA Space Apps Challenge 2026, Interplanetary Survival Guide: Martian Map, Ensenada local event. Team Los Frijolitos Espaciales Refritos Nueva Generación.

## For judges

### Try it in 2 minutes

1. Open the live link and click **Open the mission table**.
2. Go to **Route**. The table compares three routes to Cheyava Falls: fastest, gentlest and in radio contact with the habitat. Switch the map layer to **Slope** to see the ground the planner refuses to cross.
3. Press **Begin EVA**. Walk with W A S D or the arrow keys, look with the mouse, jog with Shift. Your visor shows oxygen, the margin before you must turn back, the next waypoint and how far your position estimate may be off. Mars has no GPS.
4. Press **M** to go back to the map at any time, **R** for the wrist screen, **C** for every source, **H** for all controls.
5. Stay outside to see the hazards. The dust storm arrives 8 minutes into the EVA and the radiation alert at 12 minutes. Each one re-plans your route to the habitat.

Touch and gamepad work too. [docs/CONTROLS.md](docs/CONTROLS.md) lists every input. To run it locally: `npm install`, then `npm run dev`.

### What is measured and what is simulated

Every number on screen carries one of three tags. Hover a tag to see the mission, instrument, sol and reference.

| Tag | Meaning | Examples |
|---|---|---|
| DATA | A NASA mission measured it, or a NASA document states it | Terrain heights, MEDA temperature and pressure, the RAD dose rate, the 20° slope limit, the 771 g oxygen tank |
| DERIVED | We calculated it from data | Slope, route distance and climb, the oxygen left in the tank as you walk |
| SIM | Our model, our assumption or a scripted event | The 15° caution slope, the walking time and oxygen of a planned route (they rest on our walking-speed rule), the rock abundance layer, your position drift |

We checked 109 numbers against their primary sources: 79 match, 11 are our stated assumptions, 16 had a wrong value, tag or wording, and 3 come from a paper we could not open. Each problem has an issue. The table is [docs/VALIDITY.md](docs/VALIDITY.md).

Walking runs in real time. The hazards do not. The dust storm builds in 90 seconds where the real one took up to a sol, and the radiation event squeezes 57 hours of the September 2017 solar storm into 12 minutes, from its measured background to its measured peak dose rate with our steps in between.

Three limits apply everywhere:

- The weather and the solar storm come from past days, never live data.
- Curiosity measured the radiation in Gale crater. No instrument has measured it at Jezero, and the visor says so.
- The terrain comes from a 1 m HiRISE model resampled to a 2 m grid. It does not see small rocks, so a route is advice, not a safety certificate.

### Sources

The terrain is the USGS HiRISE and CTX products for Mars 2020 terrain-relative navigation. Our height grid reproduces the HiRISE model on NASA Mars Trek to 0.14 m RMS ([docs/data/mars-trek-check](docs/data/mars-trek-check/README.md)). The suit numbers come from NASA technical reports on NTRS, the weather and radiation from the PDS archives, the solar flare from DONKI, the rover drives from the Mars 2020 MMGIS map. [docs/credits.md](docs/credits.md) lists every dataset, paper, model and library with its credit and licence. Press **C** in the app for the same list. The suit and habitat models come from NASA 3D Resources. NASA does not endorse Marswalk.

### Team

Los Frijolitos Espaciales Refritos Nueva Generación. Areas follow who wrote what in the git history.

| Member | Area |
|---|---|
| Teresa Rivas Gómez | 3D models in Blender, interface design, the visor |
| Andrea Rivas Gómez | Blender export, graphics effects in the engine |
| Fernando Haro Calvo | NASA data, science content, shelters, deploys |
| Jorge Antonio Vazquez Guzmán | Route planner, event engine, Plan mode |
| Antonio Ramos Gonzalez | Interface, tooling, tests and CI |
| Brayan Iván Pérez Ventura (`keiwv`) | App shell, engine, Walk mode, HUD, suit and navigation |

### Use of SI and prior work

We built Marswalk with SI tools (the 2026 rules' word for AI). We used an AI assistant to compare challenges and talk through the concept on 13 November. AI coding agents wrote most of the code from our issues. Almost every change reached `main` through a pull request, and since 11:06 am on 14 November CI has checked each one. A teammate other than the author reviewed 38 of the 134 pull requests merged by 15 November. AI research agents found the NASA reports and papers, and an audit run with AI agents and reviewed by us traced 109 numbers to them. We generated the start screen video, its poster and the three hazard illustrations with Higgsfield. They are artwork, not mission images, and none shows a NASA logo or flag. No SI model runs inside the app. The planner is A* and the suit model is a formula.

Before the event started, on 12 and 13 November, our graphics team prepared the HiRISE and CTX terrain tile, the rigged Z-2 suit, the habitat, two props and a three.js test bench. During the event we ported the app's rendering engine from that test bench and wrote everything else. The full disclosure, the prior-work statement and our reading of the NASA insignia rules are in [docs/RULES.md](docs/RULES.md).

## For developers

[![CI](https://github.com/JVPresti/NasaSpaceApps-MartianMap/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JVPresti/NasaSpaceApps-MartianMap/actions/workflows/ci.yml)

Demo: https://martian-map.fernando-haro-c.workers.dev

Every pull request gets its own preview link, posted as a comment on the pull request. See [docs/deploy.md](docs/deploy.md) for hosting, access and redeploys.

## Contributing

The workflow in [CONTRIBUTING.md](CONTRIBUTING.md) is issue, branch, pull request, review, then squash merge, and it has the naming conventions. Six commits on the morning of 14 November went straight to `main`: the repository setup, the Vite template, two commits that added agent skills, and two merges, one of which brought in the pre-event assets. Since 10:02 am that day, every change has reached `main` through a pull request, and since 11:06 am CI checks each one. A teammate other than the author reviewed 38 of the 134 pull requests merged by 15 November.

## Testing

Use Node.js `^22.12.0`, `^24`, or `>=26`, as required by Vitest 5.

Run the suite once with `npm test` (`vitest run`, no watch mode). Vitest reuses `vite.config.js`, so there is no separate test config.

Tests are required for critical logic: the engine and simulation (cost grid, route planner, re-planning and event engine), models (suit, oxygen and time), and computed animation or timing. Test behaviour and results, such as a route avoiding blocked cells or an event firing at the right mission time.

Tests are not needed for static text, labels, copy, sizes, styling, layout values, trivial getters or pass-through code.

When a module needs tests, put plain JavaScript unit tests next to it (`name.js` and `name.test.js`), with no browser, visual or React rendering tests. For example, `src/sim/heightGrid.js` is tested by `src/sim/heightGrid.test.js`.
