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

| # | Time | Beat | Camera idea | On screen (EN / ES) | Presenter says (ES, from script-5min-es.md) |
|---|---|---|---|---|---|
| 0 | optional, +0:20 | Legacy | Still: a photo of last year's team at the Ensenada event (team's own photo), then the new team name types over it | "2025: 1st of 17 in Ensenada · Global Nominee" / "2025: 1.º de 17 en Ensenada · Nominados globales" then "Round two." / "Segunda vuelta." | "El año pasado ganamos Ensenada con NASA Explorer. Volvimos refritos, nueva generación." Only if the team picks it in rehearsal; the 5:00 budget then loses 0:20 from beat 7 |
| 1 | 0:00-0:06 | Title | Mars globe turning slowly, lit from the side | "Marswalk" / tagline "Can I still walk home?" / "¿Todavía puedo volver a casa?" Team name small | "Somos Los Frijolitos Espaciales Refritos Nueva Generación, de Ensenada. Esto es Marswalk." |
| 2 | 0:06-0:36 | Problem | Globe zooms to Jezero crater, then into the 1.4 × 1.5 km HiRISE tile; the habitat appears as a dot | Three lines, one at a time: "8 h suit limit" / "8 h de traje"; "30 min O2 reserve" / "30 min de reserva de O2"; "No GPS on Mars" / "Sin GPS en Marte" | "En la Luna, si algo salía mal, el astronauta volvía caminando al módulo. En Marte será igual, pero más lejos y sin nadie que vaya por ti. El traje aguanta ocho horas, la NASA guarda treinta minutos de oxígeno de reserva, y no hay GPS. Los mapas que existen están hechos para ver regiones desde órbita. Ninguno responde: ¿todavía puedo volver a casa?" |
| 3 | 0:36-1:00 | The walkback zone | Top-down HiRISE. A cyan zone around the astronaut covers everywhere they can reach and still walk home. It shrinks as the O2 counter drains along the route, and snaps to a thin corridor home when the radiation alert hits; the route turns back to the habitat | "Everywhere you can reach and still get home" / "Todo lo que alcanzas y aún regresas"; counter "O2 left 205 g → …"; at the snap: "Radiation alert · head home" / "Alerta de radiación · regresa" | "Marswalk responde eso todo el tiempo. Lo llamamos margen de regreso: el oxígeno que te sobra después de volver caminando al hábitat y guardar la reserva. Subir lo reduce, las rocas lo reducen, una tormenta lo reduce. Les enseñamos." |
| 4 | 1:00-3:25 | Live demo | Handoff: the camera settles on the mission table's Route step of the First sortie, and the presentation hands control to the presenter | Nothing extra. The app's own beat lines carry it | Demo cut A, `demo-run-sheet.md` (2:25): table and Terrain layer, goal to Sample Cheyava Falls and back, Begin EVA, walk to S1, sample, dust storm and re-plan |
| 5 | 3:25-3:58 | NASA data | Back to top-down. Layers stack on the tile, one per line, each labelled with its mission: HiRISE terrain (slope bands), HiRISE image, Perseverance's drives and image pins, then MEDA and RAD as two readouts | "MRO HiRISE · terrain 1 m"; "Perseverance · drives and images"; "MEDA · weather, sol 1187"; "Curiosity RAD · Sept 2017"; "NASA suit tests · O2 per metre". Spanish: same names, verbs translated | "Nada de esto es inventado. El terreno es el modelo de HiRISE, a un metro por píxel. De ahí salen la pendiente, la ruta, la sombra de radio y la posición. Las paradas y las fotos son de Perseverance. El clima es un día real medido por MEDA en Jezero. La radiación son dosis que midió Curiosity en septiembre de 2017. El oxígeno sale de pruebas de trajes de la NASA." |
| 6 | 3:58-4:22 | Measured or simulated | Three tags appear on real numbers from the HUD: DATA on the 20° limit, DERIVED on a slope, SIM on the 1 m/s walking speed. Then one big number | "DATA · DERIVED · SIM"; "0.14 m RMS vs NASA Mars Trek" / "0.14 m RMS contra NASA Mars Trek"; "Gale crater, not Jezero" / "Cráter Gale, no Jezero" | "Cada número en pantalla dice de dónde viene. DATA es medido, DERIVED lo calculamos nosotros, SIM es una suposición nuestra. Comparamos nuestro terreno con el de NASA Mars Trek: catorce centímetros de diferencia en todo el mapa. Y cuando un dato no es de Jezero, como la radiación de Gale, la pantalla lo dice." |
| 7 | 4:22-5:00 | Next and team | Camera pulls back from the tile to the globe. Team names and the QR code to the demo | "Heart rate · crews online · any HiRISE site" / "Ritmo cardiaco · tripulaciones en línea · cualquier sitio HiRISE"; team names; QR | "Lo siguiente: un sensor de ritmo cardiaco real que mueva el consumo de oxígeno, tripulaciones en línea, y cualquier sitio de Marte con modelo de HiRISE. Este año queremos que la primera caminata en Marte se planee con un mapa así. Pruébenlo con el código QR. Gracias." |

## Notes for the presentation thread

**Beat 3, the walkback zone.** The app shows this budget as one number, the margin (`MARGIN NOW · home in`), not as an
area. Draw the zone with the app's own code so it is honest: `buildCostGrid` (20° no-go cells), `planRoute`, and the
suit model (`constantEffortSpeed`, `metabolicPowerW`, `o2RateGs`, the 20 % walkback pad and the 30 min reserve).
Two Dijkstra passes: from home over reversed edges (the walk back from every cell), and from the astronaut (the walk
out). A cell is in the zone when walk out + walk back + reserve ≤ O2 left. A working reference is
`docs/pitch/tools/walkback-zone.mjs`; it writes per-frame O2, walk-home grams, margin and zone area. The scenario
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

Official beats. Narration in Spanish with English subtitles, or English narration. Full shot list in
`video-30s.md`.

| Time | Beat | Camera idea | On screen | Narration (EN) |
|---|---|---|---|---|
| 0:00-0:02 | Intro | Globe, Mars turning | "Los Frijolitos Espaciales Refritos Nueva Generación · Ensenada" | (music only) |
| 0:02-0:05 | The challenge | Zoom to Jezero | "Martian Map: help astronauts plan a Marswalk" | "How do you walk on Mars and still get home?" |
| 0:05-0:10 | Name and tagline | HiRISE tile, the walkback zone appears | "Marswalk · Can I still walk home?" | "Marswalk shows it, every step." |
| 0:10-0:20 | How it works with NASA data | Route draws on HiRISE terrain; cut to the helmet view with the margin; dust storm and re-plan | "HiRISE terrain · Perseverance images · MEDA weather · Curiosity RAD" | "Real HiRISE terrain sets the route. NASA suit tests set the oxygen. When a storm hits, the way home re-plans." |
| 0:20-0:30 | The future | Pull back to the globe, QR | "Next: heart rate, crews online, any HiRISE site" | "Next, your own heart rate, and any site on Mars. Try it now." |

Changed: first version, 15 Nov 2026.
