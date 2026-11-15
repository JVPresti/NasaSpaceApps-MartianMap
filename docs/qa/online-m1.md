# Online M1 room check, 14 November 2026

End-to-end check of the room (#52) on one laptop: `wrangler dev` (workerd, port 8787) and the Vite dev server (port 5173), with `.wrangler/state` deleted first. Every check passed. The machine was under heavy load from other processes during the run (load average around 20), so the latencies below are an upper bound for local play.

## How to rerun

```sh
npm run build                      # once; wrangler dev serves dist/
npm run dev:room                   # terminal 1, port 8787
npm run dev                        # terminal 2, port 5173
node scripts/room-smoke.mjs                          # straight to the Worker
node scripts/room-smoke.mjs http://localhost:5173    # through the Vite proxy
```

`ONLY=join|seats|refuse|flood|hibernate` runs one group. `IDLE_MS` sets the idle time of the hibernation check (default 15000). The script uses Node 24's built-in WebSocket, which can set the `Origin` header, and has no dependencies. It exits 1 if any check fails.

## Results

| Check | Result |
| --- | --- |
| Crew join seen by the other player | 1.5 ms after the joiner sent hello (1.8 ms through the proxy) |
| Crew leave seen after a close | 34.9 ms after `close()` (33.9 ms through the proxy) |
| 4 surface players | colours 0, 1, 2, 3 |
| 5th surface player | closed 4001 `room full` |
| 2 habitat players next to 4 surface | seated, colour `null`, crew of 6 |
| 3rd habitat player | closed 4001 `room full` |
| Same player id on a new socket | old socket closed 4002 `replaced`, new one keeps colour 1 |
| Clock offsets of 6 clients (5 samples, shortest round trip) | -0.5, 1.0, 1.0, 1.0, 0.0, 0.0 ms, round trips 1 to 4 ms, spread 1.5 ms |
| `start` from two different players | same `startedAt` and seed on all 6 |
| Good upgrade | 101 |
| Bad code `IOIO` | 400 |
| Foreign Origin `https://evil.example` / no Origin | 403 / 403 |
| `/api/rooms` | 404 |
| Message before hello | closed 4003 `hello first` |
| 5 KB message | closed 1009 `message too big` |
| 60 msg/s flood | 353 sent, 114 answered (20 per second: the 30 burst plus 15 per second), closed 1008 `rate limit` after 5.7 s |
| 20 s idle with pings only | pings answered (3 pongs each), then a third player joined and got the full crew (`surface/0, habitat/null, surface/1`) and the stored start time and seed |

### Hibernation

For this run only, the `Room` constructor logged its time (the line was removed before the commit). Room `DZRY` in the direct run:

```text
TEMP Room constructor 2026-11-15T02:50:35.666Z    first player connects
[wrangler:info] GET /api/room/DZRY 101 ...         second player
                                                    20 s of pings only, answered by the auto-response
TEMP Room constructor 2026-11-15T02:50:55.723Z    third player connects: the room was evicted and is built again
[wrangler:info] GET /api/room/DZRY 101 ...
```

The proxy run shows the same for room `DTTG` (02:51:02 and 02:51:17, 15 s idle). The new instance rebuilt the crew from the socket attachments and the start from SQLite, as the results table shows. In production the eviction delay is Cloudflare's; locally workerd evicted the idle room in under 15 s.

The Vite log shows `ws proxy error: read ECONNRESET` when the script tears sockets down abruptly (the 1009 and 1008 closes). It is the proxy reporting the reset; nothing failed.

## Browser

In the T3 preview browser (Chromium) against `npm run dev`:

- `http://localhost:5173/`: 250 resources loaded, none under `/api/`, no module from `src/net/`. `online.status` stays `'off'` and the slice keeps its defaults. `src/net/` is the only code that opens a room socket, so no socket was created.
- `http://localhost:5173/?room=IOIO`: the same 250 resources, nothing under `/api/` or `src/net/`, and the console warning `online: ignoring ?room=IOIO: a room code is four letters A to Z without I and O`.
- `http://localhost:5173/?room=test` and `?room=TEST` in two tabs: both reached `status: 'open'` in room `TEST`, with different player ids, colours 0 and 1, the same two-entry crew list, offsets 0 and -1 ms, round trip 2 ms. The tab loaded `src/net/index.js`, `clock.js`, `identity.js`, `room.js`, `protocol.js` and `rateLimit.js`.
- Closing the second tab: the first tab's crew list dropped to one entry 1.6 s after the timer started, and that time includes the browser tool's own call to close the tab.
- Reloading the first tab: same player id and colour 0, one crew entry (the room replaced the old socket).

Puppeteer could not launch Chrome on the loaded machine, so the browser check used the preview tool instead of a script.

## Build chunks

`npm run build` puts `src/net/` in its own chunk, `dist/assets/net-*.js` (10.4 kB, 4.4 kB gzip). The main chunk contains none of its strings (`/api/room/`, `hello first`, `room full`, `marswalk.online.playerId`). It holds only the room code pattern copied into `src/onlineLink.js` and the lazy `import("./net-*.js")`.

## Full output of the direct run

```text
room smoke test against ws://localhost:8787 with Origin http://localhost:5173
PASS crew join reaches the other player within 2 s  1.5 ms after B sent hello
PASS welcome lists both players  Smoke f8z6/0, Smoke xclr/1
PASS crew leave reaches the other player within 2 s  34.9 ms after close()
PASS 4 surface players get colours 0 to 3  0,1,2,3
PASS 5th surface player is closed with 4001 room full  4001 room full
PASS 2 habitat players fit next to 4 surface  crew 6
PASS 3rd habitat player is closed with 4001  4001 room full
PASS same player id again replaces the old socket with 4002 and keeps its colour  4002 replaced, colour 1
PASS clock offsets of 6 clients agree within 100 ms  -0.5ms/rtt 1ms, 1.0ms/rtt 4ms, 1.0ms/rtt 2ms, 1.0ms/rtt 2ms, 0.0ms/rtt 2ms, 0.0ms/rtt 2ms; spread 1.5 ms
PASS start reaches all 6 with one start time and seed; a second start repeats it  startedAt 1794711029619, seed 15949619
PASS good upgrade answers 101
PASS bad room code is refused with 400  400
PASS foreign Origin is refused with 403  403
PASS missing Origin is refused with 403  403
PASS other /api path answers 404  404
PASS a message before hello closes with 4003  4003 hello first
PASS a 5 KB message closes with 1009  1009 message too big
PASS a 60 msg/s flood is dropped above the cap  353 sent, 114 answered in 5.7 s (20.0/s)
PASS then closed with 1008 after about 5 s  1008 rate limit after 5.7 s
idle 20 s with pings only in room DZRY (watch the dev:room log for the Room constructor)
PASS pings were answered while idle  pongs 3/3
waking room DZRY at 2026-11-15T02:50:55.716Z
PASS after the idle period the crew list is intact  surface/0, habitat/null, surface/1
PASS and the mission start survived  startedAt 1794711035711, seed 1630056496

22/22 checks passed
```

## On the PR preview

Run on 2026-11-15 against the Workers Builds preview of this branch, a real Durable Object on Cloudflare: `node scripts/room-smoke.mjs https://feat-online-m1-room-martian-map.fernando-haro-c.workers.dev https://feat-online-m1-room-martian-map.fernando-haro-c.workers.dev`. 22 of 22 checks passed.

| Check | Result |
| --- | --- |
| Crew join seen by the other player | 27.8 ms after hello |
| Crew leave seen by the other player | 27.5 ms after close |
| Clock offsets of 6 clients | 299.5 to 304.0 ms, spread 4.5 ms. The offset is this laptop's clock skew against Cloudflare; only the spread matters. |
| `t` round trip | 22 to 24 ms |
| Seats | colours 0 to 3, 5th surface 4001, 2 habitat fit, 3rd habitat 4001, same id 4002 with its colour kept |
| Refused | bad code 400, foreign and missing Origin 403, other `/api` path 404, message before hello 4003, 5 KB message 1009 |
| Flood at 60 msg/s | 114 of 338 answered (19.9/s), closed with 1008 after 5.7 s |
| Idle 15 s with pings only | 2 of 2 pongs, crew list and mission start intact afterwards |
