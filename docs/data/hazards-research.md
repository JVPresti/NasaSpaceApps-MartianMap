# Hazard numbers: research notes

Background for `public/data/hazards.json` (issue #18). The JSON says where each number comes from. This file covers the rest: what we checked and how, what we could not confirm, the options we turned down, and the decisions behind the file. Read it before changing a value or reopening a choice.

Research done 2026-11-14.

## How the numbers were checked

Four research passes opened the primary sources: papers, NASA reports on NTRS, PDS archives and the DONKI API. Each pass returned the value, the page and a verbatim quote. A second pass then searched the downloaded text of each source for the quoted sentence. The Apollo 14 traverse table and the Walkback Test chart were read from page images.

| Level | Values |
|---|---|
| Quote found in the source text | Bell 2022 clear tau; Lemmon 2022 storm tau, MEDA peak, line-of-sight opacity; Smith 2019 visibility and extinction; Hassler 2014 dose rates; Zeitlin 2018 Table 1, onset, plateau, shock time, doubling; xEMU O2, abort time, battery table; xEVA con ops duration, pressure, pace, 20 deg limit; Ogilvie 2026 design rates and xEMU mass; Apollo 17 reserve; Apollo 15 walkback pad and speed; EMU 30 min reserve; Minetti polynomial, Table 2, 20.9 kJ/L, 24.3 % efficiency; Hoffmann heart rate fit; IST-2 grade results; Walkback TP 1.74 m/s; LRV 25 deg climb |
| Checked against the raw record | DONKI flare, CME, SEP and notification records for September 2017; empty DONKI SEP query for May 2024 (queried again live); NIST O2 density; Farley and McMahon abstract (PubMed E-utilities); NASA May 2024 page |
| Read from a page image | Apollo 14 traverse table (SP-368 ch. 4, Table 4, p. 125); Walkback Test slide 12, Mars suited curves |
| Read from a chart, about ±5 % | Mars suited transport cost, 340 and 450 mL/kg/km at 1.07 and 1.52 m/s (Walkback slides, slide 12) |
| Confirmed by the research pass only | Sanchez-Lavega 2025 storm A; Guo 2015 solar cycle range; NASA radiation limits (OCHMO-TB-020); Opportunity tau pages; JPL dust season page; Lemmon flux drop |

Every DOI resolves on Crossref. Wiley, Science and jpl.nasa.gov block scripted requests, so a plain `curl` of those links returns 403. They open in a browser.

## Could not confirm

The file marks each of these SIM or says so in the note.

- **Dust storm onset in hours.** Lemmon 2022 shows optical depth rising from about 0.3 to 1.7 within sol 313 but gives no time of day. One sol is the best bound.
- **Ls 180 to 360 as printed numbers.** The NASA page says "southern spring and summer". The Ls range follows from that definition.
- **Storm C peak tau (sol 574, 2022).** It appears only in a figure in Sanchez-Lavega 2025, not in the text.
- **MEDA optical depth in PDS.** The MEDA archive has calibrated RDS irradiance and TIRS fluxes but no opacity column. Optical depths come from the papers or the Mastcam-Z dataset.
- **Smith et al. 2023, MEDA TIRS optical depth (doi 10.1029/2022JE007560).** The publisher returned 403. The IR to visible ratio comes from Lemmon 2022 instead.
- **Guo et al. 2021, A&A Review (doi 10.1007/s00159-021-00136-5).** Springer blocked every fetch. Guo 2015 gives the solar cycle range instead.
- **May 2024 event profile.** NASA gives 8,100 µGy and nothing else: no peak rate, duration or detector. The often quoted "700 µGy per day" appears only in secondary press.
- **April 2013 SEP total.** Hassler 2014 says 50 µGy in the text and 0.025 mGy in Table 2.
- **Mars time or Earth time for RAD timestamps.** Neither paper says. The difference is 10 to 20 minutes of light travel.
- **A NASA source for the 30 day blood-forming organ limit.** Only Zeitlin 2018, citing NCRP 1989, gives 250 mGy-Eq.
- **Explicit PDS terms for RAD.** The PPI node pages state no license. The general NASA policy (SPD-41A) covers it.
- **Farley and McMahon values at 0.5 g and 0.75 g.** Paywalled. Only the abstract's 0.25 g numbers are confirmed.
- **The Weir equation.** The copies were behind a captcha. The 20.9 kJ per litre factor comes from Minetti and NASA (Paul 2012).
- **NASA level walking report IST-1 (TP-2010-216115) and the Walkback final report (TP-2009-214796).** IST-1 is not on NTRS. The Walkback TP is on LPI and was used for the 1.74 m/s value.
- **IST-2 regression coefficients and per-subject speeds.** Not printed. This is why the grade factor fits anywhere from 1.06 to 1.6.
- **Suited walking speed as a function of slope.** No NASA source found. `mobility.speed_rule` is SIM.
- **Tobler's hiking function.** The formula appears only as an image in the copies we found, so it was left out.
- **A NASA source for 15 deg.** None. `slope.caution` is SIM.
- **Measured suit battery draw.** No NASA document gives it. 94.5 W is the 756 Wh capacity spread over 8 h.
- **ISS EMU primary O2 mass.** Only the pressure (about 900 psi) is in NASA documents. The common "1.2 lb" figure is from a news article.
- **Apollo PLSS battery voltage and capacity.** Not found.
- **Mars landing site slope limits, and a Perseverance "24 deg" tilt limit.** Not opened in a primary source.

## Choices and why

| Question | Chosen | Why |
|---|---|---|
| Suit for consumables | xEMU | The only suit with every consumable number in NASA documents at the same design level. The ISS EMU lacks its primary O2 mass and Apollo lacks battery figures |
| Radiation event to replay | September 2017, with May 2024 as a reference row | Peer-reviewed rates and timeline from RAD (Zeitlin 2018) and a complete DONKI chain, giving a real warning time. May 2024 has one number and no DONKI record |
| Dust baseline and storm | Aphelion tau 0.4 to 0.5, and the January 2022 regional storm | The aphelion values are published with a range. The January 2022 storm passed over the rover and has its own paper with before, peak and after values |
| Slope limits | No-go 20 deg (DATA), caution 15 deg (SIM) | 20 deg is NASA's suited walking limit in two documents. The engine's 25 deg only matches the Apollo rover's climbing spec. 15 deg has no source |
| Provenance schema | One block per value, documented in `public/data/README.md` | Each number carries its own source, so the HUD can read the label next to the value without a second lookup |
| Model mass | 202.4 kg (Walkback Test body plus Mark III) | The level walking cost was measured at this mass, so the model stays inside its data. The xEMU is 177 kg and raises every cost by 27 % |
| DATA tag scope | Measurements plus NASA specs and procedures | Values like the 30 min reserve and the 20 deg limit are NASA rules, not measurements, but they are not our assumptions either. The plan's definition says "measured", so this is wider |

## Options considered and not used

These are kept so nobody has to redo the research if a choice changes.

### Other suits

| | ISS EMU | Apollo PLSS (Apollo 15-17) |
|---|---|---|
| Primary O2 | about 900 psi, mass not confirmed (Campbell 2015, NTRS 20150009506, p. 7) | 1.3 lb usable after a 30 min reserve, 1410 psia (Apollo 15 memo p. 1; Campbell 2012, NTRS 20120009158, Table 2) |
| Secondary O2 | about 2.5 lb at about 6000 psia, 30 min (Campbell 2012, p. 11) | about 5.8 lb at about 5880 psia, at least 0.5 h, 1.25 h with buddy cooling (Carson, NTRS 19720019460, pp. 51 and 66) |
| EVA duration | 7 h including 30 min reserve (Moore 2014, NTRS 20140009556, slide 11) | 7 h battery capability (Apollo 15 memo) |
| Pressure | 4.3 psi | 3.85 psid (Carson p. 49) |
| Battery | Li-ion, 5S16P, 26.6 Ah at end of life, 16 to 21 V, 3.8 A mission discharge (Russell 2010, NTRS 20100030503, Table 1) | not found |
| Design metabolic rate | 1000 BTU/hr average, 2000 maximum (Moore 2014, slide 57) | 1200 BTU/hr average (Carson p. 50) |
| CO2 removal | LiOH or Metox | LiOH |

Other design rates seen: a NASA Mars PLSS study uses 350 W average and 530 W maximum for an 8 h EVA (Lobmeyer 2025, NTRS 20250003716, p. 10). A Constellation lunar PLSS used 300 W (Conger, NTRS 20100017516, p. 4).

### Other reserve and range rules

- Apollo 15 walking radius 3.1 km, set by 0.95 h of buddy-system oxygen at 3.3 km/h (Apollo 15 memo).
- Apollo 17 walking radius about 3.6 km (Apollo 17 procedures, printed p. 75).
- Constellation: a 90 min buddy umbilical to support a 10 km walkback (Conger p. 4).
- Artemis: 2 km walking radius. With an unpressurized rover, stay within a 5 h walk, about 10 km at 2 km/h (xEVA con ops p. 40).

### Other events

- **Storm A, 2022.** Optical depth of 1 or more over sols 417 to 472 (22 April to 18 June 2022, Ls 213 to 249). Detected at τ ≥ 0.6 on sol 395. Back to about 0.5 by sol 560 (Sanchez-Lavega 2025, section 6.6). Longer and milder than the January storm, with a less precise onset.
- **May 2024 SEP.** Largest RAD event so far (8,100 µGy), after an X12 flare on the far side of the Sun. DONKI has no SEP or flare record for it. Particles reached Mars in "tens of minutes". This is a good argument for local warning at Mars, but it cannot be replayed honestly without a time profile.
- **September 2017 in Berger et al. 2018 (doi 10.1029/2018SW001920).** Peak 0.4 µGy/min at 07:30 UTC on 11 September (about 576 µGy/day). The paper gives the total as 418 µGy in its abstract and 347 µGy in its text, so we used Zeitlin's 544 µGy in water.

### Other context numbers

- Cruise dose rate inside the MSL spacecraft: 0.48 ± 0.08 mGy/day, 1.84 ± 0.30 mSv/day (Hassler 2014, Table 1).
- Round trip with 500 days on the surface: about 1.01 Sv (Hassler 2014).
- Seasonal pressure swing changes the surface dose by about 0.1 mSv/day. The daily swing is about 15 µGy/day, around 5 % (Guo 2015, pp. 11 and 20).
- NASA surface mission planning rate: about 0.5 mSv/day (OCHMO-TB-020, p. 6).
- Atmospheric column at Gale during the 2017 event: 23.4 g/cm². At the mean Mars elevation it is 16 g/cm², so exposures are larger there (Zeitlin 2018). Jezero sits about 2 km higher than Gale.
- Opportunity's site normally had tau about 0.5, and the rover needed tau below 2.0 to recharge (JPL, 16 August 2018).
- Lunar 10 km walkback test: 2374 BTU/hr average, 0.635 lb O2. On real terrain the distance was 7 % longer, and metabolic rate was 56 % higher than on a matched treadmill (Walkback TP p. 36, Table 6).
- Apollo 14 legs: up a +5.0 % leg at 1.86 km/h, down a -6.4 % leg at 3.82 km/h, with similar metabolic rates (SP-368 Table 4).

## How to reproduce

### DONKI

No key needed on the CCMC host. `api.nasa.gov/DONKI` works with `DEMO_KEY` but rate-limits quickly.

```bash
curl "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=2017-09-10&endDate=2017-09-10"
curl "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/SEP?startDate=2017-09-01&endDate=2017-09-30"
curl "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/CME?startDate=2017-09-09&endDate=2017-09-11"
curl "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/notifications?startDate=2017-09-10&endDate=2017-09-10&type=all"
curl "https://ccmc.gsfc.nasa.gov/DONKI/WS/get/SEP?startDate=2024-05-15&endDate=2024-05-25"   # returns []
```

Records used: flare `2017-09-10T15:35:00-FLR-001` (X8.2, peak 16:06Z), CME `2017-09-10T16:09:00-CME-001` (2650 km/s), SEP `2017-09-10T16:25:00-SEP-001`, `2017-09-10T16:45:00-SEP-001`, `2017-09-10T20:00:00-SEP-001`, first alert `20170910-AL-001` (16:07Z). No DONKI SEP record names a Mars instrument. A DONKI notification forecast the CME flank at Mars at 2017-09-13T22:00Z ± 7 h. RAD saw the shock at about 05:00Z.

### Walking model check

`hazards.json` contains everything needed. Recompute `models.walking_metabolic.checks` from the constants and `metabolic.minetti_table`: 1 km flat at 1.0 m/s gives 589 W and 40 g O2, and 1 km along a 20 deg slope at 0.5 m/s gives 946 W and 129 g.

## Notes for #31 (MEDA sol and RAD curve)

- RAD archive: `https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/` (PDS3, ASCII, RDR SIS in `DOCUMENT/`). September 2017 is in `DATA/SOL_01773_01869`. The folder for May 2024 was not located.
- MEDA bundle: `https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/`. One CSV per sol per sensor with a PDS4 XML label, in `data_calibrated_env/sol_XXXX_YYYY/sol_NNNN/`. Use only the highest version number of each file. Derived products exist only for pressure, humidity, some TIRS channels and wind.
- Ready-made optical depth series: Lemmon, Mastcam-Z Visible Aerosol Optical Depth Record, Mendeley Data v2, doi 10.17632/gktjp9jptb.2, CC BY 4.0.
- Text extraction: the Hassler 2014 and Zeitlin 2018 PDFs set µ and ± in a Symbol font. pypdf drops µ in Zeitlin ("244 Gy/day" means 244 µGy/day) and turns ± into "T" in Hassler. Check numbers against the rendered page.
- Usage terms: NASA science data are public with no restriction of use (NASA PSD Information and Data Management Policy, 2023, citing SPD-41A). JPL asks for a credit line such as "Courtesy NASA/JPL-Caltech".

## Follow-ups this PR does not do

- Move the engine's slope no-go from 25 deg to 20 deg (route owner).
- Extract the full RAD curve for September 2017 from PDS (#31).
- Decide how much #25 compresses the 57 h radiation event and #24 the storm onset.
- If someone finds suited downhill data or IST-2 subject speeds, revisit `metabolic.grade_factor` and the downhill branch of the walking model.
