# Local pitch script, 4 minutes (English)

> **Format.** Fernando set the limit on 15 November. The whole talk runs at most 4 minutes, video included, and the target is 3:40. The organisers' page quoted in `docs/SUBMISSION.md` (PR #316) says "tiempo máximo de 3 minutos". The team takes 4 and confirms with them. There is no 3-minute version, because the app video alone runs 75 to 90 s.

This is the talk in English. `script-4min-es.md` is the same talk in Spanish for the local judges, with the same beats and the same times. Say it in the language the organisers confirm. The talk runs in the presentation mode (https://martian-map.fernando-haro-c.workers.dev/?present=1), one **Right** per beat, as `demo-run-sheet.md` says. A recorded video of the real app, the `demo` beat, replaces the live demo. If WebGL fails, the presentation shows captions only, so switch to `out/deck-global.pdf`.

**Beat names.** The rows use the beat ids on `main` (`mars` to `sources`) plus `demo` and `credits` from draft PR #356. That PR is not final. Its draft at 85067fd runs the video for 85 s, folds `radiation` into `zone` and drops `storm`. The 85 s below is that draft's number, not a measured one. When #356 merges, follow "After #356 merges" in `demo-run-sheet.md`.

**Thesis.** On Mars, the question isn't where you can go. It's where you can go and still get home. Say it on the zone and again to close.

**The moment to remember** is the zone closing at the radiation alert. Say "Watch the zone", press Right on the word "zone", and hold two seconds of silence while it shrinks. On `main` the zone closes between 1.2 and 2.4 s after that Right, so any word spoken then covers it.

**Three spoken numbers only.** They are the 20° no-go slope, the 30 min reserve and the 0.14 m terrain check. Other numbers stay on screen, unspoken. Say no margin or dose figure.

**Pace.** The rows fit at 130 words per minute (`council/timing-4min-130.md`) and none passes 140. The words take 1:54, the silence 2 s and the video 85 s, which is 3:21 of content. The table ends at 3:35, so 14 s of slack sit inside it and the talk ends 5 s under the 3:40 target and 25 s under the cap. A 75 s video ends it at 3:25, a 90 s one at 3:40.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | mars | P1 | On Mars, nobody can come and get you. Marswalk shows an astronaut where she can go and still get home. |
| 0:10 | jezero | P1 | This is Jezero crater, once a lake. Every picture here comes from NASA orbiters. |
| 0:18 | cheyava | P1 | Her goal is Cheyava Falls, where Perseverance found a potential biosignature, unconfirmed. She walks there from the habitat. |
| 0:30 | danger | P1 | If something goes wrong out here, the only rescue is her own walk home. |
| 0:38 | plan | P1 | Marswalk plans that walk on NASA's HiRISE terrain. Slopes over twenty degrees are no-go, and every metre costs time and oxygen, priced from NASA's suited walking tests. |
| 0:52 | zone | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. On a thirty minute sortie, the orange area is everywhere she can reach and still get back in time. Then a radiation alert. Watch the zone. (Press Right on the word "zone".) |
| 1:15 | radiation | P1 | (Hold two seconds of silence while the zone closes.) Only the way home is left. She turns back now. |
| 1:23 | storm | P1 | Then a dust storm hides the horizon, and with it her position. Now the real app, recorded. |
| 1:32 | demo | P2 | (The app video plays. Say each cue when its scene starts, then let the app speak.) The crew tells the mission table what it needs, and Marswalk builds the routes. The same orange zone, now in the app. Out through the airlock. An event hits, and her crewmate, EV2, reacts. Back inside, the review compares the route she walked with the plan. |
| 2:57 | sources | P3 | Every number on screen says if it is measured, derived or simulated. The radiation and storm readings are real, from Gale crater, not Jezero. Their timing is simulated. Our terrain matches NASA's HiRISE model to fourteen centimetres. |
| 3:15 | credits | P3 | The challenge asked for a survival guide to Mars. Ours starts with one question. On Mars, it is not where you can go. It is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Thank you. (Do not press Right again.) |
| 3:35 | | | (End. 5 s under the 3:40 target.) |

On `main` there is no `credits` beat yet. Stay on `sources` and say the `credits` row over it.

## What changed in this pass, and why

- The alert cue moved to the end of the `zone` row. Before, the presenter pressed Right and then said "Watch the zone", and the zone had closed before the sentence ended.
- The `storm` beat has a line that hands over to the video. Before, it was 5 s of dead air.
- The `jezero` line no longer says HiRISE. That beat shows THEMIS and CTX images, and HiRISE arrives with `cheyava`.
- The video cue for the event names no storm, because #356 has not fixed which event the cut shows.
- The close names the challenge once, then the thesis, then the team.

## Where each number comes from

Spoken:

| Number | Source |
|---|---|
| 20° no-go | `slope.no_go`, NASA EVA-EXP-0042 Rev B (DATA). The planner blocks steeper cells and makes steeper ground cost more |
| 30 min reserve | `suit.reserve.time`, Apollo 17 procedures (DATA). The zone beat runs our 30 min first sortie (SIM). Oxygen never runs short on the default walk, so the reserve and the sortie clock bound the zone |
| 0.14 m | RMS height difference between our 2 m grid and NASA Mars Trek's HiRISE Jezero DEM over 564,001 points (DERIVED). `docs/data/mars-trek-check/README.md` |

The route length, the 8 h suit limit, per-leg time and oxygen, the peak dose rate and the storm's opacity stay on screen, unspoken. Each beat's source line names their sources. The radiation and storm readings are real, from Curiosity at Gale crater, not Jezero. The storm's 30 s rise and the event timing are ours (SIM). "Potential biosignature, unconfirmed" follows NASA's wording for Cheyava Falls (July 2024).
