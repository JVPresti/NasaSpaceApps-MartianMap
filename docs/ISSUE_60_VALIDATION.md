# Issue #60 · HUD minimap: validation report

Status: implementation, review fixes and the pending browser recheck are complete on
`feat/issue-60-hud-minimap`. Two independent code reviews finished and both found the same material
defect: the route tracker was created inside the minimap effect while App unmounts the HUD in Plan mode,
so the walked progress was lost on every Walk -> Plan -> Walk round trip. That lifetime is fixed.
Automated checks pass locally after the fix (29 minimap tests, lint, build; the full suite has only the
known credits CRLF failure). The parent recheck measured the final 396 px frame and 394 px canvas at
2560x1440, the 13.464 px legend with a 10.6 px gap above the environment strip, the short-window
breakpoint at 1440x720, the redraw budget, and the walked-progress persistence across Plan and Walk.
Section **Parent recheck after the final CSS fix** holds that data. The branch is ready for its pull
request; nothing was pushed before the owner asked for it.

## What was built

| Area | File |
|---|---|
| HUD mount, canvas sizing, store subscription, image/shelter loading, cleanup | `src/hud/Minimap.jsx` |
| Circle size, position, legend and responsive frame | `src/hud/minimap.css` |
| Tile UV, heading-up projection, cardinals, scale, hazard/shelter filters | `src/hud/minimapGeometry.js` |
| Canvas painter (photo, route split, markers, rings, scale) | `src/hud/minimapDraw.js` |
| Local route progress using the `routeGlow` rule | `src/hud/minimapRoute.js` |
| 10 redraws per second budget for store/image/resize | `src/hud/minimapRedraw.js` |
| Store contract `hazards.zones` | `src/state/store.js`, `docs/STATE_AND_ENGINE.md` |
| Tracker lifetime across Walk and Plan, HUD mount | `src/App.jsx`, `src/hud/Hud.jsx` |

## Review fixes applied after the parent's browser session

1. **Waypoint near the centre** (`src/hud/minimapDraw.js`). `drawWaypoints` used to hide markers closer
   than `r * 1.4` to the map centre so they could not be read as the player marker. The requirement
   excludes only the player marker from #21, not real waypoints: the cull was removed. Every waypoint
   with finite `x`/`z` inside the circle now keeps its numbered marker, including one exactly under the
   centre. No player marker or uncertainty ring was added.
2. **Map size cap** (`src/hud/minimap.css`). `--map-size` was `clamp(120px, 27.5vh, 340px)`, so a
   2560x1440 window stopped at 340 px instead of the reference 27.5 vh = 396 px. The upper bound is now
   480 px while the fluid value stays 27.5 vh: 297 px at 1080 high and 396 px at 1440 high. `top: 23.5vh`,
   `right: 7.8vw` and the legend above the 54 vh environment strip are unchanged.
3. **Tracker lifetime** (material defect, both reviews). `Minimap.jsx` created `createRouteProgress()`
   inside its `useEffect`, while `App` only renders `<Hud />` in Walk mode. Leaving Walk for Plan
   unmounted the HUD and the next Walk mount started a fresh tracker at 0, although `route.path` had not
   changed. The tracker now belongs to `App`: one instance per app session (`useState` lazy initialiser),
   passed through `Hud` to `Minimap`. The minimap calls `setPath` on mount and when `route.path` changes;
   `setPath` compares route content, so a remount with the same points keeps the progress and only new
   route content resets it. There is no module-level singleton and no DOM hack; the effect still owns and
   cleans up the store subscription, `fetch`, `ResizeObserver`, window listener, image handlers and the
   redraw timer. A full page reload still starts at 0.
4. **Canvas logical size** (`src/hud/Minimap.jsx`). The plot used the wrapper's `clientWidth` (396 px at
   1440 high) although the canvas box is 2 px smaller because of the frame border (394 px). It now reads
   `canvas.clientWidth`, so the logical size, the backing store and the drawing match the element the
   bitmap is stretched over. The `ResizeObserver` watches the canvas for the same reason.
5. **Neutral ARIA label** (`src/hud/Minimap.jsx`). The canvas label listed route, waypoints, habitat,
   refuges and hazard zones as if all were always on the map, but route, refuges and zones can be absent.
   It now says only that the map is centred on the astronaut.
6. **Legend headroom** (`src/hud/minimap.css`). The legend font cap went from 11 px to 14 px so it keeps
   growing at 1440 high (`--map-size` 396 px requests 13.46 px), and the short-window breakpoint moved
   from `max-height: 700px` to `760px`, because between 701 and 745 px the larger legend could reach the
   environment strip. This is a CSS-only change; the parent should recheck the 1440 layout (expected
   legend font 13.46 px) and one window height between 701 and 745 px, where the map now uses the raised
   `top: 22vh`.

## Decisions recorded

1. **Hazard contract.** `hazards.zones` starts as `[]` in the store and is documented in
   `docs/STATE_AND_ENGINE.md`. The minimap draws only entries with `active === true`, finite `x`/`z`
   and `radiusM > 0`, as circles in metres. No event, writer or mock zone was added; an empty list means
   "no zone known", not "safe". The event work (#24-#26) can fill the path later.
2. **Route advance.** The minimap follows the existing `src/engine/routeGlow.js` rule: sample every metre,
   search from 30 m behind to 60 m ahead of the current progress, accept at most 12 m laterally, allow
   walking backwards, and reset when the route content changes. The tracker is owned by `App` for the app
   session (not by the minimap effect, not a global singleton); no `route.progress` store field was added.
   Progress means ground actually walked: a new route starts at 0 even when the astronaut already stands
   far along it, so a spawn away from the route start shows the whole route as remaining until it is
   walked from the beginning. Seeding by proximity was rejected because it would mark ground that was not
   walked. Walking back along a route that doubles back (identical points out and back) lowers the
   reported progress: that is the allowed backtracking rule, not a defect. The progress window prevents
   jumps to a distant pass of a self-crossing route, but a branch that returns within the window cannot
   be told apart; a position nearer that branch is counted on it.
3. **Photo fallback.** The reference PNG is still missing, so the map uses
   `public/marswalk/assets/ortho_lo.jpg` and the reference HUD size/position: a circle about 27.5 vh
   across, top 23.5 vh, right 7.8 vw, with the legend in the gap above the environment strip at 54 vh.
   The declared cap is 480 px so the 27.5 vh value is not truncated at 1440 high.
4. **Tile geometry.** x east / z south, metres from Cheyava Falls. The photo covers the
   `1422.5 m x 1500 m` tile as a rectangle with one metres-per-pixel scale on both axes. It is not
   stretched to a square.
5. **Map data.** `route.waypoints` and `route.path` are read from the store as-is. The habitat comes from
   the `type: 'habitat'` entry of `public/data/shelters.json` (airlock 535.1, 574.1), which is distinct
   from the HAB route waypoint (520, 600). Natural refuges come from the same file. No route is invented.
   Waypoints are not tied to the player marker: all valid ones inside the circle are drawn.
6. **Unknown values.** No fix shows `NO FIX`; an unknown heading draws north-up and labels `N-UP`;
   no route draws no route line; a failed photo or shelter load shows no substitute. There is no player
   marker, no uncertainty ring (#21) and no Plan-mode map (#14).
7. **Redraw budget.** Store updates, image load, shelter load, the canvas `ResizeObserver` and window
   resize all go through one scheduler capped at 10 paints per second. `devicePixelRatio` is read on each
   paint and the backing store is resized there; there is no separate DPR listener. React never renders
   the canvas per frame.

## Automated evidence (this worktree, after the review fixes)

Dependencies were installed locally with `npm ci` (260 packages); no dependency or lockfile change was
made.

### Minimap tests

```text
npx vitest run src/hud/minimapGeometry.test.js src/hud/minimapRoute.test.js src/hud/minimapRedraw.test.js

Test Files  3 passed (3)
     Tests  29 passed (29)
```

Covered:

- Tile UV and inverse with the five real `route.json` waypoints, the tile edges and Cheyava Falls; the
  tile width and depth compared with the real `public/marswalk/assets/terrain.json` so the photo cannot
  drift from the 3D mesh.
- Heading-up projection for headings 0/90/180/270/350 and wrapping (`-10` vs `350`, `10` vs `370`),
  exact centring on the navigation fix, cardinals around the rim.
- Isotropic metres-per-pixel and the 1-2-5 scale bar (`200 m` at 400 m range).
- Advance along the real five-waypoint route with distinct walked/remaining values, backtracking,
  off-route retention, reset only on a route content change, and a self-crossing route that does not
  jump to the distant later pass.
- Tracker lifetime: the same route re-set after a HUD remount keeps the walked distance and continues;
  a route content change while no update ran resets to 0; a fresh route is not seeded from a position
  300 m along it and stays off-route with `remainingM` equal to the total until walked from the start;
  an out-and-back route reports backwards progress instead of a jump; a close return branch inside the
  window is followed (documented ambiguity); two trackers keep separate progress (no shared singleton).
- A burst of store/image/resize requests coalesces; no sliding one-second window exceeds 10 paints;
  `dispose()` cancels a pending paint.
- Active hazard filtering; initial `hazards.zones` is `[]`; the real habitat airlock and the HAB waypoint
  remain distinct.

### Full suite

```text
npm test

Test Files  1 failed | 35 passed (36)
     Tests  1 failed | 313 passed (314)
```

The only failure is the known pre-existing `src/data/credits.test.js:51` CRLF mismatch on Windows
(`docs/credits.md` line endings vs generated text). It is unrelated to #60 and was not changed. No minimap
or store test failed.

### Lint

```text
npm run lint
```

Exit 0. Six pre-existing warnings remain in `scripts/build-credits.mjs` and
`docs/marswalk-assets/testbench-reference/main.js`; no warning points at a file changed here.

### Build

```text
npm run build

✓ 107 modules transformed.
dist/index.html                                  0.48 kB │ gzip:   0.31 kB
dist/assets/routePlanner.worker-BGyhvw6m.js      8.19 kB
dist/assets/index-C-RVOplF.css                  21.30 kB │ gzip:   5.18 kB
dist/assets/index-CsTPn1wo.js                1,074.10 kB │ gzip: 299.48 kB
✓ built in 498ms
```

Re-run before the pull request: same 107 modules and asset sizes, `✓ built in 523ms`; lint exit 0 and the
three minimap test files 29/29 again.

The branch was rebased three times onto a moving `origin/main` while the pull request was being opened;
the last base is `0ea4606`. The conflicts were only the shared wiring in `src/App.jsx`/`src/hud/Hud.jsx`
(the `engine` prop, `SourcesRoot`, `ScienceStops` -> `WalkStopCard`), resolved by keeping every side. The
checks were repeated on the final rebased tree: lint exit 0, the three minimap test files **29/29**, and
`npm run build` with **159 modules** (`✓ built in 397ms`). The rebase did not change the minimap
modules; the browser session above ran before it. A smoke load after the first rebase did **not** reach
the ready state in the shared browser: the engine stayed at "Loading the habitat… 100%" and the HUD
never mounted, so the minimap was not re-observed after the rebase. That is an engine startup limitation
of the shared preview session, not a minimap result; the only code change the rebase required was the
`Hud` prop wiring (`engine` plus `minimapRoute`), and the production build and the tests cover the
merged tree.

## Manual browser evidence (parent sessions, shared browser)

Source: the parent ran these checks in a real browser through the shared T3 preview at 1920x1080,
2560x1440 and 1440x720, in two sessions: the first before the last review fixes and the closing recheck
after them. Temporary canvas instrumentation and a navigation-store override existed **only in the browser
page** and were restored afterwards. The numbers below are the parent's measurements; they were not
produced by this implementation pass. Synthetic `KeyboardEvent` input is not physical user interaction.

### Layout

- 1920x1080: circle left x = 1473.25 px, top y = 253.8 px, diameter 297 px. Legend bottom 575.64 px,
  environment strip top 583.2 px, so a 7.56 px gap and no overlap.
- 2560x1440 before the CSS fix: measured diameter 340 px, confirming the 340 px cap defect. After raising
  the cap the parent measured the expected 396 px (27.5 vh) and legend gap below. Those layout numbers
  were taken **before** the legend font cap went from 11 px to 14 px and before the canvas logical size
  moved to the canvas box (394 px instead of the 396 px wrapper), so the current CSS needs a parent
  recheck: the 396 px frame should not change, the legend grows to 13.46 px and its bottom moves down.

### Projection, rotation and markers (instrumented)

- Headings 0/90/180/270/450 put N at top/left/bottom/right/left. The photo `drawImage` and the waypoints
  rotate and stay centred under the same transform.
- An active zone of radius 60 m at (150, 160) extended past the map circle and was clipped at the rim;
  the same zone with `active: false` was not drawn.
- Five real waypoints checked one by one, each with the fix 60 m south and heading 90: all five markers
  land at x = 126.375, y = 149 (text baseline +0.5) on the 297 px canvas, matching the projected
  coordinates. The shelter habitat (from `shelters.json`, 535.1/574.1) stays distinct from the HAB route
  waypoint and is drawn; SP1 is visible.

### Redraw budget

- Navigation updates plus resizes every 8 ms for 3200 ms: 32 draws in 3356.7 ms, minimum gap 102.3 ms,
  at most 10 draws in any sliding one-second window; last draw 0.60 ms.

### Route, fix and fallbacks

- Simulated advance along the first leg of the real route at 0/30/60/90/60 m: continuous grey walked line
  and dashed amber remaining line.
- With `navigation: null` the map shows `NO FIX`; with an unknown heading it draws north-up and labels
  `N-UP`.

### Frame cost (short sample)

- At 1440 high before the size fix: idle rAF 346 frames ≈ 143.79 fps; store updates at 5 Hz 327 frames
  ≈ 135.87 fps; both median 7 ms, p95 7.1 ms over 2400 ms samples. Canvas paint mean 0.508 ms, max 0.7 ms.
- Limitation: this does not isolate the minimap from other HUD subscribers or the GPU, and the sample is
  short. It is not proof of zero cost.

### Movement and runtime health

- Real engine movement driven by `KeyboardEvent` `KeyW` for 1200 ms: navigation moved from 13.98,84.97 to
  15.11,84.55 with 7 draws in 1.4 s. The input was synthetic, not a person at the keyboard.
- No application errors in the console. The initial StrictMode shelters fetch abort was followed by a
  normal second request (200). The parent will clear the browser.

### Final browser rechecks (parent, previous session)

- At 2560x1440 the circle measured 396 x 396 px at (1964.325, 338.4). The legend bottom was 762.263 px
  and the environment strip starts at 777.600 px. That measurement used the 11 px legend cap and the
  396 px wrapper-based canvas; both were superseded before this session and are not used as evidence.
- With navigation at WP2 (150,120), heading 0, the painter drew waypoint 3 at (198,198.5) in its 396 px
  logical canvas. Instrumentation was restored after the check. The canvas is now 394 px, so that
  measurement is historical; see the geometry tests for the current centring.
- Clicking Plan removed the minimap (0 minimaps, 1 scene canvas); returning to Walk mounted exactly one
  minimap. That check only counted mounts, and at the time the tracker was recreated on mount.

### Parent recheck after the final CSS fix (this session, 2026-11-14)

Method: the same shared T3 preview against the local Vite server on port 5178, resized through the
preview tool to each window size. Layout and budgets were read from the live DOM and from the DEV
`data-*` attributes with `getBoundingClientRect`/computed styles. No source file was changed for the
checks. The navigation was simulated by an in-page override of the store setter that ignored only the
engine bridge's navigation writes, so the tracker received a continuous walk along the real 12-point,
954.7 m planned route; the override was removed and the page reloaded afterwards. This is simulated
navigation, not a physical play session.

- **Layout 2560x1440:** wrapper 396 x 396 px at x = 1964.325, y = 338.4 (top 23.5 vh, right 7.8 vw).
  Canvas CSS box and logical size 394 x 394 px (backing store 493 px at DPR 1.25), confirming the
  canvas-box change. Legend font 13.464 px with the new 14 px cap; legend occupies y 739.4375-767.
  Environment strip top 777.6 px, so a **10.6 px gap and no overlap**.
- **Layout 1440x720 (short-window breakpoint):** wrapper 198 x 198 px, top 158.4 px = 22 vh, canvas
  196 x 196 px. Legend font 9 px, legend bottom 377.86 px, environment strip top 388.8 px: **10.94 px
  gap, no overlap**. This covers the 701-745 px range that the old 700 px breakpoint left uncovered.
- **Layout 1920x1080:** wrapper 297 px, canvas 295 px, legend font 10.098 px, 7.56 px gap, matching the
  previous session. No overlap.
- **Walked-progress persistence:** after planning the real route, `data-walked-m` moved from 0.0 to
  **300.4 m** (remaining 654.3 m, `data-off-route` false) while the map was in Walk. Entering Plan
  unmounted the minimap (0 minimaps, route still 12 points); returning to Walk remounted it and the
  first painted value was **300.4 m / 654.3 m remaining**, identical. The tracker now survives the round
  trip.
- **Backtracking:** walking forward to 320.3 m and then 40 m back lowered the reported distance to
  **279.6 m** (remaining 675.1 m), as the shared `routeGlow` rule allows. No jump, no reset.
- **Redraw budget:** 2002 ms of navigation updates every 8 ms produced **19 paints**, at most **10 in
  any sliding one-second window**, minimum gap 100.7 ms, last paint 1.20 ms. The 10 Hz cap holds live.
- **Limitation:** the preview tab was in the background for part of this session. `requestAnimationFrame`
  pauses when the page is hidden, so the centring of a waypoint under the canvas centre was not
  re-measured after the 396 -> 394 px change; the geometry tests cover centring and the previous session
  measured (198,198.5) at 396 px. The preview tool also exposes no console capture, so "no console
  errors" is not re-asserted for this session: the UI stayed responsive, `route.json` returned 200, the
  minimap received the shelter payload (a `shelters` paint fired), and the server log showed only the
  existing THREE shader warning.

The temporary store override and any page state were removed, the page was reloaded and the preview tab
was closed. The local Vite server stays available on port 5178 for review.

## Risks and limitations

- Fixed 400 m radius. Waypoints, refuges and zone centres outside the circle are not drawn; the route line
  is clipped at the rim. There is no zoom or edge arrow. A waypoint exactly under the navigation fix is
  drawn under it, since only #21 owns a player marker.
- Route progress counts ground actually walked and a new route starts at 0. If the astronaut spawns far
  from the route start, the whole route stays dashed as remaining until it is walked from the beginning.
  This is the chosen behaviour: seeding by proximity would mark ground that was never walked.
- The 30 m back / 60 m ahead window keeps the tracker on the current pass of a self-crossing route, but a
  branch that returns within that window cannot be told apart. A position closer to the return branch is
  counted on it. Walking back is allowed, so an out-and-back route reports a decreasing distance.
- Progress survives Walk -> Plan -> Walk because `App` owns the tracker, but not a page reload: a reload
  starts at 0. It is also not written to the store, so nothing else can read it yet.
- Manual evidence comes from the parent's shared browser session, not from an automated browser test.
  Synthetic keyboard input and short performance samples are not a
  substitute for a physical play session or a long profiling run.
- `ortho_lo.jpg` is a 1500 x 1500 source image mapped onto the 1422.5 x 1500 m tile, exactly as the
  terrain shader does. This preserves the georeferenced rectangle and isotropic metres; it is not a
  square-map distortion.
- The shelter fetch is asynchronous; for a moment after mount the map has no refuge markers. A failed
  fetch leaves them absent rather than using mock data.
- `hazards.zones` has no writer yet, so the shipped map shows no hazard circles until the event work
  fills the path.
- Unknown heading draws north-up; this is an explicit fallback labelled `N-UP`, not a claim that the
  heading is 0.
- The minimap is read-only: no click, pan, zoom or player marker.
