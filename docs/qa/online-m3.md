# Online M3 shared state check, 14 November 2026

End-to-end check of shared markers, the sample log and the tool case (#54) on one laptop: `wrangler dev` (workerd, port 8787), the Vite dev server (port 5173) and the PR preview of `feat/online-m3-shared` on Workers Builds. The machine ran other sessions' headless browsers the whole time (load average 33 to 50 on 16 cores), so browser numbers are an upper bound.

## How to rerun

```sh
npm run build                      # once; wrangler dev serves dist/
npm run dev:room                   # terminal 1, port 8787
npm run dev                        # terminal 2, port 5173
ONLY=shared node scripts/room-smoke.mjs                          # straight to the Worker
ONLY=shared node scripts/room-smoke.mjs http://localhost:5173    # through the Vite proxy
ONLY=shared node scripts/room-smoke.mjs <preview URL> <preview URL>
CHROME=/path/to/chrome RACE_GAP=450 node scripts/room-e2e-browser.mjs   # two tabs on ?room=TEST
```

`ONLY=separate ROOM=TEST TAG=x ABSENT=y` places a note labelled `x` in room TEST and checks that no marker there is labelled `y`. Run it against two hosts with swapped tags to show they keep separate rooms.

## Room checks (Node clients, `scripts/room-smoke.mjs`)

| Check | Local Worker | Vite proxy | PR preview |
| --- | --- | --- | --- |
| Marker seen by the other player | 5.1 to 32.8 ms | 4.7 ms | 42.5 to 53.9 ms |
| Resend with the same cid | ignored: the sender gets the stored row back, the other player nothing | same | same |
| 20 simultaneous claims of the same sample | 20/20 with one winner, the loser told who | 20/20 | 20/20 |
| Case taken by A, then asked for by B | B told A has it | same | same |
| New socket for B with the same id (a reload) | 1 marker, 20 samples, case with A; welcome 1,571 bytes | same | same |

The whole M1 smoke still passes locally (27 checks). Two checks in the script needed fixes: the race check missed the loser's `ok:false` when it arrived right behind the broadcast (preview showed 11/20 before the fix, 20/20 after), and the hibernation check assumed join order for two players who join at the same moment.

## rowsWritten in the real storage

The first local run showed markers reaching only their sender. Logging `cursor.rowsWritten` in workerd gave 2 for a new marker and 2 for a new sample, and 0 on conflict: the storage counts the write to the UNIQUE `client_id` index and the TEXT primary key index too. The handlers now test `rowsWritten > 0`, and `worker/test/fakeCtx.js` counts index writes the same way, so a test that expects exactly 1 fails.

## Two browser tabs (`scripts/room-e2e-browser.mjs`)

Headless Chromium 1247 with software WebGL, both tabs on `http://localhost:5173/?room=TEST`. Tab A marks a find the way `markFind` does (a store write), and tab B times its arrival in its `shared` slice. With rendering at full rate the software renderer held each tab's main thread for seconds, so this run drew one frame per second (`SLOW_RAF=1000`). The network path is unchanged by that.

| Check | Result |
| --- | --- |
| 10 markers from A seen in B | 12, 14, 14, 16, 16, 18, 19, 30, 159, 733 ms; median 18 ms, all under 1 s |
| A takes a sample, then B claims it | A `ok`, B refused with A's id and the notice `sample-taken` |
| 20 claims of the same sample from both tabs, 450 ms apart | 20/20 with exactly one winner |
| A's partner sets the case down | B shows A as case holder |
| Reload B | 56 markers, 52 samples and the case holder before; 58, 52 and the same holder after, same player id. The two extra markers came from the separation runs placed in TEST at the same time |

An earlier run at full frame rate had a slow tail (930, 2,475 and 5,259 ms) with a median of 41 ms. In the T3 preview tabs, which run hidden at about one task per second, the room got each marker about 10 ms after tab A sent it, and tab B's raw socket listener fired 0.7 to 1.1 s later. That delay is the tab, not the room.

With claims sent back to back, claims 6 to 10 in each second come back `ok` on both tabs. That is the client's cap of 5 actions per second: past it, `claimSample` queues the claim and lets the scoop go ahead, and the room's answer later shows the notice to the loser. A player cannot click five samples a second, so the test spaces them.

## Separate rooms

| Run | Result |
| --- | --- |
| Note `local-1794721332` in TEST on the local Worker, then note `preview-1794721332` in TEST on the preview | the preview's TEST has only its own note |
| Then TEST on the local Worker again | 58 markers, `local-...` among them, no `preview-...` |
| Room TESU on the local Worker | only its own marker |

## Not checked

- Screenshots. Under this load the software renderer did not get past the start screen within 45 s at one frame per second, so `docs/qa/img/` has nothing new. The drawing code (`src/hud/sharedMarkers.js`, the minimap and `engine.setFinds` colour) is covered by unit tests only.
- The scoop click itself in a browser. The claim the engine makes goes through `claimSample`, which the tab test called directly; the engine side (`claiming` phase, refusal) has no browser check.
