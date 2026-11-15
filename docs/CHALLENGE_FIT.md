# Challenge fit

Every line of the [challenge statement](CHALLENGE.md) that asks for or suggests something, matched against what Marswalk does, with evidence and a verdict.

- **Checked against**: `main` at 013f2d5, Brayan Iván Pérez Ventura's draft #282 at 8ec6f72, and four pieces of work in flight.
- **Verdicts**: strong means a judge can see it working on `main`. Partial means part of it works, or it works with a caveat a judge would catch. Missing means it is not there.
- **In progress** marks a row whose verdict changes when one of these lands: #290 (habitat-first flow), `feat/ev2-crewmate` (EV2 as a real crewmate, #288), `feat/return-zone` (#335 for #309, the area you can reach and still get home) and `feat/present-mode` (#291).
- **Screenshots** are in [`docs/img/challenge-fit/`](img/challenge-fit/), taken on `main` at 1366 × 768 on 2026-11-15. The 16 test files named below all pass on `main`. They ran together with `dust-storm.test.js`: 17 files, 212 tests.

## Summary

Marswalk answers the statement's core request. It is a layered view of one route, built from three NASA missions plus the DONKI space weather database, used to plan and then walk an EVA. It is strong on hyperlocal scale, the science goal and site, the route map, the habitat and visor formats, and on tagging every number with its source.

Nothing is missing outright, but ten rows are partial. Two weaknesses show on screen and a judge will find them:

- **Obstacles.** The Fastest route runs straight across the ripple field that Perseverance drove around, and touches the 20° no-go limit. The planner prices a rock-cover estimate made from image brightness, so bright sand crests count as rocks and no single boulder is avoided.
- **Safety numbers disagree between screens.** On `main`'s Cheyava Falls plan with the Fastest profile, the Suit tab gives a +245 min margin and the HUD +457 min at the airlock. #282's first sortie gives +285 and +479 for the same reason (the report in #338 uses those). The radiation card says 29.9 µGy/h and the alert banner 10.0 µGy/h.

Verdicts on `main`: 13 strong, 10 partial, 0 missing. #282 moves current conditions to strong. Three AI reviewers, each playing a judge's role, first saw a version with 17 strong. The [reviewers section](#what-the-ai-reviewers-changed) says what they proved wrong.

## Fit matrix

| # | The statement says (verbatim) | Where Marswalk does it | Evidence | Verdict |
|---|---|---|---|---|
| 1 | "create a layered, integrated view of a location or route on the Martian surface" | **main**: Route tab of the mission table. The planned route sits over the HiRISE image, with Slope, Elevation, Rocks, Outcrop and Rover layers (`src/plan/MissionMap.jsx`, `src/plan/layers.js`). **#282**: merges Elevation into Terrain, adds Radio shadow and Exposure layers, a DATA, DERIVED or SIM tag per layer (`LayerLegend.jsx`). | [2-route-tab-rocks.jpg](img/challenge-fit/2-route-tab-rocks.jpg) | Strong |
| 2 | "pulls together data from multiple NASA science missions" | **main**: MRO (HiRISE image from a 25 cm source, 1 m DTM, CTX), Mars 2020 (MEDA weather, Mastcam-Z, SHERLOC and PIXL results, the rover traverse), Curiosity (RAD dose, dust opacity) and DONKI. 62 sources in `public/data/credits.json`; each number carries its source (`src/data/provenance.js`). | `credits.test.js`, `provenance.test.js`, `medaRad.test.js` | Strong |
| 3 | "hyperlocalized areas astronauts will target on individual spacewalks" | **main**: one 1422.5 × 1500 m tile. The HiRISE source is 25 cm per pixel, but the app shows it at about 0.5 m per pixel. `ortho_hi.jpg` is 3000 px on each side, so a pixel covers 0.5 m north to south (1500 m) and 0.47 m east to west (1422.5 m). The height grid is 751 × 751 at 2 m. Mars Trek and the USGS maps stop at regional views. | [1-site-tab.jpg](img/challenge-fit/1-site-tab.jpg) | Strong |
| 4 | "a map, tool, or interface a Mars astronaut could use during a surface exploration mission" | **main**: Plan mode (the mission table) to plan, Walk mode (visor HUD and wrist screen) to carry out. | [2-route-tab-rocks.jpg](img/challenge-fit/2-route-tab-rocks.jpg), [5-walk-hud.jpg](img/challenge-fit/5-walk-hud.jpg) | Strong |
| 5 | "identifying some scientific goals for your mission and the location the astronaut will explore" | **main**: the Site tab opens first. Goal: sample Cheyava Falls, where NASA reported a potential biosignature in 2025, plus the Bright Angel outcrop. The goal is fixed, not chosen. **#282**: `NeedsPanel.jsx` asks for goal, crew, time, O2 and risk, and `missionNeeds.js` picks the stops. | [1-site-tab.jpg](img/challenge-fit/1-site-tab.jpg), `stops.test.js` | Strong |
| 6 | "start with a location one of NASA's Mars Rovers or another mission has explored extensively" | **main**: origin at Perseverance's sol 1210 waypoint. Perseverance's drives for sols 1140 to 1266 are drawn on the map (`src/plan/TraverseLayer.jsx`, `public/data/traverse.json`). | [1-site-tab.jpg](img/challenge-fit/1-site-tab.jpg), `traverse.test.js` | Strong |
| 7 | "at least three kinds of data—optical, thermal, spectral, topographic, geophysical, atmospheric, radiation, and chemical" | **main**: optical (HiRISE, Mastcam-Z), topographic (DTM, slope), atmospheric (MEDA temperature, wind, opacity), radiation (RAD) and chemical (SHERLOC and PIXL findings on the stop card). Map layers cover optical and topographic; atmospheric and radiation sit on the HUD and the hazard cards. No thermal or spectral data. The statement asks for data "layered or combined ... for navigating"; only optical and topographic data, and layers derived from them, are on the map, one at a time. **#282**: adds Radio shadow and Exposure layers (derived). | [5-walk-hud.jpg](img/challenge-fit/5-walk-hud.jpg), [3-hazards-tab.jpg](img/challenge-fit/3-hazards-tab.jpg) | Partial |
| 8 | "updates on current conditions" | **main**: the HUD shows temperature, wind, opacity and dose from a replayed MEDA sol, tagged DATA, and alert banners during the walk. Before go or no-go the table shows no conditions at all. **#282**: `OutlookStrip.jsx` gives weather, dust and space weather over the planned walk (#248). | [5-walk-hud.jpg](img/challenge-fit/5-walk-hud.jpg); #282: `outlook.test.js`, `OutlookStrip.test.jsx` | Partial (strong with #282) |
| 9 | "NASA's first priority is always astronaut safety, so consider what information might help a crew move safely" | **main**: ground over 20° is blocked in the planner. A walkback margin is always on the HUD. Low-oxygen caution and warning. Storm and radiation alerts re-plan the route to the habitat (`src/sim/replan.js`). Two caveats. The margin has two definitions. The HUD takes the smaller of the O2 margin at the current burn rate and the 8 h EVA clock (`suitReadout` in `src/sim/suitModel.js`), so on the Fastest profile it reads +457 min at the airlock while the Suit tab reads +245. And low oxygen shows as "Can happen in this run", but its trigger is a margin under 15 min, which this route never reaches unless forced. **In progress**: #335 (`feat/return-zone`) draws the margin as an area on the map with two Dijkstra passes over the height grid. It depends on #282. `feat/present-mode` holds only a straight-line placeholder. | [3-hazards-tab.jpg](img/challenge-fit/3-hazards-tab.jpg), [6-radiation-alert.jpg](img/challenge-fit/6-radiation-alert.jpg), `replan.test.js`, `costGrid.test.js`, `shelters.test.js` | Partial |
| 10 | "the radiation environment on Mars differs ... so you might include space weather data" | **main**: radiation alert replays RAD dose rates from the September 2017 solar particle event, with the DONKI flare record, labelled "Gale crater, not Jezero". The route goes to the habitat (ALARA). The hazard card promises 29.9 µGy/h; the banner shows 10.0 µGy/h and the HUD dose 0 µGy. Open bugs #294, #295 and #296 affect the dose numbers and tags. | [3-hazards-tab.jpg](img/challenge-fit/3-hazards-tab.jpg), [6-radiation-alert.jpg](img/challenge-fit/6-radiation-alert.jpg), `radiation.test.js`, `eventEngine.test.js` | Partial |
| 11 | "wearing spacesuits and possibly carrying scientific equipment and other supplies. Consider how this might impact their mobility" | **main**: `src/sim/suitModel.js` prices walking with Minetti's gradient cost at 202.4 kg of body plus suit (NASA walkback test), slows uphill, and draws oxygen and battery from the metabolic rate. Carried tools add no mass. EV2 carries the sample case, but its mass is not in either walker's cost. Open bugs #298 and #299 on the rates. | [4-suit-tab.jpg](img/challenge-fit/4-suit-tab.jpg), `suitModel.test.js` | Partial |
| 12 | "include a route map that shows where the astronaut will travel to accomplish their scientific objectives" | **main**: habitat → WP1 → WP2 → WP3 Bright Angel → Cheyava Falls, 0.91 km and 19 min out. Fastest, Gentlest and Radio routes compared side by side. **#282**: the route is built from the crew's needs, and `src/plan/routeWhy.js` says why a stop was dropped. | [2-route-tab-rocks.jpg](img/challenge-fit/2-route-tab-rocks.jpg), `routeProfiles.test.js` | Strong |
| 13 | "while avoiding significant obstacles such as large rock formations" | **main**: the planner blocks ground over 20°, so steep outcrops and scarps are avoided. Rock cover adds `0.6 × rock` to each cell's cost (`cellCost` in `src/sim/costGrid.js`). `rock` is HiRISE image brightness remapped to 0.08 to 1 (`rockAbundanceAt`), a proxy, not mapped rocks. Bright ripple crests score as rocks, nothing prices soft sand, and the Fastest route crosses the ripple field that Perseverance's track bends around. All three profiles reach the 20° limit. No single boulder is an obstacle for the planner. Rocks of 0.35 m and up block only the walker in 3D (`src/engine/collide.js`). **#282**: `routeExplain.js` says what each leg avoids (#246); cautious routes prefer ground Perseverance drove. | [2-route-tab-rocks.jpg](img/challenge-fit/2-route-tab-rocks.jpg), `costGrid.test.js` ("remaps the brightness map to a rock abundance"), `routeProfiles.test.js`, #311 | Partial |
| 14 | "a display used inside the crew's spacecraft or habitat to plan their route" | **main**: the mission table opens over the habitat interior, and the habitat has a 3D planning table and five wall screens (`src/engine/habitatScreens.js`, `src/state/habitatScreens.js`). **In progress**: #290 starts the player at the table and goes out through the airlock. | [1-site-tab.jpg](img/challenge-fit/1-site-tab.jpg), [4-suit-tab.jpg](img/challenge-fit/4-suit-tab.jpg), `habitatScreens.test.js` | Strong |
| 15 | "a tablet application they carry with them" | **main**: the wrist screen (`src/engine/wrist.js`, `src/screens/wrist/`) shows the map layer and the route. Issue #286 says it is unreadable at 1366 × 768 and the HUD draws over the arm. | `wrist.screen.test.js`; no clean screenshot until #286 | Partial |
| 16 | "a heads-up-display (HUD) projected on the spacesuit's helmet visor" | **main**: oxygen, battery, suit pressure, walkback margin, heading tape, next waypoint with elevation profile, minimap, weather and navigation error. Suit pressure 4.3 psi is tagged DATA but is a spec value, not a reading. #283 trims it to what each moment needs. | [5-walk-hud.jpg](img/challenge-fit/5-walk-hud.jpg) | Strong |
| 17 | "a static snapshot, an interactive digital product, or a tool or system that generates maps of different locations" | **main**: interactive, one site by choice (CONTEXT.md scope). | Live demo | Strong |
| 18 | "Look at how NASA missions to destinations other than Mars ... have created this type of map" | **main**: the walkback margin is the Apollo rule. `credits.json` cites the Apollo 15 Bellcomm constraint envelopes, the Apollo 17 contingency procedures and the Artemis xEVA ConOps. | `credits.test.js` | Strong |
| 19 | "data from a specific time frame in the past" | **main**: MEDA sol 1187, RAD September 2017, Perseverance sols 1140 to 1266, each labelled with its sol or date. Never shown as live. | [5-walk-hud.jpg](img/challenge-fit/5-walk-hud.jpg), `medaRad.test.js` | Strong |
| 20 | "Consider how you might include these point-of-view images as part of your map, so the astronaut knows what to expect when they arrive at their destination" | **main**: three Perseverance images. The Site tab shows the Cheyava Falls close-up, a map pin opens all three, and the stop cards for Bright Angel and Cheyava Falls show one each. WP1 and WP2 have none, and nothing compares the image with what the walker sees on arrival. | [1-site-tab.jpg](img/challenge-fit/1-site-tab.jpg), `stops.test.js`, `traverse.test.js` | Partial |
| 21 | "use rovers or other robotic systems to help transport the crew and their tools, or whether the astronauts might work in pairs" | **main**: EV2 walks with you, scripted (`src/engine/partner.js`, `src/sim/partnerRunner.js`, `PartnerPanel.jsx`). EV2 follows, answers commands and helps with sampling. The F key asks EV2 to set the case down, you pour the sample in, and EV2 takes the case back (`src/hud/samplingPrompt.js`). EV2 does not pick sites or sample on their own. No rover. **In progress**: `feat/ev2-crewmate` makes EV2 follow the route and lead to the shelter (one WIP commit, tests uncommitted). | [5-walk-hud.jpg](img/challenge-fit/5-walk-hud.jpg) (EV2 chip), `partnerStatus.test.js` | Partial |
| 22 | "conducting new and exciting science along the way" | **main**: the sampling checklist (photo, texture, sample, seal) at Cheyava Falls, and unexpected finds that price a detour (`src/sim/findDetour.js`). | [5-walk-hud.jpg](img/challenge-fit/5-walk-hud.jpg), `findDetour.test.js` | Strong |
| 23 | "the data needed to complete their mission quickly and safely" | **main**: the Suit tab gives time, oxygen and battery out and back, the margin over a 30 min reserve, and a go or no-go. The budget has no work time at the stops (#247, in #282), the go or no-go does not check daylight (egress is 17:45 LMST), and the HUD margin disagrees with it (row 9). | [4-suit-tab.jpg](img/challenge-fit/4-suit-tab.jpg), `suitModel.test.js` | Partial |

### The Resources tab

| Resource | Used? |
|---|---|
| Mars Trek | Indirectly. The Perseverance traverse comes from JPL's MMGIS layers (`M20_traverse`, `M20_waypoints`), not from Trek itself. |
| USGS-NASA geologic mapping | No. The Outcrop layer is ours. |
| Curiosity route map example | Not used directly. The Route tab does the same job for one EVA. |
| NASA Worldview | No (Earth only). |
| Perseverance raw images | Yes, Mastcam-Z sol 1187 and sols 1211 to 1217. |

## One thing the matrix does not show

On this tile, oxygen never limits the walk. The Suit tab shows 19 min out, 21 min back and a +245 min margin over the 30 min reserve ([4-suit-tab.jpg](img/challenge-fit/4-suit-tab.jpg)). The farthest point of the 1.4 × 1.5 km tile is well inside a walk home. Apollo set the longest excursion at about 10 km because of walkback ([Hörz et al. 2010](https://ntrs.nasa.gov/citations/20100005662); [Vos et al. 2007](https://ntrs.nasa.gov/citations/20070016007)). What makes the crew turn back here is the storm and the radiation alert, not the tank. A walkback zone drawn today would cover the whole map until an event shrinks it. The pitch should show the zone shrinking under an event, not claim that oxygen bounds the site.

## What the AI reviewers changed

Three AI reviewers read the statement, an earlier version of this matrix and the six screenshots, with no shared context. They were Claude models (two Opus 5.5, one Fable 5.2) asked to play three roles: the NASA author of the challenge, a Space Apps global judge scoring Relevance and Impact, and a skeptical EVA operations engineer. No NASA staff or Space Apps judge saw this. All three answered "mostly" to "would you call this aligned with the challenge as-is?". The obstacle avoidance the statement names works from a brightness proxy, and the safety numbers disagree between screens.

Their gaps, after checking each one against the code:

| Gap | Raised by (role) | Checked | Changed |
|---|---|---|---|
| The route crosses the ripple field Perseverance drove around; nothing prices sand; bright crests count as rocks | all three | Screenshot 2, `cellCost`, no sand term in `src/sim` | Row 13 note |
| The margin is +245 min on the Suit tab and +457 min on the HUD | all three | `suitReadout` takes the smaller of the O2 margin and 480 min − walkback, so 480 − 23 = 457 | Rows 9 and 23 to partial |
| The radiation card says 29.9 µGy/h, the banner 10.0 µGy/h, the HUD dose 0 µGy | all three | Screenshots 3 and 6; #295 | Row 10 to partial |
| Only optical and topographic data, and layers derived from them, are on the map | all three | `src/plan/layers.js`, one layer index at a time | Row 7 to partial |
| The go or no-go has no work time at the stops and no daylight check; egress is 17:45 LMST | EVA engineer role | #247 open; `sunPosition.js` picks an 11° declination so the Sun is 7° up at 17:45, and #294 says the real value is −23° to −25° | Row 23 to partial |
| Low oxygen is listed as possible but cannot fire on this route | NASA author role | Trigger is a margin under 900 s; the plan's margin is 245 min | Row 9 note |
| DONKI is a database, not a mission | Relevance judge role | True | Summary wording |

Points we did not take. The Relevance judge role wanted rows 1 and 22 partial. The map shows the route, one data layer and the rover track together, and the science stop is a human sample of the potential biosignature rock, which the statement's own example (pick a site where the rover found something) supports. We fired the radiation alert by hand for screenshot 6, which is why it starts at EVA 0:00 at the airlock.

## Who it's for

Three people could use Marswalk. The first two are a stretch. Every claim links to its source.

**A science backroom traverse planner on an analog field test.** The decision is which stations fit in one EVA, and what to cut when a storm or radiation alert arrives without losing the margin to walk home. Today this takes many tools. At JETT5 the science team worked from mapbooks, geologic maps and "sixteen tracking documents", and asked for "a common annotatable digital map" ([Edgar et al., NTRS 20250000177](https://ntrs.nasa.gov/citations/20250000177)). BASALT's planners used xGDS and SEXTANT, and reported that "traverse duration estimates ... were not sufficiently accurate" and that Minerva was "ill-suited to support EVA traverse and timeline replanning" ([Marquez et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442304)). Marswalk keeps the route, the clock, the hazards and the walk home in one view and re-plans when an event fires. It is a stretch for real use. It covers one Mars site, and its speeds come from suited tests at lunar gravity on grades of 10 to 30 % ([Norcross et al., IST-2](https://ntrs.nasa.gov/citations/20110003409)).

**An EVA concept engineer working on Mars walkback ranges.** The decision is how far a Mars crew may go from the habitat on foot. NASA's xEVA ConOps sets the lunar rules (about 2 km on foot, a walk back of under 5 hours with an unpressurized rover) and calls Mars walkback ranges "forward work" ([EVA-EXP-0042 Rev B](https://ntrs.nasa.gov/citations/20205008200)). Marswalk turns those rules into a number on real Mars terrain, sampled on a 2 m height grid. It shows how slope, rock cover and a 202.4 kg suited mass change the time home. It does not validate them. It cannot answer the range question yet either, because the tile is 1.5 km across and walkback ranges start to bind near 10 km. This is the weakest of the three.

**A high school teacher or student.** The decision is which stops to plan at Cheyava Falls, and when to turn back when a storm or a solar particle event arrives. NASA's grades 9 to 12 activity has students score landing sites with Mars Trek ([NASA STEM](https://www.nasa.gov/stem-content/data-science-learning-analyzing-proposed-mars-landing-sites/)). We found no walkback or route-replanning exercise in it or in JPL's Mission to Mars unit ([JPL Education](https://www.jpl.nasa.gov/edu/resources/lesson-plan/mission-to-mars-unit/)). This is the most realistic user today. On `main` the stops are fixed, though, and choosing them arrives with #282's needs panel. No teacher has tried it.

Marswalk is not the first slope-aware EVA route planner. NASA's SEXTANT optimizes routes for length, time or metabolic rate with a user-set maximum slope ([Deans et al. 2017, Minerva](https://ntrs.nasa.gov/citations/20170002363)). What we add is the walk home as the constraint you see, re-planning under replayed Mars events, and a test of the map in the helmet.

### What would make it more useful

- A real rock map. A rock count from HiRISE would let the planner route around boulders instead of bright ground.
- The walkback zone as an area on the map (`feat/return-zone`), shown shrinking under an event.
- Export the plan as KML or GeoJSON. Desert RATS 2010 planned 24 traverses and delivered them as "a Google Earth-based KML map" ([Hörz et al., NTRS 20110008013](https://ntrs.nasa.gov/citations/20110008013)).
- A rover point-of-view image at every stop, not only at the two science targets.

### Out of scope for this weekend

- Other sites. Each tile needs its own Blender export, cost grid and shelter list.
- Mars-gravity suit data. Nobody has it; the model uses lunar-gravity and 1 g tests and says so.
- Communication delay with Earth. BASALT tested 5 and 15 minute one-way delays ([Marquez et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442304)); Marswalk has no Earth link.
- A crew rover. It would change the scale of the map from 1.5 km to about 10 km.

## Issues from this review

Before the deadline, Sunday 15 November at 11:59 pm Pacific (Ensenada):

| Issue | Rows | Priority | Overlaps |
|---|---|---|---|
| #322 Price the sand ripple field in the route cost | 13 | P1 | #282, #311 |
| #323 Suit tab and HUD show two different walkback margins | 9, 23 | P1 | #282 (`limits.js`), #298 |
| #324 Check daylight in the go / no-go | 23 | P1 | #294 |
| #325 Put a third kind of data on the map | 7 | P2 | #282 (Exposure layer) |
| #326 A Perseverance image at every stop | 20 | P2 | #282 (`stops.json`) |
| #327 Count carried tools and samples in the suit mass | 11 | P2 | #288, #298, #299 |

Already filed: #309 (return zone map, row 9), #311 (rock layer is a brightness proxy, row 13), #295 (radiation numbers, row 10), #248 (conditions outlook, row 8, in #282), #247 (work time at stops, row 23, in #282), #286 (wrist readability, row 15), #288 (EV2 crewmate, row 21).
