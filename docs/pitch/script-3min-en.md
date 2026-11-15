# Local pitch script, 3 minutes (primary)

> **Format, from the Ensenada organisers** (quoted in `docs/SUBMISSION.md`, PR #316): "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos". Present in English, 3 minutes at most, to the local judges at 2:30 pm on 15 November. Send the presentation to the organisers by 2:00 pm. **Confirm with the organisers** whether the 3 minutes include the live demo and whether Q&A follows. If the slot turns out longer, use `script-5min-en.md` or `script-8min-en.md`.

This is the primary script. The Spanish twin, for rehearsal and for Spanish questions, is `script-3min-es.md`. The pitch runs in the presentation mode (`?present=1`, beats in `beats.md`, 3-minute table) and hands off to the live demo, cut B in `demo-run-sheet.md`. Presenters: **P1** (opening), **P2** (demo at the laptop), **P3** (answer and close). The team picks the names.

**Thesis:** on Mars, the question isn't where you can go. It's where you can go and still get home. Said once, early.

Pace: 140 words per minute. `node tools/timing.mjs` checks every row against its slot.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Jezero crater, Mars. An astronaut stands at Cheyava Falls, the rock where Perseverance found a potential biosignature, 913 metres from the habitat by the route. It is the end of her EVA: 160 grams of oxygen left. Walking back costs 54. Thirty minutes of reserve stay untouched. And a radiation alert comes in. |
| 0:24 | 1 · Thesis | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación, from Ensenada. This is Marswalk. |
| 0:38 | 3 · The walkback zone | P1 | The blue area is everywhere she can reach and still get back with her reserve, computed with the app's planner and suit model on NASA's HiRISE terrain. In the app, that is one number on the visor: the margin. |
| 0:55 | 4 · Demo | P2 | (Demo, cut B, 1:15. Lines below.) |
| 2:10 | 5 · The answer | P3 | And the astronaut at Cheyava Falls? Thirteen minutes of margin: Marswalk sends her home now, around slopes over twenty degrees. Curiosity measured that radiation in Gale crater, not Jezero, and the alert says so. |
| 2:28 | 7 · One fact | P3 | One last number: our grid reproduces the HiRISE model on NASA Mars Trek to fourteen centimetres. The QR code opens the demo. |
| 2:42 | | | (End. 18 seconds of slack.) |

## Demo lines (P2, cut B)

| Beat | Demo time | Text |
|---|---|---|
| B1 | 0:00 | The mission table. The route comes from the HiRISE terrain and never crosses slopes over twenty degrees: the red ground. |
| B2 | 0:15 | I play the end of an EVA: twenty percent oxygen. The plan says go. |
| B3 | 0:25 | On the left, the margin: minutes left after walking home and keeping the reserve. It drops as I walk. (Walk.) |
| B4 | 0:45 | I fire the dust storm by hand to save time. It takes the horizon, so no position fix, and the route re-plans to the habitat. |
| | 1:15 | (Back to the presentation mode.) |

## Where each number comes from

The table at the end of `script-5min-es.md`. Numbers we must not claim are listed in `docs/SUBMISSION.md` (PR #316): no "live" data, no radiation at Jezero, no GPS, no "1 m" without "resampled to 2 m", no NASA endorsement.
