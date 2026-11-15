# Pitch council

The method of the UI hill climb on `exp/hill-climb-quality` (`scripts/quality/README.md`), applied to the pitch.
Code never decides whether a change is better. Fresh judges do, in writing, with no scores.

## Judges

Fresh native agents with no shared context, Claude Opus 5.5 and Claude Fable 5.2. Each round has the three persona
judges (at least one Fable) and, since the creative direction of 15 Nov, a fourth: the slop judge, always Fable.

1. **Local judge** (Opus). An engineer or researcher from UABC or CICESE, Spanish first, no Mars background, sees 27
   teams in one afternoon. Reads the Spanish script and watches the slides.
2. **NASA judge** (Fable). Planetary science or EVA operations background. Checks validity and whether NASA data is
   core, against the code facts we give.
3. **Storytelling judge** (Opus). Knows nothing about the subject and only has the slides or the script.
4. **Slop judge** (Fable). Only job: "Which line could appear unchanged in another team's pitch? Quote it." Every
   quoted line counts as a major and gets rewritten or cut.

## Rounds

- **Critique round.** Each judge returns findings with severity (blocker, major, minor) tied to a rubric criterion,
  and answers "would you advance this to Global Judging as-is, and what is the one thing that would change your
  mind?". Raw JSON in `round-NN/<judge>.json`.
- **A/B round.** The old and new version of one artefact, shown blind as A and B in random order per judge. Each
  answers `{prefer, why, better, worse, next}`. A change stays only if 2 of 3 prefer it and nobody flags lost
  information.
- **Comprehension check.** A fresh judge sees only the 7 slide PNGs and answers: what is the problem, what does
  Marswalk do, which NASA data it uses, what is real and what is simulated. A wrong answer is a blocker.
- **Timing check.** `node tools/timing.mjs` at 140 words per minute. Over time is a blocker.

Done when no judge reports a blocker or major, the comprehension check is clean, and all three persona judges say
they would advance it.

## Files

- `rubric.md`: the five official criteria and the creative rules every judge gets.
- `log.tsv`: one line per round and per change, kept or reverted, with each judge's reason in one sentence.
- `round-NN/`: prompts, the A/B mapping and each judge's raw JSON.
- `timing.md`: the latest timing check.
