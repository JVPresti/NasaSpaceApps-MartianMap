# Presentation run sheet

> **Format.** At most 4 minutes, video included, with a 3:40 target (Fernando, 15 November). The organisers' page (`docs/SUBMISSION.md`, PR #316) says 3 minutes at most, so confirm the 4 with them. There is no live demo. A recorded app video of 75 to 90 s, the `demo` beat, shows the app in this order: planning at the mission table with routes from the crew's needs, the orange return zone, egress, crewmate EV2 reacting to an event, and the route review.

The talk is `script-4min-en.md`, or `script-4min-es.md` in Spanish. P2 stands at the laptop and presses **Right** once per beat, on the cue in the table below. The keys are from `src/present/control.js` on `main`.

**Which build.** The table follows the beats on `main` plus the `demo` beat of draft PR #356. Step 7 below tells you which build the site serves. If it differs from the table, read "After #356 merges" or "If the build has no demo beat".

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
| 2 | Chrome, tab 1: `https://martian-map.fernando-haro-c.workers.dev/?present=1`. Wait for the globe and the caption "Plan a Mars walk you can return from." Press nothing. | About 20 s on the GPU laptop. If it shows "3D view unavailable. Captions only", WebGL failed, so run the talk from the PDF (below) |
| 3 | Captions in English. If they show Spanish, press **L** once. | The first caption is in English |
| 4 | Tab 2: `docs/pitch/out/deck-global.pdf`, full screen, on slide 1. Tab 3: the demo video as a plain file (#356's draft keeps it at `public/present/demo.mp4`), paused at 0:00. Open `docs/pitch/fallback/stills/` in an image viewer. Go back to tab 1. | One click plays the video file |
| 5 | **F11** for full screen. Sound at about 30 % if the video has sound. | |
| 6 | Close every other app, notification and chat. | |
| 7 | Step through the whole presentation once with **Right** and write down the beat order, then reload tab 1. | Every beat draws and the video plays with picture. Note whether `radiation`, `storm`, `demo` and `credits` are there |

**No network.** The site makes no live calls to NASA. As a backup the night before: check out `main`, `npm ci`, `npm run build`, `npm run preview`, and keep `http://localhost:4173/?present=1`.

## The talk, one Right per beat

| Talk time | Beat | Press | Cue (first words of the line) | If it fails |
|---|---|---|---|---|
| 0:00 | `mars` | Nothing, it is already there | "On Mars, nobody can come and get you…" | Black screen or captions only: switch to tab 2, the PDF, and follow the slide table below |
| 0:10 | `jezero` | **Right** | "This is Jezero crater…" | |
| 0:18 | `cheyava` | **Right** | "Her goal is Cheyava Falls…" | |
| 0:30 | `danger` | **Right** | "If something goes wrong out here…" | |
| 0:38 | `plan` | **Right** | "Marswalk plans that walk…" | |
| 0:52 | `zone` | **Right** | "On Mars, the question isn't…" P1 ends this beat with "Then a radiation alert. Watch the zone." | The zone does not draw: P1 says the line, and slide 3 shows the same budget |
| 1:15 | `radiation` | **Right** on the word "zone" | Nobody speaks for two seconds while the zone closes. Then "Only the way home is left…" | |
| 1:23 | `storm` | **Right** | "Then a dust storm…" | |
| 1:32 | `demo` | **Right** on "recorded" | The video starts. P2 says the five cues as each scene starts | See "If the video fails" |
| 2:57 | `sources` | **Right** when the video ends | "Every number on screen says…" | |
| 3:15 | `credits` | **Right**, only if the build has a `credits` beat | "The challenge asked for a survival guide…" | No `credits` beat: stay on `sources` and say the line |
| 3:35 | end | **Nothing.** One more Right opens the `live` beat and then the app | "Thank you." | |

The times assume an 85 s video, the length in #356's draft. If the real video is shorter or longer, every time from `sources` on moves by the same amount. A 90 s video ends the talk at 3:40.

The silence is the part to rehearse. The zone closes between 1.2 and 2.4 s after the Right into `radiation`. If P1 is still talking then, the judges look at P1 and miss it.

## If the video fails

The `demo` beat shows no picture, freezes, or has no sound when it should.

1. Press **Alt+Tab** (or click tab 3) and play the video file full screen. P2 says the cues over it. When it ends, go back to tab 1 and press **Right** for `sources`.
2. No video file either: step through the stills in the image viewer, about 12 s each, and say the cue on each one. Planning is `D3-goal-cheyava.jpg`. The return zone is PDF slide 3, because the app's zone has no still yet. Egress is `D5-walk-hud.jpg`. EV2 and the event is `S8-radiation-walk.jpg`. The review is `S10-debrief-review.jpg`. Then go back to tab 1 and press **Right**. This takes about 60 s, so the talk ends earlier.
3. No time for either: say "The video shows the crew planning, the walk and the review. The slides have the same screens", show PDF slide 4 for 10 s, and go on to `sources`.

## If the build has no demo beat

#356 has not merged and the site goes from `storm` straight to `sources`. After the `storm` line, press **Alt+Tab** to tab 3 and play the video file full screen. P2 says the cues. When it ends, go back to tab 1 and press **Right** for `sources`. With no video file, use steps 2 or 3 above.

## After #356 merges

Its draft at 85067fd changes three things. None of them is final, so check them in step 7.

- `radiation` is part of `zone`. The zone closes by itself about 15 s into the beat, with no Right. P1 says "Watch the zone" just before it and holds the same two seconds. Skip the `radiation` row's Right.
- `storm` is gone. P1 says "That is the idea. Now the real app, recorded." at the end of `zone`, then P2 presses **Right** into `demo`. The talk gets a few seconds shorter.
- `credits` follows `sources`, and `live` still follows `credits`.

Then run `node docs/pitch/tools/sync-present.mjs`, put the real video length in both scripts, and run `node docs/pitch/tools/timing.mjs`.

## If the whole presentation fails: the PDF

`out/deck-global.pdf` is the file sent to the organisers and the backup. The deck has no speaker notes, so say the script's lines over these slides:

| Beats | Slide |
|---|---|
| `mars` | 1 (team, challenge, thesis) |
| `jezero`, `cheyava`, `danger`, `plan` | 2 (Cheyava Falls, 913 m, the limits) |
| `zone`, `radiation`, `storm` | 3 (the margin) |
| `demo` | 4 (the walk in four screens), about 20 s instead of 85. P2 says the five cues over it |
| `sources` | 6 (measured or simulated), then 7 for the last sentence (0.14 m) |
| `credits` | 1 again (the thesis, the team name and the six names). Slide 7 lists next steps, which the talk leaves out |

The PDF run is about a minute shorter, because slide 4 replaces the video. Do not read slide 3's 11 minutes aloud. The talk speaks no margin figure.

## Re-check after these merge

- **#356** (`feat/present-demo-video`): the beat list, the video length, the scene order and which event EV2 reacts to. See "After #356 merges". Change the cues if the scenes moved.
- **#353** (`fix/present-polish`): if it changes captions, rerun `sync-present.mjs`. The script lines do not quote captions, so they should not need to change.
- **#335** (`feat/return-zone`): once the app draws the return zone, the zone beat's source line will change ("Not in the walk HUD yet"), and a still of it can join the video fallback.
- **HUD restyle (`exp/hill-climb-quality`)**: retake the stills in `fallback/stills/` and the deck screenshots.
- **#298 and #312** (the reserve held at a fixed 37.9 g; the margin priced at a planning rate): the 11 minutes on slide 3 change. Rerun `node docs/pitch/tools/walkback-zone.mjs` and update slide 3.

The stills in `fallback/stills/` were captured from #282 at 989970f with `npm run measure:demo` on an RTX 3070, 1920 × 1080, English. `S1-start-AI-video.jpg` shows the AI-generated start video, so do not use it.
