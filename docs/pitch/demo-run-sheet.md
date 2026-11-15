# Live demo run sheet

> **Confirm with the Ensenada organisers:** how long the pitch is, whether Q&A is separate, and whether we can plug in our own laptop. This sheet has three cuts of the same demo: 2:20 inside the 5-minute pitch, 1:15 inside the 3-minute pitch, and the full 6:30 inside the 8-minute version.

The demo is the first mission from PR #282 (`docs/DEMO.md`, keiwv): a 55 m sortie from the airlock to **S1 · light-toned patch**, with the dust storm and the radiation alert brought forward so both play before the crew is home. Every key and button below was checked against the #282 code (`src/`, `docs/CONTROLS.md` on that branch). Timings come from keiwv's measured run (15 Nov, RTX 5070, 1366 x 768): stop reached at T+79 s, storm at T+97 s, radiation at T+113 s, back in the habitat at T+173 s. Walking straight to the stop, without the find detour, saves about 25 s.

Where `main` and #282 differ, this sheet follows #282 and says so in a note.

## Before the pitch (10 minutes before)

| Step | Do | Check |
|---|---|---|
| 1 | Plug the demo laptop into power and the projector. Set the display to duplicate, 1920 x 1080. | The projector shows the desktop |
| 2 | Switch the keyboard layout to English (US). | The backtick key types ` (on a Spanish layout it is a dead key, and the Events strip needs it) |
| 3 | Open Chrome and go to the demo URL with `?debug=1` (below). Wait on the start screen until the main button reads **Open the mission table** instead of "Loading scene". | About 20 s on the GPU laptop |
| 4 | Language: open the table once, press **Esc**, **Settings**, set **Idioma / Language** to **Español** for the local judges, then reload the page. The choice is saved in the browser. | The start screen says "Abrir la mesa de misión" |
| 5 | Press **F11** for full screen. Turn the laptop sound on at about 30 %: the suit audio (fans, breathing, alarms) helps the storm beat. | |
| 6 | Open the backup video (recorded from the app by the presentation mode, `feat/present-mode`) in a second browser tab, paused at 0:00, and the stills folder `docs/pitch/fallback/stills/` in an image viewer. | One click plays it |
| 7 | Close every other app, notification and chat. | |

**Demo URL.** Until #282 merges, the preview build: `https://feat-short-mission-dynamic-routes-martian-map.fernando-haro-c.workers.dev/?debug=1`. After it merges: `https://martian-map.fernando-haro-c.workers.dev/?debug=1`. `?debug=1` adds a small "Events `" chip in the bottom corner. Leave it closed; it is only the emergency trigger in beat D7.

**No network.** The app makes no live calls to NASA, so it runs offline. The night before, on the demo laptop: check out the demo branch, `npm ci`, `npm run build`, `npm run preview`, and open `http://localhost:4173/?debug=1` as the offline URL.

## Cut A: 2:20 inside the 5-minute pitch

Uses DEMO.md segments 2, 3, 4, 5, 6 and 7, cut short. Segment 1 (start screen) is reduced to one click, segments 8 to 11 (radiation, habitat, debrief, sources) are told in one sentence and shown on the slides that follow.

| Beat | Time | DEMO.md | Do | Say (Spanish script line, short) | If it fails |
|---|---|---|---|---|---|
| D1 | 0:00 | 1 | Click **Abrir la mesa de misión** (Open the mission table). | "Esta es la mesa de misión. Todo lo que ven es Jezero, con datos de la NASA." | WebGL error or blank screen: switch to the backup video, keep talking over it; no video, step through `fallback/stills/` from `D1-table-site.jpg` |
| D2 | 0:05 | 2 | **Siguiente: ruta** (Next: route). Click the **Terreno** (Terrain) layer. Point at the legend line that says what the layer decides. | "Cada capa dice qué decide. Terreno: la pendiente del modelo de HiRISE. La ruta rodea la zona amarilla y nunca cruza la roja." | Layer does not paint: say the line over the still `fallback/stills/D2-terrain-layer.jpg` |
| D3 | 0:25 | 3 | In **Objetivo** (Goal), choose **Muestrear Cheyava Falls**. Wait for the route to redraw (2 to 5 s). Then set it back to **Primera salida** (First sortie). | "Si la tripulación pide ir a la roca donde Perseverance encontró una posible biofirma, la ruta crece a 930 metros y el plan recalcula tiempo y oxígeno. Hoy hacemos la primera salida: 55 metros." | The planner hangs over 8 s: leave the goal on First sortie and go on; still `D3-goal-cheyava.jpg` |
| D4 | 0:45 | 4 | Tab **Traje** (Suit): point at **Salir** (Go) and the conditions outlook. Click **Empezar la EVA** (Begin EVA), then **Empezar a caminar** (Start walking). Click the scene once to capture the mouse. | "El plan dice que sí podemos salir. Empezamos." | No Go (No-go shown): the goal is still Cheyava Falls, set it back to First sortie |
| D5 | 0:55 | 5 | Hold **W** and steer with the mouse toward the waypoint marker (S1). Do not stop to mark a find. About 55 s of walking. | "Arriba a la izquierda, el número que importa: el margen de regreso. Es el oxígeno que me sobra después de volver caminando al hábitat y guardar la reserva de 30 minutos. Cada paso de subida lo reduce. Abajo, la navegación: Marte no tiene GPS, así que la posición se fija comparando el terreno con el mapa de HiRISE." | Frame rate drops or the astronaut stalls: keep walking, it still arrives. Lost the direction: the minimap (top right) shows the route in cyan |
| D6 | 1:50 | 6 | At S1: **P** (photo), click the ground at your feet (sample), **E** (stow). | "Llegamos. Foto, muestra, guardar." | Skip sampling if it does not respond; the storm only needs you at the stop |
| D7 | 2:05 | 7 | The dust storm starts by itself about 20 s after arriving. Read the banner. Press **M**: the table opens on Route with the new route home. Press **M** again to go back. | "Tormenta de polvo. La opacidad viene de la tormenta global de 2018 medida por Curiosity. El sistema recalcula la ruta al hábitat, y el margen se ajusta." | No storm by 2:10: press **`**, click **Dust storm**, press **`** again. Still no storm: say the line over `D7-storm-walk.jpg` and `D7-storm-plan.jpg` |
| | 2:20 | 8-11 | Leave the app as it is and go back to the slides. | "Quince segundos después llega la alerta de radiación, con dosis reales de Curiosity. Al volver, el resumen compara la ruta caminada con la aprobada." | |

`main` note: on `main` the storm comes at T+480 s and there is no first sortie. Do not run Cut A on `main`.

## Cut B: 1:15 inside the 3-minute pitch

| Beat | Time | Do | Say |
|---|---|---|---|
| B1 | 0:00 | **Abrir la mesa de misión**, **Siguiente: ruta**, layer **Terreno** | "La ruta sale del modelo de terreno de HiRISE y rodea las pendientes peligrosas." |
| B2 | 0:15 | Tab **Traje**, **Empezar la EVA**, **Empezar a caminar**, click the scene | "El plan dice que sí podemos salir." |
| B3 | 0:25 | Hold **W** toward S1 for about 20 s | "El margen de regreso, arriba a la izquierda, baja con cada paso." |
| B4 | 0:45 | Press **`**, click **Dust storm**, press **`**. Wait for the banner. Press **M**, then **M** | "Disparo la tormenta ahora para ahorrar tiempo. La ruta se recalcula al hábitat." |
| | 1:15 | Back to slides | |

Say that you fire the storm by hand. A judge who sees the Events strip will ask.

## Cut C: the full demo inside the 8-minute version

Run DEMO.md exactly, segments 1 to 11, with keiwv's measured times. The script in `script-8min-es.md` wraps 0:30 of story before it and 0:50 after it.

| # | Segment | Measured | Key controls (verified on #282) |
|---|---|---|---|
| 1 | Start screen | 0:13 | **Open the mission table** |
| 2 | Table: site and layers | 0:53 | **Next: route**; layers **Image**, **Terrain**, **Rocks**, **Outcrop**, **Radio**, **Exposure**, **Rover** |
| 3 | Needs → route | 1:00 | **Goal** select; **Cautious** / **Standard**; stop card; profiles **Fastest**, **Gentlest**, **Radio** |
| 4 | Outlook, go / no-go, Begin EVA | 0:23 | **Hazards**, **Suit**, **Begin EVA**, **Start walking** |
| 5 | Walk out with a find | 1:19 | **W A S D**, mouse; hold **Q** 2 s on light ground, then **Y** |
| 6 | Stop and sample | 0:18 | **P**, click the ground, **E** |
| 7 | Dust storm | 0:16 | **M**, **M** |
| 8 | Radiation and walk back | 1:00 | **M**, **M**, walk into the cabin |
| 9 | Habitat table | 0:06 | **E** Open plan, **M** back, **X** Finish EVA |
| 10 | Debrief | 0:31 | scroll to the route review |
| 11 | Sources | 0:08 | **Sources** |
| | Total | 6:09 | |

`main` note: on `main`, **X** ends the EVA anywhere within 5 m of the airlock, and there is no **E** Open plan. On #282, X works only inside the cabin.

## Fallbacks

| What fails | Do |
|---|---|
| The page does not load (network) | Switch to the offline URL `http://localhost:4173/?debug=1` |
| WebGL fails, black scene, or under 10 fps | Play the backup video and narrate over it. Say once that the live build needs the GPU, then go on |
| The pointer will not capture | Drag on the scene to look (the app offers drag-to-look) |
| A key does nothing | The wrist screen may be up and owning the keys: press **R** to lower it |
| The pause menu opens by mistake (Esc) | Click **Continuar** (Resume) |
| A stop card covers the view | **Enter** or **Esc** closes it |
| Everything fails | Stills in `fallback/stills/`, in beat order, one per beat |

The stills were captured from the real #282 build (commit 989970f) with keiwv's `npm run measure:demo` on this machine's RTX 3070, 1920 × 1080, English. Names start with the beat they replace (D for cut A, S for the other DEMO.md segments). Re-take them on the demo laptop with `npm run measure:demo -- --headed --viewport 1920x1080 --shots <folder>` if the app changes. `S1-start-AI-video.jpg` shows the AI-generated start video: do not use it in the submission video or the deck.

## Re-check after these merge

The app changes today. When these branches merge, walk the run sheet again and fix these steps.

- **`feat/habitat-flow`** (spawn in the habitat, plan at the table, leave through the airlock): D1 and B1 change, because the start may put you inside the habitat instead of at the table. Check how you reach the mission table (likely **E** at the table), and how long the walk out through the airlock adds to D5. The 55 m and the T+75 s storm timing may shift. Segment 9 (**E** / **X** in the cabin) may change too.
- **HUD restyle (`exp/hill-climb-quality`)**: the margin pill, the navigation line and the minimap may move. Re-check every "arriba a la izquierda" and "abajo" in the Say column, and retake the stills in `fallback/stills/` and the deck screenshots.
- **#282 itself**: if the first mission's names change (S1 · light-toned patch, First sortie), update the script and the slides together.
