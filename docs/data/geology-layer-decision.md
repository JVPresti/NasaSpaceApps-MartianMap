# Geology layer decision

Decision for issue #48 (plan item D6). Check done 2026-11-14.

**We drop the geology layer.** The only map that resolves the site, USGS SIM 3464 (Sun and Stack 2020), is registered to a semi-controlled CTX mosaic that the USGS readme itself says sits 100–200 m from the controlled surface-operations mosaic our terrain and orthoimage use. On a 1422 x 1500 m tile that is 7–13 % of the tile width, so the unit boundaries would visibly disagree with the terrain. The issue's own "done when" asks for boundaries that line up with visible terrain features; this dataset cannot meet it as published.

## The tile

From `blender/data/jezero_cheyava_meta.json` and `docs/marswalk-assets/README.md`:

- Centre 18.4975 N, 77.3053 E (Cheyava Falls, Perseverance waypoint sol 1210).
- 1422.5 m east-west by 1500 m north-south on the ground (the HiRISE tile in `public/marswalk/assets/terrain.json`).

## What the map says about the site

The publication has a free interactive map (data release DOI [10.5066/P9CZYIO7](https://doi.org/10.5066/P9CZYIO7)) backed by an ArcGIS feature service whose layer 8 is `GeoUnits_v1` (the polygon file of the 349 MB database). The full database therefore does not need to be downloaded to check the site: a spatial query against the service returns every unit that crosses the tile.

Query used (envelope in the service's projection, Mars Transverse Mercator, central meridian 77.5 E, Mars 2000 sphere):

```text
https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Jezero_FeatureServiceFromPro/FeatureServer/8/query
  ?where=1%3D1&geometryType=esriGeometryEnvelope
  &geometry={"xmin":-11660,"ymin":1095645,"xmax":-10235,"ymax":1097145}
  &spatialRel=esriSpatialRelIntersects&returnGeometry=true&outFields=OBJECTID,unit,name,symbol&f=json
```

Six mapped units cross the tile. I clipped each polygon to the tile and measured, on the local x-east / z-south metres of the game:

| Unit (symbol) | Tile share | Nearest mapped contact to Cheyava Falls |
| --- | ---: | ---: |
| Upper etched unit (Nue) | 42 % | 79 m |
| Smooth unit, undivided (su) | 16 % | 220 m |
| Eolian bedform unit (Aeb) | 16 % | 79 m |
| Crater rim unit (cr) | 14 % | 482 m |
| Jezero fan 2 unit (NHjf2) | 9 % | 209 m |
| Nili Planum 1 unit (Nnp1) | 4 % | 561 m |

So the site is not a boring single-unit patch: it sits on a cluster of contacts at the mouth of Neretva Vallis, where the fan meets the crater rim and the surrounding Nili Planum units. On paper that is a textbook geology walk; the registration is what kills it.

## Why it cannot line up

The SIM 3464 readme (`sim3464_readme.txt`, USGS Publications Warehouse):

> This map was created on a semi-controlled CTX mosaic prior to the release of the controlled CTX mosaic (https://doi.org/10.5066/P9GV1ND3) ... this map and included semi-controlled CTX mosaic, will have random offsets of about 100-200 meters from the surface operations CTX mosaic.

Our terrain and orthoimage come from the controlled mosaics (the HiRISE DTM and orthomosaic, `JEZ_hirise_soc_006`, and the CTX ring `JEZ_ctx_B_soc_008`). The nearest mapped contact passes 79 m from Cheyava Falls, and four of the six units change within 500 m of the origin: a 100–200 m displacement moves every one of those boundaries a visible distance across the orthoimage. The fan front would be drawn through the wrong part of Bright Angel, and the `cr` contact would no longer sit on the rim. Showing that would break the realism rule of plan section 4.1: the layer would state unit boundaries the ground visibly contradicts.

## What we keep

Nothing new. The science that this layer would teach is already taught where it matters, with Perseverance data instead of a regional map:

- The Bright Angel and Cheyava Falls stop cards (`public/data/stops.json`) describe the fan front, the Neretva Vallis channel and the outcrop in context, each with a Mastcam-Z image and a source.
- The sources screen and `docs/credits.md` credit the terrain products the layer would have sat on.

## What would change the decision

- A re-registered SIM 3464 contacts dataset aligned to the controlled CTX mosaic, or a manual co-registration pass against the HiRISE orthoimage. That is real mapping work, not a data conversion, and does not fit an "If time" task.
- The CRISM mineral map idea from `docs/data/thermal-view-decision.md` ("The better substitute") remains the better second science layer if the team wants one.

## Follow-ups

- Plan row D6 and the "Geologic map" row of plan section 5 are marked dropped with a link to this file.
- If the layer ever returns, it needs its own issue with the re-registration in scope.
