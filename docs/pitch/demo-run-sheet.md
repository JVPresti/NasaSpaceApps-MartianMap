# Presentation run sheet

> **Format.** Hard limit 3:00 (the organisers' page, `docs/SUBMISSION.md`, PR #316). The talk is `script-en.md`, in English, and ends at 2:42. Then the judges ask questions (`qa.md`). There is no live demo: the `demo` beat plays an 85 s video of the real app.

Six beats, one **Right** each. P2 stands at the laptop and presses every Right, on the cue words below. P1 speaks the first four beats, P2 the video cues, P3 the close. The keys come from `src/present/control.js`.

**Which build.** The `stakes` and `close` beats and the six-chapter video are on the presentation thread's branch `feat/present-story-cut`. This sheet assumes it has merged and the site serves it. Step 7 checks that.

## Keys

| Key | Does |
|---|---|
| **Right**, **Space**, **PageDown** or **Enter** | Next beat. A presentation clicker sends these |
| **Left** or **PageUp** | Previous beat |
| **L** | Switch the captions between English and Spanish |
| **Esc** | Leave the presentation for the app. Do not press it during the talk |

## Before the talk (10 minutes before)

| Step | Do | Check |
|---|---|---|
| 1 | Plug the laptop into power and the projector. Display duplicated, 1920 x 1080. | The projector shows the desktop |
| 2 | Chrome, tab 1: `https://martian-map.fernando-haro-c.workers.dev/?present=1`. Wait for the fall from orbit to start. | About 20 s on the GPU laptop. "3D view unavailable. Captions only" means WebGL failed, so run the talk from the PDF (below) |
| 3 | Captions in English. If they show Spanish, press **L** once. | The first caption is in English |
| 4 | Tab 2: `docs/pitch/out/deck-global.pdf`, full screen, on slide 1. Tab 3: the backup video file the presentation thread records (the same 85 s cut as an mp4), paused at 0:00. | One click plays it |
| 5 | **F11** for full screen. Sound at about 30 %. | |
| 6 | Close every other app, notification and chat. | |
| 7 | Step through all six beats once with **Right**. Stop on `close`: one more **Right** may open the app. Reload tab 1 so the open starts fresh. | The beats are open, stakes, zone, radiation, demo, close, and the video plays with picture. If the site still shows `plan`, `sources` and `credits`, the story cut has not deployed: tell Fernando, and run from the PDF |

**No network.** The site makes no live calls to NASA. As a backup the night before: check out `main`, `npm ci`, `npm run build`, `npm run preview`, and keep `http://localhost:4173/?present=1`.

## The talk

| Talk time | Beat | P2 presses Right on | Speaker and first words | If it fails |
|---|---|---|---|---|
| 0:00 | `open` | (already there) | P1: "The first people on Mars…" | Black screen or captions only: switch to tab 2 and follow the PDF column below |
| 0:14 | `stakes` | P1 finishing the open line, "unconfirmed" | P1: "Two astronauts walk out…" | |
| 0:26 | `zone` | "…come and get you." | P1: "So the question is not…" | The zone does not draw: say the line, and show PDF slide 3 if it stays empty |
| 0:42 | `radiation` | The word "alert" in "Watch a radiation alert." | P1: two seconds of silence while the zone closes, then "Only the way home is left." | |
| 0:52 | `demo` | "…the way home is left." | P2: one cue per chapter card, at 0:00, 0:20, 0:30, 0:45, 1:05 and 1:15 of the video | See "If the video fails" |
| 2:17 | `close` | The video's last frame | P3: "Marswalk layers four kinds of NASA data…" | |
| 2:42 | end | **Nothing** | P3: "Thank you." Then questions | |

## If the video fails

The `demo` beat shows no picture, freezes, or has no sound.

1. Click tab 3 and play the backup mp4 full screen. P2 says the cues over it. When it ends, click tab 1 and press **Right** for `close`.
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

- [ ] Run the whole talk once against a stopwatch on the laptop, with the site, not the PDF. It must end under 2:50.
- [ ] P2 practises the Right on "alert" three times. The silence after it is the moment to remember.
- [ ] P2 says each chapter cue as its card appears, then stops talking.
- [ ] Only three numbers spoken: eight hours, twenty degrees, fourteen centimetres.
- [ ] The thesis is said twice, on `zone` and in the close.
- [ ] Open tabs 2 and 3 and check each fallback once.
- [ ] Confirm with the organisers: the 3:00 limit, whether Q&A follows, and whether we use our own laptop.
- [ ] Read `qa.md` aloud once. Fill in the "Who answers" column.

## Re-check later

- **Any change to `src/present/beats.js`**: rerun `node docs/pitch/tools/sync-present.mjs`, fix the times in both scripts and rerun `node docs/pitch/tools/timing.mjs`.
- **The final chapter times** from the presentation thread's PR: replace the video times in `script-en.md` and `script-es.md`.
