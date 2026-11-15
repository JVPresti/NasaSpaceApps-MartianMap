# Pitch script (English)

The talk is 3:26 on the presentation mode, against the 4:00 limit. Seven slides, one per beat:
https://martian-map.fernando-haro-c.workers.dev/?present=1

## How to drive it

The presentation opens **paused** on slide 1 behind a **Play** button. Nothing moves until someone presses it.

| Key | Does |
|---|---|
| **Play** button, **Space**, **P** | Play. Pressed again, pause. Pausing freezes the slide and the video in place |
| **Right**, **PageDown**, **Enter** | Next slide, at once. Playing stays playing, paused stays paused |
| **Left**, **PageUp** | Previous slide, from its start |
| **1** to **7** | Jump straight to that slide. "Go to slide 4" means press 4 |
| **L** | English or Spanish captions |
| **Esc** | Leave the presentation. Don't press it during the talk |

The slide number sits in the bottom right corner, `4 / 7`, with PLAYING or PAUSED beside it.

If a judge interrupts, press **P**. Press **P** again to carry on from the same frame.

## The slides

| Slide | Beat | Length | Starts at | On screen |
|---|---|---|---|---|
| 1 | `open` | 22 s | 0:00 | The fall from orbit to Jezero, then Cheyava Falls |
| 2 | `plan` | 22 s | 0:22 | The route to Cheyava Falls, each leg in minutes and grams of O2, the slope at the bend |
| 3 | `zone` | 24 s | 0:44 | The orange return zone shrinking as the clock runs |
| 4 | `radiation` | 16 s | 1:08 | The alert, and the zone closing on the astronaut, 1:11 to 1:21 |
| 5 | `demo` | 74 s | 1:24 | The app video, six chapters |
| 6 | `sources` | 18 s | 2:38 | Measured, derived or simulated, and the 0.14 m terrain check |
| 7 | `close` | 30 s | 2:56 | The references until 3:15, then the team and the QR code. It holds there |
| | end | | 3:26 | |

The `demo` slide lasts exactly as long as the video file. If a longer cut replaces `public/present/demo.mp4`, every time after 1:24 moves by the difference.

## Rules for the speakers

- **Thesis.** "The question is not where you can go. It is where you can still get home." Said on slide 3 and again at the very end.
- **Three spoken numbers only:** eight hours, twenty degrees, fourteen centimetres. Every other number stays on screen.
- **The moment to remember** is slide 4. Say "Watch a radiation alert" and then stay quiet while the zone closes. The silence is the point.
- **During the video, say the cue as the chapter starts, then stop talking.** The cues are short on purpose. Let the judges watch.

## Version A: two presenters

P1 tells the story and says the last lines. P2 narrates the video and the data part. P3, or whoever isn't speaking, stands at the laptop.

| Time | Slide | Who | Say |
|---|---|---|---|
| 0:00 | 1 | P3 | *Press Play.* |
| 0:00 | 1 | P1 | The first people on Mars may land at Jezero crater, to reach Cheyava Falls, where Perseverance found a potential sign of past life. Their suits last eight hours. On Mars, nobody can come and get you. |
| 0:22 | 2 | P1 | Marswalk plans the walk on NASA's HiRISE terrain. It prices every metre in oxygen, and it goes around any slope steeper than twenty degrees. |
| 0:44 | 3 | P1 | So the question is not where they can go. It is where they can still get home. Marswalk draws that answer in orange, and it shrinks as the oxygen runs down. |
| 1:07 | 3 → 4 | P1 | Watch a radiation alert. *Start one second before the slide changes, so "alert" lands with the alert.* |
| 1:09 | 4 | | *Silence. The zone closes on the astronaut, 1:11 to 1:21.* |
| 1:21 | 4 | P1 | Only the way home is left. *Hand over to P2.* |
| 1:24 | 5 | P2 | *The video starts. Say each chapter's cue below as it appears.* |
| 2:38 | 6 | P2 | Every number on screen says whether a NASA mission measured it, we derived it, or we simulated it. We checked our terrain against NASA's own model, to fourteen centimetres. |
| 2:56 | 7 | P2 | Marswalk combines NASA images, terrain, weather and radiation. Analog field crews could rehearse with it today. |
| 3:15 | 7 | P1 | *The team names and the QR code appear.* The question is not where you can go. It is where you can still get home. We are Los Frijolitos Espaciales Refritos Nueva Generación. Scan the code and try it. Thank you. |
| 3:30 | | | *End. The last slide holds. Questions.* |

## Version B: one presenter

The same words. One person says all of them, and the laptop operator presses Play. No handovers.

## The video, slide 5

The cut on the branch is 74 s, recorded on the live app. Its captions are burned in, in English.

| Video | Talk | Shows | Cue |
|---|---|---|---|
| 0:00 | 1:24 | The return zone on the mission table | In orange, where the crew can still get home. |
| 0:05 | 1:29 | The zone tightening with 30 min | With less time, the zone tightens. |
| 0:11 | 1:35 | The crew's needs building the route | The crew's needs build the route. The planner blocks ground steeper than twenty degrees. |
| 0:23 | 1:47 | The airlock and the walk with EV2 | Out through the airlock, with EV2, the crewmate. |
| 0:37 | 2:01 | The radiation alert | Radiation. EV2 turns home too. |
| 1:03 | 2:27 | The debrief | Back inside, the walk is reviewed. |
| 1:14 | 2:38 | | *The video ends. Slide 6 starts by itself.* |

## Where each spoken number comes from

| Number | Source |
|---|---|
| Eight hours | NASA xEVA Concept of Operations, EVA-EXP-0042 Rev B. A planning limit our suit model applies, tagged SIM on screen |
| Twenty degrees | NASA EVA-EXP-0042 Rev B, the suited walking limit. `slope.no_go` in `src/sim/costGrid.js` blocks steeper cells |
| Fourteen centimetres | 0.14 m RMS between our 2 m grid and NASA Mars Trek's HiRISE Jezero model over 564,001 points. `docs/data/mars-trek-check/README.md` |

## Tags on screen

DATA means a NASA mission measured it. DERIVED means we computed it from data. SIM means it's our model, our choice or our scenario. On the slides:

- **DATA:** the imagery and terrain, Cheyava Falls as a potential biosignature, RAD's dose rates from Curiosity at Gale.
- **DERIVED:** the 0.14 m terrain check.
- **DERIVED:** the route legs, their oxygen and the slope at the bend on slide 2.
- **SIM:** the habitat, since we placed it. The return zone, the walking speed and the storm and alert timing.

If a judge asks why the habitat is SIM, the answer is short. No habitat stands at Jezero. We chose where to put it.
