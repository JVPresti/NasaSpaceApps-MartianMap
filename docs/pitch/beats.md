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
| 0 | optional, +0:20 | Legacy | The team's own photo from last year's Ensenada event (not AI), the new name types over it | "2025 · 1st of 17 · Ensenada · Global Nominee" / "2025 · 1.º de 17 · Ensenada · Nominados globales"; then "Refried. New generation." / "Refritos. Nueva generación." | "El año pasado, Los Frijolitos Espaciales ganamos Ensenada, primer lugar de diecisiete, con NASA Explorer, y fuimos nominados globales. Volvimos. Refritos, nueva generación." Only if picked in rehearsal; beat 7 then loses 0:20 |
| 1a | 0:00-0:20 | Cold open | Mars globe turns to Jezero and dives to the HiRISE tile; an astronaut marker at Cheyava Falls, the habitat 913 m away, a dust front at the tile edge | "913 m to the habitat · 18 min · 54 g O2" / "913 m al hábitat · 18 min · 54 g de O2" | "Cráter Jezero, Marte. Una astronauta está en Cheyava Falls, la roca donde Perseverance encontró una posible biofirma. El hábitat está a 913 metros. Volver le cuesta 18 minutos y 54 gramos de oxígeno. Y viene una tormenta de polvo." |
| 1b | 0:20-0:35 | Thesis and team | Hold on the tile; the thesis line types in, then the team name small under "Marswalk" | The thesis (EN / ES, above); "Marswalk · Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada" | "En Marte, la pregunta no es a dónde puedes ir. Es a dónde puedes ir y todavía volver. Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Esto es Marswalk." |
| 2 | 0:35-0:52 | The rules | Three numbers land on the tile one at a time; with "20°" the Terrain layer paints the red no-go slopes | "8 h suit limit · NASA xEVA" / "8 h de traje · NASA xEVA"; "30 min reserve · Apollo" / "30 min de reserva · Apolo"; "20° no-go · NASA xEVA" / "20° prohibido · NASA xEVA"; "No GPS" / "Sin GPS" | "Las reglas son de la NASA. Ocho horas máximo de caminata con traje. Treinta minutos de oxígeno que no se tocan, como en Apolo. Ninguna pendiente de más de veinte grados. Y en Marte no hay GPS." |
| 3 | 0:52-1:16 | The walkback zone | Top-down HiRISE. A cyan zone around the astronaut covers everywhere she can reach and still walk home with the reserve. It shrinks as the O2 counter drains along the route, and snaps to a corridor home when the radiation alert hits; the route turns back. Final frame: the zone next to the HUD margin pill | "Reach it and still get home" / "Alcanzas y todavía regresas"; counter "O2 left"; at the snap "Radiation alert · head home" / "Alerta de radiación · regresa"; final "In the app: MARGIN NOW" / "En la app: MARGEN AHORA"; small "Scenario: 205 g O2 left · SIM" | "Lo azul es todo lo que alcanza y todavía regresa con su reserva. Sale del terreno de HiRISE y de pruebas de trajes de la NASA. Cada subida lo encoge. Con la alerta de radiación se cierra al camino de vuelta. En la app, eso es un número en el visor: el margen." |
| 4 | 1:16-3:41 | Live demo | Handoff: settle on the mission table's Route step of the First sortie, hand control to the presenter | Nothing extra; the app's beat lines carry it | Demo cut A, `demo-run-sheet.md` (2:25): Terrain layer, goal to Sample Cheyava Falls and back, Begin EVA, walk to S1, sample, dust storm and re-plan |
| 5 | 3:41-4:11 | NASA data | Back to top-down. Layers stack on the tile, each labelled with its mission and instrument | "MRO HiRISE DTM · 1 m"; "Perseverance Mastcam-Z · stops"; "MEDA · sol 1187"; "Curiosity RAD · Sept 2017"; "NASA DONKI · event date". Spanish: same names | "Cada capa sale de una misión. El terreno es el modelo HiRISE de Mars Reconnaissance Orbiter, a un metro por píxel: pendiente, ruta, sombra de radio y posición. Las paradas y las fotos son de Mastcam-Z, en Perseverance. El clima es el sol 1187 de MEDA. La radiación son las dosis de RAD en septiembre de 2017, con la fecha del registro DONKI." |
| 6 | 4:11-4:30 | Measured or simulated | Three tags snap onto real HUD numbers: DATA on 20°, DERIVED on a slope, SIM on 1 m/s; a line "Gale crater, not Jezero" under the dose | "DATA · DERIVED · SIM"; "Gale crater, not Jezero" / "Cráter Gale, no Jezero" | "Cada número dice de dónde viene. DATA es medido. DERIVED lo calculamos nosotros. SIM es una suposición nuestra, como caminar a un metro por segundo. La radiación se midió en Gale, no en Jezero, y la pantalla lo dice." |
| 7 | 4:30-5:00 | Close on a hard fact | Pull back to the globe. End frame: one big number, the team names and the QR code | "Next: heart rate · any HiRISE site" / "Siguiente: ritmo cardiaco · cualquier sitio HiRISE"; end "0.14 m RMS vs NASA Mars Trek · 564,001 points" / "0.14 m RMS contra NASA Mars Trek · 564,001 puntos"; QR | "Siguiente: el ritmo cardiaco real de quien camina, con el modelo de la NASA, y cualquier sitio con modelo HiRISE. Un último dato: comparamos nuestro terreno con el de NASA Mars Trek en 564 mil puntos. La diferencia típica es de catorce centímetros. El código QR abre la demo." |

## Notes for the presentation thread

**Beat 3, the walkback zone.** The app shows this budget as one number, the margin (`MARGIN NOW · home in`), not as an
area. Draw the zone with the app's own code so it is honest: `buildCostGrid` (20° no-go cells), `planRoute`, and the
suit model (`constantEffortSpeed`, `metabolicPowerW`, `o2RateGs`, the 20 % walkback pad and the 30 min reserve).
Two Dijkstra passes: from home over reversed edges (the walk back from every cell), and from the astronaut (the walk
out). A cell is in the zone when walk out + walk back + reserve ≤ O2 left. A working reference is
`docs/pitch/tools/walkback-zone.mjs`; it writes `docs/pitch/data/walkback-zone.json` with the planned path, per-leg time and O2, and per frame the position, O2 left, walk-home grams, margin and zone area, plus a per-cell "last frame in the zone" mask (251 × 251, base64). The scenario
start (205 g O2 left, late in a long EVA) and the 10 % corridor after the alert are ours: tag them SIM on screen in
small type, for example "Scenario: late in an EVA, 205 g O2 left · SIM". A full suit (771 g) reaches the whole tile,
so the clip needs the late-EVA scenario to show anything shrink.

**Self-drawing route.** Optional inside beat 3 or 5: the planned route draws across the Terrain layer leg by leg,
with the time and O2 counters from `walkCost` per leg. The per-leg numbers are in the same export (`legs`).

**Real clips.** The airlock, the dust storm closing in and EV2 at the stop make good background loops for beats 2
and 5, and double as demo fallbacks. Record them from the app, not from AI tools.

**Final frames for the PDF.** Beats 1, 2, 3, 5, 6 and 7 each need a final frame at 1920 × 1080 that reads with no
motion. Save them where this branch can pick them up (`docs/pitch/img/present-<beat>.png`) or tell us the path.

## 30-second video

Official beats. English narration (or Spanish with English subtitles). Full shot list in `video-30s.md`.

| Time | Beat | Camera idea | On screen | Narration (EN) |
|---|---|---|---|---|
| 0:00-0:02 | Intro | Globe turning to Jezero | "Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada" | (suit breathing only) |
| 0:02-0:05 | The challenge | Dive to the HiRISE tile, astronaut marker 913 m from the habitat | "913 m from home · 54 g O2 to get back" | "On Mars, nobody comes to get you." |
| 0:05-0:10 | Name and tagline | The walkback zone appears around her | "Marswalk · where you can go and still get home" | "Marswalk shows where you can go and still get home." |
| 0:10-0:20 | How it works with NASA data | Route draws on the HiRISE Terrain layer, leg times and O2 tick; cut to the helmet, the margin; the dust storm and the re-plan | "HiRISE DTM · Mastcam-Z · MEDA · RAD" | "The HiRISE terrain sets the route. NASA suit tests set the oxygen per metre. When a storm hits, the way home re-plans." |
| 0:20-0:30 | The future | The mission table with the goal list; then the debrief route review | "For EVA planners and classrooms · free in the browser" | "Next: EVA planners rehearse a walk before they fly it, and students plan one with the same NASA data. Every number names its source." |

Changed: 15 Nov 2026, 11:15 UTC. Cold open and one thesis; rules beat; close on the Mars Trek check instead of a vision line.
