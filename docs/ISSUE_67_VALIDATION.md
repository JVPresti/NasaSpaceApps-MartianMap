# Wrist screen app — issue #67

Implementation on `feat/issue-67-wrist-app`, based on `f9d435a`.

## Controls and scope

- R raises/lowers the wrist; brackets change pages; J/K select next/previous row; Enter confirms.
- Layers write the same mission store action used by Plan. Map, checklist and suit are read-only.
- Sampling clips block opening. A sample held in the scoop survives opening; closing restores the tool hold.
- The map shows the real full HiRISE tile north-up, with metric scale, route, waypoints, refuges, position estimate and its reported uncertainty. No replacement observations or new navigation model.
- The existing screen placement is raised and brought closer for reading at 1920 × 1080. The existing point/pinch clips are reused. The actual animated distal index bone is aligned after blending, so pinch does not use the incorrect point-only fingertip offset.
- The canvas is fixed at 512 × 352 and uploaded only after changed visible content. The UI paints; the engine owns the texture. Sampling inputs are disabled while the wrist is raised.

## Automated checks

Final targeted checks: 7 test files, 33 tests passed. They cover visible state/signatures, keyboard ownership, metric projection, sampling gates and restoration, real props content retention, texture lifecycle, and the fingertip throughout the point/pinch blend using the original GLB and a transformed camera.

`npm run lint` and `npm run build` passed. Lint reports only existing warnings outside this change. `git diff --check` passed.

The full suite before the two final regression tests passed 591 of 593 tests. The two failures were reproduced by exporting the unchanged base commit to a temporary directory and running its tests, with the checkout's original CRLF credits document preserved:

- `src/data/credits.test.js`: generated LF Markdown differs from checkout CRLF Markdown.
- `src/stops/StopCard.test.jsx`: the existing waypoint runner opens the Cheyava Falls card at 2.5 m while this test expects a 2 m threshold.

These unrelated failures are left unchanged.

## Shared-browser verification

Tested with real assets and simulation, `?tier=low`, at 1920 × 1080:

- R opens the wrist; J and Enter change the mission store layer and visible terrain.
- After the review fixes, R/J/Enter were checked again with the Walk button focused: the wrist opens and the store layer changes to 1 without activating the focused button.
- Brackets show the full-tile map and the sampling checklist. Page selection survives a Plan round trip, while entering Plan closes the wrist.
- An irrelevant store update leaves the draw counter unchanged.
- P photographs real ground; the photo checkbox updates from the sampling bridge.
- A real `collect_ground` clip rejects R during collection. After collection reaches `holding`, opening and closing the wrist preserves the ground sample and the checklist's photo/texture state. E subsequently starts `stow_sample`.
- Text, hand overlap and HUD overlap were inspected visually. The screen was raised and its pointer moved to the right margin after this inspection.

The shared-browser click on the engine canvas timed out. Ground collection was therefore triggered by dispatching the canvas click event in the shared browser; no sampling state or checklist flags were injected. Camera placement used the existing development placement helper. This checks the real sampling input handler but is not a successful native pointer-lock click test.

## Limits

High tier, screen-reader use, and the full partner-case handover were not manually checked. Browser animation was throttled to about one frame per second in this session; this run is not a performance measurement. The complete stow/seal cycle was not claimed from the browser; its state logic has existing automated coverage. Final review findings were fixed locally, including focused-button keyboard handling, missing-image credit handling and real-bone pinch alignment.

Earlier 1080p screenshots supported the layout adjustment. Two final screenshot attempts timed out in the shared browser; the final keyboard/state check succeeded, and the corrected pinch alignment was validated with the original GLB in the automated test.
