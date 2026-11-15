# Local pitch script, 4 minutes (English)

> **Format.** Fernando's call at 9:25 am on 15 November: the whole talk runs at most 4 minutes, video included. Target 3:40, hard cap 4:00. The organisers' page quoted in `docs/SUBMISSION.md` (PR #316) says "tiempo máximo de 3 minutos"; the team takes 4 and confirms with them. There is no 3-minute version: the app video alone runs 75 to 90 s, so a 3-minute cut would drop beats rather than trim words.

This is the only talk script. The Spanish twin, for rehearsal and for Spanish questions, is `script-4min-es.md`. The talk runs in the presentation mode on `main` (https://martian-map.fernando-haro-c.workers.dev/?present=1), one **Right** per beat, as `demo-run-sheet.md` says. There is no live demo: an edited app video, a beat inside `?present=1`, shows the app. If WebGL fails, the presentation shows captions only: switch to `out/deck-global.pdf`, the file sent to the organisers (slide per beat in `demo-run-sheet.md`).

**Draft against the current beats.** The beat ids and lengths come from #353 (`fix/present-polish`, 63298ed). The `video` beat is a placeholder of 88 s until the presentation thread posts its PR with the real beat list and lengths. Then run `node tools/sync-present.mjs`, set the times below to the real lengths, and rerun `node tools/timing.mjs`.

**Thesis:** on Mars, the question isn't where you can go. It's where you can go and still get home. Said once, on the zone.

Pace: written for 125 words per minute; no row passes 140 (`node tools/timing.mjs`). With an 88 s video the talk ends at 3:37, 23 s under the cap. A 75 s video ends it at 3:24, a 90 s one at 3:39. Speak over the cinematic beats; during the video say only the four short cues.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | mars | P1 | (Let the Marswalk title sit for a breath.) Mars. We are Los Frijolitos Espaciales Refritos Nueva Generación, from Ensenada. This is Marswalk. |
| 0:08 | jezero | P1 | Jezero crater, a lake three and a half billion years ago. Perseverance landed here in 2021. |
| 0:17 | cheyava | P1 | This is Cheyava Falls, where Perseverance found a possible sign of ancient life. Our astronaut walks here, 913 metres from the habitat, on real HiRISE terrain. |
| 0:31 | danger | P1 | On Mars, nobody can come and get you. The suit allows eight hours outside, and thirty minutes of oxygen stay in reserve. |
| 0:43 | plan | P1 | Marswalk plans the walk on that terrain. It blocks slopes over twenty degrees and prices every metre in time and oxygen, from NASA's suited walking tests. |
| 0:57 | zone | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. The orange area is everywhere she can reach and still walk back with her reserve. Every climb shrinks it. |
| 1:16 | radiation | P1 | Then a radiation alert, with real dose rates Curiosity measured in 2017. The zone closes to the way home, and she turns back now. |
| 1:28 | storm | P1 | Then a dust storm, as thick as Curiosity's in 2018. Both readings come from Gale crater, not Jezero, and the screen says so. |
| 1:39 | video | P2 | (The app video plays. Say each cue when its scene starts, then let the app speak.) The crew plans at the mission table. The same orange zone, in the app. Out through the airlock. Her partner reacts to the alert. Back inside, the review compares the walk with the plan. |
| 3:07 | sources | P3 | Every number says whether it is measured, derived or simulated. Walking speed is our assumption. Our terrain matches NASA's HiRISE model to fourteen centimetres. |
| 3:19 | credits | P3 | Every source is on screen, by name. Next come a real heart rate sensor and other HiRISE sites. Because on Mars, the question is where you can still get home. Thank you. (Do not press Right again.) |
| 3:37 | | | (End. 23 s under the 4:00 cap.) |

## Where each number comes from

| Number | Source |
|---|---|
| 913 m, habitat to Cheyava Falls | The app's planner (`planRoute`) through WP1, WP2 and WP3; `plan` beat chip `totals.distanceM` (DERIVED). See "Which number is which" in `README.md` |
| 8 h, 30 min | `suit.eva_duration_max`, NASA xEVA Concept of Operations EVA-EXP-0042; `suit.reserve.time`, Apollo 17 procedures (DATA) |
| 20° | `slope.no_go`, NASA EVA-EXP-0042 Rev B (DATA). The planner blocks steeper cells and makes steeper ground cost more |
| Oxygen per metre | Minetti et al. 2002 walking model, scaled to Mars and calibrated to NASA's suited tests (Norcross), plus Apollo 15's 20 % walkback pad (DERIVED) |
| The orange zone | Our planner and suit model, two Dijkstra passes over the HiRISE cost grid, on our sortie scenario (SIM). Not in the walk HUD yet; the HUD shows it as one number, the margin |
| Radiation, 2017 | MSL Curiosity RAD, Gale crater, September 2017 event (Zeitlin et al. 2018), peak about 26 µGy/h (DATA) |
| Dust storm, 2018 | τ 8 at Gale during the 2018 global storm (DATA); its rise in 30 s is ours (SIM) |
| 1 m/s walking | `mobility.speed.flat` (SIM) |
| 0.14 m | RMS height difference between our 2 m grid and NASA Mars Trek's HiRISE Jezero DEM over 564,001 points (DERIVED). `docs/data/mars-trek-check/README.md` |
| Heart rate next | NASA's model of metabolic rate from heart rate (Hoffmann 2021) |
