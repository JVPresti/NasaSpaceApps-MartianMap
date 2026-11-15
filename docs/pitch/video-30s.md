# 30-second video: script and shot list

Hard limit 30 s. English narration, English on-screen text. If the team narrates in Spanish, burn in English subtitles (the lines below). The presentation mode (`?present=1`, branch `feat/present-mode`) can record this from the app with frame-perfect capture; if it is not ready, a person records it on the demo laptop (it has the GPU) with the URL states below.

Rules from the submission guide that apply here:

- The audience knows nothing about Mars or EVAs. Every shot answers one question.
- No AI-generated images or video unless they carry a visible watermark. Our start screen video is AI-generated: **do not use it**. Every shot below is a real app capture or a real NASA image.
- No NASA logos, flags or mission insignia added or modified. The app shows none; keep it that way in titles.
- No images of anyone under 18.

## Script

| Time | Official beat | Narration (EN) | Words / slot | Subtitle if narrated in Spanish (English) | On-screen text |
|---|---|---|---|---|---|
| 0:00-0:02 | Intro | (suit breathing, no words) | 0 / 3 s |  | Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada, Mexico · NASA Space Apps 2026, Martian Map |
| 0:02-0:05 | The challenge | "Getting home costs fifty-three grams of oxygen." | 8 / 3 s | Getting home costs fifty-three grams of oxygen. | 913 m out · 53 g of O2 to walk home |
| 0:05-0:10 | Name and tagline | "Marswalk shows the minutes she has left after walking home." | 10 / 5 s | Marswalk shows the minutes she has left after walking home. | Marswalk · MARGIN NOW, minutes left after the walk home |
| 0:10-0:20 | How it works with NASA data | "HiRISE terrain sets her route around slopes over twenty degrees. When dust reaches the opacity Curiosity measured in 2018, the route home re-plans." | 24 / 10 s | HiRISE terrain sets her route around slopes over twenty degrees. When dust reaches the opacity Curiosity measured in 2018, the route home re-plans. | HiRISE terrain model · Mastcam-Z · storm opacity from Curiosity, Gale 2018 |
| 0:20-0:30 | The future | "Next, a heart rate sensor sets her oxygen use. Our grid reproduces NASA's HiRISE model to fourteen centimetres." | 18 / 10 s | Next, a heart rate sensor sets her oxygen use. Our grid reproduces NASA's HiRISE model to fourteen centimetres. | Next: heart rate, other HiRISE sites · our grid reproduces NASA's HiRISE model to 0.14 m · martian-map.fernando-haro-c.workers.dev |

Spoken word counts (hyphenated numbers counted as their spoken words): English 60 words in 28 s of speaking slots, 129 words per minute; each line fits its slot at 140 to 160 wpm. Spanish 59 words in the same slots. Read both once against a stopwatch before recording; if a line runs long, cut the clause after the comma.

Spanish narration, if chosen (same timing; burn in the English lines above as subtitles, including "Curiosity measured in 2018"): "Volver cuesta cincuenta y tres gramos de oxígeno." / "Marswalk muestra los minutos que le quedan al volver." / "HiRISE traza su ruta lejos de pendientes de más de veinte grados. Con la opacidad que midió Curiosity en 2018, la ruta se recalcula." / "Después, un sensor de ritmo cardiaco marca su oxígeno. Nuestra malla reproduce el modelo HiRISE a catorce centímetros."

## Shot list (30 fps, 1920 × 1080)

Base URL: the #282 build. Preview until it merges: `https://feat-short-mission-dynamic-routes-martian-map.fernando-haro-c.workers.dev/`; after: `https://martian-map.fernando-haro-c.workers.dev/`. Language English (Esc, Settings, Language). Quality: the GPU laptop's default high tier, or add `?tier=high`. Hide the visor frame only if it covers the subject (**V** in Walk).

| Shot | Frames | Time | URL state and action | What must be in frame |
|---|---|---|---|---|
| 1 | 0-59 | 0:00-0:02 | `?present=1`, globe beat. Fallback without the presentation mode: the mission table's Site step, slow zoom out from Cheyava Falls with the mouse wheel | Mars or the HiRISE tile; title card with the team name |
| 2 | 60-149 | 0:02-0:05 | `?present=1`, cold open beat (astronaut 913 m from the habitat by the route). Fallback: Route step with goal **Sample Cheyava Falls**, the route from HAB to Cheyava Falls drawn | The habitat, Cheyava Falls and the route in one frame |
| 3 | 150-299 | 0:05-0:10 | Walk, first sortie, 10 s after **Start walking**; zoom or crop on the suit panel so "MARGIN NOW" and its number fill the frame. Do not use the presentation's walkback zone here: it is not an app feature | The margin pill, readable; title "Marswalk" |
| 4 | 300-419 | 0:10-0:14 | Route step, click **Terrain**: the route bends around the red no-go slopes | Red slope bands, the route avoiding them, the legend line "Decides where the route bends" |
| 5 | 420-509 | 0:14-0:17 | Walk, first sortie, 5 s after **Start walking**, walking toward the Light-toned patch stop (S1 on the waypoint panel) | Helmet view, the margin readout "MARGIN NOW" on the left, the minimap |
| 6 | 510-599 | 0:17-0:20 | Walk, first sortie on #282 at 8ec6f72: at the Light-toned patch stop (about T+53 s), take a sample (**P**, click the ground, **E**); the dust storm starts 3 s after the sample is secured (about T+68 s in the measured player run). Without a sample it waits 90 s. Film the banner and the sky darkening; press **M** at frame 570: the table shows the route home | The banner text "global storm worst case · up to Curiosity's Gale 2018 storm, not Jezero" readable for 1 s |
| 7 | 600-749 | 0:20-0:25 | Mission table, Route step, goal **Sample Cheyava Falls**, the route profiles **Fastest**, **Gentlest**, **Radio** compared | The three profile columns |
| 8 | 750-899 | 0:25-0:30 | End card over the Terrain layer: "same HiRISE model as NASA Mars Trek, 0.14 m", the URL and the QR | The number and the URL |

## Recording notes

- Take each shot as its own clip, 1 s longer at each end, and cut in an editor. Frame counts above are the cut points.
- Audio: the app's suit audio (breathing, fans, alarm) under the narration at about -18 dB. The app makes it in code, so no music licence is needed.
- Check the final file: 30.0 s or less, English text readable on a phone, no AI watermark needed because there is no AI content.
