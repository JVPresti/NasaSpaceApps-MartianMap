# Local pitch script, 3 minutes (primary)

> **Format, from the Ensenada organisers** (quoted in `docs/SUBMISSION.md`, PR #316): "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos". Present in English, 3 minutes at most, to the local judges at 2:30 pm on 15 November. Send the presentation to the organisers by 2:00 pm. **Confirm with the organisers** whether the 3 minutes include the live demo and whether Q&A follows. If the slot turns out longer, use `script-5min-en.md` or `script-8min-en.md`.

This is the primary script. The Spanish twin, for rehearsal and for Spanish questions, is `script-3min-es.md`. The pitch runs in the presentation mode (`?present=1`, beats in `beats.md`, 3-minute table) and hands off to the live demo, cut B in `demo-run-sheet.md`. Presenters: **P1** (opening), **P2** (demo at the laptop), **P3** (answer and close). The team picks the names.

**Thesis:** on Mars, the question isn't where you can go. It's where you can go and still get home. Said once, early.

Pace: written for 125 words per minute, the speed of Spanish speakers presenting in English (`node tools/timing.mjs --wpm 125 docs/pitch/script-3min-en.md`). Time the real presenters with a stopwatch too. The Mars Trek check (0.14 m) stays on slide 7 and in `qa.md` question 4; the spoken close is the decision and the Apollo rule.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Jezero crater, Mars. An astronaut stands at Cheyava Falls, where Perseverance found a possible sign of life, 913 metres from the habitat. It is the end of her walk outside, her EVA. She has 160 grams of oxygen. Walking back costs 53. Her reserve, thirty minutes of breathing, is another 72. Then a radiation alert. |
| 0:27 | 1 · Thesis | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación, from Ensenada. Marswalk counts those minutes on real NASA terrain. |
| 0:45 | 3 · The walkback zone | P1 | This drawing, made with the app's own planner, shows everywhere she can reach and still get back. In the app, it is one number on the visor: the margin. |
| 1:00 | 4 · Demo | P2 | (Demo, cut B, 1:15. Lines below.) |
| 2:15 | 5 · The answer | P3 | Back at Cheyava Falls: an alert means shelter early. Fourteen minutes of margin says she makes it, so Marswalk sends her home now, around every slope over twenty degrees. The alert replays a real 2017 solar storm measured by Curiosity in Gale crater. |
| 2:37 | 7 · Who, and why it matters | P3 | Apollo crews walked under this same rule: a walkback limit and a thirty minute reserve. Marswalk lets an EVA planner check three routes against it before anyone walks. |
| 2:51 | | | (End. 9 seconds of slack at 125 words per minute.) |

## Demo lines (P2, cut B)

| Beat | Demo time | Text |
|---|---|---|
| B1 | 0:00 | Cheyava Falls is an eighteen minute walk, so live we take the first 55 metres. The route never crosses the red ground, slopes over twenty degrees. |
| B2 | 0:15 | I play the end of an EVA: twenty percent oxygen. The plan says go. |
| B3 | 0:25 | On the left, the margin: minutes left after walking home and keeping the reserve. (Walk.) |
| B4 | 0:45 | I fire the same radiation alert by hand. The target becomes the habitat as shelter, and the margin now counts the walk to shelter. |
| | 1:15 | (Back to the presentation mode.) |

## Where each number comes from

The table at the end of `script-5min-es.md`. Numbers we must not claim are listed in `docs/SUBMISSION.md` (PR #316): no "live" data, no radiation at Jezero, no GPS, no "1 m" without "resampled to 2 m", no NASA endorsement.
