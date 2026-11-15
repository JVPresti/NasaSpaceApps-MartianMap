# Local pitch script, 3 minutes (fallback)

> **Format, from the Ensenada organisers** (quoted in `docs/SUBMISSION.md`, PR #316): "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos". Present in English, 3 minutes at most, to the local judges at 2:30 pm on 15 November. Send the presentation to the organisers by 2:00 pm. **Confirm with the organisers** whether the 3 minutes include the live demo and whether Q&A follows. The team plans 5 minutes with `script-5min-en.md`; this script is the fallback.

This is the fallback script, if the organisers hold to the 3 minutes on their page. The primary is `script-5min-en.md`; the speaker switches here at 0:46, after the thesis, which both scripts share word for word. The Spanish twin, for rehearsal and for Spanish questions, is `script-3min-es.md`. The pitch runs in the presentation mode (`?present=1`, beats in `beats.md`, 3-minute table) and hands off to the live demo, cut B in `demo-run-sheet.md`. The presentation mode is on `main` (https://martian-map.fernando-haro-c.workers.dev/?present=1&debug=1). If WebGL fails on the laptop, it shows captions only: switch to `out/deck-global.pdf`, the file sent to the organisers, and use slide 2 for beat 1a, slide 1 for 1b, slide 3 for beats 3 and 5, slide 7 for beat 7. The live demo needs WebGL too: narrate cut B over slide 4 and the stills. Presenters: **P1** (opening), **P2** (demo at the laptop), **P3** (answer and close). The team picks the names.

**Thesis:** on Mars, the question isn't where you can go. It's where you can go and still get home. Said once, early.

Pace: written for 125 words per minute, the speed of Spanish speakers presenting in English (`node tools/timing.mjs --wpm 125 docs/pitch/script-3min-en.md`). Time the real presenters with a stopwatch too. The Mars Trek check (0.14 m) stays on slide 7 and in `qa.md` question 4; the spoken close is the decision and the Apollo rule.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | 1 · Jezero | P1 | Jezero crater, Mars. An astronaut stands at Cheyava Falls, where Perseverance found a possible sign of life, 913 metres from the habitat by the route. It is the end of her walk outside, her EVA. She has 160 grams of oxygen. Walking back costs 53. Her reserve, thirty minutes of breathing, is another 72. Then a radiation alert. |
| 0:28 | 1 · Thesis | P1 | On Mars, the question isn't where you can go. It's where you can go and still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación, from Ensenada. Marswalk counts those minutes on real NASA terrain. |
| 0:46 | 3 · The walkback zone | P1 | This drawing, made with the app's own planner, shows everywhere she can reach and still get back. In the app, that is one number on the visor, the margin. |
| 1:01 | 4 · Demo | P2 | (Demo, cut B, 1:15. Lines below.) |
| 2:16 | 5 · The answer | P3 | Back at Cheyava Falls, an alert means shelter early. Fourteen minutes of margin says she makes it, so Marswalk sends her home now, on a route planned around ground over twenty degrees. The alert replays a real 2017 solar storm measured by Curiosity in Gale crater. |
| 2:38 | 7 · Who, and why it matters | P3 | Apollo crews walked under this same rule, a walkback limit with a thirty minute reserve. Marswalk lets an EVA planner check three routes against it before anyone walks. |
| 2:52 | | | (End. 8 seconds of slack at 125 words per minute.) |

## Demo lines (P2, cut B)

| Beat | Demo time | Text |
|---|---|---|
| B1 | 0:00 | Cheyava Falls is almost an hour out, with the work at its stops, so live we walk the first 55 metres. The planner blocks red, slopes over twenty degrees. |
| B2 | 0:15 | I play the end of an EVA, with twenty percent oxygen. The plan says go. |
| B3 | 0:25 | On the left is the margin, the minutes left after walking home and keeping the reserve. (Walk.) |
| B4 | 0:45 | I fire the same radiation alert by hand. The target becomes the habitat as shelter, and the margin now counts the walk there. |
| | 1:15 | (Back to the presentation mode.) |

## Where each number comes from

The table at the end of `script-5min-es.md`. Numbers we must not claim are listed in `docs/SUBMISSION.md` (PR #316): no "live" data, no radiation at Jezero, no GPS, no "1 m" without "resampled to 2 m", no NASA endorsement.
