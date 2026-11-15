# Local pitch script, 4 minutes (English)

> **Format.** Fernando set the limit on 15 November. The whole talk runs at most 4 minutes, video included, and the target is 3:40. The organisers' page quoted in `docs/SUBMISSION.md` (PR #316) says "tiempo máximo de 3 minutos". The team takes 4 and confirms with them.

This is the talk in English. `script-4min-es.md` is the same talk in Spanish, with the same beats and the same times. Say it in the language the organisers confirm. The talk runs in the presentation mode on `main` (https://martian-map.fernando-haro-c.workers.dev/?present=1), seven beats, one **Right** per beat, as `demo-run-sheet.md` says. The `demo` beat plays a 73.8 s recording of the real app in place of a live demo. If WebGL fails, the presentation shows captions only, so switch to `out/deck-global.pdf`.

**Beats.** The rows follow the seven beats of #356 in `src/present/beats.js` on `main`, at their autoplay lengths: `open` 20 s, `plan` 24 s, `zone` 24 s, `radiation` 16 s, `demo` 73.8 s, `sources` 18 s and `credits` 22 s. The talk ends at 3:18, 22 s under the 3:40 target.

**Do not speak over the open.** The `open` beat writes "On Mars, nobody can come and get you." and then, at 8 s, "Marswalk shows where you can still get home." Let the room read both. Speak only after the second line has been up for about 4 s.

**Thesis.** On Mars, the question isn't where you can go. It's where you can go and still get home. Say it on the `zone` beat, where the captions show it, and again to close.

**The moment to remember** is the zone closing on the astronaut in the `radiation` beat. Say "A radiation alert. Watch the zone." and stay silent while it closes and holds at 0.5 ha for 2.5 s.

**Three spoken numbers only.** They are the 20° no-go slope, the thirty minute sortie and the 0.14 m terrain check. Other numbers stay on screen, unspoken. Say no margin or dose figure.

**Pace.** Every row fits at 130 words per minute (`council/timing-4min-130.md`) and none passes 140.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | open | P1 | (Silent while the two lines appear. At about 0:12:) This is Jezero crater. Her goal is Cheyava Falls, where Perseverance found a potential biosignature, unconfirmed. |
| 0:20 | plan | P1 | She walks there from the habitat, and if something goes wrong, the only rescue is her own walk home. Marswalk plans that walk on NASA's HiRISE terrain. Slopes over twenty degrees are no-go, and every metre costs time and oxygen, priced from NASA's suited walking tests. |
| 0:44 | zone | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. On a thirty minute sortie, the orange area is everywhere she can reach and still get back in time. Every minute out shrinks it. |
| 1:08 | radiation | P1 | A radiation alert. Watch the zone. (Silent while it closes and holds, about 4 s.) Only the way home is left. She turns back now. Now the real app, recorded. |
| 1:24 | demo | P2 | (The recording plays with its own captions. Say each cue as its scene starts, then let the app speak. At 0:00:) The same orange zone, in the app. (0:12:) Her crew's needs build the route. (0:24:) Out through the airlock, with her partner, EV2. (0:30:) A dust storm, and EV2 calls the storm front. (0:38:) The radiation alert. EV2 heads home ahead of her. (0:58:) Back through the airlock. (1:04:) The review compares her walk with the plan. |
| 2:38 | sources | P3 | Every number on screen says if it is measured, derived or simulated. The radiation and storm readings are real, from Gale crater, not Jezero, and their timing is ours. Our terrain matches NASA's HiRISE model to fourteen centimetres. |
| 2:56 | credits | P3 | The challenge asked for a survival guide to Mars. Ours starts with one question. On Mars, it is not where you can go. It is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Thank you. (Do not press Right again: the next beat opens the app.) |
| 3:18 | | | (End. 22 s under the 3:40 target, 42 s under the cap.) |

## Where each number comes from

Spoken:

| Number | Source |
|---|---|
| 20° no-go | `slope.no_go`, NASA EVA-EXP-0042 Rev B (DATA). The planner blocks steeper cells and makes steeper ground cost more |
| 30 min sortie | The zone beat's 30 min first sortie, with 15 % held back (`src/present/zoneFrames.js`, SIM). The 30 min oxygen reserve is `suit.reserve.time`, Apollo 17 procedures (DATA). Oxygen never runs short on the default walk, so the reserve and the sortie clock bound the zone |
| 0.14 m | RMS height difference between our 2 m grid and NASA Mars Trek's HiRISE Jezero DEM over 564,001 points (DERIVED). `docs/data/mars-trek-check/README.md` |

The route length, the 8 h suit limit, per-leg time and oxygen, the peak dose rate and the storm's opacity stay on screen, unspoken. Each beat's source line names their sources. The radiation and storm readings are real, from Curiosity at Gale crater, not Jezero. The storm's 30 s rise and the event timing are ours (SIM). "Potential biosignature, unconfirmed" follows NASA's wording for Cheyava Falls (July 2024).
