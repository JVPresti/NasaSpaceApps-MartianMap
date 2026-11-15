# Deploy

The app runs on Cloudflare Workers, configured in [`wrangler.jsonc`](../wrangler.jsonc). Cloudflare serves the `dist/` folder that `npm run build` produces as static files. The Worker code in [`worker/`](../worker) runs only for `/api/*` (`run_worker_first`), which today is one route: the WebSocket of an online room (see [Rooms](#rooms)). Every other path is a static file and never runs Worker code.

Production: https://martian-map.fernando-haro-c.workers.dev

## How it deploys

Workers Builds, Cloudflare's CI, watches this repository through the Cloudflare GitHub app.

- A merge to `main` runs `npm run build`, then `npx wrangler deploy`. The production URL updates about a minute later.
- A pull request runs `npm run build`, then `npx wrangler preview`. Cloudflare posts a comment on the pull request with the preview URL and updates it on every push to the branch. Open that link to review a change without checking out the branch.
- A failed build shows up as a failed check on the pull request or the commit. The build log is linked from that check.

`vite.config.js` deletes the files listed in `NOT_DEPLOYED` from `dist/` after the build. Today that is `terrain_tiles.glb` and `terrain_tiles.json` (1.7 MB), which the Blender scripts use and the app does not.

Unknown paths return `index.html` with status 200 (`not_found_handling: "single-page-application"`), so client-side routes work on reload.

## Limits that matter here

The account is on the Workers Paid plan ($5 a month, already paid for hosting). Figures as of November 2026. Included amounts are per account, shared with anything else on it. Online play and its costs: [IMPLEMENTATION_PLAN.md section 9.10](IMPLEMENTATION_PLAN.md#910-capacity-and-cost).

- 25 MiB per static file. Our largest served file is 2.4 MB.
- 100,000 files per deploy. We serve about 50.
- 6,000 build minutes per month, 6 builds at a time, 20 minutes per build. A build takes under a minute.
- Requests for static files are free and unlimited. They never run the Worker.
- Worker requests: 10 million a month included, then $0.30 per million. Each room connection is one.
- Durable Object requests: 1 million a month included, then $0.15 per million. Each connection is one, and every 20 incoming WebSocket messages are one. Outgoing messages and pings answered by the auto-response are free.
- Durable Object duration: 400,000 GB-s a month included, then $12.50 per million GB-s. A room is billed only while it is awake (128 MB, 450 GB-s per hour). An idle room hibernates.
- SQLite in Durable Objects: 50 million rows written, 25 billion rows read and 5 GB-month stored included.
- A Durable Object has a soft limit of 1,000 requests per second. A full room at the room's cap is 6 x 15 = 90.
- A socket attachment holds up to 16 KB. A crew entry is under 200 bytes.

## Rooms

Online play (#52 to #55) gives each room one Durable Object of the `Room` class. The room code is the object's name, so `ABCD` always reaches the same instance. The design is in [IMPLEMENTATION_PLAN.md section 9](IMPLEMENTATION_PLAN.md#9-stretch-players-online).

- [`worker/index.js`](../worker/index.js) accepts only `GET /api/room/:code` with `Upgrade: websocket`. The code is four letters A to Z without I and O, in any case; the Worker turns it to upper case. It checks the `Origin` header: the request's own host (production, every preview, `wrangler dev`) or, when the Worker itself runs on localhost, `localhost` and `127.0.0.1` on any port. A page on someone's localhost cannot open production or preview rooms. Then it calls `ctx.exports.Room.getByName(code)`. There is no `durable_objects.bindings` entry, so each PR preview gets its own Durable Object namespace with no `previews` block.
- [`worker/room.js`](../worker/room.js) is the `Room`. It uses the WebSocket Hibernation API and keeps nothing in memory it cannot rebuild: the crew is each socket's attachment, and the mission start time and seed are rows in its SQLite `meta` table. Pings are answered by `setWebSocketAutoResponse` and do not wake it.
- [`worker/handlers/shared.js`](../worker/handlers/shared.js) handles `mk`, `smp` and `case` (#54). Markers go in the `markers` table (one row per client id, at most 200), samples in `samples` (the first insert of a sample id wins) and the case holder in `meta` (`case_holder`). Each handler writes and replies in the same turn, with no `await` in between. The real storage counts index writes in `cursor.rowsWritten`, so a new marker or sample reads 2 and a conflict reads 0; the handlers test for more than 0.
- [`src/net/protocol.js`](../src/net/protocol.js) holds the messages, limits and close codes for both sides.

| Response or close code | Meaning |
| --- | --- |
| 404 | Not `/api/room/:code` |
| 400 | Bad room code |
| 405 | Not a GET |
| 426 | No `Upgrade: websocket` header |
| 403 | Missing or foreign `Origin` |
| 1001 `stale` | No ping for 30 s. The client reconnects. |
| 1008 `rate limit` | Above 45 messages per second for 5 s. The room drops anything above 15 per second (bursts of 30) before that. |
| 1009 `message too big` | A message over 4,096 bytes |
| 4001 `room full` | Already 4 surface or 2 habitat players, or 12 sockets at once. The client does not retry. |
| 4002 `replaced` | The same player connected again (a reload or a stuck socket). The client does not retry. |
| 4003 `hello first` | The first message was not a valid `hello` |

### Run a room locally

Two processes, so two browsers on one laptop can share a room:

1. `npm run build` once, because `wrangler dev` serves `dist/` and stops if it is missing.
2. `npm run dev:room` runs the Worker and the rooms in a local `workerd` on port 8787.
3. `npm run dev` runs Vite. `vite.config.js` proxies `/api` to port 8787 with `ws: true` and leaves the browser's `Origin` (`http://localhost:5173`) as it is, which the Worker accepts as localhost.
4. Open `http://localhost:5173/?room=TEST` in two windows. Use one normal and one private window, or two tabs: the player ID lives in `sessionStorage`, so every tab is its own player and a reload keeps the same one. Each window shows the join panel: type a name, pick Surface crew or Habitat and press Join the room. Nothing connects before that. Without a code, Play online on the start screen takes a code or makes a new one.

Phones or a second laptop on the same Wi-Fi: `npm run dev -- --host`, then open the laptop's address with `?room=TEST`.

Local rooms keep their storage in `.wrangler/state` (ignored by git). Delete that folder to reset every local room. `node scripts/room-smoke.mjs` runs the room checks of [docs/qa/online-m1.md](qa/online-m1.md) against a running `dev:room`.

### Previews and production

A PR preview has its own rooms. Room `ABCD` on a preview is not room `ABCD` in production, and preview storage is deleted with the preview. Testers must open the same URL, not only the same code. Cloudflare does not create version URLs for a Worker with a Durable Object; the `wrangler preview` comment on each pull request is a separate feature and keeps working.

The `v1` migration in `wrangler.jsonc` created the `Room` class. Never edit it. Renaming or removing the class takes a new migration entry (`renamed_classes`, `deleted_classes`).

## Git LFS

Only `blender/**` belongs in Git LFS (#7). Keep every file under `public/` as a regular Git file, including `.glb` models. The build does not run `git lfs pull`, so an LFS-tracked file under `public/` would deploy as a 130-byte pointer and the model would fail to load. If a served file ever has to move to LFS, change the build command in the Cloudflare dashboard to `git lfs pull && npm run build`.

## Access

The Cloudflare account belongs to Scalaptia. Account members:

| Person | Role |
| --- | --- |
| Scalaptia | Super Administrator |
| JVPresti | Super Administrator |

Super Administrators can change settings and invite members. Workers Platform Read-only lets a teammate see deploys and build logs without changing anything. Ask a Super Administrator for an invite.

The GitHub side of the connection is the Cloudflare GitHub app, which JVPresti installed on this repository as its owner.

## Redeploy

- Retry a failed build: Cloudflare dashboard, Workers & Pages, `martian-map`, Deployments, then Retry build on the failed entry.
- Roll back production: same Deployments page, pick an older version, then Rollback.
- Deploy by hand from a machine logged in with `npx wrangler login`: `npm run build && npx wrangler deploy`. Use this only when Workers Builds is down, because it deploys whatever is in your working tree.
