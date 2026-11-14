# Issue #58 validation

Validated on 2026-11-14 against the Vite development app in Chromium through the shared browser preview. OpenCode DeepSeek implemented the change and performed an independent code review and test run; the parent agent performed the browser checks and resolved review findings.

## Browser checks

- Normal startup: terrain appears, the loading panel disappears, and one engine canvas remains.
- Asset failure: mounted the actual App under React StrictMode with fetch rejecting `assets/terrain.json`. The error names that file, the retry button receives focus, and late callbacks do not replace the error.
- Retry and delayed loading: restored downloads with an injected 250 ms delay per fetch and clicked Try again. Recorded progress increases from 0 through intermediate values to 100, with 39/39 files; retry leaves one canvas. This simulates request latency, not a bandwidth throttle.
- Unsupported WebGL2: made canvas `getContext('webgl2')` return null before mounting App. The panel explains the requirement and possible recovery steps, and no engine canvas is created.
- First-frame gating: held requestAnimationFrame callbacks during a retry. At 39/39 files and 100%, there were zero drawElements calls and the panel had not begun fading. Released the callbacks: drawing occurred and the panel faded and was removed.
- Narrow viewport: at 375 px width the loading and unsupported panels fit within the viewport.
- Review regression checks: injected a first-frame draw exception; `engine.ready` rejects with that error and `onError` receives it once. At 568 x 320 px, the unsupported panel scrolls and the retry button remains reachable.

The browser-only test harness and API overrides were removed after verification. No production testing switches were added.

## Automated checks

Run `npm run lint`, `npm run build`, and `npm test`. Tests cover the initial asset manifest, actual JSON loader errors and progress, progress monotonicity, lifecycle error precedence/disposal, and WebGL support detection.

Local lint also traverses the user's untracked engine reference copy, producing existing warnings. Source under `src/` is clean. The reference folder and ZIP are excluded from this change by explicitly staging only issue files.

## Review follow-up

Resolved duplicate React sibling keys, the initial 0/39 state update, exceptions during frame rendering, optional quality-download failure handling, repetitive screen reader announcements, and scrolling on short viewports. The retry target is at least 44 px high. WebGL probe cleanup failure no longer changes the capability result.

The 39-file manifest must stay synchronized with future initial scene loaders. Progress counts logical GLB files; the current models embed their buffers and textures. Screen reader behavior and GPU/driver combinations beyond this browser were not manually tested.
