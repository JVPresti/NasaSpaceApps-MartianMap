# Presentation run sheet

> **Format.** At most 4 minutes, video included: target 3:40, hard cap 4:00 (Fernando, 9:25 am, 15 November). The organisers' page (`docs/SUBMISSION.md`, PR #316) says 3 minutes at most; confirm the 4 with them. There is no live demo. An edited app video of about 75 to 90 s, a beat inside `?present=1`, shows the app: planning at the mission table, the orange return zone, egress, EV2 reacting to an event and the route review.

The talk is `script-4min-en.md` (Spanish twin `script-4min-es.md`). P2 stands at the laptop and presses **Right** once per beat, on the cue in the table below. The keys are from `src/present/control.js` on `main`.

**Draft.** The beat list comes from #353 (`fix/present-polish`) plus the video beat, whose PR is not up yet. When it is, rerun `node docs/pitch/tools/sync-present.mjs`, check the beat order and lengths below against `beats.md`, and fix the times in both scripts.

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
| 2 | Chrome, tab 1: `https://martian-map.fernando-haro-c.workers.dev/?present=1`. Wait for the globe and the caption "Plan a Mars walk you can return from." Press nothing. | About 20 s on the GPU laptop. "3D view unavailable. Captions only" means WebGL failed: run the talk from the PDF (below) |
| 3 | Captions in English. If they show Spanish, press **L** once. | The first caption is in English |
| 4 | Tab 2: `docs/pitch/out/deck-global.pdf`, full screen, on slide 1. Tab 3: the app video as a plain file (the presentation thread's export of the video beat), paused at 0:00. Open `docs/pitch/fallback/stills/` in an image viewer. Go back to tab 1. | One click plays the video file |
| 5 | **F11** for full screen. Sound at about 30 % if the video has sound. | |
| 6 | Close every other app, notification and chat. | |
| 7 | Step through the whole presentation once with **Right**, including the video beat, then reload tab 1. | Every beat draws; the video plays with picture |

**No network.** The site makes no live calls to NASA. As a backup the night before: check out `main`, `npm ci`, `npm run build`, `npm run preview`, and keep `http://localhost:4173/?present=1`.

## The talk, one Right per beat

| Talk time | Beat | Press | Cue (first words of the line) | If it fails |
|---|---|---|---|---|
| 0:00 | `mars` | (already there) | Let the Marswalk title sit for a breath, then "Mars. We are Los Frijolitos…" | Black screen or captions only: switch to tab 2, the PDF, and follow the slide column below |
| 0:08 | `jezero` | **Right** | "Jezero crater…" | |
| 0:17 | `cheyava` | **Right** | "This is Cheyava Falls…" | |
| 0:31 | `danger` | **Right** | "On Mars, nobody can come and get you…" | |
| 0:43 | `plan` | **Right** | "Marswalk plans the walk…" | |
| 0:57 | `zone` | **Right** | "On Mars, the question isn't…" | The zone does not draw: say the line; slide 3 shows the same budget |
| 1:16 | `radiation` | **Right** | "Then a radiation alert…" | |
| 1:28 | `storm` | **Right** | "Then a dust storm…" | |
| 1:39 | `video` | **Right** | The video starts. P2 says the four cues as each scene starts | See "If the video fails" |
| 3:07 | `sources` | **Right** when the video ends | "Every number says…" | |
| 3:19 | `credits` | **Right** | "Every source is on screen…" | |
| 3:37 | end | **Nothing.** If a `live` beat still follows `credits`, one more **Right** opens the app | "Thank you." | |

The times assume an 88 s video. If the real video is shorter or longer, every time from `sources` on moves by the same amount.

## If the video fails

The video beat shows no picture, freezes, or has no sound when it should.

1. Press **Alt+Tab** (or click tab 3) and play the video file full screen. Say the cues over it. When it ends, go back to tab 1 and press **Right** for `sources`.
2. No video file either: step through the stills in the image viewer, about 15 s each, and say the cue on each one. Planning: `D3-goal-cheyava.jpg`. The return zone: PDF slide 3 (the app's zone has no still yet). Egress: `D5-walk-hud.jpg`. EV2 and the alert: `S8-radiation-walk.jpg`. The review: `S10-debrief-review.jpg`. Then back to tab 1, **Right**.
3. No time for either: say "The app video would show the crew planning, the walk and the review; the slides have it", show PDF slide 4 for 10 s, and go on to `sources`.

## If the whole presentation fails: the PDF

`out/deck-global.pdf` is the file sent to the organisers and the backup. Say the same lines over these slides:

| Beats | Slide |
|---|---|
| `mars` | 1 (team, challenge, thesis) |
| `jezero`, `cheyava`, `danger`, `plan` | 2 (Cheyava Falls, 913 m, the limits) |
| `zone`, `radiation`, `storm` | 3 (the margin) |
| `video` | 4 (the walk in four screens), about 20 s instead of 88 |
| `sources` | 6 (measured or simulated) |
| `credits` | 5 (the NASA sources), then 7 (0.14 m and the QR) |

The PDF run is about a minute shorter, since slide 4 replaces the video.

## Re-check after these merge

- **The video beat's PR**: the beat list, the video length and the scene order. Rerun `sync-present.mjs`, fix the times in both scripts, and the cues if the scenes moved.
- **#353** (`fix/present-polish`): if it changes captions, rerun `sync-present.mjs`. The script lines do not quote captions, so they should not need to change.
- **#335** (`feat/return-zone`): once the app draws the return zone, the zone beat's source line will change ("Not in the walk HUD yet"), and a still of it can join the video fallback.
- **HUD restyle (`exp/hill-climb-quality`)**: retake the stills in `fallback/stills/` and the deck screenshots.
- **#298 and #312** (the reserve held at a fixed 37.9 g; the margin priced at a planning rate): the 14 minutes on slide 3 change. Rerun `node docs/pitch/tools/walkback-zone.mjs` and update slide 3.

The stills in `fallback/stills/` were captured from #282 at 989970f with `npm run measure:demo` on an RTX 3070, 1920 × 1080, English. `S1-start-AI-video.jpg` shows the AI-generated start video: do not use it.
