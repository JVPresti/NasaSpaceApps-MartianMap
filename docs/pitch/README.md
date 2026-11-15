# Marswalk pitch

Everything the team needs to present Marswalk at NASA Space Apps 2026 (challenge "Interplanetary Survival Guide:
Martian Map", Ensenada local event). Built on the presentation mode on `main` (#330) and the first mission of #282.

> **Format.** The talk is at 2:30 pm on 15 November, in English. Hard limit 3:00, from the organisers' page quoted in
> `docs/SUBMISSION.md` (PR #316): "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos". The
> talk is `script-en.md` and ends at 2:42, then the judges ask questions (`qa.md`). It runs over the presentation mode
> (https://martian-map.fernando-haro-c.workers.dev/?present=1), one Right per beat, with an 85 s video of the real app
> in place of a live demo. `script-es.md` is the Spanish version, for reference only.
>
> **The file for the organisers is `docs/pitch/out/deck-global.pdf`**, the 7-slide deck, due by 2:00 pm. It is also
> the backup on the day: if WebGL fails on the laptop, the presenter switches to the same PDF (slide per beat in
> `demo-run-sheet.md`).

**Thesis.** On Mars, the question isn't where you can go. It's where you can go and still get home.

| File | What it is |
|---|---|
| `beats.md` | The presentation's beats on `main` (captions, chips, source lines, numbers) with the line the presenter says over each, generated from `src/present/beats.js` and `script-en.md` by `tools/sync-present.mjs`. `src/present/beats.js` on `main` is the source; this file follows it |
| `script-en.md`, `script-es.md` | **The talk**, 2:42 in English (the Spanish one is for reference): one row per beat, the video's chapter cues, the criteria it answers, the claims checked against `main`, and where each spoken number comes from |
| `demo-run-sheet.md` | How to run the talk: who presses Right on which word, setup on the live site, what to do if the video or the whole presentation fails, the PDF slide per beat, and a rehearsal checklist |
| `qa.md` | The judge Q&A sheet: about 20 questions, each with a two-sentence answer and what backs it, plus the hard questions on our limits |
| `video-30s.md` | The 30-second video script and frame-accurate shot list |
| `deck-global.html`, `out/deck-global.pdf`, `out/deck-global/*.png` | The 7-slide global deck: one self-contained HTML file (fonts and images inlined), its PDF and one PNG per slide |
| `fallback/stills/` | Real screenshots of the app from #282, for when the video beat fails |
| `council/` | The council of AI reviewers playing judges, not people: rubric, every round's raw JSON, `log.tsv`, timing checks |
| `src/`, `img/`, `fonts/`, `tools/` | Deck sources and the scripts that build it |

## Which number is which

The pitch, the challenge-fit doc (#328) and the technical report (#338) quote distances and margins from different
builds and scenarios. Each one is right for its source. Say the pitch's numbers, and name the source if a judge has read
the others.

| Number | Where it comes from | Used in |
|---|---|---|
| 913 m, habitat to Cheyava Falls | Our planner export on `main` (`tools/walkback-zone.mjs`, `planRoute` through WP1, WP2 and WP3; legs 356 + 255 + 242 + 60 m in `data/walkback-zone.json`) | On screen in the `plan` beat, slide 2, the video |
| 934 m | #282's mission table, goal **Sample Cheyava Falls**, Fastest profile, by Bright Angel (`docs/DEMO.md` on 8ec6f72) | What the screen shows in the demo; don't read it aloud |
| 62 g, 21 min home | The planned 913 m route walked back with the +20 % pad: `public/present/plan.json`, `totals.returnO2G` 61.8 g and `returnTimeMin` 21.3. The presentation and the technical report (#338) use the same figure | Slide 2, slide 3, the 30 s video |
| 11 min margin | Our SIM scenario: 160 g left at Cheyava Falls, minus 62 g home and the 72.5 g reserve, at 2.42 g/min | Slide 3 only. The talk speaks no margin figure |
| +399 min | The HUD on `main`, 40 m from home with a full tank (screenshot `img/app-hud-margin.jpg`) | Slide 3 caption, `qa.md` 5c |
| +457 and +245 min | `main`, Fastest profile to Cheyava Falls: HUD at the airlock and the Suit tab (#328) | Not in the pitch |

The HUD and the Suit tab disagree because the HUD takes the smaller of the oxygen margin and the 8-hour EVA clock
(#323). The peak dose rate now matches: the presentation (#356) and #338 both show 29.9 µGy/h, 10 µGy/h at the alert. The talk speaks neither.

## Rebuild

```
node docs/pitch/tools/render.mjs           # src/*.html -> self-contained HTML, PNG per slide, PDF
node docs/pitch/tools/timing.mjs           # every script row against its slot at 140 wpm, the ceiling; the scripts are written for 130
node docs/pitch/tools/timing.mjs --wpm 130 --out council/timing-130.md script-en.md script-es.md
node docs/pitch/tools/sync-present.mjs     # main's src/present/beats.js + script-en.md -> beats.md
node docs/pitch/tools/sync-present.mjs --beats <file>   # the same from an open PR's beats.js (git show origin/<branch>:src/present/beats.js > <file>)
node docs/pitch/tools/walkback-zone.mjs    # walkback zone and leg numbers from src/sim (for beats 1 and 3)
```

`render.mjs` needs `puppeteer-core` (a repo devDependency) and a Chromium (`CHROME_PATH`, or the Playwright cache).
The theme is one block of CSS variables in `src/theme.css`, copied from the app's tokens (#232), so a new look is a
change to that block.

## Assumptions the team must confirm

- That the limit is 3:00, that Q&A follows, and whether we can plug in our own laptop.
- Presenters P1, P2, P3, and who answers each question in `qa.md`.
- That the presentation thread's story cut (`feat/present-story-cut`) is deployed before 2:30 pm, and where its backup mp4 lives.
- Who records the 30-second video and on which machine.
