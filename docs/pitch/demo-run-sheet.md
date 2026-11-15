# Live demo run sheet

> **Confirm with the Ensenada organisers:** how long the pitch is, whether Q&A is separate, and whether we can plug in our own laptop. The team plans a 5-minute talk in English, so cut A is the primary. The organisers' page (`docs/SUBMISSION.md`, PR #316) still says 3 minutes at most, so cut B stays as the fallback. This sheet has three cuts of the same demo: 2:14 inside the 5-minute pitch (primary), 1:15 inside the 3-minute pitch (fallback), and the full 6:40 inside the 8-minute version.

The demo is the first mission from PR #282 (`docs/DEMO.md`, keiwv): a 55 m sortie from the airlock to **S1 · light-toned patch**, with the dust storm and the radiation alert brought forward so both play before the crew is home. Every key and button below was checked against #282 at its head, 8ec6f72 (`src/`, `docs/CONTROLS.md` and `docs/DEMO.md` on that commit). Timings come from keiwv's measured run on 8ec6f72 (15 Nov, RTX 5070, 1366 x 768). With the detour to a find, the crew reaches the stop at T+94 s, secures the sample at T+106 s, the storm starts at T+111 s, the radiation alert at T+126 s, and the crew is back in the habitat at T+198 s. A player run without the detour reaches the stop at T+53 s, with the storm at T+68 s. The storm rule (`src/sim/missions.js`): it starts 3 s after a sample is secured at the stop, or 90 s after first reaching the stop without one, never before T+45 s and by T+240 s at the latest.

Where `main` and #282 differ, this sheet follows #282 and says so in a note.

## Before the pitch (10 minutes before)

| Step | Do | Check |
|---|---|---|
| 1 | Plug the demo laptop into power and the projector. Set the display to duplicate, 1920 x 1080. | The projector shows the desktop |
| 2 | Switch the keyboard layout to English (US). | The backtick key types ` (on a Spanish layout it is a dead key, and the Events strip needs it) |
| 3 | Open Chrome and go to the demo URL with `?debug=1` (below). Wait on the start screen until the main button reads **Open the mission table** instead of "Loading scene". | About 20 s on the GPU laptop |
| 4 | Language: English, since the organisers asked for the presentation in English. If it was switched: open the table, press **Esc**, **Settings**, set **Language** to **English**, reload. The choice is saved in the browser. | The start screen says "Open the mission table" |
| 5 | Press **F11** for full screen. Turn the laptop sound on at about 30 %: the suit audio (fans, breathing, alarms) helps the storm beat. | |
| 6 | Open the backup video (recorded from the app by the presentation mode, `feat/present-mode`) in a second browser tab, paused at 0:00, and the stills folder `docs/pitch/fallback/stills/` in an image viewer. | One click plays it |
| 7 | Close every other app, notification and chat. | |

**Demo URL.** Until #282 merges, the preview build: `https://feat-short-mission-dynamic-routes-martian-map.fernando-haro-c.workers.dev/?debug=1`. After it merges: `https://martian-map.fernando-haro-c.workers.dev/?debug=1`. `?debug=1` adds a small "Events `" chip in the bottom corner. Leave it closed; it is the trigger for the radiation alert in cut B, beat B4.

**No network.** The app makes no live calls to NASA, so it runs offline. The night before, on the demo laptop: check out the demo branch, `npm ci`, `npm run build`, `npm run preview`, and open `http://localhost:4173/?debug=1` as the offline URL.

## Cut A: 2:14 inside the 5-minute pitch (primary)

The team plans the 5-minute talk (`script-5min-en.md`), so this is the cut to rehearse first. P2 takes the laptop at 1:23 of the talk and hands back at 3:37. Times below run from the handover. Lines in English from `script-5min-en.md`; the Spanish twin is `script-5min-es.md`. The app stays in English (step 4 above), so the button names below are the English ones.

Uses DEMO.md segments 2, 3, 4, 5, 6 and 7, cut short. One change from DEMO.md: the O2 slider goes to 20 % before Begin EVA, so the margin on the visor is set by oxygen instead of the 8 h clock (+480). **Rehearse this first** (cut B uses the same slider): we checked on #282 that 30 % gives Go and 15 % gives Go with care, and that the slider sets the suit's starting O2 (`suitRunner.js`), but could not run the walk at 20 % on this machine. By the suit model, 20 % is 154 g, about 64 min of walking oxygen, so the margin starts near 34 min and the low-oxygen caution (under 15 min) should not fire on a 55 m walk. Segment 1 (start screen) is one click. Segments 8 to 11 (radiation, habitat, debrief, sources) are not shown live: P3 covers the radiation alert in beat 5, and slides 5 and 6 carry the debrief and the sources.

Timing on #282 at 8ec6f72: **Start walking** happens at about 0:52, and the player run reaches the stop 53 s later, at about 1:45. The dust storm starts 3 s after the sample is secured in D6, so at about 2:00, and the radiation alert 15 s after that, after the handback. The cursor is captured from D4, so the Events strip cannot be clicked in this cut; the D7 fallback is the stills.

| Beat | Time | DEMO.md | Do | Say (from `script-5min-en.md`) | If it fails |
|---|---|---|---|---|---|
| D1 | 0:00 | 1 | Click **Open the mission table**. | "The mission table, on HiRISE terrain of Jezero." | WebGL error or blank screen: switch to the backup video and keep talking over it; no video, step through `fallback/stills/` from `D1-table-site.jpg` |
| D2 | 0:05 | 2 | **Next: route**. Click the **Terrain** layer. Point at the colour key in the legend (amber 15-20°, red over 20°). The planner blocks red and makes steeper ground cost more; amber is shown, and the profiles count route metres on it, but the planner does not avoid it (`src/sim/costGrid.js`, `routeProfiles.js`). | "Terrain layer, the slope. The planner blocks red, over twenty degrees, and the table counts the metres on yellow." Do not say the route never touches red: on the Cheyava Falls route the line touches red at Bright Angel, a stop on 28.7° rock. The app's own legend note says the route "never crosses red ground" (visible in `img/app-table-cheyava-terrain.jpg`); point at the colour key, not that sentence. | Layer does not paint: say the line over `fallback/stills/D2-terrain-layer.jpg` |
| D3 | 0:25 | 3 | In **Goal**, choose **Sample Cheyava Falls**. Wait for the route to redraw (2 to 5 s). Then set it back to **First sortie**. | "If the crew asks for Cheyava Falls, the route grows and the plan reprices time and oxygen. Live, we walk the first stop, 55 metres." | The planner hangs over 8 s: leave the goal on First sortie and go on; still `D3-goal-cheyava.jpg` |
| D4 | 0:45 | 4 | In the crew's needs, drag **O2** to **20 %**. Tab **Suit**: point at **Go** or **Go with care**. Click **Begin EVA**, then **Start walking**. Click the scene once to capture the mouse. | "I play the end of an EVA and leave with 20 % oxygen. The plan says go." | The table says No-go: drag O2 back up until it says Go. Not rehearsed at 20 %: skip the slider and say "The margin reads 480, because this close to home the 8 hour clock limits it, not oxygen." Still `D4-suit-go.jpg` |
| D5 | 0:55 | 5 | Hold **W** and steer with the mouse toward the waypoint marker (S1 · light-toned patch). Do not stop to mark a find. About 53 s of walking. Point at the margin on the left, then at the navigation line bottom right. | "On the left is the margin, the minutes I have left after walking home and keeping the reserve. It is priced at my pace. Below is position. With no GPS, the error grows as I walk and resets when I stop with a clear horizon. That model is ours, and it says SIM." | Frame rate drops or the astronaut stalls: keep walking, it still arrives. Lost the direction: the minimap (top right) shows the route in cyan. Still `D5-walk-hud.jpg` |
| D6 | 1:48 | 6 | At the stop: **P** (photo), click the ground at your feet (sample), **E** (stow and seal). | "We're here. Photo, sample, stow." | Sampling does not respond: without a sample the storm waits 90 s, past the handback. Say the D7 line over the stills. Still `D6-sample.jpg` |
| D7 | 2:03 | 7 | The dust storm starts by itself 3 s after the sample is secured. Wait for the banner and for tau to climb on the environment strip (it starts at 0.45). Press **M**: the table opens on Route; point at the route home on the map, not at the note above the profiles (that note is about the plan chosen before the EVA). Press **M** again. | "Dust storm. It takes the horizon, and without a horizon there is no position fix. The route re-plans to the habitat." | No storm by 2:08: say the line over `D7-storm-walk.jpg` and `D7-storm-plan.jpg` |
| | 2:14 | | Hand back to P3. Leave the app running; the radiation alert fires about 15 s after the storm. | | |

`main` note: on `main` the storm comes at T+480 s and there is no first sortie. Do not run Cut A on `main`.

## Cut B: 1:15 inside the 3-minute pitch (fallback)

Use this cut if the organisers hold to 3 minutes. The switch happens at 0:46 of the talk, after the thesis (see the cut point in `script-5min-en.md`). Rehearse it once after cut A. Lines in English from `script-3min-en.md`; the Spanish twin is `script-3min-es.md`. It uses DEMO.md segments 2, 4, 5 and 8, cut short, and fires the radiation alert by hand, so the live screen shows the same crisis as the cold open.

| Beat | Time | Do | Say | If it fails |
|---|---|---|---|---|
| B1 | 0:00 | **Open the mission table**, **Next: route**, click the **Terrain** layer | "Cheyava Falls is almost an hour out, with the work at its stops, so live we walk the first 55 metres. The planner blocks red, slopes over twenty degrees." | Layer does not paint: say it over `fallback/stills/D2-terrain-layer.jpg` |
| B2 | 0:15 | Drag **O2** in the crew's needs to **20 %**. Tab **Suit**, **Begin EVA**, **Start walking**. Do **not** click the scene: without the mouse capture the cursor stays free for the Events strip in B4. Steer with **A** / **D** or drag on the scene to look | "I play the end of an EVA, with twenty percent oxygen. The plan says go." | The table says No-go: drag O2 up until it says Go. Not rehearsed at 20 %: skip the slider and say "The margin reads 480: this close to home the 8 hour clock limits it, not oxygen." |
| B3 | 0:25 | Hold **W** toward the S1 marker for about 20 s. Point at the margin on the left | "On the left is the margin, the minutes left after walking home and keeping the reserve." Add "It drops as I walk" only if the rehearsal showed it move | Walk stalls: keep talking, the alert does not need the stop when fired by hand |
| B4 | 0:45 | Press **`** (US layout), click **Radiation alert**, press **`** to close the strip. Wait for the banner and the visor's alert ring. Point at three things: the banner's source line ("RAD · Curiosity · Gale crater, not Jezero"), the waypoint panel now reading **HAB SHELTER**, and the margin caption now reading "shelter in". Skip the M map step | "I fire the same radiation alert by hand. The target becomes the habitat as shelter, and the margin now counts the walk there." | Backtick does nothing: the keyboard is not on US layout; click the "Events `" chip instead. No banner: say the line over `S8-radiation-walk.jpg` |
| | 1:15 | Back to the presentation mode | | |

Say that you fire the alert by hand. A judge who sees the Events strip will ask. **The margin swings with pace** (#312): by the suit model, at 20 % it reads about +230 min standing and about +34 min walking, because it divides O2 by the current 30 s smoothed rate. So keep **W** held while you open the Events strip and click the alert with the mouse (the cursor is free), and if a judge sees it jump, say "it is priced at my current pace". In rehearsal, write down the reading at Start walking, after 20 s of walking, and 10 s after the alert. Rehearse B2 to B4 once: with the mouse captured, a click lands on the scene (it samples the ground) instead of on the Events strip, and Esc closes the strip, so the cursor has to stay free from the start.

## Cut C: the full demo inside the 8-minute version

Run DEMO.md exactly, segments 1 to 11, with keiwv's measured times on 8ec6f72. The script in `script-8min-es.md` wraps 0:30 of story before it and 0:50 after it.

| # | Segment | Measured | Key controls (verified on #282) |
|---|---|---|---|
| 1 | Start screen | 0:13 | **Open the mission table** |
| 2 | Table: site and layers | 0:52 | **Next: route**; layers **Image**, **Terrain**, **Rocks**, **Outcrop**, **Radio**, **Exposure**, **Rover** |
| 3 | Needs → route | 0:44 | **Goal** select; **Cautious** / **Standard**; stop card; profiles **Fastest**, **Gentlest**, **Radio** |
| 4 | Outlook, go / no-go, Begin EVA | 0:31 | **Hazards**, **Suit**, **Begin EVA**, **Start walking** |
| 5 | Walk out with a find | 1:35 | **W A S D**, mouse; hold **Q** 2 s on light ground, then **Y** |
| 6 | Stop and sample | 0:16 | **P**, click the ground, **E** |
| 7 | Dust storm | 0:15 | **M**, **M** |
| 8 | Radiation and walk back | 1:12 | **M**, **M**, walk into the cabin |
| 9 | Habitat table | 0:12 | **E** Open plan, **M** back, **X** Finish EVA |
| 10 | Debrief | 0:41 | scroll to the route review |
| 11 | Sources | 0:08 | **Sources** |
| | Total | 6:40 | |

`main` note: on `main`, **X** ends the EVA anywhere within 5 m of the airlock, and there is no **E** Open plan. On #282, X works only inside the cabin.

## Fallbacks

| What fails | Do |
|---|---|
| The page does not load (network) | Switch to the offline URL `http://localhost:4173/?debug=1` |
| WebGL fails, black scene, or under 10 fps | Play the backup video and narrate over it. Say once that the live build needs the GPU, then go on |
| The pointer will not capture | Drag on the scene to look (the app offers drag-to-look) |
| A key does nothing | The wrist screen may be up and owning the keys: press **R** to lower it |
| The pause menu opens by mistake (Esc) | Click **Resume** |
| A stop card covers the view | **Enter** or **Esc** closes it |
| Everything fails | Stills in `fallback/stills/`, in beat order, one per beat |

The stills were captured from the real #282 build (commit 989970f) with keiwv's `npm run measure:demo` on this machine's RTX 3070, 1920 × 1080, English. Names start with the beat they replace (D for cut A, S for the other DEMO.md segments). Re-take them on the demo laptop with `npm run measure:demo -- --headed --viewport 1920x1080 --shots <folder>` if the app changes. `S1-start-AI-video.jpg` shows the AI-generated start video: do not use it in the submission video or the deck.

## Re-check after these merge

The app changes today. When these branches merge, walk the run sheet again and fix these steps.

- **`feat/habitat-flow`** (spawn in the habitat, plan at the table, leave through the airlock): D1 and B1 change, because the start may put you inside the habitat instead of at the table. Check how you reach the mission table (likely **E** at the table), and how long the walk out through the airlock adds to D5. The 55 m and the storm timing (T+111 s on the measured run, T+68 s for a player) may shift. Segment 9 (**E** / **X** in the cabin) may change too.
- **HUD restyle (`exp/hill-climb-quality`)**: the margin pill, the navigation line and the minimap may move. Re-check every "on the left" and "below" in the Say column, and retake the stills in `fallback/stills/` and the deck screenshots.
- **#282 itself**: if the first mission's names change (S1 · light-toned patch, First sortie), update the script and the slides together.
- **#298 and #312** (the reserve held at a fixed 37.9 g; the margin priced at a planning rate): the visor's margin changes, and so does the 14 minutes in the cold open and on slide 3. Rerun `node docs/pitch/tools/walkback-zone.mjs` and update the scripts, `beats.md` and slide 3 together.
