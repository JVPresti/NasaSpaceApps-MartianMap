# Presentation beats

Source of truth for the presentation mode (`?present=1`, branch `feat/present-mode`). The speaker scripts
(`script-5min-es.md`, `script-5min-en.md`, `script-8min-es.md`) and this file change together. Each push to
`docs/pitch-hill-climb` that changes a beat updates the "Changed" line at the bottom.

> **Format not confirmed.** Confirm with the Ensenada organisers: 5 minutes plus Q&A is our assumption. The 8-minute
> version uses the same beats with the full demo (`demo-run-sheet.md`, cut C).

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

## 5-minute pitch

Thesis, said once in beat 1: **"On Mars, the question isn't where you can go. It's where you can go and still get home."** / **"En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver."** Every later beat proves it.

| # | Time | Beat | Camera idea | On screen (EN / ES) | Presenter says (ES, from script-5min-es.md) |
|---|---|---|---|---|---|
| 0 | optional, +0:20 (uses the slack) | Legacy | The team's own photo from last year's Ensenada event (not AI) | "2025 · NASA Explorer · 1st of 17 · Ensenada · Global Nominee" / "2025 · NASA Explorer · 1.º de 17 · Ensenada · Nominados globales"; then "5 + Andrea: refried, new generation" / "5 + Andrea: refritos, nueva generación" | "El año pasado, cinco de nosotros ganamos Ensenada con NASA Explorer: primer lugar de diecisiete, y nominados globales. Este año se sumó Andrea. Refritos, nueva generación." A local judge advised against it |
| 1a | 0:00-0:24 | Cold open | Globe turns to Jezero and dives to the HiRISE tile; marker at Cheyava Falls, the habitat 913 m away along the drawn route; a radiation alert ring pulses at the end | "913 m by the route (785 m straight)" / "913 m por la ruta (785 m en línea recta)"; "End of the EVA" / "Final de la EVA"; one oxygen bar that fills as she speaks, so the eye does the arithmetic: "160 g left" / "Quedan 160 g", split into "54 g walk home" / "54 g para volver", "72 g reserve (30 min)" / "72 g de reserva (30 min)" and a green slice "34 g margin = 13 min" / "34 g de margen = 13 min" that appears only in beat 5; small "Scenario · SIM" | "Cráter Jezero, Marte. Una astronauta está en Cheyava Falls, la roca donde Perseverance encontró una posible biofirma, a 913 metros del hábitat por la ruta. Es el final de su EVA: le quedan 160 gramos de oxígeno. Volver cuesta 54. Treinta minutos de reserva no se tocan. Y llega una alerta de radiación." |
| 1b | 0:24-0:38 | Thesis and team | Hold on the tile; the thesis types in; team name under "Marswalk" | Thesis (EN / ES); "Marswalk · Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada" | "En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Esto es Marswalk." |
| 2 | 0:38-0:55 | The limits | Three numbers land one at a time; with "20°" the Terrain layer paints the red slopes | "8 h EVA" / "8 h de EVA"; "30 min reserve" / "30 min de reserva"; "20° max slope" / "20° de pendiente máx."; small "NASA lunar suit rules (xEVA, Apollo 17)"; "No GPS" / "Sin GPS" | "Tres límites de los trajes lunares de la NASA: ocho horas de caminata, treinta minutos de reserva, nada de más de veinte grados de pendiente. Y sin GPS: el camino a casa hay que leerlo en el terreno." |
| 3 | 0:55-1:19 | The walkback zone | Top-down HiRISE. The astronaut walks the route from the habitat to Cheyava Falls; a cyan zone covers everywhere she can reach and still walk home with the reserve; it shrinks as "O2 left" drains 205 → 160 g; at Cheyava Falls the radiation alert snaps it to the corridor home and the route turns back. Final frame: the zone next to the real HUD margin pill. Caption on screen the whole beat | "Reach it and still get home" / "Alcanzas y todavía regresas"; "O2 left" counter; at the snap "Radiation alert · head home" / "Alerta de radiación · regresa"; final "In the app: MARGIN NOW" / "En la app: MARGEN AHORA"; permanent caption "Presentation view, drawn with the app's planner and suit model · in the app this is the margin number · scenario SIM" | "Lo azul es todo lo que ella alcanza y todavía regresa con su reserva, calculado con el planificador y el modelo de traje de la app. Cada subida lo encoge. Con la alerta, se cierra al camino de vuelta. En la app, eso es un número en el visor: el margen." |
| 4 | 1:19-3:44 | Live demo | Handoff to the mission table's Route step of the First sortie | Nothing extra; the app's beat lines carry it | Demo cut A, `demo-run-sheet.md` (2:25) |
| 5 | 3:44-4:11 | The answer, through the data | Back to the beat 3 final frame at Cheyava Falls; the corridor home lights up; then each data layer flashes on the part of the story it made: slope bands under the route, the Perseverance photo on the rock, the storm opacity number, the dose curve | "Margin 13 min · head home now" / "Margen 13 min · regresa ya"; then labels on each moment: "HiRISE DTM, 1 m", "Perseverance Mastcam-Z", "Curiosity, 2018 storm: tau 8.0", "Curiosity RAD, Sept 2017 · Gale crater, not Jezero" | "¿Y la astronauta de Cheyava Falls? Con la alerta, le sobran trece minutos de margen. Marswalk la manda de vuelta ya, por la ruta que rodea las pendientes. Esa pendiente es el modelo HiRISE de un metro. La roca es la que fotografió Perseverance. La tormenta llega a la opacidad que midió Curiosity en 2018, y la radiación repite dosis reales de 2017." |
| 6 | 4:11-4:30 | Measured or simulated | The real HUD suit panel with its tags; the SIM tag on the margin highlighted | "DATA · DERIVED · SIM"; "Storm and radiation: Curiosity, Gale crater, not Jezero" / "Tormenta y radiación: Curiosity, cráter Gale, no Jezero"; "Jezero weather: Perseverance MEDA" / "Clima de Jezero: MEDA de Perseverance" | "Cada lectura dice si es medida, calculada o supuesta: caminar a un metro por segundo es supuesto. La tormenta y la radiación las midió Curiosity en Gale, no en Jezero, y la alerta lo dice. El clima de Jezero es la estación MEDA de Perseverance." |
| 7 | 4:30-4:51 | Who, and one hard fact | Mission table with the three route profiles; then the end frame: one big number, team names, QR | "For EVA planners · for classrooms in Ensenada" / "Para quien planea una EVA · para clases en Ensenada"; end "Same HiRISE model as NASA Mars Trek · 0.14 m typical difference over 564,001 points" / "El mismo modelo HiRISE que NASA Mars Trek · 0.14 m de diferencia típica en 564,001 puntos"; QR | "Sirve para quien planea una caminata, que compara tres rutas antes de aprobar una, y para una clase en Ensenada, en el navegador. Un último dato: procesamos el mismo modelo HiRISE que sirve NASA Mars Trek, y la diferencia típica es de catorce centímetros." |

9 seconds of slack after beat 7 (4:51 to 5:00).

## Notes for the presentation thread

**Beat 3, the walkback zone.** The app shows this budget as one number, the margin (`MARGIN NOW · home in`), not as an
area. Draw the zone with the app's own code so it is honest: `buildCostGrid` (20° no-go cells), `planRoute`, and the
suit model (`constantEffortSpeed`, `metabolicPowerW`, `o2RateGs`, the 20 % walkback pad and the 30 min reserve).
Two Dijkstra passes: from home over reversed edges (the walk back from every cell), and from the astronaut (the walk
out). A cell is in the zone when walk out + walk back + reserve ≤ O2 left. A working reference is
`docs/pitch/tools/walkback-zone.mjs`; it writes `docs/pitch/data/walkback-zone.json` with the planned path, per-leg time and O2, and per frame the position, O2 left, walk-home grams, margin and zone area, plus a per-cell "last frame in the zone" mask (251 × 251, base64). The scenario
start (205 g O2 left late in a long EVA, 27 % of the 771 g tank; 160 g at Cheyava Falls; margin 13 min when the alert hits, frame 40) and the 10 % corridor after the alert are ours: tag them SIM on screen in
small type, for example "Scenario: late in an EVA, 205 g O2 left · SIM". A full suit (771 g) reaches the whole tile,
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
| 0:02-0:05 | The challenge | Dive to the HiRISE tile: habitat, Cheyava Falls, the route between them | "Martian Map: plan a walk on Mars" | "An astronaut, 913 metres from the habitat. Walking back costs 54 grams of oxygen." |
| 0:05-0:10 | Name and tagline | The real HUD margin pill | "Marswalk · where you can go and still get home" | "Marswalk tells her how far she can go and still get home." |
| 0:10-0:20 | How it works with NASA data | Terrain layer: the route bends around red slopes; the helmet view with the margin; the dust storm and the map's route home | "HiRISE DTM · Mastcam-Z · MEDA · Curiosity RAD" | "HiRISE terrain sets the route around slopes over twenty degrees. When a dust storm takes the horizon, the way home re-plans." |
| 0:20-0:30 | The future | The three route profiles at the table; end card with the number | "Next: heart rate · other HiRISE sites · same HiRISE model as NASA Mars Trek, 0.14 m" | "Next, a heart rate sensor sets her oxygen use. We process the same HiRISE model as NASA Mars Trek, to fourteen centimetres." |

Changed: 15 Nov 2026, 12:00 UTC. Council round 2 (A/B, 3 of 3 kept the revision): Gale and MEDA said aloud in beat 6; the scenario framed as the end of an EVA; close on the 0.14 m processing check; 913 m by the route, 785 m straight.
