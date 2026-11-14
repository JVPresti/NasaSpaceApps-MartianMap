# Issue #59 validation

Validated locally on 2026-11-14 in the isolated `feat/issue-59-mission-clock` worktree. Its starting HEAD was `ff179eeec4b92315596519c6e1bcdb089173d6bb`, equal to fetched `origin/main`. Dependency #6 is closed through merged PR #92. No issue assignment, developer message, commit, push or PR was made.

Implementation and temporal tests were delegated through OpenCode with model `opencode/deepseek-v4.1-flash-free` (DeepSeek V4.1 Flash Free). Parent reviewed the implementation, reran validation, and performed the browser checks afterward.

## Automated validation

- Temporal tests: 31 passed in `src/sim/missionClock.test.js` and `src/state/simulation.test.js` (delegate run).
- Full suite, rerun by parent: `npm test`, 17 files / 150 tests passed, exit 0.
- `npm run lint`: exit 0, no errors; five existing warnings in `docs/marswalk-assets/testbench-reference/main.js`.
- `npm run build`: exit 0, 64 modules transformed.

Coverage includes irregular timestamp jumps, exact pause boundaries, repeated pause/resume, scale continuity, 88775-second sols, local midnight rollover, east longitude conversion, running and paused restoration, unavailable/malformed storage, cleanup, real Zustand writes, mock no-op and simulation restart.

## Manual browser checks

Used the shared T3 browser at `http://localhost:5173/`, with the real application and loaded WebGL scene. Actions were executed through the browser console because this issue adds API/store controls, not visual HUD controls. The normal engine loaded and its loading overlay cleared. No time or storage implementation was replaced with a mock for these checks.

Raw snapshots are in [ISSUE_59_BROWSER_EVIDENCE.json](ISSUE_59_BROWSER_EVIDENCE.json).

| Check | Observed result |
|---|---|
| Initial session | sol 1210, LMST 17:45, scale 1, running; `view.sky` and `mission.sky` both `late_afternoon` |
| Running timer | Published reading grew from 9.004 to 12.006 seconds; display sampling is once per second |
| Same-tab reload while running | Original `startedAtMs` 1794688486072 retained; elapsed reading became 18.530 seconds, including reload/loading time |
| Pause | Immediate boundary 18.856 seconds; unchanged after waiting through multiple ticks |
| Reload while paused | Exactly 18.856 seconds restored, still paused |
| Scale change while paused | Scale changed to 60 without changing elapsed time or paused state |
| Resume at scale 60 | 2301 ms real time produced 138.060 additional mission seconds; final elapsed 156.916, LMST 17:47 |
| Sky scope | `view.sky` remained `late_afternoon` during clock/scale changes |
| Corrupt persisted JSON | Replaced clock storage with `{bad` and reloaded; fresh running session, new epoch, sol 1210, LMST 17:45, scale 1; valid storage rewritten |
| Existing `?mock=1` | Elapsed stayed 6180 seconds and LMST 15:20 across a 2.1-second wait; real clock storage remained absent |
| Browser diagnostics | Shared-browser console snapshots contained only Vite connection debug messages; no warnings/errors observed |

The temporary evidence key and clock key were removed, and the browser tab opened for testing was closed.

## Reproduction

Run `npm run dev`, open the app and inspect `__missionStore.getState().mission`. In the development browser console:

```js
const actions = await import('/src/state/store.js');
actions.pauseMission();
// Wait and reload: elapsedSec remains frozen.
actions.resumeMission();
actions.setMissionTimeScale(60);
// Elapsed advances 60 mission seconds per real second.
actions.setMissionTimeScale(1);
```

After a reload, import `actions` again. Storage key: `marswalk.missionClock.v1`. Use a fresh tab without an opener or remove that key to start a new session. Browser session restoration/duplicating tabs may preserve or copy sessionStorage according to browser behavior.

## Limits

- Manual checks used same-tab reloads; closing/restoring the browser, long operating-system suspension and multiplayer synchronization were not exercised. SessionStorage intentionally cannot preserve an EVA after its tab session ends.
- Full-sol conversion was tested with injected timestamps in unit tests, not by waiting a real 88775 seconds in the browser.
- Denied storage was unit-tested; browser privacy/storage policies were not altered manually.
- The module uses `Date.now()` to survive reloads. Moving the system clock backward may lower elapsed time within an active anchor interval; no cross-device synchronization is provided.
- Demo epoch, preset times and scale are SIM choices, not historical ephemeris. Initial sol 1210 / 17:45 matches the chosen late-afternoon demo approximately. The existing static sky is not advanced (#73).
- Suit consumables retain their existing wall-clock runner and reset on reload; changing mission scale does not accelerate suit consumption. Suit persistence and shared simulation stepping are outside #59.
- No new visible EVA timer, HUD or pause control is included. Browser verification inspected the real store/API rather than a rendered timer.
