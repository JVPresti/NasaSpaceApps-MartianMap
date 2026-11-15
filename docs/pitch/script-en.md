# Local pitch script (English)

> **Format.** Fernando's spec v2, 15 November. Hard limit 3:00, from the organisers' page quoted in `docs/SUBMISSION.md` (PR #316). The talk ends at 2:42, then the judges ask questions (`qa.md`). Story first, then an 85 s video of the real app in place of a live demo, then a 25 s close. In English. `script-es.md` is the same talk in Spanish, for reference only.

**Autoplay.** The presentation (https://martian-map.fernando-haro-c.workers.dev/?present=1) plays by itself on the beat timings below. Nobody presses anything. The speaker follows the screen. If the timing slips, **Right** or **Left** takes over manually (`demo-run-sheet.md`). The beats come from the presentation thread's PR #373 (`feat/present-story-cut`): `open` 0:00, `stakes` 0:14, `zone` 0:26, `radiation` 0:42, `demo` 0:52, `close` 2:17, end 2:42.

There are two versions of the same words. **A** uses two presenters, **B** one. Pick one in rehearsal.

**The story.** The first crew at Jezero. Two astronauts must walk to Cheyava Falls and back. Stakes, then the idea, then the video, then the close.

**Thesis.** On Mars, the question is not where you can go. It is where you can still get home. Said on the `zone` beat and again at the end.

**The moment to remember** is the zone closing on the astronaut at the radiation alert. Start "Watch a radiation alert" about 1 s before the `radiation` beat, at 0:41, so the word "alert" lands as the alert appears. Then hold two seconds of silence while the zone closes.

**Three spoken numbers only:** eight hours, twenty degrees and fourteen centimetres. Other numbers stay on screen, unspoken.

**Pace.** Every row fits at 130 words per minute (`council/timing-130.md`) and none passes 140.

## Version A: two presenters

P1 tells the story (0:00 to 0:52) and says the last lines. P2 gives the video cues and the data part of the close.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | open | P1 | The first people on Mars may land at Jezero crater, to reach Cheyava Falls, where Perseverance found a potential biosignature, unconfirmed. |
| 0:14 | stakes | P1 | Two astronauts walk out. Their suits last eight hours, and storms and radiation arrive with little warning. On Mars, nobody can come and get you. |
| 0:26 | zone | P1 | So the question is not where they can go. It is where they can still get home. Marswalk draws that answer on NASA's terrain, in orange. |
| 0:41 | radiation | P1 | Watch a radiation alert. (The alert appears at 0:42. Two seconds of silence while the zone closes.) Only the way home is left. (**Handover to P2.**) |
| 0:52 | demo | P2 | (The video plays. P2 says each chapter's cue as its card appears, below, then lets the app speak.) |
| 2:17 | close | P2 | Marswalk layers four kinds of NASA data. Our terrain matches NASA's model to fourteen centimetres. A crew could train with it before launch and plan with it on the surface. (**Handover to P1** as the names appear, about 2:31.) |
| 2:31 | close | P1 | On Mars, the question is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Thank you. |
| 2:42 | | | (End. Then questions.) |

## Version B: one presenter

The same words, all said by one presenter. No handovers.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | open | P | The first people on Mars may land at Jezero crater, to reach Cheyava Falls, where Perseverance found a potential biosignature, unconfirmed. |
| 0:14 | stakes | P | Two astronauts walk out. Their suits last eight hours, and storms and radiation arrive with little warning. On Mars, nobody can come and get you. |
| 0:26 | zone | P | So the question is not where they can go. It is where they can still get home. Marswalk draws that answer on NASA's terrain, in orange. |
| 0:41 | radiation | P | Watch a radiation alert. (The alert appears at 0:42. Two seconds of silence while the zone closes.) Only the way home is left. |
| 0:52 | demo | P | (The video plays. Say each chapter's cue as its card appears, below, then let the app speak.) |
| 2:17 | close | P | Marswalk layers four kinds of NASA data. Our terrain matches NASA's model to fourteen centimetres. A crew could train with it before launch and plan with it on the surface. |
| 2:31 | close | P | (The names appear.) On Mars, the question is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Thank you. |
| 2:42 | | | (End. Then questions.) |

## Video chapter cues

P2 in version A, the presenter in version B. Times run from the start of the 85 s video and follow the spec's chapter lengths. #373 has not posted the final chapter times yet; when it does, replace them here and rerun `node docs/pitch/tools/timing.mjs`.

| Video time | Chapter | Shows | Cue |
|---|---|---|---|
| 0:00 | 1 | Plan: mission table, the crew's needs build the route, slope layer, suit and oxygen panel | In the habitat, the crew says what the walk is for. Marswalk prices every metre from HiRISE slope and NASA suit tests. Over twenty degrees is no-go. |
| 0:20 | 2 | Return zone | The orange zone is in the app too. |
| 0:30 | 3 | Walk: airlock, EV2, HUD and minimap | Out through the airlock, with EV2, the crewmate. |
| 0:45 | 4 | Events: dust storm, then the radiation alert and the re-plan home | A dust storm, then radiation. Marswalk re-plans the way home. |
| 1:05 | 5 | Debrief: walked track against the plan | Back inside, the walk is checked against the plan. |
| 1:15 | 6 | Sources: a tag opened, then the Sources screen | Every number shows its source. |
| 1:25 | | | (Video ends. The close starts by itself.) |

## Changes from the spec

- `open`: added "unconfirmed" after "potential biosignature", the judge review's wording.
- `stakes`: "dust storms and radiation" became "storms and radiation". The spec's line ran 26 words in a 12 s slot, right at 130 wpm; now 25.
- `close`: the spec's line ran 62 words, 29 s at 130 wpm, in a 25 s slot. It drops "and every number says if it is measured, derived or simulated", because chapter 6 says it on screen a few seconds earlier. Now 51 words, 24 s.

## Criteria

| Criterion | Line |
|---|---|
| Impact | `stakes`: "On Mars, nobody can come and get you." `close`: "A crew could train with it before launch and plan with it on the surface." The challenge puts astronaut safety first, and the talk names who would use the tool and when |
| Creativity | `zone`: the orange return zone. Chapter 3: EV2, a crewmate who walks the route and reacts to events. The presentation runs in the app's own 3D engine |
| Validity | `close`: four kinds of NASA data, and the terrain checked against NASA's model to fourteen centimetres. Chapter 6: every number shows its source and its tag. Chapter 1: oxygen priced from NASA suit tests |
| Relevance | The challenge asks for "a map, tool, or interface a Mars astronaut could use", "at least three kinds of data", and names safety, space weather and spacesuits. `stakes` names the suit and the space weather, `close` names the data, the video shows the tool |
| Presentation | One story, the thesis twice (`zone`, `close`), one held moment (the alert), three spoken numbers, 2:42 under a 3:00 limit, and the speaker follows an autoplaying screen |

## Claims checked against main

Checked on `main` at 4306bbb.

| Cue | Backed by |
|---|---|
| "In the habitat, the crew says what the walk is for." | #290 (start in the habitat) and #282 (the crew's needs build the route) |
| "Marswalk prices every metre from HiRISE slope and NASA suit tests. Over twenty degrees is no-go." | `src/sim/costGrid.js` (the 20° limit), `src/sim/suitModel.js` (Minetti, calibrated to NASA's suited tests, Norcross 2008 and 2010) |
| "The orange zone is in the app too." | #335, `src/sim/returnZone.js` |
| "Out through the airlock, with EV2, the crewmate." | #290, #346, `src/sim/crewmate.js` |
| "Marswalk re-plans the way home." | `src/sim/replan.js` |
| "Back inside, the walk is checked against the plan." | The walked-route review, #282 |
| "Every number shows its source." | `src/components/SourceTag.jsx` (details popover) and the Sources screen |
| "four kinds of NASA data" | HiRISE terrain, orbital images (THEMIS, CTX, HiRISE), Curiosity RAD, Perseverance MEDA |
| "Our terrain matches NASA's model to fourteen centimetres." | `docs/data/mars-trek-check/README.md`, 0.14 m RMS over 564,001 points |

Flags:

- **"Storms and radiation arrive with little warning."** True for a solar particle event: in 2017 the dose rose at Mars about 224 minutes after the flare (DONKI to RAD). Global dust storms build over days. If a judge asks, say the storm in the app is a worst case (`qa.md`).
- **The autoplay default, the `stakes` and `close` beats and the chapter cards** are on #373 (`feat/present-story-cut`), not on `main` yet. Check them on the laptop in rehearsal.
- **"Every number shows its source."** One number on screen, the radio range, has no tag yet (`docs/VALIDITY.md`). Keep it out of the chapter 6 shot.

## Where each number comes from

| Number | Source |
|---|---|
| 8 h | `suit.eva_duration_max`, NASA xEVA Concept of Operations EVA-EXP-0042 (DATA) |
| 20° no-go | `slope.no_go`, NASA EVA-EXP-0042 Rev B (DATA). The planner blocks steeper cells and makes steeper ground cost more |
| 0.14 m | RMS height difference between our 2 m grid and NASA Mars Trek's HiRISE Jezero DEM over 564,001 points (DERIVED). `docs/data/mars-trek-check/README.md` |

The 30 min reserve, the route length, per-leg time and oxygen, the peak dose rate and the storm's opacity stay on screen, unspoken. The radiation and storm readings are real, from Curiosity at Gale crater, not Jezero. The storm's rise and the event timing are ours (SIM). "Potential biosignature, unconfirmed" follows NASA's wording for Cheyava Falls (July 2024).
