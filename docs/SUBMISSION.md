# Space Apps submission draft

Every field of the 2026 project form, drafted in English, in the order the form shows them. Paste each block into the team's project page on spaceappschallenge.org. Field names and help text come from the live form and the [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/).

Facts in this draft match `docs/VALIDITY.md`. If a number changes there, change it here.

## Before you press submit

Deadline: **Sunday 15 November, 11:59 pm Ensenada time** (PST, UTC-8), which is 07:59 UTC on 16 November. "Any projects saved or submitted past this deadline will not be eligible for judging." "Only your last saved submission will be reviewed by the judges." Aim for 10:59 pm.

The Ensenada event has its own deadlines and deliverables, from the [Ensenada local event page](https://www.spaceappschallenge.org/2026/local-events/ensenada/):

| Time (PST) | What | Notes |
|---|---|---|
| 2:00 pm | Send the presentation to the organisers | "prepárate para exponer en idioma inglés durante un tiempo máximo de 3 minutos" (present in English, 3 minutes at most) |
| 2:30 pm | Present to the local judges | Local winners become Global Nominees directly |
| 11:59 pm | Upload the **technical report** and the **final presentation** through the portal, both in English | The report must contain "your team members, the challenge you solved, your resolution methodology, and evidence of it" |

The portal's project page takes images only ("DOES NOT allow for the upload of videos or documents"). Ask the local lead today how they want the technical report. Our default: export this file plus `docs/VALIDITY.md` as one PDF, put it at a public link, and add that link under "Space Agency Partner & Other Data" with the text "Technical report".

Checklist:

- [ ] The form is filled in on the team's project page, not anywhere else
- [ ] **Project Demonstration** link opens with no login: a video of 30 seconds or less with English subtitles, or 7 slides or fewer. Over that limit the project is not eligible for global judging
- [ ] **Project** link opens with no login. The repository is **private** today. Either make it public or use the deployed site as this link. A private repo link fails the rule: "If judges can't access your project, it can't be evaluated or judged."
- [ ] SI watermark on the start video and the hazard images ([#301](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/301))
- [ ] The local lead has heard about the pre-event assets and answered (`docs/RULES.md`, section 1)
- [ ] No one under 18 appears or speaks in the demo video
- [ ] Both checkboxes ticked: Terms and Conditions, and "Confirm All Work is Original"
- [ ] Technical report and final presentation uploaded for the Ensenada event

## Project Name

> Marswalk

## Summary

Help text: "What did you develop? How does it address the challenge? Why is it important? We suggest a 50-200 word summary."

> On Mars, the question isn't where you can go. It's where you can go and still get home.
>
> Marswalk answers it for one real place: a 1.4 by 1.5 km patch of Neretva Vallis in Jezero crater, around Cheyava Falls, the rock where Perseverance found a potential biosignature. From NASA's HiRISE terrain model, we build a slope map that blocks ground steeper than NASA's 20° suited walking limit. An A* planner routes the astronaut through it, and we cost every leg in minutes and grams of oxygen. The oxygen comes from the 771 g tank of NASA's xEMU suit design, burned at rates from NASA suited treadmill tests, with Apollo's 30-minute reserve held back. Then you walk the route in first person. A dust storm, a replay of the September 2017 solar storm that Curiosity measured, or a low-oxygen warning re-plans the route back to the habitat. Every number on screen says whether a NASA mission measured it, we calculated it, or we assumed it. We checked all 106 against their sources.

172 words.

## Project Demonstration

> [DEMO LINK: public video of 30 s or less with English subtitles, or 7 slides or fewer]

Use the full URL starting with `https://`. YouTube (unlisted is fine), Google Slides with link sharing on, or a PDF on a public host all work. Test it in a private browser window.

## Project

> https://martian-map.fernando-haro-c.workers.dev

The deployed app on Cloudflare Workers (`martian-map`). It opens with no login. If the team makes the repository public before the deadline, add https://github.com/JVPresti/NasaSpaceApps-MartianMap in Project Details. The guide says "the majority of judges' evaluation will be based on your project submission", and the README is written for judges.

## Project Details

Help text: "What does it do or how does it work? What benefits does it have? What is the intended impact of the project? What tools, coding languages, hardware, or software did you use to develop your project? How is your project creative? What factors did your team consider?"

Paste everything inside the box. The form takes rich text, so the headings survive.

> **What it does**
>
> Marswalk is a planning map and a walking test for one marswalk. The astronaut leaves the habitat in Neretva Vallis, Jezero crater, walks to Cheyava Falls and the Bright Angel outcrop, takes a sample and walks home. The site is a 1422 m by 1500 m tile of real terrain centred on the spot where Perseverance stood on sol 1210.
>
> The map comes first. On the mission table the crew sees the site from above with four data layers: slope hazard, elevation, rock abundance and outcrop. Perseverance's 47 real drives across the tile and the places where it took its photos of the rock are drawn on top. The planner offers three routes, fastest, gentlest and in radio contact with the habitat, and shows for each one the distance, the climb, the steepest slope, the walking time, the oxygen used and the oxygen left at the turnaround after the walk home and the reserve. The crew picks one and makes the go or no-go call.
>
> Then the astronaut walks it, in first person, with a helmet display and a wrist screen. The helmet shows only what matters while walking: oxygen, the margin before turning back, the next waypoint, slope ahead, radio link, and a position estimate with its error. There is no GPS on Mars, so position drifts by dead reckoning and resets when the astronaut stops for a terrain fix. Perseverance has done the same against orbital maps since February 2026. A partner astronaut walks alongside. At the rock the astronaut photographs, samples and seals.
>
> Three events break the plan. A dust storm raises the optical depth from Jezero's clear-season 0.45 to 8.0, the value Curiosity saw in Gale crater in the 2018 global storm. A radiation alert replays the September 2017 solar particle event. An X8.2 flare peaked at 16:06 UTC. 224 minutes later Curiosity's RAD saw the dose rate start to climb at Mars, and it peaked at three times background. A low-oxygen warning fires when the oxygen left no longer covers the walk home plus the reserve. Each event raises an alert and re-plans the route to the nearest shelter, and the habitat is the only full shelter. Back inside, a debrief shows distance, time outside, dose and samples.
>
> **How it works**
>
> Terrain. NASA and USGS made the HiRISE terrain model (1 m pixels) and orthophoto (25 cm) of Jezero to land Perseverance by terrain-relative navigation. We cut our tile from those products and resample the heights to a 751 by 751 grid. Our terrain matches the HiRISE model that NASA Mars Trek serves to 0.14 m RMS over the whole tile, and Perseverance's own position fixes to 0.16 m RMS. A CTX terrain model (20 m) and mosaic (6 m) give the 12 km horizon.
>
> Route. Each cell costs 1 + (slope / 9°)² + 0.6 x rock abundance. Ground steeper than 20°, NASA's suited walking limit in the xEVA Concept of Operations, is blocked. A* runs in a Web Worker and finds a route across the tile in the browser.
>
> Suit and oxygen. The suit is NASA's xEMU design: 771 g of usable primary oxygen, a 756 Wh battery, 8 hours maximum, 4.3 psi. Walking cost comes from Minetti et al. 2002, scaled from Earth gravity to Mars gravity and calibrated to NASA's suited walking tests at 3/8 g (Norcross et al. 2008 and 2010). Walking 1 km on flat ground at 1 m/s costs 589 W and 40 g of oxygen, 5 % of the tank. On slopes the astronaut slows to keep the same effort. The walk home gets Apollo 15's 20 % pad, and the margin keeps Apollo 17's 30-minute reserve. Margin under 15 minutes is a caution. At zero it is a warning, and the crew turns back.
>
> Weather and radiation. Temperature, pressure and humidity replay sol 1187 from Perseverance's MEDA station, recorded within 12 m of the scene origin. Wind comes from sol 312, because MEDA's wind sensor was damaged and the archive has no wind after sol 315. The label says so. Radiation comes from Curiosity's RAD in Gale crater, the only surface radiation measurement on Mars. The display says "Gale crater, not Jezero" every time.
>
> Provenance. Every number on screen carries a tag: DATA (a NASA mission measured it or a NASA document states it), DERIVED (we calculated it from data) or SIM (our model or a scripted event). Hover a tag to see the mission, instrument, sol and reference. We checked all 106 numbers against their primary sources. 81 match, 13 are our stated assumptions, and we list the 11 that were wrong or mislabelled with an issue for each (docs/VALIDITY.md in the repository).
>
> **Benefits**
>
> A mission planner can see in one screen why a route is safe or not: which stretch is steep, where the oxygen goes, how much margin is left at the far point. The margin follows the walker in real time. A crew member can check a walk against the same rules Apollo crews followed, on terrain that matches the rover's own position fixes to 16 cm.
>
> **What we hope to achieve**
>
> We want an EVA planning tool that is honest about the gap between data and model. The route is advice, not a safety certificate: a 2 m height grid does not see a 30 cm rock, and the app says so. The same pipeline works for any site with a HiRISE terrain model. Jezero is the first because it has the most ground truth.
>
> **How it is creative**
>
> Most Mars maps answer "what is here?". Ours answers "can I get there and back on what is in my tank?" and redraws the answer as the astronaut walks. The data is not a backdrop. A replayed NASA solar storm changes the route, and NASA's suit specs set the turnaround point.
>
> **Factors we considered**
>
> Realism over drama. Observations are labelled historical, never live. Radiation is labelled with its real site. Navigation never claims GPS. We dropped a THEMIS thermal view because its 100 m pixels put 15 by 15 pixels on the whole site. We dropped a geology map because it sits 100 to 200 m off the terrain. The interface runs on keyboard, mouse, touch and gamepad, in English and Spanish, and picks a lower graphics tier on integrated GPUs.
>
> **Tools and languages**
>
> JavaScript, React 19, Vite, three.js, Zustand, Web Workers, Web Audio, Vitest and oxlint. Blender for the terrain mesh, the suit rig and the habitat. Node.js scripts build the data files from NASA archives (PDS, DONKI, MMGIS, the Mars 2020 raw images API). Hosted on Cloudflare Workers. Python for the audit's recomputations.
>
> **Use of SI**
>
> [Paste the disclosure from docs/RULES.md, section 2.]
>
> **Prior work**
>
> [Paste the statement from docs/RULES.md, section 1, after the local lead has answered.]

## Use of Super Intelligence (SI)

The form answer is not shown to judges. Tick the boxes listed in `docs/RULES.md`, section 2. Do not tick "Building SI/ML Into the Project": Marswalk runs no model.

## NASA Data

Help text: "In order to be eligible for a Global Award, you must use NASA data or resources. ... Please list all NASA data or resources used in your project."

The form takes one link per row, with link text. Add these rows.

| Link text | URL | What we use it for |
|---|---|---|
| HiRISE DTM mosaic for Mars 2020 TRN, Jezero, 1 m (JEZ_hirise_soc_006), USGS | https://doi.org/10.5066/P9REJ9JN | Terrain heights, slope, routes, sky view, line of sight |
| HiRISE orthomosaic for Mars 2020 TRN, Jezero, 25 cm, USGS | https://doi.org/10.5066/P9QJDP48 | Ground photo on the terrain |
| CTX DTM mosaic for Mars 2020 TRN, Jezero, 20 m, USGS | https://doi.org/10.5066/P906QQT8 | 12 km horizon ring |
| CTX orthomosaic for Mars 2020 TRN, Jezero, 6 m, USGS | https://doi.org/10.5066/P9GV1ND3 | Horizon ring photo |
| NASA Mars Trek, HiRISE Jezero DEM | https://trek.nasa.gov/mars/ | Checking our terrain: 0.14 m RMS |
| Mars 2020 MEDA bundle, PDS Atmospheres node, sols 1187 and 312 | https://doi.org/10.17189/1522849 | Temperature, pressure, humidity and wind replay |
| MSL RAD reduced data, PDS PPI node | https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/ | Background dose and the September 2017 event curve |
| NASA CCMC DONKI, flare 2017-09-10T15:35:00-FLR-001 | https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=2017-09-10&endDate=2017-09-10 | Flare time and class for the radiation event |
| NASA CCMC DONKI notifications, 10 September 2017 | https://ccmc.gsfc.nasa.gov/DONKI/WS/get/notifications?startDate=2017-09-10&endDate=2017-09-10&type=all | First alert time, warning lead time |
| Mars 2020 Where is the rover, MMGIS traverse | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json | Perseverance's 47 drives on the map |
| Mars 2020 Where is the rover, MMGIS waypoints | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json | Tile origin, image pins |
| Mars 2020 raw images, Mastcam-Z, sol 1187 | https://mars.nasa.gov/mars2020/multimedia/raw-images/ZL0_1187_0772321307_818EBY_N0541010ZCAM09237_0630LMJ | Science stop image at Bright Angel |
| Mars 2020 raw images gallery, sols 1211 to 1217 | https://mars.nasa.gov/mars2020/multimedia/raw-images/ | Colour reference for the terrain tint |
| PIA26336, Perseverance Views Bright Angel | https://science.nasa.gov/photojournal/perseverance-views-bright-angel/ | Science stop card |
| PIA26368, Perseverance Finds a Rock with Leopard Spots | https://science.nasa.gov/photojournal/perseverance-finds-a-rock-with-leopard-spots/ | Science stop card |
| PIA26401, Mastcam-Z Views the Cheyava Falls Workspace | https://science.nasa.gov/photojournal/mastcam-z-views-the-cheyava-falls-workspace | Model of the Cheyava Falls rock |
| xEMU PLSS, CTSD-ADV-959 Rev A, NTRS 20170009505 | https://ntrs.nasa.gov/citations/20170009505 | Suit oxygen and battery |
| Exploration EVA System Concept of Operations, EVA-EXP-0042 Rev B | https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf | 20° slope limit, 8 h EVA, 4.3 psi, 2 km/h |
| Ogilvie et al. 2026, Mars Spacesuit Mass Requirements, NTRS 20260003038 | https://ntrs.nasa.gov/citations/20260003038 | Design metabolic rates |
| Apollo 17 Lunar Surface Procedures vol. 2 | https://pds-geosciences.wustl.edu/Lunar/urn-nasa-pds-apollodoc/document_a17/mission/a17_final_lunar_surface_procedures_vol2_contingency.pdf | 30 min reserve |
| Apollo 15 EVA Capability and Constraints Envelopes, Bellcomm B70 10028 | https://webarchive.library.unt.edu/eot2008/20090109180220id_/http://www.hq.nasa.gov/alsj/19790073512_1979073512.pdf | 20 % walkback pad |
| Biomedical Results of Apollo, NASA SP-368, NTRS 19760005584 | https://ntrs.nasa.gov/citations/19760005584 | Apollo EVA metabolic rates |
| Suited 10 km walkback, Norcross et al. 2008, NTRS 20080014853 | https://ntrs.nasa.gov/citations/20080014853 | Suited walking cost at 3/8 g |
| Suited 10 km ambulation, NASA/TP-2009-214796 | https://www.lpi.usra.edu/lunar/artemis/NorcrossEtAl_NASA-TP-2009-214796_EVA%20Walkback%20Test.pdf | Suited walking speed |
| Inclined ambulation in a planetary suit, NASA/TP-2010-216125 | https://ntrs.nasa.gov/citations/20110003409 | Suited climbing cost |
| EVA metabolic rate from heart rate, Hoffmann 2021, NTRS 20210024317 | https://ntrs.nasa.gov/citations/20210024317 | Reference only, not on screen |
| Design for Ionizing Radiation Protection, OCHMO-TB-020 Rev E | https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf | 600 mSv career and 250 mSv solar event limits |
| NASA Watches Mars Light Up During Epic Solar Storm, 2024 | https://www.nasa.gov/missions/maven/nasa-watches-mars-light-up-during-epic-solar-storm/ | May 2024 event dose for comparison |
| Perseverance autonomous localization, JPL, February 2026 | https://www.jpl.nasa.gov/news/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars | Terrain fix model |
| NASA GISS Mars24 | https://www.giss.nasa.gov/tools/mars24/help/notes.html | Sol length and local solar time |
| NASA 3D Resources, Z-2 Spacesuit | https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Z2%20Spacesuit | Astronaut model |
| NASA 3D Resources, Habitat Demonstration Unit | https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Habitat%20Demonstration%20Unit | Habitat model |

That is 32 rows: 13 data products and services, 3 Photojournal images, 13 NASA documents and pages, Mars24 and 2 NASA 3D models. `docs/credits.md` holds the full list with credits and licences.

## Space Agency Partner & Other Data

Help text: "Resources should include any code, text, and images (even if they are open source or freely available) ... All links must be publicly accessible."

| Link text | URL |
|---|---|
| Technical report (Ensenada) | [PUBLIC LINK TO THE PDF] |
| Bell et al. 2022, Mastcam-Z results in Jezero, Science Advances | https://doi.org/10.1126/sciadv.abo4856 |
| Lemmon et al. 2022, dust storm in Jezero, GRL | https://doi.org/10.1029/2022GL100126 |
| Smith et al. 2019, visibility in Gale during the 2018 storm, GRL | https://doi.org/10.1029/2019GL083788 |
| Sánchez-Lavega et al. 2025, dust storms at Jezero, JGR Planets | https://doi.org/10.1029/2024JE008565 |
| Hassler et al. 2014, Mars surface radiation, Science | https://doi.org/10.1126/science.1244797 |
| Guo et al. 2015, RAD dose rate variations, ApJ | https://doi.org/10.1088/0004-637X/810/1/24 |
| Zeitlin et al. 2018, September 2017 solar particle event at Mars, GRL | https://doi.org/10.1029/2018GL077760 |
| Hurowitz et al. 2025, Cheyava Falls, Nature | https://doi.org/10.1038/s41586-025-09413-0 |
| Minetti et al. 2002, walking cost on slopes, J Appl Physiol | https://doi.org/10.1152/japplphysiol.01177.2001 |
| Farley and McMahon 1992, reduced-gravity walking, J Appl Physiol | https://doi.org/10.1152/jappl.1992.73.6.2709 |
| Golombek et al. 2003, Mars rock size model, JGR | https://doi.org/10.1029/2002JE002035 |
| NIST Chemistry WebBook, oxygen density | https://webbook.nist.gov/cgi/fluid.cgi?ID=C7782447&Action=Page |
| NSSDC Mars fact sheet | https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html |
| Poly Haven rock, boulder and prop models and textures (CC0) | https://polyhaven.com/ |
| Higgsfield, SI-generated start video and hazard illustrations | https://higgsfield.ai |
| three.js (MIT) | https://github.com/mrdoob/three.js |
| React (MIT) | https://github.com/facebook/react |
| Zustand (MIT) | https://github.com/pmndrs/zustand |
| Barlow font (OFL) | https://github.com/jpt/barlow |
| IBM Plex Mono font (OFL) | https://github.com/IBM/plex |
| Credits and licences for every asset | https://martian-map.fernando-haro-c.workers.dev (Sources screen, key C) |

Sánchez-Lavega 2025, Lemmon 2022 and Bell 2022 are Perseverance team papers. Hassler, Guo and Zeitlin are Curiosity RAD team papers. They sit here because they are journal articles, not NASA archives.

## Verification checkboxes

- **Agree to Terms and Conditions:** read the [2026 Terms](https://www.spaceappschallenge.org/legal/) first. Original content must be open source. Without a licence, NASA distributes it under Apache 2.0.
- **Confirm All Work is Original:** true for the team's own work, as long as every external resource above is listed. The prior-work question is separate and goes to the local lead.

## Numbers the pitch and video must not claim

From the audit. Each of these appears in an old plan, a mockup or a reasonable guess, and each is false for the build.

- A CRISM mineral layer, a THEMIS thermal layer or a geology map. None is in the app.
- "Live" weather or radiation. Everything is a replay of a past sol or event.
- Radiation measured at Jezero. It was measured in Gale crater.
- "1 m resolution" without "resampled to 2 m".
- An Earth-Mars communication delay. The app does not model one. If asked: 4 to 24 minutes one way.
- "Real sun shadows". The Sun is set for the wrong season ([#294](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/294)).
- The HUD dose during the radiation event as what the 2017 event delivered. The game squeezes 57 hours into 12 minutes. The real event added 544 µGy ([#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295)).
- A natural shelter cutting radiation by 15 %. RAD measured 4 % for a similar sky block ([#296](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/296)).
- GPS, or NASA as a partner or endorser.
- "Every number verified correct". Say "all 106 numbers checked against their sources, with the 11 problems listed".
