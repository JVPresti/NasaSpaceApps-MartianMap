# Validity audit

Marswalk tags the numbers it shows: DATA (measured by a NASA mission or stated in a NASA document), DERIVED (we calculated it from DATA) or SIM (our model, our assumption or a scripted event). One number on screen, the radio range, has no tag yet ([#297](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/297)). This page checks whether each tag is true. It covers 109 numbers. For 106 of them, an AI research agent opened the primary source, found the sentence or table the number comes from, and compared it with the value in `public/data/` or `src/sim/`. The other 3 come from a paper the publisher would not serve, so we checked them against its abstract and the papers that quote it. We reviewed each finding and recomputed the walking model with a script.

Audit done 2026-11-15 on `main` at `013f2d5`. It repeats the research behind `public/data/hazards.json` (#18) from scratch rather than trusting the quotes stored in that file. Downloaded copies of every source and the script that recomputes the walking model stayed outside the repository.

## Verdicts

| Verdict | Meaning |
|---|---|
| matches | The source prints the same number, or one that converts to it exactly |
| rounded | Same number to the precision we show, or a rounding we chose and can name |
| assumption we state | No source gives this number. We picked it and the app tags it SIM, or the note says how we chose it |
| mislabelled | The number is defensible but the tag, page or wording around it is wrong |
| wrong | The number on screen disagrees with its source, or with the date or place the app says it shows |
| not verified | We could not open the source. The row says why |

## Result

109 numbers checked. 79 match their source or round to it. 11 are our own assumptions, labelled SIM in the app. 14 are defensible numbers with the wrong tag, page or wording around them. 2 are wrong on screen. 3 come from a paper the publisher would not let us open.

| Verdict | Count |
|---|---|
| matches | 72 |
| rounded | 7 |
| assumption we state | 11 |
| mislabelled | 14 |
| wrong | 2 |
| not verified | 3 |

The two wrong numbers:

- The elevation profile turns red above 25°. The planner, the slope layer and NASA's suited limit all say 20° ([#293](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/293)).
- The Sun uses an 11° declination, a value from another season. On sol 1210 the real noon Sun at Cheyava Falls is about 48° up. The game draws it at 82.5° ([#294](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/294)).

The three not verified all come from Zeitlin et al. 2018: the event rates in Table 1, the 544 µGy event dose and the 7 h doubling time. The publisher blocked every scripted download. The abstract and three papers that quote it agree with our numbers.

Each row counts one number. A row can match and still carry a wrong page number or a loose note, so [#300](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/300) collects 19 such slips, more than the 14 mislabelled rows.

No measured value in the weather, terrain, suit or physiology rows disagreed with its source. The trouble sat in what we built on top of the data: a ramp step tagged DATA, a reserve held at the wrong rate, a shelter dose cut that treats every part of the sky the same, a rock layer read from image brightness.

## Measured: terrain and imagery

The map, the slope layer, the cost grid and the route planner all read one height grid. Blender exports that grid and the visible terrain mesh from the same scene, so the two agree.

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| HiRISE DTM resolution | 1 m, resampled to a 751 x 751 grid | "Pixel Resolution (meters/pixel) 1" | [USGS, Fergason et al. 2020, doi 10.5066/P9REJ9JN](https://doi.org/10.5066/P9REJ9JN) | matches. The grid cells are 1.90 m east-west and 2.00 m north-south, so the app sees 2 m detail, not 1 m. Say "1 m DTM resampled to 2 m" |
| HiRISE orthomosaic | 25 cm | "Pixel Resolution (meters/pixel) 0.25" | [USGS, doi 10.5066/P9QJDP48](https://doi.org/10.5066/P9QJDP48) | matches |
| CTX DEM (horizon ring) | 20 m | "Pixel Resolution (meters/pixel) 20" | [USGS, doi 10.5066/P906QQT8](https://doi.org/10.5066/P906QQT8) | matches |
| CTX orthomosaic | 6 m | "Pixel Resolution (meters/pixel) 6" | [USGS, doi 10.5066/P9GV1ND3](https://doi.org/10.5066/P9GV1ND3) | matches |
| Tile origin, Cheyava Falls | 18.4975 N, 77.3053 E, sol 1210 | Waypoint 55_434, sol 1210, at 18.49751379 N, 77.30527379 E | [MMGIS M20_waypoints.json](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json) | rounded (4 decimals, about 1.7 m) |
| Base elevation | -2393.37 m MOLA | Lowest point of the HiRISE tile, read from the DTM | Same USGS DTM | matches (read from the file, not a printed number) |
| Our grid against Mars Trek | 0.14 m RMS over the tile | Mars Trek serves the same JEZ_hirise_soc_006 DTM | [mars-trek-check](data/mars-trek-check/README.md) | matches. This proves our resampling reproduces the USGS DTM. It does not prove the DTM is true, and the rover positions it was also compared with are tied to orbital maps, so they are not independent |

## Measured: Perseverance at the site

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| Traverse on the map | 47 drives, sols 1140 to 1266, 2827 m inside the tile | All 47 (sol, from, to) triples exist in the MMGIS traverse. Unclipped length 2909 m | [MMGIS M20_traverse.json](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json) | matches |
| Mastcam-Z frame, sol 1187 | ZL0_1187_0772321307 at site 54, drive 1010 | Present in the sol 1187 feed: MCZ_LEFT, site 54, drive 1010, 2024-06-22T09:57Z | [Mars 2020 raw images API, sol 1187](https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol=1187) | matches |
| Leopard spots image | sol 1212 | "on July 18, 2024, the 1,212th Martian day" | [PIA26368](https://science.nasa.gov/photojournal/perseverance-finds-a-rock-with-leopard-spots/) | matches |
| Cheyava Falls workspace | sol 1217 | "July 23, 2024, the 1217th day" | [PIA26401](https://science.nasa.gov/photojournal/mastcam-z-views-the-cheyava-falls-workspace) | matches |
| Core collected | 21 July 2024 | "collected on July 21" | [NASA, 25 July 2024](https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-rover-scientists-find-intriguing-mars-rock/) | matches |
| "Potential biosignature" | 2025 | "warrant consideration as 'potential biosignatures'", Nature 645, 332-340, 10 September 2025 | [Hurowitz et al. 2025](https://doi.org/10.1038/s41586-025-09413-0) | matches. NASA applies the term to the Sapphire Canyon core taken from Cheyava Falls |
| Terrain fix since February 2026 | rule 4 in CONTEXT.md | "first used successfully in regular mission operations on Feb. 2", "within some 10 inches (25 centimeters)", "takes about two minutes" | [JPL, 18 February 2026](https://www.jpl.nasa.gov/news/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars) | matches. The rover matches navigation camera panoramas, not helmet cameras, and takes 2 min. Our fix takes 5 s (SIM) |

## Measured: weather replay (MEDA)

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| Replayed sol | sol 1187, 2024-06-21/22 UTC, Ls 279.1 to 279.8, MY 37 | PDS label: start 2024-06-21T19:34:30Z, stop 2024-06-22T20:14:05Z, Ls 279.128 to 279.767 | [MEDA bundle, PDS Atmospheres, doi 10.17189/1522849](https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/) | matches. All four CSVs return 200 and their byte counts match ours exactly |
| Pressure | 777.9, 765.2, 757.8 Pa at LMST 00:00, 10:00, 12:00 | 777.94, 765.21, 757.78 (one-minute means of the CSV) | DER_PS, sol 1187 | matches |
| Air temperature | 200.8, 218.5, 245.6 K at the same times | 200.84, 218.55, 245.60 (mean of ATS 1 to 3) | CAL_ATS, sol 1187 | matches |
| Rover position on sol 1187 | 5 m and 12 m from the scene origin | Waypoints 54_1010 (sol 1185) and 54_1110 (sol 1189) | MMGIS waypoints and raw images feed | matches |
| Wind | sol 312, labelled as another sol and another place | "wind data beyond sol 315 is not provided due to certain damage to some components of the wind sensor" | MEDA release notes in the PDS bundle | matches. The label says sol 312, 8.56 km away |

## Measured: dust

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| Clear season optical depth | 0.45, the sky before the storm | "observed 880-nm optical depths of 0.4 to 0.5" over sols 0 to 275, Ls 20 to 135 | [Bell et al. 2022, Sci. Adv. 8, eabo4856](https://doi.org/10.1126/sciadv.abo4856) | mislabelled. The number matches its season, but the mission clock says Ls 294, in the dusty season. The game starts from a clearer sky than that date had. It is also an 880 nm value, while the storm values are visible-band |
| Seasonal minimum | 0.25 | "an optical depth (τ) of ~0.25" | Bell et al. 2022 | matches |
| January 2022 storm, before | 0.3 | "visible optical depth was near 0.3" | [Lemmon et al. 2022, GRL 49, e2022GL100126](https://doi.org/10.1029/2022GL100126), section 3.2 | matches |
| January 2022 storm, peak | 2.0 | "Peak visible optical depth was ∼2" | Lemmon et al. 2022, abstract | matches |
| MEDA RDS peak | 1.7 | "peak optical depths of 1.7 (visible) and 0.8 (IR)" | Lemmon et al. 2022, section 3.2 | matches |
| IR to visible ratio | 0.5, dated sols 313 to 318 | "approximately half the visible optical depth" | Lemmon et al. 2022, section 3.2 | mislabelled. The value is right, but the sentence describes the days before the storm, not sols 313 to 318 |
| Storm, after | 0.4 | "visible optical depths were near 0.4" | Lemmon et al. 2022 | matches |
| Storm duration | 6 sols | "through sol 318", "Over 5–11 January 2022" | Lemmon et al. 2022 | matches |
| Line-of-sight opacity | 1.3 per 10.5 km | "peaking at 1.3 ± 0.1 per 10.5 km" | Lemmon et al. 2022 | matches |
| Flux drop | 20 % | ">20% below nearby sols" | Lemmon et al. 2022 | matches (lower bound) |
| Gale visibility, 2018 storm | under 3 km | "visibility was reduced to less than 3 km" | [Smith et al. 2019, GRL 46, 9414](https://doi.org/10.1029/2019GL083788) | matches |
| Gale extinction | over 1.1 per km | "Peak extinction of >1.1 km-1" | Smith et al. 2019 | matches |
| Koschmieder constant | 3.912 | "CT ≈ 0.02", so -ln 0.02 = 3.912 | Smith et al. 2019, methods | matches |
| Gale global storm optical depth | 8.0, around sol 2084 | "now above 8.0 at Gale Crater" | [JPL, 20 June 2018](https://www.jpl.nasa.gov/news/martian-dust-storm-grows-global-curiosity-captures-photos-of-thickening-haze/) | mislabelled. The value matches. The page ties sol 2084 to a photo, not to the optical depth. Use "by 20 June 2018" |
| Opportunity record | 10.8 | "the last tau measured by Opportunity was 10.8 on June 10" | [JPL, 16 August 2018](https://www.jpl.nasa.gov/news/six-things-about-opportunitys-recovery-efforts/) | matches |
| Dust season | Ls 180 to 360 | "Southern spring and summer have long been recognized as the dustiest part of the Martian year" | [JPL, 9 June 2016](https://www.jpl.nasa.gov/news/nasa-mars-orbiters-reveal-seasonal-dust-storm-pattern/) | matches. Ls 180 to 360 is the definition of southern spring and summer, not a printed number, and the note says so |

## Measured: radiation

Curiosity's RAD measured every dose number below in Gale crater, about 2 km lower than Jezero. No instrument has measured surface radiation at Jezero. Zeitlin et al. 2018 put about 23 g/cm² of CO2 over Gale. Jezero has roughly a tenth less air above it, so doses there would be somewhat higher, more so for solar particles. The HUD says "Gale crater, not Jezero" next to each value.

RAD has two detectors. B reports dose in silicon, which the papers convert to water. E is tissue-like. The rows name the detector where it matters, because mixing them shifts a rate by 15 % or more ([#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295)).

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| Background dose rate | 0.210 mGy/day, shown as 8.75 µGy/h | "an average total GCR dose rate at Gale Crater (-4.4 km MOLA) of 0.210 +/- 0.040 mGy/day". Table 1: E detector, tissue-like | [Hassler et al. 2014, Science 343, 1244797](https://doi.org/10.1126/science.1244797) | matches (210 / 24 = 8.75). The data entry does not name the detector. Since [#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295) the app's provenance note for the rate does: E detector, tissue-like |
| Background dose equivalent | 0.64 mSv/day | "0.64 ± 0.12 mSv/day" | Hassler et al. 2014 | matches |
| Solar cycle range | 0.35 to 1.15 mSv/day, tagged DERIVED | "ranges from about 0.35 mSv/day to about 1.15 mSv/day" | [Guo et al. 2015, ApJ 810, 24](https://doi.org/10.1088/0004-637X/810/1/24) | matches. A model extends the measurement, so DERIVED is the right tag. Both ends are uncertainty extremes, not central values |
| Career limit | 600 mSv | "total career effective radiation dose ... shall be less than 600 mSv", p. 4 | [NASA OCHMO-TB-020 Rev E](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf) | matches |
| Solar event design limit | 250 mSv | "to less than a NASA effective dose of 250 mSv", p. 6 | Same | matches |
| September 2017 flare | X8.2, begin 15:35Z, peak 16:06Z, end 16:31Z | FLR 2017-09-10T15:35:00-FLR-001, same times and class | [DONKI](https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=2017-09-10&endDate=2017-09-10) | matches |
| First alert | 16:07Z | 20170910-AL-001 at 16:07Z, a flare alert (M5 threshold). The first particle alert is AL-002 at 16:41Z | [DONKI notifications](https://ccmc.gsfc.nasa.gov/DONKI/WS/get/notifications?startDate=2017-09-10&endDate=2017-09-10&type=all) | mislabelled. Call it a flare alert |
| Onset at Mars | 19:50Z | "the earliest possible onset of > 100 MeV protons is at 19:50 UT" | [Guo et al. 2018](https://arxiv.org/pdf/1803.00461), co-authored by Zeitlin | matches. The note gives the light time as 10 to 20 min. On that date Mars was 2.61 AU away, about 21.7 min |
| Warning lead time | 224 min | 19:50 minus 16:06 | Arithmetic | mislabelled. That is flare seen at Earth to dose rise at Mars. A crew at Mars hears the DONKI alert about 22 min after it is issued. This event was poorly connected to Mars. A well-connected event can bring protons within tens of minutes, less than the relay time |
| Event rates, before, peak, after | 240, 718, 208 µGy/day (B, water) | Abstract: rates rose "by factors of 2 to 3" (718 / 240 = 2.99) | [Zeitlin et al. 2018, GRL 45, 5845](https://doi.org/10.1029/2018GL077760) | not verified. The publisher blocked every scripted request, so Table 1 stayed closed. The abstract and the papers that cite it agree |
| Event dose | 544 µGy (B, water) | "the SPE contributed 544 μGy of dose in water as measured by the B detector", as quoted by papers that cite Zeitlin. Berger 2018 cites 418 µGy in silicon | Zeitlin et al. 2018 | not verified (same closed paper). For scale: 544 µGy is about 2.3 sols of background at the B rate, and far under 1 % of NASA's 250 mSv limit for a solar event. Sheltering is right because forecasts are uncertain, not because this event was dangerous on the surface |
| Doubling time | 7 h | "dose rates roughly doubled within about 7 hours", as quoted | Zeitlin et al. 2018 | not verified (same closed paper) |
| Event duration | 57 h | 19:50Z on 10 September to the shock at 05:00Z on 13 September | Zeitlin et al. 2018 | rounded. Guo et al. 2018 puts the shock at about 02:50 UT, which gives 55 h |
| May 2024 event dose | 8100 µGy | "a radiation dose of 8,100 micrograys" | [NASA, updated 10 June 2024](https://www.nasa.gov/missions/maven/nasa-watches-mars-light-up-during-epic-solar-storm/) | matches. The note says DONKI missed it. DONKI logged the far-side CME, so phrase that as our reading |
| Event in the game, background step | 10 µGy/h | 240 / 24 = 10.0 | Zeitlin, B detector | matches. Outside the event the HUD shows 8.75 µGy/h (Hassler, E detector), so the rate jumps 14 % at the start with no particles yet. The rates stay as they are. Since [#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295) the provenance note of the event rate and of the HUD rate, and the radiation hazard card, say the step is a change of detector, not more radiation |
| Event in the game, peak | 29.92 µGy/h | 718 / 24 = 29.917 | Zeitlin, B detector | rounded |
| Event in the game, ramp steps | 20 and 12 µGy/h, tagged SIM since [#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295) (DATA at the audit) | Not in the profile. 20 is the midpoint of 10 and 29.92. 12 appears nowhere | Ours | mislabelled at the audit. Fixed in [#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295): the event file tags both steps SIM, the provenance table has a SIM entry for them, and the banner shows SIM while one plays, with "our step between RAD's September 2017 rates". 10 and 29.92 keep DATA. The step times and the staircase are SIM too |
| Dose during the event | "dose this EVA", summed over mission time | The game squeezes 57 h into 12 min. The event adds 4.84 µGy, 2.84 µGy above baseline. The real event added 544 µGy | Ours | mislabelled at the audit. The sum is honest arithmetic, but next to a DATA banner it reads as the 2017 dose, which was about 190 times higher. Fixed in [#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295): the dose in the banner carries its own DERIVED tag, whose source says it sums the rates over the minutes the event plays in this EVA, and the debrief's reading note gives the real 544 µGy over about 57 h with a DATA tag. The HUD has no line for the 544 µGy |
| Archive check in rad.json | B peak 621 µGy/day against 718 published | Archived B is in silicon, the paper converts to water (x 1.30). B and E event doses both sit at 0.84 of the published values | PDS [MSL-M-RAD-3-RDR-V1.0](https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/) | matches the explanation. The E channel agrees with the paper within 1 %. Do not label archived B as water |

## Measured: suit specification

The suit is the xEMU, NASA's Artemis suit design. It is the only suit with every consumable published in NASA documents at the same design level. It was designed for the Moon. Its CO2 scrubber and its evaporative cooler vent to vacuum, and Mars has about 700 Pa of CO2, so a Mars suit needs different CO2 removal and heat rejection. We model oxygen and battery only. On Mars, CO2 or heat could end a walk before oxygen does.

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| Primary O2 | 1.7 lbm (771 g) | "The POV stores ~1.7 lbm of usable oxygen", p. 13 | [CTSD-ADV-959 Rev A, NTRS 20170009505](https://ntrs.nasa.gov/citations/20170009505) | matches (1.7 x 453.59 = 771 g) |
| Secondary O2 | 1.7 lbm | "The SOV stores ~1.7 lbm of usable oxygen", p. 13 | Same | matches |
| Secondary abort time | 30 min | "the 30 minute abort time at the higher flow rate", p. 15 | Same | matches |
| Battery | 756 Wh | Table "BATT-690 Primary PLSS 29.1 ... 756", p. 18 | Same | matches. The schematic on p. 8 says "~900Wh". We use the table |
| EVA length | 8 h | "EVAs of up to 8 hours in duration (6±2 hours)", section 4.1.4 | [xEVA Concept of Operations, EVA-EXP-0042 Rev B](https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf) | matches |
| Suit pressure | 4.3 psid (29.6 kPa) | "a nominal EVA pressure of 4.3 psid", p. 36 | Same | matches |
| Design average metabolic rate | 1200 BTU/hr (352 W) | "1200 BTU/hr (352 Watts)", p. 4 | [Ogilvie et al. 2026, ICES-2026-127, NTRS 20260003038](https://ntrs.nasa.gov/citations/20260003038) | matches (the paper cites its reference 7) |
| Design peak | 3000 BTU/hr for 10 min | "a 3000 BTU/hr peak rate for 10 minutes", p. 4 | Same | matches |
| No-go slope | 20° | "Walking up/down/across a slope of up to 20°", p. 38. Also "Surface slope limit for EVA (2km): <20 deg", p. 21 | EVA-EXP-0042 Rev B; [NTRS 20250009323](https://ntrs.nasa.gov/citations/20250009323) | **wrong** in the elevation profile, which still uses 25° ([#293](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/293)). The planner and the slope layer match. The source states a suit capability ("up to 20°"), and we use it as a limit. Slope is a central difference over ±2 m, so features under 4 m are smoothed |
| Reserve | 30 min "at the current metabolic rate" | "30 MINUTES RESERVES MAINTAINED ON ALL PLSS CONSUMABLES AT STATION METABOLIC RATE", Tables 2.4-2 and 2.4-3 | [Apollo 17 Lunar Surface Procedures vol. 2](https://pds-geosciences.wustl.edu/Lunar/urn-nasa-pds-apollodoc/document_a17/mission/a17_final_lunar_surface_procedures_vol2_contingency.pdf) | mislabelled. 30 min is right. Apollo held it at the fixed station rate, which Bellcomm gives as 1050 BTU/hr (308 W). We hold it at the current rate, so a crew member standing still at 144 W keeps about half the O2 Apollo held back |
| Walkback pad | 20 % | "A 20% pad is required for emergency walkback, making the metabolic rate 1440 BTU/hr at a speed of 3.3 km/hr", p. 1 | [Bellcomm B70 10028, Apollo 15](https://webarchive.library.unt.edu/eot2008/20090109180220id_/http://www.hq.nasa.gov/alsj/19790073512_1979073512.pdf) | matches |

## Measured: walking physiology

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| Walking cost by gradient | 13 pairs, 1.64 J/kg/m on the level | Table 2, p. 1042. All 13 values match. "1.64 ± 0.50 J·kg−1·m−1 at a 1.0 ± 0.3 m/s speed on the level" | [Minetti et al. 2002, J Appl Physiol 93:1039](https://doi.org/10.1152/japplphysiol.01177.2001) | matches |
| Energy per litre of O2 | 20.9 kJ | "an energy equivalent of 20.9 kJ/l O2", p. 1040 | Minetti et al. 2002 | matches |
| O2 density | 1.42903 g/L | 1.42903 kg/m³ at 273.15 K and 0.101325 MPa | [NIST Chemistry WebBook](https://webbook.nist.gov/cgi/fluid.cgi?ID=C7782447&Action=Page) | matches |
| Apollo EVA average | 980 kJ/h | Table 2, p. 122, mean "980 (234)" over 158.74 h | [Waligora and Horrigan 1975, NASA SP-368, NTRS 19760005584](https://ntrs.nasa.gov/citations/19760005584) | matches |
| Apollo rover riding | 518 kJ/h (144 W) | Table 2, p. 122, "Roving Vehicle" 518 over 25.28 h | Same | rounded (143.9 W) |
| Apollo 14 EVA-2 traverse | 3000 m, 72.8 min, 1233 and 1318 kJ/h | Table 4, p. 125 | Same | matches |
| Suited transport cost at 3/8 g | 340 mL/kg/km at 1.07 m/s, 450 at 1.52 m/s | Chart only, slide 12 | [Norcross et al. 2008, NTRS 20080014853](https://ntrs.nasa.gov/citations/20080014853) | matches, read from a chart at about ±5 %. The repo calls these "gross" costs. The source does not say gross or net |
| Model mass | 81.4 kg body + 121 kg suit | "Body Mass (kg) 81.4 ± 7.8", slide 4. "121 kg total suit weight", slide 5 | Same | matches |
| Suited grade cost rise, 0.12 to 0.32 g | 1.9, 3.5, 8.7, 17.0 mL/kg/min at 0 to 30 % grade | Same four numbers, printed p. 37 | [Norcross et al. 2010, NASA/TP-2010-216125](https://ntrs.nasa.gov/citations/20110003409) | matches |
| Reduced gravity walking | 33 % drop at 75 % less gravity | "reduced by 72% during running but only by 33% during walking" | [Farley and McMahon 1992](https://pubmed.ncbi.nlm.nih.gov/1490989) | matches, abstract only. The full text is paywalled |
| Heart rate fit | MR = 284.55 + 5.984 x HR | Table 5.1, same coefficients, R² 0.402 over 132 EVAs | [Hoffmann 2021, NTRS 20210024317](https://ntrs.nasa.gov/citations/20210024317) | matches. Not used on screen. Applied to Mars walking it would give 288 bpm, so keep it off the HUD |
| Lunar walkback test speed | 1.74 m/s | "an average velocity of 1.74 m•s-1 (3.9 mph)", p. 28 | [Norcross et al. 2009, NASA/TP-2009-214796](https://www.lpi.usra.edu/lunar/artemis/NorcrossEtAl_NASA-TP-2009-214796_EVA%20Walkback%20Test.pdf) | matches |
| Suited test speeds at 3/8 g | 1.07 to 1.52 m/s | 2.4 to 3.4 mph | Norcross et al. 2008, slide 12 | matches |
| Artemis planning pace | 2 km/h | "an ~2 km/hr walking pace over relatively level regolith", p. 40 | EVA-EXP-0042 Rev B | matches |
| Apollo 15 walkback speed | 3.3 km/h | p. 1, item 7 | Bellcomm B70 10028 | matches |

## Measured: time and physics

| Number | We use | Source says | Source | Verdict |
|---|---|---|---|---|
| Sol length | 88,775 s | "24 hours 39 minutes 35.244 seconds" | [NASA GISS Mars24 notes](https://www.giss.nasa.gov/tools/mars24/help/notes.html) | rounded (0.244 s per sol) |
| Local mean solar time | Mars time + 77.3053 / 15 h | "adding a number of Mars hours equal to the location's east longitude divided by 15" | Mars24 notes | matches |
| Mars gravity | 3.71 m/s², tagged DATA, citing the plan | "Surface gravity (mean) 3.73", equatorial 3.69 | [NSSDC Mars fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html) | rounded. 3.71 sits between the two NSSDC values, 0.5 % off each. Cite NSSDC, not the plan |

## Calculated by us (DERIVED)

| Number | We use | How we checked | Verdict |
|---|---|---|---|
| Battery average draw | 94.5 W | 756 Wh / 8 h = 94.5 W. No NASA document gives a measured draw | matches the stated method |
| O2 for one design EVA | 693 g | 352 W x 28,800 s / 20,900 J/L x 1.42903 g/L = 693.2 g. The 771 g tank covers it with 10 % to spare | matches |
| Walking model, flat 1 km at 1.0 m/s | 589 W, 40 g O2, 16.7 min | Recomputed: 589.3 W, 40.3 g | matches |
| Walking model, 1 km along a 20° slope at 0.5 m/s | 946 W, 129 g O2 | Recomputed: 946.1 W, 129.4 g | matches |
| Level walking constants | 2.2 and 2.5 J/kg/m | Recomputed from the Walkback Test costs: 2.193 and a slope of 2.49 per m/s | matches |
| Grade factor | 1.3, "the middle of the IST-2 speed range", any value from 1.06 to 1.6 fits | Recomputed: matching the measured 17.0 mL/kg/min at 30 % grade needs 1.27 at the fastest IST-2 speed (0.97 m/s), 1.6 at the middle (0.77 m/s) and 2.2 at the slowest (0.56 m/s) | mislabelled. 1.3 fits the fastest speed, not the middle. With 1.6, a 20° climb at 0.5 m/s costs 14 % more power than we show. With 2.2 it costs 42 % more. Uphill legs are the expensive ones, so this is the number most worth a second look |
| Visibility in the 2022 Jezero storm | 31 km | 3.912 / (1.3 / 10.5 km) = 31.6 km | rounded down. 32 is the nearer value |
| Slope, climb, distance of a route | from the height grid | Our A* path sampled every 10 m on the HiRISE grid | matches the method. A 2 m grid misses rocks under about 2 m, and CONTEXT.md rule 5 says so |
| Sky view of natural shelters | 0.81 to 0.85 | Ray cast on the height grid, 48 azimuths | matches the method. The dose reduction built on it, 1 minus sky view (15 %), is about 4 times what RAD measured: 4 % with 19 % of the sky blocked ([Ehresmann et al. 2021](https://doi.org/10.1029/2021JE006851), [#296](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/296)). No screen shows it, but it picks the shelters |

## Our model (SIM)

These numbers have no NASA source, and the app says so. The verdict column checks the tag, not the number.

| Number | We use | What it rests on | Verdict |
|---|---|---|---|
| Caution slope | 15° | No NASA value. Sits between 11.3° (20 % grade, where Norcross 2010 saw suited climbing cost rise sharply, printed p. 83, not p. 98 as the locator says) and the 20° limit | assumption we state |
| Walking speed on flat ground | 1.0 m/s | Minetti's cheapest level speed is 1.0 ± 0.3 m/s. Waypoint ETAs use it on straight-line distance. NASA plans traverses at 2 km/h (0.56 m/s), and Apollo 14 EVA-2 averaged 0.69 m/s | assumption we state. Our walk times come out 1.45 to 1.8 times shorter than NASA's planning pace. O2 per km changes less, but the 8 h cap, the battery and the reserve all depend on time. Show a 2 km/h time beside ours |
| Jog | 1.5 m/s | Capped at the fastest suited speed tested at 3/8 g (1.52 m/s) | assumption we state |
| Slowest walk | 0.3 m/s | Floor for the constant-effort rule on steep climbs | assumption we state |
| Constant-effort speed rule | keeps the 589 W of flat walking on slopes | Apollo 14 crews "maintained a comfortable walking effort" (SP-368 p. 123). No NASA source gives suited speed by slope | assumption we state |
| Battery effort share | 30 % of the draw follows metabolic rate | No source. The note prints 113 W at flat walking. The formula gives 113.6, so 114 | assumption we state |
| O2 caution and warning margins | 15 min and 0 min | Our thresholds on top of the Apollo reserve | assumption we state |
| Dead-reckoning drift | 2 % of distance walked | MER's design goal was under 10 % over 100 m. No source gives a figure for a walking astronaut | assumption we state |
| Terrain fix time | 5 s standing still | Perseverance needs about 2 min per fix (JPL, February 2026) | assumption we state. Say "24 times faster than the rover" if asked |
| Nav fix blocked above optical depth | 1.0 | Based on Sánchez-Lavega et al. 2025. The note says the paper defines a storm as τ ≥ 1. The paper detects storm A at τ ≥ 0.6 and reports τ ≥ 1 only on sols 417 to 472 | mislabelled. The SIM value is fine, the note misreads the paper |
| Dust storm ramp | 0.45 to 8.0 in 90 s | Real onset took up to one sol (Lemmon 2022). The end value is Curiosity's Gale 2018 reading, and the banner says "Gale 2018 storm, not Jezero" | mislabelled. The banner is honest, but provenance tags the curve DERIVED, and a scripted 90 s ramp is SIM |
| Partner separation | 100 m, caution from 80 m | Our rule from the pair-walk mockup | assumption we state |
| Radio weak-signal range | 800 m | No source. The HUD shows the range and LINKED, WEAK or LOST with no tag | mislabelled. Every number on screen needs a tag (CONTEXT.md rule 1) |
| Rock abundance layer | HiRISE brightness mapped to rock cover, sizes from Golombek et al. 2003. Tagged DERIVED | Golombek gives rock sizes for a known rock abundance. Brightness to abundance is our step, and brightness also follows lithology, dust and slopes facing the Sun | mislabelled. It is a SIM proxy, and it carries 0.6 of every cell cost ([#311](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/311)) |
| Route cost constants | 1 + (slope / 9°)² + 0.6 x rock | From the test bench placeholder. The code comment calls them DERIVED | mislabelled. No source sets 9° or 0.6. They choose between routes ([#311](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/311)) |
| Sun declination | 11° all year | Picked so the demo start at 17:45 puts the Sun 7° up in the west. Tagged SIM | **wrong** for the sol shown. The clock says sol 1210 (Ls 294) and the weather is sol 1187 (Ls 279.6). The real declination on those sols is -23° to -25°. Real noon elevation is about 48° on sol 1210 (46° on sol 1187). The game draws 82.5°, and the shadows point the wrong way for the date |
| Demo epoch | sol 1210, 17:45 LMST | Chosen by us, labelled "not a historical date" | assumption we state |

## Problems found

Each problem has an issue with the source and the corrected value. None of them is fixed in this pull request, because other threads own `src/` and `public/data/`.

| Issue | Problem | Area | Priority |
|---|---|---|---|
| [#293](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/293) | Elevation profile uses 25° as no-go, everything else uses NASA's 20° | route | P1 |
| [#294](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/294) | Sun declination 11°, but sol 1210 needs -23° | app | P1 |
| [#295](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/295) | Radiation event: SIM steps tagged DATA, a detector switch at the start, a 12-minute dose next to a 57-hour event | app | P1 |
| [#296](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/296) | Natural shelter dose cut is about 4 times what RAD measured | route | P2 |
| [#297](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/297) | Radio range and link state have no tag, and 800 m has no source | app | P2 |
| [#298](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/298) | O2 reserve held at the current rate, Apollo held it at 1050 BTU/hr | app | P2 |
| [#299](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/299) | Grade factor 1.3 fits the fastest IST-2 speed, not the middle | app | P2 |
| [#311](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/311) | Rock abundance layer is a brightness proxy, and the route cost constants have no source, both tagged DERIVED | route | P2 |
| [#300](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/300) | Nineteen citation, page and label slips | app | P3 |

## What the app does not use

Do not claim these in the pitch, the video or the form. Each one appears in an early plan or a mockup but is not in the build.

- **CRISM.** The plan lists a mineral view as P2. Nothing in `src/` or `public/` reads CRISM data.
- **THEMIS.** Dropped in #49. Its 100 m pixels put 15 x 15 pixels on the whole tile ([thermal-view-decision.md](data/thermal-view-decision.md)).
- **Geology map.** Dropped in #48. USGS SIM 3464 sits 100 to 200 m off our terrain ([geology-layer-decision.md](data/geology-layer-decision.md)).
- **Earth-Mars communication delay.** The sim has no light-time delay. Radio in the app is suit to habitat across the tile, with line of sight on the terrain. If the pitch mentions Earth contact, use NASA's range of about 4 to 24 minutes one way ([NASA Goddard](https://www.nasa.gov/centers-and-facilities/goddard/space-communications-7-things-you-need-to-know/)), and say the app does not model it.
- **Live data.** Every observation is a replay of a past sol or event. The app makes no call to a NASA service at run time.
- **Radiation at Jezero.** No instrument has measured surface radiation at Jezero. Every dose number comes from Curiosity in Gale crater, about 2 km lower, and the HUD says so.
