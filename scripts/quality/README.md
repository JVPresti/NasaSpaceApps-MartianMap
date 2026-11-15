# UI quality: council feedback

Tracking issue: #277. This folder holds the tools for the overnight UI pass on branch `exp/hill-climb-quality`.
Nothing here is part of the build.

## Method

Code does not decide whether a change is better. A council of fresh Claude judges does, in writing.

1. `capture.mjs` builds nothing itself. Run `npm run build` first, then `node scripts/quality/capture.mjs`.
   It serves `dist/` locally, opens one headless Chromium at 1366x768 (`--size 1920x1080` for the final pass),
   walks the demo path through the `?qa=1` hooks in `src/qa.js` and saves one screenshot per state in
   `out/current/`, plus `metrics.json`. `--draw` adds draw calls and triangles at three camera poses per tier.
2. The safety checks in `metrics.json` catch breakage before any judge sees a change: boxes that overlap,
   boxes cut by the viewport, text under 11 px, text under 4.5:1 contrast, and the required information per
   state (in Walk: O2 or margin, next waypoint and distance, heading, the active alert; on the table: the route
   and go or no-go; in the debrief: the statistics). A change that makes any of them worse, or breaks
   `npm run lint`, `npm run build` or `npm test`, is reverted without a vote. They are never summed into a score.
3. The council: three fresh judges per round (two Claude Opus 5.5 and one Claude Fable 5.2, medium effort), each
   with a rotating persona from `prompts.md`, the fixed `rubric.md`, and two screenshots of the same state labeled
   A and B in random order. Each answers with a preference (`A`, `B` or `neither`), the reasons, what got better,
   what got worse and the one change they would make next. The orchestrator reads the reasons and keeps a change
   when most judges prefer it for reasons about what actually changed and nobody shows something important got
   worse. The before/after mapping and the verdicts go in `council/<round>.json`.
4. Comprehension: a fresh judge sees one screenshot and answers the questions in `quiz.json`, then says what
   confused them. The orchestrator compares the answers with the real values captured in `metrics.json`
   (`facts`). A question that gets worse blocks a change.
5. Critique rounds every few attempts: three fresh judges see the whole path and return the most serious
   problems with a severity (blocker, major, minor) and a proposal. Problems that two or more raise on their own
   become issues and drive the next changes.

A screen is done when a fresh critique round finds no blocker or major that two judges agree on, the
comprehension answers are all right with nothing relevant confusing, and all three judges would show it as is in
the Space Apps demo.

## Files

- `capture.mjs`: screenshots and safety checks.
- `rubric.md`, `prompts.md`, `quiz.json`: the fixed texts the judges get.
- `council/`: every round's prompts mapping and verdicts.
- `log.tsv`: one line per attempt, kept or reverted, with each judge's reason in one sentence.
- `out/`: screenshots, ignored by git. Selected before and after pairs are saved in `docs/qa/hillclimb/`.

## Decisions

- `vite preview` stalled on the shared machine, so `capture.mjs` serves `dist/` with a small static server.
  It serves the same built files.
- The browser is Playwright's cached Chromium with SwiftShader, so it needs no GPU. Draw calls and triangle
  counts do not depend on the renderer speed; frame rates are never measured.
- Teleporting the astronaut would leave the partner behind the 100 m separation limit and raise a warning that
  a real walk never shows, so `capture.mjs` moves the scripted partner next to the player after each jump.
- Files touched by open pull requests (`gh pr list` plus `feat/habitat-flow` and `feat/online`) are off limits
  and refreshed every hour. Problems there become issue comments instead of changes.
- The `?qa=1` hook touches `src/main.jsx` and `src/components/EngineView.jsx`, both in open PRs, so it stays on the
  lab branch and is not part of the handoff PRs.
