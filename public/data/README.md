# Data files

Small JSON files the app loads at run time. The app makes no live calls to NASA. Every number in these files says where it comes from.

| File | What it holds | Issue |
|---|---|---|
| `hazards.json` | Dust storm, radiation, suit, walking cost, speed and slope numbers, plus the walking O2 model and the September 2017 radiation event profile | #18 |
| `meda_sol.json`, `rad.json` | One MEDA sol and the RAD curve (planned) | #31 |
| `stops.json` | Science stop texts and images (planned) | #37 |

## Tags

Every value has one tag. The HUD shows it next to the number.

- `DATA`: measured by a mission or a lab study, or stated in a NASA specification or procedure. The provenance block names the document and the page.
- `DERIVED`: calculated by us from DATA values. `note` gives the calculation.
- `SIM`: our own assumption or a game choice. `note` says why and what it is based on.

Published observations are historical. Never label them as current conditions. RAD measured radiation in Gale crater, not in Jezero, and every RAD value says so in `site`.

## Value entry

`hazards.json` keeps its numbers in `values`, keyed by a dotted id such as `radiation.background.absorbed_dose_rate`.

```json
{
  "value": 0.210,
  "uncertainty": 0.040,
  "unit": "mGy/day",
  "tag": "DATA",
  "label": "RAD · Curiosity · Gale",
  "provenance": { "...": "see below" }
}
```

| Field | Required | Meaning |
|---|---|---|
| `value` | yes | A number, a string, an array (a range `[min, max]` or a table) or an object with named numbers |
| `unit` | yes | Unit of `value`. `null` only for a label value such as a suit name |
| `tag` | yes | `DATA`, `DERIVED` or `SIM` |
| `label` | yes | Short text for the HUD, for example `RAD · Curiosity · Gale` or `SIM` |
| `provenance` | yes | Where the value comes from, below |
| `uncertainty` | no | Plus or minus, in the same unit |
| `range` | no | `[min, max]` when the source gives a range and `value` is a chosen point in it |
| `value_si`, `unit_si` | no | The same value in SI units when the source uses another unit |

## Provenance block

Every data file in this folder uses the same block, one per value. A file that holds one dataset, such as a MEDA sol, carries one block at the top.

| Field | Meaning | Example |
|---|---|---|
| `mission` | Mission or program | `MSL`, `Mars 2020`, `Artemis` |
| `instrument` | Instrument or hardware | `RAD`, `MEDA RDS`, `xEMU PLSS` |
| `product_id` | PDS product or bundle, DONKI id, or NASA document number | `MSL-M-RAD-3-RDR-V1.0`, `EVA-EXP-0042 Rev B` |
| `site` | Where it was measured. Say so when it is not Jezero | `Gale crater, not Jezero` |
| `sol_or_date` | Sol, Ls or UTC date of the measurement or document | `sols 313-318, Ls 153-156 (MY 36), 5-11 January 2022` |
| `reference` | Citation: authors, year, title, journal or document | `Hassler et al. 2014, Science 343, 1244797` |
| `url` | Link to the reference. A DOI when there is one | `https://doi.org/10.1126/science.1244797` |
| `locator` | Page, table, figure or section, with a short quote | `p. 1244797-3, Table 1` |
| `data_url` | Link to the NASA or PDS archive that holds the measurement, when there is one | `https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/` |
| `license` | Terms of use | `NASA document, public domain` |
| `note` | How to use it, how it was derived, or why it is SIM | |

All eleven keys are always present. Use `null` when a field does not apply. `reference`, `license` and `note` are never `null`. `url` may be `null` only for `SIM` values.

NASA and PDS data are public with no restriction of use (NASA Science Mission Directorate policy SPD-41A). Numbers taken from journal papers are cited facts. The papers stay under their own copyright.

## Models

`hazards.json` also has a `models` section:

- `walking_metabolic`: the formula for metabolic power and O2 use from speed, gradient and mass at Mars gravity, with every constant tagged and every assumption listed, plus worked checks (1 km flat, 1 km up a 20 deg slope). For #19 and #41.
- `sep_2017_profile`: dose rate keypoints of the September 2017 solar particle event measured by RAD, in hours after the flare peak. For #25.
