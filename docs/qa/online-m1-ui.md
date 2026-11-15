# Online M1 UI check, 15 November 2026

End-to-end check of the join panel, the role choice, the crew list, the shared mission clock and the close-code messages (#52, #55). Two to five real browsers against `wrangler dev` on port 8787, which serves `dist/` and `/api` on one origin. Every check passed.

The final run used headed Chromium on the GPU through WSLg (`QA_GPU=1`). The renderer was `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3070), OpenGL 4.6)`, so the 3D scene rendered behind the table, and the whole run took 94 s. Three earlier runs on SwiftShader took about 12 minutes each and gave the same results, with slower latencies (listed below).

## How to rerun

```sh
NODE_ENV=development npx vite build --mode development   # the script reads window.__missionStore, a dev-only global
npm run dev:room                                          # port 8787
CHROME=/path/to/chrome ROOM=ABCD node scripts/room-e2e-ui.mjs docs/qa/img
QA_GPU=1 CHROME=/path/to/chromium ROOM=ABCD node scripts/room-e2e-ui.mjs docs/qa/img   # GPU through WSLg
```

Use a fresh `ROOM` for each run: the room keeps its mission start. Without `QA_GPU=1` the script uses headless Chrome with SwiftShader (`scripts/qaBrowser.mjs`). It writes `docs/qa/img/e2e-results.json` and the screenshots.

## Results

| Check | Result |
| --- | --- |
| Bad code `?room=IOIO` | the start screen says `"IOIO" is not a room code`; "Open the mission table" still works; no `/api/` request |
| `?room=` before Join | src/net is loaded, `online.status` is `off`, no socket |
| Join, A then B (surface) | A sees B 128 ms after B pressed Join, B sees A 161 ms (SwiftShader runs: 51 to 2825 ms) |
| Crew tab | both names, a colour swatch each, roles, "you" on A's row, code and host |
| Mission clock after A begins the EVA | same mission time on A and B within 1.5 ms (5 reads at one wall time; SwiftShader runs 0.0 to 1.0 ms; one run under load 64.5 ms) |
| B closes its tab | gone from A's crew list after 723 ms (SwiftShader runs 119 to 756 ms) |
| Spanish | join panel reads "Sala en línea", "Equipo de superficie", "Hábitat", "Entrar en la sala" |
| Habitat join | no Begin EVA on the Route tab, the habitat note instead; M keeps the table; crew entry with colour `null` |
| 5th surface player (A plus three socket players) | "Surface crew is full: all 4 seats are taken"; "Join as Habitat" seats it |
| Duplicated tab (same player id from sessionStorage) | the old tab shows "This player joined from another tab"; "Join as a new player" seats it with a new id, both tabs in the room |

The mission clock check reads `(Date.now() - mission.anchorMs) x timeScale` in each page. That is the clock's own formula: while the room's start is known, the anchor is `mission.sharedStartMs`. Both browsers ran on one machine, so their server clock offsets are close to 0. The two-client unit test in `src/online/clockSync.test.js` covers different offsets (0 and -3456.7 ms): mission times stay within 1 ms.

The first SwiftShader runs found three problems in the script, not in the app. Filler sockets that never sent `ping` were closed by the room as stale after 30 s. A tab rendering Walk on SwiftShader starved its own pings. And the "both tabs seated" check ran before the welcome arrived. The script now pings, takes A back to the table after the clock check, and waits up to 10 s for the crew list.

## Screenshots, 1366 x 768

| Join panel | Crew tab | Room full |
| --- | --- | --- |
| ![Join panel](img/online-m1-join.png) | ![Crew tab](img/online-m1-crew.png) | ![Room full](img/online-m1-room-full.png) |

| Habitat seat, crew tab | Replaced |
| --- | --- |
| ![Habitat](img/online-m1-crew-habitat.png) | ![Replaced](img/online-m1-replaced.png) |
