# Local pitch script, 5 minutes (English, primary)

> **Format.** The team plans a 5-minute talk with the live demo inside it, then Q&A. The organisers' page quoted in `docs/SUBMISSION.md` (PR #316) still says "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos". **Confirm with the organisers** before 2:00 pm. If they hold to 3 minutes, use the cut point marked below, which hands over to `script-3min-en.md`.

This is the primary local pitch, in English, at 2:30 pm on 15 November. The Spanish twin, for rehearsal and for Spanish questions, is `script-5min-es.md`. The pitch runs in the presentation mode (`?present=1`, #330, beats in `beats.md`, 5-minute table) and hands off to the live demo, cut A in `demo-run-sheet.md`. If the presentation mode is not merged by 2:00 pm or fails on the laptop, show `out/deck-global.pdf`: slide 2 for beat 1a, slide 1 for 1b, slide 3 for beats 2, 3 and 5, slide 4 behind the demo if the app fails, slides 5 and 6 for beat 6, slide 7 for beat 7. Presenters: **P1** (opening), **P2** (demo at the laptop), **P3** (answer and close). The team picks the names.

**Thesis:** on Mars, the question isn't where you can go. It's where you can go and still get home. Said once, early. Everything after proves it.

Pace: written for 125 words per minute, and no row passes 140 (`node tools/timing.mjs`). The talk ends at 4:45, demo included, so 15 seconds are left for a slow load or a laugh.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Jezero crater, Mars. An astronaut stands at Cheyava Falls, where Perseverance found a possible sign of life, 913 metres from the habitat by the route. It is the end of her walk outside, her EVA. She has 160 grams of oxygen. Walking back costs 53. Her reserve, thirty minutes of breathing, is another 72. Then a radiation alert. |
| 0:28 | 1 · Thesis | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación, from Ensenada. Marswalk counts those minutes on real NASA terrain. |
| 0:46 | 2 · The limits | P1 | (**Cut point to 3 minutes.** If the organisers hold to 3 minutes, P1 skips this row and says beat 3 of `script-3min-en.md`, also at 0:46, and P2 runs demo cut B. Beats 1a and 1b above are word for word the same as the 3-minute script.) Three limits from NASA's lunar suits: eight hours outside, thirty minutes of reserve, nothing steeper than twenty degrees. And no GPS, so the way home is read from the ground. |
| 1:01 | 3 · The walkback zone | P1 | The blue area is everywhere she can reach and still get back with her reserve, drawn with the app's own planner. Every climb shrinks it. The alert closes it to the way home. In the app, it is one number on the visor, the margin. |
| 1:23 | 4 · Demo | P2 | (Demo, cut A, 2:14. Lines below.) |
| 3:37 | 5 · The answer and the data | P3 | Back to the astronaut at Cheyava Falls. The alert leaves her fourteen minutes of margin, so Marswalk sends her home now. The slope comes from the HiRISE model, the rock from Perseverance's photos. The storm reaches the opacity Curiosity measured in 2018, and the alert replays Curiosity's 2017 radiation doses. |
| 4:03 | 6 · Measured or simulated | P3 | Every reading says whether it is measured, calculated or assumed. Walking at one metre per second is assumed. The storm peak and the radiation are Curiosity's, from Gale, not Jezero, and the alert says so. The weather is Perseverance's MEDA station. |
| 4:23 | 7 · Who, and one fact | P3 | It could serve whoever plans a walk, comparing three routes before approving one, and a class in Ensenada, in a browser. One last number: we process the same HiRISE model NASA Mars Trek serves, and the typical difference is fourteen centimetres. |
| 4:45 | | | (End. 15 seconds of slack.) |

## Demo lines (P2, cut A)

Times run from the handover at 1:23. Keys, clicks and a fallback for each beat are in `demo-run-sheet.md`, cut A.

| Beat | Demo time | Text |
|---|---|---|
| D1 | 0:00 | The mission table, on HiRISE terrain of Jezero. |
| D2 | 0:05 | Terrain layer, the slope. The route goes around yellow, and the planner blocks red, over twenty degrees. |
| D3 | 0:25 | If the crew asks for Cheyava Falls, the route grows and the plan reprices time and oxygen. Live, we walk the first stop, 55 metres. |
| D4 | 0:45 | I play the end of an EVA and leave with 20 % oxygen. The plan says go. |
| D5 | 0:55 | On the left is the margin, the minutes I have left after walking home and keeping the reserve. It is priced at my pace. Below is position. With no GPS, the error grows as I walk and resets when I stop with a clear horizon. That model is ours, and it says SIM. |
| D6 | 1:48 | We're here. Photo, sample, stow. |
| D7 | 2:03 | Dust storm. It takes the horizon, and without a horizon there is no position fix. The route re-plans to the habitat. |
| | 2:14 | (Back to the presentation mode. The radiation alert fires in the app about 15 s after the storm; P3 covers it in beat 5.) |

## Optional opening, 20 seconds

Only if the team picks it in rehearsal. It goes before beat 1 and needs 20 seconds the talk does not have: it would end at 5:05. Use it only if the organisers confirm more than 5 minutes.

| Time | Who | Text |
|---|---|---|
| 0:00 | P1 | Last year, five of us won Ensenada with NASA Explorer, first of seventeen, and Global Nominees. This year Andrea joined. Refried, new generation. |
| 0:12 | P1 | (Pause. Cut to Jezero.) |
| 0:20 | | |

Sources for every number: the table at the end of `script-5min-es.md`, and "Which number is which" in `README.md`.
