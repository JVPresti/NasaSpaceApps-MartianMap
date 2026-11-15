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
| 0:00-0:02 | Intro | (suit breathing, no words) | | Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada, Mexico · NASA Space Apps 2026, Martian Map |
| 0:02-0:05 | The challenge | "An astronaut, 913 metres from the habitat. Walking back costs 54 grams of oxygen." | (same) | 913 m to the habitat · 54 g of O2 to walk back |
| 0:05-0:10 | Name and tagline | "Marswalk puts one number on her visor: minutes to spare after the walk home." | (same) | Marswalk · MARGIN NOW: minutes to spare after the walk home |
| 0:10-0:20 | How it works with NASA data | "HiRISE terrain sets the route around slopes over twenty degrees. When dust reaches the opacity Curiosity measured in 2018, Marswalk re-plans her route home." | (same) | HiRISE DTM · Mastcam-Z · MEDA · Curiosity RAD |
| 0:20-0:30 | The future | "Next, a heart rate sensor sets her oxygen use. Our grid reproduces NASA's HiRISE model to fourteen centimetres." | (same) | Next: heart rate, other HiRISE sites · same HiRISE model as NASA Mars Trek, 0.14 m · martian-map.fernando-haro-c.workers.dev |

Narration: 58 words in about 27 s of speaking slots, about 130 words per minute. Read it once against a stopwatch before recording.

Spanish narration, if chosen (same timing, English subtitles above): "Una astronauta, a 913 metros del hábitat. Volver caminando cuesta 54 gramos de oxígeno." / "Marswalk pone un número en su visor: los minutos que le sobran después de volver." / "El terreno de HiRISE traza la ruta alrededor de pendientes de más de veinte grados. Si una tormenta de polvo le quita el horizonte, la ruta de regreso se recalcula." / "Lo siguiente: un sensor de ritmo cardiaco marca su consumo de oxígeno. Procesamos el mismo modelo HiRISE que NASA Mars Trek, con catorce centímetros de diferencia."

## Shot list (30 fps, 1920 × 1080)

Base URL: the #282 build. Preview until it merges: `https://feat-short-mission-dynamic-routes-martian-map.fernando-haro-c.workers.dev/`; after: `https://martian-map.fernando-haro-c.workers.dev/`. Language English (Esc, Settings, Language). Quality: the GPU laptop's default high tier, or add `?tier=high`. Hide the visor frame only if it covers the subject (**V** in Walk).

| Shot | Frames | Time | URL state and action | What must be in frame |
|---|---|---|---|---|
| 1 | 0-59 | 0:00-0:02 | `?present=1`, globe beat. Fallback without the presentation mode: the mission table's Site step, slow zoom out from Cheyava Falls with the mouse wheel | Mars or the HiRISE tile; title card with the team name |
| 2 | 60-149 | 0:02-0:05 | `?present=1`, cold open beat (astronaut 913 m from the habitat). Fallback: Route step with goal **Sample Cheyava Falls**, the route from HAB to Cheyava Falls drawn | The habitat, Cheyava Falls and the route in one frame |
| 3 | 150-299 | 0:05-0:10 | Walk, first sortie, 10 s after **Start walking**; zoom or crop on the suit panel so "MARGIN NOW" and its number fill the frame. Do not use the presentation's walkback zone here: it is not an app feature | The margin pill, readable; title "Marswalk" |
| 4 | 300-419 | 0:10-0:14 | Route step, click **Terrain**: the route bends around the red no-go slopes | Red slope bands, the route avoiding them, the legend line "Where the route bends" |
| 5 | 420-509 | 0:14-0:17 | Walk, first sortie, 5 s after **Start walking**, walking toward S1 | Helmet view, the margin readout "MARGIN NOW" on the left, the minimap |
| 6 | 510-599 | 0:17-0:20 | Walk, the dust storm banner at about T+99 s (20 s after reaching S1), sky darkening; press **M** at frame 570: the table shows the route home | The banner text "global storm worst case · up to Curiosity's Gale 2018 storm, not Jezero" readable for 1 s |
| 7 | 600-749 | 0:20-0:25 | Mission table, Route step, goal **Sample Cheyava Falls**, the route profiles **Fastest**, **Gentlest**, **Radio** compared | The three profile columns |
| 8 | 750-899 | 0:25-0:30 | End card over the Terrain layer: "same HiRISE model as NASA Mars Trek, 0.14 m", the URL and the QR | The number and the URL |

## Recording notes

- Take each shot as its own clip, 1 s longer at each end, and cut in an editor. Frame counts above are the cut points.
- Audio: the app's suit audio (breathing, fans, alarm) under the narration at about -18 dB. The app makes it in code, so no music licence is needed.
- Check the final file: 30.0 s or less, English text readable on a phone, no AI watermark needed because there is no AI content.
