# Marswalk pitch

Everything the team needs to present Marswalk at NASA Space Apps 2026 (challenge "Interplanetary Survival Guide:
Martian Map", Ensenada local event). Built on the first mission of PR #282 and its `docs/DEMO.md`.

> **Format.** The talk is at 2:30 pm on 15 November, in English, and the file goes to the organisers by 2:00 pm. The
> organisers' page quoted in `docs/SUBMISSION.md` (PR #316) says "prepárate para exponer en idioma inglés durante un
> tiempo máximo de 3 minutos". The team plans 5 minutes, live demo included, and will confirm with the organisers.
> `script-5min-en.md` is the primary. `script-3min-en.md` is the fallback if they hold to 3 minutes: the speaker
> switches at 0:46, after the thesis, where the 5-minute script marks the cut point.
>
> **The file for the organisers is `docs/pitch/out/deck-global.pdf`**, the 7-slide deck. It is also the backup on the
> day: the talk runs from the presentation mode on `main` (https://martian-map.fernando-haro-c.workers.dev/?present=1&debug=1), and if WebGL fails
> on the laptop, the presenter switches to the same PDF (slide mapping in `script-5min-en.md`).

**Thesis.** On Mars, the question isn't where you can go. It's where you can go and still get home.

| File | What it is |
|---|---|
| `beats.md` | The beats of the presentation mode on `main` (https://martian-map.fernando-haro-c.workers.dev/?present=1), copied from `src/present/beats.js` by `tools/sync-present.mjs`, then the speaker's plan over them: camera idea, on-screen words in English and Spanish, presenter line, time. The presentation's source is `src/present/beats.js` on `main`; this file follows it |
| `script-5min-en.md`, `script-5min-es.md` | **The primary local pitch**: 5 minutes in English, ending at 4:45 with demo cut A; Spanish twin for rehearsal and questions |
| `script-8min-es.md`, `script-8min-en.md` | The 8-minute version: DEMO.md's full demo with the story around it |
| `script-3min-en.md`, `script-3min-es.md` | The fallback, if the organisers hold to 3 minutes: English, with a Spanish twin |
| `demo-run-sheet.md` | The live demo: URL, clicks, keys, lines and a fallback for every beat, verified against #282 at 8ec6f72. Cut A (2:14) for the 5-minute pitch, cut B (1:15) for the 3-minute fallback; re-check list for the branches still to merge |
| `qa.md` | The 14 hardest questions, plus three quick ones, with short, honest answers |
| `video-30s.md` | The 30-second video script and frame-accurate shot list |
| `deck-global.html`, `out/deck-global.pdf`, `out/deck-global/*.png` | The 7-slide global deck: one self-contained HTML file (fonts and images inlined), its PDF and one PNG per slide |
| `fallback/stills/` | Real screenshots of the #282 demo, one per beat, for when the live demo fails |
| `council/` | The council of AI reviewers playing judges, not people: rubric, every round's raw JSON, `log.tsv`, timing checks |
| `src/`, `img/`, `fonts/`, `tools/` | Deck sources and the scripts that build it |

## Which number is which

The pitch, the challenge-fit doc (#328) and the technical report (#338) quote distances and margins from different
builds and scenarios. Each one is right for its source. Say the pitch's numbers, and name the source if a judge has read
the others.

| Number | Where it comes from | Used in |
|---|---|---|
| 913 m, habitat to Cheyava Falls | Our planner export on `main` (`tools/walkback-zone.mjs`, `planRoute` through WP1, WP2 and WP3; legs 356 + 255 + 242 + 60 m in `data/walkback-zone.json`) | Every script, slide 2, the video |
| 934 m | #282's mission table, goal **Sample Cheyava Falls**, Fastest profile, by Bright Angel (`docs/DEMO.md` on 8ec6f72) | What the screen shows in the demo; don't read it aloud |
| 824 m, 53 g, 18 min | The re-planned walk home from Cheyava Falls in the same export (`coldOpen`) | Cold open, slide 2 |
| 14 min margin | Our SIM scenario: 160 g left at Cheyava Falls, minus 53 g home and the 72.5 g reserve, at 2.42 g/min | Cold open, beat 5, slide 3 |
| +399 min | The HUD on `main`, 40 m from home with a full tank (screenshot `img/app-hud-margin.jpg`) | Slide 3 caption, `qa.md` 5c |
| +457 and +245 min | `main`, Fastest profile to Cheyava Falls: HUD at the airlock and the Suit tab (#328) | Not in the pitch |
| +479, +285 and +224 min | #282's first sortie: HUD at the airlock, the Suit step, the debrief's lowest margin (#338) | Not in the pitch |

The HUD and the Suit tab disagree because the HUD takes the smaller of the oxygen margin and the 8-hour EVA clock
(#323). #338 calls 913 m the walk home. In this export 913 m is the way out and 824 m the way home.

## Rebuild

```
node docs/pitch/tools/render.mjs           # src/*.html -> self-contained HTML, PNG per slide, PDF
node docs/pitch/tools/timing.mjs           # every script row against its slot at 140 wpm, the ceiling; the scripts are written for 125
node docs/pitch/tools/timing.mjs --wpm 125 --out council/timing-5min-125.md script-5min-en.md script-5min-es.md
node docs/pitch/tools/sync-beats.mjs       # copy script-5min-en.md's lines and times into beats.md
node docs/pitch/tools/sync-present.mjs     # copy main's src/present/beats.js captions and numbers into beats.md
node docs/pitch/tools/walkback-zone.mjs    # walkback zone and leg numbers from src/sim (for beats 1 and 3)
```

`render.mjs` needs `puppeteer-core` (a repo devDependency) and a Chromium (`CHROME_PATH`, or the Playwright cache).
The theme is one block of CSS variables in `src/theme.css`, copied from the app's tokens (#232), so a new look is a
change to that block.

## Assumptions the team must confirm

- That the slot is 5 minutes and not the 3 the organisers' page says, whether the live demo counts inside it, whether Q&A follows, and whether we can plug in our own laptop.
- Presenters P1, P2, P3 and who drives the laptop.
- Who records the 30-second video and on which machine.
- The AI-use and "built before the event" answers in `qa.md` (questions 10 and 11).
