# The 8-minute demo

The demo runs on the **first mission** (#265): the default objective "First sortie", a 55 m walk from the airlock to a
light-toned patch and back, with the dust storm and the radiation alert brought forward so both play before the crew is
home. Target **7:30**, limit **8:00**, start screen to sources. Everything the first mission does not reach (Cheyava
Falls, Bright Angel, low oxygen) is shown at the mission table, where the map is the product.

A player who skips the talking reaches the debrief in about 3 minutes (#265 asks for no more than 4): see
[Measured](#measured).

Walking speed stays 1.0 m/s (1.5 m/s jogging) and the mission clock runs at time scale 1. Only the event times are
shortened, and they are tagged SIM (`src/sim/missions.js`, [STATE_AND_ENGINE.md](STATE_AND_ENGINE.md#missions-and-their-events-265)).

## The first mission's schedule

| Mission time | What happens | Rule (data in `src/sim/missions.js`) |
|---|---|---|
| T+0 | Start walking at the airlock | the clock starts at the walk keys card's Start walking |
| about T+55 to T+80 | At the sortie stop "S1 · light-toned patch" (55 m straight, more with a detour) | the waypoint runner moves `route.nextIndex` to 2 within 5 m |
| about 20 s at the stop | Photo (P), sample (click the ground in reach), stow (E) | sampling works on any rock or ground within 1.5 m |
| T+75 at the earliest | **Dust storm**: tau 0.45 to 8.0 in 30 s, re-plan to the habitat | 20 s after reaching the stop; by T+180 s at the latest; never within 25 m of the airlock |
| 15 s after the storm | **Radiation alert**: RAD dose rates, re-plan to the habitat | T+95 s at the earliest; 15 s after the storm; by T+210 s at the latest; never within 25 m of the airlock |
| back within 25 m of the airlock | Both events end, the route clears | the events' end area (unchanged) |
| in the cabin | `[E] Open plan`, `[X] Finish EVA` | the habitat table (#244) |

The full EVA (objectives "Sample Cheyava Falls" and "Survey Bright Angel") keeps the storm at T+480 s and the
radiation alert at T+720 s, as before.

## Script

Budget in minutes and seconds. "Say" is the presenter's line; the beat line on screen says the same in a few words.

| # | Segment | Budget | Do | Shows | Data behind it |
|---|---|---|---|---|---|
| 1 | Start screen | 0:15 | Read the title; press **Open the mission table** (the first sortie). Mention **Full EVA · Sample Cheyava Falls** as the longer mission | the start screen, its video, the mission choice | HiRISE terrain (credit line) |
| 2 | Table: site and layers | 1:15 | Site step: where we are, the plan beat line. **Next: route**. Press each layer once and say what it decides: Terrain (slope, where the route bends), Rocks, Outcrop (where the crew stops), Radio shadow, Exposure, the rover's drives | the mission table, the HiRISE map, every layer and its "what this decides" line | MRO HiRISE DTM and orthomosaic, Perseverance traverse (MMGIS), radio and sky view derived from the DTM |
| 3 | Needs → route | 1:15 | Change the goal to **Sample Cheyava Falls**: the route grows to Bright Angel and Cheyava Falls, open the Cheyava Falls card (Perseverance images). Set risk to **cautious**: the route and the budget change. Read the why lines. Compare the three profiles. Put the goal back to **First sortie** | crew's needs, route generation, stop cards and photos, why-this-route, route profiles, budget | Mastcam-Z and WATSON images (PIA26401, PIA26368), suit model, HiRISE slope |
| 4 | Outlook, go / no-go, Begin EVA | 0:30 | Hazards step: the three hazards and when each comes in this mission. Suit step: the conditions outlook beside **Go**. **Begin EVA**, the walk keys card, **Start walking** | hazard cards, conditions outlook, suit check, go / no-go, walk keys | MEDA (sol 1187), RAD (Gale), DONKI, hazards.json |
| 5 | Walk out | 1:00 | Walk toward the stop; step off the line toward a light patch and hold **Q** to mark a find (its detour price card), then on to the stop | visor HUD, minimap, waypoint panel, navigation line, partner, mark-a-find | HiRISE DTM (slope, elevation profile), MEDA weather, suit model |
| 6 | Stop and sample | 0:45 | At S1: **P** photo, click the ground, **E** stow and seal; the sampling checklist fills | sampling clips and checklist | — (SIM stop) |
| 7 | Dust storm | 0:30 | The banner and the beat line; the sky closes in; **M** opens the table on Route: the route home on the map; **M** back | event banner with source, storm visuals, re-plan to the habitat | tau: MEDA / Mastcam-Z (Jezero) to Curiosity's 2018 Gale storm |
| 8 | Radiation and walk back | 0:50 | The radiation banner takes over (the storm is "+1 more alert"); dose rate on the HUD; **M** shows the second re-plan; walk home and into the cabin | radiation alert (early warning, ALARA), dose on the HUD, walk back | RAD, Curiosity, September 2017 event (Gale, not Jezero) |
| 9 | Habitat table | 0:20 | **E** Open plan (the table on Route), **M** back, **X** Finish EVA | habitat table prompt, Open plan, Finish EVA | — |
| 10 | Debrief | 0:40 | Metrics, the route review (the detour judged "worth it" because of the find), the recap of each beat | debrief, walked route against the plan, beat recap | every value tagged DATA / DERIVED / SIM |
| 11 | Sources | 0:10 | **Sources** on the debrief | the sources screen | every dataset and model used |
| | **Total** | **7:30** | | | |

## Feature coverage

Every feature on `main` and where the demo shows it. "Table" means it is shown at the mission table because the first
mission's walk does not reach it.

| Feature | Segment |
|---|---|
| Start screen, video, Controls and Sources buttons | 1 |
| Mission choice (first sortie, full EVA) | 1 |
| Mission table: Site step (location, relief, origin) | 2 |
| HiRISE map with zoom and pan | 2, 3 |
| Layers: image, terrain (slope), rocks, outcrop, radio shadow, exposure, Perseverance drives; legend "what this decides" | 2 |
| Crew's needs (goal, crew, time, O2, battery, risk) and the route generated from them | 3 |
| Cheyava Falls and Bright Angel stops, their cards and Perseverance photos | 3 (table) |
| Why this route (per leg and for the plan), dropped stops | 3 |
| Route profiles (fastest, gentlest, radio) | 3 |
| Work time at stops and the budget (#247) | 3 |
| Hazard cards (dust storm, radiation, low oxygen) and the hazard switches | 4 |
| Low-oxygen caution and warning | 4 (table: the threshold events do not fire on a 55 m walk) |
| Conditions outlook (#248) and go / no-go | 4 |
| Suit check (suit figure, consumables, margin) | 4 |
| Walk keys card, pointer capture, drag-to-look fallback | 4 |
| Visor HUD: O2, battery, pressure, margin, EVA clock, LMST, compass | 5 |
| Waypoint panel with the elevation profile | 5 |
| Minimap with route, rover track, partner and habitat | 5, 7 |
| Navigation without GPS: terrain fix, dead reckoning, error ring | 5 |
| Environment strip: MEDA temperature and wind, tau, dose | 5, 7, 8 |
| Partner astronaut, range and separation | 5 |
| Mark a find (Q), its detour price and Y / N | 5 |
| Sampling: photo, collect, stow, checklist | 6 |
| Dust storm: banner with source, sky and dust, re-plan to the habitat | 7 |
| Mission table during the EVA (M), live position | 7, 8 |
| Radiation alert: banner, dose rate, dose, re-plan | 8 |
| Habitat, airlock, cabin | 8, 9 |
| Habitat table prompt: Open plan, Finish EVA | 9 |
| Debrief: metrics, mission log | 10 |
| Route review: approved route against the walked track, deviations and verdicts | 10 |
| Beat recap | 10 |
| Sources screen | 11 |
| Beat lines (plan, walk, storm, radiation, debrief) | 2, 5, 7, 8, 10 |
| Wrist screen (R) | not in the timed script; 5 if time allows |
| Pause menu, settings (language, quality, look), controls help (H) | not in the timed script |
| Hand-over to the partner's case (F), slope grid (G), visor frame (V) | not in the timed script |
| Gamepad and touch | not in the timed script |

## Measuring

```
npm run measure:demo
npm run measure:demo -- --lang es --viewport 1920x1080 --shots <folder>
npm run measure:demo -- --dwell-scale 0.1        # a quick player instead of a presenter
```

`scripts/measure-demo.mjs` starts the Vite dev server and a browser (headless unless `--headed`) and drives the real
first mission. Buttons are clicked and keys pressed as a player would; the astronaut walks with W at 1.0 m/s, turned in
place toward the next point through the development hook (`__marswalk.place` at the current position), and nothing
teleports. Two kinds of time:

- **dwell**: a presenter reading or talking, fixed at the top of the script (`DWELL`) and reported as such;
- **measured**: walking, the events' mission-time triggers, the clips, the planner and the screen changes.

The steps, selectors and the walk (the detour to the find, the look-down pitches) are tables at the top of the script.
A step whose control is not on screen is skipped and listed as "not driven".

### Measured

15 November 2026, branch `feat/short-mission-dynamic-routes`, Edge 157 headless with the GPU (NVIDIA RTX 5070),
1366 x 768, English, `npm run measure:demo`. Every step was driven; the walk ran at 135 to 165 fps, 131 m in 135 s
(0.97 m/s with the turns and stops), with no step-aside.

| # | Segment | Budget | Actual | of which dwell | Measured |
|---|---|---|---|---|---|
| 1 | Start screen, choose mission | 0:15 | 0:13 | 0:12 | 0:01 |
| 2 | Table: site and layers | 1:15 | 0:53 | 0:52 | 0:01 |
| 3 | Needs → route, two inputs, why line | 1:15 | 1:00 | 0:50 | 0:10 |
| 4 | Outlook, go / no-go, Begin EVA, controls | 0:30 | 0:23 | 0:22 | 0:01 |
| 5 | Walk out (visor, minimap, a find) | 1:00 | 1:19 | 0:02 | 1:17 |
| 6 | Stop and sample | 0:45 | 0:18 | 0:03 | 0:15 |
| 7 | Dust storm and re-plan | 0:30 | 0:16 | 0:06 | 0:10 |
| 8 | Radiation and walk back | 0:50 | 1:00 | 0:05 | 0:55 |
| 9 | Habitat table: Open plan, Finish EVA | 0:20 | 0:06 | 0:05 | 0:01 |
| 10 | Debrief | 0:40 | 0:31 | 0:30 | 0:01 |
| 11 | Sources | 0:10 | 0:08 | 0:08 | 0:00 |
| | **Total** | **7:30** | **6:09** | 3:15 | 2:54 |

Mission times: at the stop T+79 s, sample secured T+90 s, dust storm T+97 s (18 s after the stop), radiation alert
T+113 s, back in the habitat T+173 s, debrief at T+180 s. The debrief judged the detour "1 deviation: 1 worth it".
The walk out runs 19 s over its budget because of the detour to the find (70 m instead of 55 m, plus the 2 s hold);
the stop and the storm come in under theirs. The 1:21 left under the target is room for the presenter.

When other builds or tests load the machine, the frame rate can fall under 10 fps, and the engine, which caps a frame's
step at 0.1 s, then walks slower than 1.0 m/s. The script reports the frame rate and the walking speed, and warns when
it fell below 12 fps; one such run (3 fps at moments, 0.88 m/s) still finished in 6:47.

**A player** (`--dwell-scale 0.25`, Spanish, 1366 x 768, 0.97 m/s): start screen to the debrief in **3:33**, of which
2:46 is the EVA (at the stop T+78 s, storm T+96 s, radiation T+111 s, back T+164 s). That includes the detour to mark
a find; walking straight to the stop saves about 25 s. #265 asks for about 3 minutes and no more than 4.

The same flow ran at 1920 x 1080 in English and Spanish (`--dwell-scale 0.1`): every step driven, EVA 2:44 and 3:06.
