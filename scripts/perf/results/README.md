# Plan phase perf runs

Raw per-run numbers behind #318 and #319, written by `scripts/perf/runs-tsv.mjs` from the `runs.json` of each set.
Both sets ran `scripts/perf/plan.mjs --runs 3` with `QA_GPU=1` on an RTX 3070 desktop through WSLg, at 1366x768,
on 15 November 2026. The builds interleave, so each load spike on the machine lands on whichever build was running.

| Set | Started (UTC) | Builds, in run order |
|---|---|---|
| set1.tsv | 11:06 | main 013f2d5, idle be9ce19 (#318), suit 2bc0aed (#319), pr282 8ec6f72 (#282), map282 c2eac51 (#282 with the #320 patch) |
| set2.tsv | 13:08 | pr282 8ec6f72, fixes282 42778d0 (#282 with #318, #319 and the #320 patch), main 013f2d5, fixes ed70e83 (main with #318 and #319) |

A row with an error is a run that failed and that no median uses. The idle columns cover 5 s with the table open and
nothing touched. `glFrames` counts frames with at least one WebGL draw, `long_tasks` are tasks over 50 ms, and
`inp_ms` is the slowest input-to-next-paint of the step from the Event Timing API.

Both sets ran before the rig matched only the map's layer group (31f9633). On #282 builds (pr282, map282, fixes282) the
layer loop also clicked NeedsPanel's crew and risk buttons, so `layer_long_tasks_all` for those builds counts
re-plans too, and the steps after it start from a different crew. The idle columns come before the loop. The map
drag and Suit step columns come after it. A re-run of #282 with the fixed loop gave counts in the same range: 18 and 21 long
tasks in the drag, and 2 long tasks each time the Suit step reopened.
