# Presentation run sheet

> **Format.** The organisers' official guidelines: at most 4 minutes, 5 to 6 slides. The talk is `script-en.md`, in English (`script-es.md` if they ask for Spanish), six beats, one per slide, and ends at 3:00. Then the judges ask questions (`qa.md`). There is no live demo. The `demo` beat plays an 85 s video of the real app, with no sound.

**It opens paused.** The presentation waits on slide 1 behind a **Play** button. Press it, or Space, when the speaker is ready, and the six slides then play by themselves to 3:55. **P** pauses and resumes at any point, video included. **Right** and **Left** move one slide at once, and the digits **1** to **6** jump to that slide. The slide number is in the bottom right corner, so a speaker can say "slide 4" and the operator presses 4.

Two versions of the talk are in `script-en.md`. **A**: P1 tells the story and says the last lines, P2 gives the video cues and the data part of the close. **B**: one presenter says everything. A third person, or P2 in version A, stands by the laptop only to take over if needed.

## Keys, for taking over

| Key | Does |
|---|---|
| **Play** button, **Space**, **P** | Play, and pressed again, pause. A pause freezes the slide and the video |
| **Right**, **PageDown**, **Enter** | Next slide at once. The play state carries over |
| **Left**, **PageUp** | Previous slide, from its start |
| **1** to **6** | Jump to that slide |
| **L** | Switch the captions between English and Spanish |
| **Esc** | Leave the presentation for the app. Do not press it during the talk |

## Before the talk (10 minutes before)

| Step | Do | Check |
|---|---|---|
| 1 | Plug the laptop into power and the projector. Display duplicated, 1920 x 1080. | The projector shows the desktop |
| 2 | Chrome, tab 1: `https://martian-map.fernando-haro-c.workers.dev/?present=1`. Let it load. It waits paused on slide 1 behind the Play button until the speaker is ready. | About 20 s on the GPU laptop. "3D view unavailable. Captions only" means WebGL failed, so run the talk from the PDF (below) |
| 3 | Captions in English. If they show Spanish, press **L** once. | The first caption is in English |
| 4 | Tab 2: `docs/pitch/out/deck-global.pdf`, full screen, on slide 1. Tab 3: the backup video file the presentation thread records (the same cut as an mp4), paused at 0:00. | One click plays it |
| 5 | **F11** for full screen. The presentation's video is muted (`Present.jsx`), so no sound is needed for it. | |
| 6 | Close every other app, notification and chat. | |
| 7 | Let the whole presentation autoplay once against a stopwatch. | After Play it runs open, stakes, zone, radiation, demo, close and stops at 3:55 without another key, with the QR code on the close. If there is no Play button and no slide number, this change is not deployed: it still plays, but the first Right press only takes over. If it shows `plan`, `sources` and `credits`, the story cut is not deployed: tell Fernando and run from the PDF |

**No network.** The site makes no live calls to NASA. As a backup the night before: check out `main`, `npm ci`, `npm run build`, `npm run preview`, and keep `http://localhost:4173/?present=1`.

## The talk

Speakers in version A. In version B the one presenter says every line.

| Time | Beat on screen | Speaker and first words | If it slips or fails |
|---|---|---|---|
| 0:00 | `open` | P1: "The first people on Mars…" | Black screen or captions only: switch to tab 2 and follow the PDF column below |
| 0:16 | `stakes` | P1: "Two astronauts walk out…" | If the screen is still on `open`, press **Right** twice: once to take over, once to move |
| 0:30 | `zone` | P1: "So the question is not…" | If the zone does not draw, say the line anyway |
| 0:47 | (end of `zone`) | P1: "Watch a radiation alert." Start 1 s before the beat changes, so "alert" lands with the alert at 0:48 | |
| 0:48 | `radiation` | P1: silence while the zone closes (0:50.5 to 0:57.5) | |
| 0:56 | `radiation` | P1: "Only the way home is left." **Handover to P2** | |
| 1:00 | `demo` | P2: one cue per chapter, at the times in `script-en.md` (placeholders until #373 posts the re-recorded video's chapters) | See "If the video fails" |
| 2:25 | `close`, sources list | P2: "Marswalk combines NASA images, terrain, weather and radiation…", ending "Scan the code and try it." | |
| 2:47 | `close`, the names | **Handover to P1.** P1: "On Mars, the question is where you can still get home…" | If the names are not up yet, wait for them |
| 3:00 | end | P1: "Thank you." Then questions | Nobody presses anything |

## If the video fails

The `demo` beat shows no picture or freezes.

1. Click tab 3 and play the backup mp4 full screen. P2 says the cues over it. When it ends, click tab 1 and press **Right** twice for `close`: the first press takes over, the second moves on. Autoplay is now off.
2. No backup file: show PDF slide 4 (the walk in four screens) and say the six cues over it in about 30 s, then go to `close`. The talk ends about 55 s early, which leaves more time for questions.

## If the whole presentation fails: the PDF

`out/deck-global.pdf` is the file sent to the organisers and the backup. Say the script's lines over these slides.

| Beats | Slide |
|---|---|
| `open` | 2 (Cheyava Falls, Jezero) |
| `stakes` | 2 (the limits: 8 h, 20°, no GPS) |
| `zone`, `radiation` | 3 (the margin). Do not read its 11 minutes aloud |
| `demo` | 4 (the walk in four screens), with the six cues |
| `close` | 5 (NASA sources, "listed by name"), then 7 (0.14 m), then 1 (team and thesis) at "We are" |

## Rehearsal checklist

- [ ] Pick version A or B.
- [ ] Run the whole talk twice on the laptop with autoplay, against a stopwatch. It should end at 3:00 and must end by 4:00.
- [ ] Practise "Watch a radiation alert" so it starts about 1 s before the beat changes, then hold the silence until about 0:56.
- [ ] Practise the handovers in version A: P1 to P2 after "Only the way home is left", P2 to P1 when the names appear.
- [ ] The video cues: say each one as its card appears, then stop talking.
- [ ] Only three numbers spoken: eight hours, twenty degrees, fourteen centimetres.
- [ ] The thesis is said twice, on `zone` and at the end.
- [ ] Practise one take-over: press **Right** mid-talk (nothing moves), then finish the talk on keys.
- [ ] Open tabs 2 and 3 and check each fallback once.
- [ ] Confirm with the organisers: the language, whether Q&A follows, and whether we use our own laptop.
- [ ] Read `qa.md` aloud once and fill in the "Who answers" column.

## Re-check later

- **#373's final chapter times**: replace the video times in `script-en.md` and `script-es.md`, and rerun `node docs/pitch/tools/timing.mjs`.
- **Any change to `src/present/beats.js`**: rerun `node docs/pitch/tools/sync-present.mjs` and fix the times in both scripts.
