# Thermal view decision

Decision for issue #49 (plan item D7). Research done 2026-11-14.

**We drop the thermal view.** No thermal product resolves the scene. The best one, THEMIS at 100 m per pixel, puts 15 x 15 pixels on the whole 1.42 x 1.50 km tile, so a walker stays inside one pixel for about 100 m. A mineral view from CRISM is the better substitute if the team wants a second science layer. It stays a P2 item (section 5 of the plan, "Chemical and spectral" row) and is not part of this decision.

Two thermal facts are still worth showing as numbers, not as a map. The section "What we keep" at the end lists them.

## The tile

From `blender/data/jezero_cheyava_meta.json` and `docs/marswalk-assets/README.md`:

- Centre 18.4975 N, 77.3053 E (Cheyava Falls, Perseverance waypoint sol 1210).
- 1422.5 m east-west by 1500 m north-south on the ground.
- Projection of the source DTM: equirectangular, lat_ts = 0, Mars sphere R = 3396190 m. At 18.5 N one map metre east-west is 0.948 m on the ground, so the tile is 1500 x 1500 map metres.

All pixel counts below come from that 1500 x 1500 m window. For the two Zenodo files I opened the GeoTIFFs and cut the window myself. For the THEMIS mosaics I read the pixel size and extent from the USGS STAC record.

## Thermal datasets checked

| Dataset | Pixel size | Pixels on the tile | Covers the tile | Values |
|---|---|---|---|---|
| THEMIS daytime IR, USGS controlled mosaic, quad MC-13 Syrtis Major | 100 m | 15 x 15 = 225 | Yes | 8-bit, qualitative (relative brightness) |
| THEMIS nighttime IR, same quad | 100 m | 15 x 15 = 225 | Yes | 8-bit, qualitative |
| THEMIS-derived thermal inertia of Jezero crater (Edwards and Buz, NAU, 2021) | 100 m | 15 x 15 = 225 | Yes, all 225 pixels valid | 32-bit, J m-2 K-1 s-1/2 |
| MEDA TIRS ground temperature, Perseverance | One point | One reading per second at the rover | Sol 1187: the rover was 5 to 12 m from the scene origin | Kelvin |

### THEMIS daytime and nighttime IR

- USGS Astrogeology releases controlled THEMIS IR mosaics at 100 m per pixel between 65 S and 65 N. The quad that holds Jezero is MC-13 Syrtis Major, 45 E to 90 E, 0 to 30 N.
- Daytime: <https://astrogeo-ard.s3.us-west-2.amazonaws.com/mars/mo/themis/controlled_mosaics/mc13_syrtis_major_dir/mc13_syrtis_major_dir.tif>
- Nighttime: <https://astrogeo-ard.s3.us-west-2.amazonaws.com/mars/mo/themis/controlled_mosaics/mc13_syrtis_major_nir/mc13_syrtis_major_nir.tif>
- Description: <https://stac.astrogeology.usgs.gov/docs/data/mars/themis_controlled_mosaics/>. STAC collection `mo_themis_controlled_mosaics`, items `mc13_syrtis_major_dir` and `mc13_syrtis_major_nir`, gsd 100 m.
- USGS calls these 8-bit products qualitative: seams are blended and the pixel values are not temperatures. Quantitative work needs the individual 32-bit images, which USGS has not released yet.

### THEMIS thermal inertia of Jezero

- Edwards, C. S. and Buz, J. (2021), "THEMIS-derived Thermal Inertia of Jezero Crater, Mars", Zenodo, CC BY 4.0. DOI [10.5281/zenodo.4931348](https://doi.org/10.5281/zenodo.4931348). File `Jezero_Thermal_Inertia_v1.tiff`, 1.7 MB.
- The GeoTIFF is 890 x 890 pixels at 100 m, equirectangular, 77.00 E to 78.50 E and 17.75 N to 19.25 N. It covers the tile completely.
- Over the tile: 225 pixels, thermal inertia from 178 to 396, mean 281 J m-2 K-1 s-1/2. The values do change across the tile, but only in 15 steps each way.

### MEDA ground temperature

- MEDA's thermal infrared sensor (TIRS) has a downward-looking channel that measures the brightness temperature of a patch of ground beside the rover. The calibrated product has a `GROUND_TEMP` column with an uncertainty and a flag for whether the footprint was in shadow.
- Sol 1187 is the sol the app already replays for weather (see `docs/data/meda-rad-notes.md`). Its file: <https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_1140_1259/sol_1187/WE__1187___________CAL_TIRS________________P02.CSV> (68,707 rows). Bundle DOI [10.17189/1522849](https://doi.org/10.17189/1522849).
- On sol 1187 the ground went from 185.1 K (about -88 C) at 06:35 LMST to 263.3 K (about -10 C) at 13:24 LMST.
- This is one point per moment along the traverse. It cannot colour a map.

## Why 15 pixels is not a view

The terrain the player walks on comes from a 1 m DTM and a 25 cm orthomosaic. A thermal overlay at 100 m would draw 225 flat squares, each about 95 x 100 m, over ground that has 1500 x 1500 elevation samples. Smoothing the squares would hide that and invent detail that is not in the data, which breaks the realism rule in section 4.1 of the plan. The day and night IR mosaics add a second problem: their pixel values are relative brightness, so the view could not even label a temperature.

The plan's recommendation, "drop it, 100 m pixels are too coarse", holds. I found no thermal product finer than 100 m over Jezero.

## The better substitute: a CRISM mineral layer

CRISM on Mars Reconnaissance Orbiter is an imaging spectrometer. Its targeted modes record about 18 m per pixel (FRT, full resolution) or 36 m per pixel (HRL and HRS, half resolution). Source: [CRISM workshop background slides, ESA](https://sci.esa.int/documents/33745/35957/1567258230790-6-CRISM_Workshop_090322_Background_SLM.pdf). Raw and calibrated scenes are in the PDS through the Orbital Data Explorer, <https://ode.rsl.wustl.edu/mars/>.

The ready-made product is a published Jezero mineral map:

- Parente, M., Saranathan, A. M., Itoh, Y., Tarnas, J. D., Seelos, F. P. and Mustard, J. F. (2021), "Map of the dominant mineralogy over and around the Mars2020 landing ellipse with correspondent spectral signatures", Zenodo, CC BY 4.0. DOI [10.5281/zenodo.5575824](https://doi.org/10.5281/zenodo.5575824).
- Built from four CRISM scenes: HRL000040FF, FRT000047A3, FRT00005C5E and FRS00031442.
- File `jezeroFinal.tif`, 614 x 751 pixels at 36 m, equirectangular on the same Mars sphere, 77.27 E to 77.64 E and 18.28 N to 18.74 N. It covers the tile.
- Over the tile: about 42 x 42 pixels, 2.8 times finer than THEMIS in each direction. 951 of the 1806 pixels in the window hold an exact class colour from the key. Matching the rest to the nearest key colour gives 42 % unclassified, 25 % Mg-carbonate, 15 % olivine plus smectite, 6 % olivine, 5 % Fe/Mg-smectite and 3 % kaolinite.
- The key in `Jezero_readme.pdf` has 10 classes, each in a high-confidence and a medium-confidence colour. The authors call the mineral names preliminary.

36 m is still coarse next to a 1 m terrain. It works better than thermal for two reasons. Each pixel carries a named mineral class (carbonate, olivine, clays) instead of a relative brightness, so the legend can say what the colour means.

### What a mineral layer would take

My estimate is size S to M, about a day. It needs its own issue.

1. Crop `jezeroFinal.tif` to the tile window, 43 x 42 pixels, with a short script next to the other data scripts. Both grids are equirectangular with lat_ts = 0, so this is a crop and a scale, not a reprojection.
2. Snap each pixel to the nearest key colour. The mosaic was resampled, so about half the pixels sit between key colours. Store a class index per pixel in a PNG of a few kilobytes.
3. Add the PNG to `public/` with a provenance block (mission MRO, instrument CRISM, the four scene IDs, the DOI, CC BY 4.0, tag "derived").
4. Add `uLayer` 5 to `TERRAIN_FRAG` in `src/engine/shaders.js`. Sample with nearest filtering so the 36 m squares stay visible and honest, and add a legend with the class names.
5. Label the layer "CRISM mineral classes, 36 m, preliminary names" and credit the authors in the credits list.

## What we keep

- A thermal inertia number for the science card or the data panel: "THEMIS thermal inertia here: 178 to 396, mean 281 J m-2 K-1 s-1/2 (100 m pixels, Edwards and Buz 2021)."
- A ground temperature line in the environment strip, from the sol 1187 MEDA file above, next to the air temperature the app already shows. This is a point measurement at the rover and should say so.

Neither needs a new view. Each is a separate small issue if the team wants it.

## Follow-ups outside this repo

- The Figma file has a thermal view frame. The designer needs to remove it.
- Issue #50 lists "a thermal view only if #49 keeps it". It does not, so #50 drops that line.
