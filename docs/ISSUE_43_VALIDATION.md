# Issue #43: EVA debrief validation

Branch: `feat/issue-43-debrief-summary`. Integrated base: `54ca07b`, including #64 / PR #167. This records the validation performed before publishing the change for review.

## Implementation

The real HAB entry in `shelters.json` defines the 5 m return area. A running Walk reading outside it starts the EVA; returning ends it. The store records horizontal Walk distance, finite oxygen-margin and battery-percentage minima, event start/end times and path changes. Pause and mode transitions reset the distance baseline, including transitions entirely between samples.

The final snapshot detaches and deeply freezes all metrics and histories, including secured samples and the existing scripted radiation reading. Missing readings remain unknown. App closes input through #64's `pauseEva`, blocks resume and shortcuts, and displays the debrief. Restart uses the existing `restartEva` and clears the minimap tracker. Opening focus goes to the title, keeping the first metrics visible.

## Automated checks

- Targeted integration: 6 files, 33 tests passed, covering statistics, mission-time events, simulation wiring, real restart and debrief formatting/rendering.
- Final full `npm test`: **655 passed, 1 failed** across 72 files. The failure is `src/data/credits.test.js`, comparing CRLF `docs/CREDITS.md` with LF generated Markdown. Neither file was changed by #43; the first delegate reproduced this on the prior main base. An earlier StopCard failure was fixed upstream and passes after integrating main.
- `npm run lint`: exit 0, existing warnings only; no new warnings.
- `npm run build`: passed.
- `git diff --check`: passed.

## Browser verification

Vite on port 5183, low quality, real assets and simulation. Shared preview opened but both snapshot attempts returned `Preview automation snapshot timed out after 15000ms`. Verification continued with Playwright in an isolated browser context.

Pointer capture was refused when clicking Start in Walk; the app correctly remained paused. The test then started through the existing Plan action, switched to Walk through the development store and used the existing `__marswalk.place` positioning hook. **No completed summary was injected.** The actual runner produced it from navigation updates and real event/planner writes.

Verified on the final code:

1. Start outside HAB at (575.1, 574.1). Trigger the real Radiation alert using Events and wait for the real planner's event route.
2. Move through the development positioning hook to (555.1, 574.1), allowing the real event runner to record its end, then to (535.1, 574.1).
3. The runner produced a frozen summary: 40 m distance, 0 secured samples, 0 microgray scripted dose, finite suit minima, event start/end and an event-route entry. Mission paused; one debrief dialog; focus on the title; scroll position 0.
4. Escape, H and V left the mission paused and the same debrief open. Tab from the title focused Restart; Shift+Tab wrapped to Sources and Tab wrapped back.
5. Sources opened above the debrief. Escape closed Sources and returned focus to its opener.
6. At 375 x 667, document width was 375 px; dialog client and scroll widths were both 331 px. Content scrolls vertically without horizontal overflow.
7. Restart returned to the real start screen at (8, 70), paused with elapsed time about 0.001 s, phase `ready`, empty histories and a null summary.
8. No console errors in the final browser run.

Screenshots: [desktop](ISSUE_43_debrief.png), [mobile](ISSUE_43_mobile.png).

## Limits

- This checks real return detection and UI/restart integration using development positioning, not an uninterrupted WASD journey or successful pointer capture.
- Secured-sample copying, negative margins and unavailable readings have automated coverage; no physical sampling or screen-reader session was performed in this manual pass.
- Radiation remains scripted. Battery is minimum remaining percentage, without a new walkback-margin model.
- Statistics are not persisted between sessions. Events ending after the final snapshot do not alter it. If `shelters.json` fails, the EVA tracker cannot start; the existing suit fallback remains.
