# Local pitch script, 4 minutes (English)

> **Format.** Fernando's call at 9:25 am on 15 November: the whole talk runs at most 4 minutes, video included. Target 3:40, hard cap 4:00. The organisers' page quoted in `docs/SUBMISSION.md` (PR #316) says "tiempo máximo de 3 minutos"; the team takes 4 and confirms with them. There is no 3-minute version: the app video alone runs 75 to 90 s, so a 3-minute cut would drop beats rather than trim words.

This is the only talk script. The Spanish twin, for rehearsal and for Spanish questions, is `script-4min-es.md`. The talk runs in the presentation mode on `main` (https://martian-map.fernando-haro-c.workers.dev/?present=1), one **Right** per beat, as `demo-run-sheet.md` says. There is no live demo: an edited app video, a beat inside `?present=1`, shows the app. If WebGL fails, the presentation shows captions only: switch to `out/deck-global.pdf`, the file sent to the organisers (slide per beat in `demo-run-sheet.md`).

**Draft against the current beats.** The beat ids and lengths come from #353 (`fix/present-polish`, 63298ed). The `video` beat is a placeholder of 88 s until the presentation thread posts its PR with the real beat list and lengths. Then run `node tools/sync-present.mjs`, set the times below to the real lengths, and rerun `node tools/timing.mjs`.

**Thesis:** on Mars, the question isn't where you can go. It's where you can go and still get home. Said on the zone, and again to close.

**The moment to remember** is the zone closing at the radiation alert. Say "Watch the zone", then hold two seconds of silence while it shrinks.

**Three spoken numbers only:** the 20° no-go slope, the 30 min reserve and the 0.14 m terrain check. Other numbers stay on screen, unspoken. No margin or dose figure until the presentation thread's new PR settles them (the app shows different ones on different screens).

Pace: written for 125 words per minute; no row passes 140 (`node tools/timing.mjs`). With an 88 s video the talk ends at 3:43, 17 s under the 4:00 cap. A 75 s video ends it at 3:30, a 90 s one at 3:45.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | mars | P1 | On Mars, nobody can come and get you. Marswalk shows an astronaut where she can go and still get home. |
| 0:12 | jezero | P1 | This is Jezero crater, an ancient lake, on NASA's HiRISE terrain. |
| 0:22 | cheyava | P1 | Her goal is Cheyava Falls, where Perseverance found a potential biosignature, unconfirmed. She walks there from the habitat. |
| 0:34 | danger | P1 | If something goes wrong out here, the only rescue is her own walk home. |
| 0:43 | plan | P1 | Marswalk plans that walk on the terrain. Slopes over twenty degrees are no-go, and every metre costs time and oxygen, priced from NASA's suited walking tests. |
| 0:58 | zone | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. Her first sortie keeps a thirty minute reserve, so the orange area is everywhere she can reach and still get back in time. |
| 1:19 | radiation | P1 | Then a radiation alert. Watch the zone. (Hold two seconds of silence.) Only the way home is left. She turns back now. |
| 1:33 | storm | P1 | (Say nothing; the video shows the storm. Press Right after about 5 s.) |
| 1:38 | video | P2 | (The app video plays. Say each cue when its scene starts, then let the app speak.) The crew plans at the mission table. The same orange zone, in the app. Out through the airlock. A dust storm, and her partner reacts. Back inside, the review compares the walk with the plan. |
| 3:06 | sources | P3 | Every number on screen says if it is measured, derived or simulated. The radiation and the storm are real readings from Gale crater, not Jezero, and their timing is ours. Our terrain matches NASA's HiRISE model to fourteen centimetres. |
| 3:26 | credits | P3 | Every source is on screen. On Mars, the question is not where you can go. It is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Thank you. (Do not press Right again.) |
| 3:43 | | | (End. 17 s under the 4:00 cap.) |

## Where each number comes from

Spoken:

| Number | Source |
|---|---|
| 20° no-go | `slope.no_go`, NASA EVA-EXP-0042 Rev B (DATA). The planner blocks steeper cells and makes steeper ground cost more |
| 30 min reserve | `suit.reserve.time`, Apollo 17 procedures (DATA). The zone beat runs our 30 min first sortie (SIM): on the default walk oxygen never runs short, so the reserve and the sortie clock are what bound the zone |
| 0.14 m | RMS height difference between our 2 m grid and NASA Mars Trek's HiRISE Jezero DEM over 564,001 points (DERIVED). `docs/data/mars-trek-check/README.md` |

On screen only, not spoken: the route length, the 8 h suit limit, per-leg time and oxygen, the peak dose rate and the storm's opacity. Their sources are on each beat's source line and in the `credits` beat. The radiation and storm readings are real, from Curiosity at Gale crater, not Jezero; the storm's 30 s rise and the event timing are ours (SIM). "Potential biosignature, unconfirmed" follows NASA's wording for Cheyava Falls (July 2024).
