# Presentation run sheet

> **Format.** Hard limit 3:00 (the organisers' page, `docs/SUBMISSION.md`, PR #316). The talk is `script-en.md`, in English, and ends at 2:42. Then the judges ask questions (`qa.md`). There is no live demo: the `demo` beat plays an 85 s video of the real app.

**Autoplay is on.** The presentation plays its six beats by itself, and nobody needs to press anything. The speakers follow the screen. If the timing slips, any **Right** or **Left** takes over manually, and from then on each beat waits for a key. The autoplay default comes from the presentation thread's PR #373 (`feat/present-story-cut`); step 7 below checks that the live site has it.

Two versions of the talk are in `script-en.md`. **A**: P1 tells the story and says the last lines, P2 gives the video cues and the data part of the close. **B**: one presenter says everything. A third person, or P2 in version A, stands by the laptop only to take over if needed.

## Keys, for taking over

| Key | Does |
|---|---|
| **Right**, **Space**, **PageDown** or **Enter** | Next beat, and autoplay stops |
| **Left** or **PageUp** | Previous beat, and autoplay stops |
| **L** | Switch the captions between English and Spanish |
| **Esc** | Leave the presentation for the app. Do not press it during the talk |

## Before the talk (10 minutes before)

| Step | Do | Check |
|---|---|---|
| 1 | Plug the laptop into power and the projector. Display duplicated, 1920 x 1080. | The projector shows the desktop |
| 2 | Chrome, tab 1: `https://martian-map.fernando-haro-c.workers.dev/?present=1`. Let it load, then reload just before the talk so it starts at 0:00 when the speaker is ready. | About 20 s on the GPU laptop. "3D view unavailable. Captions only" means WebGL failed, so run the talk from the PDF (below) |
| 3 | Captions in English. If they show Spanish, press **L** once. | The first caption is in English |
| 4 | Tab 2: `docs/pitch/out/deck-global.pdf`, full screen, on slide 1. Tab 3: the backup video file the presentation thread records (the same 85 s cut as an mp4), paused at 0:00. | One click plays it |
| 5 | **F11** for full screen. Sound at about 30 %. | |
| 6 | Close every other app, notification and chat. | |
| 7 | Let the whole presentation autoplay once against a stopwatch. | It runs open, stakes, zone, radiation, demo, close and stops at 2:42 without a key. If it waits on the first beat, autoplay is not deployed: step it with **Right** on the times below. If it shows `plan`, `sources` and `credits`, the story cut is not deployed: tell Fernando and run from the PDF |

**No network.** The site makes no live calls to NASA. As a backup the night before: check out `main`, `npm ci`, `npm run build`, `npm run preview`, and keep `http://localhost:4173/?present=1`.

## The talk

Speakers in version A. In version B the one presenter says every line.

| Time | Beat on screen | Speaker and first words | If it slips or fails |
|---|---|---|---|
| 0:00 | `open` | P1: "The first people on Mars…" | Black screen or captions only: switch to tab 2 and follow the PDF column below |
| 0:14 | `stakes` | P1: "Two astronauts walk out…" | If the screen is still on `open`, press **Right** |
| 0:26 | `zone` | P1: "So the question is not…" | If the zone does not draw, say the line anyway |
| 0:41 | (end of `zone`) | P1: "Watch a radiation alert." Start 1 s before the beat changes, so "alert" lands with the alert at 0:42 | |
| 0:42 | `radiation` | P1: two seconds of silence while the zone closes, then "Only the way home is left." **Handover to P2** | |
| 0:52 | `demo` | P2: one cue per chapter card, at 0:00, 0:20, 0:30, 0:45, 1:05 and 1:15 of the video | See "If the video fails" |
| 2:17 | `close`, sources list | P2: "Marswalk layers four kinds of NASA data…" | |
| 2:31 | `close`, the names | **Handover to P1.** P1: "On Mars, the question is where you can still get home…" | If the names are not up yet, wait for them |
| 2:42 | end | P1: "Thank you." Then questions | Nobody presses anything |

## If the video fails

The `demo` beat shows no picture, freezes, or has no sound.

1. Click tab 3 and play the backup mp4 full screen. P2 says the cues over it. When it ends, click tab 1 and press **Right** for `close`. Autoplay is now off, so press **Right** again if the close needs it.
2. No backup file: show PDF slide 4 (the walk in four screens) and say the six cues over it in about 30 s, then go to `close`. The talk ends about 55 s early, which leaves more time for questions.

## If the whole presentation fails: the PDF

`out/deck-global.pdf` is the file sent to the organisers and the backup. Say the script's lines over these slides.

| Beats | Slide |
|---|---|
| `open` | 2 (Cheyava Falls, Jezero) |
| `stakes` | 2 (the limits: 8 h, 20°, no GPS) |
| `zone`, `radiation` | 3 (the margin). Do not read its 11 minutes aloud |
| `demo` | 4 (the walk in four screens), with the six cues |
| `close` | 5 (NASA sources), then 7 (0.14 m), then 1 (team and thesis) at "We are" |

## Rehearsal checklist

- [ ] Pick version A or B.
- [ ] Run the whole talk twice on the laptop with autoplay, against a stopwatch. It must end by 2:50.
- [ ] Practise "Watch a radiation alert" so it starts about 1 s before the beat changes, then hold the silence.
- [ ] Practise the handovers in version A: P1 to P2 after "Only the way home is left", P2 to P1 when the names appear.
- [ ] The video cues: say each one as its card appears, then stop talking.
- [ ] Only three numbers spoken: eight hours, twenty degrees, fourteen centimetres.
- [ ] The thesis is said twice, on `zone` and at the end.
- [ ] Practise one take-over: press **Right** mid-talk and finish the talk on keys.
- [ ] Open tabs 2 and 3 and check each fallback once.
- [ ] Confirm with the organisers: the 3:00 limit, whether Q&A follows, and whether we use our own laptop.
- [ ] Read `qa.md` aloud once and fill in the "Who answers" column.

## Re-check later

- **#373's final chapter times**: replace the video times in `script-en.md` and `script-es.md`, and rerun `node docs/pitch/tools/timing.mjs`.
- **Any change to `src/present/beats.js`**: rerun `node docs/pitch/tools/sync-present.mjs` and fix the times in both scripts.
