# The 8-minute demo

The demo runs on the **first mission** (#265): the default goal "First sortie", a 55 m walk from the airlock to a
light-toned patch and back, with the dust storm and the radiation alert brought forward so both play before the crew is
home. Target **7:30**, limit **8:00**, start screen to sources, and every feature of the product appears in it. The
layers and the crew's needs are shown on the full EVA's 934 m route to Cheyava Falls at the table, where they change
something; the walk is the sortie.

A player who skips the talking reaches the debrief in about 3 minutes (#265 asks for no more than 4): see
[Measured](#measured).

Walking speed stays 1.0 m/s (1.5 m/s jogging) and the mission clock runs at time scale 1. Only the event times are
shortened, and they are tagged SIM (`src/sim/missions.js`, [STATE_AND_ENGINE.md](STATE_AND_ENGINE.md#missions-and-their-events-265)).
The sortie plan for a pair reads 52 s out, 2 min of work at the stop, 75 s back, about 4.1 min in all and 9 g of O2
with the walk home; the work time is a planning figure, not played in real time.

## The first mission's schedule

| Mission time | What happens | Rule (data in `src/sim/missions.js`) |
|---|---|---|
| T+0 | Start walking at the airlock | the clock starts at the walk keys card's Start walking (the EVA clock reads h:mm:ss) |
| about T+52, later with a detour | At the sortie stop, "Light-toned patch" | reached for good within 8 m (its stops.json arrival radius); a find added on the way or a re-plan at the table does not count as the stop |
| at the stop | Why it is worth the walk (its stops.json reason, SIM, "no rover has looked here") and what to do: look down, **P** photo, click to sample, **E** to bag | the stop's banner and beat line, until a sample is secured |
| 3 s after the sample | **Dust storm**: tau 0.45 to 8.0 in 30 s, re-plan to the habitat | a sample secured at the stop (one taken at a find on the way does not count); or 90 s after first reaching the stop without one, or as soon as the crew turns home (10 m from the 25 m end area); not before T+45 s; by T+240 s at the latest; held outside the end area until then |
| 15 s after the storm | **Radiation alert**: RAD dose rates, re-plan to the habitat | sooner if the crew comes within 10 m of the end area first, so it always starts before they are home; by T+255 s at the latest |
| back within 25 m of the airlock | Both alerts end, each after playing at least 20 s | the habitat stays the target until the crew is at the habitat; a stop left out stays skipped |
| in the cabin | `[E] Open plan`, `[X] Finish EVA` | the habitat table (#244) |

The full EVA (goals "Sample Cheyava Falls", "Survey Bright Angel" and "Collect samples") keeps the storm at T+480 s and
the radiation alert at T+720 s, as before. A crew of one walks without the partner (no EV2 chip, no separation alert, no hand-over); the
demo is walked as a pair. Restart and End the EVA keep the crew's needs; a page load opens the first sortie.

In the full EVA a crew that shelters from the storm resumes its remaining stops by choosing **Re-plan** at the table
once the alert is over; nothing resumes by itself, and an off-route re-plan never leads to a skipped stop.

**The demo machine:** `npm run measure:demo` must report at least 0.95 m/s of walking. A machine busy with builds or
tests drops the frame rate, and the walk (the engine caps a frame's step at 0.1 s) then runs slower than 1.0 m/s.

## Script

Budget in minutes and seconds. The beat line on screen says the same as the presenter, in a few words.

| # | Segment | Budget | Do | Shows | Data behind it |
|---|---|---|---|---|---|
| 1 | Start screen | 0:15 | Read the title; press **Open the mission table** (the first sortie). Point at **Full EVA · Sample Cheyava Falls** as the longer mission | the start screen, its video, the mission choice | HiRISE terrain (credit line) |
| 2 | Table: the layers on the Cheyava Falls route | 1:05 | Site step: where we are, the plan beat line. **Route** step: set the goal to **Sample Cheyava Falls** (934 m, Bright Angel then Cheyava Falls); scroll the map in and out. Then one decision per layer: **Terrain** with risk **cautious** (where the route bends); **Rocks** (the cost cautious puts on rock cover); **Outcrop** (the stops it keeps on light-toned rock); **Radio** with a crew of **1** (the radio route, and Bright Angel left out: a dropped stop and its reason); **Exposure** (which shelter a re-plan would pick); **Rover** (Perseverance's drives) | the mission table, the HiRISE map, every layer and its "what this decides" line, the crew's needs, a dropped stop | MRO HiRISE DTM and orthomosaic, Perseverance traverse (MMGIS), radio and sky view derived from the DTM |
| 3 | Two plans, a stop card, back to the sortie | 0:55 | Plan A: solo, cautious, **100 min**: one stop, the why lines. Plan B: pair, **bold**, **2 h**: both stops. Compare the three profiles. Open the **Cheyava Falls** card from its marker (Perseverance's images), close it. Risk back to standard, goal back to **First sortie** | two contrasting generated plans, why-this-route, route profiles, the budget with work time, stop cards and photos | Mastcam-Z and WATSON images (PIA26401, PIA26368), suit model, HiRISE slope |
| 4 | Hazards, outlook, go / no-go, Begin EVA | 0:35 | Hazards step: the three hazards and when each comes in this mission. Suit step: the conditions outlook beside **Go**. **Begin EVA**, the walk keys card, **Start walking**; **H** for the controls help, then resume | hazard cards, conditions outlook, suit check, go / no-go, walk keys, controls help and the pause behind it | MEDA (sol 1187), RAD (Gale), DONKI, hazards.json |
| 5 | Walk out | 1:35 | Walk 12 m: the visor, the minimap. **R** raises the wrist: **J** and **Enter** choose a layer on the arm, **]** the map page, **R** lowers it, **0** clears the layer. **G** slope grid on and off; **V** visor frame off and on. Step off the line toward a light patch, hold **Q** on the ground to mark a find, read its card and press **Y** to add it; on to the stop | visor HUD, minimap, waypoint panel, navigation line, partner, wrist screen, slope grid, visor frame, mark-a-find and its detour price | HiRISE DTM (slope, elevation profile), MEDA weather, suit model |
| 6 | Science stop and sample | 0:20 | Read the stop's banner (why it is worth the walk, SIM) and the beat line; look down, **P** photo, click the ground, **E** stow and seal | the stop's reason, sampling clips and checklist | HiRISE outcrop mask (SIM stop) |
| 7 | Dust storm | 0:20 | The banner and the beat line; the sky closes in; **M** opens the table on the Route step: the route home on the map; **M** back | event banner with source, storm visuals, re-plan to the habitat | tau: Mastcam-Z (Jezero) up to Curiosity's 2018 Gale storm |
| 8 | Radiation, walk back, hand-over | 1:10 | The radiation banner takes over (the storm is "+1 more alert"); the dose on the HUD; **M** shows the second re-plan, **M** back. Press **F** right after the radiation map, to call the partner with the case, and walk toward home; stop and wait where the partner sets the case down, take a second sample there and press **F** to pour it in (walking on past the partner adds about 30 m and half a minute) | radiation alert (early warning, ALARA), dose, walk back, partner hand-over | RAD, Curiosity, September 2017 event (Gale, not Jezero) |
| 9 | Habitat | 0:20 | In the cabin: **Esc**, **Settings**, switch the language to Spanish and back, resume. **E** Open plan (the table on Route), **M** back, **X** Finish EVA | pause menu, settings and language, habitat table prompt, Open plan, Finish EVA | — |
| 10 | Debrief | 0:45 | Metrics, the route review (the detour to the find judged fairly), the recap of each beat | debrief, walked route against the plan, beat recap | every value tagged DATA / DERIVED / SIM |
| 11 | Sources | 0:10 | **Sources** on the debrief | the sources screen | every dataset and model used |
| | **Total** | **7:30** | | | |

The find card is answered **Y** (add to the route), as a presenter shows the decision; the detour's verdict stays fair
because a find added on a GO card is not judged risky for an alert that starts on the way (D7). **N** would also do:
the find stays recorded either way.

## Feature coverage

Every feature on `main`, where the timed demo shows it, and how the measurement script checks it.

| Feature | Segment |
|---|---|
| Start screen, video, Controls and Sources buttons, mission choice (first sortie, full EVA) | 1 |
| Mission table: Site step (location, relief, origin) and the plan beat line | 2 |
| HiRISE map: zoom and pan (scroll) | 2 |
| Crew's needs (goal, crew, time, O2, battery, risk) and the route generated from them | 2, 3 |
| Layers: image, terrain (slope), rocks, outcrop, radio shadow, exposure, Perseverance drives; legend "what this decides" | 2 |
| Dropped stops and their reason (Bright Angel for a solo crew) | 2, 3 |
| Two contrasting plans; why this route (per leg and for the plan) | 3 |
| Route profiles (fastest, gentlest, radio) | 3 |
| Work time at stops and the budget (#247) | 3 |
| Cheyava Falls stop card and Perseverance photos | 3 (table) |
| Hazard cards (dust storm, radiation, low oxygen) and the hazard switches | 4 |
| Low-oxygen caution and warning | 4 (table: the threshold events do not fire on a 55 m walk) |
| Conditions outlook (#248), suit check and go / no-go | 4 |
| Walk keys card, pointer capture, drag-to-look fallback | 4 |
| Controls help (H) and the pause behind it | 4 |
| Visor HUD: O2, battery, pressure, margin, EVA clock, LMST, compass | 5 |
| Waypoint panel with the elevation profile; minimap with route, rover track, partner and habitat | 5, 7 |
| Navigation without GPS: terrain fix, dead reckoning, error ring | 5 |
| Environment strip: MEDA temperature and wind, tau, dose | 5, 7, 8 |
| Partner astronaut, range and separation | 5, 8 |
| Wrist screen (R): a layer chosen on the arm, the map page | 5 |
| Slope grid (G), visor frame (V), clearing the layer (0) | 5 |
| Mark a find (Q), its detour price, Y / N | 5 |
| The science stop: its reason (SIM) and what to do | 6 |
| Sampling: photo, collect, stow, checklist | 6 |
| Dust storm: banner with source, sky and dust, re-plan to the habitat | 7 |
| Mission table during the EVA (M): the Route step, the crew's live position, the route home to the shelter | 7, 8 |
| Radiation alert: banner, dose rate, dose, re-plan | 8 |
| Hand-over to the partner's case (F) | 8 |
| Habitat, airlock, cabin | 8, 9 |
| Pause menu, settings, interface language | 9 |
| Habitat table prompt: Open plan, Finish EVA | 9 |
| Debrief: metrics, mission log, route review (deviations and verdicts), beat recap | 10 |
| Sources screen | 11 |
| Beat lines (plan, walk, stop, storm, radiation, debrief) | 2, 5, 6, 7, 8, 10 |
| Gamepad and touch | not shown: a keyboard presenter cannot show them (docs/CONTROLS.md) |

## Measuring

```
npm run measure:demo
npm run measure:demo -- --lang es --viewport 1920x1080 --shots <folder>
npm run measure:demo -- --dwell-scale 1.3        # a presenter 30 % slower
npm run measure:demo -- --player                 # a player: no tour, a quick reader
```

`scripts/measure-demo.mjs` starts the Vite dev server and a browser (headless unless `--headed`) and drives the real
first mission. Buttons are clicked and keys pressed as a player would; the astronaut walks with W at 1.0 m/s, turned in
place toward the next point through the development hook (`__marswalk.place` at the current position), and nothing
teleports. Two kinds of time:

- **dwell**: a presenter reading or talking, fixed at the top of the script (`DWELL`) and reported as such;
- **measured**: walking, the events' triggers, the clips, the partner's walk to the case, the planner and the screen
  changes.

The steps, selectors and the walk (the detour to the find, the look-down pitches, the find card's answer) are tables at
the top of the script. Each feature the run shows is checked and listed at the end ("Features driven"); a step whose
control is not on screen is skipped and listed as "not driven". The report also gives the total for a presenter 30 %
slower, the walking speed and frame rate, and the time the hand-over took.

### Measured

15 November 2026, branch `feat/short-mission-dynamic-routes`, Edge 157 headless with the GPU (NVIDIA RTX 5070),
1366 x 768, English, `npm run measure:demo`, on the round 3 tree. All 32 features driven; the walk ran at 135 to 165
fps, 135 m in 138 s (0.98 m/s with the turns and stops), with no step-aside.

| # | Segment | Budget | Actual | of which dwell | Measured |
|---|---|---|---|---|---|
| 1 | Start screen, choose mission | 0:15 | 0:13 | 0:12 | 0:01 |
| 2 | Table: site, goal Cheyava Falls, the layers and what each decides | 1:05 | 0:52 | 0:45 | 0:07 |
| 3 | Two contrasting plans, profiles, a stop card, back to the sortie | 0:55 | 0:44 | 0:36 | 0:08 |
| 4 | Hazards, outlook, go / no-go, Begin EVA, keys, help (H) | 0:35 | 0:31 | 0:29 | 0:02 |
| 5 | Walk out: HUD, wrist (R), slope grid (G), visor (V), a find | 1:35 | 1:35 | 0:14 | 1:21 |
| 6 | Science stop and sample | 0:20 | 0:16 | 0:03 | 0:13 |
| 7 | Dust storm and its re-plan on the table | 0:20 | 0:15 | 0:05 | 0:10 |
| 8 | Radiation, walk back, hand-over (F) | 1:10 | 1:12 | 0:06 | 1:06 |
| 9 | Habitat: settings and language, Open plan, Finish EVA | 0:20 | 0:12 | 0:10 | 0:02 |
| 10 | Debrief | 0:45 | 0:41 | 0:40 | 0:01 |
| 11 | Sources | 0:10 | 0:08 | 0:08 | 0:00 |
| | **Total** | **7:30** | **6:40** | 3:28 | 3:12 |

- **A presenter 30 % slower:** about 7:43 (the dwell 3:28 becomes 4:30), under the 8:00 limit.
- **Mission times:** at the stop T+94 s (73 m with the detour to the find), sample secured T+106 s, dust storm T+111 s
  (5 s after the sample), radiation alert T+126 s, 46 m from the airlock, back in the habitat T+198 s, debrief at
  T+203 s.
- **The find:** card answered Y; the debrief judged the detour "1 deviation: 1 worth it, +23 s and +1 g O2 over the plan".
- **The two plans** (segment 3): solo, cautious, 100 min: 0.88 km to Cheyava Falls, Bright Angel left out for time;
  pair, bold, 2 h: 0.91 km, Bright Angel then Cheyava Falls.
- **Where the time goes:** the walk (2:18 for 135 m), the hand-over (34 s from F to the closed case, mostly the partner
  walking out), the debrief (40 s of reading). The walk out runs to its budget because of the detour to the find (73 m
  instead of 55 m) and the wrist, slope grid and visor steps on the way.

When other builds or tests load the machine, the frame rate can fall under 10 fps, and the engine, which caps a frame's
step at 0.1 s, then walks slower than 1.0 m/s. The script reports the frame rate and the walking speed, warns below
12 fps, and gives the total at a steady 0.97 m/s. Two runs on a loaded machine (2 fps at moments, 0.55 to 0.68 m/s)
took over 9 minutes; measure on a quiet machine.

**A player** (`npm run measure:demo -- --player`: the first mission as the on-screen guidance leads it, with no tour,
no detour to a find and a quick reader's dwell, x0.25): 15 November 2026, the same machine, 1366 x 768, English, 104 to
163 fps, 113 m in 115 s (0.99 m/s). **Start screen to the debrief: 2:31**, of which 2:17 is the EVA (at the stop
T+53 s, sample secured T+63 s, storm T+68 s, radiation T+83 s, 42 m from the airlock, back in the habitat T+136 s).
Issue #265 asks for about 3 minutes and no more than 4.
