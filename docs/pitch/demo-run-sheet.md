# Presentation run sheet

> **Format.** At most 4 minutes, video included, with a 3:40 target (Fernando, 15 November). The organisers' page (`docs/SUBMISSION.md`, PR #316) says 3 minutes at most, so confirm the 4 with them. There is no live demo. The `demo` beat plays a 73.8 s recording of the real app.

The talk is `script-4min-en.md`, or `script-4min-es.md` in Spanish. It follows the seven beats in `src/present/beats.js` on `main` (#356) and ends at 3:18. P2 stands at the laptop and presses **Right** once per beat, on the cue in the table below. The keys are from `src/present/control.js`.

## Keys

| Key | Does |
|---|---|
| **Right**, **Space**, **PageDown** or **Enter** | Next beat. A presentation clicker sends these |
| **Left** or **PageUp** | Previous beat |
| **L** | Switch the captions between English and Spanish |
| **Esc** | Leave the presentation for the app's start screen. Do not press it during the talk |

## Before the talk (10 minutes before)

| Step | Do | Check |
|---|---|---|
| 1 | Plug the laptop into power and the projector. Display duplicated, 1920 x 1080. | The projector shows the desktop |
| 2 | Chrome, tab 1: `https://martian-map.fernando-haro-c.workers.dev/?present=1`. Wait for the globe and the line "On Mars, nobody can come and get you." | About 20 s on the GPU laptop. If it shows "3D view unavailable. Captions only", WebGL failed, so run the talk from the PDF (below) |
| 3 | Captions in the talk's language. **L** switches them. In Spanish the `demo` beat plays its Spanish cut (`demo-es.mp4`). | The first line reads in the right language |
| 4 | Tab 2: `docs/pitch/out/deck-global.pdf`, full screen, on slide 1. Tab 3: `https://martian-map.fernando-haro-c.workers.dev/present/demo.mp4` (or `demo-es.mp4`), paused at 0:00. Open `docs/pitch/fallback/stills/` in an image viewer. Go back to tab 1. | One click plays the video in tab 3 |
| 5 | **F11** for full screen. Sound at about 30 %. | |
| 6 | Close every other app, notification and chat. | |
| 7 | Step through all seven beats once with **Right**. Stop at `credits`, because one more **Right** opens the app. Then reload tab 1 so the open starts fresh. | Every beat draws and the video plays with picture |

**No network.** The site makes no live calls to NASA. As a backup the night before: check out `main`, `npm ci`, `npm run build`, `npm run preview`, and keep `http://localhost:4173/?present=1`.

## The talk, one Right per beat

| Talk time | Beat | Press | Cue | If it fails |
|---|---|---|---|---|
| 0:00 | `open` | (already there) | Silent while "On Mars, nobody can come and get you." and "Marswalk shows where you can still get home." appear. At about 0:12, "This is Jezero crater…" | Black screen or captions only: switch to tab 2, the PDF, and follow the slide column below |
| 0:20 | `plan` | **Right** | "She walks there from the habitat…" | |
| 0:44 | `zone` | **Right** | "On Mars, the question isn't…", with the captions | The zone does not draw: say the line; slide 3 shows the same budget |
| 1:08 | `radiation` | **Right** | "A radiation alert. Watch the zone." Then silence while the zone closes on the astronaut and holds at 0.5 ha for 2.5 s. Then "Only the way home is left…" | |
| 1:24 | `demo` | **Right** | The recording starts. P2 says the seven short cues at 0:00, 0:12, 0:24, 0:30, 0:38, 0:58 and 1:04 of the video | See "If the video fails" |
| 2:38 | `sources` | **Right** when the video ends | "Every number on screen says…" | |
| 2:56 | `credits` | **Right** | "The challenge asked for a survival guide to Mars…" | |
| 3:18 | end | **Nothing.** One more **Right** opens the app | "Thank you." | |

The video's scenes, for the cues: 0:00 the zone with 1 h, 0:05 the zone with 30 min, 0:12 the crew's needs re-plan the route, 0:24 out through the airlock, 0:30 a dust storm and EV2's "storm front", 0:38 the radiation alert with EV2 walking home ahead, 0:58 back through the airlock, 1:04 the review of the walked track against the plan.

## If the video fails

The `demo` beat shows no picture, freezes, or has no sound when it should.

1. Press **Alt+Tab** (or click tab 3) and play the video full screen. P2 says the cues over it. When it ends, go back to tab 1 and press **Right** for `sources`.
2. No video in tab 3 either: step through the stills in the image viewer, about 10 s each, and say the cue on each one. Needs and route is `D3-goal-cheyava.jpg`. The return zone is PDF slide 3. The walk is `D5-walk-hud.jpg`. The storm is `D7-storm-walk.jpg`. The radiation alert is `S8-radiation-walk.jpg`. The review is `S10-debrief-review.jpg`. Then back to tab 1, **Right**.
3. No time for either: say "The video shows the crew planning, the walk and the review. The slides have the same screens", show PDF slide 4 for 10 s, and go on to `sources`.

## If the whole presentation fails: the PDF

`out/deck-global.pdf` is the file sent to the organisers and the backup. The deck has no speaker notes, so say the script's lines over these slides:

| Beats | Slide |
|---|---|
| `open` | 1 (team, challenge, thesis), then 2 at "This is Jezero crater" |
| `plan` | 2 (Cheyava Falls, the route, the limits) |
| `zone`, `radiation` | 3 (the margin) |
| `demo` | 4 (the walk in four screens), about 20 s instead of 74. P2 says the cues over it |
| `sources` | 6 (measured or simulated), then 7 for the last sentence (0.14 m) |
| `credits` | 1 again (the thesis, the team name and the six names) |

The PDF run is about a minute shorter, because slide 4 replaces the video. Do not read slide 3's 11 minutes aloud. The talk speaks no margin figure.

## Re-check later

- **HUD restyle (`exp/hill-climb-quality`)**: retake the stills in `fallback/stills/` and the deck screenshots.
- **#298 and #312** (the reserve held at a fixed 37.9 g; the margin priced at a planning rate): the 11 minutes on slide 3 change. Rerun `node docs/pitch/tools/walkback-zone.mjs` and update slide 3.
- **Any change to `src/present/beats.js`**: rerun `node docs/pitch/tools/sync-present.mjs`, fix the times in both scripts and rerun `node docs/pitch/tools/timing.mjs`.

The stills in `fallback/stills/` were captured from #282 at 989970f with `npm run measure:demo` on an RTX 3070, 1920 × 1080, English. `S1-start-AI-video.jpg` shows the AI-generated start video, so do not use it.
