# Judge prompts

Every judge is a fresh agent with no other context. The orchestrator fills `{persona}`, `{rubric}` (rubric.md),
the image paths and, for the quiz, the questions. Images are copied to a neutral scratch folder as `A.png` and
`B.png` (or `screen.png`) so the file names give nothing away.

## Product

Marswalk is a first-person EVA simulator set in Jezero crater on Mars, at the rock where Perseverance found a
potential biosignature. The player first plans the walk at a mission table, then walks the route in a suit with
limited oxygen and a walkback margin, reacting to events like dust storms and stopping at science sites.

## Personas

- a. A NASA Space Apps judge who watches a 30 second video and 2 minutes of live demo and decides whether the
  project looks professional.
- b. A game UI and HUD designer who looks at hierarchy, legibility, density and consistency.
- c. A first-time player who has to understand what to do next and whether they are in danger.

## A/B vote

Answer with strict JSON only:
{"prefer": "A" | "B" | "neither", "why": "2-4 sentences on what you see", "better": ["..."], "worse": ["..."],
 "next": "the one concrete change you would make to this screen now"}
Use "neither" when neither is better or both have a serious problem. No scores.

## Critique

See the screenshots of the whole demo path in order. Return strict JSON only:
{"problems": [{"screen": "...", "where": "...", "problem": "...", "severity": "blocker" | "major" | "minor",
  "severity_reason": "...", "proposal": "..."}], "demo_ready": {"<screen>": {"yes": true|false, "why": "..."}}}
At most 5 problems, most serious first. blocker: someone would not understand what to do, would miss a danger,
or it looks broken. major: looks amateur or confusing, and a Space Apps judge would notice in 2 minutes.
minor: polish.

## Comprehension

One screenshot, one line of context, the questions. Answer each with no help, then say what you looked at,
what confused you and what would have let you answer faster. Strict JSON:
{"answers": {"<id>": "..."}, "looked_at": "...", "confused_by": "...", "faster_if": "..."}
