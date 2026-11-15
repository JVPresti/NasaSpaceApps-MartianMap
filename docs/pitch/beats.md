# Presentation beats

Source of truth for the presentation mode (`?present=1`, branch `feat/present-mode`). The speaker scripts
(`script-5min-es.md`, `script-5min-en.md`, `script-8min-es.md`) and this file change together. Each push to
`docs/pitch-hill-climb` that changes a beat updates the "Changed" line at the bottom.

> **Format.** The Ensenada organisers asked for a presentation in English, 3 minutes at most, at 2:30 pm, with the file
> sent to them by 2:00 pm (`docs/SUBMISSION.md`, PR #316). The 3-minute table below is the primary. **Confirm with
> the organisers** whether the live demo counts inside the 3 minutes. The 5-minute table stays for a longer slot.

Rules for every beat:

- Every motion teaches one thing. If a judge cannot say what a movement showed, cut it.
- On-screen words: at most 8 per line, English first, Spanish under it in the same style, smaller. Numbers stay
  numbers.
- Real data only: HiRISE, CTX, Perseverance images and traverse, MEDA, RAD, the app's own planner and suit model.
  No AI renders. The start screen video is AI-generated (credited in `docs/credits.md`): do not use it here.
- Names and numbers match #282 and `docs/DEMO.md`: First sortie, S1 · light-toned patch, Terrain, Rocks, Outcrop,
  Radio, Exposure, "Gale 2018 worst case", "RAD, September 2017 event".
- Each beat needs a still final frame that reads on its own. The 7-slide PDF uses those frames.
- `prefers-reduced-motion`: cut straight to each final frame.
- Transitions about 300 ms. The globe zoom is the only long move.

## 3-minute pitch (primary)

Spoken in English (`script-3min-en.md`), written for 125 words per minute; the Spanish on-screen words stay as the
second line for the local judges. Beats 1a, 1b and 3 reuse the camera ideas of the 5-minute table below; the limits
beat is cut, and its numbers move into the cold open's oxygen bar.

| # | Time | Beat | Camera idea | On screen (EN / ES) | Presenter says (EN, from script-3min-en.md) |
|---|---|---|---|---|---|
| 1a | 0:00-0:28 | Cold open | As 5-minute beat 1a: globe to Jezero to the HiRISE tile, astronaut at Cheyava Falls, the route home drawn, the oxygen bar filling as the numbers are said | As 5-minute beat 1a | "Jezero crater, Mars. An astronaut stands at Cheyava Falls, where Perseverance found a possible sign of life, 913 metres from the habitat by the route. It is the end of her walk outside, her EVA. She has 160 grams of oxygen. Walking back costs 53. Her reserve, thirty minutes of breathing, is another 72. Then a radiation alert." |
| 1b | 0:28-0:46 | Thesis and team | As 5-minute beat 1b | Thesis; team name | "On Mars, the question isn't where you can go. It's where you can go and still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación, from Ensenada. Marswalk counts those minutes on real NASA terrain." |
| 3 | 0:46-1:01 | The walkback zone | As 5-minute beat 3, shortened to 15 s: the zone shrinks along the route, snaps at the alert, final frame next to the HUD margin. Caption on screen the whole beat | As 5-minute beat 3 | "This drawing, made with the app's own planner, shows everywhere she can reach and still get back. In the app, that is one number on the visor, the margin." |
| 4 | 1:01-2:16 | Live demo | Handoff to the mission table's Route step | Nothing extra | Demo cut B, `demo-run-sheet.md` (1:15): Terrain layer, O2 to 20 %, Begin EVA, walk, the same radiation alert fired by hand, the visor turns to the shelter |
| 5 | 2:16-2:38 | The answer | Back to the beat 3 final frame at Cheyava Falls; the corridor home lights; the oxygen bar shows its green slice | "Margin 14 min · head home now" / "Margen 14 min · regresa ya"; "Radiation: Curiosity RAD, Gale crater, not Jezero" / "Radiación: RAD de Curiosity, cráter Gale, no Jezero" | "Back at Cheyava Falls, an alert means shelter early. Fourteen minutes of margin says she makes it, so Marswalk sends her home now, on a route planned around ground over twenty degrees. The alert replays a real 2017 solar storm measured by Curiosity in Gale crater." |
| 7 | 2:38-2:52 | Why it matters | The mission table's three route profiles side by side; end frame with the team names and the QR | "Apollo rule: walkback limit + 30 min reserve" / "Regla de Apolo: límite de regreso + 30 min de reserva"; "Check three routes before anyone walks" / "Revisa tres rutas antes de salir"; QR | "Apollo crews walked under this same rule, a walkback limit with a thirty minute reserve. Marswalk lets an EVA planner check three routes against it before anyone walks." |

8 seconds of slack after beat 7 (2:52 to 3:00) at 125 words per minute.

## 5-minute pitch

Thesis, said once in beat 1: **"On Mars, the question isn't where you can go. It's where you can go and still get home."** / **"En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver."** Every later beat proves it.

| # | Time | Beat | Camera idea | On screen (EN / ES) | Presenter says (ES, from script-5min-es.md) |
|---|---|---|---|---|---|
| 0 | optional, +0:20 (uses the slack) | Legacy | The team's own photo from last year's Ensenada event (not AI) | "2025 · NASA Explorer · 1st of 17 · Ensenada · Global Nominee" / "2025 · NASA Explorer · 1.º de 17 · Ensenada · Nominados globales"; then "5 + Andrea: refried, new generation" / "5 + Andrea: refritos, nueva generación" | "El año pasado, cinco de nosotros ganamos Ensenada con NASA Explorer: primer lugar de diecisiete, y nominados globales. Este año se sumó Andrea. Refritos, nueva generación." It uses 20 s of slack; in round 1 the AI reviewer playing a local judge warned it risks running over |
| 1a | 0:00-0:24 | Cold open | Globe turns to Jezero and dives to the HiRISE tile; marker at Cheyava Falls, the habitat 913 m away along the drawn route; a radiation alert ring pulses at the end | "913 m by the route (785 m straight)" / "913 m por la ruta (785 m en línea recta)"; "End of the EVA" / "Final de la EVA"; one oxygen bar that fills as she speaks, so the eye does the arithmetic: "160 g left" / "Quedan 160 g", split into "53 g walk home" / "53 g para volver", "72 g reserve (30 min)" / "72 g de reserva (30 min)" and a green slice "34 g margin = 14 min" / "34 g de margen = 14 min" that appears only in beat 5; small "Scenario · SIM" | "Cráter Jezero, Marte. Una astronauta está en Cheyava Falls, la roca donde Perseverance encontró una posible biofirma, a 913 metros del hábitat por la ruta. Es el final de su EVA: le quedan 160 gramos de oxígeno. Volver cuesta 53. Treinta minutos de reserva no se tocan. Y llega una alerta de radiación." |
| 1b | 0:24-0:38 | Thesis and team | Hold on the tile; the thesis types in; team name under "Marswalk" | Thesis (EN / ES); "Marswalk · Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada" | "En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Esto es Marswalk." |
| 2 | 0:38-0:55 | The limits | Three numbers land one at a time; with "20°" the Terrain layer paints the red slopes | "8 h EVA" / "8 h de EVA"; "30 min reserve" / "30 min de reserva"; "20° max slope" / "20° de pendiente máx."; small "NASA lunar suit rules (xEVA, Apollo 17)"; "No GPS" / "Sin GPS" | "Tres límites de los trajes lunares de la NASA: ocho horas de caminata, treinta minutos de reserva, nada de más de veinte grados de pendiente. Y sin GPS: el camino a casa hay que leerlo en el terreno." |
| 3 | 0:55-1:19 | The walkback zone | Top-down HiRISE. The astronaut walks the route from the habitat to Cheyava Falls; a cyan zone covers everywhere she can reach and still walk home with the reserve; it shrinks as "O2 left" drains 205 → 160 g; at Cheyava Falls the radiation alert snaps it to the corridor home and the route turns back. Final frame: the zone next to the real HUD margin pill. Caption on screen the whole beat | "Blue: she reaches it and walks home with 30 min in reserve" / "Azul: lo alcanza y vuelve con 30 min de reserva"; "O2 left" counter; at the snap "Radiation alert · head home" / "Alerta de radiación · regresa"; final "In the app: MARGIN NOW" / "En la app: MARGEN AHORA"; permanent caption "Presentation view, drawn with the app's planner and suit model · in the app this is the margin number · scenario SIM" | "Lo azul es todo lo que ella alcanza y todavía regresa con su reserva, calculado con el planificador y el modelo de traje de la app. Cada subida lo encoge. Con la alerta, se cierra al camino de vuelta. En la app, eso es un número en el visor: el margen." |
| 4 | 1:19-3:44 | Live demo | Handoff to the mission table's Route step of the First sortie | Nothing extra; the app's beat lines carry it | Demo cut A, `demo-run-sheet.md` (2:25) |
| 5 | 3:44-4:11 | The answer, through the data | Back to the beat 3 final frame at Cheyava Falls; the corridor home lights up; then each data layer flashes on the part of the story it made: slope bands under the route, the Perseverance photo on the rock, the storm opacity number, the dose curve | "Margin 14 min · head home now" / "Margen 14 min · regresa ya"; then labels on each moment: "HiRISE DTM, resampled to 2 m", "Perseverance Mastcam-Z", "Curiosity, 2018 storm: tau 8.0", "Curiosity RAD, Sept 2017 · Gale crater, not Jezero" | "¿Y la astronauta de Cheyava Falls? Con la alerta, le sobran catorce minutos de margen. Marswalk la manda de vuelta ya, por la ruta que rodea las pendientes. Esa pendiente es el modelo HiRISE. La roca es la que fotografió Perseverance. La tormenta llega a la opacidad que midió Curiosity en 2018, y la radiación repite tasas de dosis reales de 2017." |
| 6 | 4:11-4:30 | Measured or simulated | The real HUD suit panel with its tags; the SIM tag on the margin highlighted | "DATA · DERIVED · SIM"; "Storm and radiation: Curiosity, Gale crater, not Jezero" / "Tormenta y radiación: Curiosity, cráter Gale, no Jezero"; "Jezero weather: Perseverance MEDA" / "Clima de Jezero: MEDA de Perseverance" | "Cada lectura dice si es medida, calculada o supuesta: caminar a un metro por segundo es supuesto. La tormenta y la radiación las midió Curiosity en Gale, no en Jezero, y la alerta lo dice. El clima de Jezero es la estación MEDA de Perseverance." |
| 7 | 4:30-4:51 | Who, and one hard fact | Mission table with the three route profiles; then the end frame: one big number, team names, QR | "EVA planners could compare three routes" / "Quien planea una EVA podría comparar tres rutas"; "A class in Ensenada could plan the walk" / "Un salón en Ensenada podría planear la caminata"; end "Same HiRISE model as NASA Mars Trek · 0.14 m typical difference over 564,001 points" / "El mismo modelo HiRISE que NASA Mars Trek · 0.14 m de diferencia típica en 564,001 puntos"; QR | "Podría servir a quien planea una caminata, para comparar tres rutas antes de aprobar una, y a una clase en Ensenada, en el navegador. Un último dato: procesamos el mismo modelo HiRISE que sirve NASA Mars Trek, y la diferencia típica es de catorce centímetros." |

9 seconds of slack after beat 7 (4:51 to 5:00).

## Notes for the presentation thread

**Beat 3, the walkback zone.** The app shows this budget as one number, the margin (`MARGIN NOW · home in`), not as an
area. Draw the zone with the app's own code so it is honest: `buildCostGrid` (20° no-go cells), `planRoute`, and the
suit model (`constantEffortSpeed`, `metabolicPowerW`, `o2RateGs`, the 20 % walkback pad and the 30 min reserve).
Two Dijkstra passes: from home over reversed edges (the walk back from every cell), and from the astronaut (the walk
out). A cell is in the zone when walk out + walk back + reserve ≤ O2 left. A working reference is
`docs/pitch/tools/walkback-zone.mjs`; it writes `docs/pitch/data/walkback-zone.json` with the planned path, per-leg time and O2, and per frame the position, O2 left, walk-home grams, margin and zone area, plus a per-cell "last frame in the zone" mask (251 × 251, base64). The scenario
start (205 g O2 left late in a long EVA, 27 % of the 771 g tank; 160 g at Cheyava Falls; margin 14 min when the alert hits, frame 40) and the 10 % corridor after the alert are ours: tag them SIM on screen in
small type, for example "Scenario: late in an EVA, 205 g O2 left · SIM". The cold open's numbers are the `coldOpen` field of the same file (route home re-planned from Cheyava Falls: 824 m, 53.4 g, 18.4 min, margin 14.1 min). Frames 37 to 39 drop the zone to about 1 ha because the Bright Angel stop sits on 28.7° rock and its cell is boxed in by no-go cells: a grid artefact, not oxygen. Draw the zone from frame 36 straight to the alert frame 40. A full suit (771 g) reaches the whole tile,
so the clip needs the late-EVA scenario to show anything shrink.

**Self-drawing route.** Optional inside beat 3 or 5: the planned route draws across the Terrain layer leg by leg,
with the time and O2 counters from `walkCost` per leg. The per-leg numbers are in the same export (`legs`).

**Real clips.** The airlock, the dust storm closing in and EV2 at the stop make good background loops for beats 2
and 5, and double as demo fallbacks. Record them from the app, not from AI tools.

**Final frames for the PDF.** Beats 1, 2, 3, 5, 6 and 7 each need a final frame at 1920 × 1080 that reads with no
motion. Save them where this branch can pick them up (`docs/pitch/img/present-<beat>.png`) or tell us the path.

## 30-second video

Official beats. English narration (or Spanish with English subtitles). Full shot list in `video-30s.md`. Every shot is
the real app: the walkback zone is not in the video, because the app shows the margin as a number.

| Time | Beat | Camera idea | On screen | Narration (EN) |
|---|---|---|---|---|
| 0:00-0:02 | Intro | Globe turning to Jezero | "Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada" | (suit breathing only) |
| 0:02-0:05 | The challenge | Dive to the HiRISE tile: habitat, Cheyava Falls, the route between them | "Cheyava Falls · 53 g of O2 to walk home" | "An astronaut has to walk home." |
| 0:05-0:10 | Name and tagline | The real HUD margin pill | "Marswalk · MARGIN NOW, minutes left after the walk home" | "Marswalk shows how many minutes she has left after that." |
| 0:10-0:20 | How it works with NASA data | Terrain layer: the route bends around red slopes, touching red only at the Bright Angel stop; the helmet view with the margin; the dust storm and the map's route home | "HiRISE terrain model · Mastcam-Z · storm opacity from Curiosity, Gale 2018" | "HiRISE terrain blocks slopes over twenty degrees. When dust reaches the opacity Curiosity measured in 2018, the route home re-plans." |
| 0:20-0:30 | The future | The three route profiles at the table; end card with the number | "Next: heart rate, other HiRISE sites · our grid reproduces NASA's HiRISE model to 0.14 m" | "Next, a heart rate sensor sets her oxygen use. Our grid reproduces NASA's HiRISE model to fourteen centimetres." |

Changed: 15 Nov 2026, 13:45 UTC (5:45 am PST). Council round 4: the 3-minute script fits 125 words per minute; the demo fires the same radiation alert; the close is the Apollo walkback rule, and the 0.14 m check moved to the slides and Q&A.
