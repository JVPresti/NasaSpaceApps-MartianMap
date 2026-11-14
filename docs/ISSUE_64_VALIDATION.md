# Issue #64 validation

Local work for `[Feature] Start screen, controls help and pause menu` (#64) on branch
`feat/issue-64-start-controls-pause`, HEAD `0518244` (`feat(sim): add persistent mission clock and local Mars time (#112)`).
The worktree is shared; no commit, push, pull request, issue reassignment or external message was made.

## Authorization and decisions

- **Exceptional Phase 3 authorization.** The user explicitly authorized implementing #64 before the Phase 2
  exit test is accredited. This document records the exception; it does not claim that Phase 2 or the Phase 3
  exit test passed.
- **Implementation and tests** were produced by the DeepSeek implementation sub-agent only, with no further
  delegates. #59 (`src/sim/missionClock.js`) is used as-is; its module and tests were not changed.
- **Start is a real pause.** `createEngine` starts with `inputEnabled: false`; `EngineView` starts the
  simulation and calls `pauseMission()` immediately. The start screen appears only after the existing loading
  screen has finished its fade. No mission time, suit consumption or player input runs behind it.
- **Lock before time.** Walk Start/Resume requests pointer lock first, then enables input and calls
  `resumeMission()` only after a real grant. Plan resumes without a lock because it uses orbit controls.
- **Pause through #59.** Menus call `pauseMission()` / `resumeMission()` from `src/state/store.js`; they do not
  write `mission.elapsedSec` or start another clock. The clock anchors the exact pause/resume instant.
- **Restart in place.** The engine is not recreated, so the Auto/High/Low quality choice survives. The
  simulation is stopped, `marswalk.missionClock.v1` is cleared, the store is reset, the engine returns to
  spawn, one new paused clock starts, and the start screen returns.
- **Menus.** Native `<dialog>` `showModal()` provides the inert background, focus trap and focus return.
  Tab/Shift+Tab, Enter/Space and contextual Esc work without custom focus code; the renderer's own forward
  wrap was verified with real key events in a real browser. The top-bar mode switch is repeated inside the
  pause menu so Plan remains reachable while paused.
- **Sources** is a disabled button with a visible explanation. No sources screen or mock was built (#63).
- **Quality** uses the real `setTier`/`detectTier` path through a serialised controller. The UI calls
  `engine.setQuality()` / `engine.getQuality()` and never reads `window.__marswalk`.

## Files

New plain-JavaScript modules and tests:

- `src/engine/input.js`, `input.test.js` — key gate that blocks menu-time input and clears stuck keys.
- `src/engine/pointerLock.js`, `pointerLock.test.js` — legacy void and Promise pointer lock, success/failure
  events, timeout, concurrent requests, late-lock release, dispose, a promise that resolves before the lock
  is real, and cancellation of a pending promise request.
- `src/engine/quality.js`, `quality.test.js` — serialised Auto/High/Low changes, coalescing, async errors,
  automatic downgrade ownership.
- `src/state/evaSession.js`, `evaSession.test.js` — pause/resume ordering, lock-gated Walk resume, Plan
  resume, abandoned late grants, restart ordering and clock-session reset.

New interface:

- `src/components/StartScreen.jsx`, `PauseMenu.jsx`, `ControlsHelp.jsx`, `Modal.jsx`, `menu.css`.

Changed:

- `src/App.jsx` — start/pause/playing phases, overlays, keyboard rules, quality and restart wiring.
- `src/components/EngineView.jsx` — paused start, input off, simulation stop/start controls for restart.
- `src/components/LoadingScreen.jsx` — reports when its fade has finished so the start dialog opens after it.
- `src/engine/index.js` — public input, pointer-lock, quality and reset APIs; automatic downgrade goes through
  the serialised controller.
- `src/engine/view.js` — input gate, pointer-lock controller, reset to `START`, no click-to-lock.
- `scripts/measure-fps.mjs` — enters through the start screen and changes mode through the mission store, so the
  measurement hook does not trip the safe pause. It was not executed in this task.
- `docs/STATE_AND_ENGINE.md` — API and session contract.

## Automated validation

Run from the worktree on 2026-11-14 with Node.js 22.18.0 after `npm ci`. These are the final numbers after
the review corrections below.

| Command | Result |
|---|---|
| `npx vitest run src/engine/input.test.js src/engine/pointerLock.test.js src/engine/quality.test.js src/state/evaSession.test.js` | exit 0; **4 files, 31 tests passed** |
| `npm run lint` | exit 0; no errors. Six pre-existing warnings remain: one in `scripts/build-credits.mjs` and five in `docs/marswalk-assets/testbench-reference/main.js`. |
| `npm run build` | exit 0; 89 modules transformed. `dist/assets/index-*.css` 14.56 kB (3.42 kB gzip), `dist/assets/index-*.js` 1,037.19 kB (287.70 kB gzip). |
| `npm test` | exit 0; **30 files, 270 tests passed** |

The refusal-message test now asserts the reviewed wording (`Wait briefly after Escape`, `browser settings`,
`try again`) instead of the phrase from the first draft, so the suite matches `src/state/evaSession.js`.

The earlier `npm test` failure was historical and is not a code defect. This Windows checkout stored
`docs/credits.md` with CRLF while `npm run credits` emits LF, so `src/data/credits.test.js` compared the same
text with different bytes. The parent normalised only that local worktree file to LF; `git diff` for it is
empty (no tracked content changed) and the suite then passed **30 files / 266 tests, exit 0**. The four new
review tests bring the final count to 270. The Linux CI checkout already has LF, so the failure cannot
reproduce there, and no #64 file is involved.

Coverage includes:

- Walk resume stays paused while the lock request is pending, stays paused after a refusal, and resumes only
  after a grant; Plan resume never requests a lock.
- A lock grant that arrives after the interface paused, changed mode or restarted is abandoned: no input,
  no clock resume and no message (`stale`).
- A restored #59 session is paused exactly when the start screen takes over, and start-screen time does not
  advance it.
- Pause freezes the real #59 clock at its exact elapsed value and leaves it frozen through later ticks.
- Restart stops the old runners before clearing the persisted session, resets store and engine in order,
  starts one paused clock at elapsed 0, and a later remount restores that new session rather than the old one.
- Restart refuses to start a second simulation when the caller provides no stop callback or when the stop throws.
- Lock controller: legacy event, Promise, rejection/throw, error event, concurrent callers, timeout with
  late-lock release, release, external unlock and dispose.
- A browser promise that resolves while `document.pointerLockElement` is not yet the canvas does not report
  success; the change event (or the watchdog) settles it. Releasing a pending promise request cancels it and
  a later grant is released instead of reported.
- Quality controller: serialised High→Low, coalescing, detected tier for Auto, preserved scene and reported
  error on failure, auto-only downgrade, unknown option, dispose.
- Input gate: ignored presses while closed, held keys cleared on close, release still recorded, no stale press
  after reopening.

Not covered automatically (by the repository testing policy: no browser, visual or React render tests):
three.js rendering, native dialog focus behaviour and real browser pointer lock.

## Review corrections

Review of the first implementation found four issues. All are fixed locally without changing the public
contracts or the #59 clock.

1. **Esc in the Walk pause menu.** `App.handlePauseCancel` tried to Resume, but Esc is a key press and cannot
   provide user activation for `requestPointerLock`, so it could only fail. The Walk menu now stays paused,
   cancels any request in flight, moves focus to Resume and shows
   `Press Enter or click Resume to capture the mouse.` Esc still returns Controls and Restart to the menu,
   and Plan still resumes with Esc because it needs no lock.
2. **Honest lock message.** `requestEvaLock` no longer blames the permission for every refusal. It says the
   EVA stays paused, that the browser may need a moment after Escape, and that Resume must be used to try
   again. No fixed cooldown and no automatic retry outside the user gesture were added; a refusal keeps the
   pause.
3. **Late lock after a mode change.** `view.setMode('plan')` now always calls `pointerLock.release()`, so a
   pending Walk request is cancelled as well and the controller releases a lock granted later. The app also
   checks that an attempt is still current after every lock answer: a grant that arrives after Escape, a
   mode change or a restart is abandoned, and `resumeEva` reports `stale` without enabling input or resuming
   the clock.
4. **Promise resolved before the lock.** The promise branch of `pointerLock.js` reported success without
   checking `document.pointerLockElement`. It now settles `true` only on a real lock and leaves the change
   event or the watchdog to finish; tests cover the early resolve and cancelling a pending promise request.

## Manual browser validation (executed)

Run by the parent on 2026-11-14 in a headed Microsoft Edge 157 window
(`Edg/157.0.4341.42`) driven by Puppeteer over CDP, so keys, clicks and pointer lock are real browser
events. No application mock was used. Raw results: `docs/ISSUE_64_PARENT_BROWSER_EVIDENCE.json`
(19/19 cases passed, no page errors). Screenshots were regenerated from this run. The earlier preview-browser
pass is kept in `docs/ISSUE_64_MANUAL_EVIDENCE.json` as history; its open findings are resolved below.

| Check | Result |
|---|---|
| Start screen after the real loading fade: mission sentence, start position, controls, focused Start; clock, suit and position unchanged over 1.1 s | pass |
| Tab and Shift+Tab stay inside the start dialog (four forward presses wrap on the single Start control) | pass |
| Enter starts: real `document.pointerLockElement` is the engine canvas, dialog closes, clock runs | pass |
| `W` walks (0.9 m) and relative mouse movement changes yaw | pass |
| Esc: lock released, menu opens, elapsed and oxygen frozen over 1.4 s | pass |
| Esc on the Walk menu: stays paused, focus returns to Resume, notice explains Enter/click | pass |
| Walk menu Tab/Shift+Tab: 11 presses cycle Resume → Restart → Controls → Auto → High → Low → Plan → Walk → Resume without leaving the dialog | pass |
| Resume: lock re-granted, clock continues above the paused reading | pass |
| Injected `SecurityError` from `requestPointerLock` (browser fault injection, not an app mock): menu stays paused with the honest message; Resume succeeds once the failure is removed | pass |
| `H`: controls help opens paused and without lock; Esc returns to the pause menu | pass |
| Sources: disabled button, explanation visible, no screen | pass |
| Quality with `ortho_hi` request aborted: inline error, scene and pause preserved | pass |
| High → Low → Auto: real tiers applied, Auto re-detects (`low` on the ANGLE/AMD adapter here) | pass |
| Plan from the menu: resumes with no lock; Walk from the menu re-captures the lock | pass |
| Restart → Cancel: mission untouched | pass |
| Restart → confirm with a route and an alert written into the store first: position back to x 8 / z 70, elapsed 0.0, new `startedAtMs`, route path `null`, alerts empty, persisted `marswalk.missionClock.v1` holds the new paused session | pass |
| Reload on the start screen: same paused session restored, elapsed unchanged over 1.2 s | pass |
| 390×700 viewport: no horizontal overflow, dialog inside the screen | pass |

Not exercised in this run: `prefers-reduced-motion`, a browser-initiated lock loss by tab switch, and the
engine-error retry path; the earlier preview pass covered the retry dialog only partially.

### Findings from the earlier preview pass

- **F1 – Tab from the last control reached `document.body`.** Not reproducible with real keyboard events. In
  headed Edge, five forward presses on the start dialog and eleven in the Walk menu never left the dialog;
  `document.activeElement` stayed on a dialog button every time. The behaviour came from the preview tool's
  synthetic key dispatch, which does not perform the renderer's native focus traversal, leaving the synthetic
  event outside the dialog's handler. `Modal.jsx` already wraps the forward path itself, so nothing needed to
  change; the earlier claim was corrected, not the code.
- **F2 – mouse look under lock.** Now verified (yaw changed with real relative mouse movement).
- **F3, F4 – preview-tool selector timeouts and lost animation frames.** Environmental; the headed run
  rendered, reloaded and restored normally.
- **F5 – code changed during the preview run.** The headed run was made on the settled working tree after all
  review corrections.
- **F6 – restart route reset was not discriminable.** The headed run wrote a two-point route and an alert into
  the store first, then restarted; the route path was `null` and the alert map empty afterwards.

## Limitations and open points

- Real pointer lock, native dialog focus and three.js rendering remain out of the automated suite (the plain
  modules use minimal DOM/EventTarget fakes; the React phase sequence is covered by design review). They were
  validated manually in a real browser instead, as recorded above.
- The pause freezes the mission clock, suit consumption and player input, but the engine keeps rendering and
  ambient partner/habitat animation continues. Freezing all scene time was outside this issue. Restart rewinds
  the player, route, markers, store, simulation and clock; the scripted partner and the dropped-case prop are
  ambient choreography and are not rewound.
- Quality Auto reads the actual state when the menu opens or an action finishes; a background automatic
  downgrade is not pushed live into an already open menu.
- Start-screen time is not counted. Time absent from a previously running #59 session up to page load still
  counts, because that is the existing #59 restoration rule; changing it was out of scope.
- A full engine retry/remount creates a new engine, so a manual High/Low choice is not carried across that
  remount. The URL `?tier=high|low` still forces it. Restart does keep the choice because it does not recreate
  the engine.
- `?mock=1` starts paused and can be started normally; Restart resets the mock-filled store and the mock
  simulation is a no-op, so the store stays empty. This is development-only behaviour.
- The quality panel shows the raw GPU renderer string for diagnosis. It is not a sourced measurement.
