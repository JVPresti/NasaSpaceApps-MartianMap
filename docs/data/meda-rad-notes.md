# MEDA sol and RAD curve: research notes

Background for `public/data/meda_sol.json` and `public/data/rad.json` (issue #31). The JSON files carry a provenance block per channel. This file covers the choices behind them, what was checked, and the two problems found in the sources. Research done 2026-11-14.

Regenerate both files with `npm run meda` and `npm run rad`. The scripts pin every product, cache downloads in `node_modules/.cache/pds`, and write the same bytes on every run.

## MEDA sol

### Which sol

The scene depicts Cheyava Falls (Perseverance waypoint sol 1210). The window asked for was sols 1187 to 1217. Every sol in it has derived pressure and humidity and calibrated air temperature. None has wind.

MEDA records in sessions, not all the time. Most sols in the window have the standard pattern, about 5 minutes per hour, which gives about 120 one-minute bins. File sizes in the archive show which sols had longer sessions:

| Sols | DER_PS size | Coverage |
|---|---|---|
| 1187 | 3.5 MB | full hours for LMST 00-11 and every odd hour after, 5 minutes in the others: 1110 one-minute bins of pressure |
| 1188, 1193-1196 | 2.0-2.5 MB | up to half the hours full |
| 1189-1192, 1197, 1215 | 0.9-1.5 MB | a few long sessions |
| 1198-1214, 1216, 1217 | 406-555 kB | about 5 minutes per hour |

Sol 1187 has the most data, so it is the replay sol. The NASA traverse waypoints for sols 1185 and 1189 are 5 m and 12 m from the scene origin, so the rover measured this weather at the spot the scene shows. Sol 1187 is 2024-06-21/22 UTC, Ls 279 (MY 37), southern summer.

### Wind comes from sol 312

The MEDA release notes, section B.4: "At the moment, wind data beyond sol 315 is not provided due to certain damage to some components of the wind sensor, as a result of harsh weather conditions." The archive listing agrees: the last DER_WS file is sol 315.

Archived wind covers sols 36 to 315, Ls 23 to about 154 of MY 36. Nothing in it comes within 100 deg of Ls 279, the season of sol 1187. Wind therefore comes from sol 312, as its own series with its own provenance block and label ("MEDA · Perseverance · sol 312"):

- Sol 312 is the last sol before the January 2022 regional dust storm (sols 313-318, Lemmon et al. 2022 in `hazards.json`), so the wind is not storm wind.
- Of sols 300-312 it has the largest wind file (4.6 MB) and covers almost every hour.
- It was measured 8.56 km from the scene origin and 221 m lower, at Ls 153 (MY 36). The provenance says so.

### Processing

- Pressure: DER_PS `PRESSURE`, the derived level.
- Air temperature: CAL_ATS, the mean of ATS 1-3, which the RDR SIS places on the remote sensing mast. ATS 4-5 sit on the rover body and are not used. ATS has no derived level.
- Relative humidity: DER_RHS `LOCAL_RELATIVE_HUMIDITY`. The SIS gives no unit. The values (0 to 9.7) read as percent. It is relative to the sensor head temperature. The readme says empty derived values are not reliable, so those minutes stay empty (630 of 1116 minutes have RH).
- Wind: DER_WS speed and direction, only samples with `ROVER_STILL = 1`. Direction is "clockwise with respect to the north" (SIS). The SIS does not say whether it is where the wind comes from. One-minute direction is the mean of unit vectors.
- One-minute LMST bins. A bin needs 30 samples (about half a minute at 1 Hz).
- The CSVs use 999999999 as a fill value that the labels do not declare. Samples outside physical limits are dropped and counted in each channel note: 1 pressure sample, 1 RH sample (106332, the same instant as the pressure fill) and 1260 wind samples.

### Checked against the raw CSV

| Value | Raw CSV (awk) | File |
|---|---|---|
| Pressure, sol 1187, LMST 10:00 | 765.21 Pa, 62 samples | 765.2 |
| ATS 1-3 mean, sol 1187, LMST 10:00 | 218.55 K, 62 samples | 218.5 |
| RH, sol 1187, LMST 00:55 | 9.67, 62 samples | 9.7 |
| Wind, sol 312, LMST 14:00, rover still | 8.36 m/s, 47 deg, 62 samples | 8.4 m/s, 47 deg |

Sol 1187 ranges: pressure 745.4 to 780.4 Pa, air temperature 193.7 to 252.1 K (-79.5 to -21.1 °C).

## RAD curve

### Background

`rad.json` copies `radiation.background.absorbed_dose_rate` (0.210 mGy/day) and `radiation.background.dose_equivalent_rate` (0.64 mSv/day) from `hazards.json` unchanged (Hassler et al. 2014). The build script copies them and a test checks they stay equal.

### Event

The September 2017 event, the one `hazards.json` already replays, read from the RAD Reduced Data Records (MSL-M-RAD-3-RDR-V1.0) for MSL sols 1807-1819. Each sol file is about 80 MB. The script reads each label, finds the byte offsets of each observation, and fetches only the header and the two total dose lines with HTTP range requests (about 30 MB in all).

- `DOSIMETRY_TOTAL_DOSE_B` and `_E` per observation, "in microGray / hour" (RDR SIS section 4.2.1.6).
- Only observations with `QC=00000000` ("no quality control issues identified", SIS 4.2.1.2). The QC 1 rows are partial observations with odd durations.
- 413 points from 24 h before the onset to 72 h after, 481 s apart during the event and 961 s apart otherwise.

### Archive time stamps run early

In the archive's `START_OBS_UTC`, the E dose rate starts climbing at about 14:15Z on 10 September. The X8.2 flare peaked at 16:06Z (DONKI), so the particles would have arrived before the flare. That cannot happen, so the stamps are wrong for these sols. Three checks agree:

1. The onset rule below finds the onset at 14:58:56Z archive time, 291 min before Zeitlin's 19:50Z.
2. The PHA records pair SCLK 558306433 with 2017-253 04:24:11. With the MSL clock counting seconds from 2000-01-01T11:58:55.816 UTC, that SCLK is 09:06:09Z, 282 min later. This epoch is the standard NAIF convention, taken from memory and not confirmed in a document, so the check is a cross-check only.
3. With the curve shifted by 291 min, the peak plateau (04:00-14:00Z on 11 September) and the shock (about 05:00Z on 13 September) land where Zeitlin puts them.

The `START_OBS_MARS` field disagrees with both and jumps between observations, so it was not used.

The time axis therefore does not use archive UTC. `t_min = 0` is the start of the first of 4 consecutive clean observations whose E rate exceeds the 5-day pre-event mean (264.5 µGy/day) by 3 SD (6.1 µGy/day). That instant maps to the 19:50Z onset in `hazards.json`, so the flare peak sits at `t_min = -224`, the warning lead time `hazards.json` gives. The axis is tagged DERIVED. The dose rates are DATA.

### Checked against Zeitlin et al. 2018, as recorded in `hazards.json`

| | Published, B in water | Archive B | Published E | Archive E |
|---|---|---|---|---|
| 5 days before, µGy/day | 240 | 252.6 | 265 | 265.5 |
| Peak, µGy/day | 718 | 621.4 | 588 | 589.5 |
| 5 days after, µGy/day | 208 | 228.3 | not recorded | 233.2 |
| Event dose above background, µGy | 544 | 351 | 369 | 306 |

The E rates match within 1 %, which confirms the extraction and the onset alignment. The B rates do not match the published B "in water" values, and the ratio is not constant (0.95 before, 1.16 at peak), so a single silicon to water factor does not explain it. The paper converts B with a method the archive does not apply. The event dose integrals (trapezoid over the observation midpoints, onset to shock) are lower than the published ones for both detectors. The record has gaps (50.9 of 57.2 h covered), and the paper's baseline and integration method are not known. `rad.json` reports these numbers in `event.checks` and does not adjust anything.

Peak B in the archive is at `t_min = 782` (08:52Z on 11 September once aligned), inside the published plateau.

## Could not confirm

- The absorbing material of the archived B dose. The SIS gives only the unit.
- The unit of MEDA relative humidity. The SIS column has none.
- Whether MEDA wind direction is "from" or "to".
- The cause of the RAD time stamp offset. The PDS `DOCUMENT/TIMING_ERRORS.TXT` has no entry for 2017.
- Zeitlin et al. 2018 directly. The publisher blocks scripted fetches, so the published numbers come from `hazards.json`, where #18 checked them against the paper text.

## Follow-ups for other issues

- #25: decide whether the radiation event replays `dose_rate_b` (the detector `hazards.json` uses) or `dose_rate_e` (the one that matches the paper), and how far to compress the 57 h event. `radEventAt` returns the rate and the excess over the pre-event baseline, so the event can add the excess on top of the `values` background.
- #18 owners: `models.sep_2017_profile` in `hazards.json` is built from the paper's B in water. The archive B curve peaks at 621 µGy/day, not 718. See `event.checks` in `rad.json`.
- #59: `medaAt` takes LMST seconds since local midnight and loops the sol.
