# Local pitch script (English)

> **Format.** The organisers' official guidelines (15 November, 11:00 am): at most 4 minutes, 5 to 6 slides, judged on Impact, Creativity, Validation ("is it well founded"), Presentation and Relevance. Six beats, one per slide. The talk runs 3:00 on autoplay, 60 s under the limit, then the judges ask questions (`qa.md`). The guidelines name no language. The earlier page said English, so this is the main script and `script-es.md` is a ready Spanish alternative.

**Autoplay.** The presentation (https://martian-map.fernando-haro-c.workers.dev/?present=1) plays by itself, and the speaker follows the screen. If the timing slips, press **Right** or **Left** once to take over: the first press only stops autoplay and moves nothing, and each press after it moves one beat (`demo-run-sheet.md`). The times below come from `src/present/beats.js` on #373 (`feat/present-story-cut`, 8aa3aa8): `open` 16 s, `stakes` 14 s, `zone` 18 s, `radiation` 12 s, `demo` 85 s, `close` 35 s, with the team names at 22.5 s into the close.

There are two versions of the same words. **A** uses two presenters, **B** one. Pick one in rehearsal.

**The story.** The first crew at Jezero. Two astronauts must walk to Cheyava Falls and back. Stakes, then the idea, then the video, then the close.

**Thesis.** On Mars, the question is not where you can go. It is where you can still get home. Said on the `zone` beat and again at the end.

**The moment to remember** is the zone closing on the astronaut at the radiation alert. Start "Watch a radiation alert" about 1 s before the `radiation` beat, at 0:47, so "alert" lands as the alert appears at 0:48. The zone closes between 0:50.5 and 0:57.5 (`beats.js`, `radiation` track 2.5 to 9.5 s). Stay silent until about 0:56, then say "Only the way home is left."

**Three spoken numbers only:** eight hours, twenty degrees and fourteen centimetres. Other numbers stay on screen, unspoken.

**Pace.** Every row fits at 130 words per minute (`council/timing-130.md`) and none passes 140. The beats run longer than the words, so the room has time to look.

## Version A: two presenters

P1 tells the story (0:00 to 1:00) and says the last lines. P2 gives the video cues and the data part of the close.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | open | P1 | The first people on Mars may land at Jezero crater, to reach Cheyava Falls, where Perseverance found a potential biosignature, unconfirmed. |
| 0:16 | stakes | P1 | Two astronauts walk out. Their suits last eight hours, and a radiation storm can arrive with little warning. On Mars, nobody can come and get you. |
| 0:30 | zone | P1 | So the question is not where they can go. It is where they can still get home. Marswalk draws that answer on NASA's terrain, in orange. |
| 0:47 | radiation | P1 | Watch a radiation alert. (The alert appears at 0:48. Silence while the zone closes.) |
| 0:56 | radiation | P1 | Only the way home is left. (**Handover to P2.**) |
| 1:00 | demo | P2 | (The video plays. Say each chapter's cue as it starts, below, then let the app speak.) |
| 2:25 | close | P2 | Marswalk combines NASA images, terrain, weather and radiation. We checked our terrain against NASA's own model, to fourteen centimetres. Analog field crews could rehearse with it today. Scan the code and try it. (**Handover to P1** as the team names appear, at 2:47.) |
| 2:47 | close | P1 | On Mars, the question is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Thank you. |
| 3:00 | | | (End, 60 s under the 4:00 limit. Then questions.) |

## Version B: one presenter

The same words, all said by one presenter. No handovers.

| Time | Beat | Who | Text |
|---|---|---|---|
| 0:00 | open | P | The first people on Mars may land at Jezero crater, to reach Cheyava Falls, where Perseverance found a potential biosignature, unconfirmed. |
| 0:16 | stakes | P | Two astronauts walk out. Their suits last eight hours, and a radiation storm can arrive with little warning. On Mars, nobody can come and get you. |
| 0:30 | zone | P | So the question is not where they can go. It is where they can still get home. Marswalk draws that answer on NASA's terrain, in orange. |
| 0:47 | radiation | P | Watch a radiation alert. (The alert appears at 0:48. Silence while the zone closes.) |
| 0:56 | radiation | P | Only the way home is left. |
| 1:00 | demo | P | (The video plays. Say each chapter's cue as it starts, below, then let the app speak.) |
| 2:25 | close | P | Marswalk combines NASA images, terrain, weather and radiation. We checked our terrain against NASA's own model, to fourteen centimetres. Analog field crews could rehearse with it today. Scan the code and try it. |
| 2:47 | close | P | (The team names appear.) On Mars, the question is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Thank you. |
| 3:00 | | | (End, 60 s under the 4:00 limit. Then questions.) |

## Video chapter cues

P2 in version A, the presenter in version B. The video is being re-recorded from `main` as a science compilation, in this order. **The times are placeholders**, an even split of the 85 s the `demo` beat holds, until #373 posts the re-recorded video's chapter times in its body. Then replace them and rerun `node docs/pitch/tools/timing.mjs`. The video in the repo today is `main`'s older 73.8 s cut, which does not follow this order.

| Video time | Chapter | Shows | Cue |
|---|---|---|---|
| 0:00 | 1 | Mission table, then a route saved by name | In the habitat, the crew plans the walk and saves the route by name. The planner blocks ground steeper than twenty degrees. |
| 0:11 | 2 | The airlock | Out through the airlock. |
| 0:21 | 3 | The walk with EV2 | EV2, the crewmate, walks with her. |
| 0:32 | 4 | The wrist tablet (R) switching layers | On her wrist, the same map layers. |
| 0:43 | 5 | Sampling at a rock: photo (P), stow (E), EV2 sets the case down, pour (F) | At the rock, a photo and a sample, and EV2 brings the case. |
| 0:53 | 6 | Dust storm, then radiation and the re-plan home | A dust storm, then radiation. Marswalk re-plans the way home. |
| 1:04 | 7 | Debrief, then the route saved | Back inside, the walk is checked against the plan and saved. |
| 1:15 | 8 | A source tag opened | Each reading shows where it comes from. |
| 1:25 | | | (Video ends. The close starts by itself.) |

## Changes, and why

- `open`: "unconfirmed" after "potential biosignature", the judge review's wording.
- `stakes`: "storms and radiation arrive with little warning" became "a radiation storm can arrive with little warning". Dust storms build over days. For radiation, `docs/VALIDITY.md` (warning lead time row) says a crew at Mars hears the DONKI alert about 22 min after it is issued, and a well-connected event can bring protons in tens of minutes, less than that relay time.
- `radiation`: "Only the way home is left" moved to 0:56, after the zone has closed.
- `close`, P2 part, 33 words in 22 s: the data named in plain words, the terrain check, the impact line "Analog field crews could rehearse with it today", and "Scan the code and try it" for the QR code on the close beat. The spec's "and every dataset is listed by name in the app" is cut to fit. The sources list is on screen at the same moment.
- Chapter 1: "Over twenty degrees is no-go" became "The planner blocks ground steeper than twenty degrees", which is what the planner does (`costGrid.js`). The elevation profile turned red only at 25° when this was written, so the cue does not point at it; #293 moved it to 20°.
- Chapter 8: "Each reading shows where it comes from", not "every number", because the radio range has no tag yet (#297).

## Criteria

The organisers' five criteria, in their words.

| Criterion | Line |
|---|---|
| Impact | `stakes`: "On Mars, nobody can come and get you." `close`: "Analog field crews could rehearse with it today." The challenge puts astronaut safety first, and the talk names who could use the tool now |
| Creativity | `zone`: the orange return zone, the ground the crew can still get home from. Chapters 3 and 5: EV2, a crewmate who walks with her and brings the case. The presentation runs in the app's own 3D engine |
| Validation (well founded) | `close`: "We checked our terrain against NASA's own model, to fourteen centimetres." Chapter 1: the planner's 20° limit. Chapter 8: a source tag opened. The sources are listed on screen, and in APA 7 in `sources-apa.md`. Every cue is traced in "Claims checked against main" below |
| Presentation | Six beats, one per slide. One story, the thesis twice (`zone`, end), one held moment (the alert), three spoken numbers, 3:00 against a 4:00 limit. The speaker follows an autoplaying screen, and a QR code invites the judges to try it |
| Relevance | The challenge asks for "a map, tool, or interface a Mars astronaut could use", "at least three kinds of data", and names safety, space weather and spacesuits. `stakes` names the suit and the radiation, `close` names four kinds of data in the challenge's terms (optical, topographic, atmospheric, radiation), the video shows the tool |

## Claims checked against main

Checked on `main` at 4306bbb.

| Cue | Backed by |
|---|---|
| "a radiation storm can arrive with little warning" | `docs/VALIDITY.md`, warning lead time row |
| "the crew plans the walk and saves the route by name" | #290 (habitat), #282 (the crew's needs build the route), #357 and #369 (saved routes, `src/plan/routeLibrary.js`) |
| "The planner blocks ground steeper than twenty degrees." | `src/sim/costGrid.js`, `slope.no_go` |
| "Out through the airlock." "EV2, the crewmate, walks with her." | #290, #346, `src/sim/crewmate.js` |
| "On her wrist, the same map layers." | `src/engine/wrist.js`, `src/screens/wrist/` (**R** raises the wrist) |
| "At the rock, a photo and a sample, and EV2 brings the case." | Sampling (**P**, click, **E**) and the hand-over (**F**), #282 `docs/DEMO.md`; EV2 sets the case down, `src/sim/crewmate.js` |
| "Marswalk re-plans the way home." | `src/sim/replan.js` |
| "Back inside, the walk is checked against the plan and saved." | The walked-route review (#282) and saving the EVA's route from the debrief (#369) |
| "Each reading shows where it comes from." | `src/components/SourceTag.jsx` (details popover) |
| "NASA images, terrain, weather and radiation" | `docs/CHALLENGE_FIT.md`, row 7, in the challenge's terms: optical (HiRISE, CTX, Mastcam-Z), topographic (the HiRISE DTM and slope), atmospheric (MEDA weather, dust opacity), radiation (RAD). Row 7 also counts chemical, but in the app that is only the SHERLOC and PIXL findings quoted on the Cheyava Falls stop card (`public/data/stops.json`), so the talk does not claim it |
| "We checked our terrain against NASA's own model, to fourteen centimetres." | `docs/data/mars-trek-check/README.md`, 0.14 m RMS over 564,001 points |
| "Scan the code and try it." | The QR code on the `close` beat (#373) points to https://martian-map.fernando-haro-c.workers.dev |

Flags:

- **Not on main yet.** Autoplay, the six beats, the QR code and the re-recorded video are on #373. The chapter cues follow the planned science compilation, not a file in the repo. Check them against the new video in rehearsal.
- **The independent check.** `docs/data/mars-trek-check/README.md` also matches Perseverance's own position fixes to 0.16 m RMS. It would be a fourth spoken number, so it is in `qa.md`, not the talk.

## Where each number comes from

| Number | Source |
|---|---|
| 8 h | `suit.eva_duration_max`, NASA xEVA Concept of Operations EVA-EXP-0042 (DATA) |
| 20° | `slope.no_go`, NASA EVA-EXP-0042 Rev B (DATA). The planner blocks steeper cells and makes steeper ground cost more |
| 0.14 m | RMS height difference between our 2 m grid and NASA Mars Trek's HiRISE Jezero DEM over 564,001 points (DERIVED). `docs/data/mars-trek-check/README.md` |

The 30 min reserve, the route length, the peak dose rate and the storm's opacity stay on screen, unspoken. The radiation and storm readings are real, from Curiosity at Gale crater, not Jezero. The storm's rise and the event timing are ours (SIM). Full references in `sources-apa.md`.
