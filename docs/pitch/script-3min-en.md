# Local pitch script, 3 minutes (primary)

> **Format, from the Ensenada organisers** (quoted in `docs/SUBMISSION.md`, PR #316): "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos". Present in English, 3 minutes at most, to the local judges at 2:30 pm on 15 November. Send the presentation to the organisers by 2:00 pm. **Confirm with the organisers** whether the 3 minutes include the live demo and whether Q&A follows. If the slot turns out longer, use `script-5min-en.md` or `script-8min-en.md`.

This is the primary script. The Spanish twin, for rehearsal and for Spanish questions, is `script-3min-es.md`. The pitch runs in the presentation mode (`?present=1`, beats in `beats.md`, 3-minute table) and hands off to the live demo, cut B in `demo-run-sheet.md`. Presenters: **P1** (opening), **P2** (demo at the laptop), **P3** (answer and close). The team picks the names.

**Thesis:** on Mars, the question isn't where you can go. It's where you can go and still get home. Said once, early.

Pace: 140 words per minute. `node tools/timing.mjs` checks every row against its slot.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Jezero crater, Mars. An astronaut stands at Cheyava Falls, the rock where Perseverance found a potential biosignature, 913 metres from the habitat by the route. It is the end of her walk outside, her EVA: 160 grams of oxygen left. Walking back costs 54. Thirty minutes of reserve stay untouched. And a radiation alert comes in. |
| 0:25 | 1 · Thesis | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación, from Ensenada, and Marswalk answers it. |
| 0:39 | 3 · The walkback zone | P1 | The blue area is everywhere she can reach and still get back with her reserve, computed with the app's planner and suit model on NASA's HiRISE terrain. In the app, that is one number on the visor: the margin. |
| 0:56 | 4 · Demo | P2 | (Demo, cut B, 1:15. Lines below.) |
| 2:11 | 5 · The answer | P3 | Back at Cheyava Falls: a radiation alert means get to shelter early. Fourteen minutes of margin says she makes it, so Marswalk sends her home now, around slopes over twenty degrees. The alert replays a real 2017 solar storm that Curiosity measured in another crater, Gale, and says so. |
| 2:32 | 7 · Who, and one fact | P3 | It is for an EVA planner comparing three routes, and for a classroom here in Ensenada. Our copy of NASA's HiRISE terrain matches NASA Mars Trek to fourteen centimetres, a hand's width. That is the ground she walks home on. |
| 2:52 | | | (End. 8 seconds of slack.) |

## Demo lines (P2, cut B)

| Beat | Demo time | Text |
|---|---|---|
| B1 | 0:00 | Same question, live, on a 55 metre first walk. The route comes from the HiRISE terrain and never crosses the red ground, slopes over twenty degrees. |
| B2 | 0:15 | I play the end of an EVA: twenty percent oxygen. The plan says go. |
| B3 | 0:25 | On the left, the margin: minutes left after walking home and keeping the reserve. (Walk.) |
| B4 | 0:45 | I fire her radiation alert by hand to save time. The target becomes the habitat as shelter, and the margin now counts the walk to shelter. |
| | 1:15 | (Back to the presentation mode.) |

## Where each number comes from

The table at the end of `script-5min-es.md`. Numbers we must not claim are listed in `docs/SUBMISSION.md` (PR #316): no "live" data, no radiation at Jezero, no GPS, no "1 m" without "resampled to 2 m", no NASA endorsement.
