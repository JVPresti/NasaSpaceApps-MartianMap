# 30-second video: script and shot list

Hard limit 30 s. English narration, English on-screen text. If the team narrates in Spanish, burn in English subtitles (the lines below). The presentation mode (`?present=1`, branch `feat/present-mode`) can record this from the app with frame-perfect capture; if it is not ready, a person records it on the demo laptop (it has the GPU) with the URL states below.

Rules from the submission guide that apply here:

- The audience knows nothing about Mars or EVAs. Every shot answers one question.
- No AI-generated images or video unless they carry a visible watermark. Our start screen video is AI-generated: **do not use it**. Every shot below is a real app capture or a real NASA image.
- No NASA logos, flags or mission insignia added or modified. The app shows none; keep it that way in titles.
- No images of anyone under 18.

## Script

| Time | Official beat | Narration (EN) | Subtitle if narrated in Spanish | On-screen text |
|---|---|---|---|---|
| 0:00-0:02 | Intro | (suit breathing, no words) | | Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada, Mexico |
| 0:02-0:05 | The challenge | "On Mars, nobody comes to get you." | On Mars, nobody comes to get you. | NASA Space Apps 2026 · Martian Map |
| 0:05-0:10 | Name and tagline | "Marswalk shows where you can go, and still get home." | Marswalk shows where you can go, and still get home. | Marswalk · where you can go and still get home |
| 0:10-0:20 | How it works with NASA data | "HiRISE terrain sets the route. NASA suit tests set the oxygen per metre. When a dust storm hits, the way home re-plans." | (same) | HiRISE DTM · Mastcam-Z · MEDA · Curiosity RAD |
| 0:20-0:30 | The future | "Next: EVA planners rehearse a walk before they fly it, and students plan one with the same NASA data. Every number names its source." | (same) | For EVA planners and classrooms · free in the browser · martian-map.fernando-haro-c.workers.dev |

Narration is 63 words in 28 s of speaking slots, about 135 words per minute. Read it once against a stopwatch before recording; if it runs long, cut "before they fly it".

Spanish narration, if chosen (same timing): "En Marte, nadie va por ti." / "Marswalk muestra a dónde puedes ir y todavía volver." / "El terreno de HiRISE marca la ruta. Las pruebas de trajes de la NASA marcan el oxígeno por metro. Si llega una tormenta, la ruta de regreso se recalcula." / "Siguiente: planeadores de EVA que ensayan una caminata, y estudiantes que planean una con los mismos datos de la NASA. Cada número dice su fuente."

## Shot list (30 fps, 1920 × 1080)

Base URL: the #282 build. Preview until it merges: `https://feat-short-mission-dynamic-routes-martian-map.fernando-haro-c.workers.dev/`; after: `https://martian-map.fernando-haro-c.workers.dev/`. Language English (Esc, Settings, Language). Quality: the GPU laptop's default high tier, or add `?tier=high`. Hide the visor frame only if it covers the subject (**V** in Walk).

| Shot | Frames | Time | URL state and action | What must be in frame |
|---|---|---|---|---|
| 1 | 0-59 | 0:00-0:02 | `?present=1`, globe beat. Fallback without the presentation mode: the mission table's Site step, slow zoom out from Cheyava Falls with the mouse wheel | Mars or the HiRISE tile; title card with the team name |
| 2 | 60-149 | 0:02-0:05 | `?present=1`, cold open beat (astronaut 913 m from the habitat). Fallback: the Site step map, Habitat and Cheyava Falls labels visible | The habitat and Cheyava Falls in one frame |
| 3 | 150-299 | 0:05-0:10 | `?present=1`, walkback zone beat, the zone shrinking. Fallback: the Route step with goal **Sample Cheyava Falls**, the route drawn | The cyan zone or route on HiRISE; title "Marswalk" |
| 4 | 300-419 | 0:10-0:14 | Route step, click **Terrain**: the route bends around the red no-go slopes | Red slope bands, the route avoiding them, the legend line "Where the route bends" |
| 5 | 420-509 | 0:14-0:17 | Walk, first sortie, 5 s after **Start walking**, walking toward S1 | Helmet view, the margin readout "MARGIN NOW" on the left, the minimap |
| 6 | 510-599 | 0:17-0:20 | Walk, the dust storm banner at about T+99 s (20 s after reaching S1), sky darkening; press **M** at frame 570: the table shows the route home | The banner text "global storm worst case · up to Curiosity's Gale 2018 storm, not Jezero" readable for 1 s |
| 7 | 600-749 | 0:20-0:25 | Mission table, Route step, the **Goal** list open showing First sortie, Sample Cheyava Falls, Survey Bright Angel | The crew's needs panel and the goal list |
| 8 | 750-899 | 0:25-0:30 | The debrief's route review: "Approved plan and walked track" with the detour judged "Worth it"; end card with the URL and QR over it from frame 840 | The verdict and the URL |

## Recording notes

- Take each shot as its own clip, 1 s longer at each end, and cut in an editor. Frame counts above are the cut points.
- Audio: the app's suit audio (breathing, fans, alarm) under the narration at about -18 dB. The app makes it in code, so no music licence is needed.
- Check the final file: 30.0 s or less, English text readable on a phone, no AI watermark needed because there is no AI content.
