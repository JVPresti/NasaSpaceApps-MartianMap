# Marswalk pitch

Everything the team needs to present Marswalk at NASA Space Apps 2026 (challenge "Interplanetary Survival Guide:
Martian Map", Ensenada local event). Built on the first mission of PR #282 and its `docs/DEMO.md`.

> **Confirm with the Ensenada organisers:** the pitch length. We wrote for 5 minutes plus Q&A, with an 8-minute and a
> 3-minute version.

**Thesis.** On Mars, the question isn't where you can go. It's where you can go and still get home.

| File | What it is |
|---|---|
| `beats.md` | The beats of the presentation mode (`?present=1`, branch `feat/present-mode`): camera idea, on-screen words in English and Spanish, presenter line, time. The presentation thread reads it from this branch |
| `script-5min-es.md`, `script-5min-en.md` | The 5-minute local pitch, Spanish for the judges, English twin |
| `script-8min-es.md`, `script-8min-en.md` | The 8-minute version: DEMO.md's full demo with the story around it |
| `script-3min-es.md` | The 3-minute cut |
| `demo-run-sheet.md` | The live demo: URL, clicks, keys, lines and a fallback for every beat, verified against the #282 code; re-check list for the branches still to merge |
| `qa.md` | The 12 hardest questions with short, honest answers |
| `video-30s.md` | The 30-second video script and frame-accurate shot list |
| `deck-global.html`, `out/deck-global.pdf`, `out/deck-global/*.png` | The 7-slide global deck: one self-contained HTML file (fonts and images inlined), its PDF and one PNG per slide |
| `fallback/stills/` | Real screenshots of the #282 demo, one per beat, for when the live demo fails |
| `council/` | The judge council: rubric, every round's raw JSON, `log.tsv` |
| `src/`, `img/`, `fonts/`, `tools/` | Deck sources and the scripts that build it |

## Rebuild

```
node docs/pitch/tools/render.mjs           # src/*.html -> self-contained HTML, PNG per slide, PDF
node docs/pitch/tools/timing.mjs           # every script row against its slot at 140 words per minute
node docs/pitch/tools/walkback-zone.mjs    # walkback zone and leg numbers from src/sim (for beats 1 and 3)
```

`render.mjs` needs `puppeteer-core` (a repo devDependency) and a Chromium (`CHROME_PATH`, or the Playwright cache).
The theme is one block of CSS variables in `src/theme.css`, copied from the app's tokens (#232), so a new look is a
change to that block.

## Assumptions the team must confirm

- Pitch length and format (5, 8 or 3 minutes; Q&A separate or not; own laptop or not).
- Presenters P1, P2, P3 and who drives the laptop.
- Member names and spelling on slide 1 (taken from git authors).
- Who records the 30-second video and on which machine.
- The AI-use and "built before the event" answers in `qa.md` (questions 10 and 11).
